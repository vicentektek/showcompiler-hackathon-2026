import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectShowReadiness } from '../src/core/showPreflight.mjs';
import { createNewShow, addAudioReference, addMockProposal, decideProposal, assignAudioToCue } from '../src/core/workspace.mjs';

const base = () => createNewShow({ name: 'Readiness test', scriptText: 'SCENE 1\n(A door closes.)\nALEX: Wait.' });
function approved() {
  let show = addMockProposal(base(), { lineId: 'L2', label: 'Door slam' });
  return decideProposal(show, show.proposals[0].id, 'APPROVE');
}
test('an empty show is not ready and the report never mutates the project', () => {
  const before = base();
  const report = inspectShowReadiness(before, () => false);
  assert.equal(report.ready, false);
  assert.equal(report.blockerCount, 1);
  assert.equal(report.issues[0].code, 'EMPTY_SHOW');
  assert.equal(before.cues.length, 0);
});
test('an approved cue with unresolved audio blocks readiness', () => {
  const show = approved();
  const report = inspectShowReadiness(show, () => false);
  assert.equal(report.ready, false);
  assert.equal(report.issues[0].code, 'UNRESOLVED_AUDIO');
  assert.equal(report.issues[0].cueId, show.cues[0].id);
  assert.equal(report.readyCues, 0);
});
test('audio metadata alone cannot pass: decoded local file is required', () => {
  let show = approved();
  show = addAudioReference(show, 'slam.wav');
  show = assignAudioToCue(show, show.cues[0].id, show.assets[0].id);
  const notLoaded = inspectShowReadiness(show, () => false);
  assert.equal(notLoaded.ready, false);
  assert.equal(notLoaded.issues[0].code, 'FILE_NOT_LOADED');
  const loaded = inspectShowReadiness(show, id => id === show.assets[0].id);
  assert.equal(loaded.ready, true);
  assert.equal(loaded.totalCues, 1);
  assert.equal(loaded.readyCues, 1);
});
test('pending suggestions only produce a warning, not an audio command', () => {
  let show = approved();
  show = addAudioReference(show, 'slam.wav');
  show = assignAudioToCue(show, show.cues[0].id, show.assets[0].id);
  show = addMockProposal(show, { lineId: 'L3', label: 'Waiting room' });
  const report = inspectShowReadiness(show, () => true);
  assert.equal(report.ready, true);
  assert.equal(report.warningCount, 1);
  assert.equal(report.issues[0].code, 'PENDING_REVIEW');
});
test('loading keeps readiness blocked even when every existing cue has decoded audio', () => {
  let show = approved();
  show = addAudioReference(show, 'slam.wav');
  show = assignAudioToCue(show, show.cues[0].id, show.assets[0].id);
  const report = inspectShowReadiness(show, () => true, { audioLoading: true });
  assert.equal(report.ready, false);
  assert.ok(report.issues.some(issue => issue.code === 'AUDIO_LOADING'));
  assert.throws(() => inspectShowReadiness(show, null), /callback/);
});
