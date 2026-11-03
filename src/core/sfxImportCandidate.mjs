/**
 * Browser-safe handoff after an operator has ACCEPTED a generated sample.
 * No mutation: caller must explicitly import the File into the project and
 * choose the destination cue. Never calls GO, STOP or browser audio.
 */
const HEX = /^[a-f0-9]{64}$/;
const LINE = /^L[1-9]\d*$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

export async function prepareReviewedSfxImport({
  job, audioBytes, reviewedRegion, FileConstructor = globalThis.File,
  cryptoSubtle = globalThis.crypto?.subtle,
} = {}) {
  if (!job || job.status !== 'ACCEPTED_FOR_MANUAL_IMPORT' ||
      !ID.test(job.requestId ?? '') ||
      !(job.sourceLineId === null || LINE.test(job.sourceLineId ?? '')) ||
      !['SFX','ENVIRONMENT'].includes(job.kind) ||
      !job.wav || !HEX.test(job.wav.sha256 ?? '') ||
      !Number.isInteger(job.durationSeconds) || job.durationSeconds < 1 || job.durationSeconds > 12 ||
      !Number.isSafeInteger(job.seed) || job.seed < 0 || job.seed > 2147483647 ||
      job.modelCandidate !== 'stabilityai/stable-audio-3-small-sfx' ||
      !/^[a-f0-9]{40}$/.test(job.modelRevision ?? '') ||
      typeof job.prompt !== 'string' || !job.prompt.trim() || job.prompt.length > 1000 ||
      !Number.isFinite(job.wav.durationSeconds) || job.wav.durationSeconds <= 0 ||
      job.wav.durationSeconds > 13 || !Number.isSafeInteger(job.wav.sampleRateHz) ||
      ![1,2].includes(job.wav.channels) || !Number.isSafeInteger(job.wav.byteLength) ||
      !job.cost || !(Number.isFinite(job.cost.estimatedMaxCostUsd) ||
        (job.cost.budgetLimitsDisabled === true && job.cost.estimatedMaxCostUsd === null)) ||
      job.cost.estimatedMaxCostUsd < 0 || job.cost.actualBilledUsd !== null ||
      typeof job.createdAt !== 'string' || typeof job.updatedAt !== 'string' ||
      !reviewedRegion || !Number.isFinite(reviewedRegion.inSeconds) ||
      !Number.isFinite(reviewedRegion.outSeconds) ||
      !(audioBytes instanceof Uint8Array) || audioBytes.byteLength < 44 ||
      audioBytes.byteLength > 4 * 1024 * 1024 ||
      audioBytes.byteLength !== job.wav.byteLength ||
      typeof FileConstructor !== 'function' ||
      !cryptoSubtle || typeof cryptoSubtle.digest !== 'function') {
    throw new TypeError('Generated audio must be locally reviewed and verified');
  }
  // Hash the complete bytes; never trust only provider headers, filename or
  // display-level approval state.
  const hash = new Uint8Array(await cryptoSubtle.digest('SHA-256', audioBytes));
  const sha256 = Array.from(hash, byte => byte.toString(16).padStart(2,'0')).join('');
  if (sha256 !== job.wav.sha256) {
    throw new TypeError('Accepted sample checksum mismatch');
  }
  const inMs = Math.max(0, Math.round(reviewedRegion.inSeconds * 1000));
  const outMs = Math.min(
    Math.round(job.wav.durationSeconds * 1000),
    Math.round(reviewedRegion.outSeconds * 1000),
  );
  if (outMs <= inMs || inMs > Math.round(job.wav.durationSeconds * 1000)) {
    throw new TypeError('Reviewed region must be inside the accepted source');
  }
  // Clone bytes rather than leaving a reference to a mutable network buffer.
  const file = new FileConstructor(
    [audioBytes.slice()], 'runq-sfx-' + job.requestId + '.wav',
    { type: 'audio/wav' },
  );
  return Object.freeze({
    file, sourceLineId: job.sourceLineId, kind: job.kind,
    sha256, requestId: job.requestId,
    provenance: Object.freeze({
      origin: 'AI_GENERATED_SFX', provider: 'MODAL',
      model: job.modelCandidate, modelRevision: job.modelRevision,
      requestId: job.requestId, sourceLineId: job.sourceLineId,
      prompt: job.prompt.trim(), seed: job.seed,
      requestedDurationSeconds: job.durationSeconds,
      sha256, generatedDurationSeconds: job.wav.durationSeconds,
      sampleRateHz: job.wav.sampleRateHz, channels: job.wav.channels,
      byteLength: job.wav.byteLength,
      reviewedRegion: Object.freeze({ inMs, outMs }),
      estimatedMaxCostUsd: job.cost.estimatedMaxCostUsd,
      actualCostUsd: null,
      createdAt: job.createdAt, acceptedAt: job.updatedAt,
    }),
    manualImportRequired: true,
    targetCueId: null,
  });
}
