/**
 * Reader and validator for the original Level 1 evaluation corpus
 * (fixtures/qa/level1). Purely offline: no provider calls, no credentials,
 * no audio transport and no project mutations.
 *
 * Contract of this corpus:
 * - Level 1 of fixtures/qa/curriculum-v1.json: explicit recorded cues versus
 *   false positives (mentioned-only sounds and practical stage sounds).
 * - Exactly sixteen original cases: six development cases for human-guided
 *   iteration and exactly ten locked qualification cases matching the level
 *   curriculum gate (EXACT_CASES = 10).
 * - All gold is PROVISIONAL_UNREVIEWED: a theatrical sound operator must
 *   approve each case; this module never self-certifies HUMAN_REVIEWED.
 * - Qualification-pool cases support level 1 qualification evidence only and
 *   must never feed prompt optimization.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { parseScript } from '../src/core/script.mjs';
import { planScriptAnalysis } from '../src/core/sceneAnalysis.mjs';

export const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CORPUS_DIR = 'fixtures/qa/level1';
export const PROVISIONAL = 'PROVISIONAL_UNREVIEWED';

const TRANSPORTS = new Set(['PLAY', 'STOP', 'CONTINUE', 'SILENCE']);
const KINDS = new Set(['FX', 'AMBIENCE', 'MUSIC', 'VOICE', 'SILENCE', 'TRANSITION']);
const BASES = new Set(['EXPLICIT', 'SUGGESTED']);
const POOLS = new Set(['development', 'qualification']);
const DOCUMENT_KINDS = new Set(['dramatic_script', 'running_order', 'libretto', 'calling_script', 'cue_sheet']);
const CASE_ID = /^[a-z][a-z0-9-]{1,60}$/;
const LINE_ID = /^L[1-9]\d*$/;
const TOTAL_CASE_COUNT = 16;
const QUALIFICATION_CASE_COUNT = 10;
const DEVELOPMENT_CASE_COUNT = TOTAL_CASE_COUNT - QUALIFICATION_CASE_COUNT;
const MAX_EVENTS = 128;
const MAX_WINDOWS = 512;
const MAX_SCRIPT_CHARS = 100_000;
const JUSTIFICATION_MIN = 10;
const JUSTIFICATION_MAX = 400;

const MANIFEST_KEYS = new Set([
  'version', 'corpus', 'manifestKind', 'provenance', 'humanReviewStatus', 'purpose',
  'poolPolicy', 'qualificationPolicy', 'level', 'caseOrder', 'cases',
]);
const CASE_KEYS = new Set([
  'id', 'title', 'file', 'type', 'documentKind', 'language', 'pool', 'tuningUse',
  'difficulty', 'expected', 'forbiddenPlayLineIds', 'justifications',
  'sceneWindowCount', 'reviewStatus',
]);

function fail(message) {
  throw new TypeError(message);
}
function expectExactKeys(record, keys, field) {
  const incoming = Object.keys(record);
  for (const key of incoming) {
    if (!keys.has(key)) fail('Unexpected key ' + key + ' in ' + field);
  }
}
function boundedText(value, field, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    fail('Invalid ' + field);
  }
  return value.trim();
}
function boundedCount(value, field, max, min = 0) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('Invalid ' + field);
  return value;
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

function validateEvent(raw, field) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Invalid ' + field);
  expectExactKeys(raw, new Set(['lineId', 'transport', 'cueKind', 'basis']), field);
  if (!LINE_ID.test(raw.lineId)) fail('Invalid lineId in ' + field);
  if (!TRANSPORTS.has(raw.transport) || !KINDS.has(raw.cueKind) || !BASES.has(raw.basis)) {
    fail('Invalid transport/cueKind/basis in ' + field);
  }
  if ((raw.transport === 'SILENCE') !== (raw.cueKind === 'SILENCE')) {
    fail('SILENCE transport and SILENCE cueKind must be paired in ' + field);
  }
  if (raw.basis !== 'EXPLICIT') {
    fail('Level 1 expected events must be EXPLICIT in ' + field);
  }
  return Object.freeze({...raw});
}

function validateLevelEntry(level) {
  if (!level || typeof level !== 'object' || Array.isArray(level)) fail('Invalid level entry');
  expectExactKeys(level, new Set(['index', 'name', 'manifest', 'gate']), 'level');
  if (level.index !== 1) fail('This corpus only defines curriculum level 1');
  if (level.name !== 'Explicit versus false positives') fail('Level 1 name mismatch with curriculum manifest');
  if (level.manifest !== 'fixtures/qa/curriculum-v1.json') fail('Level 1 must reference the curriculum manifest');
  if (!level.gate || typeof level.gate !== 'object' || Array.isArray(level.gate) ||
      level.gate.kind !== 'EXACT_CASES' || level.gate.exactCasesRequired !== QUALIFICATION_CASE_COUNT) {
    fail('Level 1 gate must require exactly ' + QUALIFICATION_CASE_COUNT + ' exact qualification cases');
  }
  return deepFreeze({...level, gate: deepFreeze({...level.gate})});
}

export function validateLevel1Manifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('Invalid level1 corpus manifest');
  expectExactKeys(manifest, MANIFEST_KEYS, 'level1 corpus manifest');
  if (manifest.version !== 1) fail('Invalid level1 corpus version');
  if (manifest.corpus !== 'RUNQ_LEVEL1_EVAL_CORPUS') fail('Invalid level1 corpus id');
  if (manifest.manifestKind !== 'ORIGINAL_PROVISIONAL_GOLD_NOT_A_MODEL_BENCHMARK') {
    fail('Invalid level1 corpus manifestKind');
  }
  boundedText(manifest.provenance, 'level1 provenance', 10, 160);
  boundedText(manifest.purpose, 'level1 purpose', 40, 1200);
  boundedText(manifest.poolPolicy, 'level1 poolPolicy', 20, 300);
  boundedText(manifest.qualificationPolicy, 'level1 qualificationPolicy', 20, 300);
  if (manifest.humanReviewStatus !== PROVISIONAL) {
    fail('New level1 gold must stay ' + PROVISIONAL + ' until an operator signs off');
  }
  const level = validateLevelEntry(manifest.level);
  boundedCount(manifest.cases?.length, 'level1 cases length', TOTAL_CASE_COUNT, TOTAL_CASE_COUNT);
  const ids = new Set();
  for (const entry of manifest.cases) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('Invalid level1 case');
    expectExactKeys(entry, CASE_KEYS, 'level1 case ' + (entry.id ?? 'unknown'));
    if (typeof entry.id !== 'string' || !CASE_ID.test(entry.id)) fail('Invalid level1 case id');
    if (ids.has(entry.id)) fail('Duplicate level1 case id ' + entry.id);
    ids.add(entry.id);
    if (entry.file !== CORPUS_DIR + '/' + entry.id + '.txt') {
      fail('Unsafe or mismatched level1 script file for ' + entry.id);
    }
    boundedText(entry.title, 'level1 title', 3, 120);
    boundedText(entry.type, 'level1 type', 3, 40);
    if (!DOCUMENT_KINDS.has(entry.documentKind)) fail('Invalid level1 documentKind for ' + entry.id);
    if (typeof entry.language !== 'string' || !/^[a-z]{2}$/.test(entry.language)) {
      fail('Invalid level1 language for ' + entry.id);
    }
    if (!POOLS.has(entry.pool)) fail('Invalid level1 pool for ' + entry.id);
    if (entry.tuningUse !== (entry.pool === 'development')) {
      fail('tuningUse must match the pool policy for ' + entry.id);
    }
    const difficulty = entry.difficulty;
    if (!difficulty || typeof difficulty !== 'object' || Array.isArray(difficulty)) {
      fail('Invalid level1 difficulty for ' + entry.id);
    }
    expectExactKeys(difficulty, new Set(['rating', 'focus']), 'level1 difficulty');
    boundedCount(difficulty.rating, 'level1 difficulty rating', 3, 1);
    boundedText(difficulty.focus, 'level1 difficulty focus', 5, 160);
    if (entry.reviewStatus !== PROVISIONAL) {
      fail('Level 1 case ' + entry.id + ' must keep review status ' + PROVISIONAL);
    }
    boundedCount(entry.sceneWindowCount, 'level1 sceneWindowCount', MAX_WINDOWS, 1);
  }
  const qualificationCases = manifest.cases.filter(entry => entry.pool === 'qualification').length;
  if (qualificationCases !== QUALIFICATION_CASE_COUNT) {
    fail('Level 1 qualification pool must reserve exactly ' + QUALIFICATION_CASE_COUNT +
      ' cases for the curriculum gate (found ' + qualificationCases + ')');
  }
  const developmentCases = manifest.cases.filter(entry => entry.pool === 'development').length;
  if (developmentCases !== DEVELOPMENT_CASE_COUNT) {
    fail('Level 1 development pool must keep exactly ' + DEVELOPMENT_CASE_COUNT +
      ' cases (found ' + developmentCases + ')');
  }
  if (manifest.caseOrder?.length !== manifest.cases.length ||
      !Array.isArray(manifest.caseOrder) ||
      manifest.caseOrder.some((id, index) => id !== manifest.cases[index].id)) {
    fail('caseOrder must list the exact case ids in canonical order');
  }
  return deepFreeze({...manifest, level, caseOrder: Object.freeze([...manifest.caseOrder]),
    cases: manifest.cases.map(item => deepFreeze({...item}))});
}

function validateJustifications(entry, expectedLineIds, forbiddenSet) {
  const justifications = entry.justifications;
  if (!justifications || typeof justifications !== 'object' || Array.isArray(justifications)) {
    fail('Invalid justifications for ' + entry.id);
  }
  expectExactKeys(justifications, new Set(['expected', 'negative']), 'level1 justifications');
  const collect = (list, field, allowed) => {
    boundedCount(list?.length, field + ' length', MAX_EVENTS, allowed.size);
    const seen = new Set();
    const normalized = [];
    for (const raw of list ?? []) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Invalid ' + field + ' entry');
      expectExactKeys(raw, new Set(['lineId', 'text']), field + ' entry');
      if (!LINE_ID.test(raw.lineId) || !allowed.has(raw.lineId)) {
        fail('Justification line outside its class in ' + field + ' (' + entry.id + ')');
      }
      if (seen.has(raw.lineId)) fail('Duplicate justification line in ' + field + ' (' + entry.id + ')');
      seen.add(raw.lineId);
      normalized.push(Object.freeze({lineId: raw.lineId, text: boundedText(raw.text,
        field + ' text', JUSTIFICATION_MIN, JUSTIFICATION_MAX)}));
    }
    if (seen.size !== allowed.size) fail('Incomplete justifications in ' + field + ' (' + entry.id + ')');
    return Object.freeze(normalized);
  };
  return deepFreeze({
    expected: collect(justifications.expected, 'expected justifications', expectedLineIds),
    negative: collect(justifications.negative, 'negative justifications', forbiddenSet),
  });
}

function validateCaseEvents(entry, sourceLines, windows) {
  boundedCount(entry.expected?.length, 'level1 expected events for ' + entry.id, MAX_EVENTS);
  boundedCount(entry.forbiddenPlayLineIds?.length, 'level1 forbidden lines for ' + entry.id, MAX_EVENTS);
  const expected = (entry.expected ?? []).map(item => validateEvent(item, 'level1 expected event'));
  const expectedLineIds = new Set(expected.map(event => event.lineId));
  for (const event of expected) {
    if (!sourceLines.has(event.lineId)) {
      fail('Expected level1 event outside script in ' + entry.id + ' at ' + event.lineId);
    }
    if (!windows.some(window => window.coreLines.some(line => line.id === event.lineId))) {
      fail('Expected level1 event outside any analysis window in ' + entry.id + ' at ' + event.lineId);
    }
  }
  const keys = new Set();
  for (const event of expected) {
    const key = [event.lineId, event.transport, event.cueKind, event.basis].join('|');
    if (keys.has(key)) fail('Duplicate level1 expected event in ' + entry.id);
    keys.add(key);
  }
  const forbiddenSet = new Set();
  for (const lineId of entry.forbiddenPlayLineIds ?? []) {
    if (typeof lineId !== 'string' || !LINE_ID.test(lineId)) {
      fail('Invalid level1 forbidden line id in ' + entry.id);
    }
    if (forbiddenSet.has(lineId)) fail('Duplicate level1 forbidden line in ' + entry.id);
    forbiddenSet.add(lineId);
    if (!sourceLines.has(lineId)) fail('Forbidden level1 line outside script in ' + entry.id + ' at ' + lineId);
    if (!windows.some(window => window.coreLines.some(line => line.id === lineId))) {
      fail('Forbidden level1 line outside any analysis window in ' + entry.id + ' at ' + lineId);
    }
  }
  for (const event of expected) {
    if (event.transport === 'PLAY' && forbiddenSet.has(event.lineId)) {
      fail('Expected PLAY on a forbidden line in ' + entry.id + ' at ' + event.lineId);
    }
  }
  const justifications = validateJustifications(entry, expectedLineIds, forbiddenSet);
  return {expected, expectedLineIds: Object.freeze([...expectedLineIds]),
    forbiddenPlayLineIds: Object.freeze([...forbiddenSet]), justifications};
}

export function validateLevel1Corpus({manifest, scriptsById}) {
  if (!scriptsById || typeof scriptsById !== 'object' || Array.isArray(scriptsById)) {
    fail('Invalid level1 scripts map');
  }
  const normalizedManifest = validateLevel1Manifest(manifest);
  const cases = [];
  for (const entry of normalizedManifest.cases) {
    const scriptText = scriptsById[entry.id];
    if (typeof scriptText !== 'string' || !scriptText.trim()) {
      fail('Missing level1 script text for ' + entry.id);
    }
    if (scriptText.length > MAX_SCRIPT_CHARS) fail('Level1 script too long for ' + entry.id);
    const lines = parseScript(scriptText);
    const sourceLines = new Set(lines.map(line => line.id));
    const plan = planScriptAnalysis(scriptText);
    if (plan.coverage.windowCount !== entry.sceneWindowCount) {
      fail('Scene window accounting mismatch for ' + entry.id + ': manifest says ' +
        entry.sceneWindowCount + ', planner says ' + plan.coverage.windowCount);
    }
    if (plan.coverage.coveragePercent < 100) {
      fail('Uncovered source lines in ' + entry.id);
    }
    const windows = plan.windows.map(window => Object.freeze({
      id: window.id, startLineId: window.startLineId, endLineId: window.endLineId,
    }));
    const annotations = validateCaseEvents(entry, sourceLines, plan.windows);
    cases.push(Object.freeze({
      id: entry.id, title: entry.title, file: entry.file,
      type: entry.type, documentKind: entry.documentKind, language: entry.language,
      pool: entry.pool, tuningUse: entry.tuningUse,
      difficulty: deepFreeze({...entry.difficulty}),
      expected: annotations.expected,
      forbiddenPlayLineIds: annotations.forbiddenPlayLineIds,
      justifications: annotations.justifications,
      sceneWindowCount: entry.sceneWindowCount, reviewStatus: entry.reviewStatus,
      scriptText, lineCount: lines.length,
      windows, windowIds: Object.freeze(windows.map(window => window.id)),
    }));
  }
  return deepFreeze({
    version: 1, corpus: normalizedManifest.corpus, manifestKind: normalizedManifest.manifestKind,
    provenance: normalizedManifest.provenance, humanReviewStatus: normalizedManifest.humanReviewStatus,
    poolPolicy: normalizedManifest.poolPolicy, qualificationPolicy: normalizedManifest.qualificationPolicy,
    level: normalizedManifest.level, caseOrder: normalizedManifest.caseOrder, cases,
  });
}

export async function readLevel1Corpus({rootDir = DEFAULT_ROOT} = {}) {
  const corpusDir = resolve(rootDir, CORPUS_DIR);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(corpusDir, 'corpus-v1.json'), 'utf8'));
  } catch {
    fail('Missing level1 corpus manifest under ' + CORPUS_DIR);
  }
  const prevalidated = validateLevel1Manifest(manifest);
  const scriptsById = {};
  for (const entry of prevalidated.cases) {
    const absolute = resolve(rootDir, entry.file);
    if (absolute !== resolve(corpusDir, entry.id + '.txt')) {
      fail('Unsafe level1 script path for ' + entry.id);
    }
    try {
      scriptsById[entry.id] = await readFile(absolute, 'utf8');
    } catch {
      fail('Missing level1 script file for ' + entry.id + ' (' + entry.file + ')');
    }
  }
  return validateLevel1Corpus({manifest, scriptsById});
}

/** Adapter for the existing offline scorer (src/core/stageCueQa.mjs). */
export function toStageCueGold(corpus) {
  if (corpus?.corpus !== 'RUNQ_LEVEL1_EVAL_CORPUS') fail('Invalid level1 corpus for scorer adapter');
  return {
    version: 1,
    provenance: corpus.provenance + '_HUMAN_REVIEW_STATUS_' + corpus.humanReviewStatus,
    cases: corpus.cases.map(item => ({
      id: item.id, type: item.type, documentKind: item.documentKind,
      scriptText: item.scriptText,
      expected: item.expected.map(event => ({...event})),
      forbiddenPlayLineIds: [...item.forbiddenPlayLineIds],
    })),
  };
}

export function summarizeLevel1Corpus(corpus) {
  if (corpus?.corpus !== 'RUNQ_LEVEL1_EVAL_CORPUS') fail('Invalid level1 corpus for summary');
  const languages = {};
  const pools = {};
  for (const item of corpus.cases) {
    languages[item.language] = (languages[item.language] ?? 0) + 1;
    pools[item.pool] = (pools[item.pool] ?? 0) + 1;
  }
  return {
    cases: corpus.cases.length,
    windows: corpus.cases.reduce((sum, item) => sum + item.sceneWindowCount, 0),
    scriptLines: corpus.cases.reduce((sum, item) => sum + item.lineCount, 0),
    expectedEvents: corpus.cases.reduce((sum, item) => sum + item.expected.length, 0),
    forbiddenPlayLines: corpus.cases.reduce((sum, item) => sum + item.forbiddenPlayLineIds.length, 0),
    languages, pools,
    humanReviewStatus: corpus.humanReviewStatus,
  };
}
