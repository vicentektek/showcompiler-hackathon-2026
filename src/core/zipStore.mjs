/**
 * Portable, dependency-free ZIP STORE codec.
 *
 * Deliberately supports only archives created by SHOWCOMPILER: no compression,
 * no data descriptors, no ZIP64, no arbitrary paths, no symlinks and no
 * extracted filesystem writes. All sizes and CRCs are checked before use.
 */
const MAX_ARCHIVE_BYTES = 64_000_000;
const MAX_ENTRY_BYTES = 20_000_000;
const MAX_ENTRIES = 102;
const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const ENTRY_NAME = /^(?:project\.json|manifest\.json|audio\/[A-Za-z0-9](?:[A-Za-z0-9._-]|%3A){0,237}\.(?:wav|mp3|ogg|m4a|aac|flac))$/;
const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

function fail(message) { throw new TypeError('Invalid SHOWCOMPILER ZIP: ' + message); }
function put16(data, position, value) { new DataView(data.buffer, data.byteOffset).setUint16(position, value, true); }
function put32(data, position, value) { new DataView(data.buffer, data.byteOffset).setUint32(position, value >>> 0, true); }
function view(data) { return new DataView(data.buffer, data.byteOffset, data.byteLength); }

export function crc32(data) {
  if (!(data instanceof Uint8Array)) throw new TypeError('Expected Uint8Array');
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function writeZipStore(entries) {
  if (!Array.isArray(entries) || entries.length < 2 || entries.length > MAX_ENTRIES) fail('invalid entry count');
  const names = new Set();
  const prepared = [];
  let size = 22;
  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string' || !ENTRY_NAME.test(entry.name) ||
        names.has(entry.name) || !(entry.bytes instanceof Uint8Array) ||
        entry.bytes.byteLength > MAX_ENTRY_BYTES) fail('invalid, oversized or duplicate entry');
    names.add(entry.name);
    const name = encoder.encode(entry.name);
    const file = entry.bytes;
    size += 30 + name.byteLength + file.byteLength + 46 + name.byteLength;
    if (size > MAX_ARCHIVE_BYTES) fail('archive too large');
    prepared.push({ name, file, checksum: crc32(file) });
  }
  if (!names.has('project.json') || !names.has('manifest.json')) fail('missing project or manifest');
  const bytes = new Uint8Array(size);
  let cursor = 0;
  const records = [];
  for (const item of prepared) {
    const start = cursor;
    put32(bytes, cursor, SIG_LOCAL);
    put16(bytes, cursor + 4, 20);  // ZIP version 2.0, needed to extract.
    put16(bytes, cursor + 6, 0x0800); // Unicode UTF-8 names; no data descriptor.
    put16(bytes, cursor + 8, 0); // STORE, uncompressed.
    put32(bytes, cursor + 14, item.checksum);
    put32(bytes, cursor + 18, item.file.byteLength);
    put32(bytes, cursor + 22, item.file.byteLength);
    put16(bytes, cursor + 26, item.name.byteLength);
    put16(bytes, cursor + 28, 0);
    cursor += 30;
    bytes.set(item.name, cursor); cursor += item.name.byteLength;
    bytes.set(item.file, cursor); cursor += item.file.byteLength;
    records.push({ ...item, offset: start });
  }
  const centralStart = cursor;
  for (const item of records) {
    put32(bytes, cursor, SIG_CENTRAL);
    put16(bytes, cursor + 4, 20);
    put16(bytes, cursor + 6, 20);
    put16(bytes, cursor + 8, 0x0800);
    put16(bytes, cursor + 10, 0);
    put32(bytes, cursor + 16, item.checksum);
    put32(bytes, cursor + 20, item.file.byteLength);
    put32(bytes, cursor + 24, item.file.byteLength);
    put16(bytes, cursor + 28, item.name.byteLength);
    put16(bytes, cursor + 30, 0);
    put16(bytes, cursor + 32, 0);
    put16(bytes, cursor + 34, 0);
    put16(bytes, cursor + 36, 0);
    put32(bytes, cursor + 38, 0);
    put32(bytes, cursor + 42, item.offset);
    cursor += 46;
    bytes.set(item.name, cursor); cursor += item.name.byteLength;
  }
  const centralSize = cursor - centralStart;
  put32(bytes, cursor, SIG_END);
  put16(bytes, cursor + 8, records.length);
  put16(bytes, cursor + 10, records.length);
  put32(bytes, cursor + 12, centralSize);
  put32(bytes, cursor + 16, centralStart);
  if (cursor + 22 !== bytes.length) throw new Error('Internal ZIP size mismatch');
  return bytes;
}

export function readZipStore(input) {
  if (!(input instanceof Uint8Array) || input.byteLength < 22 ||
      input.byteLength > MAX_ARCHIVE_BYTES) fail('invalid archive size');
  const data = view(input);
  const end = input.byteLength - 22;
  if (data.getUint32(end, true) !== SIG_END ||
      data.getUint16(end + 4, true) !== 0 ||
      data.getUint16(end + 6, true) !== 0 ||
      data.getUint16(end + 20, true) !== 0) fail('invalid ZIP end record');
  const count = data.getUint16(end + 10, true);
  if (count < 2 || count > MAX_ENTRIES || count !== data.getUint16(end + 8, true)) fail('invalid entry count');
  const centralSize = data.getUint32(end + 12, true);
  const centralOffset = data.getUint32(end + 16, true);
  if (centralOffset + centralSize !== end) fail('invalid ZIP directory placement');
  const files = new Map();
  let cursor = centralOffset;
  const spans = [];
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || data.getUint32(cursor, true) !== SIG_CENTRAL) fail('invalid central entry');
    const flags = data.getUint16(cursor + 8, true);
    const method = data.getUint16(cursor + 10, true);
    const crc = data.getUint32(cursor + 16, true);
    const compressed = data.getUint32(cursor + 20, true);
    const original = data.getUint32(cursor + 24, true);
    const n = data.getUint16(cursor + 28, true);
    const extra = data.getUint16(cursor + 30, true);
    const comment = data.getUint16(cursor + 32, true);
    const local = data.getUint32(cursor + 42, true);
    if (flags !== 0x0800 || method !== 0 || extra !== 0 || comment !== 0 ||
        compressed !== original || original > MAX_ENTRY_BYTES ||
        cursor + 46 + n > end || n === 0) fail('unsupported ZIP entry');
    let name;
    try { name = decoder.decode(input.subarray(cursor + 46, cursor + 46 + n)); }
    catch { fail('invalid UTF-8 entry name'); }
    if (!ENTRY_NAME.test(name) || files.has(name)) fail('unsafe or duplicate file name');
    cursor += 46 + n;
    if (local + 30 > centralOffset || data.getUint32(local, true) !== SIG_LOCAL ||
        data.getUint16(local + 6, true) !== flags ||
        data.getUint16(local + 8, true) !== method ||
        data.getUint32(local + 14, true) !== crc ||
        data.getUint32(local + 18, true) !== compressed ||
        data.getUint32(local + 22, true) !== original ||
        data.getUint16(local + 28, true) !== 0 ||
        data.getUint16(local + 26, true) !== n) fail('mismatched local ZIP header');
    const dataOffset = local + 30 + n;
    const dataEnd = dataOffset + original;
    if (dataEnd > centralOffset) fail('entry exceeds ZIP data section');
    if (decoder.decode(input.subarray(local + 30, dataOffset)) !== name) fail('local name mismatch');
    const value = input.slice(dataOffset, dataEnd);
    if (crc32(value) !== crc) fail('ZIP CRC mismatch');
    files.set(name, value);
    spans.push([local, dataEnd]);
  }
  if (cursor !== end || !files.has('project.json') || !files.has('manifest.json')) fail('incomplete ZIP directory');
  spans.sort((a, b) => a[0] - b[0]);
  let next = 0;
  for (const [start, finish] of spans) {
    if (start !== next) fail('overlapping or hidden ZIP local data');
    next = finish;
  }
  if (next !== centralOffset) fail('unreferenced ZIP data');
  return files;
}
