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

/**
 * Pure editor staging. Final schema and cross-cue checks are performed by
 * normalizeShowProject before assigning to application state.
 */
export function stageCueStopTransitions(project, cueId, transitions) {
  if (!Array.isArray(transitions) || transitions.length > 20) throw new TypeError('Invalid stop transitions');
  const cue = project?.cues?.find(item => item.id === cueId);
  if (!cue || cue.status !== 'DRAFT') throw new TypeError('Cue is not editable');
  const ids = transitions.map(item => item?.targetCueId);
  if (new Set(ids).size !== ids.length || ids.includes(cueId)) throw new TypeError('Duplicate or self-target transition');
  const stopFadeOverrides = Object.fromEntries(transitions.map(item => [item.targetCueId, item.fadeMs]));
  normalizeStopFadeOverrides(stopFadeOverrides, ids);
  return {
    ...project,
    cues: project.cues.map(item => item.id === cueId
      ? {
        ...item,
        automation: { mode:'MANUAL',delayMs:0,fadeInMs:0,fadeOutMs:0,loop:false,
          ...(item.automation ?? {}), stopCueIds:ids },
        stopFadeOverrides,
      }
      : item),
  };
}
