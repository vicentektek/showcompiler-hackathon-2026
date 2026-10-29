#!/usr/bin/env node
/**
 * RunQ Evaluation Campaign Planner.
 *
 * Zero remote providers. Default actions produce plans/reports ONLY.
 * Only --execute-offline can run existing deterministic local checks.
 * The paid Meta, Baseten, Modal and realtime voice harnesses are intentionally
 * absent: no --live flag, no provider credentials, no network transport.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputs = join(root, 'artifacts', 'eval-qa');
const catalogPath = join(root, 'test', 'fixtures', 'eval-campaign-catalog.json');

export const browserChecks = Object.freeze([
  'tools/browser-e2e.mjs',
  'tools/stagecraft-cue-safety-e2e.mjs',
  'tools/stagecraft-keymap-browser-e2e.mjs',
  'tools/stagecraft-audio-batch-e2e.mjs',
  'tools/voice-follow-click-e2e.mjs',
  'tools/rehearsal-auto-browser-e2e.mjs',
  'tools/sfx-lab-browser-e2e.mjs',
]);

const providerSecrets = Object.freeze([
  'MODEL_API_KEY', 'BASETEN_API_KEY', 'MODAL_PROXY_TOKEN_ID',
  'MODAL_PROXY_TOKEN_SECRET', 'OPENAI_API_KEY', 'META_API_KEY',
  'RUNQ_META_API_KEY', 'RUNQ_BASETEN_API_KEY', 'ANTHROPIC_API_KEY',
]);

export function parseEvalArguments(mode, argv = []) {
  if (!['offline', 'ai', 'full', 'report', 'video'].includes(mode)) {
    throw new Error('Modo desconocido: ' + mode);
  }
  const allowed = mode === 'ai' ? ['--provider', '--runs'] :
    mode === 'offline' ? ['--execute-offline'] :
    mode === 'full' ? ['--runs', '--execute-offline'] : [];
  const values = new Map();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!allowed.includes(flag) || values.has(flag)) throw new Error('Opcion no permitida o repetida: ' + flag);
    if (flag === '--execute-offline') {
      values.set(flag, true);
    } else {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        throw new Error('Falta el valor de ' + flag);
      }
      values.set(flag, argv[++i]);
    }
  }
  const provider = values.get('--provider') ?? null;
  if (mode === 'ai' && !['meta', 'baseten', 'modal', 'voice'].includes(provider)) {
    throw new Error('Usa --provider meta|baseten|modal|voice.');
  }
  const runs = values.has('--runs') ? Number(values.get('--runs')) : 1;
  const maximum = mode === 'ai' ? 1000 : 20;
  if (!Number.isSafeInteger(runs) || runs < 1 || runs > maximum) {
    throw new Error('El numero de repeticiones debe ser entero entre 1 y ' + maximum);
  }
  return { mode, provider, runs, executeOffline: values.get('--execute-offline') === true };
}

export function makePlan(settings, catalog) {
  if (!catalog || !Array.isArray(catalog.cases)) throw new Error('Catalogo de pruebas ausente.');
  const candidates = catalog.cases.filter(item => {
    if (settings.mode === 'video') return item.videoShot !== null;
    if (settings.mode === 'ai') return item.provider === settings.provider;
    if (settings.mode === 'offline' || settings.mode === 'full') return item.provider === 'offline';
    return false;
  });
  const automated = candidates.filter(item => item.automation === 'existing' || item.automation === 'planned');
  return {
    schemaVersion: 1,
    mode: settings.mode,
    state: 'PLAN_ONLY_NO_EXECUTION',
    provider: settings.provider,
    requestedRuns: settings.runs,
    completedRuns: 0,
    providerCalls: 0,
    note: 'Plan provisional. Ninguna prueba ni inferencia ejecutada; resultados de calidad no disponibles.',
    scenarioCount: candidates.length,
    automatedOrPlannedCount: automated.length,
    totalProposedScenarioExecutions: candidates.length * settings.runs,
    scenarios: candidates.map(x => ({
      id: x.id, priority: x.priority, automation: x.automation,
      fixture: x.fixture, metric: x.metric, videoShot: x.videoShot,
    })),
  };
}

function now() { return new Date().toISOString(); }
async function save(name, value) {
  await mkdir(outputs, { recursive: true });
  await writeFile(join(outputs, name + '.json'), JSON.stringify(value, null, 2) + '\n');
}
async function loadCatalog() {
  return JSON.parse(await readFile(catalogPath, 'utf8'));
}

function strippedEnvironment() {
  const env = { ...process.env };
  for (const name of providerSecrets) delete env[name];
  delete env.RUNQ_ENABLE_SFX_PILOT;
  delete env.RUNQ_ALLOW_REMOTE;
  return env;
}

function executeLocal(program, args) {
  const windowsNpm = process.platform === 'win32' && program === 'npm';
  const result = spawnSync(windowsNpm ? 'npm.cmd' : program, args, {
    cwd: root, stdio: 'inherit', env: strippedEnvironment(),
    shell: windowsNpm,
  });
  if (result.error) return { ok: false, error: result.error.message };
  return { ok: result.status === 0, exitCode: result.status, signal: result.signal };
}

async function executeOffline(settings, plan) {
  const run = { ...plan, state: 'OFFLINE_RUNNING', startedAt: now(), results: [] };
  await save('offline-run', run);
  const core = executeLocal('npm', ['run', 'qa:codex']);
  run.results.push({ scenario: 'qa:codex', ...core });
  await save('offline-run', run);
  if (!core.ok) throw new Error('Ha fallado qa:codex. Lee la salida de consola.');
  if (settings.mode === 'full') {
    try { await import('playwright-core'); }
    catch {
      run.results.push({ scenario: 'playwright-core', ok: false, reason: 'module_missing' });
      await save('offline-run', run);
      throw new Error('Instala playwright-core@1.56.1 antes de ejecutar Chrome.');
    }
    for (const path of browserChecks) await access(join(root, path));
    for (let iteration = 1; iteration <= settings.runs; iteration++) {
      for (const path of browserChecks) {
        console.log('[RunQ QA] ' + iteration + '/' + settings.runs + ': ' + path);
        const result = executeLocal(process.execPath, [join(root, path)]);
        run.results.push({ iteration, scenario: path, ...result });
        await save('offline-run', run);
        if (!result.ok) {
          run.state = 'OFFLINE_FAILED';
          await save('offline-run', run);
          throw new Error('Falló ' + path + ' (iteracion ' + iteration + ').');
        }
      }
    }
  }
  run.state = 'OFFLINE_PASSED';
  run.completedRuns = settings.mode === 'full' ? settings.runs : 1;
  run.finishedAt = now();
  await save('offline-run', run);
  console.log('OFFLINE_PASSED: zero provider calls. artifacts/eval-qa/offline-run.json');
}

export function classifyArtifact(parsed, relativePath) {
  // Deliberately never infer model quality from the existence of a report.
  const p = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  const serialized = JSON.stringify(p ?? {});
  const provenance = p?.fixtureProvenance ?? p?.provenance?.kind ?? p?.sourceType ?? null;
  return {
    path: relativePath, present: true,
    sha256: createHash('sha256').update(serialized).digest('hex'),
    provenanceLabel: typeof provenance === 'string' ? provenance.slice(0, 100) : 'UNVERIFIED',
    qualityVerified: false,
    warning: 'Existencia o formato de informe NO demuestra inferencia real ni gold validado.',
  };
}

async function createReport() {
  const paths = {
    cues: 'artifacts/cue-qa/report.json',
    seminar: 'artifacts/seminar-qa/contract.json',
    codex: 'artifacts/codex-qa/summary.json',
    meta: 'artifacts/seminar-live/report.json',
    baseten: 'artifacts/seminar-baseten/report.json',
    comparison: 'artifacts/seminar-compare/report.json',
    offlineRun: 'artifacts/eval-qa/offline-run.json',
  };
  const files = {};
  for (const [name, p] of Object.entries(paths)) {
    try { files[name] = classifyArtifact(JSON.parse(await readFile(join(root, p), 'utf8')), p); }
    catch { files[name] = { path: p, present: false, qualityVerified: false }; }
  }
  const report = {
    schemaVersion: 1, createdAt: now(), kind: 'ARTIFACT_INVENTORY_NOT_PROVIDER_SCORE',
    files, providerQualityMeasured: false,
    warning: 'No declarar ganadores Meta/Baseten sin ejecutar casos pareados y verificar gold.',
  };
  await save('report', report);
  const lines = ['# RunQ — inventario de evaluaciones', '',
    'No es un informe de precision real de los proveedores.','',
    '| Artefacto | Archivo | Procedencia validada |',
    '| --- | --- | --- |',
    ...Object.entries(files).map(([name, f]) =>
      '| ' + name + ' | ' + (f.present ? 'Encontrado' : 'Ausente') + ' | NO |'),
    '', 'Los informes procedentes de fixtures sintéticos no miden la precisión de Meta, Baseten o Modal.'];
  await writeFile(join(outputs, 'report.md'), lines.join('\n') + '\n');
  console.log('REPORT_INVENTORY_ONLY: artifacts/eval-qa/report.md');
}

export async function main(mode, args) {
  const settings = parseEvalArguments(mode, args);
  if (mode === 'report') return createReport();
  const plan = makePlan(settings, await loadCatalog());
  const basename = mode === 'ai' ? 'ai-' + settings.provider + '-plan' : mode + '-plan';
  await save(basename, { ...plan, generatedAt: now() });
  if (mode === 'video') {
    const shots = [...new Set(plan.scenarios.map(x => x.videoShot).filter(Boolean))].sort();
    console.log('VIDEO_PLAN_ONLY: ' + shots.join(', ') + '; pruebas de captura NO ejecutadas.');
  } else {
    console.log('EVAL_PLAN_ONLY: ' + settings.mode + ' ' + settings.runs +
      ' repeticiones; 0 ejecutadas, 0 llamadas de proveedor.');
  }
  if (settings.executeOffline) {
    if (settings.mode !== 'offline' && settings.mode !== 'full') throw new Error('Solo se ejecuta QA local.');
    await executeOffline(settings, plan);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv[2], process.argv.slice(3)).catch(error => {
    console.error('EVAL_ERROR: ' + error.message);
    process.exitCode = 1;
  });
}
