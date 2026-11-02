import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SFX_BATCH_PHASES,
  createSfxBatch,
  normalizeBatchRecords,
  reconcileRecoveredRecords,
  runSfxBatch,
} from '../src/core/sfxBatch.mjs';

const items = count => Array.from({ length: count }, (_, index) => ({
  cueId: 'cue-' + (index + 1),
  cueIdentity: 'identity-' + (index + 1),
  label: 'Cue ' + (index + 1),
  number: String(index + 1),
  draft: {
    sourceLineId: 'L' + (index + 1), kind: 'SFX', prompt: 'Sound ' + (index + 1),
    durationSeconds: 3,
  },
}));

function transport(script = {}) {
  const calls = { starts: [], refreshes: [], reads: [], cancels: [] };
  let sequence = 0;
  const api = {
    async start(item, ids) {
      const index = Number(item.cueId.split('-').at(-1));
      // The real server confirms the operator-authorized requestId.
      const request = { requestId: ids.requestId, attempt: index };
      calls.starts.push({ item, request });
      sequence += 1;
      const behavior = script.start?.(item, index) ?? { status: 'QUEUED' };
      if (behavior.throw) throw behavior.throw;
      return { requestId: request.requestId, status: behavior.status ?? 'QUEUED' };
    },
    async refresh(requestId) {
      calls.refreshes.push(requestId);
      const behavior = script.refresh?.(requestId,
        calls.refreshes.filter(id => id === requestId).length);
      if (behavior?.throw) throw behavior.throw;
      return {
        requestId, status: behavior?.status ?? 'READY_FOR_REVIEW',
        ...(behavior?.wav ? { wav: behavior.wav } : {}),
      };
    },
    async read(requestId) {
      calls.reads.push(requestId);
      const behavior = script.read?.(requestId);
      if (behavior?.throw) throw behavior.throw;
      return { requestId, status: behavior?.status ?? 'READY_FOR_REVIEW' };
    },
    async cancel(requestId) {
      calls.cancels.push(requestId);
      return { requestId, status: 'CANCEL_REQUESTED' };
    },
  };
  return { api, calls };
}

test('batch phases cover pending, submitted, generating, ready, failed and uncertain', () => {
  assert.deepEqual(SFX_BATCH_PHASES, [
    'PENDING', 'SUBMITTED', 'GENERATING', 'READY', 'FAILED', 'UNCERTAIN',
    'CANCEL_REQUESTED', 'CANCELLED', 'REJECTED',
  ]);
});

for (const size of [5, 20, 50, 100]) {
  test(`serial batch completes ${size} cues without overlapping starts`, async () => {
    const { api, calls } = transport();
    let active = 0, maximum = 0;
    const originalStart = api.start;
    api.start = async (...args) => {
      active += 1; maximum = Math.max(maximum, active);
      await Promise.resolve();
      try { return await originalStart(...args); } finally { active -= 1; }
    };
    const result = await runSfxBatch({
      items: items(size), transport: api,
      createRequestIds: item => ({
        requestId: 'batch-' + item.cueId,
        authorizationId: 'auth-' + item.cueId,
      }),
      pollIntervalMs: 0, sleep: async () => {}, now: () => 0,
    });
    assert.equal(result.summary.ready, size);
    assert.equal(result.summary.total, size);
    assert.equal(calls.starts.length, size);
    assert.equal(maximum, 1);
  });
}

test('cue 2 failure is isolated and cue 3 still succeeds', async () => {
  const { api, calls } = transport({
    refresh(requestId, attempt) {
      if (requestId === 'client-2') return { status: 'FAILED' };
      return { status: attempt === 1 ? 'RUNNING' : 'READY_FOR_REVIEW' };
    },
  });
  const result = await runSfxBatch({
    items: items(3), transport: api,
    createRequestIds: item => ({
      requestId: 'client-' + item.cueId.split('-').at(-1),
      authorizationId: 'auth-' + item.cueId,
    }),
    pollIntervalMs: 0, sleep: async () => {}, now: () => 0,
  });
  assert.deepEqual(result.records.map(record => record.phase),
    ['READY', 'FAILED', 'READY']);
  assert.equal(result.summary.ready, 2);
  assert.equal(result.summary.failed, 1);
  assert.deepEqual(calls.starts.map(call => call.item.cueId),
    ['cue-1', 'cue-2', 'cue-3']);
});

test('global provider limits stop new submissions without hiding completed work', async () => {
  const { api, calls } = transport();
  const realStart = api.start;
  api.start = async (item, ids) => {
    if (item.cueId !== 'cue-2') return realStart(item, ids);
    calls.starts.push({ item, request: { requestId: ids.requestId } });
    const error = new Error('daily limit');
    error.code = 'SFX_DAILY_LIMIT';
    throw error;
  };
  await assert.rejects(runSfxBatch({
    items: items(3), transport: api,
    createRequestIds: item => ({
      requestId: 'limited-' + item.cueId.split('-').at(-1),
      authorizationId: 'auth-' + item.cueId,
    }),
    pollIntervalMs: 0, sleep: async () => {}, now: () => 0,
  }), error => error.code === 'SFX_DAILY_LIMIT');
  assert.deepEqual(calls.starts.map(call => call.item.cueId), ['cue-1', 'cue-2']);
});

test('remote work older than 120 seconds remains generating, not failed', async () => {
  let clock = 0;
  const { api, calls } = transport({
    refresh(requestId, attempt) {
      return { status: attempt < 4 ? 'RUNNING' : 'READY_FOR_REVIEW' };
    },
  });
  const result = await runSfxBatch({
    items: items(1), transport: api,
    createRequestIds: () => ({ requestId: 'slow-1', authorizationId: 'auth-slow-1' }),
    activeTrackingMs: 120_000, pollIntervalMs: 50_000,
    now: () => clock, sleep: async milliseconds => { clock += milliseconds; },
  });
  assert.equal(result.records[0].phase, 'READY');
  assert.ok(clock > 120_000);
  assert.equal(calls.starts.length, 1);
  assert.ok(calls.refreshes.length >= 4);
});

test('tracking timeout leaves the job resumable by requestId without resubmission', async () => {
  let clock = 0;
  const { api, calls } = transport({ refresh: () => ({ status: 'RUNNING' }) });
  const first = await runSfxBatch({
    items: items(1), transport: api,
    createRequestIds: () => ({ requestId: 'slow-resume', authorizationId: 'auth-slow-resume' }),
    activeTrackingMs: 1_000, pollIntervalMs: 500,
    now: () => clock, sleep: async milliseconds => { clock += milliseconds; },
  });
  assert.equal(first.records[0].phase, 'GENERATING');
  assert.equal(first.summary.generating, 1);

  api.refresh = async requestId => {
    calls.refreshes.push(requestId);
    return { requestId, status: 'READY_FOR_REVIEW' };
  };
  const resumed = await runSfxBatch({
    items: items(1), records: first.records, transport: api,
    createRequestIds: () => { throw new Error('must not authorize a duplicate'); },
    pollIntervalMs: 0, sleep: async () => {}, now: () => clock,
  });
  assert.equal(resumed.records[0].phase, 'READY');
  assert.equal(calls.starts.length, 1);
});

test('browser restart recovers persisted work and the completed WAV reference', async () => {
  const saved = normalizeBatchRecords([{
    cueId: 'cue-1', cueIdentity: 'identity-1', requestId: 'req-restart',
    status: 'RUNNING', phase: 'GENERATING', submittedAt: 10, lastCheckedAt: 20,
  }]);
  const { api, calls } = transport({
    read: () => ({ status: 'RUNNING' }),
    refresh: () => ({ status: 'READY_FOR_REVIEW', wav: { sha256: 'a'.repeat(64) } }),
  });
  const result = await runSfxBatch({
    items: items(1), records: saved, transport: api,
    createRequestIds: () => { throw new Error('duplicate authorization'); },
    pollIntervalMs: 0, sleep: async () => {}, now: () => 30,
  });
  assert.equal(result.records[0].phase, 'READY');
  assert.equal(result.records[0].status, 'READY_FOR_REVIEW');
  assert.equal(result.records[0].wavSha256, 'a'.repeat(64));
  assert.equal(calls.starts.length, 0);
  assert.deepEqual(calls.reads, ['req-restart']);
  assert.deepEqual(calls.refreshes, ['req-restart']);
});

test('SUBMISSION_UNKNOWN is never resubmitted and remains explicitly uncertain', async () => {
  const { api, calls } = transport();
  const realStart = api.start;
  api.start = async (item, ids) => {
    if (item.cueId !== 'cue-1') return realStart(item, ids);
    calls.starts.push({ item });
    const error = new Error('submission failed');
    error.code = 'SFX_SUBMISSION_UNKNOWN';
    error.requestId = 'req-uncertain';
    throw error;
  };
  const result = await runSfxBatch({
    items: items(2), transport: api,
    createRequestIds: item => ({
      requestId: 'req-' + item.cueId, authorizationId: 'auth-' + item.cueId,
    }),
    pollIntervalMs: 0, sleep: async () => {}, now: () => 0,
  });
  assert.equal(result.records[0].phase, 'UNCERTAIN');
  // The local authorized identity remains canonical; the important safety
  // property is that this cue is never submitted a second time.
  assert.equal(result.records[0].requestId, 'req-cue-1');
  assert.equal(result.records[1].phase, 'READY');
  assert.equal(calls.starts.length, 2);

  const again = await runSfxBatch({
    items: items(2), records: result.records, transport: api,
    createRequestIds: () => { throw new Error('must not create another authorization'); },
    pollIntervalMs: 0, sleep: async () => {}, now: () => 1,
  });
  assert.equal(again.records[0].phase, 'UNCERTAIN');
  assert.equal(calls.starts.length, 2);
});


test('two tabs refreshing one job share one identity and never resubmit it', async () => {
  const records = normalizeBatchRecords([{
    cueId: 'cue-1', cueIdentity: 'identity-1', requestId: 'shared-1',
    status: 'RUNNING', submittedAt: 0, lastCheckedAt: 0,
  }]);
  const { api, calls } = transport({
    read: () => ({ status: 'RUNNING' }),
    refresh: () => ({ status: 'READY_FOR_REVIEW', wav: { sha256: 'c'.repeat(64) } }),
  });
  const options = tab => ({
    items: items(1), records, transport: api,
    createRequestIds: () => { throw new Error('tab ' + tab + ' must not authorize'); },
    pollIntervalMs: 0, sleep: async () => {}, now: () => 1,
  });
  const [first, second] = await Promise.all([
    runSfxBatch(options('A')), runSfxBatch(options('B')),
  ]);
  assert.equal(first.records[0].phase, 'READY');
  assert.equal(second.records[0].phase, 'READY');
  assert.equal(calls.starts.length, 0);
  assert.equal(calls.reads.length, 2);
  assert.equal(calls.refreshes.length, 2);
  assert.ok(calls.refreshes.every(id => id === 'shared-1'));
});

test('transient refresh errors stay generating and global refresh errors stop tracking', async () => {
  let attempts = 0;
  const transient = transport({
    refresh() {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('offline');
        error.code = 'NETWORK';
        return { throw: error };
      }
      return { status: 'READY_FOR_REVIEW' };
    },
  });
  const recovered = await runSfxBatch({
    items: items(1), transport: transient.api,
    createRequestIds: () => ({ requestId: 'net-1', authorizationId: 'auth-net-1' }),
    pollIntervalMs: 0, busyRetryMs: 0, maxBusyRetries: 2,
    sleep: async () => {}, now: () => 0,
  });
  assert.equal(recovered.records[0].phase, 'READY');
  assert.equal(transient.calls.refreshes.length, 2);

  const globalError = transport({
    refresh() {
      const error = new Error('job store failure');
      error.code = 'SFX_SERVICE';
      return { throw: error };
    },
  });
  const globalResult = await runSfxBatch({
    items: items(1), transport: globalError.api,
    createRequestIds: () => ({ requestId: 'global-1', authorizationId: 'auth-global-1' }),
    pollIntervalMs: 0, busyRetryMs: 0, maxBusyRetries: 1,
    sleep: async () => {}, now: () => 0,
  });
  assert.equal(globalResult.records[0].phase, 'GENERATING');
  assert.equal(globalResult.records[0].lastErrorCode, 'SFX_SERVICE');
  assert.equal(globalError.calls.starts.length, 1);
});

test('invalid authorization fails before any start and invalid records fail closed', async () => {
  const { api, calls } = transport();
  await assert.rejects(runSfxBatch({
    items: items(1), transport: api,
    createRequestIds: () => ({ requestId: 'valid-id' }),
    pollIntervalMs: 0, sleep: async () => {}, now: () => 0,
  }), error => (error.code ?? error.message) === 'BATCH_AUTHORIZATION_REQUIRED');
  assert.equal(calls.starts.length, 0);
  assert.throws(() => normalizeBatchRecords([{
    cueId: 'cue-1', cueIdentity: 'id', requestId: 'x', status: 'NOT_A_STATE',
  }]), /INVALID_BATCH_RECORD/);
});

test('SFX_BUSY during refresh is transient and never becomes a generation failure', async () => {
  let busy = true;
  const { api } = transport({
    refresh() {
      if (busy) {
        busy = false;
        const error = new Error('busy');
        error.code = 'SFX_BUSY';
        return { throw: error };
      }
      return { status: 'READY_FOR_REVIEW' };
    },
  });
  const result = await runSfxBatch({
    items: items(1), transport: api,
    createRequestIds: () => ({ requestId: 'busy-1', authorizationId: 'auth-busy-1' }),
    pollIntervalMs: 0, sleep: async () => {}, now: () => 0,
    busyRetryMs: 0, maxBusyRetries: 2,
  });
  assert.equal(result.records[0].phase, 'READY');
});

test('stopping a batch prevents new submissions without remote cancellation', async () => {
  const controller = new AbortController();
  const { api, calls } = transport({
    refresh() {
      controller.abort();
      return { status: 'RUNNING' };
    },
  });
  const result = await runSfxBatch({
    items: items(3), transport: api, signal: controller.signal,
    createRequestIds: item => ({
      requestId: 'req-' + item.cueId, authorizationId: 'auth-' + item.cueId,
    }),
    pollIntervalMs: 0, sleep: async () => {}, now: () => 0,
  });
  assert.equal(result.stopped, true);
  assert.equal(calls.starts.length, 1);
  assert.equal(calls.cancels.length, 0);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].phase, 'GENERATING');
});

test('remote cancellation is a separate explicit operation', async () => {
  const batch = createSfxBatch({
    records: [{ cueId: 'cue-1', cueIdentity: 'id-1', requestId: 'req-1', status: 'RUNNING' }],
  });
  const { api, calls } = transport();
  const record = await batch.requestRemoteCancel('req-1', api);
  assert.equal(record.phase, 'CANCEL_REQUESTED');
  assert.deepEqual(calls.cancels, ['req-1']);
  await assert.rejects(() => batch.requestRemoteCancel('missing', api), /SFX_NOT_FOUND/);
});

test('records and completed WAV references survive serialization and reload', () => {
  const records = normalizeBatchRecords([{
    cueId: 'cue-1', cueIdentity: 'identity-1', requestId: 'req-1',
    status: 'READY_FOR_REVIEW', wavSha256: 'b'.repeat(64),
  }]);
  assert.equal(records[0].phase, 'READY');
  assert.equal(records[0].wavSha256, 'b'.repeat(64));
  assert.deepEqual(JSON.parse(JSON.stringify(records)), records);
  assert.throws(() => normalizeBatchRecords([{ cueId: 'x' }]), /INVALID_BATCH_RECORD/);
});

test('failed identity can be retried explicitly while active identity blocks duplicates', () => {
  const records = normalizeBatchRecords([
    { cueId: 'cue-1', cueIdentity: 'identity-1', requestId: 'req-old', status: 'FAILED' },
  ]);
  const batch = createSfxBatch({ items: items(1), records });
  assert.equal(batch.eligibleItems().length, 1);
  batch.markSubmitted(items(1)[0], 'req-running');
  assert.equal(batch.eligibleItems().length, 0);
  assert.equal(batch.trackingRecords().length, 1);
});


function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('deferred refresh resolving after its record was removed is ignored, never global', async () => {
  const batch = createSfxBatch({
    records: [{
      cueId: 'cue-1', cueIdentity: 'identity-1', requestId: 'late-1', status: 'RUNNING',
    }],
  });
  const staleTab = createSfxBatch({ records: batch.records });
  const pending = deferred();
  const refresh = pending.promise.then(job => staleTab.applyJobUpdate(job));
  // The browser state is rebuilt without this record while refresh is pending.
  const rebuilt = createSfxBatch({ records: [] });
  assert.equal(rebuilt.applyJobUpdate({ requestId: 'late-1', status: 'READY_FOR_REVIEW' }).reason,
    'UNKNOWN_REQUEST');
  pending.resolve({ requestId: 'late-1', status: 'RUNNING' });
  const applied = await refresh;
  assert.equal(applied.ignored, false);
  assert.equal(staleTab.records[0].status, 'RUNNING');
  assert.equal(batch.records[0].status, 'RUNNING');
});

test('stale RUNNING cannot overwrite READY, ACCEPTED or CANCELLED in any tab', async () => {
  for (const terminal of ['READY_FOR_REVIEW', 'ACCEPTED_FOR_MANUAL_IMPORT', 'CANCELLED']) {
    const batch = createSfxBatch({
      records: [{
        cueId: 'cue-1', cueIdentity: 'identity-1', requestId: 'stale-1',
        status: terminal, wavSha256: terminal === 'CANCELLED' ? undefined : 'd'.repeat(64),
      }],
    });
    const before = batch.records[0];
    const applied = batch.applyJobUpdate({ requestId: 'stale-1', status: 'RUNNING' });
    assert.equal(applied.ignored, true, terminal);
    assert.equal(applied.record.status, terminal, terminal);
    assert.deepEqual(batch.records[0], before, terminal);
  }
});

test('unknown late response is traced locally without resurrecting or resubmitting it', async () => {
  const batch = createSfxBatch({
    records: [{
      cueId: 'cue-1', cueIdentity: 'identity-1', requestId: 'known-1',
      status: 'READY_FOR_REVIEW', wavSha256: 'e'.repeat(64),
    }],
  });
  const result = batch.applyJobUpdate({ requestId: 'ghost-1', status: 'READY_FOR_REVIEW' });
  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'UNKNOWN_REQUEST');
  assert.equal(batch.records.length, 1);
  assert.equal(batch.records[0].requestId, 'known-1');
});

test('rebuilt localStorage state only applies matching project cue request and generation', async () => {
  const saved = normalizeBatchRecords([{
    cueId: 'cue-1', cueIdentity: 'identity-1', requestId: 'saved-1',
    status: 'RUNNING', submittedAt: 1, lastCheckedAt: 2,
  }]);
  const scope = Object.freeze({
    projectId: 'show-1', projectGeneration: 7, cueId: 'cue-1',
    cueIdentity: 'identity-1', requestId: 'saved-1',
  });
  const matching = reconcileRecoveredRecords(saved, [{
    requestId: 'saved-1', status: 'READY_FOR_REVIEW', projectId: 'show-1',
    projectGeneration: 7, cueId: 'cue-1', cueIdentity: 'identity-1',
    wav: { sha256: 'f'.repeat(64) },
  }], scope);
  assert.equal(matching.records[0].phase, 'READY');
  assert.equal(matching.applied, 1);
  assert.equal(matching.ignored, 0);

  for (const drift of [
    { projectId: 'show-2' }, { projectGeneration: 8 },
    { cueId: 'cue-2' }, { cueIdentity: 'identity-2' }, { requestId: 'saved-2' },
  ]) {
    const outcome = reconcileRecoveredRecords(saved, [{
      requestId: 'saved-1', status: 'READY_FOR_REVIEW', projectId: 'show-1',
      projectGeneration: 7, cueId: 'cue-1', cueIdentity: 'identity-1',
      ...drift, wav: { sha256: 'a'.repeat(64) },
    }], scope);
    assert.equal(outcome.applied, 0, JSON.stringify(drift));
    assert.equal(outcome.ignored, 1, JSON.stringify(drift));
    assert.equal(outcome.records[0].status, 'RUNNING', JSON.stringify(drift));
  }
});
