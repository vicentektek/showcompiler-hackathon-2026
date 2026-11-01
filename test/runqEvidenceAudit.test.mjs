import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyJourneys, verifyPilot } from '../tools/runq-evidence-audit.mjs';
import { CAMPAIGN_POLICY } from '../src/qa/campaignPolicy.mjs';

test('evidence audit rejects incomplete, duplicate, failed or miscounted journey records', () => {
  const row = { id: 'one', type: 'recovery', ok: true, errors: [], forbidden: [], unmockedApi: [],
    checks: 2, actions: 3, steps: [{ name: 'recover', ok: true, checks: 2, actions: 3 }] };
  const summary = { planned: 1, recorded: 1, passed: 1, failed: 0, checks: 2, actions: { total: 3 },
    forbidden: 0, serverApiHits: 0, nodeFetchAttempts: 0 };
  assert.equal(verifyJourneys([row], summary).checks, 2);
  assert.throws(() => verifyJourneys([], summary), /COUNT_MISMATCH/);
  assert.throws(() => verifyJourneys([row, row], { ...summary, planned: 2, recorded: 2 }), /DUPLICATE/);
  assert.throws(() => verifyJourneys([{ ...row, ok: false }], summary), /NOT_SUCCESSFUL/);
  assert.throws(() => verifyJourneys([{ ...row, checks: 5 }], summary), /STEP_TOTAL/);
  assert.throws(() => verifyJourneys([row], { ...summary, checks: 500 }), /SUMMARY_MISMATCH/);
  assert.throws(() => verifyJourneys([{ ...row, type: 'full-show' }], summary), /STEP_MISSING/);
  assert.throws(() => verifyJourneys([row], { ...summary, forbidden: 1 }), /SUMMARY_MISMATCH/);
});

test('pilot evidence requires matching local reservations and distinguishes unresolved results', () => {
  const ledger = { schemaVersion: 1, campaignId: 'synthetic-campaign',
    authorizationStatus: 'LOCAL_OPERATOR_APPROVED', policyRevision: CAMPAIGN_POLICY.revision,
    totalCapUsd: CAMPAIGN_POLICY.totalCapUsd, capsUsd: CAMPAIGN_POLICY.capsUsd,
    reservations: [{ requestId: 'request-one', runId: 'run-one', provider: 'meta', amountMicros: 150000, status: 'RESERVED' }] };
  const row = { requestId: 'request-one', runId: 'run-one', provider: 'meta', httpStatus: 200,
    retries: 0, reservedMaximumUsd: 0.15, correct: true, scored: true, resolved: false };
  const pilot = { realProviderEvaluations: true, attemptedRequests: 1, completedRequests: 1, results: [row] };
  const result = verifyPilot(pilot, ledger);
  assert.equal(result.correct, 1);
  assert.equal(result.resolved, 0);
  assert.throws(() => verifyPilot(pilot, { ...ledger, reservations: [] }), /RESERVATION/);
  assert.throws(() => verifyPilot({ ...pilot, results: [{ ...row, retries: 1 }] }, ledger), /PROTOCOL/);
  assert.throws(() => verifyPilot({ ...pilot, results: [{ ...row, provider: 'baseten' }] }, ledger), /PROTOCOL/);
  assert.throws(() => verifyPilot({ ...pilot, completedRequests: 2 }, ledger), /COUNT/);
});
