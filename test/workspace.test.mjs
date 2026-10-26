import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewShow, replaceShowScript, addAudioReference, addMockProposal, decideProposal, nextAvailableId } from '../src/core/workspace.mjs';
import { serializeShowProject, deserializeShowProject } from '../src/core/projectPersistence.mjs';

function prepared() {
  let show = createNewShow({ id: 'show-demo', name: 'Ensayo', scriptText: 'ANA: hola\n(MÚSICA)' });
  show = addAudioReference(show, 'intro.wav');
  show = addMockProposal(show, { lineId: 'L2', assetId: show.assets[0].id, label: 'Entrada musical' });
  return show;
}

test('creates clean project without cues or assets', () => {
  const show = createNewShow();
  assert.equal(show.schemaVersion, 1);
  assert.deepEqual(show.proposals, []);
  assert.deepEqual(show.cues, []);
});

test('replaces script without damaging asset references', () => {
  let show = addAudioReference(createNewShow(), 'intro.wav');
  show = replaceShowScript(show, 'ANA: hola');
  assert.equal(show.scriptText, 'ANA: hola');
  assert.equal(show.assets.length, 1);
});

test('prevents silently replacing a script with existing proposals', () => {
  assert.throws(() => replaceShowScript(prepared(), 'NEW'), /Cannot replace script/);
});

test('rejects an unknown source line or audio ID', () => {
  const base = addAudioReference(createNewShow({ scriptText: 'Hola' }), 'intro.wav');
  assert.throws(() => addMockProposal(base, { lineId: 'L2', assetId: 'asset-1', label: 'Error' }));
  assert.throws(() => addMockProposal(base, { lineId: 'L1', assetId: 'missing', label: 'Error' }));
});

test('explicit approval creates draft cue and retains source references', () => {
  const start = prepared();
  const result = decideProposal(start, start.proposals[0].id, 'APPROVE');
  assert.equal(start.proposals[0].status, 'PENDING');
  assert.equal(result.proposals[0].status, 'APPROVED');
  assert.equal(result.cues[0].status, 'DRAFT');
  assert.deepEqual(result.cues[0].sourceLineIds, ['L2']);
  assert.equal(result.cues[0].actions[0].assetId, 'asset-1');
});

test('rejection creates no cue', () => {
  const start = prepared();
  const result = decideProposal(start, start.proposals[0].id, 'REJECT');
  assert.equal(result.proposals[0].status, 'REJECTED');
  assert.deepEqual(result.cues, []);
});

test('repeated review and invalid decisions do not change state', () => {
  const start = prepared();
  assert.throws(() => decideProposal(start, start.proposals[0].id, 'EXECUTE'));
  const approved = decideProposal(start, start.proposals[0].id, 'APPROVE');
  assert.throws(() => decideProposal(approved, approved.proposals[0].id, 'APPROVE'), /already reviewed/);
});

test('approval pipeline roundtrips through strict project codec', () => {
  const start = prepared();
  const result = decideProposal(start, start.proposals[0].id, 'APPROVE');
  assert.deepEqual(deserializeShowProject(serializeShowProject(result)), result);
});

test('identifiers are unique even after importing projects with gaps', () => {
  assert.equal(nextAvailableId('asset', ['asset-1', 'asset-3']), 'asset-2');
  const a = addAudioReference(addAudioReference(createNewShow(), 'A'), 'B');
  assert.deepEqual(a.assets.map(x => x.id), ['asset-1', 'asset-2']);
});

test('refuses invalid identifiers and unknown proposals', () => {
  assert.throws(() => nextAvailableId('../bad', []));
  assert.throws(() => decideProposal(prepared(), 'unknown', 'APPROVE'));
});
