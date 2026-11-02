/**
 * Local-only SFX workbench journal.
 * One authorization -> at most one remote submission, including after a crash.
 * Never imports WAV into a show, mutates cue state, or runs transport.
 */
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { inspectPcm16Wav } from './modalSfxPilotClient.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const LINE = /^L[1-9]\d*$/;
const REVISION = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const USD_SCALE = 1_000_000;
const MAX_REQUEST_USD = 100;
const MAX_DAILY_USD = 1_000;
const MAX_LATENCY_MS = 86_400_000;
const LATENCY_KEYS = [
  'submissionMs', 'queueMs', 'generationMs', 'coldStartMs', 'totalMs',
];
const STATES = new Set([
  'SUBMISSION_UNKNOWN', 'QUEUED', 'RUNNING', 'READY_FOR_REVIEW',
  'ACCEPTED_FOR_MANUAL_IMPORT', 'REJECTED', 'CANCEL_REQUESTED',
  'CANCELLED', 'FAILED',
]);
const ALLOWED = {
  SUBMISSION_UNKNOWN: ['SUBMISSION_UNKNOWN'],
  QUEUED: ['RUNNING','READY_FOR_REVIEW','CANCEL_REQUESTED','CANCELLED','FAILED'],
  RUNNING: ['RUNNING','READY_FOR_REVIEW','CANCEL_REQUESTED','CANCELLED','FAILED'],
  READY_FOR_REVIEW: ['ACCEPTED_FOR_MANUAL_IMPORT','REJECTED'],
  ACCEPTED_FOR_MANUAL_IMPORT: [],
  REJECTED: [],
  CANCEL_REQUESTED: ['CANCEL_REQUESTED','CANCELLED','READY_FOR_REVIEW','FAILED'],
  CANCELLED: [],
  FAILED: [],
};
const ACTIVE = new Set(['SUBMISSION_UNKNOWN','QUEUED','RUNNING','CANCEL_REQUESTED']);
const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
const SINGLE_LINE = /^[^\r\n]{1,512}$/;
const TERMINAL_STATUS = 'CANCELLED';
const digest = id => createHash('sha256').update(id).digest('hex');
const fileName = id => 'job-' + digest(id) + '.json';
const hex = value => /^[a-f0-9]{64}$/.test(value ?? '');

export const SFX_DURATION_TOLERANCE_SECONDS = 0.1;
// Normal product use keeps the historical conservative ceiling. A supervised
// QA evaluation campaign may raise the daily start count, but only through an
// explicit opt-in flag and never beyond the authorized campaign ceiling.
export const SFX_STANDARD_DAILY_START_CEILING = 25;
export const SFX_QA_CAMPAIGN_DAILY_START_CEILING = 150;

function requireId(id) {
  if (typeof id !== 'string' || !ID.test(id)) throw new TypeError('Invalid SFX job ID');
  return id;
}

function usdMicros(value, name, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > maximum) {
    throw new TypeError('Invalid ' + name);
  }
  const micros = Math.round(value * USD_SCALE);
  if (micros < 1 || Math.abs(value - micros / USD_SCALE) > 1e-9) {
    throw new TypeError(name + ' must use at most six decimal places');
  }
  return micros;
}

function usdFromMicros(micros) {
  return Number((micros / USD_SCALE).toFixed(6));
}

/** Canonical, bounded USD policy shared by status, route acknowledgement and journal. */
export function normalizeSfxCostPolicy(value = {}, { requireAcknowledgement = false } = {}) {
  if(value.budgetLimitsDisabled===true) {
    const estimate=Number.isFinite(value.estimatedMaxCostUsdPerRequest)&&value.estimatedMaxCostUsdPerRequest>0
      ? value.estimatedMaxCostUsdPerRequest : null;
    return Object.freeze({budgetLimitsDisabled:true,estimatedMaxCostUsdPerRequest:estimate,
      dailyBudgetUsd:null,acknowledgedMaxCostUsd:null,estimateMicros:estimate===null?null:Math.round(estimate*USD_SCALE),budgetMicros:null});
  }
  const estimateMicros = usdMicros(
    value.estimatedMaxCostUsdPerRequest,
    'estimated SFX maximum cost',
    MAX_REQUEST_USD,
  );
  const budgetMicros = usdMicros(value.dailyBudgetUsd, 'SFX daily budget', MAX_DAILY_USD);
  if (estimateMicros > budgetMicros) {
    throw new RangeError('Per-request SFX estimate exceeds daily budget');
  }
  let acknowledgementMicros = null;
  if (requireAcknowledgement) {
    acknowledgementMicros = usdMicros(
      value.acknowledgedMaxCostUsd,
      'acknowledged SFX maximum cost',
      MAX_REQUEST_USD,
    );
    if (acknowledgementMicros !== estimateMicros) {
      throw new RangeError('Operator acknowledgement does not match displayed maximum');
    }
  }
  return Object.freeze({
    estimatedMaxCostUsdPerRequest: usdFromMicros(estimateMicros),
    dailyBudgetUsd: usdFromMicros(budgetMicros),
    acknowledgedMaxCostUsd: acknowledgementMicros === null
      ? null : usdFromMicros(acknowledgementMicros),
    estimateMicros,
    budgetMicros,
  });
}

export function normalizeSfxModelRevision(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !REVISION.test(value) || value.includes('..')) {
    throw new TypeError('Invalid SFX model revision');
  }
  return value;
}

function emptyLatencies() {
  return Object.fromEntries(LATENCY_KEYS.map(key => [key, null]));
}

function normalizeLatencies(input, previous = emptyLatencies()) {
  if (input === undefined) return { ...previous };
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !LATENCY_KEYS.includes(key))) {
    throw new TypeError('Invalid SFX latency metadata');
  }
  const next = { ...previous };
  for (const [key, value] of Object.entries(input)) {
    if (value === null) {
      next[key] = null;
    } else if (typeof value === 'number' && Number.isFinite(value) &&
               value >= 0 && value <= MAX_LATENCY_MS) {
      next[key] = Number(value.toFixed(3));
    } else {
      throw new TypeError('Invalid SFX latency metadata');
    }
  }
  return next;
}

function validateStoredCost(cost) {
  if (!cost || cost.currency !== 'USD' || cost.actualBilledUsd !== null ||
      cost.actualBillingStatus !== 'UNKNOWN') {
    throw new Error('Invalid persisted SFX cost metadata');
  }
  return normalizeSfxCostPolicy({
    budgetLimitsDisabled: cost.budgetLimitsDisabled === true,
    estimatedMaxCostUsdPerRequest: cost.estimatedMaxCostUsd,
    dailyBudgetUsd: cost.dailyBudgetUsdAtReservation,
    acknowledgedMaxCostUsd: cost.operatorAcknowledgedMaxCostUsd,
  }, { requireAcknowledgement: true });
}

function publicView(entry) {
  if (!entry) return null;
  const { remoteJobId, authorizationHash, ...rest } = entry;
  return structuredClone(rest);
}

function internalEntry(entry) {
  if (!entry || entry.version !== 1 || !STATES.has(entry.status) ||
      !ID.test(entry.requestId) || !hex(entry.authorizationHash) ||
      !(entry.sourceLineId === null || entry.sourceLineId === undefined ||
        LINE.test(entry.sourceLineId)) ||
      normalizeSfxModelRevision(entry.modelRevision) !== (entry.modelRevision ?? null)) {
    throw new Error('Invalid persisted SFX journal');
  }
  if (entry.cost !== undefined) validateStoredCost(entry.cost);
  if (entry.latencies !== undefined) normalizeLatencies(entry.latencies);
  if (entry.reconciliation !== undefined) validateReconciliation(entry.reconciliation);
  return entry;
}

function isoZ(value, name) {
  if (typeof value !== 'string' || !ISO_Z.test(value) ||
      Number.isNaN(Date.parse(value))) {
    throw new TypeError('Invalid ' + name);
  }
  return value;
}

const RECONCILE_KEYS = new Set([
  'at', 'fromStatus', 'remoteJobId', 'terminalStatus', 'verifiedAt',
  'verifiedVia', 'verifiedBy', 'evidenceSha256', 'evidenceNote',
]);

// Reconciliation is a logged operator action, never an inferred state. The
// fixed evidence fields keep the journal explainable without deleting
// anything: the previous status, timestamps and verification provenance stay.
function validateReconciliation(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      Object.keys(record).some(key => !RECONCILE_KEYS.has(key))) {
    throw new Error('Invalid persisted SFX reconciliation');
  }
  isoZ(record.at, 'reconciliation timestamp');
  isoZ(record.verifiedAt, 'reconciliation verification time');
  if (typeof record.remoteJobId !== 'string' || !ID.test(record.remoteJobId) ||
      record.fromStatus !== 'CANCEL_REQUESTED' || record.terminalStatus !== TERMINAL_STATUS ||
      typeof record.verifiedVia !== 'string' || !SINGLE_LINE.test(record.verifiedVia) ||
      typeof record.verifiedBy !== 'string' || !ID.test(record.verifiedBy) ||
      !hex(record.evidenceSha256) ||
      !(record.evidenceNote === null || (typeof record.evidenceNote === 'string' &&
        SINGLE_LINE.test(record.evidenceNote)))) {
    throw new Error('Invalid persisted SFX reconciliation');
  }
}

export function createSfxJobStore({
  directory,
  maxDailyStarts = 3,
  budgetLimitsDisabled = true,
  supervisedQaCampaign = false,
  clock = () => new Date(),
} = {}) {
  const dailyStartCeiling = supervisedQaCampaign === true
    ? SFX_QA_CAMPAIGN_DAILY_START_CEILING
    : SFX_STANDARD_DAILY_START_CEILING;
  if (typeof directory !== 'string' || !directory.trim() ||
      typeof supervisedQaCampaign !== 'boolean' ||
      !Number.isSafeInteger(maxDailyStarts) || maxDailyStarts < 1 ||
      maxDailyStarts > dailyStartCeiling) {
    throw new TypeError('Invalid SFX journal configuration');
  }
  const root = directory;
  const dir = () => mkdir(root, { recursive: true, mode: 0o700 });
  const pathFor = id => join(root, fileName(requireId(id)));
  const audioPathFor = id => join(root, 'wav-' + digest(requireId(id)) + '.wav');

  // Exclusive mutation lock; stale lock after an unclean exit deliberately
  // FAILS CLOSED until the operator investigates an uncertain remote charge.
  async function locked(fn) {
    await dir();
    let handle;
    try {
      handle = await open(join(root, '.mutation-lock'), 'wx', 0o600);
    } catch (error) {
      if (error?.code === 'EEXIST') {
        const failure = new Error('SFX journal is locked; manual investigation required');
        failure.code = 'SFX_JOURNAL_LOCKED';
        throw failure;
      }
      throw error;
    }
    try { return await fn(); }
    finally {
      await handle.close();
      await rm(join(root, '.mutation-lock'));
    }
  }

  async function read(id) {
    const path = pathFor(id);
    try { return internalEntry(JSON.parse(await readFile(path, 'utf8'))); }
    catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async function list({ limit = 50 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new TypeError('Invalid SFX list limit');
    }
    await dir();
    const entries = [];
    for (const name of await readdir(root)) {
      if (!/^job-[a-f0-9]{64}\.json$/.test(name)) continue;
      entries.push(internalEntry(JSON.parse(await readFile(join(root, name), 'utf8'))));
    }
    entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) ||
      b.requestId.localeCompare(a.requestId));
    return Object.freeze({
      jobs: Object.freeze(entries.slice(0, limit).map(publicView)),
      limit,
      truncated: entries.length > limit,
    });
  }

  async function atomicWrite(entry) {
    const target = pathFor(entry.requestId);
    const temp = target + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temp, JSON.stringify(entry), { flag: 'wx', mode: 0o600 });
      await rename(temp, target);
    } finally { await rm(temp, { force: true }); }
  }

  async function reserve(request, { confirm } = {}) {
    const { requestId, authorizationId, sourceLineId, kind, prompt, durationSeconds,
      modelCandidate, modelRevision, seed, estimatedMaxCostUsdPerRequest,
      dailyBudgetUsd, acknowledgedMaxCostUsd } = request ?? {};
    requireId(requestId);
    requireId(authorizationId);
    const sourceReference = sourceLineId === undefined || sourceLineId === null
      ? null : sourceLineId;
    const revision = normalizeSfxModelRevision(modelRevision);
    const costPolicy = normalizeSfxCostPolicy({
      budgetLimitsDisabled, estimatedMaxCostUsdPerRequest, dailyBudgetUsd, acknowledgedMaxCostUsd,
    }, { requireAcknowledgement: true });
    if (confirm !== true || !(sourceReference === null || LINE.test(sourceReference)) ||
        !['SFX','ENVIRONMENT'].includes(kind) ||
        modelCandidate !== 'stabilityai/stable-audio-3-small-sfx' ||
        typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1000 ||
        !Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 12 ||
        !Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647) {
      throw new TypeError('Invalid authorized SFX reservation');
    }
    return locked(async () => {
      const existing = await read(requestId);
      if (existing) {
        const error = new Error('SFX request already reserved');
        error.code = 'SFX_DUPLICATE';
        throw error;
      }
      const now = clock().toISOString();
      const today = now.slice(0, 10);
      let startsToday = 0;
      let activeStarts = 0;
      let estimatedMicrosToday = 0;
      for (const name of await readdir(root)) {
        if (!/^job-[a-f0-9]{64}\.json$/.test(name)) continue;
        const entry = internalEntry(JSON.parse(await readFile(join(root, name), 'utf8')));
        if (entry.authorizationHash === digest(authorizationId)) {
          const error = new Error('SFX authorization was already used');
          error.code = 'SFX_DUPLICATE';
          throw error;
        }
        if (!budgetLimitsDisabled && entry.createdAt.slice(0, 10) === today) {
          startsToday++;
          if (!entry.cost) {
            const error = new Error('Existing SFX cost is unknown');
            error.code = 'SFX_BUDGET_UNKNOWN';
            throw error;
          }
          estimatedMicrosToday += validateStoredCost(entry.cost).estimateMicros;
        }
        if (ACTIVE.has(entry.status)) activeStarts++;
      }
      if (activeStarts > 0) {
        const error = new Error('An existing SFX job is unresolved');
        error.code = 'SFX_ACTIVE_LIMIT';
        throw error;
      }
      if (!budgetLimitsDisabled && startsToday >= maxDailyStarts) {
        const error = new Error('SFX daily quota reached');
        error.code = 'SFX_DAILY_LIMIT';
        throw error;
      }
      if (!budgetLimitsDisabled && estimatedMicrosToday + costPolicy.estimateMicros > costPolicy.budgetMicros) {
        const error = new Error('SFX daily cost budget reached');
        error.code = 'SFX_DAILY_BUDGET';
        throw error;
      }
      const entry = {
        version: 1, requestId, authorizationHash: digest(authorizationId),
        sourceLineId: sourceReference, kind, modelCandidate,
        modelRevision: revision, provider: 'modal', prompt: prompt.trim(),
        durationSeconds, seed, status: 'SUBMISSION_UNKNOWN',
        createdAt: now, updatedAt: now, remoteJobId: null, wav: null,
        cost: {
          currency: 'USD',
          ...(budgetLimitsDisabled ? {budgetLimitsDisabled:true} : {}),
          estimatedMaxCostUsd: costPolicy.estimatedMaxCostUsdPerRequest,
          dailyBudgetUsdAtReservation: costPolicy.dailyBudgetUsd,
          operatorAcknowledgedMaxCostUsd: costPolicy.acknowledgedMaxCostUsd,
          actualBilledUsd: null,
          actualBillingStatus: 'UNKNOWN',
        },
        latencies: emptyLatencies(),
      };
      // Atomic exclusive reservation BEFORE any remote call. If the process
      // crashes after this point, never resubmit automatically.
      const target = pathFor(requestId);
      const handle = await open(target, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(entry)); }
      finally { await handle.close(); }
      return publicView(entry);
    });
  }

  async function update(id, nextStatus, { remoteJobId, wav, latencies } = {}) {
    requireId(id);
    if (!STATES.has(nextStatus)) throw new TypeError('Invalid SFX state');
    return locked(async () => {
      const previous = await read(id);
      if (!previous) {
        const e = new Error('SFX job not found'); e.code = 'SFX_NOT_FOUND'; throw e;
      }
      if (!ALLOWED[previous.status].includes(nextStatus) &&
          !(previous.status === 'SUBMISSION_UNKNOWN' &&
            nextStatus === 'QUEUED' && typeof remoteJobId === 'string')) {
        const e = new Error('Forbidden SFX job transition'); e.code = 'SFX_TRANSITION'; throw e;
      }
      const updated = {
        ...previous,
        status: nextStatus,
        updatedAt: clock().toISOString(),
        latencies: normalizeLatencies(latencies, previous.latencies ?? emptyLatencies()),
      };
      if (remoteJobId !== undefined) {
        if (!ID.test(remoteJobId) || previous.remoteJobId) throw new TypeError('Invalid remote job ID');
        updated.remoteJobId = remoteJobId;
      }
      if (wav !== undefined) {
        if (nextStatus !== 'READY_FOR_REVIEW' || !wav ||
            !hex(wav.sha256) || !Number.isFinite(wav.durationSeconds) ||
            !Number.isSafeInteger(wav.sampleRateHz) || !Number.isSafeInteger(wav.channels)) {
          throw new TypeError('Invalid SFX audio metadata');
        }
        updated.wav = { ...wav };
      }
      await atomicWrite(updated);
      return publicView(updated);
    });
  }

  async function storeWav(id, bytes, claimed, { latencies } = {}) {
    requireId(id);
    const details = inspectPcm16Wav(bytes);
    if (!claimed || details.sha256 !== claimed.sha256 ||
        Math.abs(details.durationSeconds - claimed.durationSeconds) > 0.05 ||
        details.sampleRateHz !== claimed.sampleRateHz ||
        details.channels !== claimed.channels) {
      throw new TypeError('SFX WAV does not match provider result');
    }
    return locked(async () => {
      const entry = await read(id);
      if (!entry || !['QUEUED','RUNNING','CANCEL_REQUESTED'].includes(entry.status)) {
        throw new TypeError('Cannot store sound in this SFX state');
      }
      if (Math.abs(details.durationSeconds - entry.durationSeconds) >
          SFX_DURATION_TOLERANCE_SECONDS) {
        throw new RangeError('SFX WAV duration differs from the authorized request');
      }
      const target = audioPathFor(id);
      // If a prior attempt crashed after writing the file, never silently replace.
      let handle;
      try { handle = await open(target, 'wx', 0o600); }
      catch (error) {
        if (error?.code === 'EEXIST') {
          throw new Error('SFX audio already exists; manual review required');
        }
        throw error;
      }
      try {
        await handle.writeFile(bytes);
      } finally { await handle.close(); }
      const updated = {
        ...entry, status: 'READY_FOR_REVIEW', wav: details,
        latencies: normalizeLatencies(latencies, entry.latencies ?? emptyLatencies()),
        updatedAt: clock().toISOString(),
      };
      await atomicWrite(updated);
      return publicView(updated);
    });
  }

  async function wavBytes(id) {
    const entry = await read(id);
    if (!entry || !['READY_FOR_REVIEW','ACCEPTED_FOR_MANUAL_IMPORT'].includes(entry.status)) return null;
    const bytes = await readFile(audioPathFor(id));
    const details = inspectPcm16Wav(bytes);
    if (details.sha256 !== entry.wav?.sha256) throw new Error('SFX WAV integrity mismatch');
    return bytes;
  }

  /**
   * Audited reconciliation for a record stuck in a local-only state. It never
   * calls the provider, never trusts an HTTP status alone and never deletes
   * history: validated external evidence plus an immutable embedded audit
   * record transitions CANCEL_REQUESTED -> CANCELLED exactly once.
   */
  async function reconcileCancelled(id, evidence) {
    requireId(id);
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
      throw new TypeError('Invalid SFX reconciliation evidence');
    }
    const allowedKeys = ['remoteJobId','terminalStatus','verifiedAt','verifiedVia',
      'verifiedBy','evidenceSha256','evidenceNote'];
    for (const key of Object.keys(evidence)) {
      if (!allowedKeys.includes(key)) {
        const e = new TypeError('Invalid SFX reconciliation evidence');
        e.code = 'SFX_RECONCILE_EVIDENCE'; throw e;
      }
    }
    return locked(async () => {
      const previous = await read(id);
      if (!previous) {
        const e = new Error('SFX job not found'); e.code = 'SFX_NOT_FOUND'; throw e;
      }
      if (previous.status === TERMINAL_STATUS && previous.reconciliation) {
        const e = new Error('SFX job was already reconciled');
        e.code = 'SFX_ALREADY_RECONCILED'; throw e;
      }
      if (previous.status !== 'CANCEL_REQUESTED') {
        const e = new Error('Reconciliation only applies to CANCEL_REQUESTED records');
        e.code = 'SFX_RECONCILE_STATE'; throw e;
      }
      if (typeof evidence.remoteJobId !== 'string' || !previous.remoteJobId ||
          evidence.remoteJobId !== previous.remoteJobId ||
          evidence.terminalStatus !== TERMINAL_STATUS ||
          !ISO_Z.test(evidence.verifiedAt ?? '') || Number.isNaN(Date.parse(evidence.verifiedAt)) ||
          typeof evidence.verifiedVia !== 'string' || !SINGLE_LINE.test(evidence.verifiedVia) ||
          typeof evidence.verifiedBy !== 'string' || !ID.test(evidence.verifiedBy) ||
          !hex(evidence.evidenceSha256) ||
          !(evidence.evidenceNote === undefined ||
            (typeof evidence.evidenceNote === 'string' &&
             SINGLE_LINE.test(evidence.evidenceNote)))) {
        const e = new TypeError('SFX reconciliation evidence does not match the journal');
        e.code = 'SFX_RECONCILE_EVIDENCE'; throw e;
      }
      const at = clock().toISOString();
      const verified = Date.parse(evidence.verifiedAt);
      if (verified < Date.parse(previous.updatedAt) || verified > Date.parse(at)) {
        const e = new TypeError('SFX verification time is outside the record window');
        e.code = 'SFX_RECONCILE_EVIDENCE'; throw e;
      }
      const updated = {
        ...previous,
        status: TERMINAL_STATUS,
        updatedAt: at,
        reconciliation: {
          at, fromStatus: previous.status, remoteJobId: previous.remoteJobId,
          terminalStatus: TERMINAL_STATUS, verifiedAt: evidence.verifiedAt,
          verifiedVia: evidence.verifiedVia, verifiedBy: evidence.verifiedBy,
          evidenceSha256: evidence.evidenceSha256,
          evidenceNote: evidence.evidenceNote === undefined ? null : evidence.evidenceNote,
        },
      };
      await atomicWrite(updated);
      return publicView(updated);
    });
  }

  return Object.freeze({
    reserve, update, read, list, publicView, storeWav, wavBytes, reconcileCancelled,
    budgetLimitsDisabled,
    maxDailyStarts: budgetLimitsDisabled ? null : maxDailyStarts,
    supervisedQaCampaign: supervisedQaCampaign === true,
  });
}
