/**
 * Scenic Interpretation V2 — pure, offline advisory classification.
 * Inputs are structured operator/model observations, NOT raw AI commands.
 * No proposal approval, project mutation, audio playback, or network activity.
 * V1 scoring and production transport remain unchanged.
 */
import { parseScript } from './script.mjs';

export const SCENIC_INTERPRETATION_VERSION = 2;
export const SCENIC_DISPOSITIONS = Object.freeze({
  ACTION: 'EXECUTABLE_ACTION',
  NOTE: 'SCRIPT_NOTE',
  SUGGESTION: 'OPERATOR_SUGGESTION',
});
const INTENTS = new Set(['PLAY', 'STOP', 'CONTINUE', 'SILENCE', 'TRANSITION']);
const KINDS = new Set(['FX','AMBIENCE','MUSIC','VOICE','SILENCE','TRANSITION']);
const PLAYBACK_STATES = new Set(['ACTIVE', 'ENDED', 'UNKNOWN']);
const MODES = new Set(['ONE_SHOT', 'LOOP', 'SUSTAINED', 'UNKNOWN']);
const CHANGES = new Set(['NONE', 'GAIN', 'FADE', 'LOOP']);
const LINE_ID = /^L[1-9]\d*$/;
const CUE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const KEYS = new Set(['lineId','intent','cueKind','sourceCueId','playbackState','playbackMode','change','targetCueIds','requestAction','rationale']);
const MAX_EVENTS = 100;

function verifyInput(raw, knownLines) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).some(key => !KEYS.has(key))) throw new TypeError('Invalid scenic observation');
  if (typeof raw.lineId !== 'string' || !LINE_ID.test(raw.lineId) || !knownLines.has(raw.lineId)) {
    throw new RangeError('Unknown scenic source line');
  }
  if (!INTENTS.has(raw.intent)) throw new TypeError('Invalid scenic intent');
  if (raw.cueKind !== undefined && !KINDS.has(raw.cueKind)) throw new TypeError('Invalid cue kind');
  if (raw.playbackState !== undefined && !PLAYBACK_STATES.has(raw.playbackState)) throw new TypeError('Invalid playback state');
  if (raw.playbackMode !== undefined && !MODES.has(raw.playbackMode)) throw new TypeError('Invalid playback mode');
  if (raw.change !== undefined && !CHANGES.has(raw.change)) throw new TypeError('Invalid playback change');
  if (raw.sourceCueId !== undefined && (typeof raw.sourceCueId !== 'string' || !CUE_ID.test(raw.sourceCueId))) {
    throw new TypeError('Invalid source cue ID');
  }
  if (raw.requestAction !== undefined && typeof raw.requestAction !== 'boolean') throw new TypeError('Invalid requestAction');
  if (raw.rationale !== undefined && (typeof raw.rationale !== 'string' || raw.rationale.length > 500)) {
    throw new TypeError('Invalid rationale');
  }
  if (raw.targetCueIds !== undefined && (!Array.isArray(raw.targetCueIds) ||
      raw.targetCueIds.length > 32 ||
      raw.targetCueIds.some(id => typeof id !== 'string' || !CUE_ID.test(id)) ||
      new Set(raw.targetCueIds).size !== raw.targetCueIds.length)) {
    throw new TypeError('Invalid target cue IDs');
  }
  // Unknown property combinations are treated as errors instead of silently executing.
  if (raw.change !== undefined && raw.intent !== 'CONTINUE') throw new TypeError('Change only valid for CONTINUE');
  if (raw.targetCueIds !== undefined && raw.intent !== 'SILENCE') throw new TypeError('Targets only valid for SILENCE');
  if (raw.requestAction !== undefined && raw.intent !== 'SILENCE') throw new TypeError('requestAction only valid for SILENCE');
  if (raw.intent === 'SILENCE' && raw.cueKind !== undefined && raw.cueKind !== 'SILENCE') throw new TypeError('SILENCE cue kind mismatch');
  if (raw.intent === 'TRANSITION' && raw.cueKind !== undefined && raw.cueKind !== 'TRANSITION') throw new TypeError('TRANSITION cue kind mismatch');
  return raw;
}

function classify(event) {
  const {intent} = event;
  const result = (disposition, reason, operation = null) => ({
    version: SCENIC_INTERPRETATION_VERSION,
    lineId:event.lineId,
    disposition,
    intent,
    reason,
    sourceCueId:event.sourceCueId ?? null,
    // Advisory only. An action is never approved or executable by this module.
    approvalStatus:'PENDING_OPERATOR_REVIEW',
    operation,
  });

  if (intent === 'TRANSITION') {
    return result(SCENIC_DISPOSITIONS.SUGGESTION,
      'Possible change between scenes; operator must choose overlap, natural end or transition');
  }
  if (intent === 'SILENCE') {
    const targets = event.targetCueIds ?? [];
    if (!event.requestAction) {
      return result(SCENIC_DISPOSITIONS.NOTE, 'Scenic silence condition; no transport action');
    }
    if (!targets.length) {
      return result(SCENIC_DISPOSITIONS.SUGGESTION,
        'Potential silence operation requires operator-selected playback targets');
    }
    return result(SCENIC_DISPOSITIONS.ACTION,
      'Only the specified playback cue IDs may be targeted, after operator approval',
      {type:'STOP_SELECTED_PLAYBACK', targetCueIds:[...targets]});
  }
  if (intent === 'CONTINUE') {
    if (!event.sourceCueId) {
      return result(SCENIC_DISPOSITIONS.SUGGESTION, 'Cannot identify which existing cue continues');
    }
    if (!event.change || event.change === 'NONE') {
      return result(SCENIC_DISPOSITIONS.NOTE, 'No new playback operation; retain existing audio state');
    }
    return result(SCENIC_DISPOSITIONS.ACTION,
      'A parameter change is requested but requires operator configuration',
      {type:'CONFIGURE_PLAYBACK', sourceCueId:event.sourceCueId, change:event.change});
  }
  if (intent === 'STOP') {
    if (event.playbackMode === 'ONE_SHOT' && event.playbackState === 'ENDED') {
      return result(SCENIC_DISPOSITIONS.NOTE, 'One-shot already finished; redundant STOP suppressed');
    }
    if (!event.sourceCueId || event.playbackState !== 'ACTIVE') {
      return result(SCENIC_DISPOSITIONS.SUGGESTION, 'STOP target or playback state requires confirmation');
    }
    return result(SCENIC_DISPOSITIONS.ACTION, 'Explicit selective STOP requires operator review',
      {type:'STOP_SELECTED_PLAYBACK', targetCueIds:[event.sourceCueId]});
  }
  // PLAY: semantic output only. Do not construct a playable asset or queue operation.
  return result(SCENIC_DISPOSITIONS.ACTION, 'Proposed playback needs an asset and operator approval',
    {type:'PLAY_PROPOSAL', sourceCueId:event.sourceCueId ?? null});
}

/** Strict offline interpretation of already-structured observations. */
export function interpretScenicObservations({scriptText, observations} = {}) {
  const lines = parseScript(scriptText);
  if (!Array.isArray(observations) || observations.length > MAX_EVENTS) {
    throw new TypeError('Invalid scenic observations');
  }
  const knownLines = new Set(lines.map(line => line.id));
  const items = observations.map(raw => classify(verifyInput(raw,knownLines)));
  return {version:SCENIC_INTERPRETATION_VERSION, status:'ADVISORY_ONLY',
    scriptLineCount:lines.length, items};
}
