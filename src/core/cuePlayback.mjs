/**
 * Operator-authored playback properties, never supplied by a model proposal.
 * These are conservative Web Audio controls, not an ASIO or timecode system.
 * Legacy schema-v1 cues without playback keep the existing -6 dB output.
 */
export const DEFAULT_CUE_PLAYBACK = Object.freeze({
  gainDb: 0, fadeInMs: 0, fadeOutMs: 0, startDelayMs: 0,
  loop: false, repeatCount: 1,
});

function fail(field) { throw new TypeError('Invalid cue playback: ' + field); }

/** Normalize to a detached, strict, serializable object. */
export function normalizeCuePlayback(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('object required');
  const allowed = Object.keys(DEFAULT_CUE_PLAYBACK);
  if (Object.keys(input).some(key => !allowed.includes(key))) fail('unknown field');
  const value = { ...DEFAULT_CUE_PLAYBACK, ...input };
  if (typeof value.gainDb !== 'number' || !Number.isFinite(value.gainDb) ||
      value.gainDb < -60 || value.gainDb > 0) fail('gainDb must be -60 to 0');
  for (const key of ['fadeInMs','fadeOutMs','startDelayMs']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > 10000) {
      fail(key + ' must be an integer 0 to 10000 ms');
    }
  }
  if (typeof value.loop !== 'boolean') fail('loop must be boolean');
  if (!Number.isSafeInteger(value.repeatCount) ||
      value.repeatCount < 1 || value.repeatCount > 20) fail('repeatCount must be 1–20');
  if (value.loop && value.repeatCount !== 1) fail('loop and finite repetitions are mutually exclusive');
  if (value.loop && value.fadeOutMs > 0) fail('looping playback has no automatic end for fade-out');
  return Object.freeze(value);
}
