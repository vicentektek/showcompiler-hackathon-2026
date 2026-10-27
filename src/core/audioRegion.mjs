/**
 * Pure, non-destructive audio region model for the future RunQ waveform editor.
 * Never edits PCM, project JSON, transport state or an AudioBuffer.
 *
 * This is an isolated design-stage contract. Schema v1 does NOT persist endMs
 * or loopRange; no UI may claim these edits affect GO until engine, persistence
 * and round-trip tests have been added in a later work package.
 */

const FIELDS = new Set(['startMs', 'endMs', 'fadeInMs', 'fadeOutMs', 'loopRange']);

function integerMs(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(label + ' must be a non-negative integer number of milliseconds');
  }
  return value;
}

export function normalizeAudioRegion(input = {}, { durationMs } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !FIELDS.has(key))) {
    throw new TypeError('Invalid audio region fields');
  }
  integerMs(durationMs, 'durationMs');
  if (durationMs < 1) throw new RangeError('A source must have a positive duration');

  const startMs = integerMs(input.startMs ?? 0, 'startMs');
  const endMs = integerMs(input.endMs ?? durationMs, 'endMs');
  const fadeInMs = integerMs(input.fadeInMs ?? 0, 'fadeInMs');
  const fadeOutMs = integerMs(input.fadeOutMs ?? 0, 'fadeOutMs');

  if (startMs >= endMs || endMs > durationMs) {
    throw new RangeError('Region must be contained in its source and have positive length');
  }
  if (fadeInMs + fadeOutMs > endMs - startMs) {
    throw new RangeError('Combined fades cannot exceed region length');
  }

  let loopRange = null;
  if (input.loopRange != null) {
    const value = input.loopRange;
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).some(key => key !== 'startMs' && key !== 'endMs')) {
      throw new TypeError('Invalid loop range fields');
    }
    const loopStartMs = integerMs(value.startMs, 'loop startMs');
    const loopEndMs = integerMs(value.endMs, 'loop endMs');
    if (loopStartMs < startMs || loopStartMs >= loopEndMs || loopEndMs > endMs) {
      throw new RangeError('Loop range must lie within the selected region');
    }
    loopRange = Object.freeze({ startMs: loopStartMs, endMs: loopEndMs });
  }

  return Object.freeze({ startMs, endMs, fadeInMs, fadeOutMs, loopRange });
}

/**
 * Move a single trim boundary. Clamp to legal bounds and avoid crossing fades
 * or a currently defined loop; do not silently delete either. Returns a new
 * frozen region, without changing source samples or any running sound.
 */
export function moveAudioRegionEdge(region, edge, requestedMs, { durationMs } = {}) {
  const current = normalizeAudioRegion(region, { durationMs });
  integerMs(requestedMs, 'requestedMs');
  if (edge !== 'start' && edge !== 'end') throw new TypeError('Unknown region edge');
  const minLength = Math.max(1, current.fadeInMs + current.fadeOutMs);

  if (edge === 'start') {
    const upper = Math.min(current.endMs - minLength,
      current.loopRange?.startMs ?? current.endMs - minLength);
    return normalizeAudioRegion({
      ...current, startMs: Math.max(0, Math.min(upper, requestedMs)),
    }, { durationMs });
  }
  const lower = Math.max(current.startMs + minLength,
    current.loopRange?.endMs ?? current.startMs + minLength);
  return normalizeAudioRegion({
    ...current, endMs: Math.min(durationMs, Math.max(lower, requestedMs)),
  }, { durationMs });
}

export function regionToSourceSlice(region, { durationMs } = {}) {
  const normalized = normalizeAudioRegion(region, { durationMs });
  return Object.freeze({
    offsetSeconds: normalized.startMs / 1000,
    durationSeconds: (normalized.endMs - normalized.startMs) / 1000,
  });
}
