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
const STATES = new Set([
  'SUBMISSION_UNKNOWN', 'QUEUED', 'RUNNING', 'READY_FOR_REVIEW',
  'ACCEPTED_FOR_MANUAL_IMPORT', 'REJECTED', 'CANCEL_REQUESTED',
  'CANCELLED', 'FAILED',
]);
const ALLOWED = {
  SUBMISSION_UNKNOWN: [],
  QUEUED: ['RUNNING','READY_FOR_REVIEW','CANCEL_REQUESTED','CANCELLED','FAILED'],
  RUNNING: ['RUNNING','READY_FOR_REVIEW','CANCEL_REQUESTED','CANCELLED','FAILED'],
  READY_FOR_REVIEW: ['ACCEPTED_FOR_MANUAL_IMPORT','REJECTED'],
  ACCEPTED_FOR_MANUAL_IMPORT: [],
  REJECTED: [],
  CANCEL_REQUESTED: ['CANCEL_REQUESTED','CANCELLED','READY_FOR_REVIEW','FAILED'],
  CANCELLED: [],
  FAILED: [],
};
const digest = id => createHash('sha256').update(id).digest('hex');
const fileName = id => 'job-' + digest(id) + '.json';
const hex = value => /^[a-f0-9]{64}$/.test(value ?? '');

function requireId(id) {
  if (typeof id !== 'string' || !ID.test(id)) throw new TypeError('Invalid SFX job ID');
  return id;
}
function publicView(entry) {
  if (!entry) return null;
  const { remoteJobId, authorizationHash, ...rest } = entry;
  return structuredClone(rest);
}
function internalEntry(entry) {
  if (!entry || entry.version !== 1 || !STATES.has(entry.status) ||
      !ID.test(entry.requestId) || !hex(entry.authorizationHash)) {
    throw new Error('Invalid persisted SFX journal');
  }
  return entry;
}

export function createSfxJobStore({
  directory,
  maxDailyStarts = 3,
  clock = () => new Date(),
} = {}) {
  if (typeof directory !== 'string' || !directory.trim() ||
      !Number.isSafeInteger(maxDailyStarts) || maxDailyStarts < 1 || maxDailyStarts > 25) {
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
      modelCandidate, seed } = request ?? {};
    requireId(requestId);
    requireId(authorizationId);
    if (confirm !== true || !/^L[1-9]\d*$/.test(sourceLineId ?? '') ||
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
      const names = await readdir(root);
      let startsToday = 0;
      let activeStarts = 0;
      for (const name of names) {
        if (!/^job-[a-f0-9]{64}\.json$/.test(name)) continue;
        const entry = internalEntry(JSON.parse(await readFile(join(root, name), 'utf8')));
        if (entry.authorizationHash === digest(authorizationId)) {
          const error = new Error('SFX authorization was already used');
          error.code = 'SFX_DUPLICATE';
          throw error;
        }
        if (entry.createdAt.slice(0, 10) === today) startsToday++;
        if (['SUBMISSION_UNKNOWN','QUEUED','RUNNING','CANCEL_REQUESTED'].includes(entry.status)) activeStarts++;
      }
      if (activeStarts > 0) {
        const error = new Error('An existing SFX job is unresolved');
        error.code = 'SFX_ACTIVE_LIMIT';
        throw error;
      }
      if (startsToday >= maxDailyStarts) {
        const error = new Error('SFX daily quota reached');
        error.code = 'SFX_DAILY_LIMIT';
        throw error;
      }
      const entry = {
        version: 1, requestId, authorizationHash: digest(authorizationId),
        sourceLineId, kind, modelCandidate, prompt: prompt.trim(),
        durationSeconds, seed, status: 'SUBMISSION_UNKNOWN',
        createdAt: now, updatedAt: now, remoteJobId: null, wav: null,
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
  async function update(id, nextStatus, { remoteJobId, wav } = {}) {
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
      const updated = { ...previous, status: nextStatus, updatedAt: clock().toISOString() };
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
  async function storeWav(id, bytes, claimed) {
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
  return Object.freeze({ reserve, update, read, publicView, storeWav, wavBytes });
}
