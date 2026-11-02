/**
 * RUNQ SFX readiness diagnostic. Offline only: never sends an HTTP request,
 * never reads billed ledgers and never prints endpoint, keys or .env values.
 */
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadLocalSfxEnvironment } from './dev-server.mjs';
import {
  createSfxJobStore, normalizeSfxCostPolicy,
} from '../src/core/sfxJobStore.mjs';
import { defaultSfxStoreDirectory } from './sfxRoutes.mjs';

const REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MODEL_REVISION_HINT = 'Use the confirmed SHA of stabilityai/stable-audio-3-small-sfx weights.';
const validModalEndpoint = value => {
  if (typeof value !== 'string' || !value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' &&
      u.hostname.endsWith('.modal.run') && !u.username && !u.password &&
      !u.port && !u.search && !u.hash && (u.pathname === '/' || u.pathname === '');
  } catch { return false; }
};
export function inspectSfxConfiguration(env={}) {
  const costInputs = {
    estimatedMaxCostUsdPerRequest: Number(env.RUNQ_SFX_ESTIMATED_MAX_COST_USD),
    dailyBudgetUsd: Number(env.RUNQ_SFX_DAILY_BUDGET_USD),
  };
  let policy = null;
  try { policy = normalizeSfxCostPolicy(costInputs); }
  catch { /* fail closed: no spending policy */ }
  const issues = [];
  const enabled = env.RUNQ_SFX_PILOT_ENABLED === '1';
  if (!enabled) issues.push('RUNQ_SFX_PILOT_ENABLED must equal 1 (only when ready to allow operator-authorized jobs).');
  if (!validModalEndpoint(env.MODAL_SFX_ENDPOINT)) {
    issues.push('MODAL_SFX_ENDPOINT missing or invalid: expected the deployed HTTPS Modal root URL.');
  }
  if (!/^wk-[A-Za-z0-9_-]+$/.test(env.MODAL_PROXY_TOKEN_ID??'')) {
    issues.push('MODAL_PROXY_TOKEN_ID is missing or not a Modal proxy token ID (wk-...).');
  }
  if (!/^ws-[A-Za-z0-9_-]+$/.test(env.MODAL_PROXY_TOKEN_SECRET??'')) {
    issues.push('MODAL_PROXY_TOKEN_SECRET is missing or not a Modal proxy secret (ws-...).');
  }
  if (policy === null) {
    issues.push('Cost policy invalid: set positive RUNQ_SFX_ESTIMATED_MAX_COST_USD and RUNQ_SFX_DAILY_BUDGET_USD; estimate must not exceed daily budget. Check at most 6 decimals.');
  }
  if (!REVISION.test(env.RUNQ_SFX_MODEL_REVISION??'')) {
    issues.push('RUNQ_SFX_MODEL_REVISION missing/invalid. '+MODEL_REVISION_HINT);
  }
  return Object.freeze({
    readyForOneAuthorizedRequest: issues.length === 0,
    configurationChecks: Object.freeze({
      pilotEnabled: enabled,
      endpointConfigured: validModalEndpoint(env.MODAL_SFX_ENDPOINT),
      proxyTokenIdConfigured: /^wk-[A-Za-z0-9_-]+$/.test(env.MODAL_PROXY_TOKEN_ID??''),
      proxyTokenSecretConfigured: /^ws-[A-Za-z0-9_-]+$/.test(env.MODAL_PROXY_TOKEN_SECRET??''),
      costPolicyValid: policy !== null,
      modelRevisionValid: REVISION.test(env.RUNQ_SFX_MODEL_REVISION??''),
    }),
    issues: Object.freeze(issues),
    // Only numerical caps and true/false checks are safe to show.
    costLimits: policy === null ? null : Object.freeze({
      estimatedMaxCostUsdPerRequest: policy.estimatedMaxCostUsdPerRequest,
      dailyBudgetUsd: policy.dailyBudgetUsd,
    }),
  });
}

export async function inspectLocalSfxConfiguration({filePath,baseEnv=process.env}={}) {
  const env = {...baseEnv};
  await loadLocalSfxEnvironment({...(filePath?{filePath}:{}),env});
  return inspectSfxConfiguration(env);
}

export async function inspectSfxJournal({ directory = defaultSfxStoreDirectory() } = {}) {
  const path = resolve(directory);
  try {
    const info = await stat(path);
    if (!info.isDirectory()) throw new Error('SFX_JOURNAL_NOT_DIRECTORY');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return Object.freeze({ path, exists: false, total: 0, active: 0, counts: Object.freeze({}) });
    }
    throw error;
  }
  const summary = await createSfxJobStore({ directory: path }).journalSummary();
  return Object.freeze({ path, exists: true, ...summary });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const r = await inspectLocalSfxConfiguration();
    console.log('RUNQ Sound Lab configuration (OFFLINE: no API calls, no billing):');
    for (const [key,passed] of Object.entries(r.configurationChecks)) {
      console.log('  '+(passed?'[PASS] ':'[FAIL] ')+key);
    }
    if (r.costLimits) console.log('  Policy caps: estimated maximum $'+
      r.costLimits.estimatedMaxCostUsdPerRequest+
      '/request; daily configured cap $'+r.costLimits.dailyBudgetUsd+
      ' (local reservation, NOT provider billing guarantee).');
    try {
      const journal = await inspectSfxJournal();
      console.log('  Journal (offline, aggregate only): '+journal.path+' · '+
        journal.total+' job(s), '+journal.active+' active/unresolved.');
    } catch {
      console.log('  Journal (offline, aggregate only): unreadable; investigate before submitting.');
    }
    for (const issue of r.issues) console.log('  - '+issue);
    if (r.readyForOneAuthorizedRequest) {
      console.log('LOCAL CONFIGURATION READY. Deployment, account permissions, provider balance and actual GPU inference remain UNVERIFIED.');
    } else {
      console.log('BLOCKED until required configuration is provided. No generation attempted.');
      process.exitCode=1;
    }
  } catch {
    console.error('SFX doctor could not inspect local settings. Check file access; secrets are not printed.');
    process.exitCode=1;
  }
}
