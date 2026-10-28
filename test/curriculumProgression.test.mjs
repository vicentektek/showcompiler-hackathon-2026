import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateCurriculumManifest,
  validateProgressionInput,
  evaluateProgression,
} from '../src/core/curriculumProgression.mjs';
import { evaluateStageEventCases } from '../src/core/stageCueQa.mjs';
import { renderCurriculumPlanText, runCurriculumPlan } from '../tools/curriculumPlan.mjs';

const manifestPath = 'fixtures/qa/curriculum-v1.json';
const baseManifest = validateCurriculumManifest(
  JSON.parse(readFileSync(manifestPath, 'utf8')));

const PLAY_MUSIC = {lineId:'L2', transport:'PLAY', cueKind:'MUSIC', basis:'EXPLICIT'};
const STOP_MUSIC_L5 = {lineId:'L5', transport:'STOP', cueKind:'MUSIC', basis:'EXPLICIT'};

function scriptWithLines(count) {
  return Array.from({length:count}, (_, index) => 'Line ' + (index + 1) + '.').join('\n');
}

function scenarioScoring({id, expected, predictions, forbidden = []}) {
  return {id, scriptText:scriptWithLines(9), expected, forbiddenPlayLineIds:forbidden};
}

function buildReport(scored) {
  const gold = {
    version:1,
    provenance:'TEST_FIXED_HUMAN_REVIEWED_GOLD',
    cases:scored.map(item => scenarioScoring(item)),
  };
  const predictions = {
    version:1,
    provenance:'TEST_DECLARED_PROVIDER_RESPONSES',
    predictionsByCase:Object.fromEntries(scored.map(item => [item.id, item.predictions ?? []])),
  };
  return evaluateStageEventCases(gold, predictions);
}

function accountingList({count, prefix, windows = 2, incompleteIndex = -1, completedWindows = null}) {
  return Array.from({length:count}, (_, index) => {
    const incomplete = index === incompleteIndex;
    const sceneWindowCount = incomplete ? 3 : windows;
    return {
      id:prefix + '-' + String(index + 1).padStart(2, '0'),
      sceneWindowCount,
      completedWindows:incomplete ? (completedWindows ?? 2) : sceneWindowCount,
      status:incomplete ? 'INCOMPLETE' : 'COMPLETE',
    };
  });
}

function exactScenarios({count, prefix, withStop = false, forbids = true}) {
  return Array.from({length:count}, (_, index) => {
    const id = prefix + '-' + String(index + 1).padStart(2, '0');
    const expected = withStop ? [PLAY_MUSIC, STOP_MUSIC_L5] : [PLAY_MUSIC];
    return {id, expected, predictions:expected, forbidden:forbids ? ['L6', 'L8'] : []};
  });
}

function providerEntry({provider = 'META', evidenceKind = 'MODEL_PROVIDER_RESPONSES',
  goldReviewStatus = 'HUMAN_REVIEWED', cases, report = null, scored = null}) {
  return {
    provider, evidenceKind, goldReviewStatus,
    predictionProvenance:'TEST_LAB_RUN_DECLARED',
    cases,
    report:report ?? (scored ? buildReport(scored) : null),
  };
}

function levelInput(level, provider, scenarios, accounting) {
  const report = buildReport(scenarios);
  return {
    version:1,
    provenance:'TEST_VALIDATED_PROVIDER_EVIDENCE',
    levels:[{level, providers:[providerEntry({provider, cases:accounting, report})]}],
  };
}

function tamperManifest(mutate) {
  const copy = JSON.parse(readFileSync(manifestPath, 'utf8'));
  mutate(copy);
  return () => validateCurriculumManifest(copy);
}

test('curriculum manifest validates and rejects tampering', () => {
  assert.equal(baseManifest.levels.length, 6);
  assert.equal(baseManifest.levels[5].heldOut, true);
  assert.equal(baseManifest.levels[5].gate.kind, 'REPORT_ONLY');
  assert.throws(tamperManifest(m => { m.version = 2; }), TypeError);
  assert.throws(tamperManifest(m => { m.levels = m.levels.slice(0, 5); }), TypeError);
  assert.throws(tamperManifest(m => { m.levels[5].heldOut = false; }), RangeError);
  assert.throws(tamperManifest(m => { m.levels[1].gate.minF1 = 1.5; }), TypeError);
  assert.throws(tamperManifest(m => {
    m.criticalErrorCategories = m.criticalErrorCategories.filter(c => c.code !== 'STOP_CONTINUE_MISCLASSIFICATION');
  }), RangeError);
  assert.throws(tamperManifest(m => { m.policy.progressionOrder = 'ANY_ORDER'; }), TypeError);
});

test('successful qualification passes level 1 for a provider and leaves others untouched', () => {
  const objects = accountingList({count:10, prefix:'l1-scen'});
  const scored = exactScenarios({count:10, prefix:'l1-scen'});
  const result = evaluateProgression(baseManifest, levelInput(1, 'META', scored, objects));
  const meta = result.levels['1'].providers.META;
  assert.equal(meta.status, 'PASS');
  assert.equal(meta.reason, 'ALL_GATES_PASSED');
  assert.equal(meta.exactCasesCorrect, 10);
  assert.equal(meta.metrics.truePositives, 10);
  assert.equal(meta.metrics.f1, 1);
  assert.equal(meta.sceneWindows.total, 20);
  assert.equal(baseManifest.providers.includes('BASETEN'), true);
  assert.equal(result.levels['1'].providers.BASETEN.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(result.levels['1'].providers.BASETEN.reason, 'NO_VALIDATED_EVIDENCE_SUPPLIED');
  assert.equal(result.providers.META.currentLevel, 2);
  assert.equal(result.providers.META.nextEligibleLevel, 2);
  assert.equal(result.overall.currentLevel, 1);
  assert.equal(result.overall.nextEligibleLevel, 1);
  const text = renderCurriculumPlanText(result, null);
  assert.match(text, /ALL_GATES_PASSED/);
  assert.match(text, /current level 2/);
});

test('insufficient scenario coverage stays INSUFFICIENT_EVIDENCE', () => {
  const objects = accountingList({count:9, prefix:'l1-scen'});
  const scored = exactScenarios({count:9, prefix:'l1-scen'});
  const result = evaluateProgression(baseManifest, levelInput(1, 'META', scored, objects));
  const meta = result.levels['1'].providers.META;
  assert.equal(meta.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(meta.reason, 'SCENARIO_COVERAGE_BELOW_TARGET');
  assert.equal(meta.coverage.scenarios, 9);
  assert.equal(meta.coverage.targetScenarioCount, 10);
  assert.equal(result.providers.META.currentLevel, 1);
});

test('incomplete provider results exclude the scenario from scoring', () => {
  const objects = [
    ...accountingList({count:9, prefix:'l1-scen'}),
    {id:'l1-scen-10', sceneWindowCount:3, completedWindows:2, status:'INCOMPLETE'},
  ];
  const complete = exactScenarios({count:9, prefix:'l1-scen'});
  const result = evaluateProgression(baseManifest, levelInput(1, 'META', complete, objects));
  const meta = result.levels['1'].providers.META;
  assert.equal(meta.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(meta.reason, 'INCOMPLETE_PROVIDER_RESULTS');
  assert.equal(meta.cases.complete, 9);
  assert.equal(meta.cases.incomplete, 1);
  assert.equal(meta.sceneWindows.complete, 20);
  assert.equal(meta.sceneWindows.total, 21);
  assert.equal(meta.metrics.expectedEvents, 9);
  assert.equal(meta.metrics.truePositives, 9);
});

test('synthetic, generated and missing evidence never qualifies', () => {
  for (const evidenceKind of ['SYNTHETIC_FIXTURE', 'GENERATED_DEMO', 'MISSING']) {
    const objects = accountingList({count:10, prefix:'l1-scen'});
    const scored = exactScenarios({count:10, prefix:'l1-scen'});
    const input = {
      version:1,
      provenance:'TEST_UNITS',
      levels:[{level:1, providers:[providerEntry({evidenceKind, cases:objects, scored})]}],
    };
    const result = evaluateProgression(baseManifest, input);
    const meta = result.levels['1'].providers.META;
    assert.equal(meta.status, 'INSUFFICIENT_EVIDENCE');
    assert.equal(meta.reason, 'NON_PROVIDER_EVIDENCE');
    assert.equal(meta.metrics.f1, 1);
    assert.equal(result.measuredModelQuality, false);
  }
});

test('critical errors block advancement even with F1 above the threshold', () => {
  const poisoned = {
    id:'l2-scen-20',
    scriptText:scriptWithLines(9),
    expected:[PLAY_MUSIC, STOP_MUSIC_L5],
    predictions:[PLAY_MUSIC, {lineId:'L6', transport:'PLAY', cueKind:'MUSIC', basis:'EXPLICIT'}],
    forbidden:['L6'],
  };
  const scoring = [
    ...exactScenarios({count:19, prefix:'l2-scen'}),
    poisoned,
  ];
  const objects = accountingList({count:20, prefix:'l2-scen'});
  const result = evaluateProgression(baseManifest, levelInput(2, 'META', scoring, objects));
  const meta = result.levels['2'].providers.META;
  assert.equal(meta.criticalErrors.forbiddenPlay, 1);
  assert.ok(meta.metrics.f1 >= 0.95, 'F1 alone would pass: ' + meta.metrics.f1);
  assert.equal(meta.status, 'FAIL');
  assert.equal(meta.reason, 'CRITICAL_ERRORS_BLOCK_ADVANCEMENT');
});

test('fabricated source references are critical errors', () => {
  const poisoned = {
    id:'l2-scen-20',
    scriptText:scriptWithLines(9),
    expected:[PLAY_MUSIC],
    predictions:[PLAY_MUSIC, {lineId:'L99', transport:'PLAY', cueKind:'MUSIC', basis:'EXPLICIT'}],
    forbiddenPlayLineIds:['L6'],
  };
  const scoring = [...exactScenarios({count:19, prefix:'l2-scen'}), poisoned];
  const objects = accountingList({count:20, prefix:'l2-scen'});
  const result = evaluateProgression(baseManifest, levelInput(2, 'META', scoring, objects));
  const meta = result.levels['2'].providers.META;
  assert.equal(meta.criticalErrors.fabricatedSourceReferences, 1);
  assert.equal(meta.status, 'FAIL');
  assert.equal(meta.reason, 'CRITICAL_ERRORS_BLOCK_ADVANCEMENT');
});

test('STOP and CONTINUE misclassification is a critical error', () => {
  const poisoned = {
    id:'l2-scen-20',
    scriptText:scriptWithLines(9),
    expected:[PLAY_MUSIC, STOP_MUSIC_L5],
    predictions:[PLAY_MUSIC],
    forbiddenPlayLineIds:['L6'],
  };
  const scoring = [...exactScenarios({count:19, prefix:'l2-scen'}), poisoned];
  const objects = accountingList({count:20, prefix:'l2-scen'});
  const result = evaluateProgression(baseManifest, levelInput(2, 'META', scoring, objects));
  const meta = result.levels['2'].providers.META;
  assert.equal(meta.criticalErrors.missedStopContinue, 1);
  assert.ok(meta.metrics.f1 >= 0.95);
  assert.equal(meta.status, 'FAIL');
  assert.equal(meta.reason, 'CRITICAL_ERRORS_BLOCK_ADVANCEMENT');
});

test('F1 aggregates global TP/FP/FN instead of averaging case F1', () => {
  const scoring = [
    {
      id:'l2-scen-01',
      scriptText:scriptWithLines(9),
      expected:[PLAY_MUSIC, {lineId:'L3', transport:'PLAY', cueKind:'FX', basis:'EXPLICIT'}, STOP_MUSIC_L5],
      predictions:[PLAY_MUSIC, {lineId:'L3', transport:'PLAY', cueKind:'FX', basis:'EXPLICIT'},
        STOP_MUSIC_L5, {lineId:'L7', transport:'PLAY', cueKind:'AMBIENCE', basis:'EXPLICIT'}],
      forbiddenPlayLineIds:['L6'],
    },
    {
      id:'l2-scen-02',
      scriptText:scriptWithLines(9),
      expected:[PLAY_MUSIC,
        {lineId:'L3', transport:'CONTINUE', cueKind:'FX', basis:'EXPLICIT'}, STOP_MUSIC_L5],
      predictions:[{lineId:'L2', transport:'STOP', cueKind:'FX', basis:'EXPLICIT'}],
      forbiddenPlayLineIds:['L6'],
    },
  ];
  const objects = accountingList({count:2, prefix:'l2-scen'});
  const result = evaluateProgression(baseManifest, levelInput(2, 'META', scoring, objects));
  const meta = result.levels['2'].providers.META;
  assert.equal(meta.metrics.truePositives, 3);
  assert.equal(meta.metrics.falsePositives, 2);
  assert.equal(meta.metrics.falseNegatives, 3);
  assert.equal(meta.metrics.expectedEvents, 6);
  assert.equal(meta.metrics.evaluatedPredictions, 5);
  const expectedF1 = 2 * (3 / 5) * (3 / 6) / ((3 / 5) + (3 / 6));
  assert.equal(meta.metrics.f1, expectedF1);
  const caseFx = 2 * (3 / 4) * 1 / ((3 / 4) + 1);
  const averaged = (caseFx + 0) / 2;
  assert.ok(Math.abs(meta.metrics.f1 - averaged) > 0.1);
  assert.equal(meta.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(meta.reason, 'SCENARIO_COVERAGE_BELOW_TARGET');
});

test('provider statuses stay independent at the same level', () => {
  const objects = accountingList({count:10, prefix:'l1-scen'});
  const scored = exactScenarios({count:10, prefix:'l1-scen'});
  const input = {
    version:1,
    provenance:'TEST_VALIDATED',
    levels:[{level:1, providers:[
      providerEntry({cases:objects, scored}),
      providerEntry({provider:'BASETEN', evidenceKind:'SYNTHETIC_FIXTURE', cases:objects, scored}),
    ]}],
  };
  const result = evaluateProgression(baseManifest, input);
  const meta = result.levels['1'].providers.META;
  const baseten = result.levels['1'].providers.BASETEN;
  assert.equal(meta.status, 'PASS');
  assert.equal(baseten.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(baseten.reason, 'NON_PROVIDER_EVIDENCE');
  assert.equal(result.providers.META.currentLevel, 2);
  assert.equal(result.providers.BASETEN.currentLevel, 1);
  assert.equal(result.overall.currentLevel, 1);
});

test('held-out scenarios cannot leak into tuning levels', () => {
  const tuning = [...accountingList({count:19, prefix:'l5-scen'}),
    {id:'shared-01', sceneWindowCount:2, completedWindows:2, status:'COMPLETE'}];
  const heldOut = accountingList({count:1, prefix:'shared'});
  const input = {
    version:1,
    provenance:'TEST_VALIDATED',
    levels:[
      {level:5, providers:[providerEntry({cases:tuning,
        scored:[...exactScenarios({count:19, prefix:'l5-scen'}),
          scenarioScoring({id:'shared-01', expected:[PLAY_MUSIC], predictions:[PLAY_MUSIC],
            forbidden:['L6', 'L8']})]})]},
      {level:6, providers:[providerEntry({cases:heldOut,
        scored:[scenarioScoring({id:'shared-01', expected:[PLAY_MUSIC], predictions:[PLAY_MUSIC], forbidden:['L6', 'L8']})]})]},
    ],
  };
  assert.throws(() => validateProgressionInput(input), /held.out/i);
});

test('level 6 is report only and never unlocks progression', () => {
  const failing = Array.from({length:20}, (_, index) => ({
    id:'l6-scen-' + String(index + 1).padStart(2, '0'),
    scriptText:scriptWithLines(9),
    expected:[PLAY_MUSIC],
    predictions:[{lineId:'L3', transport:'PLAY', cueKind:'FX', basis:'EXPLICIT'}],
    forbiddenPlayLineIds:['L6', 'L8'],
  }));
  const objects = accountingList({count:20, prefix:'l6-scen'});
  const result = evaluateProgression(baseManifest, levelInput(6, 'META', failing, objects));
  const meta = result.levels['6'].providers.META;
  assert.equal(meta.status, 'PASS');
  assert.equal(meta.reason, 'HELD_OUT_REPORT_ONLY_ALL_GATES_PASSED');
  assert.equal(meta.metrics.f1, 0);
  assert.equal(result.levels['6'].heldOut, true);
  assert.equal(result.providers.META.currentLevel, 1);
  assert.equal(result.providers.META.nextEligibleLevel, 1);
});

test('full chain completes only in exact order and never goes past level 6', () => {
  const targets = [10, 15, 20, 20, 15, 20];
  const levels = baseManifest.levels.map(level => {
    const objects = accountingList({count:targets[level.level - 1], prefix:'l' + level.level + '-scen', windows:level.level === 6 ? 3 : 2});
    const scored = exactScenarios({count:targets[level.level - 1], prefix:'l' + level.level + '-scen'});
    return {level:level.level, providers:[providerEntry({cases:objects, scored})]};
  });
  const result = evaluateProgression(baseManifest, {version:1, provenance:'TEST_VALIDATED', levels});
  const meta = result.providers.META;
  for (const levelIndex of ['1', '2', '3', '4', '5']) {
    assert.equal(result.levels[levelIndex].providers.META.status, 'PASS');
  }
  assert.equal(result.levels['6'].providers.META.status, 'PASS');
  assert.equal(meta.progressionComplete, true);
  assert.equal(meta.nextEligibleLevel, null);
  assert.equal(meta.currentLevel, 6);
  assert.equal(result.overall.progressionComplete, false);
  assert.equal(result.overall.currentLevel, 1);
  assert.equal(result.providers.BASETEN.progressionComplete, false);
  const text = renderCurriculumPlanText(result, null);
  assert.match(text, /held out/i);
});

test('multi-window scenarios account for every scene window', () => {
  const passing = exactScenarios({count:15, prefix:'l2-scen'});
  const objects = accountingList({count:15, prefix:'l2-scen', windows:3});
  const result = evaluateProgression(baseManifest, levelInput(2, 'META', passing, objects));
  const meta = result.levels['2'].providers.META;
  assert.equal(meta.sceneWindows.total, 45);
  assert.equal(meta.sceneWindows.complete, 45);
  assert.equal(meta.status, 'PASS');
  const partial = accountingList({count:15, prefix:'l2-scen', windows:3, incompleteIndex:14, completedWindows:2});
  const blocked = evaluateProgression(baseManifest,
    levelInput(2, 'META', exactScenarios({count:14, prefix:'l2-scen'}), partial));
  assert.equal(blocked.levels['2'].providers.META.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(blocked.levels['2'].providers.META.reason, 'INCOMPLETE_PROVIDER_RESULTS');
  assert.equal(blocked.levels['2'].providers.META.sceneWindows.complete, 44);
});

test('progression input rejects malformed provider evidence', () => {
  const objects = accountingList({count:10, prefix:'l1-scen'});
  const scored = exactScenarios({count:10, prefix:'l1-scen'});
  const base = () => levelInput(1, 'META', scored, objects);
  const duplicate = base();
  duplicate.levels[0].providers[0].cases = [...objects, objects[0]];
  assert.throws(() => validateProgressionInput(duplicate), TypeError);
  const windows = levelInput(1, 'META', scored,
    [...objects.slice(0, 9), {id:'l1-scen-10', sceneWindowCount:2, completedWindows:3, status:'COMPLETE'}]);
  assert.throws(() => validateProgressionInput(windows), RangeError);
  const partialOverCount = levelInput(1, 'META', scored,
    [...objects.slice(0, 9), {id:'l1-scen-10', sceneWindowCount:2, completedWindows:1, status:'COMPLETE'}]);
  assert.throws(() => validateProgressionInput(partialOverCount), RangeError);
  const unknownProvider = levelInput(1, 'OPENAI', scored, objects);
  assert.throws(() => evaluateProgression(baseManifest, unknownProvider), TypeError);
  const badEvidence = {
    version:1, provenance:'X',
    levels:[{level:1, providers:[providerEntry({evidenceKind:'LIVE_MARKETED', cases:objects, scored})]}],
  };
  assert.throws(() => evaluateProgression(baseManifest, badEvidence), TypeError);
  const provisional = {
    version:1, provenance:'X',
    levels:[{level:1, providers:[providerEntry({goldReviewStatus:'PROVISIONAL_UNREVIEWED', cases:objects, scored})]}],
  };
  const provisionalResult = evaluateProgression(baseManifest, provisional);
  assert.equal(provisionalResult.levels['1'].providers.META.reason, 'GOLD_NOT_HUMAN_REVIEWED');
  assert.equal(provisionalResult.levels['1'].providers.META.status, 'INSUFFICIENT_EVIDENCE');
});

test('scored report tampering is rejected', () => {
  const objects = accountingList({count:10, prefix:'l1-scen'});
  const scored = exactScenarios({count:10, prefix:'l1-scen'});
  const withReport = levelInput(1, 'META', scored, objects);
  const claimed = JSON.parse(JSON.stringify(withReport));
  claimed.levels[0].providers[0].report.modelQualityMeasured = true;
  assert.throws(() => evaluateProgression(baseManifest, claimed), TypeError);
  const mismatched = JSON.parse(JSON.stringify(withReport));
  mismatched.levels[0].providers[0].report.summary.falsePositives = 5;
  assert.throws(() => evaluateProgression(baseManifest, mismatched), RangeError);
  const missingReport = JSON.parse(JSON.stringify(withReport));
  missingReport.levels[0].providers[0].report = null;
  assert.throws(() => evaluateProgression(baseManifest, missingReport), RangeError);
  const foreignScenario = levelInput(1, 'META', exactScenarios({count:10, prefix:'other-case'}), objects);
  assert.throws(() => evaluateProgression(baseManifest, foreignScenario), RangeError);
  const foreignReport = JSON.parse(JSON.stringify(withReport));
  foreignReport.levels[0].providers[0].report.mode = 'LIVE_QUALITY_CLAIM';
  assert.throws(() => evaluateProgression(baseManifest, foreignReport), TypeError);
});

test('offline planner writes sanitized reports with no input supplied', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'runq-curriculum-'));
  try {
    const plan = await runCurriculumPlan({inputPath:null, outputDir:dir, cwd:process.cwd()});
    assert.match(plan.text, /INSUFFICIENT_EVIDENCE/);
    assert.match(plan.text, /OFFLINE/);
    assert.match(plan.text, /no model quality/i);
    const json = JSON.parse(await readFile(plan.jsonPath, 'utf8'));
    assert.equal(json.claim, 'OFFLINE_PLAN_NO_MODEL_MEASUREMENTS');
    assert.equal(json.result.measuredModelQuality, false);
    assert.equal(json.result.kind, 'RUNQ_PROGRESSIVE_CURRICULUM_EVALUATION');
    assert.doesNotMatch(JSON.stringify(json), /scriptText|Bearer |apiKey|MODEL_API_KEY/);
    assert.match(await readFile(plan.mdPath, 'utf8'), /Progressive Curriculum Readiness Plan/);
    const passingObjects = accountingList({count:10, prefix:'l1-scen'});
    const inputPath = join(dir, 'evidence.json');
    await writeFile(inputPath, JSON.stringify(levelInput(1, 'META',
      exactScenarios({count:10, prefix:'l1-scen'}), passingObjects)), 'utf8');
    const qualified = await runCurriculumPlan({inputPath, outputDir:dir, cwd:process.cwd()});
    assert.match(qualified.text, /ALL_GATES_PASSED/);
    assert.equal(qualified.inputPathUsed, inputPath);
  } finally {
    await rm(dir, {recursive:true, force:true});
  }
});

test('npm scripts and gitignore wire the offline planner', async () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts['qa:curriculum:plan'], 'node tools/curriculumPlan.mjs');
  assert.match(pkg.scripts['check:syntax'], /curriculumProgression\.mjs/);
  assert.match(pkg.scripts['check:syntax'], /curriculumPlan\.mjs/);
  const ignore = readFileSync('.gitignore', 'utf8');
  assert.match(ignore, /^artifacts\/curriculum-qa\/$/m);
});
