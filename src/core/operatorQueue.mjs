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
