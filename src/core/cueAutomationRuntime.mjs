import { planCueGo } from './cueAutomation.mjs';

/**
 * Explicit, injectable automation coordinator. No audio engine assumptions:
 * transport.go must be supplied by the caller and remains the only playback
 * entry point. This does NOT integrate with UI or project persistence yet.
 *
 * A natural end must be reported with endedNaturally(cueId); STOP/STOP ALL
 * must call stopCue/cancelAll so no delayed GO survives an operator stop.
 */
export function createCueAutomationRuntime({ plan, transport, schedule = (fn, ms) => setTimeout(fn, ms), cancel = token => clearTimeout(token), onError = () => {} }) {
  if (!Array.isArray(plan) || !transport || typeof transport.go !== 'function' ||
      typeof transport.stopCue !== 'function' || typeof transport.stopAll !== 'function' ||
      typeof schedule !== 'function' || typeof cancel !== 'function' || typeof onError !== 'function') {
    throw new TypeError('Invalid cue automation runtime dependencies');
  }
  const pending = new Map();
  const active = new Set();
  let generation = 0;
  let disposed = false;

  function clearPending(cueId) {
    const record = pending.get(cueId);
    if (!record) return;
    pending.delete(cueId);
    cancel(record.token);
  }
  function scheduleNext(cueId, instruction) {
    if (!instruction.nextCueId) return;
    clearPending(cueId);
    const epoch = generation;
    const record = { token: undefined };
    pending.set(cueId, record);
    const callback = () => {
      if (disposed || epoch !== generation || pending.get(cueId) !== record) return;
      pending.delete(cueId);
      void go(instruction.nextCueId).catch(onError);
    };
    record.token = schedule(callback, instruction.delayMs);
  }
  async function go(cueId) {
    if (disposed) throw new Error('Automation runtime disposed');
    const instruction = planCueGo(plan, cueId);
    if (active.has(cueId)) throw new Error('Cue already active');
    // A fresh GO supersedes any follow left by this cue's previous run.
    clearPending(cueId);
    for (const otherId of instruction.stopFirst) stopCue(otherId);
    const epoch = generation;
    active.add(cueId);
    try {
      await transport.go(cueId, instruction);
      if (disposed || epoch !== generation || !active.has(cueId)) return false;
      if (instruction.trigger === 'AFTER_GO') scheduleNext(cueId, instruction);
      return true;
    } catch (error) {
      active.delete(cueId);
      throw error;
    }
  }
  function endedNaturally(cueId) {
    if (disposed || !active.delete(cueId)) return false;
    const instruction = planCueGo(plan, cueId);
    if (instruction.trigger === 'ON_NATURAL_END') scheduleNext(cueId, instruction);
    return true;
  }
  function stopCue(cueId) {
    clearPending(cueId);
    active.delete(cueId);
    return transport.stopCue(cueId);
  }
  function cancelAll() {
    generation += 1;
    for (const cueId of [...pending.keys()]) clearPending(cueId);
    active.clear();
    transport.stopAll();
  }
  function dispose() {
    if (disposed) return;
    cancelAll();
    disposed = true;
  }
  return Object.freeze({
    go, endedNaturally, stopCue, cancelAll, dispose,
    getStatus: () => Object.freeze({ activeCueIds: Object.freeze([...active]), pendingFollowCueIds: Object.freeze([...pending.keys()]), disposed }),
  });
}
