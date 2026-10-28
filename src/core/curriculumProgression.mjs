/**
 * Progressive theatrical curriculum evaluator (pure, deterministic, offline).
 *
 * Consumes already-scored stageCueQa reports (src/core/stageCueQa.mjs outputs)
 * plus provider response accounting and decides per-provider, per-level
 * qualification. Immutable rules:
 * - Strict in-order progression over six script-difficulty levels.
 * - Synthetic, generated, missing, incomplete or provisional-unreviewed
 *   evidence is INSUFFICIENT_EVIDENCE and is never treated as measured
 *   model quality.
 * - Critical errors (forbidden PLAY, fabricated source references,
 *   STOP/CONTINUE misclassification) block advancement regardless of F1.
 * - Level 6 is held out: report only; it never unlocks a level and must not
 *   feed tuning.
 * - TP/FP/FN are aggregated globally before computing F1; per-case F1 values
 *   are never averaged.
 * No provider calls, no credentials, no audio transport, no project mutations.
 */
import { parseScript } from './script.mjs';

const EPSILON = 1e-9;
const IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,80}$/;
const PROVIDER_ID = /^[A-Z][A-Z0-9_]{1,30}$/;
const ISSUE_LINE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const MAX_SCENARIOS_PER_LEVEL = 500;
const MAX_WINDOWS_PER_CASE = 512;
const MAX_REPORT_CASES = 1000;
const MAX_ISSUES_PER_CASE = 256;
const TRANSPORTS = new Set(['PLAY','STOP','CONTINUE','SILENCE']);
const QUALIFYING_EVIDENCE = 'MODEL_PROVIDER_RESPONSES';
const QUALIFYING_GOLD_REVIEW = 'HUMAN_REVIEWED';
const EVIDENCE_KINDS = new Set(['MODEL_PROVIDER_RESPONSES','SYNTHETIC_FIXTURE','GENERATED_DEMO','MISSING']);
const GOLD_REVIEW_STATUSES = new Set(['HUMAN_REVIEWED','PROVISIONAL_UNREVIEWED']);
const CASE_STATUSES = new Set(['COMPLETE','INCOMPLETE','FAILED','MISSING']);
const GATE_KINDS = new Set(['EXACT_CASES','F1_THRESHOLD','REPORT_ONLY']);
const POLICY_KEYS = ['progressionOrder','aggregation','evidencePolicy','criticalErrorPolicy','heldOutPolicy'];
const POLICY_VALUES = new Map([
  ['progressionOrder','STRICT_IN_ORDER'],
  ['aggregation','GLOBAL_TP_FP_FN_BEFORE_F1'],
  ['evidencePolicy','HUMAN_REVIEWED_PROVIDER_RESPONSES_ONLY'],
  ['criticalErrorPolicy','ANY_CRITICAL_ERROR_BLOCKS_ADVANCEMENT'],
  ['heldOutPolicy','LEVEL6_INDEPENDENT_REPORT_ONLY_NO_TUNING_NO_UNLOCK'],
]);
const REQUIRED_CRITICAL_CODES = new Set([
  'FORBIDDEN_PLAY','FABRICATED_SOURCE_REFERENCE','STOP_CONTINUE_MISCLASSIFICATION',
]);
const ISSUE_TYPES = new Set([
  'HALLUCINATED_SOURCE','FORBIDDEN_PLAY','DUPLICATE_EVENT','SEMANTIC_ALTERNATIVE_ACCEPTED',
  'SEMANTIC_ALTERNATIVE_REVIEW','WRONG_EVENT_TYPE','CREATIVE_REVIEW_REQUIRED',
  'UNSUPPORTED_EXPLICIT_CUE','MISSED_EXPECTED_EVENT',
]);
const SUMMARY_COUNT_KEYS = [
  'cases','expectedEvents','evaluatedPredictions','truePositives','falsePositives','falseNegatives',
  'invalidReferences','forbiddenPlay','duplicates','wrongAction','creativeAwaitingReview',
  'semanticAlternativesPending','semanticAlternativesApproved',
];
const NULL_METRICS = {expectedEvents:0,evaluatedPredictions:0,truePositives:0,falsePositives:0,falseNegatives:0,precision:0,recall:0,f1:0};
const NULL_CRITICAL = {total:0,forbiddenPlay:0,fabricatedSourceReferences:0,missedStopContinue:0};
const NULL_ADVISORY = {wrongAction:0,duplicates:0,creativeAwaitingReview:0,
  semanticAlternativesPending:0,semanticAlternativesApproved:0};

function isSafeIntGe0(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
function isUnitRate(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 + EPSILON;
}
function requireString(value, field, max) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.length > max) {
    throw new TypeError('Invalid ' + field);
  }
  return value;
}
function requireCount(value, field, max) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new TypeError('Invalid ' + field);
  return value;
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/** Validates and freezes an operator-defined curriculum manifest (configuration only). */
export function validateCurriculumManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) ||
      manifest.version !== 1) {
    throw new TypeError('Invalid curriculum manifest');
  }
  const curriculum = requireString(manifest.curriculum, 'curriculum', 120);
  requireString(manifest.provenance, 'manifest provenance', 200);
  requireString(manifest.purpose, 'manifest purpose', 800);
  if (manifest.manifestKind !== 'CONFIG_ONLY_CURRICULUM_DEFINITION' ||
      typeof manifest.policy !== 'object' || manifest.policy === null ||
      Array.isArray(manifest.policy)) {
    throw new TypeError('Curriculum manifest must be configuration only');
  }
  for (const key of POLICY_KEYS) {
    if (manifest.policy[key] !== POLICY_VALUES.get(key)) {
      throw new TypeError('Unsupported curriculum policy ' + key);
    }
  }
  if (!Array.isArray(manifest.providers) || manifest.providers.length < 1 ||
      manifest.providers.length > 4) {
    throw new TypeError('Invalid curriculum providers');
  }
  const providers = [];
  for (const provider of manifest.providers) {
    if (typeof provider !== 'string' || !PROVIDER_ID.test(provider) ||
        providers.includes(provider)) {
      throw new TypeError('Invalid curriculum provider id');
    }
    providers.push(provider);
  }
  const evidenceKinds = requireDescriptions(manifest.evidenceKinds, EVIDENCE_KINDS, 'evidenceKinds');
  const goldReviewStatuses = requireDescriptions(manifest.goldReviewStatuses, GOLD_REVIEW_STATUSES, 'goldReviewStatuses');
  const caseCompletionStatuses = requireDescriptions(manifest.caseCompletionStatuses, CASE_STATUSES, 'caseCompletionStatuses');
  if (!Array.isArray(manifest.criticalErrorCategories) ||
      manifest.criticalErrorCategories.length < 1 ||
      manifest.criticalErrorCategories.length > 12) {
    throw new TypeError('Invalid critical error categories');
  }
  const criticalCodes = new Set();
  for (const category of manifest.criticalErrorCategories) {
    if (!category || typeof category !== 'object' || Array.isArray(category) ||
        typeof category.code !== 'string' || !/^[A-Z][A-Z0-9_]{2,60}$/.test(category.code) ||
        typeof category.basis !== 'string' || category.basis.length < 10 ||
        category.basis.length > 400 || criticalCodes.has(category.code)) {
      throw new TypeError('Invalid critical error category');
    }
    criticalCodes.add(category.code);
  }
  for (const required of REQUIRED_CRITICAL_CODES) {
    if (!criticalCodes.has(required)) {
      throw new RangeError('Curriculum must declare ' + required + ' as a critical error category');
    }
  }
  if (!Array.isArray(manifest.levels) || manifest.levels.length !== 6) {
    throw new TypeError('Curriculum must define exactly six levels');
  }
  const levels = manifest.levels.map((level, index) => {
    if (!level || typeof level !== 'object' || Array.isArray(level)) {
      throw new TypeError('Invalid curriculum level');
    }
    if (level.level !== index + 1) {
      throw new TypeError('Curriculum levels must be 1..6 in order');
    }
    const focus = requireString(level.focus, 'level ' + level.level + ' focus', 240);
    const targetScenarioCount = requireCount(level.targetScenarioCount, 'level ' + level.level + ' targetScenarioCount', MAX_SCENARIOS_PER_LEVEL);
    if (typeof level.heldOut !== 'boolean') throw new TypeError('Invalid heldOut flag');
    if (!level.gate || typeof level.gate !== 'object' || Array.isArray(level.gate) ||
        !GATE_KINDS.has(level.gate.kind)) {
      throw new TypeError('Invalid level ' + level.level + ' gate');
    }
    let gate;
    if (level.gate.kind === 'EXACT_CASES') {
      const exactCasesRequired = requireCount(level.gate.exactCasesRequired, 'exactCasesRequired', targetScenarioCount);
      gate = {kind:'EXACT_CASES', exactCasesRequired};
    } else if (level.gate.kind === 'F1_THRESHOLD') {
      const minF1 = level.gate.minF1;
      if (typeof minF1 !== 'number' || !(minF1 > 0) || minF1 > 1) {
        throw new TypeError('Invalid minF1 threshold');
      }
      gate = {kind:'F1_THRESHOLD', minF1};
    } else {
      if (Object.keys(level.gate).some(key => key !== 'kind')) {
        throw new TypeError('REPORT_ONLY gate accepts no parameters');
      }
      gate = {kind:'REPORT_ONLY'};
    }
    if (level.heldOut !== (level.level === 6)) {
      throw new RangeError('Level 6 must be held out and levels 1..5 must not be');
    }
    if (level.heldOut !== (gate.kind === 'REPORT_ONLY')) {
      throw new RangeError('Held-out level must use REPORT_ONLY and vice versa');
    }
    return Object.freeze({level:level.level, name:typeof level.name==='string'?level.name:focus,
      focus, targetScenarioCount, gate, heldOut:level.heldOut});
  });
  return deepFreeze({
    version:1, curriculum, provenance:manifest.provenance, manifestKind:manifest.manifestKind,
    purpose:manifest.purpose,
    policy:Object.freeze({...manifest.policy}), providers:Object.freeze(providers),
    evidenceKinds, goldReviewStatuses, caseCompletionStatuses,
    criticalErrorCategories:Object.freeze(manifest.criticalErrorCategories.map(c => Object.freeze({...c}))),
    levels:Object.freeze(levels),
  });
}

function requireDescriptions(map, expectedKeys, field) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new TypeError('Invalid ' + field);
  const keys = Object.keys(map);
  const expectedArray = [...expectedKeys].sort();
  if (keys.length !== expectedKeys.size || [...keys].sort().join('|') !== expectedArray.join('|')) {
    throw new TypeError('Invalid ' + field);
  }
  const normalized = {};
  for (const key of expectedArray) {
    normalized[key] = requireString(map[key], field + '.' + key, 400);
  }
  return deepFreeze(normalized);
}

/** Validates one exact-tuple stageCueQa report without recomputing scores. */
function validateStageReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new TypeError('Invalid stage report');
  }
  if (report.mode !== 'OFFLINE_HUMAN_GOLD_COMPARISON') {
    throw new TypeError('Unsupported stage report mode');
  }
  if (report.modelQualityMeasured !== false) {
    throw new TypeError('Stage report must not claim measured model quality');
  }
  requireString(report.goldProvenance ?? '', 'goldProvenance', 200);
  requireString(report.predictionProvenance ?? '', 'predictionProvenance', 200);
  const summary = report.summary;
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new TypeError('Invalid stage report summary');
  }
  for (const key of SUMMARY_COUNT_KEYS) {
    if (!isSafeIntGe0(summary[key])) throw new TypeError('Invalid summary counter ' + key);
  }
  if (summary.cases < 1) throw new TypeError('Stage report has no cases');
  for (const key of ['precision','recall','f1']) {
    if (!isUnitRate(summary[key])) throw new TypeError('Invalid summary ' + key);
  }
  if (!Array.isArray(report.prioritizedCases) ||
      report.prioritizedCases.length !== summary.cases ||
      report.prioritizedCases.length > MAX_REPORT_CASES) {
    throw new TypeError('Invalid prioritized case list');
  }
  if (Array.isArray(report.warnings) && report.warnings.length > 24) {
    throw new TypeError('Too many stage report warnings');
  }
  const caseIds = new Set();
  for (const entry of report.prioritizedCases) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        typeof entry.id !== 'string' || !IDENTIFIER.test(entry.id) ||
        caseIds.has(entry.id) || !isSafeIntGe0(entry.expectedEvents) ||
        !isSafeIntGe0(entry.predictions) ||
        !isSafeIntGe0(entry.truePositives) || !isSafeIntGe0(entry.falsePositives) ||
        !isSafeIntGe0(entry.falseNegatives)) {
      throw new TypeError('Invalid prioritized case entry');
    }
    caseIds.add(entry.id);
    for (const key of SUMMARY_COUNT_KEYS) {
      if (key !== 'cases' && key !== 'expectedEvents' && key !== 'evaluatedPredictions' &&
          !isSafeIntGe0(entry[key])) {
        throw new TypeError('Invalid case counter ' + key);
      }
    }
    validateCaseIssues(entry);
  }
  for (const key of SUMMARY_COUNT_KEYS) {
    if (key === 'cases') continue;
    if (key === 'expectedEvents' || key === 'evaluatedPredictions') continue;
    const total = report.prioritizedCases.reduce((sum, entry) => sum + entry[key], 0);
    if (total !== summary[key]) {
      throw new RangeError('Stage report summary inconsistent for ' + key);
    }
  }
  const expectedTotal = report.prioritizedCases.reduce((sum, entry) => sum + entry.expectedEvents, 0);
  if (expectedTotal !== summary.expectedEvents) {
    throw new RangeError('Stage report expectedEvents total inconsistent');
  }
  return deepFreeze(report);
}

function validateCaseIssues(entry) {
  if (!Array.isArray(entry.issues) || entry.issues.length > MAX_ISSUES_PER_CASE) {
    throw new TypeError('Invalid case issues');
  }
  let missedStopContinue = 0, missed = 0, forbidden = 0, fabricated = 0, duplicates = 0;
  for (const issue of entry.issues) {
    if (!issue || typeof issue !== 'object' || Array.isArray(issue) ||
        typeof issue.type !== 'string' || !ISSUE_TYPES.has(issue.type) ||
        typeof issue.lineId !== 'string' || !ISSUE_LINE_ID.test(issue.lineId)) {
      throw new TypeError('Invalid stage report issue');
    }
    if (issue.transport !== undefined &&
        (typeof issue.transport !== 'string' || !TRANSPORTS.has(issue.transport))) {
      throw new TypeError('Invalid issue transport');
    }
    if (issue.type === 'MISSED_EXPECTED_EVENT') {
      if (typeof issue.transport !== 'string' || !TRANSPORTS.has(issue.transport)) {
        throw new RangeError('MISSED_EXPECTED_EVENT issue lacks a transport');
      }
      if (issue.transport === 'STOP' || issue.transport === 'CONTINUE') missedStopContinue++;
      missed++;
    } else if (issue.type === 'FORBIDDEN_PLAY') forbidden++;
    else if (issue.type === 'HALLUCINATED_SOURCE') fabricated++;
    else if (issue.type === 'DUPLICATE_EVENT') duplicates++;
  }
  if (missed !== entry.falseNegatives || forbidden !== entry.forbiddenPlay ||
      fabricated !== entry.invalidReferences || duplicates !== entry.duplicates) {
    throw new RangeError('Stage report issues inconsistent with case counters');
  }
  return missedStopContinue;
}

/**
 * Validates the provider evidence input for a curriculum evaluation.
 * Structure: {version, provenance, levels:[{level, providers:[{provider,
 * evidenceKind, goldReviewStatus, predictionProvenance?, cases:[{id,
 * sceneWindowCount, completedWindows, status}], report?}]}]}.
 * Returns a frozen normalized lookup, or throws TypeError/RangeError.
 */
export function validateProgressionInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== 1) {
    throw new TypeError('Invalid progression input');
  }
  requireString(input.provenance, 'input provenance', 200);
  if (!Array.isArray(input.levels) || input.levels.length > 6) {
    throw new TypeError('Invalid progression levels');
  }
  const byLevel = {};
  for (const levelEntry of input.levels) {
    if (!levelEntry || typeof levelEntry !== 'object' || Array.isArray(levelEntry) ||
        !Number.isSafeInteger(levelEntry.level) || levelEntry.level < 1 ||
        levelEntry.level > 6 || byLevel[levelEntry.level] !== undefined) {
      throw new TypeError('Invalid progression level entry');
    }
    if (!Array.isArray(levelEntry.providers) || levelEntry.providers.length < 1 ||
        levelEntry.providers.length > 4) {
      throw new TypeError('Invalid progression providers');
    }
    byLevel[levelEntry.level] = {};
    for (const entry of levelEntry.providers) {
      byLevel[levelEntry.level][requireProviderKey(entry)] = deepFreeze(requireProviderEntry(entry));
    }
  }
  withholdDuplicateScenariosAcrossLevels(byLevel);
  return deepFreeze({version:1, provenance:input.provenance, levels:byLevel});
}

function requireProviderKey(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
      typeof entry.provider !== 'string' || !PROVIDER_ID.test(entry.provider)) {
    throw new TypeError('Invalid progression provider');
  }
  return entry.provider;
}

function requireProviderEntry(entry) {
  const provider = entry.provider;
  if (!EVIDENCE_KINDS.has(entry.evidenceKind)) {
    throw new TypeError('Invalid evidenceKind for ' + provider);
  }
  if (!GOLD_REVIEW_STATUSES.has(entry.goldReviewStatus)) {
    throw new TypeError('Invalid goldReviewStatus for ' + provider);
  }
  const predictionProvenance = entry.predictionProvenance === undefined ||
    entry.predictionProvenance === null ?
    null : requireString(entry.predictionProvenance, 'predictionProvenance', 200);
  if (!Array.isArray(entry.cases) || entry.cases.length < 1 ||
      entry.cases.length > MAX_SCENARIOS_PER_LEVEL) {
    throw new TypeError('Invalid scenario accounting for ' + provider);
  }
  const cases = [];
  const ids = new Set();
  for (const accounting of entry.cases) {
    if (!accounting || typeof accounting !== 'object' || Array.isArray(accounting) ||
        typeof accounting.id !== 'string' || !IDENTIFIER.test(accounting.id) ||
        ids.has(accounting.id) ||
        !Number.isSafeInteger(accounting.sceneWindowCount) ||
        accounting.sceneWindowCount < 1 || accounting.sceneWindowCount > MAX_WINDOWS_PER_CASE) {
      throw new TypeError('Invalid scenario accounting entry');
    }
    ids.add(accounting.id);
    if (!Number.isSafeInteger(accounting.completedWindows) ||
        accounting.completedWindows < 0 ||
        accounting.completedWindows > accounting.sceneWindowCount ||
        !CASE_STATUSES.has(accounting.status)) {
      throw new RangeError('Invalid window accounting for ' + accounting.id);
    }
    if ((accounting.status === 'COMPLETE') !==
        (accounting.completedWindows === accounting.sceneWindowCount)) {
      throw new RangeError('COMPLETE scenario must have every scene window answered');
    }
    if (accounting.status === 'MISSING' && accounting.completedWindows !== 0) {
      throw new RangeError('MISSING scenario cannot have answered windows');
    }
    cases.push(Object.freeze({id:accounting.id, status:accounting.status,
      sceneWindowCount:accounting.sceneWindowCount, completedWindows:accounting.completedWindows}));
  }
  const completeCases = cases.filter(item => item.status === 'COMPLETE');
  const hasReport = entry.report !== undefined && entry.report !== null;
  if (hasReport && completeCases.length === 0) {
    throw new RangeError('Report supplied without any COMPLETE scenario');
  }
  if (!hasReport && completeCases.length > 0) {
    throw new RangeError('COMPLETE scenarios require a scored stage report');
  }
  if (hasReport) {
    const report = validateStageReport(entry.report);
    const accounted = new Set(completeCases.map(item => item.id));
    if (report.prioritizedCases.length !== completeCases.length) {
      throw new RangeError('Report case count must match COMPLETE scenarios');
    }
    for (const scored of report.prioritizedCases) {
      if (!accounted.has(scored.id) || accounted.size < 1) {
        throw new RangeError('Report scored scenario ' + scored.id + ' outside accounting');
      }
    }
    return Object.freeze({provider, evidenceKind:entry.evidenceKind,
      goldReviewStatus:entry.goldReviewStatus, predictionProvenance,
      cases:Object.freeze(cases), report});
  }
  return Object.freeze({provider, evidenceKind:entry.evidenceKind,
    goldReviewStatus:entry.goldReviewStatus, predictionProvenance,
    cases:Object.freeze(cases), report:null});
}

function withholdDuplicateScenariosAcrossLevels(byLevel) {
  const heldOutIds = new Set();
  const tuningIds = new Set();
  for (const [level, providers] of Object.entries(byLevel)) {
    for (const entry of Object.values(providers)) {
      for (const item of entry.cases) {
        if (Number(level) === 6) heldOutIds.add(item.id);
        else tuningIds.add(item.id);
      }
    }
  }
  for (const id of heldOutIds) {
    if (tuningIds.has(id)) {
      throw new RangeError('Held-out scenario ' + id + ' reused in a tuning level');
    }
  }
}

/**
 * Pure progression decision: curriculum manifest + validated evidence input
 * -> per-provider per-level qualification with rollups. Throws RangeError on
 * held-out leakage; TypeError on invalid structures.
 */
export function evaluateProgression(manifest, input) {
  const curriculum = validateCurriculumManifest(manifest);
  const evidence = validateProgressionInput(input);
  const lookup = evidence.levels;
  for (const level of Object.keys(lookup)) {
    for (const provider of Object.keys(lookup[level])) {
      if (!curriculum.providers.includes(provider)) {
        throw new TypeError('Unknown provider ' + provider + ' in curriculum');
      }
    }
  }
  const result = {
    kind:'RUNQ_PROGRESSIVE_CURRICULUM_EVALUATION',
    curriculumVersion:1,
    curriculum:curriculum.curriculum,
    policy:Object.freeze({...curriculum.policy}),
    measuredModelQuality:false,
    providers:Object.fromEntries(curriculum.providers.map(name => [name, {}])),
    levels:{},
    overall:{},
  };
  const statusesByProvider = Object.fromEntries(curriculum.providers.map(name => [name, {}]));
  for (const level of curriculum.levels) {
    const levelStatuses = {};
    const providers = {};
    for (const provider of curriculum.providers) {
      const qualification = evaluateProviderLevel(level, provider, lookup[level.level]?.[provider] ?? null);
      providers[provider] = qualification;
      levelStatuses[provider] = qualification.status;
    }
    result.levels[String(level.level)] = Object.freeze({
      level:level.level, name:level.name, focus:level.focus,
      targetScenarioCount:level.targetScenarioCount, heldOut:level.heldOut,
      gate:level.gate, providers:Object.freeze(providers),
    });
    for (const provider of curriculum.providers) {
      statusesByProvider[provider][level.level] = levelStatuses[provider];
    }
  }
  for (const provider of curriculum.providers) {
    result.providers[provider] = providerRollup(provider, statusesByProvider[provider], curriculum);
  }
  result.overall = overallRollup(result.providers);
  return deepFreeze(result);
}

function emptyQualification(level, provider) {
  return {
    level:level.level, provider,
    status:'INSUFFICIENT_EVIDENCE', reason:'NO_VALIDATED_EVIDENCE_SUPPLIED',
    gate:{...level.gate}, heldOut:level.heldOut,
    evidence:{kind:null, goldReviewStatus:null, predictionProvenance:null},
    coverage:{scenarios:0, targetScenarioCount:level.targetScenarioCount},
    cases:{complete:0, incomplete:0, total:0},
    sceneWindows:{total:0, complete:0},
    metrics:{...NULL_METRICS},
    exactCasesCorrect:null,
    criticalErrors:{...NULL_CRITICAL},
    advisory:{...NULL_ADVISORY},
  };
}

function evaluateProviderLevel(level, provider, entry) {
  const qualification = emptyQualification(level, provider);
  if (!entry) return deepFreeze(qualification);
  qualification.evidence = {kind:entry.evidenceKind, goldReviewStatus:entry.goldReviewStatus,
    predictionProvenance:entry.predictionProvenance};
  qualification.coverage.scenarios = entry.cases.length;
  qualification.cases.total = entry.cases.length;
  qualification.cases.complete = entry.cases.filter(item => item.status === 'COMPLETE').length;
  qualification.cases.incomplete = entry.cases.length - qualification.cases.complete;
  qualification.sceneWindows.total = entry.cases.reduce((sum, item) => sum + item.sceneWindowCount, 0);
  qualification.sceneWindows.complete = entry.cases.reduce((sum, item) => sum + item.completedWindows, 0);
  if (entry.report) collectMetrics(qualification, entry.report);
  if (qualification.evidence.kind !== QUALIFYING_EVIDENCE) {
    qualification.reason = 'NON_PROVIDER_EVIDENCE';
    return deepFreeze(qualification);
  }
  if (qualification.evidence.goldReviewStatus !== QUALIFYING_GOLD_REVIEW) {
    qualification.reason = 'GOLD_NOT_HUMAN_REVIEWED';
    return deepFreeze(qualification);
  }
  if (qualification.coverage.scenarios < qualification.coverage.targetScenarioCount) {
    qualification.reason = 'SCENARIO_COVERAGE_BELOW_TARGET';
    return deepFreeze(qualification);
  }
  if (qualification.cases.incomplete > 0 ||
      qualification.sceneWindows.complete !== qualification.sceneWindows.total) {
    qualification.reason = 'INCOMPLETE_PROVIDER_RESULTS';
    return deepFreeze(qualification);
  }
  if (qualification.criticalErrors.total > 0) {
    qualification.status = 'FAIL';
    qualification.reason = 'CRITICAL_ERRORS_BLOCK_ADVANCEMENT';
    return deepFreeze(qualification);
  }
  if (level.gate.kind === 'EXACT_CASES') {
    if (qualification.exactCasesCorrect < level.gate.exactCasesRequired) {
      qualification.status = 'FAIL';
      qualification.reason = 'EXACT_CASES_BELOW_TARGET';
      return deepFreeze(qualification);
    }
  } else if (level.gate.kind === 'F1_THRESHOLD') {
    if (qualification.metrics.f1 < level.gate.minF1 - EPSILON) {
      qualification.status = 'FAIL';
      qualification.reason = 'F1_BELOW_THRESHOLD';
      return deepFreeze(qualification);
    }
  }
  qualification.status = 'PASS';
  qualification.reason = level.heldOut ?
    'HELD_OUT_REPORT_ONLY_ALL_GATES_PASSED' : 'ALL_GATES_PASSED';
  return deepFreeze(qualification);
}

function collectMetrics(qualification, report) {
  const summary = report.summary;
  qualification.metrics = {
    expectedEvents:summary.expectedEvents,
    evaluatedPredictions:summary.evaluatedPredictions,
    truePositives:summary.truePositives,
    falsePositives:summary.falsePositives,
    falseNegatives:summary.falseNegatives,
    precision:aggregatePrecision(summary.truePositives, summary.evaluatedPredictions, summary.expectedEvents),
    recall:aggregateRecall(summary.truePositives, summary.expectedEvents),
  };
  qualification.metrics.f1 = harmonicMean(qualification.metrics.precision, qualification.metrics.recall);
  qualification.criticalErrors = {
    forbiddenPlay:summary.forbiddenPlay,
    fabricatedSourceReferences:summary.invalidReferences,
    missedStopContinue:countMissedStopContinue(report),
  };
  qualification.criticalErrors.total = qualification.criticalErrors.forbiddenPlay +
    qualification.criticalErrors.fabricatedSourceReferences +
    qualification.criticalErrors.missedStopContinue;
  qualification.advisory = {
    wrongAction:summary.wrongAction,
    duplicates:summary.duplicates,
    creativeAwaitingReview:summary.creativeAwaitingReview,
    semanticAlternativesPending:summary.semanticAlternativesPending,
    semanticAlternativesApproved:summary.semanticAlternativesApproved,
  };
  qualification.exactCasesCorrect = report.prioritizedCases.filter(isCaseExact).length;
}

function isCaseExact(entry) {
  return entry.falsePositives === 0 && entry.falseNegatives === 0 &&
    entry.creativeAwaitingReview === 0 && entry.truePositives === entry.expectedEvents &&
    entry.expectedEvents > 0;
}

function countMissedStopContinue(report) {
  return report.prioritizedCases.reduce((sum, entry) =>
    sum + entry.issues.reduce((n, issue) =>
      n + (issue.type === 'MISSED_EXPECTED_EVENT' &&
        (issue.transport === 'STOP' || issue.transport === 'CONTINUE') ? 1 : 0), 0), 0);
}

function aggregatePrecision(truePositives, evaluatedPredictions, expectedEvents) {
  if (evaluatedPredictions === 0) return expectedEvents === 0 ? 1 : 0;
  return truePositives / evaluatedPredictions;
}
function aggregateRecall(truePositives, expectedEvents) {
  if (expectedEvents === 0) return 1;
  return truePositives / expectedEvents;
}
function harmonicMean(precision, recall) {
  if (precision + recall === 0) return 0;
  return 2 * precision * recall / (precision + recall);
}

function providerRollup(provider, statuses, curriculum) {
  let currentLevel = null;
  for (const level of curriculum.levels) {
    if (statuses[level.level] !== 'PASS') {
      currentLevel = level.level;
      break;
    }
  }
  if (currentLevel === null) {
    return {provider, currentLevel:6, nextEligibleLevel:null,
      progressionComplete:true, statuses:Object.freeze({...statuses})};
  }
  return {provider, currentLevel, nextEligibleLevel:currentLevel,
    progressionComplete:false, statuses:Object.freeze({...statuses})};
}

function overallRollup(providers) {
  const rollups = Object.values(providers);
  const current = Math.min(...rollups.map(item => item.currentLevel));
  const eligible = rollups.map(item => item.nextEligibleLevel).filter(level => level !== null);
  return {
    currentLevel:current,
    nextEligibleLevel:eligible.length ? Math.min(...eligible) : null,
    progressionComplete:rollups.every(item => item.progressionComplete),
  };
}
