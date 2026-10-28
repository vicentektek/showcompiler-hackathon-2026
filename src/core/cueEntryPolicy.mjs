/**
 * Operator-only per-cue policy for handling earlier playing sounds on GO.
 * Distinct from per-cue targeted STOP fades and from STOP ALL emergency.
 */
import { normalizeShowProject } from './projectPersistence.mjs';

export const DEFAULT_CUE_ENTRY_POLICY = Object.freeze({mode:'OVERLAP',fadeOutMs:0});
export function normalizeCueEntryPolicy(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value) ||
     Object.keys(value).some(x=>!['mode','fadeOutMs'].includes(x)))
    throw new TypeError('Invalid cue entry policy');
  const mode=value.mode??'OVERLAP';
  const fadeOutMs=value.fadeOutMs??0;
  if(!['OVERLAP','STOP_PREVIOUS'].includes(mode) ||
     !Number.isSafeInteger(fadeOutMs) || fadeOutMs<0 || fadeOutMs>10000)
    throw new TypeError('Invalid cue overlap mode or fade');
  return Object.freeze({mode,fadeOutMs});
}
/** Persist only per-cue policy; file, other cues and transport untouched. */
export function setCueEntryPolicy(project,cueId,value){
  const show=normalizeShowProject(project);
  const entry=normalizeCueEntryPolicy(value);
  if(!show.cues.some(c=>c.id===cueId))throw new RangeError('Cue not found');
  return normalizeShowProject({...show,cues:show.cues.map(c=>
    c.id===cueId?{...c,entryPolicy:entry}:c)});
}
/** Stop list excludes the incoming cue; targeted stop IDs remain independent. */
export function planEntryStops(cues,incomingCueId,policy){
  const mode=normalizeCueEntryPolicy(policy);
  return mode.mode==='STOP_PREVIOUS'
    ? Object.freeze(cues.filter(c=>c.id!==incomingCueId).map(c=>({cueId:c.id,fadeMs:mode.fadeOutMs})))
    : Object.freeze([]);
}
