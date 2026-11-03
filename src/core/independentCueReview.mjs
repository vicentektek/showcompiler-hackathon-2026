/**
 * Independent, deterministic review hints for a completed Meta scene window.
 *
 * Inspired by the external verification pattern in Meta's agent workshop.
 * This is not a cue classifier and cannot prove that all cues were found:
 * it only flags explicit SOUND/FX/AUDIO/MUSIC-labelled directions that the
 * model returned no observation or proposal for.
 *
 * Input is the original immutable analysis scope and locally schema-validated
 * model items. No provider calls, raw script export or audio execution.
 */
const AUDIO_DIRECTION = /^(?:SFX|FX|SOUND|SONIDO|AUDIO|MUSIC|MÚSICA|MUSIQUE)\s*(?:[#-]?\s*\d{1,3})?\s*:\s*\S/iu;
const LINE_ID = /^L[1-9]\d*$/;
const MAX_REVIEW_FLAGS = 16;

function isExplicitAudioDirection(text) {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  // Parenthesised technical directions are common in theatrical scripts.
  const unwrapped = (/^\([\s\S]*\)$/u.test(trimmed) || /^\[[\s\S]*\]$/u.test(trimmed))
    ? trimmed.slice(1, -1).trim() : trimmed;
  return AUDIO_DIRECTION.test(unwrapped);
}

/**
 * Return only line IDs for operator review, never claim a missed cue.
 * An observation (STOP/CONTINUE/SILENCE) also satisfies the check: not every
 * direction requires a new PLAY event.
 */
export function reviewExplicitAudioDirections(scope, validatedItems) {
  if (!scope || !Array.isArray(scope.windows) || !Array.isArray(validatedItems) ||
      scope.windows.length > 2 || validatedItems.length > 8) {
    throw new TypeError('Invalid independent cue review inputs');
  }
  const addressed = new Set();
  for (const item of validatedItems) {
    if (!item || typeof item.sourceLineId !== 'string' || !LINE_ID.test(item.sourceLineId)) {
      throw new TypeError('Unvalidated cue item in independent review');
    }
    addressed.add(item.sourceLineId);
  }
  const reviewFlags = [];
  const knownLines = new Set();
  let totalUnreviewed = 0;
  for (const window of scope.windows) {
    if (!window || !Array.isArray(window.coreLines) || window.coreLines.length > 120) {
      throw new TypeError('Invalid independent review scope');
    }
    for (const line of window.coreLines) {
      if (!line || typeof line.id !== 'string' || !LINE_ID.test(line.id) ||
          typeof line.text !== 'string' || knownLines.has(line.id)) {
        throw new TypeError('Invalid independent review line');
      }
      knownLines.add(line.id);
      if (isExplicitAudioDirection(line.text) && !addressed.has(line.id)) {
        totalUnreviewed += 1;
        if (reviewFlags.length < MAX_REVIEW_FLAGS) reviewFlags.push(line.id);
      }
    }
  }
  if ([...addressed].some(id => !knownLines.has(id))) {
    throw new TypeError('Cue review item outside analyzed core');
  }
  return { reviewFlags, totalUnreviewed };
}
