/**
 * Recoverable serial SFX batch manager.
 *
 * This module owns only batch bookkeeping and provider status tracking. It
 * never creates assets, mutates cues, plays audio or retries a paid submission.
 * A job that has already been submitted is always recovered through its
 * requestId; only a cue with no live record may receive a new authorization.
 */
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const SHA256 = /^[a-f0-9]{64}$/i;

export const SFX_BATCH_PHASES = Object.freeze([
  'PENDING', 'SUBMITTED', 'GENERATING', 'READY', 'FAILED', 'UNCERTAIN',
  'CANCEL_REQUESTED', 'CANCELLED', 'REJECTED',
]);

const READY_STATUSES = new Set(['READY_FOR_REVIEW', 'ACCEPTED_FOR_MANUAL_IMPORT']);
const ACTIVE_STATUSES = new Set(['QUEUED', 'RUNNING', 'CANCEL_REQUESTED']);
const UNCERTAIN_STATUSES = new Set(['SUBMISSION_UNKNOWN', 'UNKNOWN']);
const RETRYABLE_RECORD_STATUSES = new Set(['FAILED', 'CANCELLED', 'REJECTED']);
const KNOWN_STATUSES = new Set([
  'SUBMITTED', 'UNKNOWN', 'SUBMISSION_UNKNOWN', 'QUEUED', 'RUNNING',
  'READY_FOR_REVIEW', 'ACCEPTED_FOR_MANUAL_IMPORT', 'FAILED', 'CANCELLED',
  'REJECTED', 'CANCEL_REQUESTED',
]);

const STATUS_RANK = Object.freeze({
  SUBMITTED: 10,
  SUBMISSION_UNKNOWN: 20,
  UNKNOWN: 20,
  QUEUED: 30,
  RUNNING: 40,
  CANCEL_REQUESTED: 50,
  FAILED: 80,
  CANCELLED: 90,
  REJECTED: 95,
  READY_FOR_REVIEW: 100,
  ACCEPTED_FOR_MANUAL_IMPORT: 110,
});

function isStatusRegression(previousStatus, nextStatus) {
  if (previousStatus === nextStatus) return false;
  // Once a WAV exists locally, no later remote poll may move the take back to
  // a pre-ready or merely failed state. Acceptance is above readiness.
  if (READY_STATUSES.has(previousStatus)) return !READY_STATUSES.has(nextStatus) ||
    (previousStatus === 'ACCEPTED_FOR_MANUAL_IMPORT' && nextStatus === 'READY_FOR_REVIEW');
  if (previousStatus === 'CANCELLED' || previousStatus === 'REJECTED') return true;
  if (previousStatus === 'FAILED') return nextStatus !== 'FAILED';
  if (previousStatus === 'CANCEL_REQUESTED') {
    return !['CANCEL_REQUESTED', 'CANCELLED', 'FAILED', 'READY_FOR_REVIEW'].includes(nextStatus);
  }
  return (STATUS_RANK[nextStatus] ?? -1) < (STATUS_RANK[previousStatus] ?? -1);
}

export function phaseForSfxStatus(status) {
  if (READY_STATUSES.has(status)) return 'READY';
  // CANCEL_REQUESTED is an outstanding remote job in the durable journal,
  // but the operator-facing phase must not pretend it is still generating.
  if (status === 'CANCEL_REQUESTED') return 'CANCEL_REQUESTED';
  if (ACTIVE_STATUSES.has(status)) return 'GENERATING';
  if (status === 'SUBMITTED') return 'SUBMITTED';
  if (UNCERTAIN_STATUSES.has(status)) return 'UNCERTAIN';
  if (status === 'FAILED') return 'FAILED';
  if (status === 'CANCELLED') return 'CANCELLED';
  if (status === 'REJECTED') return 'REJECTED';
  throw new Error('INVALID_BATCH_STATUS');
}

function finiteTime(value, fallback = null) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value : fallback;
}

function normalizeRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      typeof record.cueId !== 'string' || !record.cueId ||
      typeof record.cueIdentity !== 'string' || !record.cueIdentity ||
      typeof record.requestId !== 'string' || !ID.test(record.requestId) ||
      !KNOWN_STATUSES.has(record.status)) {
    throw new Error('INVALID_BATCH_RECORD');
  }
  const wavSha256 = record.wavSha256 ?? record.wav?.sha256 ?? null;
  if (wavSha256 !== null && !SHA256.test(wavSha256)) {
    throw new Error('INVALID_BATCH_RECORD');
  }
  // Phase is a presentation projection of the durable provider status. It
  // is always derived, so a persisted phase can never contradict a refresh.
  const phase = phaseForSfxStatus(record.status);
  if (record.phase !== undefined && !SFX_BATCH_PHASES.includes(record.phase)) {
    throw new Error('INVALID_BATCH_RECORD');
  }
  return Object.freeze({
    cueId: record.cueId,
    cueIdentity: record.cueIdentity,
    requestId: record.requestId,
    status: record.status,
    phase,
    ...(wavSha256 ? { wavSha256: wavSha256.toLowerCase() } : {}),
    submittedAt: finiteTime(record.submittedAt),
    lastCheckedAt: finiteTime(record.lastCheckedAt),
    lastErrorCode: typeof record.lastErrorCode === 'string' &&
      /^[A-Z0-9_:-]{1,80}$/.test(record.lastErrorCode) ? record.lastErrorCode : null,
  });
}

export function normalizeBatchRecords(records = []) {
  if (!Array.isArray(records) || records.length > 500) {
    throw new Error('INVALID_BATCH_RECORD');
  }
  const byRequest = new Map();
  for (const record of records) {
    const normalized = normalizeRecord(record);
    if (byRequest.has(normalized.requestId)) throw new Error('INVALID_BATCH_RECORD');
    byRequest.set(normalized.requestId, normalized);
  }
  return Object.freeze([...byRequest.values()]);
}

function replaceRecord(records, next) {
  const index = records.findIndex(record => record.requestId === next.requestId);
  if (index >= 0) {
    return records.map((record, position) => position === index ? next : record);
  }
  // An explicit new take for a definitively failed/cancelled/rejected cue
  // replaces that dead record instead of accumulating unreachable history.
  const dead = records.findIndex(record => record.cueId === next.cueId &&
    record.cueIdentity === next.cueIdentity &&
    RETRYABLE_RECORD_STATUSES.has(record.status));
  if (dead >= 0) {
    return records.map((record, position) => position === dead ? next : record);
  }
  return [...records, next];
}

function itemKey(item) {
  return item.cueId + '\n' + item.cueIdentity;
}

export function summarizeBatchRecords(records = [], plannedTotal = records.length) {
  const summary = {
    total: plannedTotal, pending: 0, submitted: 0, generating: 0,
    ready: 0, failed: 0, uncertain: 0, cancelRequested: 0,
    cancelled: 0, rejected: 0,
  };
  for (const record of records) {
    if (record.phase === 'PENDING') summary.pending += 1;
    else if (record.phase === 'SUBMITTED') summary.submitted += 1;
    else if (record.phase === 'GENERATING') summary.generating += 1;
    else if (record.phase === 'READY') summary.ready += 1;
    else if (record.phase === 'FAILED') summary.failed += 1;
    else if (record.phase === 'UNCERTAIN') summary.uncertain += 1;
    else if (record.phase === 'CANCEL_REQUESTED') summary.cancelRequested += 1;
    else if (record.phase === 'CANCELLED') summary.cancelled += 1;
    else if (record.phase === 'REJECTED') summary.rejected += 1;
  }
  summary.pending = Math.max(0, plannedTotal - records.filter(record =>
    !RETRYABLE_RECORD_STATUSES.has(record.status)).length);
  return Object.freeze(summary);
}

export function createSfxBatch({ items = [], records = [], now = () => Date.now() } = {}) {
  if (!Array.isArray(items)) throw new TypeError('Batch items must be an array');
  let current = [...normalizeBatchRecords(records)];
  const listeners = new Set();
  const snapshot = () => Object.freeze({
    records: Object.freeze([...current]),
    summary: summarizeBatchRecords(current, Math.max(items.length, current.length)),
  });
  const emit = () => {
    const state = snapshot();
    for (const listener of listeners) listener(state);
    return state;
  };
  const findItem = cueId => items.find(item => item.cueId === cueId);
  const liveRecordFor = item => current.find(record =>
    record.cueId === item.cueId && record.cueIdentity === item.cueIdentity &&
    !RETRYABLE_RECORD_STATUSES.has(record.status));
  const api = {
    get records() { return Object.freeze([...current]); },
    get summary() {
      return summarizeBatchRecords(current, Math.max(items.length, current.length));
    },
    snapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('Batch listener required');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    eligibleItems() {
      return items.filter(item => !liveRecordFor(item));
    },
    trackingRecords() {
      return current.filter(record =>
        (ACTIVE_STATUSES.has(record.status) || record.status === 'SUBMITTED') &&
        (items.length === 0 || findItem(record.cueId)?.cueIdentity === record.cueIdentity));
    },
    uncertainRecords() {
      return current.filter(record => record.phase === 'UNCERTAIN');
    },
    recordFor(item) { return liveRecordFor(item) ?? null; },
    markSubmitted(item, requestId, status = 'SUBMITTED') {
      if (!ID.test(requestId ?? '')) throw new Error('INVALID_BATCH_RECORD');
      if (liveRecordFor(item)) throw new Error('SFX_DUPLICATE');
      const next = normalizeRecord({
        cueId: item.cueId, cueIdentity: item.cueIdentity, requestId, status,
        submittedAt: now(), lastCheckedAt: now(),
      });
      current = replaceRecord(current, next);
      emit();
      return next;
    },
    updateJob(job, { errorCode = null } = {}) {
      return api.applyJobUpdate(job, { errorCode }).record;
    },
    applyJobUpdate(job, { errorCode = null } = {}) {
      if (!job || !ID.test(job.requestId ?? '') || !KNOWN_STATUSES.has(job.status)) {
        return Object.freeze({ ignored: true, reason: 'INVALID_JOB_UPDATE', record: null });
      }
      const previous = current.find(record => record.requestId === job.requestId);
      if (!previous) {
        // A response may resolve after the browser rebuilt/discarded its
        // in-memory record. The durable server journal remains the trace;
        // never resurrect that job locally or turn the race into a batch error.
        return Object.freeze({ ignored: true, reason: 'UNKNOWN_REQUEST', record: null });
      }
      if (isStatusRegression(previous.status, job.status)) {
        return Object.freeze({ ignored: true, reason: 'STALE_STATUS', record: previous });
      }
      const next = normalizeRecord({
        ...previous, status: job.status,
        wavSha256: job.wav?.sha256 ?? job.wavSha256 ?? previous.wavSha256,
        lastCheckedAt: now(), lastErrorCode: errorCode,
      });
      current = replaceRecord(current, next);
      emit();
      return Object.freeze({ ignored: false, reason: null, record: next });
    },
    markUncertain(item, requestId, errorCode = 'SFX_SUBMISSION_UNKNOWN') {
      const previous = current.find(record => record.requestId === requestId) ??
        current.find(record => record.cueId === item.cueId &&
          record.cueIdentity === item.cueIdentity && record.status === 'SUBMITTED');
      const base = previous ?? {
        cueId: item.cueId, cueIdentity: item.cueIdentity, requestId,
        submittedAt: now(),
      };
      const next = normalizeRecord({
        ...base, requestId: base.requestId ?? requestId,
        status: 'SUBMISSION_UNKNOWN', lastCheckedAt: now(),
        lastErrorCode: errorCode,
      });
      current = replaceRecord(current, next);
      emit();
      return next;
    },
    async requestRemoteCancel(requestId, transport) {
      const previous = current.find(record => record.requestId === requestId);
      if (!previous) throw new Error('SFX_NOT_FOUND');
      if (!transport || typeof transport.cancel !== 'function') {
        throw new TypeError('SFX transport cancel required');
      }
      const result = await transport.cancel(requestId);
      if (result?.requestId !== requestId || result.status !== 'CANCEL_REQUESTED') {
        throw new Error('SFX_IDENTITY');
      }
      return api.updateJob({ requestId, status: 'CANCEL_REQUESTED' });
    },
  };
  return Object.freeze(api);
}


function validScope(scope) {
  return Boolean(scope && typeof scope === 'object' &&
    typeof scope.projectId === 'string' && scope.projectId &&
    Number.isSafeInteger(scope.projectGeneration) && scope.projectGeneration >= 0 &&
    typeof scope.cueId === 'string' && scope.cueId &&
    typeof scope.cueIdentity === 'string' && scope.cueIdentity &&
    typeof scope.requestId === 'string' && ID.test(scope.requestId));
}

function jobMatchesScope(job, record, scope) {
  return Boolean(job && typeof job === 'object' &&
    job.requestId === scope.requestId && record.requestId === scope.requestId &&
    job.cueId === scope.cueId && record.cueId === scope.cueId &&
    job.cueIdentity === scope.cueIdentity && record.cueIdentity === scope.cueIdentity &&
    job.projectId === scope.projectId &&
    job.projectGeneration === scope.projectGeneration &&
    KNOWN_STATUSES.has(job.status));
}

/**
 * Applies provider responses to records rebuilt from localStorage only when
 * every durable identity field still belongs to the current show generation.
 * Mismatches are ignored, not merged and never authorize a new submission.
 */
export function reconcileRecoveredRecords(records = [], jobs = [], scope, { now = () => Date.now() } = {}) {
  const normalized = normalizeBatchRecords(records);
  if (!validScope(scope) || !Array.isArray(jobs)) {
    return Object.freeze({ records: normalized, applied: 0, ignored: Array.isArray(jobs) ? jobs.length : 0 });
  }
  const batch = createSfxBatch({ records: normalized, now });
  let applied = 0, ignored = 0;
  for (const job of jobs) {
    const record = batch.records.find(entry => entry.requestId === scope.requestId);
    if (!record || !jobMatchesScope(job, record, scope)) { ignored += 1; continue; }
    const result = batch.applyJobUpdate(job);
    if (result.ignored) ignored += 1;
    else applied += 1;
  }
  return Object.freeze({ records: batch.records, applied, ignored });
}

const TRANSIENT_REFRESH_CODES = new Set([
  'SFX_BUSY', 'SFX_SERVICE', 'NETWORK', 'FAILED_TO_FETCH', 'ECONNREFUSED',
  'ENOTFOUND', 'ETIMEDOUT',
]);
const FATAL_BATCH_CODES = new Set([
  'SHOW_CHANGED', 'PREPARATION_STORAGE_UNAVAILABLE', 'SFX_NOT_CONFIGURED',
  // These codes describe the provider/account as a whole, not one cue. Once
  // one is observed, every later start would predictably fail or risk an
  // unintended charge, so the batch stops submitting but preserves prior work.
  'SFX_DAILY_LIMIT', 'SFX_DAILY_BUDGET', 'SFX_BUDGET_UNKNOWN',
  'SFX_ACTIVE_LIMIT', 'SFX_DUPLICATE', 'BATCH_AUTHORIZATION_REQUIRED',
  'SFX_CAMPAIGN_BUDGET_LIMIT', 'SFX_CAMPAIGN_DUPLICATE_ID',
  'SFX_CAMPAIGN_PROVIDER_PROHIBITED',
]);

function errorCode(error, fallback = 'SFX_SERVICE') {
  const code = error?.code ?? error?.message;
  return typeof code === 'string' && /^[A-Z0-9_:-]{1,80}$/.test(code) ? code : fallback;
}

function defaultSleep(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('PREPARATION_CANCELLED')); return; }
    const abort = () => {
      clearTimeout(timer);
      reject(new Error('PREPARATION_CANCELLED'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', abort);
      resolve();
    }, milliseconds);
    signal?.addEventListener?.('abort', abort, { once: true });
  });
}

function assertTransport(transport) {
  if (!transport || typeof transport.start !== 'function' ||
      typeof transport.refresh !== 'function' || typeof transport.read !== 'function') {
    throw new TypeError('SFX batch transport requires start, read and refresh');
  }
}

/**
 * Serial, failure-isolating batch runner.
 *
 * `activeTrackingMs` is only the local foreground polling budget. Exhausting
 * it leaves the record GENERATING and resumable; it is not a remote timeout.
 * The only operations ever repeated are read/refresh calls. A start is issued
 * once per newly-created record and never for a live or uncertain requestId.
 */
export async function runSfxBatch({
  items = [], records = [], transport, createRequestIds,
  signal, assertCurrent = () => {}, onChange = () => {},
  pollIntervalMs = 2_000, activeTrackingMs = Number.POSITIVE_INFINITY,
  busyRetryMs = 1_000, maxBusyRetries = 5,
  sleep = defaultSleep, now = () => Date.now(),
} = {}) {
  assertTransport(transport);
  if (typeof createRequestIds !== 'function') {
    throw new TypeError('SFX batch requires an explicit request authorization factory');
  }
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 0 ||
      !(activeTrackingMs > 0) || !Number.isFinite(busyRetryMs) || busyRetryMs < 0 ||
      !Number.isSafeInteger(maxBusyRetries) || maxBusyRetries < 0) {
    throw new RangeError('Invalid SFX batch tracking settings');
  }
  const batch = createSfxBatch({ items, records, now });
  let stopped = false;
  const check = () => {
    if (signal?.aborted) throw new Error('PREPARATION_CANCELLED');
    assertCurrent();
  };
  const publish = () => onChange(batch.snapshot());

  async function callRefresh(requestId) {
    let busyRetries = 0;
    for (;;) {
      check();
      try { return await transport.refresh(requestId); }
      catch (error) {
        const code = errorCode(error);
        if (!TRANSIENT_REFRESH_CODES.has(code) || busyRetries >= maxBusyRetries) throw error;
        busyRetries += 1;
        await sleep(busyRetryMs, signal);
      }
    }
  }

  async function track(record) {
    let currentRecord = record;
    if (currentRecord.phase === 'UNCERTAIN') return currentRecord;
    if (ACTIVE_STATUSES.has(currentRecord.status) ||
        currentRecord.status === 'SUBMITTED') {
      const startedTracking = now();
      for (;;) {
        check();
        let job;
        try {
          job = await callRefresh(currentRecord.requestId);
        } catch (error) {
          if (errorCode(error) === 'PREPARATION_CANCELLED' || signal?.aborted) throw error;
          if (FATAL_BATCH_CODES.has(errorCode(error))) throw error;
          currentRecord = batch.updateJob(
            { requestId: currentRecord.requestId, status: currentRecord.status },
            { errorCode: errorCode(error) });
          publish();
          return currentRecord;
        }
        if (!job || job.requestId !== currentRecord.requestId) throw new Error('SFX_IDENTITY');
        const applied = batch.applyJobUpdate(job);
        if (!applied.ignored) {
          currentRecord = applied.record;
          publish();
        }
        if (!ACTIVE_STATUSES.has(currentRecord.status)) return currentRecord;
        if (now() - startedTracking >= activeTrackingMs) return currentRecord;
        await sleep(pollIntervalMs, signal);
      }
    }
    return currentRecord;
  }

  try {
    // Recovery pass first: never authorize a cue that already owns a job.
    for (const item of items) {
      check();
      const existing = batch.recordFor(item);
      if (existing) {
        if (ACTIVE_STATUSES.has(existing.status) || existing.status === 'SUBMITTED') {
          const local = await transport.read(existing.requestId);
          if (!local || local.requestId !== existing.requestId) throw new Error('SFX_IDENTITY');
          const reconciled = batch.applyJobUpdate(local);
          if (!reconciled.ignored) publish();
          await track(reconciled.record ?? existing);
        }
        continue;
      }
      check();
      const ids = createRequestIds(item);
      if (!ids || !ID.test(ids.requestId ?? '') || !ID.test(ids.authorizationId ?? '')) {
        throw new Error('BATCH_AUTHORIZATION_REQUIRED');
      }
      let record = batch.markSubmitted(item, ids.requestId);
      publish();
      let job;
      try {
        job = await transport.start(item, ids);
      } catch (error) {
        const code = errorCode(error);
        if (code === 'PREPARATION_CANCELLED' || signal?.aborted) throw error;
        if (code === 'SFX_IDENTITY') throw error;
        record = batch.markUncertain(item, error.requestId ?? ids.requestId, code);
        publish();
        if (FATAL_BATCH_CODES.has(code)) throw error;
        continue;
      }
      if (!job || job.requestId !== ids.requestId) throw new Error('SFX_IDENTITY');
      const submitted = batch.applyJobUpdate(job);
      record = submitted.record ?? record;
      if (!submitted.ignored) publish();
      await track(record);
    }
  } catch (error) {
    if (errorCode(error) === 'PREPARATION_CANCELLED' || signal?.aborted) stopped = true;
    else throw error;
  }
  const state = batch.snapshot();
  return Object.freeze({
    records: state.records, summary: state.summary, stopped,
  });
}
