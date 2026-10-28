/**
 * Browser-safe handoff after an operator has ACCEPTED a generated sample.
 * No mutation: caller must explicitly import the File into the project and
 * choose the destination cue. Never calls GO, STOP or browser audio.
 */
const HEX = /^[a-f0-9]{64}$/;
const LINE = /^L[1-9]\d*$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

export async function prepareReviewedSfxImport({
  job, audioBytes, FileConstructor = globalThis.File,
  cryptoSubtle = globalThis.crypto?.subtle,
} = {}) {
  if (!job || job.status !== 'ACCEPTED_FOR_MANUAL_IMPORT' ||
      !ID.test(job.requestId ?? '') || !LINE.test(job.sourceLineId ?? '') ||
      !['SFX','ENVIRONMENT'].includes(job.kind) ||
      !job.wav || !HEX.test(job.wav.sha256 ?? '') ||
      !(audioBytes instanceof Uint8Array) || audioBytes.byteLength < 44 ||
      audioBytes.byteLength > 4 * 1024 * 1024 ||
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
  // Clone bytes rather than leaving a reference to a mutable network buffer.
  const file = new FileConstructor(
    [audioBytes.slice()], 'runq-sfx-' + job.requestId + '.wav',
    { type: 'audio/wav' },
  );
  return Object.freeze({
    file, sourceLineId: job.sourceLineId, kind: job.kind,
    sha256, requestId: job.requestId,
    manualImportRequired: true,
    targetCueId: null,
  });
}
