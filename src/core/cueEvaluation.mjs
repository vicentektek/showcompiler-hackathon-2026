/**
 * Pure offline evaluation of human-reviewed gold cue placements.
 * Does not call a model or mutate the source script.
 *
 * Gold cases are synthetic: they do NOT establish live-model quality.
 */
import { parseScript } from './script.mjs';

const ID = /^L[1-9][0-9]*$/;
function lineIds(lines, field) {
  if (!Array.isArray(lines) || lines.some(line => typeof line !== 'string' || !ID.test(line))) {
    throw new TypeError('Invalid evaluation ' + field);
  }
  return lines;
}
function strictGoldLines(lines, field) {
  lineIds(lines, field);
  if (new Set(lines).size !== lines.length) throw new TypeError('Duplicate evaluation ' + field);
  return lines;
}
export function evaluateCuePlacement({scriptText, expectedLineIds, forbiddenLineIds = [], proposedLineIds = []}) {
  if (typeof scriptText !== 'string') throw new TypeError('Evaluation needs script text');
  const valid = new Set(parseScript(scriptText).map(line => line.id));
  const expected = strictGoldLines(expectedLineIds, 'expectedLineIds');
  const forbidden = strictGoldLines(forbiddenLineIds, 'forbiddenLineIds');
  const proposed = lineIds(proposedLineIds, 'proposedLineIds');
  if ([...expected, ...forbidden].some(line => !valid.has(line))) {
    throw new RangeError('Unknown source line in gold evaluation');
  }
  const forbiddenSet = new Set(forbidden);
  if (expected.some(line => forbiddenSet.has(line))) {
    throw new RangeError('Gold source line is both expected and forbidden');
  }
  const actualSet = new Set(proposed);
  const truePositives = expected.filter(line => actualSet.has(line)).length;
  const falseNegatives = expected.length - truePositives;
  // Every emitted proposal occupies precision budget. A repeated true cue is
  // therefore one true positive plus one false positive, rather than receiving
  // free credit for firing the same continuing ambience multiple times.
  const falsePositives = proposed.length - truePositives;
  const forbiddenTriggers = proposed.filter(line => forbiddenSet.has(line)).length;
  const hallucinatedReferences = proposed.filter(line => !valid.has(line)).length;
  const duplicateProposals = proposed.length - actualSet.size;
  const precision = proposed.length ? truePositives / proposed.length : expected.length === 0 ? 1 : 0;
  const recall = expected.length ? truePositives / expected.length : 1;
  return {
    truePositives, falsePositives, falseNegatives, forbiddenTriggers,
    hallucinatedReferences, duplicateProposals,
    precision, recall,
    f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
  };
}

/** Aggregate a reproducible set of independent, human-authored gold fixtures. */
export function evaluateCueFixtureSet(fixtures) {
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    throw new TypeError('Evaluation fixture set must be a nonempty array');
  }
  const totals = {
    fixtureCount: fixtures.length,
    truePositives: 0,
    falsePositives: 0,
    falseNegatives: 0,
    forbiddenTriggers: 0,
    hallucinatedReferences: 0,
    duplicateProposals: 0,
  };
  for (const fixture of fixtures) {
    const result = evaluateCuePlacement(fixture);
    for (const field of [
      'truePositives', 'falsePositives', 'falseNegatives',
      'forbiddenTriggers', 'hallucinatedReferences', 'duplicateProposals',
    ]) totals[field] += result[field];
  }
  const precisionDenominator = totals.truePositives + totals.falsePositives;
  const recallDenominator = totals.truePositives + totals.falseNegatives;
  const precision = precisionDenominator ? totals.truePositives / precisionDenominator
    : recallDenominator === 0 ? 1 : 0;
  const recall = recallDenominator ? totals.truePositives / recallDenominator : 1;
  return {
    ...totals,
    precision,
    recall,
    f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
  };
}
