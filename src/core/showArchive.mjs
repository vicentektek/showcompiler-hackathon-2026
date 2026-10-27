/**
 * Complete, self-contained SHOWCOMPILER show archive, including original audio.
 * ZIP STORE v1; no external network, no extraction to disk, no AI credentials.
 */
import { serializeShowProject, deserializeShowProject } from './projectPersistence.mjs';
import { writeZipStore, readZipStore } from './zipStore.mjs';

export const MAX_PORTABLE_ZIP_BYTES = 64_000_000;
export const MAX_AUDIO_BYTES = 20_000_000;
const MAX_AUDIO_COUNT = 100;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const SUPPORTED_EXT = /\.(wav|mp3|ogg|m4a|aac|flac)$/i;
const ASSET_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const HEX256 = /^[0-9a-f]{64}$/;
const FORMAT = 'showcompiler-portable';
const VERSION = 1;

function reject(message) { throw new TypeError('SHOWCOMPILER package: ' + message); }
function strictFields(record, names, context) {
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      Object.keys(record).some(key => !names.includes(key)) ||
      names.some(key => !Object.hasOwn(record, key))) reject('invalid ' + context + ' fields');
}
async function digest(bytes) {
  if (!globalThis.crypto?.subtle) reject('secure SHA-256 digest unavailable');
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}
function audioPath(assetId, originalName) {
  if (!ASSET_ID.test(assetId) || typeof originalName !== 'string' ||
      originalName.length > 200 || /[\\/\\\\\x00-\x1f]/.test(originalName) ||
      !SUPPORTED_EXT.test(originalName)) reject('invalid sound asset');
  const ext = originalName.match(SUPPORTED_EXT)[1].toLowerCase();
  // ':' is accepted in historical schema IDs but invalid in Windows filenames.
  // Percent-encode it in the archive path; '%' itself is forbidden in an ID.
  return 'audio/' + assetId.replaceAll(':', '%3A') + '.' + ext;
}
function readJson(bytes) {
  try { return JSON.parse(decoder.decode(bytes)); }
  catch { reject('invalid UTF-8 JSON inside ZIP'); }
}

/**
 * @param {object} project - Strict project schema v1.
 * @param {Map<string, File|Blob>} fileMap - Original local audio files,
 *   keyed by asset ID. Requires all registered assets, including unused ones.
 */
export async function exportPortableShow(project, fileMap) {
  const serialized = serializeShowProject(project);
  const normalized = deserializeShowProject(serialized);
  if (!(fileMap instanceof Map) || normalized.assets.length > MAX_AUDIO_COUNT) {
    reject('invalid or excessive asset inventory');
  }
  if (fileMap.size !== normalized.assets.length) reject('some audio files are not loaded');
  const entries = [{ name: 'project.json', bytes: encoder.encode(serialized) }];
  const audio = [];
  let size = entries[0].bytes.byteLength;
  for (const asset of normalized.assets) {
    const file = fileMap.get(asset.id);
    if (!file || file.name !== asset.name || typeof file.arrayBuffer !== 'function' ||
        !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_AUDIO_BYTES) {
      reject('missing or invalid audio ' + asset.id + ' (' + asset.name + ')');
    }
    const path = audioPath(asset.id, asset.name);
    const raw = await file.arrayBuffer();
    if (!(raw instanceof ArrayBuffer) || raw.byteLength !== file.size) reject('audio data unavailable');
    const bytes = new Uint8Array(raw);
    size += bytes.byteLength;
    if (size > MAX_PORTABLE_ZIP_BYTES - 20_000) reject('archive exceeds 64 MB');
    audio.push({ assetId: asset.id, name: asset.name, path, bytes: bytes.byteLength, sha256: await digest(bytes) });
    entries.push({ name: path, bytes });
  }
  const manifest = { format: FORMAT, version: VERSION, audio };
  entries.splice(1, 0, { name: 'manifest.json', bytes: encoder.encode(JSON.stringify(manifest)) });
  return writeZipStore(entries);
}

/**
 * Verify the entire ZIP *before* exposing a project. Never creates a disk path.
 * @returns {Promise<{project: object, audioFiles: Array<{assetId:string,name:string,bytes:Uint8Array}>}>}
 */
export async function importPortableShow(input) {
  if (!(input instanceof Uint8Array) || input.byteLength > MAX_PORTABLE_ZIP_BYTES) {
    reject('invalid archive input');
  }
  const files = readZipStore(input);
  const project = deserializeShowProject(decoder.decode(files.get('project.json')));
  const manifest = readJson(files.get('manifest.json'));
  strictFields(manifest, ['format', 'version', 'audio'], 'manifest');
  if (manifest.format !== FORMAT || manifest.version !== VERSION ||
      !Array.isArray(manifest.audio) || manifest.audio.length !== project.assets.length ||
      manifest.audio.length > MAX_AUDIO_COUNT || files.size !== manifest.audio.length + 2) {
    reject('manifest or project assets mismatch');
  }
  const names = new Set();
  const audioFiles = [];
  for (let i = 0; i < project.assets.length; i++) {
    const item = manifest.audio[i];
    const asset = project.assets[i];
    strictFields(item, ['assetId', 'name', 'path', 'bytes', 'sha256'], 'audio manifest item');
    if (item.assetId !== asset.id || item.name !== asset.name ||
        item.path !== audioPath(asset.id, asset.name) ||
        names.has(item.path) || !Number.isSafeInteger(item.bytes) ||
        item.bytes < 1 || item.bytes > MAX_AUDIO_BYTES || !HEX256.test(item.sha256)) {
      reject('audio inventory does not match project');
    }
    names.add(item.path);
    const bytes = files.get(item.path);
    if (!bytes || bytes.byteLength !== item.bytes || await digest(bytes) !== item.sha256) {
      reject('missing or tampered audio: ' + asset.id);
    }
    audioFiles.push({ assetId: asset.id, name: asset.name, bytes });
  }
  return { project, audioFiles };
}
