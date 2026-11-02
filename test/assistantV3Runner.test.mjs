import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {
  callAssistantV3Request, makeAssistantV3Checkpoint, parseArgs, resumeAssistantV3Live,
  runAssistantV3Live, summarizeAssistantV3Checkpoint,
} from '../tools/runq-assistant-v3.mjs';
import {ASSISTANT_V3_ENDPOINT} from '../src/qa/assistantV3Budget.mjs';
import {loadAssistantV3Corpus, makeAssistantV3Case} from '../src/qa/assistantV3Evaluation.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
function id(suffix) {
  const digest = hash(suffix);
  return {
    requestId: `v3-${digest}`,
    runId: `v3-run-${digest.slice(0, 32)}`,
    sourceSha256: hash('src'),
    corpusSha256: hash('corpus'),
    caseSha256: hash(suffix),
    variant: 'C',
  };
}
async function setup(t) {
  const dir = join(process.cwd(), `.assistant-v3-runner-test-${process.pid}-${randomUUID()}`);
  await mkdir(dir, {recursive: true});
  t.after(() => rm(dir, {recursive: true, force: true}));
  return dir;
}
async function safetyCase() {
  const {data} = await loadAssistantV3Corpus();
  return makeAssistantV3Case(data.scenarios.find(item => item.family === 'safety-boundary'), 0,
    Date.parse('2026-11-01T22:00:00.000Z'));
}
function checkpointFor(requestId) {
  const record = {
    requestId, status: 'PLANNED', variant: 'C', scenarioId: 'validation-safety-80',
    split: 'validation', family: 'safety-boundary', turn: 0,
    caseSha256: hash('case'), inputSha256: hash('input'),
    latencyMs: null, usage: null, usageCostEstimateUsd: null, grade: null, errorCode: null,
  };
  return {version: 1, runId: 'a'.repeat(32), status: 'READY', providerRequests: 0, tasks: [record]};
}
function fakeBudget({reserveError = null} = {}) {
  const calls = {reserve: 0, marks: [], entry: null};
  return {
    calls,
    async reserve(identity) {
      calls.reserve++;
      if (reserveError) throw new Error(reserveError);
      calls.entry = identity;
      return {eurMicros: 1_650_088, usdMicros: 1_320_070, createdAt: '2026-11-01T22:00:00.000Z'};
    },
    async mark(identity, status) {
      calls.marks.push(status);
      assert.equal(identity.requestId, calls.entry.requestId);
      return {status};
    },
  };
}
function replyBody() {
  return JSON.stringify({
    choices: [{
      finish_reason: 'stop',
      message: {content: JSON.stringify({
        status: 'ANSWER',
        message: 'I cannot start playback or execute GO; nothing has been played.',
        operations: [],
      })},
    }],
    usage: {prompt_tokens: 300, completion_tokens: 70, total_tokens: 370},
  });
}

test('live commands require explicit acknowledgement and bounded request count', () => {
  assert.throws(() => parseArgs(['ai-live', '--limit', '4']), /INVALID_V3_EVALUATION_OPTIONS/);
  assert.throws(() => parseArgs(['ai-live', '--limit', '13', '--live', '--ack-paid']),
    /INVALID_V3_EVALUATION_OPTIONS/);
  assert.throws(() => parseArgs(['resume', '--run', 'a'.repeat(32)]),
    /INVALID_V3_EVALUATION_OPTIONS/);
  assert.deepEqual(parseArgs(['ai-live', '--limit', '4', '--live', '--ack-paid']), {
    command: 'ai-live', split: 'development', limit: 4, run: null,
    live: true, ackPaid: true, write: true,
    caseStart:0,suite:'pending',family:null,
    variants:['A','B','C','D'],
  });
});

test('missing key prevents checkpoint creation and never calls provider', async () => {
  let fetches = 0;
  await assert.rejects(runAssistantV3Live({
    split: 'development', limit: 4, live: true, ackPaid: true,
    getKey: () => '', fetchImpl: async () => { fetches++; },
  }), /V3_META_KEY_NOT_CONFIGURED/);
  assert.equal(fetches, 0);
});

test('successful one-shot call persists only derived facts and usage', async t => {
  const dir = await setup(t);
  const caseData = await safetyCase();
  const identity = id('safe-success');
  const task = {variant: 'C'};
  const checkpoint = checkpointFor(identity.requestId);
  const budget = fakeBudget();
  let fetchCount = 0;
  const result = await callAssistantV3Request({
    caseData, task, identity, budget, checkpoint,
    checkpointFile: join(dir, 'checkpoint.json'),
    live: true, ackPaid: true, getKey: () => 'test-only-fake-key',
    fetchImpl: async (url, options) => {
      fetchCount++;
      assert.equal(url, ASSISTANT_V3_ENDPOINT);
      assert.equal(options.method, 'POST');
      assert.match(options.headers.Authorization, /^Bearer test-only-fake-key$/);
      return {ok: true, text: async () => replyBody()};
    },
  });
  assert.equal(fetchCount, 1);
  assert.equal(budget.calls.reserve, 1);
  assert.deepEqual(budget.calls.marks, ['COMPLETED']);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.grade.contractPass, true);
  assert.equal(result.usage.totalTokens, 370);
  const saved = await readFile(join(dir, 'checkpoint.json'), 'utf8');
  assert.doesNotMatch(saved, /test-only-fake-key|nothing has been played|Execute GO now/);
  assert.match(saved, /payloadSha256/);
  assert.match(saved, /NOT_RATED/);
});

for (const status of [401, 402, 429]) {
  test(`HTTP ${status} is one reserved unknown request and stops without retry`, async t => {
    const dir = await setup(t);
    const caseData = await safetyCase();
    const identity = id(`http-${status}`);
    const checkpoint = checkpointFor(identity.requestId);
    const budget = fakeBudget();
    let fetches = 0;
    await assert.rejects(callAssistantV3Request({
      caseData, task: {variant: 'C'}, identity, budget, checkpoint,
      checkpointFile: join(dir, 'checkpoint.json'),
      live: true, ackPaid: true, getKey: () => 'fake-key',
      fetchImpl: async () => { fetches++; return {ok: false, status}; },
    }), new RegExp(`V3_PROVIDER_HTTP_${status}_STOP`));
    assert.equal(fetches, 1);
    assert.equal(budget.calls.reserve, 1);
    assert.deepEqual(budget.calls.marks, ['UNKNOWN']);
    assert.equal(checkpoint.tasks[0].status, 'UNKNOWN');
  });
}

test('timeout preserves UNKNOWN reservation and does not retry', async t => {
  const dir = await setup(t);
  const caseData = await safetyCase();
  const identity = id('timeout');
  const checkpoint = checkpointFor(identity.requestId);
  const budget = fakeBudget();
  let fetches = 0;
  await assert.rejects(callAssistantV3Request({
    caseData, task: {variant: 'C'}, identity, budget, checkpoint,
    checkpointFile: join(dir, 'checkpoint.json'),
    live: true, ackPaid: true, timeoutMs: 2, getKey: () => 'fake-key',
    fetchImpl: async (_url, options) => {
      fetches++;
      return new Promise((_resolve, reject) => {
        if (options.signal.aborted) {
          const error = new Error('timeout'); error.name = 'AbortError'; reject(error);
          return;
        }
        options.signal.addEventListener('abort', () => {
          const error = new Error('timeout'); error.name = 'AbortError'; reject(error);
        }, {once: true});
      });
    },
  }), /V3_PROVIDER_OUTCOME_UNKNOWN/);
  assert.equal(fetches, 1);
  assert.deepEqual(budget.calls.marks, ['UNKNOWN']);
  assert.equal(checkpoint.tasks[0].status, 'UNKNOWN');
});

test('ledger reservation failure blocks transport', async t => {
  const dir = await setup(t);
  const caseData = await safetyCase();
  const identity = id('ledger-error');
  const checkpoint = checkpointFor(identity.requestId);
  const budget = fakeBudget({reserveError: 'CAMPAIGN_GLOBAL_LOCKED'});
  let fetches = 0;
  await assert.rejects(callAssistantV3Request({
    caseData, task: {variant: 'C'}, identity, budget, checkpoint,
    checkpointFile: join(dir, 'checkpoint.json'),
    live: true, ackPaid: true, getKey: () => 'fake-key',
    fetchImpl: async () => { fetches++; },
  }), /V3_EVALUATION_STOPPED/);
  assert.equal(fetches, 0);
  assert.equal(budget.calls.reserve, 1);
  assert.deepEqual(budget.calls.marks, []);
  assert.equal(checkpoint.tasks[0].status, 'PLANNED');
});

test('resume reuses the same paired request identities and sends only planned tasks', async t => {
  const dir = await setup(t);
  const {checkpoint, scheduled} = await makeAssistantV3Checkpoint({split: 'development', limit: 4});
  assert.deepEqual(scheduled.map(item => item.variant), ['A', 'B', 'C', 'D']);
  checkpoint.tasks[0].status = 'COMPLETED';
  checkpoint.tasks[0].grade = null;
  checkpoint.tasks[1].status = 'COMPLETED';
  checkpoint.tasks[1].grade = null;
  checkpoint.providerRequests = 2;
  const checkpointFile = join(dir, `${checkpoint.runId}.json`);
  await writeFile(checkpointFile, `${JSON.stringify(checkpoint)}\n`);
  const calls = {lookups: [], reserves: [], marks: [], fetches: 0};
  const alreadyCompleted = new Set(checkpoint.tasks.slice(0, 2).map(item => item.requestId));
  const budgetFactory = async () => ({
    async status() {
      return {
        remainingEur: 60,
        requestsRemaining: 1800,
        sharedMetaRequestsRemaining: 10,
        sharedMetaUsdRemaining: 20,
      };
    },
    async lookup(requestId) {
      calls.lookups.push(requestId);
      return alreadyCompleted.has(requestId) ? {status: 'COMPLETED'} : null;
    },
    async reserve(identity) {
      calls.reserves.push(identity.requestId);
      return {eurMicros: 1_650_088, usdMicros: 1_320_070, createdAt: '2026-11-01T22:00:00.000Z'};
    },
    async mark(identity, status) { calls.marks.push([identity.requestId, status]); },
  });
  const result = await resumeAssistantV3Live({
    runId: checkpoint.runId,
    checkpointDir: dir,
    budgetFactory,
    live: true,
    ackPaid: true,
    getKey: () => 'unit-test-only',
    fetchImpl: async () => {
      calls.fetches++;
      return {ok: true, text: async () => replyBody()};
    },
  });
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.providerRequests, 4);
  const summary = summarizeAssistantV3Checkpoint(result);
  assert.equal(summary.semanticRating, 'NOT_RATED');
  assert.equal(summary.byVariant.C.contractPasses, 0);
  assert.equal(summary.byVariant.D.contractPasses, 0);
  assert.equal(calls.fetches, 2);
  assert.deepEqual(calls.lookups, checkpoint.tasks.map(item => item.requestId));
  assert.equal(calls.reserves.length, 2);
  assert.deepEqual(calls.marks.map(item => item[1]), ['COMPLETED', 'COMPLETED']);
  const saved = await readFile(checkpointFile, 'utf8');
  assert.doesNotMatch(saved, /unit-test-only|door opens at midnight|quiet blue door texture/);
});

test('resume rejects tampered checkpoint identity before ledger lookup or provider transport', async t => {
  const dir = await setup(t);
  const {checkpoint} = await makeAssistantV3Checkpoint({split: 'development', limit: 4});
  checkpoint.tasks[0].requestId = `v3-${hash('different-request')}`;
  await writeFile(join(dir, `${checkpoint.runId}.json`), `${JSON.stringify(checkpoint)}\n`);
  let lookups = 0;
  let fetches = 0;
  await assert.rejects(resumeAssistantV3Live({
    runId: checkpoint.runId,
    checkpointDir: dir,
    budgetFactory: async () => ({
      async status() {
        return {
          remainingEur: 60,
          requestsRemaining: 1800,
          sharedMetaRequestsRemaining: 10,
          sharedMetaUsdRemaining: 20,
        };
      },
      async lookup() { lookups++; return null; },
    }),
    live: true,
    ackPaid: true,
    getKey: () => 'unit-test-only',
    fetchImpl: async () => { fetches++; },
  }), /V3_CHECKPOINT_SOURCE_MISMATCH/);
  assert.equal(lookups, 0);
  assert.equal(fetches, 0);
});
test('a bounded two-call A/D remeasurement is explicit and source-identified',async()=>{
  const opts=parseArgs(['ai-live','--limit','2','--variants','A,D','--live','--ack-paid']);
  const {checkpoint}=await makeAssistantV3Checkpoint(opts);
  assert.deepEqual(checkpoint.tasks.map(t=>t.variant),['A','D']);
  assert.equal(checkpoint.requestLimit,2);
  assert.throws(()=>parseArgs(['ai-live','--limit','2','--live','--ack-paid']));
  assert.throws(()=>parseArgs(['ai-live','--variants','D,A','--limit','2','--live','--ack-paid']));
});
