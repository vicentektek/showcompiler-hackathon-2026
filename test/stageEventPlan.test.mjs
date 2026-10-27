import test from 'node:test';
import assert from 'node:assert/strict';
import { planStageEvents } from '../src/core/stageEventPlan.mjs';

const phoneScript = [
  'ESCENA 1',
  '(Empieza a sonar un teléfono.)',
  'ANA: No lo cojas.',
  '(El teléfono continúa sonando.)',
  'LUIS: Recuerdo aquella tormenta.',
  'ANA: Contesta, por favor.',
  '(Luis descuelga y cesa el timbre.)',
].join('\n');

function suggestion(line, evidence, transport, cueKind = 'FX') {
  return {
    sourceLineId: 'L' + line,
    sourceEvidence: evidence,
    transport,
    cueKind,
    basis: 'EXPLICIT',
    trigger: 'ON_LINE',
  };
}

test('explicit identity links phone PLAY, CONTINUE and STOP without a second GO', () => {
  const source = [
    suggestion(7, 'cesa el timbre', 'STOP'),
    suggestion(2, 'Empieza a sonar un teléfono', 'PLAY'),
    suggestion(4, 'teléfono continúa sonando', 'CONTINUE'),
  ];
  const original = structuredClone(source);
  const result = planStageEvents(phoneScript, source, {
    identityByEventId: { 'E-L2-1': 'phone', 'E-L4-1': 'phone', 'E-L7-1': 'phone' },
    sourceByEventId: { 'E-L2-1': 'RECORDED', 'E-L4-1': 'RECORDED', 'E-L7-1': 'RECORDED' },
  });
  assert.deepEqual(result.events.map(e => e.transport), ['PLAY', 'CONTINUE', 'STOP']);
  assert.deepEqual(result.events.map(e => e.sourceLineId), ['L2', 'L4', 'L7']);
  assert.equal(result.events[1].linkedPlayEventId, 'E-L2-1');
  assert.equal(result.events[2].linkedPlayEventId, 'E-L2-1');
  assert.deepEqual(result.activeSoundIdentities, []);
  assert.equal(result.unresolvedEventIds.length, 0);
  assert.equal(result.events.some(e => e.sourceLineId === 'L5'), false);
  assert.equal(result.events.every(e => e.executable === false), true);
  assert.equal(result.executable, false);
  assert.deepEqual(source, original);
});

test('unbound STOP and CONTINUE never guess a target from the only active sound', () => {
  const result = planStageEvents(phoneScript, [
    suggestion(2, 'Empieza a sonar', 'PLAY'),
    suggestion(4, 'teléfono continúa', 'CONTINUE'),
    suggestion(7, 'cesa el timbre', 'STOP'),
  ], { identityByEventId: { 'E-L2-1': 'phone' } });
  assert.equal(result.events[1].linkedPlayEventId, null);
  assert.equal(result.events[2].linkedPlayEventId, null);
  assert.equal(result.events[1].reviewIssues.includes('TARGET_SOUND_UNRESOLVED'), true);
  assert.equal(result.events[2].reviewIssues.includes('TARGET_SOUND_UNRESOLVED'), true);
  assert.deepEqual(result.activeSoundIdentities, ['phone']);
});

test('sound state survives a scene change but an unknown stop remains unresolved', () => {
  const script = 'ESCENA 1\n(Suena una sirena.)\nESCENA 2\n(La sirena continúa.)\n(Se detiene la sirena.)';
  const result = planStageEvents(script, [
    suggestion(2, 'Suena una sirena', 'PLAY'),
    suggestion(4, 'sirena continúa', 'CONTINUE'),
    suggestion(5, 'detiene la sirena', 'STOP'),
  ], { identityByEventId: { 'E-L2-1': 'siren', 'E-L4-1': 'siren' } });
  assert.equal(result.events[0].sceneId, 'S1');
  assert.equal(result.events[1].sceneId, 'S2');
  assert.equal(result.events[1].linkedPlayEventId, result.events[0].eventId);
  assert.equal(result.events[2].linkedPlayEventId, null);
  assert.deepEqual(result.activeSoundIdentities, ['siren']);
});

test('silence remains non-executable and does not silently STOP ALL', () => {
  const script = 'SCENE 1\n(The rain begins.)\n(Absolute silence.)';
  const result = planStageEvents(script, [
    suggestion(2, 'rain begins', 'PLAY', 'AMBIENCE'),
    suggestion(3, 'Absolute silence', 'SILENCE', 'SILENCE'),
  ], { identityByEventId: { 'E-L2-1': 'rain' } });
  assert.equal(result.events[1].linkedPlayEventId, null);
  assert.deepEqual(result.activeSoundIdentities, ['rain']);
  assert.equal(result.events[1].reviewIssues.includes('SILENCE_REQUIRES_OPERATOR_DECISION'), true);
});

test('indicates physical-vs-recorded source is unresolved, without creating a playback cue', () => {
  const result = planStageEvents('SCENE 1\n(A door slams.)', [
    suggestion(2, 'door slams', 'PLAY'),
  ], { sourceByEventId: { 'E-L2-1': 'SET_PROP' } });
  assert.equal(result.events[0].sourceMode, 'SET_PROP');
  assert.equal(result.events[0].executable, false);
  assert.equal(result.events[0].linkedPlayEventId, null);
});

test('exact source evidence and valid intent are mandatory', () => {
  const source = suggestion(2, 'not actually there', 'PLAY');
  assert.throws(() => planStageEvents(phoneScript, [source]), RangeError);
  assert.throws(() => planStageEvents(phoneScript, [suggestion(99, 'X', 'PLAY')]), RangeError);
  assert.throws(() => planStageEvents(phoneScript, [suggestion(2, 'teléfono', 'EXEC')]), TypeError);
  assert.throws(() => planStageEvents(phoneScript, [suggestion(2, 'teléfono', 'PLAY', 'SILENCE')]), TypeError);
  assert.throws(() => planStageEvents(phoneScript, [], { sourceByEventId: [] }), TypeError);
  assert.throws(() => planStageEvents(phoneScript, [suggestion(2, 'teléfono', 'PLAY')], {
    identityByEventId: { 'E-L2-1': '../../unsafe' },
  }), TypeError);
});

test('two different one-shots on the same line stay distinct candidates', () => {
  const script = 'SCENE 1\n(A bell sounds and a door slams.)';
  const output = planStageEvents(script, [
    suggestion(2, 'bell sounds', 'PLAY'),
    suggestion(2, 'door slams', 'PLAY'),
  ]);
  assert.deepEqual(output.events.map(e => e.eventId), ['E-L2-1', 'E-L2-2']);
  assert.equal(output.events.every(e => !e.executable), true);
});

test('model confidence does not authorize playback or fabricate associations', () => {
  const result = planStageEvents(phoneScript, [{
    ...suggestion(2, 'Empieza a sonar', 'PLAY'), confidence: 1,
  }]);
  assert.equal(result.events[0].executable, false);
  assert.deepEqual(result.activeSoundIdentities, []);
});
