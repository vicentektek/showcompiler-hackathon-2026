import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCueFixtureSet, evaluateCuePlacement } from '../src/core/cueEvaluation.mjs';

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
    assert.equal(result.hallucinatedReferences, 0, sample.name);
    assert.equal(result.duplicateProposals, 0, sample.name);
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

test('hallucinated references and repeated cues are measured and penalize precision', () => {
  const result = evaluateCuePlacement({...cases[0], proposedLineIds:['L2', 'L2', 'L300']});
  assert.equal(result.truePositives, 1);
  assert.equal(result.falsePositives, 2);
  assert.equal(result.hallucinatedReferences, 1);
  assert.equal(result.duplicateProposals, 1);
  assert.equal(result.precision, 1 / 3);
});

test('gold references remain strict while model predictions need only valid line-ID syntax', () => {
  assert.throws(() => evaluateCuePlacement({...cases[0], expectedLineIds:['L2', 'L3'], forbiddenLineIds:['L3']}), RangeError);
  assert.throws(() => evaluateCuePlacement({...cases[0], expectedLineIds:['L300']}), RangeError);
  assert.throws(() => evaluateCuePlacement({...cases[0], forbiddenLineIds:['L300']}), RangeError);
  assert.throws(() => evaluateCuePlacement({...cases[0], expectedLineIds:['L2', 'L2']}), TypeError);
  assert.throws(() => evaluateCuePlacement({...cases[0], expectedLineIds:['L0']}), TypeError);
  assert.throws(() => evaluateCuePlacement({...cases[0], proposedLineIds:['L0']}), TypeError);
});

test('aggregate multilingual scene fixtures expose precision, recall and theatrical failure modes', () => {
  const fixtures = [
    {
      name: 'Spanish explicit bell and dialogue-only memory',
      scriptText: 'ESCENA 1\n(Suena una campana lejana.)\nANA: Recuerdo la tormenta.\nTELÓN.',
      expectedLineIds: ['L2'], forbiddenLineIds: ['L3'], proposedLineIds: ['L2', 'L3'],
    },
    {
      name: 'English atmospheric suggestion',
      scriptText: 'SCENE 2\nEXT. EMPTY STATION - DAWN\nA wet platform under a pale sky.',
      expectedLineIds: ['L2'], forbiddenLineIds: [], proposedLineIds: ['L2'],
    },
    {
      name: 'French continuing ambience is not a new GO',
      scriptText: 'SCÈNE 3\n(La pluie commence.)\nÉLISE : Attends.\n(La pluie continue.)',
      expectedLineIds: ['L2'], forbiddenLineIds: ['L4'], proposedLineIds: ['L2', 'L2', 'L4'],
    },
    {
      name: 'German intentional silence',
      scriptText: 'SZENE 4\n(Absolute Stille.)\nMARA: Hörst du mich?',
      expectedLineIds: [], forbiddenLineIds: ['L2'], proposedLineIds: [],
    },
    {
      name: 'Portuguese hallucinated source reference',
      scriptText: 'CENA 5\n(Uma porta bate.)\nLIA: Vamos.',
      expectedLineIds: ['L2'], forbiddenLineIds: [], proposedLineIds: ['L99'],
    },
  ];
  const result = evaluateCueFixtureSet(fixtures);
  assert.deepEqual(result, {
    fixtureCount: 5,
    truePositives: 3,
    falsePositives: 4,
    falseNegatives: 1,
    forbiddenTriggers: 2,
    hallucinatedReferences: 1,
    duplicateProposals: 1,
    precision: 3 / 7,
    recall: 3 / 4,
    f1: 6 / 11,
  });
  assert.throws(() => evaluateCueFixtureSet([]), TypeError);
});

test('evaluation does not modify script source', () => {
  const sample = {...cases[1]};
  const original = sample.scriptText;
  evaluateCuePlacement({...sample, proposedLineIds:['L2']});
  assert.equal(sample.scriptText, original);
});
