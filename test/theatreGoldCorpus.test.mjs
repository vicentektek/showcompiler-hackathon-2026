import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateCueFixtureSet } from '../src/core/cueEvaluation.mjs';

const corpus = JSON.parse(readFileSync(
  new URL('../fixtures/theatre-gold-v1.json', import.meta.url), 'utf8'));

test('original multilingual gold corpus has 8 scenarios and valid line references', () => {
  assert.equal(corpus.schema, 'showcompiler-theatre-gold-v1');
  assert.equal(corpus.originalSynthetic, true);
  assert.equal(corpus.fixtures.length, 8);
  assert.deepEqual(new Set(corpus.fixtures.map(f => f.language)),
    new Set(['es', 'en', 'fr', 'pt', 'de']));
  let positive = 0, negative = 0;
  for (const f of corpus.fixtures) {
    const valid = new Set(f.scriptText.split('\n').map((_, i) => 'L' + (i + 1)));
    for (const id of [...f.expectedLineIds, ...f.forbiddenLineIds]) {
      assert.ok(valid.has(id), f.id + ': invalid line ' + id);
    }
    assert.equal(new Set([...f.expectedLineIds, ...f.forbiddenLineIds]).size,
      f.expectedLineIds.length + f.forbiddenLineIds.length);
    positive += f.expectedLineIds.length;
    negative += f.forbiddenLineIds.length;
  }
  assert.equal(positive, 12);
  assert.equal(negative, 23);
  assert.ok(corpus.fixtures.some(f => f.scriptText.split('\n').length > 120));
});

test('offline scorer verifies a perfect synthetic gold prediction (no model request)', () => {
  const result = evaluateCueFixtureSet(corpus.fixtures.map(f =>
    ({ ...f, proposedLineIds: f.expectedLineIds })));
  assert.equal(result.truePositives, 12);
  assert.equal(result.falsePositives, 0);
  assert.equal(result.falseNegatives, 0);
  assert.equal(result.f1, 1);
});

test('offline scorer identifies all 23 explicit negative triggers', () => {
  const result = evaluateCueFixtureSet(corpus.fixtures.map(f =>
    ({ ...f, proposedLineIds: f.forbiddenLineIds })));
  assert.equal(result.truePositives, 0);
  assert.equal(result.falsePositives, 23);
  assert.equal(result.forbiddenTriggers, 23);
  assert.equal(result.falseNegatives, 12);
  assert.equal(result.precision, 0);
});
