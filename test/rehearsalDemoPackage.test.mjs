import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRehearsalDemoPackage } from '../tools/build-rehearsal-demo.mjs';
import { importPortableShow } from '../src/core/showArchive.mjs';

test('Spanish rehearsal ZIP is portable, contains 3 real WAVs and three distinct voice feet', async () => {
  const { archive, project } = await buildRehearsalDemoPackage();
  const imported = await importPortableShow(archive);
  assert.equal(project.cues.length, 3);
  assert.equal(imported.project.scriptText.split(/\r?\n/).filter(Boolean).length, 18);
  assert.equal(imported.project.cues.length, 3);
  assert.equal(imported.audioFiles.length, 3);
  assert.deepEqual(imported.project.cues.map(cue => cue.sourceLineIds[0]), ['L4','L10','L15']);
  assert.equal(new Set(imported.project.cues.map(cue => cue.trigger)).size, 3);
  assert.deepEqual(imported.project.cues.map(cue => cue.trigger), [
    'Antes de empezar, escucha cómo respira el teatro.',
    'Presta atención: ahora suena una sola campanada.',
    'Entonces deja que esta historia se abra por última vez.',
  ]);
  for (const file of imported.audioFiles) {
    assert.equal(new TextDecoder().decode(file.bytes.subarray(0, 4)), 'RIFF');
    assert.ok(file.bytes.byteLength > 44);
  }
  assert.ok(imported.project.proposals.every(proposal => proposal.source === 'MANUAL_MOCK'));
});
