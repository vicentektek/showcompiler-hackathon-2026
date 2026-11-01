import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {CAMPAIGN_POLICY} from '../src/qa/campaignPolicy.mjs';
import {acquireGlobalSpendLedger} from '../src/qa/globalSpendLedger.mjs';
import {
  acquireAssistantV3Budget, ASSISTANT_V3_ENDPOINT, ASSISTANT_V3_MODEL,
  ASSISTANT_V3_POLICY, estimateAssistantV3Reserve, guardedAssistantV3Fetch,
  validateAssistantV3MetaRequest,
} from '../src/qa/assistantV3Budget.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
function identity(index, variant = 'A') {
  const suffix = hash(`identity-${index}-${variant}`);
  return {
    requestId: `v3-${suffix}`,
    runId: `v3-run-${suffix.slice(0, 32)}`,
    sourceSha256: hash('source'),
    corpusSha256: hash('corpus'),
    caseSha256: hash(`case-${index}`),
    variant,
  };
}
function globalLedger(count = 0, amountMicros = 1) {
  return {
    schemaVersion: 1,
    policyRevision: CAMPAIGN_POLICY.revision,
    authorizationStatus: 'LOCAL_OPERATOR_APPROVED',
    campaignId: 'v3-test-campaign',
    approvedAt: '2026-11-01T00:00:00.000Z',
    totalCapUsd: CAMPAIGN_POLICY.totalCapUsd,
    capsUsd: {...CAMPAIGN_POLICY.capsUsd},
    reservations: Array.from({length: count}, (_, index) => ({
      requestId: `historic-${String(index).padStart(6, '0')}`,
      runId: `historic-run-${String(index).padStart(6, '0')}`,
      provider: 'meta',
      amountMicros,
      status: 'RESERVED',
    })),
  };
}
async function setup({count = 399, amountMicros = 1} = {}) {
  const dir = join(process.cwd(), `.assistant-v3-budget-test-${process.pid}-${randomUUID()}`);
  await mkdir(dir, {recursive: true});
  const sharedFile = join(dir, 'shared.json');
  const sidecarFile = join(dir, 'v3.json');
  await writeFile(sharedFile, `${JSON.stringify(globalLedger(count, amountMicros), null, 2)}\n`);
  return {dir, sharedFile, sidecarFile};
}
function runChild(code, env) {
  return new Promise((resolveChild, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
      cwd: process.cwd(), env: {...process.env, ...env}, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', codeValue => resolveChild({code: codeValue, stdout, stderr}));
  });
}

test('one conservative maximum reserve is EUR 1.650088 and USD 1.320070', () => {
  assert.deepEqual(estimateAssistantV3Reserve(), {
    usdMicros: 1_320_070,
    eurMicros: 1_650_088,
    inputWindowTokens: 1_048_576,
    maxCompletionTokens: 2200,
  });
  assert.equal(ASSISTANT_V3_POLICY.requestCap, 1800);
  assert.equal(ASSISTANT_V3_POLICY.capEurMicros, 60_000_000);
});

test('Meta request validator accepts only the documented single text endpoint and payload', () => {
  const payload = {
    model: ASSISTANT_V3_MODEL,
    messages: [{role: 'developer', content: 'instructions'}, {role: 'user', content: 'synthetic'}],
    response_format: {type: 'json_schema', json_schema: {
      name: 'runq_agent_plan_v1', strict: true, schema: {type: 'object'},
    }},
    reasoning_effort: 'low',
    max_completion_tokens: 2200,
    stream: false,
    store: false,
  };
  assert.equal(validateAssistantV3MetaRequest(ASSISTANT_V3_ENDPOINT, {
    method: 'POST', body: JSON.stringify(payload),
  }).model, ASSISTANT_V3_MODEL);
  for (const url of [
    'https://api.baseten.co/v1/chat/completions',
    'https://api.meta.ai/v1/audio/transcriptions',
    'https://api.meta.ai.evil.invalid/v1/chat/completions',
  ]) {
    assert.throws(() => validateAssistantV3MetaRequest(url, {method: 'POST', body: JSON.stringify(payload)}),
      /V3_META_ENDPOINT_OR_REQUEST_REJECTED/);
  }
  for (const changes of [
    {tools: [{type: 'web_search'}]},
    {n: 2},
    {stream: true},
    {store: true},
    {max_completion_tokens: 2201},
    {model: 'other-model'},
  ]) {
    assert.throws(() => validateAssistantV3MetaRequest(ASSISTANT_V3_ENDPOINT, {
      method: 'POST', body: JSON.stringify({...payload, ...changes}),
    }), /V3_META_PAYLOAD_OUT_OF_POLICY/);
  }
});

test('V3 liability counts in both ledgers and UNKNOWN cannot be retried or refunded', async t => {
  const files = await setup();
  t.after(() => rm(files.dir, {recursive: true, force: true}));
  const budget = await acquireAssistantV3Budget(files);
  const item = identity(1);
  const reservation = await budget.reserve(item);
  assert.equal(reservation.status, 'RESERVED');
  assert.equal(reservation.eurMicros, 1_650_088);
  await budget.mark(item, 'UNKNOWN');
  const status = await budget.status();
  assert.equal(status.requestCount, 1);
  assert.equal(status.reservedEur, 1.650088);
  assert.equal(status.requestsRemaining, 35);
  assert.equal(status.sharedMetaRequestsRemaining, 0);
  await assert.rejects(budget.reserve(item), /V3_DUPLICATE_OR_ALREADY_ATTEMPTED/);
  const old = JSON.parse(await readFile(files.sharedFile, 'utf8'));
  assert.equal(old.reservations.length, 400);
  assert.equal(old.reservations[399].status,'UNKNOWN');
  assert.equal(old.policyRevision, CAMPAIGN_POLICY.revision);
  assert.equal(old.extensionCampaigns[ASSISTANT_V3_POLICY.id].reservations[0].requestId, item.requestId);
  assert.equal(old.extensionCampaigns[ASSISTANT_V3_POLICY.id].reservations[0].status, 'UNKNOWN');
});

test('EUR authorization cannot bypass the still-active historical Meta cap', async t => {
  const files = await setup({count: 400});
  t.after(() => rm(files.dir, {recursive: true, force: true}));
  const before = JSON.parse(await readFile(files.sharedFile, 'utf8'));
  const oldRows = JSON.stringify(before.reservations);
  const oldCaps = JSON.stringify(before.capsUsd);
  const oldLedger = await acquireGlobalSpendLedger({file: files.sharedFile});
  const originalProductionStatus = oldLedger.status();
  await oldLedger.close();
  const budget = await acquireAssistantV3Budget(files);
  assert.equal((await budget.status()).requestsRemaining, 36);
  await assert.rejects(budget.reserve(identity(101)),/REQUEST_RESERVATIONS_OVER_CAP/);
  const status = await budget.status();
  const after = JSON.parse(await readFile(files.sharedFile, 'utf8'));
  assert.equal(JSON.stringify(after.reservations), oldRows);
  assert.equal(JSON.stringify(after.capsUsd), oldCaps);
  assert.equal(after.reservations.length, 400);
  assert.equal(status.sharedMetaRequestsRemaining, 0);
  assert.equal(status.requestsRemaining, 36);
  assert.equal(status.maxNewSafeRequests, 0);
  assert.equal(after.extensionCampaigns,undefined);
  const unchangedLedger = await acquireGlobalSpendLedger({file: files.sharedFile});
  assert.deepEqual(unchangedLedger.status(), originalProductionStatus);
  await unchangedLedger.close();
});

test('baseline reconciliation excludes only mirrored V3 rows and its own extension', async t => {
  const files = await setup();
  t.after(() => rm(files.dir, {recursive: true, force: true}));
  const shared = JSON.parse(await readFile(files.sharedFile, 'utf8'));
  shared.extensionCampaigns = {'another-campaign': {historyDigest: hash('other extension')}};
  await writeFile(files.sharedFile, `${JSON.stringify(shared, null, 2)}\n`);
  const budget = await acquireAssistantV3Budget(files);
  await budget.reserve(identity(106));
  assert.equal((await budget.status()).requestCount, 1);
  const changed = JSON.parse(await readFile(files.sharedFile, 'utf8'));
  changed.extensionCampaigns['another-campaign'].historyDigest = hash('changed history');
  await writeFile(files.sharedFile, `${JSON.stringify(changed, null, 2)}\n`);
  await assert.rejects(budget.status(), /V3_SHARED_HISTORY_CHANGED_RECONCILE_REQUIRED/);
});

test('EUR cap is exact, retains full reservations, and blocks the 37th call', async t => {
  const files = await setup({count: 364});
  t.after(() => rm(files.dir, {recursive: true, force: true}));
  const budget = await acquireAssistantV3Budget(files);
  for (let index = 0; index < 36; index++) await budget.reserve(identity(index));
  const status = await budget.status();
  assert.equal(status.requestCount, 36);
  assert.equal(status.reservedEur, 59.403168);
  assert.equal(status.remainingEur, 0.596832);
  await assert.rejects(budget.reserve(identity(36)), /V3_EUR_BUDGET_LIMIT/);
  assert.equal((await budget.status()).requestCount, 36);
});

test('cross-process same-ID races serialize on the production global lock', async t => {
  const files = await setup();
  t.after(() => rm(files.dir, {recursive: true, force: true}));
  const moduleUrl = new URL('../src/qa/assistantV3Budget.mjs', import.meta.url).href;
  const childCode = `
    const {acquireAssistantV3Budget} = await import(process.env.V3_TEST_MODULE);
    const digest = process.env.V3_TEST_HASH;
    const identity = {
      requestId: 'v3-' + digest,
      runId: 'v3-run-' + digest.slice(0, 32),
      sourceSha256: digest, corpusSha256: digest, caseSha256: digest, variant: 'A'
    };
    try {
      const budget = await acquireAssistantV3Budget({
        sharedFile: process.env.V3_TEST_SHARED,
        sidecarFile: process.env.V3_TEST_SIDECAR
      });
      await budget.reserve(identity);
      console.log('RESERVED');
    } catch (error) { console.log(error.message); }
  `;
  const env = suffix => ({
    V3_TEST_MODULE: moduleUrl,
    V3_TEST_SHARED: files.sharedFile,
    V3_TEST_SIDECAR: files.sidecarFile,
    V3_TEST_HASH: hash(suffix),
  });
  const results = await Promise.all([
    runChild(childCode, env('parallel-same-id')),
    runChild(childCode, env('parallel-same-id')),
  ]);
  assert.equal(results.filter(result => result.stdout.trim() === 'RESERVED').length, 1, JSON.stringify(results));
  assert.equal(results.every(result => result.code === 0), true);
  const state = JSON.parse(await readFile(files.sharedFile, 'utf8'));
  assert.equal(state.reservations.length, 400);
  assert.equal(state.extensionCampaigns[ASSISTANT_V3_POLICY.id].reservations.length, 1);
  const sidecar = JSON.parse(await readFile(files.sidecarFile, 'utf8'));
  assert.equal(sidecar.reservations.length, 1);
});

test('missing, corrupt, and mismatched ledgers fail closed without replacement', async t => {
  const dir = join(process.cwd(), `.assistant-v3-invalid-test-${process.pid}-${randomUUID()}`);
  await mkdir(dir, {recursive: true});
  t.after(() => rm(dir, {recursive: true, force: true}));
  const missing = await acquireAssistantV3Budget({
    sharedFile: join(dir, 'missing.json'), sidecarFile: join(dir, 'sidecar.json'),
  });
  await assert.rejects(missing.status(), /NO_APPROVED_LOCAL_BUDGET_FILE/);
  const corruptFile = join(dir, 'corrupt.json');
  await writeFile(corruptFile, '{bad');
  const corrupt = await acquireAssistantV3Budget({sharedFile: corruptFile, sidecarFile: join(dir, 'bad-sidecar.json')});
  await assert.rejects(corrupt.status());
  const files = await setup();
  t.after(() => rm(files.dir, {recursive: true, force: true}));
  const budget = await acquireAssistantV3Budget(files);
  await budget.reserve(identity(9));
  const changed = JSON.parse(await readFile(files.sharedFile, 'utf8'));
  changed.reservations[0].amountMicros = 2;
  await writeFile(files.sharedFile, `${JSON.stringify(changed)}\n`);
  await assert.rejects(budget.status(), /V3_SHARED_HISTORY_CHANGED_RECONCILE_REQUIRED/);

  const second = await setup();
  t.after(() => rm(second.dir, {recursive: true, force: true}));
  const secondBudget = await acquireAssistantV3Budget(second);
  await secondBudget.reserve(identity(10));
  await rm(second.sidecarFile);
  await assert.rejects(secondBudget.status(), /V3_BUDGET_LEDGER_MISMATCH/);
});

test('sidecar rejects a positive EUR amount below the published fixed reservation', async t => {
  const files = await setup();
  t.after(() => rm(files.dir, {recursive: true, force: true}));
  const budget = await acquireAssistantV3Budget(files);
  await budget.reserve(identity(102));
  const sidecar = JSON.parse(await readFile(files.sidecarFile, 'utf8'));
  sidecar.reservations[0].eurMicros = 1;
  await writeFile(files.sidecarFile, `${JSON.stringify(sidecar)}\n`);
  await assert.rejects(budget.status(), /V3_BUDGET_SIDECAR_CORRUPT/);
});

test('global-first extension write with failed sidecar mirror blocks future reservations', async t => {
  const files = await setup({count: 399});
  t.after(() => rm(files.dir, {recursive: true, force: true}));
  const before = JSON.parse(await readFile(files.sharedFile, 'utf8'));
  const budget = await acquireAssistantV3Budget({
    ...files,
    writeSidecarImpl: async () => { throw new Error('injected mirror failure'); },
  });
  await assert.rejects(budget.reserve(identity(103)), /injected mirror failure/);
  const after = JSON.parse(await readFile(files.sharedFile, 'utf8'));
  assert.deepEqual(after.reservations.slice(0,399), before.reservations);
  assert.equal(after.reservations[399].status,'RESERVED');
  assert.deepEqual(after.capsUsd, before.capsUsd);
  assert.equal(after.extensionCampaigns[ASSISTANT_V3_POLICY.id].reservations.length, 1);
  const reconciler = await acquireAssistantV3Budget(files);
  await assert.rejects(reconciler.status(), /V3_BUDGET_LEDGER_MISMATCH/);
  await assert.rejects(reconciler.reserve(identity(104)), /V3_BUDGET_LEDGER_MISMATCH/);
});

test('shared production lock failure blocks extension writes', async t => {
  const files = await setup({count: 400});
  t.after(() => rm(files.dir, {recursive: true, force: true}));
  const before = await readFile(files.sharedFile, 'utf8');
  await writeFile(`${files.sharedFile}.lock`, 'held by another process');
  const budget = await acquireAssistantV3Budget(files);
  await assert.rejects(budget.reserve(identity(105)), /CAMPAIGN_GLOBAL_LOCKED/);
  assert.equal(await readFile(files.sharedFile, 'utf8'), before);
  await assert.rejects(readFile(files.sidecarFile, 'utf8'), {code: 'ENOENT'});
});

test('stale pricing authorization blocks reservations', async t => {
  const files = await setup();
  t.after(() => rm(files.dir, {recursive: true, force: true}));
  const budget = await acquireAssistantV3Budget({...files, now: () => Date.parse('2026-11-03T00:00:00.000Z')});
  await assert.rejects(budget.reserve(identity(11)), /V3_PRICING_VERIFICATION_EXPIRED/);
  assert.equal(JSON.parse(await readFile(files.sharedFile, 'utf8')).reservations.length, 399);
});

test('invalid provider routes are rejected before reservation or fetch', async () => {
  let reserved = 0, fetched = 0;
  await assert.rejects(guardedAssistantV3Fetch({
    url: 'https://api.baseten.co/v1/chat/completions',
    options: {method: 'POST', body: '{}'},
    identity: identity(12),
    budget: {reserve: async () => { reserved++; }},
    fetchImpl: async () => { fetched++; },
  }), /V3_META_ENDPOINT_OR_REQUEST_REJECTED/);
  assert.equal(reserved, 0);
  assert.equal(fetched, 0);
});
