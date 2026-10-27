/** Operator-authored fade duration for a specific named cue stopped on GO. */
export function normalizeStopFadeOverrides(value = {}, targets = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid target stop fades');
  const allowed = new Set(targets);
  const output = {};
  for (const [id, ms] of Object.entries(value)) {
    if (!allowed.has(id) || !Number.isSafeInteger(ms) || ms < 0 || ms > 10000) {
      throw new TypeError('Invalid target stop fade: ' + id);
    }
    output[id] = ms;
  }
  return output;
}
