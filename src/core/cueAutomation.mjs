/**
 * Declarative cue automation plan, intentionally separate from audio transport.
 * This module NEVER starts audio or schedules timers. A future runtime must
 * execute plans explicitly and cancel them on STOP ALL / project changes.
 */
export const FOLLOW_MODES = Object.freeze(['MANUAL', 'AUTO_FOLLOW', 'AUTO_CONTINUE']);

function fail(message) { throw new TypeError('Invalid cue automation: ' + message); }
function ms(value, where, maximum = 3_600_000) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail(where + ' must be 0–' + maximum + ' ms');
  return value;
}
function id(value, where) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(value)) fail(where + ' invalid');
  return value;
}
function keys(object, allowed, where) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) fail(where + ' must be object');
  for (const key of Object.keys(object)) if (!allowed.includes(key)) fail(where + ' unknown field ' + key);
}
export function normalizeCueAutomation(value = {}) {
  keys(value, ['mode', 'delayMs', 'fadeInMs', 'fadeOutMs', 'loop', 'stopCueIds'], 'automation');
  const mode = value.mode ?? 'MANUAL';
  if (!FOLLOW_MODES.includes(mode)) fail('unknown mode');
  const delayMs = ms(value.delayMs ?? 0, 'delayMs');
  if (mode === 'MANUAL' && delayMs !== 0) fail('MANUAL cannot have delay');
  const fadeInMs = ms(value.fadeInMs ?? 0, 'fadeInMs', 60_000);
  const fadeOutMs = ms(value.fadeOutMs ?? 0, 'fadeOutMs', 60_000);
  if (typeof (value.loop ?? false) !== 'boolean') fail('loop must be boolean');
  const stopCueIds = value.stopCueIds ?? [];
  if (!Array.isArray(stopCueIds) || stopCueIds.length > 20) fail('stopCueIds must be array of up to 20');
  const ids = stopCueIds.map((v, i) => id(v, 'stopCueIds[' + i + ']'));
  if (new Set(ids).size !== ids.length) fail('duplicate stop cue');
  return Object.freeze({ mode, delayMs, fadeInMs, fadeOutMs, loop: value.loop ?? false, stopCueIds: Object.freeze(ids) });
}

/**
 * Pure show-level validation; automation belongs to the SOURCE cue and targets
 * the next cue in show order. Prevents self-stops, missing references and
 * automatic following from a looping source (which never naturally ends).
 */
export function validateCueAutomationPlan(cues) {
  if (!Array.isArray(cues) || cues.length > 2000) fail('invalid cue list');
  const seen = new Set();
  for (const cue of cues) {
    keys(cue, ['id', 'automation'], 'cue');
    const cueId = id(cue.id, 'cue.id');
    if (seen.has(cueId)) fail('duplicate cue id');
    seen.add(cueId);
  }
  return Object.freeze(cues.map((cue, index) => {
    const automation = normalizeCueAutomation(cue.automation);
    if (automation.stopCueIds.includes(cue.id)) fail('cue cannot stop itself');
    for (const target of automation.stopCueIds) if (!seen.has(target)) fail('stop target not in show: ' + target);
    if (automation.mode === 'AUTO_FOLLOW' && automation.loop) fail('loop cannot AUTO_FOLLOW on natural completion');
    if (automation.mode !== 'MANUAL' && index === cues.length - 1) fail('last cue has no next cue');
    return Object.freeze({ cueId: cue.id, nextCueId: cues[index + 1]?.id ?? null, automation });
  }));
}

/**
 * Resolves an operator GO into transport instructions without performing them.
 * STOP_OTHER is always listed before PLAY; AUTO_CONTINUE starts its delay at GO,
 * whereas AUTO_FOLLOW starts its delay at natural playback completion.
 */
export function planCueGo(plan, cueId) {
  if (!Array.isArray(plan)) fail('validated plan required');
  const entry = plan.find(item => item.cueId === cueId);
  if (!entry) fail('cue missing from plan');
  const a = entry.automation;
  return Object.freeze({
    cueId,
    stopFirst: Object.freeze([...a.stopCueIds]),
    fadeInMs: a.fadeInMs,
    fadeOutMs: a.fadeOutMs,
    loop: a.loop,
    nextCueId: a.mode === 'MANUAL' ? null : entry.nextCueId,
    trigger: a.mode === 'AUTO_FOLLOW' ? 'ON_NATURAL_END' : a.mode === 'AUTO_CONTINUE' ? 'AFTER_GO' : null,
    delayMs: a.delayMs,
  });
}
