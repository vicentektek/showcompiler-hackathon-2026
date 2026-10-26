/**
 * Pure offline evaluation of human-reviewed gold cue placements.
 * Does not call a model or mutate the source script.
 *
 * Gold cases are synthetic: they do NOT establish live-model quality.
 */
import { parseScript } from './script.mjs';

const ID = /^L[1-9][0-9]*$/;
function strictLines(lines, field) {
  if (!Array.isArray(lines) || lines.some(line => typeof line !== 'string' || !ID.test(line))) {
    throw new TypeError('Invalid evaluation ' + field);
  }
  if (new Set(lines).size !== lines.length) throw new TypeError('Duplicate evaluation ' + field);
  return lines;
}
export function evaluateCuePlacement({scriptText, expectedLineIds, forbiddenLineIds = [], proposedLineIds = []}) {
  if (typeof scriptText !== 'string') throw new TypeError('Evaluation needs script text');
  const valid = new Set(parseScript(scriptText).map(line => line.id));
  const expected = strictLines(expectedLineIds, 'expectedLineIds');
  const forbidden = strictLines(forbiddenLineIds, 'forbiddenLineIds');
  const proposed = strictLines(proposedLineIds, 'proposedLineIds');
  if ([...expected, ...forbidden, ...proposed].some(line => !valid.has(line))) {
    throw new RangeError('Unknown source line in evaluation');
  }
  const expectedSet = new Set(expected);
  const forbiddenSet = new Set(forbidden);
  if (expected.some(line => forbiddenSet.has(line))) {
    throw new RangeError('Gold source line is both expected and forbidden');
  }
  const actualSet = new Set(proposed);
  const truePositives = expected.filter(line => actualSet.has(line)).length;
  const falseNegatives = expected.length - truePositives;
  const falsePositives = proposed.filter(line => !expectedSet.has(line)).length;
  const forbiddenTriggers = proposed.filter(line => forbiddenSet.has(line)).length;
  const precision = proposed.length ? truePositives / proposed.length : expected.length === 0 ? 1 : 0;
  const recall = expected.length ? truePositives / expected.length : 1;
  return {
    truePositives, falsePositives, falseNegatives, forbiddenTriggers,
    precision, recall,
    f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
  };
}
