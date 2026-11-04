/**
 * One-shot, explicitly authorized Meta contract smoke test.
 *
 * This file never runs from npm test or the browser server. The CLI requires an
 * unmistakable flag, sends one tiny synthetic script, and performs zero retries.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  callMetaCueModel,
  DEFAULT_META_MODEL,
  sanitizeMetaDiagnostic,
} from '../src/core/metaCueProvider.mjs';
import { createNewShow } from '../src/core/workspace.mjs';
import { campaignMetaFetch } from './campaignFetch.mjs';

export const META_SMOKE_AUTHORIZATION_FLAG = '--authorize-one-billable-meta-request';

export async function runMetaSmoke({
  authorized = false,
  apiKey,
  modelClient = callMetaCueModel,
  campaignFetch = campaignMetaFetch,
} = {}) {
  if (authorized !== true) {
    throw new TypeError('Explicit authorization for one billable Meta request is required');
  }
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new TypeError('MODEL_API_KEY is required for the authorized smoke test');
  }
  if (typeof modelClient !== 'function') throw new TypeError('Invalid Meta smoke transport');

  const show = createNewShow({
    id: 'meta-smoke-synthetic',
    name: 'Meta contract smoke test',
    scriptText: 'SCENE 1\n(A small brass bell rings once.)\nALEX: We begin.',
  });

  // Deliberately exactly one call. Do not wrap this in retry logic.
  const request = {
    show,
    apiKey,
    model: DEFAULT_META_MODEL,
    scriptLanguage: 'en',
    analysisMode: 'SMOKE',
  };
  const result = await modelClient({...request,fetchImpl:campaignFetch});
  const proposals = result?.proposals;
  const expected = Array.isArray(proposals) && proposals.some(proposal =>
    proposal?.lineId === 'L2' && proposal.assetId === null &&
    typeof proposal.soundPrompt === 'string' && proposal.soundPrompt.trim()
  );
  if (!expected) {
    throw new TypeError('Smoke response did not contain the expected unbound L2 sound proposal');
  }
  return Object.freeze({
    ok: true,
    provider: 'META_MODEL_API',
    model: DEFAULT_META_MODEL,
    proposalCount: proposals.length,
    diagnostic: sanitizeMetaDiagnostic(result.diagnostics),
  });
}

async function main() {
  const authorized = process.argv.includes(META_SMOKE_AUTHORIZATION_FLAG);
  try {
    const result = await runMetaSmoke({
      authorized,
      apiKey: process.env.MODEL_API_KEY,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    // Never print an upstream body, model content, key, script, or stack trace.
    console.error(JSON.stringify({
      ok: false,
      code: typeof error?.safeCode === 'string' ? error.safeCode : 'SMOKE_NOT_COMPLETED',
      diagnostic: sanitizeMetaDiagnostic(error?.diagnostic),
    }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
