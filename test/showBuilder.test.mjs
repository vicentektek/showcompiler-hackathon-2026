import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessShowBuilder,
  chooseShowBuilderSoundPlan,
  confirmShowBuilderConfiguration,
  loadShowBuilderSession,
  saveShowBuilderSession,
  skipShowBuilderStage,
  updateShowBuilderStage,
} from '../src/core/showBuilder.mjs';
import {
  addAudioReference,
  addMockProposal,
  createNewShow,
  decideProposal,
  updateCuePlayback,
} from '../src/core/workspace.mjs';
import { insertManualAudioCue } from '../src/core/manualCues.mjs';

function showWithScript(id = 'show-a') {
  return createNewShow({
    id,
    name: 'The Last Cue',
    scriptText: 'SCENE 1\n(A bell rings.)',
  });
}

test('empty no-script project does not require script cue analysis or count omission as completion', () => {
  const project = createNewShow({ id: 'audio-first', name: 'Audio-first show' });
  const { session } = loadShowBuilderSession(null, project);
  const assessment = assessShowBuilder(project, [], session);
  assert.equal(assessment.stages.project.complete, false);
  assert.deepEqual(assessment.stages.cues, { complete: false, notRequired: true });
  assert.equal(assessment.stages.verification.complete, false,
    'An empty project must not be presented as a verified show');

  const skipped = skipShowBuilderStage(session, 'cues');
  assert.deepEqual(skipped.skippedStages, ['cues']);
  assert.equal(assessShowBuilder(project, [], skipped).stages.cues.complete, false);
});

test('cue completion follows reviewed project data, not builder navigation or omission', () => {
  let project = showWithScript();
  project = addMockProposal(project, { lineId: 'L2', label: 'Bell' });
  let session = loadShowBuilderSession(null, project).session;
  assert.equal(assessShowBuilder(project, [], session).stages.cues.complete, false);

  project = decideProposal(project, project.proposals[0].id, 'REJECT');
  session = skipShowBuilderStage(session, 'cues');
  assert.equal(assessShowBuilder(project, [], session).stages.cues.complete, false);

  project = showWithScript('approved-cue');
  project = addMockProposal(project, { lineId: 'L2', label: 'Bell' });
  project = decideProposal(project, project.proposals[0].id, 'APPROVE');
  assert.equal(assessShowBuilder(project, [], session).stages.cues.complete, true);
});

test('audio is complete only when cue-linked local audio is loaded', () => {
  let project = showWithScript();
  project = addAudioReference(project, 'bell.wav');
  project = addMockProposal(project, {
    lineId: 'L2',
    assetId: project.assets[0].id,
    label: 'Bell',
  });
  project = decideProposal(project, project.proposals[0].id, 'APPROVE');
  const session = loadShowBuilderSession(null, project).session;

  assert.equal(assessShowBuilder(project, [{ id: project.assets[0].id, ready: false }], session)
    .stages.audio.complete, false);
  assert.equal(assessShowBuilder(project, [{ id: project.assets[0].id, ready: true }], session)
    .stages.audio.complete, true);
});

test('sound design can be deferred without presenting audio-free cues as playable', () => {
  let project = showWithScript();
  project = addMockProposal(project, { lineId: 'L2', label: 'Bell' });
  project = decideProposal(project, project.proposals[0].id, 'APPROVE');
  const initial = loadShowBuilderSession(null, project).session;
  const deferred = chooseShowBuilderSoundPlan(initial, 'skip');
  const assessment = assessShowBuilder(project, [], deferred);

  assert.deepEqual(assessment.stages.audio, { complete: true, notRequired: true });
  assert.equal(assessment.stages.verification.complete, false);
  assert.ok(assessment.readiness.blockerCount > 0);
  assert.equal(chooseShowBuilderSoundPlan(initial, 'create').soundDecision, 'create');
  assert.throws(() => chooseShowBuilderSoundPlan(initial, 'later'), /Choose whether to create sounds/);
});

test('configuration confirmation becomes stale when cue settings change', () => {
  let project = showWithScript();
  project = addAudioReference(project, 'bell.wav');
  project = insertManualAudioCue(project, project.assets[0].id).project;
  const session = confirmShowBuilderConfiguration(project, loadShowBuilderSession(null, project).session);
  assert.equal(assessShowBuilder(project, [], session).stages.configuration.complete, true);
  project = updateCuePlayback(project, project.cues[0].id, { fadeOutMs: 500 });
  assert.equal(assessShowBuilder(project, [], session).stages.configuration.complete, false);
});

test('builder session persists per project identity and safely resets corrupted state', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const first = showWithScript('same-id');
  const second = createNewShow({
    id: 'same-id',
    name: 'Different show',
    scriptText: 'A different source script.',
  });
  const changed = updateShowBuilderStage(loadShowBuilderSession(storage, first).session, 'audio');
  assert.equal(saveShowBuilderSession(storage, first, changed), true);
  assert.equal(loadShowBuilderSession(storage, first).session.currentStage, 'audio');
  assert.equal(loadShowBuilderSession(storage, second).session.currentStage, 'project');
  const firstKey = 'runq.show-builder.v1.' + loadShowBuilderSession(storage, first).session.projectKey;
  const legacySession = JSON.parse(values.get(firstKey));
  delete legacySession.soundDecision;
  values.set(firstKey, JSON.stringify(legacySession));
  assert.equal(loadShowBuilderSession(storage, first).session.soundDecision, null,
    'Previously saved builder sessions remain compatible');
  values.set(firstKey, '{');
  assert.equal(loadShowBuilderSession(storage, first).session.currentStage, 'project');
});

test('assistant persistence failures are reported without blocking the current tab', () => {
  const project = showWithScript();
  const storage = {
    getItem() { throw new Error('storage disabled'); },
    setItem() { throw new Error('storage disabled'); },
  };
  const loaded = loadShowBuilderSession(storage, project);
  assert.equal(loaded.persistenceAvailable, false);
  assert.equal(saveShowBuilderSession(storage, project, loaded.session), false);
});
