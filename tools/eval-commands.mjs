#!/usr/bin/env node
/**
 * RunQ evaluation CLI: offline orchestration only.
 * No provider calls, automatic spending, or secret handling.
 */
import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = join(repoRoot, 'artifacts', 'eval-qa');
const browserScenarios = [
  'tools/browser-e2e.mjs',
  'tools/stagecraft-cue-safety-e2e.mjs',
  'tools/stagecraft-keymap-browser-e2e.mjs',
  'tools/stagecraft-audio-batch-e2e.mjs',
];

export function parseEvalArguments(mode, args) {
  if (!['ai', 'full', 'report'].includes(mode)) throw new Error('Modo desconocido.');
  const allowed = mode === 'ai' ? new Set(['--provider', '--runs']) :
    mode === 'full' ? new Set(['--runs']) : new Set();
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (!allowed.has(flag) || values[flag] !== undefined || args[i + 1] === undefined ||
        String(args[i + 1]).startsWith('--')) {
      throw new Error('Argumento desconocido, repetido o incompleto: ' + flag);
    }
    values[flag] = args[i + 1];
  }
  if (mode === 'ai' && !['meta', 'baseten'].includes(values['--provider'])) {
    throw new Error('Especifica --provider meta o --provider baseten.');
  }
  const maxRuns = mode === 'full' ? 20 : 1000;
  const runs = values['--runs'] === undefined ? 1 : Number(values['--runs']);
  if (!Number.isSafeInteger(runs) || runs < 1 || runs > maxRuns) {
    throw new Error('El numero de repeticiones debe estar entre 1 y ' + maxRuns + '.');
  }
  return { provider: values['--provider'] ?? null, runs };
}

function offlineEnvironment() {
  const env = { ...process.env };
  // Child processes running offline QA must not inherit provider credentials.
  for (const name of ['MODEL_API_KEY', 'BASETEN_API_KEY', 'MODAL_PROXY_TOKEN_ID',
    'MODAL_PROXY_TOKEN_SECRET', 'OPENAI_API_KEY']) delete env[name];
  return env;
}

function execute(program, args) {
  const isWindowsNpm = process.platform === 'win32' && program === 'npm';
  const result = spawnSync(isWindowsNpm ? 'npm.cmd' : program, args, {
    cwd: repoRoot, env: offlineEnvironment(), stdio: 'inherit',
    shell: isWindowsNpm,
  });
  if (result.error) return { ok: false, reason: result.error.message };
  return { ok: result.status === 0, exitCode: result.status, signal: result.signal };
}

async function save(name, data) {
  await mkdir(outputRoot, { recursive: true });
  await writeFile(join(outputRoot, name + '.json'), JSON.stringify(data, null, 2) + '\n');
}

function stamp() { return new Date().toISOString(); }

async function createReport() {
  const filenames = {
    cues: 'artifacts/cue-qa/report.json',
    seminar: 'artifacts/seminar-qa/contract.json',
    codex: 'artifacts/codex-qa/summary.json',
    meta: 'artifacts/seminar-live/report.json',
    baseten: 'artifacts/seminar-baseten/report.json',
    comparison: 'artifacts/seminar-compare/report.json',
  };
  const inventory = {};
  for (const [name, rel] of Object.entries(filenames)) {
    try {
      const parsed = JSON.parse(await readFile(join(repoRoot, rel), 'utf8'));
      inventory[name] = { present: true, type: typeof parsed, path: rel };
    } catch {
      inventory[name] = { present: false, path: rel };
    }
  }
  const report = { createdAt: stamp(), kind: 'artifact_inventory_not_quality_score',
    note: 'Presencia de informes, no prueba de ejecucion real ni calidad de modelos.',
    files: inventory };
  await save('report', report);
  const lines = [
    '# RunQ — inventario de evaluaciones',
    '',
    'Informe offline. La presencia de un artefacto NO demuestra que proceda de una API real.',
    '',
    '| Informe | Estado | Ubicacion |',
    '| --- | --- | --- |',
    ...Object.entries(inventory).map(([k, v]) =>
      '| ' + k + ' | ' + (v.present ? 'Encontrado' : 'No disponible') +
      ' | \`' + v.path + '\` |'),
    '',
    'La puntuacion de Meta y Baseten debe interpretarse solo tras validar la procedencia y emparejar los casos.',
    '',
  ];
  await writeFile(join(outputRoot, 'report.md'), lines.join('\n'));
  console.log('REPORT_OK: artifacts/eval-qa/report.md y report.json (sin llamadas de pago).');
}

async function full(runs) {
  const record = { createdAt: stamp(), mode: 'full_offline', runsRequested: runs, results: [],
    note: 'Chrome utiliza motor de audio simulado; no certifica hardware real ni IA remota.' };
  const core = execute('npm', ['run', 'qa:codex']);
  record.results.push({ check: 'qa:codex', ...core });
  await save('full-last', record);
  if (!core.ok) throw new Error('Fallo en qa:codex; consulta la salida anterior.');
  try { await import('playwright-core'); } catch {
    record.results.push({ check: 'playwright-core', ok: false, reason: 'not_installed' });
    await save('full-last', record);
    throw new Error('Falta playwright-core. Instala: npm install --no-save --package-lock=false playwright-core@1.56.1');
  }
  for (const script of browserScenarios) await access(join(repoRoot, script));
  for (let i = 1; i <= runs; i++) {
    for (const script of browserScenarios) {
      console.log('\n[RunQ eval] Iteracion ' + i + '/' + runs + ': ' + script);
      const result = execute(process.execPath, [join(repoRoot, script)]);
      record.results.push({ iteration: i, check: script, ...result });
      await save('full-last', record);
      if (!result.ok) throw new Error('Fallo en ' + script + ' (iteracion ' + i + ').');
    }
  }
  record.finishedAt = stamp();
  record.ok = true;
  await save('full-last', record);
  console.log('FULL_OFFLINE_OK: ' + runs + ' iteraciones de 4 pruebas Chrome.');
}

export async function main(mode, args) {
  const options = parseEvalArguments(mode, args);
  if (mode === 'ai') {
    const plan = {
      createdAt: stamp(), mode: 'PLAN_ONLY_NO_PROVIDER_CALLS',
      provider: options.provider, requestedRuns: options.runs,
      executedRuns: 0,
      warning: 'No se ha ejecutado inferencia. El presupuesto existente del repositorio limita las campañas reales.',
      existingPlanCommand: options.provider === 'meta' ? 'npm run qa:meta:plan' : 'npm run qa:baseten:plan',
    };
    await save('ai-' + options.provider + '-plan', plan);
    console.log('AI_PLAN_ONLY: ' + options.runs + ' ejecuciones solicitadas para ' + options.provider +
      '; 0 ejecutadas y $0 gastados. Revisa artifacts/eval-qa/ai-' + options.provider + '-plan.json');
  } else if (mode === 'full') {
    await full(options.runs);
  } else {
    await createReport();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv[2], process.argv.slice(3)).catch(e => {
    console.error('EVAL_ERROR: ' + e.message);
    process.exitCode = 1;
  });
}
