import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mulberry32, syntheticScript, runStateMachineCampaign } from '../tools/runq-state-machine-campaign.mjs';

test('seeded generator and synthetic scripts are deterministic', () => {
  const a = mulberry32(42), b = mulberry32(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.deepEqual(syntheticScript(mulberry32(7)), syntheticScript(mulberry32(7)));
});

test('offline state-machine campaign holds every invariant and is reproducible', async () => {
  const options = { seed: 20261101, scenarios: 6, steps: 18, transportActions: 18 };
  const first = await runStateMachineCampaign(options);
  const second = await runStateMachineCampaign(options);
  assert.equal(first.providerRequests, 0);
  assert.equal(first.totals.failures, 0, JSON.stringify(first.failureKinds));
  assert.equal(first.totals.validRejected, 0, JSON.stringify(first.findingKinds));
  assert.equal(first.totals.invalidAccepted, 0);
  assert.equal(first.totals.steps, 6 * 18);
  assert.ok(first.totals.checks > first.totals.steps * 5);
  assert.equal(first.digest, second.digest);
});

test('a fresh run to the same directory replaces previous case rows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'runq-sm-'));
  try {
    const options = { seed: 99, scenarios: 2, steps: 5, transportActions: 5, outputDir: dir };
    await runStateMachineCampaign(options);
    await runStateMachineCampaign(options);
    const rows = (await readFile(join(dir, 'cases.jsonl'), 'utf8')).trim().split('\n');
    assert.equal(rows.length, 2);
    const summary = JSON.parse(await readFile(join(dir, 'summary.json'), 'utf8'));
    assert.equal(summary.kind, 'RUNQ_STATE_MACHINE_CAMPAIGN');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
