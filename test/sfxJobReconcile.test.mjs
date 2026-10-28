import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createSfxJobStore } from '../src/core/sfxJobStore.mjs';

const model = 'stabilityai/stable-audio-3-small-sfx';
const TEST_DATE = '2026-10-28T12:00:00.000Z';
const VERIFIED_AT = '2026-10-28T12:00:30.000Z';
const EVIDENCE_TEXT =
  'modal app list -> ap-X Tasks 0\n' +
  'fc-rec-1 Received a cancellation signal while processing input\n' +
  'fc-rec-1 Successfully canceled input\n';
const EVIDENCE_SHA = createHash('sha256').update(EVIDENCE_TEXT).digest('hex');
const runTool = promisify(execFile);
const sha256 = id => createHash('sha256').update(id).digest('hex');
const entryPath = (directory, requestId) => join(directory, 'job-' + sha256(requestId) + '.json');

function storeRequest(overrides = {}) {
  return {
    requestId: 'rec-1', authorizationId: 'auth-rec-1', sourceLineId: 'L1',
    kind: 'SFX', modelCandidate: model, prompt: 'Rain',
    durationSeconds: 1, seed: 0, modelRevision: '05ca3857881c94a2b84026b1111c537d78f5f9f0',
    estimatedMaxCostUsdPerRequest: 0.04, dailyBudgetUsd: 0.2,
    acknowledgedMaxCostUsd: 0.04, ...overrides,
  };
}

function baseEvidence(overrides = {}) {
  return {
    remoteJobId: 'fc-rec-1', terminalStatus: 'CANCELLED', verifiedAt: VERIFIED_AT,
    verifiedVia: 'read-only Modal CLI evidence (modal app logs / modal app list)',
    verifiedBy: 'operator-test', evidenceSha256: EVIDENCE_SHA,
    evidenceNote: 'system logs confirm the cancellation signal was delivered',
    ...overrides,
  };
}

async function cancelledFixture(t, {
  requestId = 'rec-1', remoteJobId = 'fc-rec-1', finalStatus = 'CANCEL_REQUESTED',
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'runq-reconcile-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let nowMs = Date.parse(TEST_DATE);
  const store = createSfxJobStore({
    directory, clock: () => new Date(nowMs), maxDailyStarts: 3,
  });
  await store.reserve(storeRequest({ requestId, authorizationId: 'auth-' + requestId }), { confirm: true });
  await store.update(requestId, 'QUEUED', { remoteJobId });
  if (finalStatus !== 'QUEUED') await store.update(requestId, finalStatus);
  const before = JSON.parse(await readFile(entryPath(directory, requestId), 'utf8'));
  return {
    store, directory, before,
    bumpClock: increaseMs => { nowMs = Date.parse(TEST_DATE) + increaseMs; },
  };
}

test('reconciliation only applies to CANCEL_REQUESTED records', async t => {
  const { store } = await cancelledFixture(t, { finalStatus: 'QUEUED' });
  await assert.rejects(
    store.reconcileCancelled('rec-1', baseEvidence()),
    error => error.code === 'SFX_RECONCILE_STATE');
});

test('unverified or mismatched evidence never changes the journal', async t => {
  const { store, directory } = await cancelledFixture(t);
  for (const evidence of [
    baseEvidence({ remoteJobId: 'fc-other' }),
    baseEvidence({ terminalStatus: 'FAILED' }),
    baseEvidence({ verifiedAt: '2026-10-28T11:59:30.000Z' }),
    baseEvidence({ verifiedAt: '2026-10-28T12:09:30.000Z' }), // beyond the fixed fixture clock
    baseEvidence({ evidenceNote: 'x'.repeat(600) }),
    { ...baseEvidence(), malicious: 'extra key' },
  ]) {
    await assert.rejects(
      store.reconcileCancelled('rec-1', evidence),
      error => error.code === 'SFX_RECONCILE_EVIDENCE');
  }
  const after = JSON.parse(await readFile(entryPath(directory, 'rec-1'), 'utf8'));
  assert.equal(after.status, 'CANCEL_REQUESTED');
});

test('verified evidence reconciles once, keeps full history and never deletes files', async t => {
  const { store, directory, before, bumpClock } = await cancelledFixture(t);
  bumpClock(60_000);
  const updated = await store.reconcileCancelled('rec-1', baseEvidence());
  assert.equal(updated.status, 'CANCELLED');
  assert.equal(updated.reconciliation.remoteJobId, 'fc-rec-1');
  assert.equal(updated.reconciliation.fromStatus, 'CANCEL_REQUESTED');
  assert.equal(updated.reconciliation.terminalStatus, 'CANCELLED');
  assert.equal(updated.reconciliation.verifiedBy, 'operator-test');
  assert.deepEqual(updated.prompt, before.prompt);
  assert.deepEqual(updated.seed, before.seed);
  assert.equal(updated.remoteJobId, undefined);
  const roundTrip = await store.read('rec-1');
  assert.equal(roundTrip.status, 'CANCELLED');
  assert.equal(roundTrip.reconciliation.verifiedAt, VERIFIED_AT);
  assert.equal(roundTrip.reconciliation.remoteJobId, 'fc-rec-1');
  assert.equal(await store.wavBytes('rec-1'), null);

  bumpClock(120_000);
  await assert.rejects(
    store.reconcileCancelled('rec-1', { ...baseEvidence(), verifiedAt: '2026-10-28T12:01:30.000Z' }),
    error => error.code === 'SFX_ALREADY_RECONCILED');
  const after = JSON.parse(await readFile(entryPath(directory, 'rec-1'), 'utf8'));
  assert.equal(after.status, 'CANCELLED');
  assert.equal(after.createdAt, before.createdAt);
  assert.equal(after.reconciliation.requestId, undefined);
  assert.equal((await readdir(directory)).filter(name => name.startsWith('job-')).length, 1);
});

test('reconciliation clears the single-active-slot for the next authorized request', async t => {
  const { store, bumpClock } = await cancelledFixture(t);
  await assert.rejects(
    store.reconcileCancelled('rec-1', baseEvidence({ remoteJobId: 'fc-wrong' })),
    error => error.code === 'SFX_RECONCILE_EVIDENCE');
  await assert.rejects(
    store.reserve(storeRequest({
      requestId: 'next-after-reconcile', authorizationId: 'auth-next-after-reconcile',
    }), { confirm: true }),
    error => error.code === 'SFX_ACTIVE_LIMIT');
  bumpClock(60_000);
  await store.reconcileCancelled('rec-1', baseEvidence());
  const second = await store.reserve(storeRequest({
    requestId: 'next-after-reconcile', authorizationId: 'auth-next-after-reconcile',
  }), { confirm: true });
  assert.equal(second.status, 'SUBMISSION_UNKNOWN');
});

test('persisted reconciliation records are strictly validated on load', async t => {
  const { directory } = await cancelledFixture(t);
  const path = entryPath(directory, 'rec-1');
  const raw = JSON.parse(await readFile(path, 'utf8'));
  raw.status = 'CANCELLED';
  raw.reconciliation = {
    at: VERIFIED_AT, fromStatus: 'CANCEL_REQUESTED', remoteJobId: 'fc-rec-1',
    terminalStatus: 'CANCELLED', verifiedAt: VERIFIED_AT,
    verifiedVia: 'read-only Modal CLI evidence (modal app logs / modal app list)',
    verifiedBy: 'operator-test', evidenceSha256: 'not-a-hash', evidenceNote: null,
  };
  await writeFile(path, JSON.stringify(raw));
  const store = createSfxJobStore({ directory, clock: () => new Date(TEST_DATE) });
  await assert.rejects(store.read('rec-1'), /Invalid persisted SFX reconciliation/);
});

test('tool dry run changes nothing; execute reconciles once with audit and refuses rerun', async t => {
  const { directory, before } = await cancelledFixture(t);
  const evidencePath = join(directory, 'probe-evidence.log');
  await writeFile(evidencePath, EVIDENCE_TEXT);
  const toolPath = resolve('tools/sfx-job-reconcile.mjs');
  const argv = [
    '--request-id', 'rec-1', '--store-dir', directory,
    '--evidence-file', evidencePath, '--verified-at', VERIFIED_AT,
    '--note', 'probe cancelled on the provider side',
  ];

  const dry = await runTool(process.execPath, [toolPath, ...argv]);
  assert.match(dry.stdout, /DRY RUN/);
  assert.deepEqual(JSON.parse(await readFile(entryPath(directory, 'rec-1'), 'utf8')), before);
  assert.deepEqual((await readdir(directory)).includes('audit'), false);

  const applied = await runTool(process.execPath, [
    toolPath, ...argv, '--verified-by', 'operator-cli', '--execute',
  ]);
  assert.match(applied.stdout, /applied/);
  const reconciled = JSON.parse(await readFile(entryPath(directory, 'rec-1'), 'utf8'));
  assert.equal(reconciled.status, 'CANCELLED');
  assert.equal(reconciled.reconciliation.evidenceSha256, EVIDENCE_SHA);
  assert.equal(reconciled.reconciliation.verifiedBy, 'operator-cli');
  const auditLines = (await readFile(join(directory, 'audit', 'journal-audit.jsonl'), 'utf8'))
    .trim().split('\n');
  assert.equal(auditLines.length, 1);
  const audit = JSON.parse(auditLines[0]);
  assert.equal(audit.fromStatus, 'CANCEL_REQUESTED');
  assert.equal(audit.toStatus, 'CANCELLED');
  assert.equal(audit.evidenceSha256, EVIDENCE_SHA);

  await assert.rejects(
    runTool(process.execPath, [toolPath, ...argv, '--verified-by', 'operator-cli', '--execute']),
    error => error.code === 2);
  assert.deepEqual(
    JSON.parse(await readFile(entryPath(directory, 'rec-1'), 'utf8')), reconciled);
  assert.deepEqual(
    (await readFile(join(directory, 'audit', 'journal-audit.jsonl'), 'utf8')).trim().split('\n'),
    auditLines);
});

test('tool refuses missing evidence instead of reconciling blindly', async t => {
  const { directory } = await cancelledFixture(t);
  const toolPath = resolve('tools/sfx-job-reconcile.mjs');
  await assert.rejects(
    runTool(process.execPath, [
      toolPath, '--request-id', 'rec-1', '--store-dir', directory,
      '--evidence-file', join(directory, 'missing.log'), '--verified-at', VERIFIED_AT,
      '--verified-by', 'operator-cli', '--execute',
    ]),
    error => error.code === 2);
});
