import test from 'node:test';
import assert from 'node:assert/strict';
import { readZipStore, writeZipStore, crc32 } from '../src/core/zipStore.mjs';
import { exportPortableShow, importPortableShow, MAX_PORTABLE_ZIP_BYTES } from '../src/core/showArchive.mjs';
import { createNewShow, addAudioReference, addMockProposal, decideProposal } from '../src/core/workspace.mjs';

const bytes = value => new TextEncoder().encode(value);
function soundFile(name, content = 'RIFF...WAVE  SAMPLE') {
  const buffer = bytes(content);
  return {
    name, size: buffer.byteLength,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
}
function aShow() {
  let show = createNewShow({ id: 'show-zip', name: 'Ensayo', scriptText: 'ESCENA UNO\r\n(Campana)\r\nANA: ¡Vamos!' });
  show = addAudioReference(show, 'campana.wav');
  show = addMockProposal(show, { lineId: 'L2', assetId: 'asset-1', label: 'Campana de sala' });
  return decideProposal(show, show.proposals[0].id, 'APPROVE');
}

test('ZIP STORE roundtrip uses valid PK signatures and preserves arbitrary bytes', () => {
  const sample = new Uint8Array([0, 1, 2, 3, 254, 255]);
  const zip = writeZipStore([
    { name: 'project.json', bytes: bytes('{}') },
    { name: 'manifest.json', bytes: bytes('{}') },
    { name: 'audio/asset-1.wav', bytes: sample },
  ]);
  assert.equal(new DataView(zip.buffer).getUint32(0,true), 0x04034b50);
  const extracted = readZipStore(zip);
  assert.deepEqual(extracted.get('audio/asset-1.wav'), sample);
  assert.equal(new DataView(zip.buffer).getUint32(zip.byteLength-22,true), 0x06054b50);
});

test('CRC32 matches the standard ZIP test vector', () => {
  assert.equal(crc32(bytes('123456789')), 0xcbf43926);
});

test('complete original show and sound roundtrip, with stable cue line references', async () => {
  const show = aShow();
  const fileMap = new Map([['asset-1', soundFile('campana.wav', 'RIFF source audio bytes here')]]);
  const output = await exportPortableShow(show, fileMap);
  const restored = await importPortableShow(output);
  assert.deepEqual(restored.project, show);
  assert.equal(restored.project.cues[0].sourceLineIds[0], 'L2');
  assert.equal(restored.audioFiles.length, 1);
  assert.deepEqual(restored.audioFiles[0].bytes, bytes('RIFF source audio bytes here'));
  assert.equal(restored.audioFiles[0].name, 'campana.wav');
});

test('project without registered audio exports as a portable ZIP with just JSON + manifest', async () => {
  const show = createNewShow({ name: 'Guion sin audio', scriptText: 'HOLA' });
  const zip = await exportPortableShow(show, new Map());
  const contents = readZipStore(zip);
  assert.deepEqual([...contents.keys()], ['project.json', 'manifest.json']);
  const loaded = await importPortableShow(zip);
  assert.deepEqual(loaded.project, show);
  assert.deepEqual(loaded.audioFiles, []);
});

test('export is all-or-nothing with an unavailable, wrong name or oversized asset', async () => {
  const show = aShow();
  await assert.rejects(exportPortableShow(show, new Map()), /not loaded/);
  await assert.rejects(exportPortableShow(show, new Map([['asset-1', soundFile('other.wav')]])), /missing or invalid/);
  await assert.rejects(exportPortableShow(show, new Map([['asset-1', { ...soundFile('campana.wav'), size: 21_000_000 }]])), /missing or invalid/);
});

test('tampered audio rejected even if attacker recomputes standard ZIP CRC', async () => {
  const zip = await exportPortableShow(aShow(), new Map([['asset-1', soundFile('campana.wav')]]));
  const unpacked = readZipStore(zip);
  unpacked.set('audio/asset-1.wav', bytes('alteredbytes.....'));
  const changed = writeZipStore([...unpacked].map(([name, value]) => ({ name, bytes: value })));
  await assert.rejects(importPortableShow(changed), /tampered audio/);
});

test('ZIP corruption and truncated central directory are rejected', async () => {
  const zip = await exportPortableShow(aShow(), new Map([['asset-1', soundFile('campana.wav')]]));
  const changed = zip.slice();
  changed[44] ^= 0xff; // Corrupt project.json's first data byte (not a filename).
  assert.throws(() => readZipStore(changed), /CRC mismatch/);
  assert.throws(() => readZipStore(zip.subarray(0, zip.length - 6)), /invalid ZIP end record/);
});

test('unsafe archive entry names and duplicate paths are rejected', () => {
  const first = { name: 'project.json', bytes: bytes('{}') };
  const second = { name: 'manifest.json', bytes: bytes('{}') };
  assert.throws(() => writeZipStore([first, second, { name: '../evil.json', bytes: bytes('bad') }]), /invalid/);
  assert.throws(() => writeZipStore([first, second, first]), /duplicate/);
});

test('compressed, encrypted and data-descriptor ZIP entry flags are unsupported', () => {
  const zip = writeZipStore([{ name: 'project.json', bytes: bytes('{}') }, { name: 'manifest.json', bytes: bytes('{}') }]);
  const method = zip.slice();
  new DataView(method.buffer).setUint16(8, 8, true);
  assert.throws(() => readZipStore(method), /mismatched local ZIP header|unsupported ZIP entry/);
  const flags = zip.slice();
  new DataView(flags.buffer).setUint16(6, 0x0808, true);
  assert.throws(() => readZipStore(flags), /mismatched local ZIP header|unsupported ZIP entry/);
});

test('wrong schema and extra archive content are rejected', async () => {
  const zip = await exportPortableShow(aShow(), new Map([['asset-1', soundFile('campana.wav')]]));
  const unpacked = readZipStore(zip);
  const manifest = JSON.parse(new TextDecoder().decode(unpacked.get('manifest.json')));
  manifest.version = 99;
  unpacked.set('manifest.json', bytes(JSON.stringify(manifest)));
  const mutated = writeZipStore([...unpacked].map(([name, value]) => ({ name, bytes: value })));
  await assert.rejects(importPortableShow(mutated), /manifest or project assets mismatch/);
  assert.ok(MAX_PORTABLE_ZIP_BYTES <= 64_000_000);
});

test('ZIP reader does not trust central offsets, renamed local files or overlapped entries', () => {
  const z = writeZipStore([{name:'project.json',bytes:bytes('{}')},{name:'manifest.json',bytes:bytes('{}')}]);
  const changed = z.slice();
  const end = changed.length-22;
  const central = new DataView(changed.buffer).getUint32(end+16,true);
  // The second central entry must not reuse the first local-header offset.
  const second = central + 46 + 'project.json'.length;
  new DataView(changed.buffer).setUint32(second+42,0,true);
  assert.throws(() => readZipStore(changed), /mismatched|overlapping|hidden/);
});

test('colon-bearing historical asset IDs use Windows-safe ZIP entry filenames', async () => {
  const project = addAudioReference(createNewShow({ id: 'show:legacy' }), 'bell.wav');
  project.assets[0].id = 'asset:legacy';
  const archive = await exportPortableShow(project, new Map([['asset:legacy', soundFile('bell.wav')]]));
  assert.ok(readZipStore(archive).has('audio/asset%3Alegacy.wav'));
  const restored = await importPortableShow(archive);
  assert.equal(restored.project.assets[0].id, 'asset:legacy');
});

test('folder-like source asset names cannot escape the archive audio directory', async () => {
  const project = addAudioReference(createNewShow(), '../escape.wav');
  await assert.rejects(
    exportPortableShow(project, new Map([['asset-1', soundFile('../escape.wav')]])),
    /invalid sound asset/,
  );
});
