import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewShow, replaceShowScript, addAudioReference, addMockProposal, decideProposal, decideProposalBatch, nextAvailableId, updateCueAutomation } from '../src/core/workspace.mjs';
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

test('batch proposal review applies one explicit decision to exactly the selected pending items', () => {
  let start = prepared();
  start = addMockProposal(start, {
    lineId: 'L1', assetId: start.assets[0].id, label: 'Escena de apertura',
  });
  const result = decideProposalBatch(start, ['proposal-2'], 'APPROVE');
  assert.deepEqual(start.proposals.map(proposal => proposal.status), ['PENDING', 'PENDING']);
  assert.deepEqual(result.proposals.map(proposal => proposal.status), ['PENDING', 'APPROVED']);
  assert.deepEqual(result.cues.map(cue => cue.sourceLineIds), [['L1']]);
});

test('batch proposal review is atomic when an ID is stale, repeated, or invalid', () => {
  const start = prepared();
  assert.throws(() => decideProposalBatch(start, ['proposal-1', 'missing'], 'APPROVE'),
    /still be pending/);
  assert.throws(() => decideProposalBatch(start, ['proposal-1', 'proposal-1'], 'APPROVE'),
    /unique proposal IDs/);
  assert.throws(() => decideProposalBatch(start, ['proposal-1'], 'EXECUTE'),
    /Unsupported proposal decision/);
  assert.deepEqual(start.proposals.map(proposal => proposal.status), ['PENDING']);
  assert.deepEqual(start.cues, []);
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

test('operator can configure fades and loop without modifying approved AI proposal', () => {
  const initial = decideProposal(prepared(), 'proposal-1', 'APPROVE');
  const changed = updateCueAutomation(initial, 'cue-1', { fadeInMs: 1500, fadeOutMs: 2200, loop: true });
  assert.equal(changed.cues[0].automation.fadeInMs, 1500);
  assert.equal(changed.cues[0].automation.fadeOutMs, 2200);
  assert.equal(changed.cues[0].automation.loop, true);
  assert.deepEqual(changed.proposals, initial.proposals);
  assert.deepEqual(changed.cues[0].sourceLineIds, initial.cues[0].sourceLineIds);
  assert.equal(initial.cues[0].automation, undefined);
  assert.deepEqual(deserializeShowProject(serializeShowProject(changed)), changed);
});
test('editor rejects invalid automation and cannot silently alter unknown cues', () => {
  const initial = decideProposal(prepared(), 'proposal-1', 'APPROVE');
  assert.throws(() => updateCueAutomation(initial, 'missing', { loop: true }), /not editable/);
  assert.throws(() => updateCueAutomation(initial, 'cue-1', { volume: 2 }), /Unknown/);
  assert.throws(() => updateCueAutomation(initial, 'cue-1', { fadeInMs: -100 }));
  assert.throws(() => updateCueAutomation(initial, 'cue-1', { stopCueIds: ['cue-1'] }));
  assert.throws(() => updateCueAutomation(initial, 'cue-1', { mode: 'AUTO_FOLLOW' }), /Invalid show project/);
});
test('changing follow mode back to manual clears delayed auto follow', () => {
  let show = prepared();
  show = addMockProposal(show, { lineId: 'L1', assetId: 'asset-1', label: 'Segundo' });
  show = decideProposal(show, 'proposal-1', 'APPROVE');
  show = decideProposal(show, 'proposal-2', 'APPROVE');
  show = updateCueAutomation(show, 'cue-1', { mode: 'AUTO_CONTINUE', delayMs: 1000 });
  assert.equal(show.cues[0].automation.delayMs, 1000);
  show = updateCueAutomation(show, 'cue-1', { mode: 'MANUAL' });
  assert.equal(show.cues[0].automation.delayMs, 0);
});
