#!/usr/bin/env node
/**
 * RUNQ Assistant V3 evaluation. Offline by default. Live Meta requests are
 * serialized, explicitly opted in, reserved before fetch, and never retried.
 * Checkpoints and reports contain hashes/derived facts only, never prompts,
 * scripts, credentials, or model response text.
 */
import {createHash} from 'node:crypto';
import {mkdir, open, readFile, readdir, rename, stat, unlink, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  acquireAssistantV3Budget, ASSISTANT_V3_ENDPOINT, ASSISTANT_V3_MODEL,
  estimateAssistantV3Reserve,
  ASSISTANT_V3_POLICY, guardedAssistantV3Fetch,
} from '../src/qa/assistantV3Budget.mjs';
import {
  assistantV3SourceFingerprint, baselineAssistantV3Evaluation,
  buildAssistantV3Payload, createAssistantV3Tasks, decodeAndGradeAssistantV3,
  countPendingAssistantV3BySplit, loadAssistantV3Corpus, offlineAssistantV3Evaluation,
} from '../src/qa/assistantV3Evaluation.mjs';

const OUTPUT = resolve('artifacts/qa-assistant-v3');
const CHECKPOINTS = join(OUTPUT, 'checkpoints');
const REPORTS = join(OUTPUT, 'reports');
const MAX_REPLY_BYTES = 24_000;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value);

function fixedErrorCode(error) {
  const allowed = new Set([
    'V3_PRICING_VERIFICATION_EXPIRED', 'V3_META_ENDPOINT_OR_REQUEST_REJECTED',
    'V3_META_PAYLOAD_INVALID', 'V3_META_PAYLOAD_OUT_OF_POLICY',
    'V3_BUDGET_REQUIRED', 'V3_RESERVATION_IDENTITY_INVALID',
    'V3_DUPLICATE_OR_ALREADY_ATTEMPTED', 'V3_EUR_BUDGET_LIMIT',
    'V3_SHARED_HISTORY_CHANGED_RECONCILE_REQUIRED', 'V3_BUDGET_LEDGER_MISMATCH',
    'V3_BUDGET_SIDECAR_INVALID', 'V3_BUDGET_SIDECAR_CORRUPT',
    'V3_SHARED_BUDGET_BUDGET_LIMIT', 'V3_SHARED_BUDGET_REQUEST_LIMIT',
    'V3_SHARED_BUDGET_DUPLICATE_ID', 'V3_SHARED_BUDGET_PROVIDER_PROHIBITED',
    'V3_PROVIDER_OUTCOME_UNKNOWN', 'V3_RESPONSE_INVALID', 'V3_RESPONSE_TOO_LARGE',
  ]);
  if (allowed.has(error?.message)) return error.message;
  const status = /^V3_PROVIDER_HTTP_(401|402|429|[45]\d\d)_STOP$/.exec(error?.message ?? '');
  if (status) return error.message;
  return 'V3_EVALUATION_STOPPED';
}

export function parseArgs(argv) {
  if (!argv.length) return {command: 'plan'};
  const [command, ...args] = argv;
  const allowed = new Set(['plan', 'baseline', 'ai-offline', 'ai-live', 'resume', 'status', 'report', 'compare']);
  if (!allowed.has(command)) throw new TypeError('UNKNOWN_COMMAND');
  const options = {command, split: 'development', limit: null, run: null, live: false, ackPaid: false, write: true,
    caseStart:0,suite:'pending',family:null,variants:['A','B','C','D']};
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (seen.has(arg)) throw new TypeError('DUPLICATE_OPTION');
    seen.add(arg);
    if (arg === '--live') { options.live = true; continue; }
    if (arg === '--ack-paid') { options.ackPaid = true; continue; }
    if (arg === '--no-write') { options.write = false; continue; }
    if (!['--split', '--limit', '--run','--start-case','--suite','--family','--variants'].includes(arg)) throw new TypeError('UNKNOWN_OPTION');
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new TypeError('MISSING_OPTION_VALUE');
    if (arg === '--split') options.split = value;
    if (arg === '--limit') options.limit = Number(value);
    if (arg === '--run') options.run = value;
    if (arg === '--start-case') options.caseStart = Number(value);
    if (arg === '--suite') options.suite = value;
    if (arg === '--family') options.family = value;
    if (arg === '--variants') options.variants=value.split(',');
  }
  if (!['development', 'validation', 'holdout', 'all'].includes(options.split) ||
      (options.limit !== null && ![2,4, 8, 12].includes(options.limit)) ||
      (options.run !== null && !/^[a-f0-9]{32}$/.test(options.run)) ||
      options.live !== options.ackPaid ||
      ((command === 'ai-live' || command === 'resume') &&
        (!options.live || !options.ackPaid || options.limit === null && command === 'ai-live')) ||
      (command !== 'ai-live' && command !== 'resume' && (options.live || options.ackPaid))) {
    throw new TypeError('INVALID_V3_EVALUATION_OPTIONS');
  }
  if(!['A,B,C,D','A,D'].includes(options.variants.join(','))||
    (options.limit===2&&options.variants.join(',')!=='A,D'))
    throw new TypeError('INVALID_V3_EVALUATION_OPTIONS');
  if(!Number.isSafeInteger(options.caseStart)||options.caseStart<0||
    !['pending','supplementary'].includes(options.suite)||
    (options.family!==null&&!['source-grounding','cue-identity','capability-boundary',
      'memory-confirmation','ambiguous-intent','safety-boundary'].includes(options.family)))
    throw new TypeError('INVALID_V3_EVALUATION_OPTIONS');
  return options;
}

async function atomicJson(file, value) {
  await mkdir(join(file, '..'), {recursive: true});
  const temp = `${file}.tmp-${process.pid}`;
  let created = false;
  try {
    const handle = await open(temp, 'wx', 0o600);
    created = true;
    try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); }
    finally { await handle.close(); }
    await rename(temp, file);
  } catch (error) {
    if (created) {
      try { await unlink(temp); }
      catch(cleanup) { throw new AggregateError([error,cleanup],'V3_CHECKPOINT_CLEANUP_FAILED'); }
    }
    throw error;
  }
}

async function acquireRunnerLock(runId, checkpointDir = CHECKPOINTS) {
  await mkdir(checkpointDir, {recursive: true});
  const file = join(checkpointDir, `${runId}.lock`);
  let handle;
  try { handle = await open(file, 'wx', 0o600); }
  catch(error) {
    if(error.code==='EEXIST')throw new Error('V3_RUN_LOCKED');
    throw error;
  }
  return async () => {
    await handle.close();
    await unlink(file);
  };
}

function taskIdentity(task, sourceSha256, corpusSha256) {
  const identityHash = sha256(json({
    sourceSha256, corpusSha256, model: ASSISTANT_V3_MODEL,
    variant: task.variant, policyId: ASSISTANT_V3_POLICY.id,
    caseSha256: task.caseSha256,
  }));
  return {
    requestId: `v3-${identityHash}`,
    runId: `v3-run-${identityHash.slice(0, 32)}`,
    sourceSha256,
    corpusSha256,
    caseSha256: task.caseSha256,
    variant: task.variant,
  };
}

function makeCheckpointTask(task, identity) {
  return {
    scenarioId: task.scenarioId,
    split: task.split,
    family: task.family,
    turn: task.turn,
    variant: task.variant,
    requestId: identity.requestId,
    caseSha256: task.caseSha256,
    inputSha256: task.inputSha256,
    status: 'PLANNED',
    latencyMs: null,
    usage: null,
    usageCostEstimateUsd: null,
    grade: null,
    errorCode: null,
  };
}

export async function makeAssistantV3Checkpoint({split = 'development', limit = 4,
  caseStart=0,suite='pending',family=null,variants=['A','B','C','D']} = {}) {
  const [sourceSha256, loaded, scheduled] = await Promise.all([
    assistantV3SourceFingerprint(),
    loadAssistantV3Corpus(),
    createAssistantV3Tasks({split, limit,caseStart,suite,family,variants}),
  ]);
  if (scheduled.tasks.length !== limit) throw new TypeError('V3_LIMIT_EXCEEDS_SPLIT');
  const identityByTask = scheduled.tasks.map(task => taskIdentity(task, sourceSha256, scheduled.corpusSha256));
  const runHash = sha256(json({
    sourceSha256, corpusSha256: scheduled.corpusSha256, model: ASSISTANT_V3_MODEL,
    policyId: ASSISTANT_V3_POLICY.id, split, limit,
    requests: identityByTask.map(item => item.requestId),
  }));
  const runId = runHash.slice(0, 32);
  return {
    checkpoint: {
      version: 1,
      runId,
      mode: 'META_AI_ONLY',
      split,
      caseStart,suite,family,variants,
      requestLimit: limit,
      sourceSha256,
      corpusSha256: scheduled.corpusSha256,
      model: ASSISTANT_V3_MODEL,
      policyId: ASSISTANT_V3_POLICY.id,
      promptVersion: 'agent-expert-context-v3-1',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'READY',
      providerRequests: 0,
      tasks: scheduled.tasks.map((task, index) => makeCheckpointTask(task, identityByTask[index])),
    },
    scheduled: scheduled.tasks,
    sourceSha256,
    corpusSha256: loaded.sha256,
  };
}

function validateCheckpoint(checkpoint) {
  const checkpointKeys = new Set([
    'version', 'runId', 'mode', 'split', 'requestLimit', 'sourceSha256', 'corpusSha256',
    'model', 'policyId', 'promptVersion', 'startedAt', 'updatedAt', 'status',
    'providerRequests', 'tasks',
    'caseStart','suite','family',
    'variants',
  ]);
  const taskKeys = new Set([
    'scenarioId', 'split', 'family', 'turn', 'variant', 'requestId',
    'caseSha256', 'inputSha256', 'status', 'latencyMs', 'usage',
    'usageCostEstimateUsd', 'grade', 'errorCode', 'reservedEurMicros',
    'reservedUsdMicros', 'payloadSha256', 'reservedAt', 'completedAt',
  ]);
  const gradeKeys = new Set([
    'validSchema', 'expectedStatus', 'operationCount', 'onlyExpectedOperation',
    'targetMatches', 'sourceRefsKnown', 'expectedSourceRefPresent',
    'requiredConceptsPresent', 'forbiddenClaimsAbsent',
    'conceptMask',
    'capabilityEvidenceAvailable', 'capabilityMentioned', 'capabilityPathMentioned',
    'capabilityPrerequisiteMentioned', 'capabilityProhibitionRespected',
    'memoryProvided', 'expectedMemoryMentioned', 'memoryNotLeaked',
    'playbackClaimAbsent', 'statusAndShapePass', 'rubricCoverage',
    'contractPass', 'semanticRating',
  ]);
  const boolOrNull = value => value === null || typeof value === 'boolean';
  const validGrade = grade => grade === null || (
    grade && typeof grade === 'object' && !Array.isArray(grade) &&
    Object.keys(grade).every(key => gradeKeys.has(key)) &&
    [...gradeKeys].filter(key=>key!=='conceptMask').every(key => Object.hasOwn(grade, key)) &&
    (!Object.hasOwn(grade,'conceptMask')||grade.conceptMask===null||/^[01]{1,12}$/.test(grade.conceptMask))&&
    ['validSchema', 'expectedStatus', 'onlyExpectedOperation', 'sourceRefsKnown',
      'memoryProvided', 'statusAndShapePass', 'contractPass'].every(key => typeof grade[key] === 'boolean') &&
    ['targetMatches', 'expectedSourceRefPresent', 'capabilityEvidenceAvailable', 'capabilityMentioned',
      'capabilityPathMentioned', 'capabilityPrerequisiteMentioned', 'capabilityProhibitionRespected',
      'expectedMemoryMentioned', 'memoryNotLeaked', 'playbackClaimAbsent'].every(key => boolOrNull(grade[key])) &&
    ['requiredConceptsPresent','forbiddenClaimsAbsent'].every(key=>boolOrNull(grade[key]))&&
    Number.isSafeInteger(grade.operationCount) && grade.operationCount >= 0 &&
    ['DETERMINISTIC_CONTRACT_ORACLE', 'STATUS_AND_SHAPE_ONLY'].includes(grade.rubricCoverage) &&
    grade.semanticRating === 'NOT_RATED'
  );
  const validUsage = usage => usage === null || (
    usage && typeof usage === 'object' && !Array.isArray(usage) &&
    Object.keys(usage).every(key => ['promptTokens', 'completionTokens', 'totalTokens'].includes(key)) &&
    ['promptTokens', 'completionTokens', 'totalTokens'].every(key =>
      usage[key] === null || (Number.isSafeInteger(usage[key]) && usage[key] >= 0))
  );
  if (!checkpoint || checkpoint.version !== 1 || checkpoint.mode !== 'META_AI_ONLY' ||
      !/^[a-f0-9]{32}$/.test(checkpoint.runId ?? '') ||
      Object.keys(checkpoint).some(key => !checkpointKeys.has(key)) ||
      !/^[a-f0-9]{64}$/.test(checkpoint.sourceSha256 ?? '') ||
      !/^[a-f0-9]{64}$/.test(checkpoint.corpusSha256 ?? '') ||
      checkpoint.model !== ASSISTANT_V3_MODEL || checkpoint.policyId !== ASSISTANT_V3_POLICY.id ||
      !Number.isSafeInteger(checkpoint.caseStart)||checkpoint.caseStart<0||
      !['pending','supplementary'].includes(checkpoint.suite)||
      !(checkpoint.family===null||['source-grounding','cue-identity','capability-boundary',
        'memory-confirmation','ambiguous-intent','safety-boundary'].includes(checkpoint.family))||
      !['development', 'validation', 'holdout', 'all'].includes(checkpoint.split) ||
      (checkpoint.variants!==undefined&&
        (!Array.isArray(checkpoint.variants)||!['A,B,C,D','A,D'].includes(checkpoint.variants.join(','))))||
      ![2,4, 8, 12].includes(checkpoint.requestLimit) ||
      (checkpoint.requestLimit===2&&checkpoint.variants?.join(',')!=='A,D')||
      !['READY', 'RUNNING', 'PAUSED', 'STOPPED', 'COMPLETED'].includes(checkpoint.status) ||
      !Number.isSafeInteger(checkpoint.providerRequests) || checkpoint.providerRequests < 0 ||
      checkpoint.providerRequests > checkpoint.requestLimit ||
      typeof checkpoint.startedAt !== 'string' || !Number.isFinite(Date.parse(checkpoint.startedAt)) ||
      typeof checkpoint.updatedAt !== 'string' || !Number.isFinite(Date.parse(checkpoint.updatedAt)) ||
      !Array.isArray(checkpoint.tasks) || checkpoint.tasks.length !== checkpoint.requestLimit ||
      checkpoint.tasks.some(task => !task || !['PLANNED', 'RESERVED', 'COMPLETED', 'UNKNOWN', 'SKIPPED'].includes(task.status) ||
        Object.keys(task).some(key => !taskKeys.has(key)) ||
        !/^[a-z0-9-]{1,100}$/.test(task.scenarioId ?? '') ||
        !['development', 'validation', 'holdout'].includes(task.split) ||
        !/^[a-z0-9-]{1,80}$/.test(task.family ?? '') ||
        !Number.isSafeInteger(task.turn) || task.turn < 0 ||
        !/^v3-[a-f0-9]{64}$/.test(task.requestId) ||
        !/^[a-f0-9]{64}$/.test(task.caseSha256 ?? '') ||
        !/^[a-f0-9]{64}$/.test(task.inputSha256 ?? '') ||
        !['A', 'B', 'C', 'D'].includes(task.variant) ||
        !(task.latencyMs === null || (Number.isFinite(task.latencyMs) && task.latencyMs >= 0)) ||
        !validUsage(task.usage) || !validGrade(task.grade) ||
        !(task.usageCostEstimateUsd === null ||
          (Number.isFinite(task.usageCostEstimateUsd) && task.usageCostEstimateUsd >= 0)) ||
        !(task.errorCode === null || (typeof task.errorCode === 'string' && /^V3_[A-Z0-9_]{1,80}$/.test(task.errorCode))) ||
        !(task.reservedEurMicros === undefined || Number.isSafeInteger(task.reservedEurMicros)) ||
        !(task.reservedUsdMicros === undefined || Number.isSafeInteger(task.reservedUsdMicros)) ||
        !(task.payloadSha256 === undefined || /^[a-f0-9]{64}$/.test(task.payloadSha256)) ||
        !(task.reservedAt === undefined || (typeof task.reservedAt === 'string' && Number.isFinite(Date.parse(task.reservedAt)))) ||
        !(task.completedAt === undefined || (typeof task.completedAt === 'string' && Number.isFinite(Date.parse(task.completedAt)))))) {
    throw new TypeError('V3_CHECKPOINT_INVALID');
  }
  return checkpoint;
}

export function summarizeAssistantV3Checkpoint(checkpoint) {
  validateCheckpoint(checkpoint);
  const statuses = checkpoint.tasks.reduce((counts, task) => {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
    return counts;
  }, {});
  const byVariant = Object.fromEntries(['A', 'B', 'C', 'D'].map(variant => {
    const items = checkpoint.tasks.filter(task => task.variant === variant && task.grade);
    return [variant, {
      attempts: items.length,
      contractPasses: items.filter(item => item.grade.contractPass).length,
      expectedStatusMatches: items.filter(item => item.grade.expectedStatus).length,
      sourceReferencePasses: items.filter(item => item.grade.sourceRefsKnown && item.grade.expectedSourceRefPresent === true).length,
      playbackClaimsAbsent: items.filter(item => item.grade.playbackClaimAbsent === true).length,
      semanticRating: 'NOT_RATED',
    }];
  }));
  const latencies = checkpoint.tasks.map(task => task.latencyMs).filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = p => latencies.length ? latencies[Math.max(0, Math.ceil(p * latencies.length) - 1)] : null;
  const knownUsage = checkpoint.tasks.map(task => task.usageCostEstimateUsd).filter(Number.isFinite);
  const actualUsd = knownUsage
    .reduce((sum, value) => sum + value, 0);
  return {
    runId: checkpoint.runId,
    mode: checkpoint.mode,
    split: checkpoint.split,
    status: checkpoint.status,
    model: checkpoint.model,
    promptVersion: checkpoint.promptVersion,
    sourceSha256: checkpoint.sourceSha256,
    corpusSha256: checkpoint.corpusSha256,
    policyId: checkpoint.policyId,
    scheduledRequests: checkpoint.tasks.length,
    providerRequests: checkpoint.providerRequests,
    providerRequestCountType:'RESERVED_TRANSPORT_ATTEMPTS_NOT_BILLING_PROOF',
    completedResponses:checkpoint.tasks.filter(task=>task.status==='COMPLETED').length,
    statuses,
    byVariant,
    latencyMs: {p50: percentile(0.5), p95: percentile(0.95)},
    usageCostEstimateUsd: knownUsage.length ? Number(actualUsd.toFixed(6)) : null,
    usageEvidenceRequests: knownUsage.length,
    costType: 'USAGE_TARIFF_ESTIMATE_NOT_INVOICE',
    semanticRating: 'NOT_RATED',
    noRawDataPersisted: true,
  };
}

function percentileUsage(usage) {
  const input = Number.isSafeInteger(usage?.prompt_tokens) ? usage.prompt_tokens : null;
  const output = Number.isSafeInteger(usage?.completion_tokens) ? usage.completion_tokens : null;
  if((input!==null&&(input<0||input>ASSISTANT_V3_POLICY.inputWindowTokens))||
    (output!==null&&(output<0||output>ASSISTANT_V3_POLICY.maxCompletionTokens)))
    throw new Error('V3_PROVIDER_USAGE_OUT_OF_POLICY');
  if (input === null || output === null) return {promptTokens: input, completionTokens: output, totalTokens: null};
  const valueUsd = (input * 1.25 + output * 4.25) / 1_000_000;
  return {
    promptTokens: input,
    completionTokens: output,
    totalTokens: Number.isSafeInteger(usage.total_tokens) ? usage.total_tokens : input + output,
    costEstimateUsd: Number(valueUsd.toFixed(6)),
  };
}

export async function callAssistantV3Request({
  caseData, task, identity, budget, checkpoint, checkpointFile,
  fetchImpl = fetch, getKey = () => process.env.MODEL_API_KEY,
  live = false, ackPaid = false, now = Date.now, timeoutMs = 25_000,
}) {
  if (!live || !ackPaid) throw new Error('V3_EXPLICIT_LIVE_ACK_REQUIRED');
  const key = getKey();
  if (typeof key !== 'string' || !key.trim()) throw new Error('V3_META_KEY_NOT_CONFIGURED');
  const payload = buildAssistantV3Payload(caseData, task.variant);
  const options = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  };
  const taskRecord = checkpoint.tasks.find(item => item.requestId === identity.requestId);
  if (!taskRecord || taskRecord.status !== 'PLANNED') throw new Error('V3_TASK_NOT_PLANNED');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  options.signal = controller.signal;
  const beforeRequest = async reservation => {
    taskRecord.status = 'RESERVED';
    taskRecord.reservedEurMicros = reservation.eurMicros;
    taskRecord.reservedUsdMicros = reservation.usdMicros;
    taskRecord.payloadSha256 = sha256(options.body);
    taskRecord.reservedAt = reservation.createdAt;
    checkpoint.providerRequests++;
    checkpoint.status = 'RUNNING';
    checkpoint.updatedAt = new Date(now()).toISOString();
    await atomicJson(checkpointFile, checkpoint);
  };
  const started = now();
  let response;
  let usage;
  try {
    response = await guardedAssistantV3Fetch({
      url: ASSISTANT_V3_ENDPOINT,
      options,
      identity,
      budget,
      fetchImpl,
      beforeRequest,
    });
    if (!response.ok) {
      await budget.mark(identity, 'UNKNOWN');
      taskRecord.status = 'UNKNOWN';
      taskRecord.errorCode = `V3_PROVIDER_HTTP_${response.status}_STOP`;
      throw new Error(taskRecord.errorCode);
    }
    const body = await response.text();
    await budget.mark(identity, 'COMPLETED');
    taskRecord.status = 'COMPLETED';
    if (Buffer.byteLength(body) > MAX_REPLY_BYTES) {
      taskRecord.errorCode = 'V3_RESPONSE_TOO_LARGE';
      throw new Error('V3_RESPONSE_TOO_LARGE');
    } else {
      const raw = JSON.parse(body);
      usage = percentileUsage(raw?.usage);
      const grade = decodeAndGradeAssistantV3(caseData, task.variant, raw);
      taskRecord.grade = grade;
      taskRecord.usage = {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
      };
      taskRecord.usageCostEstimateUsd = usage.costEstimateUsd ?? null;
    }
    taskRecord.latencyMs = Math.max(0, now() - started);
    taskRecord.completedAt = new Date(now()).toISOString();
    taskRecord.errorCode ??= null;
    checkpoint.status = 'RUNNING';
    checkpoint.updatedAt = new Date(now()).toISOString();
    await atomicJson(checkpointFile, checkpoint);
    return structuredClone(taskRecord);
  } catch (error) {
    clearTimeout(timer);
    if (taskRecord.status === 'RESERVED') {
      try { await budget.mark(identity, 'UNKNOWN'); }
      catch(persistence) { throw new AggregateError([error,persistence],'V3_BUDGET_RESULT_PERSISTENCE_FAILED'); }
      taskRecord.status = 'UNKNOWN';
    }
    taskRecord.errorCode = controller.signal.aborted
      ? 'V3_PROVIDER_OUTCOME_UNKNOWN'
      : fixedErrorCode(error);
    taskRecord.latencyMs = Math.max(0, now() - started);
    checkpoint.status = 'STOPPED';
    checkpoint.updatedAt = new Date(now()).toISOString();
    try { await atomicJson(checkpointFile, checkpoint); }
    catch(persistence) { throw new AggregateError([error,persistence],'V3_CHECKPOINT_PERSISTENCE_FAILED'); }
    throw new Error(controller.signal.aborted
      ? 'V3_PROVIDER_OUTCOME_UNKNOWN'
      : fixedErrorCode(error));
  } finally {
    clearTimeout(timer);
  }
}

async function loadRunnableTasks(checkpoint) {
  const {tasks, corpusSha256} = await createAssistantV3Tasks({
    split: checkpoint.split,
    limit: checkpoint.requestLimit,
    caseStart:checkpoint.caseStart,suite:checkpoint.suite,family:checkpoint.family,
    variants:checkpoint.variants??['A','B','C','D'],
  });
  if (checkpoint.corpusSha256 !== corpusSha256 ||
      checkpoint.sourceSha256 !== await assistantV3SourceFingerprint() ||
      tasks.length !== checkpoint.tasks.length) throw new Error('V3_CHECKPOINT_SOURCE_MISMATCH');
  const runHash = sha256(json({
    sourceSha256: checkpoint.sourceSha256,
    corpusSha256: checkpoint.corpusSha256,
    model: ASSISTANT_V3_MODEL,
    policyId: ASSISTANT_V3_POLICY.id,
    split: checkpoint.split,
    limit: checkpoint.requestLimit,
    requests: tasks.map(task => taskIdentity(task, checkpoint.sourceSha256, checkpoint.corpusSha256).requestId),
  }));
  if (checkpoint.runId !== runHash.slice(0, 32)) throw new Error('V3_CHECKPOINT_SOURCE_MISMATCH');
  return tasks;
}

function availableRequests(status) {
  const reserve = estimateAssistantV3Reserve();
  return Math.max(0, Math.min(
    status.requestsRemaining,
    status.sharedMetaRequestsRemaining,
    Math.floor(status.remainingEur * 1_000_000 / reserve.eurMicros),
    Math.floor(status.sharedMetaUsdRemaining * 1_000_000 / reserve.usdMicros),
  ));
}

async function runCheckpoint(checkpoint, scheduled, {
  fetchImpl, getKey, live, ackPaid, now, releaseLock = null,
  budgetFactory = acquireAssistantV3Budget, checkpointDir = CHECKPOINTS,
} = {}) {
  const release = releaseLock ?? await acquireRunnerLock(checkpoint.runId, checkpointDir);
  const checkpointFile = join(checkpointDir, `${checkpoint.runId}.json`);
  const budget = await budgetFactory();
  try {
    const status = await budget.status();
    if (status.remainingEur < 0 || !Number.isFinite(status.sharedMetaUsdRemaining))
      throw new Error('V3_BUDGET_STATUS_INVALID');
    let remainingCapacity = availableRequests(status);
    for (let index = 0; index < checkpoint.tasks.length; index++) {
      const record = checkpoint.tasks[index];
      const task = scheduled[index];
      const identity = taskIdentity(task, checkpoint.sourceSha256, checkpoint.corpusSha256);
      if (record.requestId !== identity.requestId || record.caseSha256 !== task.caseSha256 ||
          record.inputSha256 !== task.inputSha256 || record.variant !== task.variant ||
          record.scenarioId !== task.scenarioId || record.turn !== task.turn ||
          record.family !== task.family || record.split !== task.split) {
        throw new Error('V3_CHECKPOINT_SOURCE_MISMATCH');
      }
      const existing = await budget.lookup(identity.requestId);
      if (record.status === 'COMPLETED' || record.status === 'SKIPPED') {
        if (!existing || existing.status !== 'COMPLETED')
          throw new Error('V3_CHECKPOINT_LEDGER_MISMATCH');
        continue;
      }
      if (record.status === 'UNKNOWN') throw new Error('V3_RESUME_UNKNOWN_REQUEST_STOP');
      if (existing) {
        if (existing.status === 'RESERVED') await budget.mark(identity, 'UNKNOWN');
        record.status = existing.status === 'COMPLETED' ? 'SKIPPED' : 'UNKNOWN';
        record.errorCode = existing.status === 'RESERVED' ? 'V3_PRIOR_RESERVED_OUTCOME_UNKNOWN' : null;
        checkpoint.updatedAt = new Date(now?.() ?? Date.now()).toISOString();
        await atomicJson(checkpointFile, checkpoint);
        if (record.status === 'UNKNOWN') throw new Error('V3_RESUME_UNKNOWN_REQUEST_STOP');
        continue;
      }
      if (remainingCapacity <= 0) {
        checkpoint.status = 'PAUSED';
        checkpoint.updatedAt = new Date(now?.() ?? Date.now()).toISOString();
        await atomicJson(checkpointFile, checkpoint);
        return checkpoint;
      }
      if (record.status === 'RESERVED')
        throw new Error('V3_RESUME_UNKNOWN_REQUEST_STOP');
      const caseData = task.caseData;
      try {
        await callAssistantV3Request({
          caseData, task, identity, budget, checkpoint, checkpointFile,
          fetchImpl, getKey, live, ackPaid, now,
        });
        remainingCapacity--;
      } catch (error) {
        checkpoint.status = 'STOPPED';
        checkpoint.updatedAt = new Date(now?.() ?? Date.now()).toISOString();
        await atomicJson(checkpointFile, checkpoint);
        throw error;
      }
    }
    checkpoint.status = checkpoint.tasks.every(task => ['COMPLETED', 'SKIPPED'].includes(task.status))
      ? 'COMPLETED' : 'PAUSED';
    checkpoint.updatedAt = new Date(now?.() ?? Date.now()).toISOString();
    await atomicJson(checkpointFile, checkpoint);
    return checkpoint;
  } finally {
    await release();
  }
}

export async function runAssistantV3Live({split = 'development', limit = 4,
  caseStart=0,suite='pending',family=null,
  variants=['A','B','C','D'],
  fetchImpl, getKey, live = false, ackPaid = false, now = Date.now,
  budgetFactory = acquireAssistantV3Budget, checkpointDir = CHECKPOINTS} = {}) {
  if (!live || !ackPaid || ![2,4, 8, 12].includes(limit)||
    (limit===2&&variants.join(',')!=='A,D'))
    throw new Error('V3_EXPLICIT_LIVE_ACK_REQUIRED');
  const key = getKey ? getKey() : process.env.MODEL_API_KEY;
  if (typeof key !== 'string' || !key.trim()) throw new Error('V3_META_KEY_NOT_CONFIGURED');
  const {checkpoint, scheduled} = await makeAssistantV3Checkpoint({split, limit,caseStart,suite,family,variants});
  const budget = await budgetFactory();
  const capacity = availableRequests(await budget.status());
  if (capacity < limit) throw new Error('V3_REQUEST_LIMIT_EXCEEDS_AVAILABLE_BUDGET');
  await mkdir(checkpointDir, {recursive: true});
  const file = join(checkpointDir, `${checkpoint.runId}.json`);
  try {
    await readFile(file);
    throw new Error('V3_RUN_ALREADY_EXISTS_USE_RESUME');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const release = await acquireRunnerLock(checkpoint.runId, checkpointDir);
  try {
    try {
      await readFile(file);
      throw new Error('V3_RUN_ALREADY_EXISTS_USE_RESUME');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await atomicJson(file, checkpoint);
  } catch (error) {
    await release();
    throw error;
  }
  return runCheckpoint(checkpoint, scheduled, {
    fetchImpl, getKey, live, ackPaid, now, releaseLock: release,
    budgetFactory, checkpointDir,
  });
}

export async function resumeAssistantV3Live({runId, fetchImpl, getKey,
  live = false, ackPaid = false, now = Date.now,
  budgetFactory = acquireAssistantV3Budget, checkpointDir = CHECKPOINTS} = {}) {
  if (!live || !ackPaid || !/^[a-f0-9]{32}$/.test(runId ?? ''))
    throw new Error('V3_EXPLICIT_LIVE_ACK_REQUIRED');
  const key = getKey ? getKey() : process.env.MODEL_API_KEY;
  if (typeof key !== 'string' || !key.trim()) throw new Error('V3_META_KEY_NOT_CONFIGURED');
  const checkpointFile = join(checkpointDir, `${runId}.json`);
  const checkpoint = validateCheckpoint(JSON.parse(await readFile(checkpointFile, 'utf8')));
  const scheduled = await loadRunnableTasks(checkpoint);
  return runCheckpoint(checkpoint, scheduled, {
    fetchImpl, getKey, live, ackPaid, now, budgetFactory, checkpointDir,
  });
}

async function findCheckpoint(runId) {
  await mkdir(CHECKPOINTS, {recursive: true});
  if (runId) return join(CHECKPOINTS, `${runId}.json`);
  const files = (await readdir(CHECKPOINTS)).filter(name => /^[a-f0-9]{32}\.json$/.test(name));
  if (!files.length) throw new Error('V3_CHECKPOINT_NOT_FOUND');
  const entries = await Promise.all(files.map(async name => {
    const file = join(CHECKPOINTS, name);
    return {file, mtime: (await stat(file)).mtimeMs};
  }));
  return entries.sort((a, b) => b.mtime - a.mtime)[0].file;
}

async function readCheckpoint(runId) {
  const file = await findCheckpoint(runId);
  return validateCheckpoint(JSON.parse(await readFile(file, 'utf8')));
}

export async function assistantV3Report(checkpoint, {write = false} = {}) {
  const summary = summarizeAssistantV3Checkpoint(checkpoint);
  if (write) {
    await mkdir(REPORTS, {recursive: true});
    await atomicJson(join(REPORTS, `${checkpoint.runId}.json`), summary);
    const markdown = [
      '# RUNQ Assistant V3 evaluation',
      '',
      `- Run: \`${summary.runId}\``,
      `- Mode: ${summary.mode}; split: ${summary.split}; status: ${summary.status}`,
      `- Requests: ${summary.providerRequests}/${summary.scheduledRequests}`,
      `- Cost: ${summary.usageCostEstimateUsd} USD usage-tariff estimate; not an invoice`,
      `- Rating: ${summary.semanticRating}; model quality remains unverified`,
      '',
      '| Variant | Calls | Contract facts passing | Expected status | Exact source reference |',
      '|---|---:|---:|---:|---:|',
      ...Object.entries(summary.byVariant).map(([name, row]) =>
        `| ${name} | ${row.attempts} | ${row.contractPasses} | ${row.expectedStatusMatches} | ${row.sourceReferencePasses} |`),
      '',
      'This report stores derived rubric facts and usage only. No script, prompt, credentials, or model text is included.',
      'An artistic or operational response is NOT_RATED until independent human review. These synthetic fixtures do not establish Meta quality.',
    ].join('\n') + '\n';
    await writeFile(join(REPORTS, `${checkpoint.runId}.md`), markdown, {mode: 0o600});
  }
  return summary;
}

function compareCheckpoint(checkpoint) {
  const groups = new Map();
  for (const task of checkpoint.tasks) {
    const key = `${task.scenarioId}:${task.turn}`;
    if (!groups.has(key)) groups.set(key, {});
    groups.get(key)[task.variant] = task;
  }
  const paired = [...groups.values()].filter(group => ['A', 'B', 'C', 'D']
    .every(variant => group[variant]?.status === 'COMPLETED' && group[variant]?.grade));
  const comparisons = {
    completedFullPairs: paired.length,
    variantsAreMatched: true,
    deltaBAContractFacts: 0,
    deltaCAContractFacts: 0,
    deltaDAContractFacts: 0,
    semanticRanking: 'NOT_RATED',
  };
  for (const pair of paired) {
    const base = Number(pair.A.grade.contractPass);
    comparisons.deltaBAContractFacts += Number(pair.B.grade.contractPass) - base;
    comparisons.deltaCAContractFacts += Number(pair.C.grade.contractPass) - base;
    comparisons.deltaDAContractFacts += Number(pair.D.grade.contractPass) - base;
  }
  return comparisons;
}

async function plan() {
  const {data, sha256: corpusSha256} = await loadAssistantV3Corpus();
  const pendingBySplit = await countPendingAssistantV3BySplit();
  let shared;
  let sharedBudgetReady = false;
  let sharedBudgetError = null;
  try {
    shared = await (await acquireAssistantV3Budget()).status();
    sharedBudgetReady = true;
  } catch (error) {
    sharedBudgetError = fixedErrorCode(error);
  }
    const reserve = estimateAssistantV3Reserve();
    const sharedMax = sharedBudgetReady
      ? Math.min(shared.requestsRemaining, shared.sharedMetaRequestsRemaining,
        Math.floor(shared.sharedMetaUsdRemaining / (reserve.usdMicros / 1_000_000)))
      : 0;
    return {
      version: 1,
      mode: 'DRY_RUN',
      commands: ['plan', 'baseline', 'ai-offline', 'ai-live', 'resume', 'status', 'report', 'compare'],
      splits: Object.fromEntries(['development', 'validation', 'holdout'].map(split => [
        split, {
          pendingBaselineCases: pendingBySplit[split],
          supplementarySyntheticTurns: data.scenarios.filter(item => item.split === split)
            .reduce((sum, item) => sum + item.turns, 0),
          totalCases: pendingBySplit[split] + data.scenarios.filter(item => item.split === split)
            .reduce((sum, item) => sum + item.turns, 0),
        },
      ])),
      plannedMaximumCorpusRequests: (107 + data.scenarios.reduce((sum, item) => sum + item.turns, 0)) * 4,
      variants: ['A', 'B', 'C', 'D'],
      corpusSha256,
      liveRequires: '--live --ack-paid --limit 4|8|12 (or --variants A,D --limit 2)',
      liveProviderRequests: 0,
      maxNewMetaEur: ASSISTANT_V3_POLICY.capEurMicros / 1_000_000,
      maxNewMetaRequests: ASSISTANT_V3_POLICY.requestCap,
      fullContextReservationEur: reserve.eurMicros / 1_000_000,
      fullContextReservationUsd: reserve.usdMicros / 1_000_000,
      theoreticalMaxRequestsBeforeV3EurCap: Math.floor(ASSISTANT_V3_POLICY.capEurMicros / reserve.eurMicros),
      sharedCampaignIsAlsoRequired: true,
      sharedBudgetReady,
      sharedBudgetError,
      currentSharedMetaUsdRemaining: shared?.sharedMetaUsdRemaining ?? null,
      currentSharedMetaRequestsRemaining: shared?.sharedMetaRequestsRemaining ?? null,
      currentMaxAdditionalRequests: sharedMax,
      modelQuality: 'NOT_MEASURED',
    };
}

async function runCli(options) {
  if (options.command === 'plan') return plan();
  if (options.command === 'baseline') return baselineAssistantV3Evaluation();
  if (options.command === 'ai-offline') return offlineAssistantV3Evaluation({
    split: options.split,
    sampleLimit: 12,
  });
  if (options.command === 'ai-live') {
    const checkpoint = await runAssistantV3Live({
      split: options.split,
      limit: options.limit,
      live: options.live,
      ackPaid: options.ackPaid,
      caseStart:options.caseStart,suite:options.suite,family:options.family,
      variants:options.variants,
    });
    return assistantV3Report(checkpoint, {write: options.write});
  }
  if (options.command === 'resume') {
    if (!options.run) throw new Error('V3_RUN_ID_REQUIRED');
    const checkpoint = await resumeAssistantV3Live({
      runId: options.run,
      live: options.live,
      ackPaid: options.ackPaid,
    });
    return assistantV3Report(checkpoint, {write: options.write});
  }
  const checkpoint = await readCheckpoint(options.run);
  if (options.command === 'status') return {
    runId: checkpoint.runId, status: checkpoint.status, split: checkpoint.split,
    tasks: checkpoint.tasks.map(task => ({
      scenarioId: task.scenarioId, turn: task.turn, variant: task.variant,
      status: task.status, errorCode: task.errorCode,
    })),
    rawDataPersisted: false,
  };
  if (options.command === 'report') return assistantV3Report(checkpoint, {write: options.write});
  if (options.command === 'compare') return {
    ...summarizeAssistantV3Checkpoint(checkpoint),
    comparisons: compareCheckpoint(checkpoint),
    interpretation: 'Matched deterministic rubric facts only; this is not human semantic or Muse quality scoring.',
  };
  throw new Error('UNKNOWN_COMMAND');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await runCli(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const allowed = fixedErrorCode(error);
    process.stderr.write(`RUNQ_ASSISTANT_V3_STOP ${allowed}\n`);
    process.exitCode = 1;
  }
}
