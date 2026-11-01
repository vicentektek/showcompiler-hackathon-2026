import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCampaign, createOrLoadCampaign, campaignDir, acquireLock, redact, sanitizedEnv, planLive,
  compareCampaigns, SUITES, MAX_LIVE_REQUESTS_PER_INVOCATION } from '../tools/runq-campaign.mjs';

async function fakeRoot() {
  const root = await mkdtemp(join(tmpdir(), 'runq-campaign-'));
  await mkdir(join(root, 'tools'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { 'check:syntax': 'node --check tools/ok.mjs' } }));
  await writeFile(join(root, 'tools', 'ok.mjs'), "console.log('# tests 4\\n# pass 4\\n# fail 0');\n");
  await writeFile(join(root, 'tools', 'bad.mjs'), "console.log('# tests 2\\n# fail 1'); process.exitCode = 1;\n");
  await writeFile(join(root, 'tools', 'counter.mjs'),
    "import {appendFileSync} from 'node:fs'; appendFileSync(process.argv[2], 'x'); console.log('# tests 1\\n# fail 0');\n");
  await writeFile(join(root, 'tools', 'leak.mjs'), "console.log('token ' + (process.env.MODEL_API_KEY ?? 'absent') + ' # tests 1');\n");
  return root;
}
const parseUnit = out => ({ unique: Number(/# tests (\d+)/.exec(out)?.[1] ?? 0), checks: Number(/# tests (\d+)/.exec(out)?.[1] ?? 0),
  failures: Number(/# fail (\d+)/.exec(out)?.[1] ?? 0) });
const git = sha => () => ({ sha, branch: 'test', dirtyEntries: 0 });
const quiet = () => {};
const noLedger = { includeLedger: false };

test('runner checkpoints each suite and resume skips completed suites', async () => {
  const root = await fakeRoot();
  try {
    const counter = join(root, 'count.txt');
    const suites = [
      { id: 'syntax', kind: 'offline', evidence: 'LOCAL', syntax: true },
      { id: 'ok', kind: 'offline', evidence: 'LOCAL', args: ['tools/ok.mjs'], parse: parseUnit },
      { id: 'counted', kind: 'offline', evidence: 'LOCAL', args: ['tools/counter.mjs', counter], parse: parseUnit },
      { id: 'missing', kind: 'offline', evidence: 'LOCAL', args: ['tools/nope.mjs'] },
      { id: 'web', kind: 'browser', evidence: 'BROWSER', args: ['tools/ok.mjs'], parse: parseUnit },
    ];
    const first = await runCampaign({ id: 'c1', root, suites, git: git('aaa'), log: quiet, reportOptions: noLedger });
    assert.equal(first.state.suites.syntax.status, 'PASS');
    assert.equal(first.state.suites.ok.status, 'PASS');
    assert.equal(first.state.suites.ok.metrics.checks, 4);
    assert.equal(first.state.suites.missing.status, 'NOT_AVAILABLE');
    assert.equal(first.state.suites.web.status, 'PENDING', 'offline command does not run browser suites');
    await runCampaign({ id: 'c1', kind: 'all', root, suites, git: git('aaa'), log: quiet, reportOptions: noLedger });
    assert.equal(await readFile(counter, 'utf8'), 'x', 'completed suite is not executed again on resume');
    const state = JSON.parse(await readFile(join(campaignDir('c1', root), 'resume-state.json'), 'utf8'));
    assert.equal(state.suites.web.status, 'PASS');
    const summary = JSON.parse(await readFile(join(campaignDir('c1', root), 'summary.json'), 'utf8'));
    assert.equal(summary.totals.pass, 4);
    assert.equal(summary.nextResume, null);
    for (const file of ['run-manifest.json', 'summary.md', 'module-matrix.csv', 'defect-backlog.md', 'cost-ledger-status.json'])
      await readFile(join(campaignDir('c1', root), file));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a suite left RUNNING by a crash is marked INTERRUPTED and rerun; failures are kept unless retried', async () => {
  const root = await fakeRoot();
  try {
    const suites = [
      { id: 'ok', kind: 'offline', evidence: 'LOCAL', args: ['tools/ok.mjs'], parse: parseUnit },
      { id: 'bad', kind: 'offline', evidence: 'LOCAL', args: ['tools/bad.mjs'], parse: parseUnit },
    ];
    const c = await createOrLoadCampaign({ id: 'c2', root, suites, git: git('bbb') });
    c.state.suites.ok = { status: 'RUNNING', attempts: 1 };
    await writeFile(c.stateFile, JSON.stringify(c.state));
    const r = await runCampaign({ id: 'c2', root, suites, git: git('bbb'), log: quiet, reportOptions: noLedger });
    assert.equal(r.state.suites.ok.status, 'PASS');
    assert.equal(r.state.suites.ok.attempts, 2);
    assert.equal(r.state.suites.bad.status, 'FAIL');
    const again = await runCampaign({ id: 'c2', root, suites, git: git('bbb'), log: quiet, reportOptions: noLedger });
    assert.equal(again.state.suites.bad.attempts, 1, 'FAIL is final unless --retry-failed');
    const retried = await runCampaign({ id: 'c2', root, suites, git: git('bbb'), retryFailed: true, log: quiet, reportOptions: noLedger });
    assert.equal(retried.state.suites.bad.attempts, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('resuming on a different commit is refused instead of mixing evidence', async () => {
  const root = await fakeRoot();
  try {
    const suites = [{ id: 'ok', kind: 'offline', evidence: 'LOCAL', args: ['tools/ok.mjs'], parse: parseUnit }];
    await createOrLoadCampaign({ id: 'c3', root, suites, git: git('aaa') });
    await assert.rejects(runCampaign({ id: 'c3', root, suites, git: git('ccc'), log: quiet, reportOptions: noLedger }), /SHA_CHANGED/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a live lock blocks a concurrent run and a stale lock is reclaimed', async () => {
  const root = await fakeRoot();
  try {
    const dir = campaignDir('c4', root);
    await mkdir(dir, { recursive: true });
    const release = await acquireLock(dir);
    await writeFile(join(dir, 'campaign.lock'), JSON.stringify({ pid: process.ppid }));
    await assert.rejects(acquireLock(dir), /CAMPAIGN_LOCKED/);
    await writeFile(join(dir, 'campaign.lock'), JSON.stringify({ pid: 2 ** 22 + 12345 }));
    const again = await acquireLock(dir);
    await again(); await release();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('child environment has no provider credentials and logs are redacted', async () => {
  const parent = { MODEL_API_KEY: 'meta-secret-value-123', BASETEN_API_KEY: 'b-secret-456', MODAL_PROXY_TOKEN_SECRET: 'modal-secret-789', PATH: 'x' };
  const env = sanitizedEnv(parent);
  for (const key of ['MODEL_API_KEY', 'BASETEN_API_KEY', 'MODAL_PROXY_TOKEN_SECRET']) assert.equal(env[key], undefined);
  assert.equal(env.PATH, 'x');
  assert.equal(env.RUNQ_OFFLINE_TESTS, '1');
  const text = redact('leaked meta-secret-value-123 and Bearer abcdefghijklmnop', parent);
  assert.doesNotMatch(text, /meta-secret-value-123|abcdefghijklmnop/);
  const root = await fakeRoot();
  const previous = process.env.MODEL_API_KEY;
  try {
    process.env.MODEL_API_KEY = 'meta-secret-value-123';
    const suites = [{ id: 'leak', kind: 'offline', evidence: 'LOCAL', args: ['tools/leak.mjs'], parse: parseUnit }];
    await runCampaign({ id: 'c5', root, suites, git: git('aaa'), log: quiet, reportOptions: noLedger });
    const log = await readFile(join(campaignDir('c5', root), 'logs', 'leak.log'), 'utf8');
    assert.match(log, /token absent/);
  } finally {
    if (previous === undefined) delete process.env.MODEL_API_KEY; else process.env.MODEL_API_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('live mode refuses Baseten, Fireworks and unknown providers before touching the ledger', async () => {
  let ledgerReads = 0;
  const ledger = async () => { ledgerReads += 1; return { available: true, remainingUsd: 40, perProvider: { meta: { requestsRemaining: 25, remainingUsd: 12 } } }; };
  for (const provider of ['baseten', 'fireworks', 'voice', 'openai', undefined]) {
    const r = await planLive({ provider, maxRequests: 1, live: true, ackPaid: true, ledger });
    assert.equal(r.status, 'REFUSED'); assert.equal(r.code, 'CAMPAIGN_PROVIDER_PROHIBITED'); assert.equal(r.exitCode, 2);
  }
  assert.equal(ledgerReads, 0);
  const tooMany = await planLive({ provider: 'meta', maxRequests: MAX_LIVE_REQUESTS_PER_INVOCATION + 1, live: true, ackPaid: true, ledger });
  assert.equal(tooMany.code, 'MAX_REQUESTS_OUT_OF_RANGE');
});

test('live mode is a dry run without explicit flags and blocks without ledger headroom', async () => {
  const ok = async () => ({ available: true, remainingUsd: 40, perProvider: { meta: { requestsRemaining: 25, remainingUsd: 12 }, modal: { requestsRemaining: 72, remainingUsd: 33 } } });
  const dry = await planLive({ provider: 'meta', maxRequests: 2, ledger: ok });
  assert.equal(dry.status, 'DRY_RUN');
  assert.equal(dry.retries, 0);
  assert.match(dry.command, /--providers meta/);
  assert.doesNotMatch(dry.command, /baseten|fireworks/i);
  const onlyLive = await planLive({ provider: 'meta', maxRequests: 2, live: true, ledger: ok });
  assert.equal(onlyLive.status, 'DRY_RUN', '--live without --ack-paid never runs');
  const exhausted = async () => ({ available: true, remainingUsd: 40, perProvider: { meta: { requestsRemaining: 1, remainingUsd: 12 } } });
  assert.equal((await planLive({ provider: 'meta', maxRequests: 2, live: true, ackPaid: true, ledger: exhausted })).code, 'INSUFFICIENT_LEDGER_HEADROOM');
  const missing = async () => ({ available: false, reason: 'LEDGER_NOT_FOUND_ON_THIS_MACHINE' });
  assert.equal((await planLive({ provider: 'modal', maxRequests: 1, live: true, ackPaid: true, ledger: missing })).code, 'LEDGER_UNAVAILABLE');
});

test('compare flags a suite that regressed from baseline', async () => {
  const root = await fakeRoot();
  try {
    const okSuite = { id: 'unit', kind: 'offline', evidence: 'LOCAL', args: ['tools/ok.mjs'], parse: parseUnit };
    const badSuite = { ...okSuite, args: ['tools/bad.mjs'] };
    await runCampaign({ id: 'base', root, suites: [okSuite], git: git('aaa'), log: quiet, reportOptions: noLedger });
    await runCampaign({ id: 'cand', root, suites: [badSuite], git: git('bbb'), log: quiet, reportOptions: noLedger });
    const r = await compareCampaigns({ base: 'base', candidate: 'cand', root, suites: [okSuite] });
    assert.deepEqual(r.regressions, ['unit']);
    assert.match(await readFile(r.file, 'utf8'), /REGRESSIONS: unit/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('real suite catalogue only uses existing offline-safe runners', () => {
  const ids = SUITES.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const suite of SUITES) {
    const args = suite.syntax ? [] : (typeof suite.args === 'function' ? suite.args('<dir>') : suite.args);
    assert.doesNotMatch(args.join(' '), /--live|--ack-paid|baseten|fireworks/i, suite.id);
  }
});
