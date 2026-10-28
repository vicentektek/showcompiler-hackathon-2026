import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { File } from 'node:buffer';
import { prepareReviewedSfxImport } from '../src/core/sfxImportCandidate.mjs';

const bytes = new Uint8Array(44).fill(1);
const checksum = Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
const settings = {
  FileConstructor: File, cryptoSubtle: webcrypto.subtle,
};
const job = {
  requestId: 'request-1', sourceLineId: 'L15', kind: 'SFX',
  status: 'ACCEPTED_FOR_MANUAL_IMPORT',
  durationSeconds: 3, seed: 42, prompt: 'distant thunder roll',
  modelCandidate: 'stabilityai/stable-audio-3-small-sfx',
  modelRevision: 'a'.repeat(40),
  createdAt: '2026-10-28T10:00:00Z', updatedAt: '2026-10-28T10:05:00Z',
  cost: { estimatedMaxCostUsd: 0.02, actualBilledUsd: null },
  wav: {
    sha256: checksum, durationSeconds: 3, sampleRateHz: 44100,
    channels: 2, byteLength: 44,
  },
};
test('operator accepted SHA-256 audio becomes importable File, not a cue or GO', async () => {
  const staged = await prepareReviewedSfxImport({
    job, audioBytes: bytes, ...settings,
    reviewedRegion: { inSeconds: 0, outSeconds: 3 },
  });
  assert.equal(staged.manualImportRequired, true);
  assert.equal(staged.targetCueId, null);
  assert.equal(staged.sourceLineId, 'L15');
  assert.equal(staged.file.name, 'runq-sfx-request-1.wav');
  assert.equal(staged.file.type, 'audio/wav');
  assert.deepEqual(new Uint8Array(await staged.file.arrayBuffer()), bytes);
  assert.equal(Object.hasOwn(staged, 'assetId'), false);
  assert.equal(Object.hasOwn(staged, 'go'), false);
});
test('review and checksum gates: rejects queued, rejected, altered, unknown-line files', async () => {
  const region = { inSeconds: 0, outSeconds: 3 };
  for (const denied of [
    { ...job, status: 'QUEUED' }, { ...job, status: 'REJECTED' },
    { ...job, sourceLineId: 'L999/../' }, { ...job, wav: { ...job.wav, sha256: '0'.repeat(64) } },
  ]) {
    await assert.rejects(
      prepareReviewedSfxImport({ job: denied, audioBytes: bytes, ...settings, reviewedRegion: region }),
    );
  }
  const altered = new Uint8Array(bytes);
  altered[10] = 99;
  await assert.rejects(
    prepareReviewedSfxImport({ job, audioBytes: altered, ...settings, reviewedRegion: region }),
    /checksum mismatch/,
  );
});
