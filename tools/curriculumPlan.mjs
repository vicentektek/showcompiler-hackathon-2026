/**
 * Offline progressive curriculum readiness planner for RunQ.
 * Zero network calls, zero paid inference, no provider access.
 * Reads: curriculum manifest (fixtures) plus an optional local JSON file with
 * validated provider evidence. Never fabricates evidence when none exists:
 * the default output starts every level as INSUFFICIENT_EVIDENCE.
 * Writes sanitized reports (counts, identifiers and reason codes only) to
 * artifacts/curriculum-qa/, which is gitignored.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateCurriculumManifest, evaluateProgression } from '../src/core/curriculumProgression.mjs';

const DEFAULT_MANIFEST_PATH = 'fixtures/qa/curriculum-v1.json';
const DEFAULT_OUTPUT_DIR = 'artifacts/curriculum-qa';

function percent(value) {
  return (Math.max(0, value) * 100).toFixed(1) + '%';
}

export function renderCurriculumPlanText(result, inputPathUsed) {
  const rows = [
    '# RunQ — Progressive Curriculum Readiness Plan (OFFLINE)',
    '',
    '**This plan measures NO model quality.** Levels qualify only with human-reviewed',
    'provider responses. Synthetic, generated, missing, incomplete or provisional-unreviewed',
    'material is INSUFFICIENT_EVIDENCE. Critical errors block advancement regardless of F1.',
    '',
    'Curriculum: ' + result.curriculum + ' (version ' + result.curriculumVersion + ')',
    'Evidence input: ' + (inputPathUsed ?? 'none supplied — every level starts as INSUFFICIENT_EVIDENCE'),
    '',
  ];
  for (const level of Object.values(result.levels)) {
    const header = 'Level ' + level.level + (level.heldOut ? ' [HELD-OUT]' : '') + ' — ' + level.name;
    rows.push('## ' + header);
    rows.push('Focus: ' + level.focus + ' Target scenarios: ' + level.targetScenarioCount + '. Gate: ' + describeGate(level.gate) + '.');
    rows.push('');
    rows.push('| Provider | Status | Reason | Scenarios | Cases C/I | Windows C/T | Expected | TP/FP/FN | F1 | Exact | Errors |');
    rows.push('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const qualification of Object.values(level.providers)) {
      rows.push([
        qualification.provider, qualification.status, qualification.reason,
        qualification.coverage.scenarios + '/' + qualification.coverage.targetScenarioCount,
        qualification.cases.complete + '/' + qualification.cases.incomplete,
        qualification.sceneWindows.complete + '/' + qualification.sceneWindows.total,
        qualification.metrics.expectedEvents,
        qualification.metrics.truePositives + '/' + qualification.metrics.falsePositives + '/' + qualification.metrics.falseNegatives,
        percent(qualification.metrics.f1),
        qualification.exactCasesCorrect ?? 'n/a',
        qualification.criticalErrors.total,
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
    rows.push('');
  }
  rows.push('## Provider progression');
  rows.push('');
  for (const rollup of Object.values(result.providers)) {
    rows.push('- ' + rollup.provider + ': current level ' + rollup.currentLevel +
      (rollup.nextEligibleLevel === null ? ' (curriculum complete — level 6 was held out and posted separately)' :
        ', next eligible level ' + rollup.nextEligibleLevel) + '.');
  }
  rows.push('- Overall: current level ' + result.overall.currentLevel +
    (result.overall.nextEligibleLevel === null ? ' (complete)' : ', next eligible level ' + result.overall.nextEligibleLevel) + '.');
  rows.push('');
  rows.push('Level 6 is held out: report only. It never unlocks a level and its results must not feed tuning.');
  rows.push('');
  rows.push('Offline planner: zero network calls, zero paid inference. Scene windows are the real');
  rows.push('request unit per scenario; a script never counts as one request.');
  rows.push('');
  return rows.join('\n');
}

function describeGate(gate) {
  if (gate.kind === 'EXACT_CASES') return 'EXACT_CASES >= ' + gate.exactCasesRequired;
  if (gate.kind === 'F1_THRESHOLD') return 'F1 >= ' + gate.minF1;
  return 'REPORT_ONLY';
}

export async function runCurriculumPlan({manifestPath = DEFAULT_MANIFEST_PATH, inputPath = null,
  outputDir = DEFAULT_OUTPUT_DIR, cwd = process.cwd()} = {}) {
  const manifest = validateCurriculumManifest(
    JSON.parse(await readFile(resolve(cwd, manifestPath), 'utf8')));
  let input = null;
  let inputPathUsed = null;
  let inputExists = false;
  if (inputPath) {
    input = JSON.parse(await readFile(resolve(cwd, inputPath), 'utf8'));
    inputPathUsed = inputPath;
    inputExists = true;
  } else {
    input = {version:1, provenance:'NO_VALIDATED_EVIDENCE_SUPPLIED_OFFLINE_PLAN', levels:[]};
  }
  const result = evaluateProgression(manifest, input);
  const text = renderCurriculumPlanText(result, inputPathUsed);
  const outDir = resolve(cwd, outputDir);
  await mkdir(outDir, {recursive:true});
  const jsonReport = {
    kind:'RUNQ_PROGRESSIVE_CURRICULUM_OFFLINE_PLAN',
    source:'tools/curriculumPlan.mjs',
    claim:'OFFLINE_PLAN_NO_MODEL_MEASUREMENTS',
    inputPathUsed:inputExists ? inputPathUsed : null,
    result,
  };
  const jsonPath = join(outDir, 'plan.json');
  const mdPath = join(outDir, 'plan.md');
  await Promise.all([
    writeFile(jsonPath, JSON.stringify(jsonReport, null, 2) + '\n', 'utf8'),
    writeFile(mdPath, text, 'utf8'),
  ]);
  return {result, text, jsonPath, mdPath, inputPathUsed};
}

function parseInputPath(argv) {
  const index = argv.indexOf('--input');
  if (index === -1) return null;
  const value = argv[index + 1];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('--input requires a JSON file path');
  }
  return value;
}

if (process.argv[1] && /(?:^|[/\\])curriculumPlan\.mjs$/.test(process.argv[1])) {
  try {
    const inputPath = parseInputPath(process.argv.slice(2));
    const plan = await runCurriculumPlan({inputPath});
    console.log(plan.text);
    console.log('Sanitized JSON report: ' + plan.jsonPath);
  } catch (error) {
    console.error('Curriculum plan: ' + (error instanceof Error ? error.message : 'unknown'));
    process.exitCode = 1;
  }
}
