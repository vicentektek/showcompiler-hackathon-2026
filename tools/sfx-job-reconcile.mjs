#!/usr/bin/env node
/**
 * Audited local reconciliation for one SFX journal record stuck in a
 * local-only state (CANCEL_REQUESTED). The provider is NEVER contacted by
 * this tool: evidence must be gathered out-of-band with plain read-only
 * `modal app logs / modal app list` commands and saved as an evidence file,
 * which is hashed into the audit trail. No HTTP status (including 409) is
 * interpreted as a cancellation here; only verified evidence transitions
 * CANCEL_REQUESTED -> CANCELLED exactly once, never deleting history.
 */
import { createHash } from 'node:crypto';
import { readFile, stat, appendFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createSfxJobStore } from '../src/core/sfxJobStore.mjs';
import { defaultSfxStoreDirectory } from './sfxRoutes.mjs';

const USAGE = 'node tools/sfx-job-reconcile.mjs --request-id <id> --evidence-file <log> ' +
  '--verified-at <ISO-Z> --verified-by <operator iv> [--store-dir <dir>] [--note <text>] [--execute]';
const HEX64 = /^[a-f0-9]{64}$/;
const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

function fail(message, exitCode) {
  console.error(message);
  process.exitCode = exitCode ?? 2;
  return undefined;
}

async function gatherArguments() {
  const arguments_ = { storeDir: defaultSfxStoreDirectory() };
  const named = ['--request-id', '--evidence-file', '--verified-at', '--verified-by', '--store-dir', '--note'];
  for (let index = 2; index < process.argv.length; index++) {
    const token = process.argv[index];
    if (token === '--execute' && arguments_.execute === undefined) { arguments_.execute = true; continue; }
    if (!named.includes(token)) return fail(USAGE);
    const value = process.argv[index + 1];
    if (typeof value !== 'string' || value.startsWith('--')) return fail(USAGE);
    if (arguments_[token] !== undefined) return fail(USAGE);
    arguments_[token] = value;
    index++;
  }
  if (!arguments_['--request-id'] || !arguments_['--evidence-file'] ||
      !arguments_['--verified-at'] || !arguments_['--verified-by'] &&
      arguments_.execute) {
    return fail(USAGE);
  }
  if ('--verified-at' in arguments_ &&
      (!ISO_Z.test(arguments_['--verified-at']) || Number.isNaN(Date.parse(arguments_['--verified-at'])))) {
    return fail('verified-at must be an ISO-8601 UTC timestamp, e.g. 2026-10-28T12:42:26Z');
  }
  arguments_.requestId = arguments_['--request-id'];
  return arguments_;
}

async function main() {
  const args = await gatherArguments();
  if (args === undefined) return;
  const directory = resolve(args['--store-dir'] ?? args.storeDir);
  const store = createSfxJobStore({ directory });
  const entry = await store.read(args.requestId);
  if (!entry) return fail(`Record ${args.requestId} was not found in ${directory}; nothing was changed.`, 2);
  if (entry.status !== 'CANCEL_REQUESTED') {
    return fail(`Record ${args.requestId} is ${entry.status}; reconciliation targets CANCEL_REQUESTED only. Nothing was changed.`, 2);
  }
  if (!entry.remoteJobId) {
    return fail(`Record ${args.requestId} has no remote job ID; use the dedicated SUBMISSION_UNKNOWN procedure instead.`, 2);
  }
  const evidencePath = resolve(args['--evidence-file']);
  let evidenceBytes;
  try {
    evidenceBytes = await readFile(evidencePath);
  } catch {
    return fail(`Evidence file is unreadable: ${evidencePath}`, 2);
  }
  const evidenceStat = await stat(evidencePath);
  if (evidenceStat.size === 0) return fail('Evidence file is empty; refusing to reconcile without evidence.', 2);
  const evidenceSha256 = createHash('sha256').update(evidenceBytes).digest('hex');
  if (!HEX64.test(evidenceSha256)) return fail('Evidence hashing failed.', 3);

  const evidence = {
    remoteJobId: entry.remoteJobId,
    terminalStatus: 'CANCELLED',
    verifiedAt: args['--verified-at'],
    verifiedVia: 'read-only Modal CLI evidence (modal app logs / modal app list) saved by the operator',
    verifiedBy: args['--verified-by'],
    evidenceSha256,
    evidenceNote: args['--note'] || null,
  };

  const preview = JSON.stringify({
    requestId: args.requestId,
    fromStatus: entry.status,
    after: 'CANCELLED',
    evidence,
    evidenceFile: evidencePath,
    evidenceBytes: evidenceStat.size,
  }, null, 2);

  if (!args.execute) {
    console.log('DRY RUN — no journal file was modified. Planned change:');
    console.log(preview);
    console.log('Re-run with --execute --verified-by ... to apply this audited transition.');
    return;
  }

  const updated = await store.reconcileCancelled(args.requestId, evidence);
  const auditDir = join(directory, 'audit');
  await mkdir(auditDir, { recursive: true });
  const auditRecord = JSON.stringify({
    at: updated.updatedAt,
    action: 'RECONCILE_CANCELLED',
    requestId: args.requestId,
    verifiedBy: args['--verified-by'],
    verifiedAt: evidence.verifiedAt,
    evidenceFile: evidencePath,
    evidenceSha256,
    fromStatus: entry.status,
    toStatus: updated.status,
  }) + '\n';
  await appendFile(join(auditDir, 'journal-audit.jsonl'), auditRecord);
  console.log(preview);
  console.log(`applied; audit appended to ${join(auditDir, 'journal-audit.jsonl')}`);
}

try {
  await main();
} catch (error) {
  if (error instanceof Error) console.error(error.message);
  if (error instanceof Error && error.code === 'SFX_JOURNAL_LOCKED') process.exitCode = 4;
  else process.exitCode = 3;
}
