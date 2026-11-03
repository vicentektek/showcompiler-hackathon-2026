import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoPackage, DEMO_SCRIPT } from '../tools/build-demo-package.mjs';
import { importPortableShow } from '../src/core/showArchive.mjs';
import { readZipStore } from '../src/core/zipStore.mjs';

test('judge demo is a complete playable-file ZIP with 3 approved manual cues', async () => {
  const { archive, project } = await buildDemoPackage();
  assert.ok(archive.length > 300_000);
  assert.ok(archive.length < 5_000_000);
  assert.equal(project.cues.length, 3);
  assert.equal(project.assets.length, 3);
  assert.ok(project.proposals.every(p => p.status === 'APPROVED' && p.source === 'MANUAL_MOCK'));
  assert.deepEqual(project.cues.map(c => c.sourceLineIds[0]), ['L2', 'L5', 'L8']);
  const imported = await importPortableShow(archive);
  assert.deepEqual(imported.project, project);
  assert.equal(imported.audioFiles.length, 3);
  assert.equal(project.scriptText, DEMO_SCRIPT);
  assert.equal(project.cues.every(c => c.status === 'DRAFT'), true);
  const paths = [...readZipStore(archive).keys()];
  assert.deepEqual(paths, ['project.json', 'manifest.json', 'audio/asset-1.wav', 'audio/asset-2.wav', 'audio/asset-3.wav']);
});

test('synthetic WAV files are valid PCM with nonzero samples and conservative peak', async () => {
  const { archive } = await buildDemoPackage();
  const parsed = await importPortableShow(archive);
  for (const sound of parsed.audioFiles) {
    const array = sound.bytes;
    const view = new DataView(array.buffer, array.byteOffset, array.byteLength);
    const text = new TextDecoder('ascii');
    assert.equal(text.decode(array.subarray(0, 4)), 'RIFF');
    assert.equal(text.decode(array.subarray(8, 12)), 'WAVE');
    assert.equal(text.decode(array.subarray(12, 16)), 'fmt ');
    assert.equal(view.getUint16(20, true), 1);
    assert.equal(view.getUint16(22, true), 1);
    assert.equal(view.getUint32(24, true), 44100);
    assert.equal(view.getUint16(34, true), 16);
    assert.equal(view.getUint32(40, true), array.length - 44);
    let nonzero = 0;
    let peak = 0;
    for (let i = 44; i < array.length; i += 2) {
      const value = Math.abs(view.getInt16(i, true));
      if (value > 0) nonzero++;
      peak = Math.max(peak, value);
    }
    assert.ok(nonzero > 5000, sound.name);
    assert.ok(peak < 31000, sound.name);
  }
});
