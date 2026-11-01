#!/usr/bin/env node
/** Read-only verification of saved campaign evidence. Never invokes a provider. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { SUITES } from './runq-campaign.mjs';
import { checkLedgerAuthorization, globalLedgerDefaultPath } from '../src/qa/globalSpendLedger.mjs';
import { signalMetrics } from './browserAudioProbe.mjs';

const requireEvidence = (condition, code) => { if (!condition) throw new Error(code); };
const sum = (rows, key) => rows.reduce((n, r) => n + r[key], 0);

export function verifyJourneys(rows, summary) {
  requireEvidence(rows.length > 0 && rows.length === summary.planned &&
    rows.length === summary.recorded, 'JOURNEY_COUNT_MISMATCH');
  requireEvidence(new Set(rows.map(r => r.id)).size === rows.length, 'DUPLICATE_JOURNEY');
  for (const r of rows) {
    requireEvidence(r.ok === true && !r.error && !r.errors.length && !r.forbidden.length &&
      !r.unmockedApi.length, 'JOURNEY_NOT_SUCCESSFUL');
    requireEvidence(r.steps.length > 0 && r.steps.every(s => s.ok === true), 'JOURNEY_STEP_FAILED');
    requireEvidence(r.checks > 0 && r.steps.every(s => Number.isSafeInteger(s.checks) && s.checks >= 0) &&
      sum(r.steps, 'checks') === r.checks && sum(r.steps, 'actions') === r.actions, 'JOURNEY_STEP_TOTAL_MISMATCH');
    if (r.type === 'full-show') for (const name of ['approve-two', 'sound-generate-listen-accept-1',
      'sound-generate-listen-accept-2', 'edit-fade-loop-trigger', 'rehearsal-auto-arm-disarm-panic',
      'operation-go-go-stop-stopall', 'export-zip', 'verify-zip-offline', 'close-reopen-verify'])
      requireEvidence(r.steps.some(s => s.name === name), 'FULL_SHOW_STEP_MISSING');
  }
  const totals = { records: rows.length, passed: rows.length, checks: sum(rows, 'checks'), actions: sum(rows, 'actions') };
  requireEvidence(totals.checks === summary.checks && totals.actions === summary.actions.total &&
    summary.passed === rows.length && summary.failed === 0 && summary.forbidden === 0 &&
    summary.serverApiHits === 0 && summary.nodeFetchAttempts === 0, 'JOURNEY_SUMMARY_MISMATCH');
  return totals;
}

export function verifyPilot(pilot, ledger) {
  const budget = checkLedgerAuthorization(ledger);
  const rows = pilot.results;
  requireEvidence(pilot.realProviderEvaluations === true && rows.length > 0 &&
    rows.length === pilot.completedRequests && rows.length === pilot.attemptedRequests, 'PILOT_COUNT_MISMATCH');
  requireEvidence(new Set(rows.map(r => r.requestId)).size === rows.length, 'DUPLICATE_PILOT_REQUEST');
  for (const r of rows) {
    requireEvidence(r.provider === 'meta' && r.httpStatus === 200 && r.retries === 0, 'PILOT_PROTOCOL_MISMATCH');
    const reservation = ledger.reservations.find(e => e.requestId === r.requestId);
    requireEvidence(reservation?.provider === r.provider && reservation.runId === r.runId &&
      reservation.amountMicros === Math.round(r.reservedMaximumUsd * 1e6), 'PILOT_RESERVATION_MISMATCH');
  }
  return { completed: rows.length, correct: rows.filter(r => r.correct === true && r.scored === true).length,
    resolved: rows.filter(r => r.resolved === true).length, reservationMatches: rows.length,
    sourceCommit: pilot.sourceCommit, sourceSnapshotSha256: pilot.sourceSnapshotSha256,
    localReservedUsd: budget.reservedMicros / 1e6, requestCounts: budget.requestCounts,
    caveat: 'Recorded HTTP results corroborated by reservations; not provider billing or human semantic validation.' };
}

export async function auditEvidence({ campaign, pilot, ledgerFile = globalLedgerDefaultPath(), journeys }) {
  const files = [];
  async function read(file, json = true) {
    const bytes = await readFile(file);
    files.push({ file: resolve(file), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    return json ? JSON.parse(bytes) : bytes.toString('utf8');
  }
  const manifest = await read(join(campaign, 'run-manifest.json'));
  const state = await read(join(campaign, 'resume-state.json'));
  const summary = await read(join(campaign, 'summary.json'));
  requireEvidence(state.sha === manifest.git.sha && summary.sha === state.sha, 'CAMPAIGN_SHA_MISMATCH');
  const discrepancies = [], suites = [];
  for (const suite of SUITES) {
    const stored = state.suites[suite.id];
    requireEvidence(stored?.status === 'PASS' && stored.exitCode === 0, 'SUITE_NOT_PASSED:' + suite.id);
    const log = await read(join(campaign, 'logs', suite.id + '.log'), false);
    requireEvidence(log.trim().length > 0, 'SUITE_LOG_EMPTY:' + suite.id);
    const measured = suite.parse ? suite.parse(log) : stored.metrics;
    requireEvidence(!(measured.failures > 0) && !(measured.httpRequests > 0), 'SUITE_LOG_FAILED:' + suite.id);
    for (const key of ['checks', 'unique', 'trials', 'failures', 'httpRequests']) {
      if (measured[key] != null && measured[key] !== stored.metrics[key])
        discrepancies.push({ suite: suite.id, metric: key, recorded: stored.metrics[key], measured: measured[key] });
    }
    suites.push({ id: suite.id, kind: suite.kind, checks: measured.checks ?? null, status: stored.status });
  }
  const journeyDir = journeys ?? join(campaign, 'journeys');
  const journeyRows = (await read(join(journeyDir, 'journeys.jsonl'), false)).trim().split(/\r?\n/).map(JSON.parse);
  const journeySummary = await read(join(journeyDir, 'summary.json'));
  const journeyTotals = verifyJourneys(journeyRows, journeySummary);
  const nativeAudio = [];
  for (const row of journeyRows.filter(r => r.audioMode === 'native')) {
    requireEvidence(/^[a-z0-9-]+$/.test(row.id), 'INVALID_JOURNEY_ARTIFACT_ID');
    for (const label of ['audition-1', 'audition-2', 'go-fade', 'loop-after-file-end', 'overlap',
      'individual-stop', 'stop-all', 'natural-end-loop-remains', 'fade-out', 'reopened-go', 'reopened-stop-all'])
      requireEvidence(row.audioEvidence.some(a => a.label === label), 'NATIVE_MEASUREMENT_MISSING');
    for (const evidence of row.audioEvidence) {
      requireEvidence(/^[a-z0-9-]+\.wav$/.test(evidence.file), 'INVALID_AUDIO_ARTIFACT');
      const file = join(journeyDir, 'audio', evidence.file), bytes = await readFile(file);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      files.push({ file: resolve(file), bytes: bytes.length, sha256 });
      requireEvidence(sha256 === evidence.sha256 && bytes.toString('ascii', 0, 4) === 'RIFF' &&
        bytes.toString('ascii', 8, 12) === 'WAVE' && bytes.readUInt16LE(20) === 1 &&
        bytes.readUInt16LE(34) === 16, 'NATIVE_WAV_MISMATCH');
      const count = bytes.readUInt16LE(22), sampleRate = bytes.readUInt32LE(24), dataSize = bytes.readUInt32LE(40);
      requireEvidence(count === 2 && bytes.length === 44 + dataSize && dataSize % (count * 2) === 0, 'NATIVE_WAV_SIZE');
      const frames = dataSize / (count * 2);
      const channels = Array.from({ length: count }, (_, c) =>
        Array.from({ length: frames }, (_, i) => bytes.readInt16LE(44 + (i * count + c) * 2) / 32767));
      const measured = signalMetrics({ channels, sampleRate });
      requireEvidence(measured.frames === evidence.frames && measured.sampleRate === evidence.sampleRate &&
        Math.abs(measured.rms - evidence.rms) < 0.00004, 'NATIVE_PCM_METRICS_MISMATCH');
      nativeAudio.push({ journey: row.id, label: evidence.label, file: evidence.file, rms: measured.rms, peak: measured.peak });
    }
    for (const file of [join(journeyDir, 'screens', row.id + '.png'),
      join(journeyDir, 'traces', row.id + '-1.zip'), join(journeyDir, 'traces', row.id + '-2.zip'),
      join(journeyDir, 'downloads', row.id + '.showcompiler.zip')]) {
      const bytes = await readFile(file);
      requireEvidence(bytes.length > 0, 'EMPTY_JOURNEY_ARTIFACT');
      files.push({ file: resolve(file), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  if (!journeys) {
    const metrics = SUITES.find(s => s.id === 'user-journeys').parse(
      await readFile(join(campaign, 'logs', 'user-journeys.log'), 'utf8'));
    requireEvidence(metrics.checks === journeyTotals.checks && metrics.trials === journeyTotals.records, 'JOURNEY_LOG_MISMATCH');
  }
  const pilotData = await read(pilot);
  requireEvidence(pilotData.sourceCommit === manifest.git.sha, 'PILOT_SOURCE_MISMATCH');
  // Only hashes and aggregate counts leave the local ledger, never its contents.
  const pilotTotals = verifyPilot(pilotData, JSON.parse(await readFile(ledgerFile, 'utf8')));
  return { version: 1, verifiedAt: new Date().toISOString(), sourceCommit: manifest.git.sha,
    status: discrepancies.length ? 'VERIFIED_WITH_ACCOUNTING_DISCREPANCIES' : 'VERIFIED',
    providerRequestsMadeByAudit: 0, discrepancies, suites, journeys: journeyTotals, nativeAudio, pilot: pilotTotals, files,
    notMeasured: ['human listening', 'Modal semantic audio quality', '107 real-AI gauntlet turns'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = { '--campaign': 'campaign', '--pilot': 'pilot', '--ledger': 'ledgerFile',
        '--journeys': 'journeys', '--out': 'out' }[args[i]];
      if (!key || !args[i + 1] || options[key]) throw new Error('INVALID_AUDIT_ARGUMENTS');
      options[key] = resolve(args[i + 1]);
    }
    if (!options.campaign || !options.pilot || !options.out) throw new Error('CAMPAIGN_PILOT_OUT_REQUIRED');
    const result = await auditEvidence(options);
    await mkdir(options.out, { recursive: true });
    await writeFile(join(options.out, 'evidence-audit.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ status: result.status, suites: result.suites.length,
      journeys: result.journeys, pilot: result.pilot, discrepancies: result.discrepancies }));
  } catch (error) { console.error('EVIDENCE_AUDIT_FAILED', error.message); process.exitCode = 1; }
}
