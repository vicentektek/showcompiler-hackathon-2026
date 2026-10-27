/**
 * Manual cue sequencing only. UI runtime state; never serialized or sent to AI.
 * Preparing a cue is not GO; completing/skipping only changes operator position.
 */
export function newOperatorQueue() {
  return { preparedCueId: null, completedCueIds: [], skippedCueIds: [] };
}
function cueIndex(cues, cueId) {
  if (!Array.isArray(cues)) throw new TypeError('Invalid cue sequence');
  const index = cues.findIndex(cue => cue?.id === cueId);
  if (index < 0) throw new RangeError('Unknown cue');
  return index;
}
function nextId(cues, index) {
  return cues[index + 1]?.id ?? null;
}
function addOnce(values, cueId) {
  return values.includes(cueId) ? [...values] : [...values, cueId];
}
export function prepareOperatorCue(state, cues, cueId) {
  cueIndex(cues, cueId);
  return { ...state, preparedCueId: cueId };
}
export function completePreparedCue(state, cues, cueId) {
  const index = cueIndex(cues, cueId);
  if (state.preparedCueId !== cueId) throw new Error('Cue is not prepared');
  return {
    preparedCueId: nextId(cues, index),
    completedCueIds: addOnce(state.completedCueIds, cueId),
    skippedCueIds: state.skippedCueIds.filter(id => id !== cueId),
  };
}
export function skipPreparedCue(state, cues) {
  if (!state.preparedCueId) throw new Error('No prepared cue');
  const index = cueIndex(cues, state.preparedCueId);
  const cueId = state.preparedCueId;
  return {
    preparedCueId: nextId(cues, index),
    completedCueIds: state.completedCueIds.filter(id => id !== cueId),
    skippedCueIds: addOnce(state.skippedCueIds, cueId),
  };
}
export function isCuePrepared(state, cueId) {
  return state.preparedCueId === cueId;
}

/**
 * A newly opened show is positioned at its first cue without starting audio.
 * Null is reserved for an empty show or a completed sequence, never required
 * as a manual initial setup for a non-empty show.
 */
export function startOperatorQueue(cues) {
  if (!Array.isArray(cues)) throw new TypeError('Invalid cue sequence');
  const initial = newOperatorQueue();
  return cues.length ? prepareOperatorCue(initial, cues, cues[0].id) : initial;
}

/** Navigate backward without performing a GO or overwriting playback state.
 * From the finished state, Back goes to the final cue.
 */
export function previousOperatorCue(state, cues) {
  if (!Array.isArray(cues)) throw new TypeError('Invalid cue sequence');
  if (!cues.length) return state;
  const index = state.preparedCueId === null
    ? cues.length : cueIndex(cues, state.preparedCueId);
  if (index <= 0) return state;
  return prepareOperatorCue(state, cues, cues[index - 1].id);
}


/**
 * Keep NEXT GO stable by cue identity while the operator adds, duplicates or
 * reorders cues in Design. This is NEVER called during active playback.
 * If NEXT itself is deleted, choose its successor's former position.
 */
export function reconcileOperatorQueueAfterEdit(state, beforeCues, nextCues) {
  if (!state || !Array.isArray(beforeCues) || !Array.isArray(nextCues) ||
      !Array.isArray(state.completedCueIds) || !Array.isArray(state.skippedCueIds)) {
    throw new TypeError('Invalid sequence reconciliation input');
  }
  if (!beforeCues.length) return startOperatorQueue(nextCues);
  const known = new Set(nextCues.map(cue=>cue.id));
  let preparedCueId = state.preparedCueId;
  if (preparedCueId !== null && !known.has(preparedCueId)) {
    const previousIndex = beforeCues.findIndex(cue=>cue.id===preparedCueId);
    preparedCueId = nextCues[Math.min(Math.max(previousIndex,0),nextCues.length-1)]?.id ?? null;
  }
  return {
    preparedCueId,
    completedCueIds:state.completedCueIds.filter(id=>known.has(id)),
    skippedCueIds:state.skippedCueIds.filter(id=>known.has(id)),
  };
}
