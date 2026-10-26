import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCuePlacement } from '../src/core/cueEvaluation.mjs';

const cases = [
  {
    name: 'explicit bell versus remembered thunder',
    scriptText: 'ESCENA 1\n(Suena una campana lejana)\nANA: Recuerdo aquella tormenta de niño.\nTELÓN.',
    expectedLineIds: ['L2'], forbiddenLineIds: ['L3'],
  },
  {
    name: 'continuous rain is one cue',
    scriptText: 'ESCENA 2\n(Comienza la lluvia)\nANA: ¿La oyes?\n(La lluvia continúa mientras hablan.)',
    expectedLineIds: ['L2'], forbiddenLineIds: ['L4'],
  },
  {
    name: 'silence must not invent an audio file',
    scriptText: 'ESCENA 3\n(Silencio absoluto.)\nANA: ¿Me escuchas?',
    expectedLineIds: [], forbiddenLineIds: ['L2', 'L3'],
  },
  {
    name: 'explicit one-shot portazo',
    scriptText: 'ESCENA 4\n(Se cierra la puerta de golpe.)\nLUIS: ¡Fuera!',
    expectedLineIds: ['L2'], forbiddenLineIds: [],
  },
];

test('perfect manually authored gold predictions receive full precision/recall', () => {
  for (const sample of cases) {
    const result = evaluateCuePlacement({...sample, proposedLineIds: sample.expectedLineIds});
    assert.equal(result.precision, 1, sample.name);
    assert.equal(result.recall, 1, sample.name);
    assert.equal(result.forbiddenTriggers, 0, sample.name);
  }
});

test('false cue due to a character remembering thunder counts as forbidden', () => {
  const result = evaluateCuePlacement({...cases[0], proposedLineIds: ['L2', 'L3']});
  assert.equal(result.truePositives, 1);
  assert.equal(result.falsePositives, 1);
  assert.equal(result.forbiddenTriggers, 1);
  assert.equal(result.precision, 0.5);
  assert.equal(result.recall, 1);
});

test('missing an explicit sound produces a false negative', () => {
  const result = evaluateCuePlacement({...cases[3], proposedLineIds: []});
  assert.equal(result.truePositives, 0);
  assert.equal(result.falseNegatives, 1);
  assert.equal(result.recall, 0);
});

test('a show with no audible cues can be evaluated without fake positives', () => {
  const result = evaluateCuePlacement({...cases[2], proposedLineIds: []});
  assert.equal(result.precision, 1);
  assert.equal(result.recall, 1);
  assert.equal(result.f1, 1);
});

test('gold set and model prediction must use real, unique line references', () => {
  assert.throws(() => evaluateCuePlacement({...cases[0], proposedLineIds:['L300']}), RangeError);
  assert.throws(() => evaluateCuePlacement({...cases[0], proposedLineIds:['L2', 'L2']}), TypeError);
  assert.throws(() => evaluateCuePlacement({...cases[0], expectedLineIds:['L2', 'L3'], forbiddenLineIds:['L3']}), RangeError);
  assert.throws(() => evaluateCuePlacement({...cases[0], expectedLineIds:['L0']}), TypeError);
});

test('evaluation does not modify script source', () => {
  const sample = {...cases[1]};
  const original = sample.scriptText;
  evaluateCuePlacement({...sample, proposedLineIds:['L2']});
  assert.equal(sample.scriptText, original);
});
