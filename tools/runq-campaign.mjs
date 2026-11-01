#!/usr/bin/env node
/**
 * RUNQ long campaign runner — resumable, offline by default.
 *
 *   node tools/runq-campaign.mjs plan    [--id ID]
 *   node tools/runq-campaign.mjs offline [--id ID] [--force] [--only a,b]
 *   node tools/runq-campaign.mjs browser [--id ID] [--force] [--only a,b]
 *   node tools/runq-campaign.mjs all     [--id ID] [--force]
 *   node tools/runq-campaign.mjs resume  --id ID [--retry-failed]
 *   node tools/runq-campaign.mjs status  --id ID
 *   node tools/runq-campaign.mjs report  --id ID
 *   node tools/runq-campaign.mjs compare --base ID --candidate ID
 *   node tools/runq-campaign.mjs live    --provider meta|modal --max-requests N [--live --ack-paid]
 *
 * Offline/browser suites run existing repository runners with every provider
 * credential removed from the child environment. Results are checkpointed
 * after each suite in artifacts/long-campaign/<id>/ (ignored by Git), so an
 * interrupted run resumes without repeating completed suites for the same SHA.
 * `live` is fail-closed: only Meta and Modal, only through the existing
 * ledger-enforced runners, bounded, sequential and never retried.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, rm, open } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CAMPAIGN_POLICY, isCampaignProviderProhibited } from '../src/qa/campaignPolicy.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const LIVE_PROVIDERS = Object.freeze(['meta', 'modal']);
export const MAX_LIVE_REQUESTS_PER_INVOCATION = 5;
const SECRET_ENV = ['MODEL_API_KEY', 'BASETEN_API_KEY', 'FIREWORKS_API_KEY', 'MODAL_PROXY_TOKEN_ID',
  'MODAL_PROXY_TOKEN_SECRET', 'RUNQ_SFX_PILOT_ENABLED', 'MODAL_SFX_ENDPOINT'];
const SECRET_NAME = /(API_KEY|TOKEN|SECRET|PASSWORD)/i;
const LOG_TAIL_BYTES = 200_000;

const num = (text, re) => { const m = re.exec(text); return m ? Number(m[1]) : null; };
const countLines = (text, re) => text.split(/\r?\n/).filter(line => re.test(line)).length;

/**
 * Suite adapters. `unique` = distinct cases/scenarios, `trials` = executions
 * (steps, turns, repetitions), `checks` = assertions. They are reported
 * separately so repeated identical runs never inflate unique coverage.
 */
export const SUITES = Object.freeze([
  { id: 'syntax', kind: 'offline', evidence: 'LOCAL', syntax: true },
  { id: 'unit', kind: 'offline', evidence: 'LOCAL', args: ['tools/run-offline-tests.mjs'],
    parse: out => { const tests = num(out, /^# tests (\d+)/m), fail = num(out, /^# fail (\d+)/m);
      return { unique: tests, trials: tests, checks: tests, failures: fail }; } },
  { id: 'state-machine', kind: 'offline', evidence: 'LOCAL', args: dir => ['tools/runq-state-machine-campaign.mjs',
    '--scenarios', '400', '--steps', '40', '--transport-actions', '40', '--out', join(dir, 'state-machine')],
    parse: out => ({ unique: num(out, /scenarios=(\d+)/), trials: (num(out, /steps=(\d+)/) ?? 0) + (num(out, /transportActions=(\d+)/) ?? 0),
      checks: num(out, /checks=(\d+)/), failures: num(out, /failures=(\d+)/) }) },
  { id: 'agent-mass', kind: 'offline', evidence: 'LOCAL', args: ['tools/runq-agent-mass-eval.mjs', '--cases', '600', '--seed', '20261029'],
    parse: out => { const m = /RUNQ AGENT MASS QA: (\d+)\/(\d+) PASS, (\d+) FAIL/.exec(out);
      return m ? { unique: Number(m[2]), trials: Number(m[2]), checks: Number(m[2]), failures: Number(m[3]) } : {}; } },
  { id: 'gauntlet-v2', kind: 'offline', evidence: 'LOCAL', args: ['tools/runq-show-assistant-gauntlet-v2.mjs'],
    parse: out => { const m = /RUNQ GAUNTLET OFFLINE (\d+) turns (\{[^\n]*\})/.exec(out); if (!m) return {};
      const counts = JSON.parse(m[2]); return { trials: Number(m[1]), checks: Number(m[1]), failures: counts.FAIL ?? 0,
        notes: 'LOCAL_GAP=' + (counts.LOCAL_GAP ?? 0) + ' (needs real AI reasoning, not a pass)' }; } },
  { id: 'context-retrieval', kind: 'offline', evidence: 'LOCAL', args: dir => ['tools/runq-context-retrieval-eval.mjs',
    '--seeds', '20', '--out', join(dir, 'context-retrieval'), '--quiet'],
    parse: out => ({ unique: num(out, /CONTEXT RETRIEVAL EVAL unique=(\d+)/), trials: num(out, /trials=(\d+)/), checks: num(out, /checks=(\d+)/),
      failures: num(out, /failed=(\d+)/), httpRequests: num(out, /providerRequests=(\d+)/),
      notes: ['B_accept', 'B_evidence', 'A_evidence'].map(k => k + '=' + (new RegExp(k + '=([\\d.]+%)').exec(out)?.[1] ?? '?')).join(' ') +
        ' (evidence availability, not Muse quality)' }) },
  { id: 'stateful-conversations', kind: 'offline', evidence: 'LOCAL', args: ['tools/runq-agent-stateful-conversations.mjs'],
    parse: out => { const m = /STATEFUL CONVERSATIONS (\d+) (\d+) turns PASS/.exec(out);
      return m ? { unique: Number(m[1]), trials: Number(m[2]), checks: Number(m[2]), failures: 0 } : {}; } },
  { id: 'evals-offline', kind: 'offline', evidence: 'LOCAL', args: ['tools/runq-evals-offline.mjs'],
    parse: out => { try { const r = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
      return { unique: r.corpus?.conversations ?? null, trials: r.offlineDialoguePass + r.offlineDialogueFailures,
        checks: r.offlineDialoguePass + r.offlineDialogueFailures, failures: r.offlineDialogueFailures,
        httpRequests: r.model?.newProviderRequests ?? 0, notes: 'humanGoldVerified=' + r.corpus?.humanGoldVerified }; } catch { return {}; } } },
  { id: 'cue-qa', kind: 'offline', evidence: 'SYNTHETIC', args: ['tools/cue-qa-report.mjs'],
    parse: out => ({ notes: (/Exact event P\/R\/F1: ([^\n]+)/.exec(out)?.[1] ?? '') + ' (illustrative fixtures, not Muse accuracy)' }) },
  { id: 'seminar-contract', kind: 'offline', evidence: 'LOCAL', args: ['tools/seminar-offline-eval.mjs'],
    parse: out => ({ unique: num(out, /(\d+) scripts \//), checks: num(out, /(\d+) annotated events/),
      notes: 'contract only; provisional gold' }) },
  { id: 'systematic-plan', kind: 'offline', evidence: 'PLAN', args: ['tools/runq-systematic-lab.mjs'],
    parse: out => ({ httpRequests: num(out, /requests (\d+)/), notes: 'dry-run plan only' }) },
  { id: 'meta-seminar-plan', kind: 'offline', evidence: 'PLAN', args: ['tools/run-meta-seminar-eval.mjs'],
    parse: out => ({ httpRequests: num(out, /Meta requests sent: (\d+)/), notes: 'dry-run plan only' }) },
  { id: 'quality-audit', kind: 'offline', evidence: 'LOCAL', args: ['tools/runq-show-assistant-quality-audit.mjs'],
    parse: out => ({ notes: 'LOCAL_GAP=' + (num(out, /QUALITY AUDIT OFFLINE (\d+) LOCAL_GAP/) ?? '?') }) },
  { id: 'browser-smoke', kind: 'browser', evidence: 'BROWSER_MOCKED_PROVIDERS', args: ['tools/browser-e2e.mjs'],
    parse: out => ({ unique: /BROWSER_SMOKE_OK/.test(out) ? 1 : 0, trials: 1, checks: countLines(out, /OK|PASS/) }) },
  { id: 'interface-browser', kind: 'browser', evidence: 'BROWSER_MOCKED_PROVIDERS', args: ['tools/interface-browser-e2e.mjs'],
    parse: out => ({ checks: countLines(out, /^PASS:/) }) },
  { id: 'interface-functional', kind: 'browser', evidence: 'BROWSER_MOCKED_PROVIDERS', args: ['tools/interface-functional-e2e.mjs'],
    parse: out => ({ checks: countLines(out, /^PASS:/) }) },
  { id: 'ai-review-browser', kind: 'browser', evidence: 'BROWSER_MOCKED_PROVIDERS', args: ['tools/ai-review-browser-e2e.mjs'],
    parse: out => ({ checks: countLines(out, /PASS|OK/) }) },
  { id: 'sfx-history-browser', kind: 'browser', evidence: 'BROWSER_MOCKED_PROVIDERS', args: ['tools/sfx-history-browser-e2e.mjs'],
    parse: out => ({ checks: countLines(out, /PASS|OK/) }) },
  { id: 'audio-cue-drop-browser', kind: 'browser', evidence: 'BROWSER_MOCKED_PROVIDERS', args: ['tools/audio-cue-drop-browser-e2e.mjs'],
    parse: out => ({ checks: countLines(out, /PASS|OK/) }) },
  ...[
    ['sfx-lab-browser', 'tools/sfx-lab-browser-e2e.mjs'],
    ['rehearsal-auto-browser', 'tools/rehearsal-auto-browser-e2e.mjs'],
    ['last-go-browser', 'tools/last-go-browser-e2e.mjs'],
    ['agent-browser', 'tools/runq-agent-browser-e2e.mjs'],
    ['stagecraft-keymap-browser', 'tools/stagecraft-keymap-browser-e2e.mjs'],
    ['stagecraft-audio-batch-browser', 'tools/stagecraft-audio-batch-e2e.mjs'],
    ['stagecraft-cue-safety-browser', 'tools/stagecraft-cue-safety-e2e.mjs'],
    ['voice-follow-click-browser', 'tools/voice-follow-click-e2e.mjs'],
    ['command-dictation-browser', 'tools/command-dictation-browser-e2e.mjs'],
  ].map(([id, file]) => ({ id, kind: 'browser', evidence: 'BROWSER_MOCKED_PROVIDERS', args: [file],
    parse: out => ({ checks: countLines(out, /PASS|OK/) }) })),
  { id: 'user-journeys', kind: 'browser', evidence: 'BROWSER_MOCKED_PROVIDERS', timeoutMs: 90 * 60_000,
    args: dir => ['tools/runq-journeys-e2e.mjs', '--out', join(dir, 'journeys'), '--resume'],
    parse: out => ({ unique: num(out, /unique=(\d+)/), trials: num(out, /journeys=(\d+)/), checks: num(out, /checks=(\d+)/),
      failures: num(out, /failed=(\d+)/), httpRequests: num(out, /forbidden=(\d+)/),
      notes: (/(completed=\d+\/\d+)/.exec(out)?.[1] ?? '') }) },
]);

/** Functional area → implementation → suites; lastResult is derived from suite outcomes. */
export const MODULE_MATRIX = Object.freeze([
  ['Script import & stable Lxx references', 'IMPLEMENTED', 'src/core/script.mjs,workspace.mjs', 'unit;state-machine;user-journeys', 'P0'],
  ['AI cue proposals (Meta) — offline contract', 'IMPLEMENTED', 'metaCueProvider.mjs,theatreCueAnalysis.mjs', 'unit;seminar-contract;evals-offline', 'P1'],
  ['AI proposal quality vs gold (real Muse)', 'PARTIAL', 'metaSeminarEval.mjs', 'meta-seminar-plan (live NOT_RUN)', 'P1'],
  ['Human approval → DRAFT cue', 'IMPLEMENTED', 'workspace.mjs', 'unit;state-machine;browser-smoke;user-journeys', 'P0'],
  ['Manual cue insert/duplicate/move/reorder/delete', 'IMPLEMENTED', 'manualCues.mjs', 'unit;state-machine;interface-functional', 'P1'],
  ['Cue automation plan (follow/continue/stop targets)', 'IMPLEMENTED', 'cueAutomation.mjs', 'unit;state-machine', 'P0'],
  ['Automation runtime (timers, cancel, late GO)', 'IMPLEMENTED_NOT_WIRED_TO_UI', 'cueAutomationRuntime.mjs', 'unit;state-machine', 'P0'],
  ['Playback params (gain, fades, loop, rate, pan)', 'IMPLEMENTED', 'cuePlayback.mjs', 'unit;state-machine;user-journeys', 'P1'],
  ['Operator queue GO/STOP/STOP ALL/NEXT', 'IMPLEMENTED', 'operatorQueue.mjs,browserAudio.mjs', 'unit;state-machine;browser-smoke;interface-browser;user-journeys', 'P0'],
  ['Persistence JSON + portable ZIP round-trip', 'IMPLEMENTED', 'projectPersistence.mjs,showArchive.mjs', 'unit;state-machine;browser-smoke;user-journeys', 'P0'],
  ['Agent plans (preview, commit, undo, stale)', 'IMPLEMENTED', 'agentCore.mjs,agentDialogue.mjs', 'unit;agent-mass;stateful-conversations;state-machine', 'P0'],
  ['AI context budget + script retrieval for Muse', 'IMPLEMENTED', 'agentCore.mjs,agentRoutes.mjs', 'unit;context-retrieval', 'P1'],
  ['Agent reasoning on ambiguous intent', 'PARTIAL', 'agentIntent.mjs', 'gauntlet-v2 (LOCAL_GAP);quality-audit', 'P2'],
  ['Show Builder guided flow', 'IMPLEMENTED', 'show-builder-ui.mjs,showBuilder.mjs', 'browser-smoke;user-journeys', 'P1'],
  ['Sound generation (Modal SFX) — mocked', 'IMPLEMENTED', 'modalSfxPilotClient.mjs,sfxRoutes.mjs', 'unit;sfx-history-browser', 'P1'],
  ['Audio import / drop to cue', 'IMPLEMENTED', 'workspace.mjs,manualCues.mjs', 'unit;audio-cue-drop-browser', 'P1'],
  ['Voice follow / dictation', 'DISABLED_BY_CAMPAIGN_CAP', 'voiceFollow.mjs,command-dictation.mjs', 'unit (gates)', 'P2'],
  ['ES/EN localisation', 'IMPLEMENTED', 'i18n.mjs,locales', 'unit;interface-browser;user-journeys', 'P2'],
  ['Paid provider gates (Baseten/Fireworks/voice blocked)', 'IMPLEMENTED', 'campaignPolicy.mjs,campaignFetch.mjs', 'unit', 'P0'],
].map(([area, implementation, modules, suites, severity]) => Object.freeze({ area, implementation, modules, suites, severity })));

export function sanitizedEnv(base = process.env) {
  const env = { ...base, RUNQ_OFFLINE_TESTS: '1' };
  for (const key of Object.keys(env)) if (SECRET_ENV.includes(key) || SECRET_NAME.test(key)) delete env[key];
  return env;
}

/** Remove secret values present in the parent environment and common token shapes. */
export function redact(text, base = process.env) {
  let out = String(text);
  for (const [key, value] of Object.entries(base)) {
    if ((SECRET_ENV.includes(key) || SECRET_NAME.test(key)) && typeof value === 'string' && value.length >= 6)
      out = out.split(value).join('[REDACTED]');
  }
  return out.replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]{8,}/g, '$1[REDACTED]')
    .replace(/\b(sk|key|tok)[-_][A-Za-z0-9]{16,}\b/g, '[REDACTED]');
}

function gitInfo(root) {
  const git = args => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
  const porcelain = git(['status', '--porcelain']);
  return { sha: git(['rev-parse', 'HEAD']), branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    dirtyEntries: porcelain === null ? null : porcelain.split('\n').filter(Boolean).length };
}

async function writeJsonAtomic(file, value) {
  const tmp = file + '.' + process.pid + '.tmp';
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await rename(tmp, file);
}
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

export function campaignDir(id, root = REPO_ROOT) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id ?? '')) throw new TypeError('INVALID_CAMPAIGN_ID');
  return join(root, 'artifacts', 'long-campaign', id);
}

function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } }

/** Exclusive per-campaign lock; a lock left by a dead process is reclaimed. */
export async function acquireLock(dir) {
  const file = join(dir, 'campaign.lock');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(file, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      await handle.close();
      return async () => { await rm(file, { force: true }); };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner = null;
      try { owner = JSON.parse(await readFile(file, 'utf8')).pid; } catch {}
      if (Number.isSafeInteger(owner) && owner !== process.pid && pidAlive(owner)) throw new Error('CAMPAIGN_LOCKED_BY_PID_' + owner);
      await rm(file, { force: true });
    }
  }
  throw new Error('CAMPAIGN_LOCK_FAILED');
}

function syntaxTargets(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const files = new Set();
  for (const [name, script] of Object.entries(pkg.scripts ?? {}))
    if (name.startsWith('check:')) for (const m of script.matchAll(/node --check (\S+)/g)) files.add(m[1]);
  return [...files];
}

export function planSuites(kind, { only = null, suites = SUITES } = {}) {
  const selected = suites.filter(s => (kind === 'all' || s.kind === kind) && (!only || only.includes(s.id)));
  if (only) for (const id of only) if (!suites.some(s => s.id === id)) throw new TypeError('UNKNOWN_SUITE ' + id);
  return selected;
}

export async function createOrLoadCampaign({ id, root = REPO_ROOT, suites = SUITES, now = () => new Date().toISOString(), git = gitInfo }) {
  const dir = campaignDir(id, root);
  await mkdir(join(dir, 'logs'), { recursive: true });
  const manifestFile = join(dir, 'run-manifest.json'), stateFile = join(dir, 'resume-state.json');
  const info = git(root);
  if (existsSync(manifestFile)) {
    const manifest = await readJson(manifestFile);
    if (manifest.git.sha && info.sha && manifest.git.sha !== info.sha) {
      const error = new Error('SHA_CHANGED_START_NEW_CAMPAIGN'); error.code = 'SHA_CHANGED'; error.manifestSha = manifest.git.sha; error.currentSha = info.sha; throw error;
    }
    const state = existsSync(stateFile) ? await readJson(stateFile) : { suites: {} };
    for (const suite of suites) state.suites[suite.id] ??= { status: 'PENDING', attempts: 0 };
    return { dir, manifest, state, manifestFile, stateFile };
  }
  const manifest = {
    schema: 'runq-long-campaign-manifest-v1', campaignId: id, createdAt: now(), git: info,
    node: process.version, platform: process.platform + '-' + process.arch,
    browser: 'Chromium via playwright-core (tools/browserTestRuntime.mjs)',
    defaultMode: 'offline', providerRequestsOffline: 0,
    policy: { revision: CAMPAIGN_POLICY.revision ?? null, liveProvidersAllowed: LIVE_PROVIDERS,
      blockedProviders: ['baseten', 'fireworks', 'paid_voice', 'other'], automaticPaidRetries: 0,
      maxLiveRequestsPerInvocation: MAX_LIVE_REQUESTS_PER_INVOCATION, copilotCreditsSeparateFromApiBudget: true },
    targets: { offlineVerifications: 3000, uniqueFunctionalCases: 600, browserJourneys: 120, note: 'targets, not results' },
    seeds: { stateMachine: 20261101, agentMass: 20261029 },
    suites: suites.map(s => ({ id: s.id, kind: s.kind, evidence: s.evidence,
      command: s.syntax ? 'node --check <package.json check:* targets>' : ['node', ...(typeof s.args === 'function' ? s.args('<campaign>') : s.args)].join(' ') })),
  };
  const state = { schema: 'runq-long-campaign-state-v1', campaignId: id, sha: info.sha, updatedAt: now(),
    suites: Object.fromEntries(suites.map(s => [s.id, { status: 'PENDING', attempts: 0 }])) };
  await writeJsonAtomic(manifestFile, manifest);
  await writeJsonAtomic(stateFile, state);
  return { dir, manifest, state, manifestFile, stateFile };
}

function killTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

function runNode(args, { cwd, env, timeoutMs, onChild }) {
  return new Promise(resolvePromise => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    onChild?.(child);
    let out = '';
    const take = chunk => { out += chunk; if (out.length > LOG_TAIL_BYTES * 2) out = out.slice(-LOG_TAIL_BYTES); };
    child.stdout.on('data', take); child.stderr.on('data', take);
    const timer = setTimeout(() => { out += '\nRUNNER_TIMEOUT'; killTree(child); }, timeoutMs);
    child.once('error', error => { clearTimeout(timer); resolvePromise({ code: 1, out: out + '\nSPAWN_ERROR ' + error.code }); });
    child.once('close', code => { clearTimeout(timer); onChild?.(null); resolvePromise({ code: code ?? 1, out }); });
  });
}

async function runSyntaxSuite(root, env) {
  const files = syntaxTargets(root);
  const failed = [];
  for (const file of files) {
    if (!existsSync(join(root, file))) { failed.push(file + ' (missing)'); continue; }
    const r = await runNode(['--check', file], { cwd: root, env, timeoutMs: 60_000 });
    if (r.code !== 0) failed.push(file);
  }
  return { code: failed.length ? 1 : 0, out: 'SYNTAX files=' + files.length + ' failed=' + failed.length + '\n' + failed.join('\n'),
    metrics: { unique: files.length, trials: files.length, checks: files.length, failures: failed.length } };
}

/**
 * Executes PENDING/INTERRUPTED suites in order, checkpointing after each one.
 * A suite still marked RUNNING (crash) becomes INTERRUPTED and is rerun.
 */
export async function runCampaign({ id, kind = 'offline', root = REPO_ROOT, only = null, force = false, retryFailed = false,
  suites = SUITES, timeoutMs = 30 * 60_000, log = console.log, git = gitInfo, signalTarget = process, reportOptions = {} } = {}) {
  const campaign = await createOrLoadCampaign({ id, root, suites, git });
  const { dir, state, stateFile } = campaign;
  const release = await acquireLock(dir);
  const env = sanitizedEnv();
  let current = null, cancelled = false;
  const onSignal = () => { cancelled = true; killTree(current); };
  signalTarget.on?.('SIGINT', onSignal); signalTarget.on?.('SIGTERM', onSignal);
  const save = async () => { state.updatedAt = new Date().toISOString(); await writeJsonAtomic(stateFile, state); };
  try {
    for (const entry of Object.values(state.suites)) if (entry.status === 'RUNNING') entry.status = 'INTERRUPTED';
    await save();
    for (const suite of planSuites(kind, { only, suites })) {
      const entry = state.suites[suite.id];
      const done = entry.status === 'PASS' || entry.status === 'NOT_AVAILABLE' || (entry.status === 'FAIL' && !retryFailed);
      if (done && !force) { log('SKIP', suite.id, entry.status, '(checkpoint)'); continue; }
      if (cancelled) break;
      const script = suite.syntax ? null : (typeof suite.args === 'function' ? suite.args(dir) : suite.args);
      if (script && !existsSync(join(root, script[0]))) {
        Object.assign(entry, { status: 'NOT_AVAILABLE', reason: 'missing ' + script[0], finishedAt: new Date().toISOString() });
        await save(); log('NOT_AVAILABLE', suite.id); continue;
      }
      Object.assign(entry, { status: 'RUNNING', startedAt: new Date().toISOString(), attempts: (entry.attempts ?? 0) + 1 });
      await save();
      log('RUN', suite.id);
      const started = Date.now();
      const result = suite.syntax ? await runSyntaxSuite(root, env)
        : await runNode(script, { cwd: root, env, timeoutMs: suite.timeoutMs ?? timeoutMs, onChild: child => { current = child; } });
      const clean = redact(result.out);
      await writeFile(join(dir, 'logs', suite.id + '.log'), clean.slice(-LOG_TAIL_BYTES));
      let metrics = result.metrics ?? {};
      if (!result.metrics && suite.parse) { try { metrics = suite.parse(clean) ?? {}; } catch { metrics = {}; } }
      const httpRequests = metrics.httpRequests ?? 0;
      const status = cancelled ? 'INTERRUPTED' : result.code === 0 && !(metrics.failures > 0) && httpRequests === 0 ? 'PASS' : 'FAIL';
      Object.assign(entry, { status, exitCode: result.code, durationMs: Date.now() - started, finishedAt: new Date().toISOString(),
        metrics: { unique: metrics.unique ?? null, trials: metrics.trials ?? null, checks: metrics.checks ?? null,
          failures: metrics.failures ?? (result.code === 0 ? 0 : null), httpRequests, notes: metrics.notes ?? '' },
        evidence: suite.evidence, tail: clean.trim().split(/\r?\n/).slice(-3).join(' | ').slice(0, 400) });
      if (httpRequests) entry.reason = 'OFFLINE_SUITE_REPORTED_PROVIDER_REQUESTS';
      await save();
      log(status, suite.id, JSON.stringify(entry.metrics));
    }
  } finally {
    signalTarget.off?.('SIGINT', onSignal); signalTarget.off?.('SIGTERM', onSignal);
    await release();
  }
  await writeReport({ id, root, suites, ...reportOptions });
  return { dir, state, cancelled };
}

export function summarize(state, suites = SUITES) {
  const rows = suites.map(s => ({ id: s.id, kind: s.kind, evidence: s.evidence, ...(state.suites[s.id] ?? { status: 'NOT_PLANNED' }) }));
  const totals = { suites: rows.length, pass: 0, fail: 0, pending: 0, notAvailable: 0, interrupted: 0,
    offlineChecks: 0, browserChecks: 0, unique: 0, trials: 0, httpRequests: 0 };
  for (const r of rows) {
    if (r.status === 'PASS') totals.pass += 1; else if (r.status === 'FAIL') totals.fail += 1;
    else if (r.status === 'NOT_AVAILABLE') totals.notAvailable += 1; else if (r.status === 'INTERRUPTED') totals.interrupted += 1;
    else totals.pending += 1;
    const m = r.metrics ?? {};
    if (r.status === 'PASS' || r.status === 'FAIL') {
      totals[r.kind === 'browser' ? 'browserChecks' : 'offlineChecks'] += m.checks ?? 0;
      totals.unique += m.unique ?? 0; totals.trials += m.trials ?? 0; totals.httpRequests += m.httpRequests ?? 0;
    }
  }
  return { rows, totals };
}

function moduleMatrixCsv(state) {
  const esc = v => '"' + String(v).replaceAll('"', '""') + '"';
  const lines = [['area', 'implementation', 'modules', 'suites', 'severity_if_broken', 'last_result'].join(',')];
  for (const row of MODULE_MATRIX) {
    const ids = row.suites.split(';').map(s => s.split(' ')[0]).filter(id => state.suites[id]);
    const statuses = ids.map(id => state.suites[id].status);
    const last = !statuses.length ? 'NOT_RUN' : statuses.includes('FAIL') ? 'FAIL'
      : statuses.every(s => s === 'PASS') ? 'PASS' : statuses.some(s => s === 'PASS') ? 'PARTIAL_RUN' : 'NOT_RUN';
    lines.push([row.area, row.implementation, row.modules, row.suites, row.severity, last].map(esc).join(','));
  }
  return lines.join('\n') + '\n';
}

export async function ledgerStatus({ file = null } = {}) {
  try {
    const { acquireGlobalSpendLedger, globalLedgerDefaultPath } = await import('../src/qa/globalSpendLedger.mjs');
    const path = file ?? globalLedgerDefaultPath();
    if (!existsSync(path)) return { available: false, reason: 'LEDGER_NOT_FOUND_ON_THIS_MACHINE' };
    const ledger = await acquireGlobalSpendLedger({ file: path, allowUpgrade: true });
    try { return { available: true, readOnly: true, ...ledger.status() }; } finally { await ledger.close(); }
  } catch (error) { return { available: false, reason: String(error.code ?? error.message).slice(0, 120) }; }
}

async function renderBacklog(root) {
  const file = join(root, 'docs', 'qa-evals-2026-11-01', 'defect-backlog.json');
  if (!existsSync(file)) return '# Defect backlog\n\nNo curated backlog file found.\n';
  const data = await readJson(file);
  const lines = ['# RUNQ long campaign — defect backlog', '', 'Source: docs/qa-evals-2026-11-01/defect-backlog.json', '',
    '| ID | Sev | Status | Area | Summary | Repro | Fix | Re-evaluation |', '|---|---|---|---|---|---|---|---|'];
  for (const d of data.defects) lines.push('| ' + [d.id, d.severity, d.status, d.area, d.summary, d.repro, d.fix ?? '', d.reevaluation ?? '']
    .map(v => String(v).replaceAll('|', '\\|').replace(/\r?\n/g, ' ')).join(' | ') + ' |');
  return lines.join('\n') + '\n';
}

export async function writeReport({ id, root = REPO_ROOT, suites = SUITES, ledgerFile = null, includeLedger = true }) {
  const dir = campaignDir(id, root);
  const manifest = await readJson(join(dir, 'run-manifest.json'));
  const state = await readJson(join(dir, 'resume-state.json'));
  const { rows, totals } = summarize(state, suites);
  const ledger = includeLedger ? await ledgerStatus({ file: ledgerFile }) : { available: false, reason: 'SKIPPED' };
  const costStatus = { generatedAt: new Date().toISOString(), note: 'Sanitized aggregate only; the ledger itself is never copied.',
    copilotCredits: 'Not tracked here; separate from Meta/Modal API budget.', ledger };
  await writeJsonAtomic(join(dir, 'cost-ledger-status.json'), costStatus);
  const pending = rows.filter(r => !['PASS', 'FAIL', 'NOT_AVAILABLE'].includes(r.status)).map(r => r.id);
  const summary = { campaignId: id, sha: manifest.git.sha, branch: manifest.git.branch, generatedAt: new Date().toISOString(), totals,
    suites: rows.map(r => ({ id: r.id, kind: r.kind, evidence: r.evidence, status: r.status, metrics: r.metrics ?? null, durationMs: r.durationMs ?? null })),
    notMeasured: ['Real Muse semantic accuracy against expert gold', 'Audible audio quality and device routing', 'Real microphone / voice follow (disabled: cap 0)'],
    nextResume: pending.length ? 'node tools/runq-campaign.mjs resume --id ' + id : null };
  await writeJsonAtomic(join(dir, 'summary.json'), summary);
  const fmt = v => v === null || v === undefined ? '—' : String(v);
  const md = ['# RUNQ long campaign — ' + id, '', 'SHA `' + manifest.git.sha + '` on `' + manifest.git.branch + '`; dirty entries at plan: ' + fmt(manifest.git.dirtyEntries) + '.', '',
    'Suites: ' + totals.pass + ' PASS / ' + totals.fail + ' FAIL / ' + totals.notAvailable + ' NOT_AVAILABLE / ' + totals.pending + ' PENDING / ' + totals.interrupted + ' INTERRUPTED (of ' + totals.suites + ').',
    'Offline checks: ' + totals.offlineChecks + '; browser checks: ' + totals.browserChecks + '; unique cases: ' + totals.unique + '; trials: ' + totals.trials + '; provider HTTP requests in these suites: ' + totals.httpRequests + '.', '',
    '| Suite | Kind | Evidence | Status | Unique | Trials | Checks | Failures | HTTP | Notes |', '|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(r => '| ' + [r.id, r.kind, r.evidence, r.status, fmt(r.metrics?.unique), fmt(r.metrics?.trials), fmt(r.metrics?.checks),
      fmt(r.metrics?.failures), fmt(r.metrics?.httpRequests), (r.metrics?.notes ?? r.reason ?? '').replaceAll('|', '\\|')].join(' | ') + ' |'),
    '', '## Not measured by these suites', '', ...summary.notMeasured.map(x => '- ' + x),
    '', '## Cost ledger (sanitized)', '', ledger.available
      ? '- Global reserved ' + ledger.reservedUsd + ' / ' + ledger.globalCapUsd + ' USD; ' + Object.entries(ledger.perProvider ?? {})
        .map(([p, v]) => p + ' ' + v.reservedUsd + '/' + v.capUsd + ' USD, ' + v.requestCount + '/' + fmt(v.requestCap) + ' req').join('; ')
      : '- Ledger not available: ' + ledger.reason,
    '', pending.length ? 'Resume: `' + summary.nextResume + '`' : 'All planned suites have a final status.', ''].join('\n');
  await writeFile(join(dir, 'summary.md'), md);
  await writeFile(join(dir, 'module-matrix.csv'), moduleMatrixCsv(state));
  await writeFile(join(dir, 'defect-backlog.md'), await renderBacklog(root));
  return summary;
}

export async function compareCampaigns({ base, candidate, root = REPO_ROOT, suites = SUITES }) {
  const load = async id => ({ manifest: await readJson(join(campaignDir(id, root), 'run-manifest.json')), state: await readJson(join(campaignDir(id, root), 'resume-state.json')) });
  const a = await load(base), b = await load(candidate);
  const lines = ['# RUNQ campaign comparison', '', 'Baseline `' + base + '` @ `' + a.manifest.git.sha + '` → candidate `' + candidate + '` @ `' + b.manifest.git.sha + '`', '',
    '| Suite | Base status | Cand. status | Base checks | Cand. checks | Base failures | Cand. failures | Δ failures |', '|---|---|---|---|---|---|---|---|'];
  const regressions = [];
  for (const s of suites) {
    const x = a.state.suites[s.id], y = b.state.suites[s.id];
    if (!x && !y) continue;
    const fx = x?.metrics?.failures ?? null, fy = y?.metrics?.failures ?? null;
    const delta = fx === null || fy === null ? '—' : String(fy - fx);
    if ((x?.status === 'PASS' && y?.status === 'FAIL') || (fx !== null && fy !== null && fy > fx)) regressions.push(s.id);
    lines.push('| ' + [s.id, x?.status ?? '—', y?.status ?? '—', x?.metrics?.checks ?? '—', y?.metrics?.checks ?? '—', fx ?? '—', fy ?? '—', delta].join(' | ') + ' |');
  }
  lines.push('', regressions.length ? 'REGRESSIONS: ' + regressions.join(', ') : 'No suite regressed from baseline to candidate.', '');
  const out = join(campaignDir(candidate, root), 'comparisons.md');
  await writeFile(out, lines.join('\n'));
  return { regressions, file: out };
}

/**
 * Paid pilots: fail-closed and delegated to the existing ledger-enforced
 * runners. Without both --live and --ack-paid this only prints the plan.
 */
export async function planLive({ provider, maxRequests, live = false, ackPaid = false, ledger = ledgerStatus, root = REPO_ROOT }) {
  if (typeof provider !== 'string' || !LIVE_PROVIDERS.includes(provider) || isCampaignProviderProhibited(provider))
    return { status: 'REFUSED', code: 'CAMPAIGN_PROVIDER_PROHIBITED', exitCode: 2 };
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > MAX_LIVE_REQUESTS_PER_INVOCATION)
    return { status: 'REFUSED', code: 'MAX_REQUESTS_OUT_OF_RANGE', exitCode: 2 };
  const status = await ledger();
  if (!status.available) return { status: 'BLOCKED', code: 'LEDGER_UNAVAILABLE', reason: status.reason, exitCode: 3 };
  const p = status.perProvider?.[provider];
  const reserveUsd = provider === 'meta' ? 0.15 : 0.05;
  if (!p || (p.requestsRemaining ?? 0) < maxRequests || p.remainingUsd < maxRequests * reserveUsd || status.remainingUsd < maxRequests * reserveUsd)
    return { status: 'BLOCKED', code: 'INSUFFICIENT_LEDGER_HEADROOM', provider: p ?? null, exitCode: 3 };
  const args = provider === 'meta'
    ? ['tools/runq-agent-live-eval.mjs', '--live', '--ack-paid', '--cases', String(maxRequests), '--providers', 'meta',
      '--budget-usd', '65', '--reserve-usd', String(reserveUsd), '--seed', '20261101']
    : ['tools/runq-modal-live-batch.mjs', '--live', '--ack-paid', '--count', String(maxRequests)];
  if (!existsSync(join(root, args[0]))) return { status: 'BLOCKED', code: 'RUNNER_NOT_AVAILABLE', exitCode: 3 };
  const plan = { status: live && ackPaid ? 'READY' : 'DRY_RUN', provider, maxRequests, retries: 0, command: ['node', ...args].join(' '),
    headroom: { requestsRemaining: p.requestsRemaining, providerRemainingUsd: p.remainingUsd, globalRemainingUsd: status.remainingUsd }, exitCode: 0 };
  return { ...plan, args };
}

export async function runLive(options) {
  const plan = await planLive(options);
  if (plan.status !== 'READY') return plan;
  const env = { ...process.env };
  for (const key of ['BASETEN_API_KEY', 'FIREWORKS_API_KEY']) delete env[key];
  const result = await runNode(plan.args, { cwd: options.root ?? REPO_ROOT, env, timeoutMs: 20 * 60_000 });
  return { ...plan, status: result.code === 0 ? 'COMPLETED' : 'FAILED_NO_RETRY', exitCode: result.code, tail: redact(result.out).trim().split(/\r?\n/).slice(-6) };
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (['--force', '--retry-failed', '--live', '--ack-paid'].includes(flag)) { options[flag.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = true; continue; }
    const key = { '--id': 'id', '--only': 'only', '--base': 'base', '--candidate': 'candidate', '--provider': 'provider', '--max-requests': 'maxRequests', '--root': 'root' }[flag];
    if (!key || rest[i + 1] === undefined) throw new TypeError('UNKNOWN_OR_INCOMPLETE_OPTION ' + flag);
    options[key] = rest[++i];
  }
  if (options.only) options.only = options.only.split(',');
  if (options.maxRequests !== undefined) options.maxRequests = /^\d+$/.test(options.maxRequests) ? Number(options.maxRequests) : NaN;
  if (options.root) options.root = resolve(options.root);
  return options;
}

function defaultId(root) {
  const sha = gitInfo(root).sha?.slice(0, 7) ?? 'nogit';
  return 'runq-' + new Date().toISOString().slice(0, 10) + '-' + sha;
}

async function main(argv) {
  const o = parseCli(argv);
  const root = o.root ?? REPO_ROOT;
  const id = o.id ?? (['plan', 'offline', 'browser', 'all'].includes(o.command) ? defaultId(root) : null);
  switch (o.command) {
    case 'plan': {
      const c = await createOrLoadCampaign({ id, root });
      console.log('CAMPAIGN_PLANNED', id, c.dir);
      for (const s of SUITES) console.log(' ', s.kind.padEnd(7), s.id.padEnd(24), c.state.suites[s.id].status);
      return 0;
    }
    case 'offline': case 'browser': case 'all': case 'resume': {
      if (!id) throw new TypeError('--id required');
      const kind = o.command === 'resume' ? 'all' : o.command;
      const r = await runCampaign({ id, kind, root, only: o.only, force: o.force, retryFailed: o.retryFailed });
      const { totals } = summarize(r.state);
      console.log('CAMPAIGN', id, 'PASS', totals.pass, 'FAIL', totals.fail, 'PENDING', totals.pending + totals.interrupted,
        'offlineChecks', totals.offlineChecks, 'browserChecks', totals.browserChecks, 'httpRequests', totals.httpRequests);
      console.log('Reports:', r.dir);
      return r.cancelled ? 130 : totals.fail ? 1 : 0;
    }
    case 'status': {
      const state = await readJson(join(campaignDir(id, root), 'resume-state.json'));
      for (const [suite, entry] of Object.entries(state.suites)) console.log(suite.padEnd(24), entry.status.padEnd(13), JSON.stringify(entry.metrics ?? {}));
      return 0;
    }
    case 'report': { const s = await writeReport({ id, root }); console.log(JSON.stringify(s.totals)); return 0; }
    case 'compare': { const r = await compareCampaigns({ base: o.base, candidate: o.candidate, root }); console.log(r.regressions.length ? 'REGRESSIONS ' + r.regressions.join(',') : 'NO_REGRESSIONS', r.file); return r.regressions.length ? 1 : 0; }
    case 'live': {
      const r = await runLive({ provider: o.provider, maxRequests: o.maxRequests, live: o.live, ackPaid: o.ackPaid, root });
      const { args, ...visible } = r;
      console.log(JSON.stringify(visible, null, 2));
      return r.exitCode ?? 1;
    }
    default:
      console.error('Usage: node tools/runq-campaign.mjs plan|offline|browser|all|resume|status|report|compare|live [options]');
      return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; },
    error => { console.error('CAMPAIGN_ERROR', redact(error.code ?? error.message)); process.exitCode = 1; });
}
