/**
 * Bridge from existing strict V1 cue events to Scenic Interpretation V2.
 *
 * V1 includes line/transport/kind/basis but NEVER guarantees cue lifecycle,
 * target bindings or file duration. Those properties may only be supplied
 * explicitly by the operator, and are never inferred from a generated event.
 *
 * This pure adapter does not approve, persist, score or execute anything.
 */
import { parseScript } from './script.mjs';
import { interpretScenicObservations } from './scenicInterpretationV2.mjs';

const TRANSPORTS = new Set(['PLAY','STOP','CONTINUE','SILENCE']);
const KINDS = new Set(['FX','AMBIENCE','MUSIC','VOICE','SILENCE','TRANSITION']);
const BASES = new Set(['EXPLICIT','SUGGESTED']);
const LINE_ID = /^L[1-9]\d*$/;
const MAX_EVENTS = 100;
const CONTEXT_KEYS = new Set(['sourceCueId','playbackState','playbackMode','change','requestAction','targetCueIds']);
const EVENT_KEYS = new Set(['lineId','sourceLineId','transport','cueKind','basis']);

function validateEvent(value, lines) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !EVENT_KEYS.has(key))) {
    throw new TypeError('Invalid strict V1 cue event');
  }
  if (value.lineId !== undefined && value.sourceLineId !== undefined &&
      value.lineId !== value.sourceLineId) throw new TypeError('Conflicting line references');
  const lineId = value.sourceLineId ?? value.lineId;
  if (typeof lineId !== 'string' || !LINE_ID.test(lineId) || !lines.has(lineId)) {
    throw new RangeError('Invalid source line reference');
  }
  if (!TRANSPORTS.has(value.transport) || !KINDS.has(value.cueKind) ||
      !BASES.has(value.basis) ||
      (value.transport === 'SILENCE') !== (value.cueKind === 'SILENCE')) {
    throw new TypeError('Invalid V1 transport/kind/basis');
  }
  return {lineId,transport:value.transport,cueKind:value.cueKind,basis:value.basis};
}

function validateBindings(bindings, lines) {
  if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) {
    throw new TypeError('Invalid operator bindings');
  }
  for (const [lineId, details] of Object.entries(bindings)) {
    if (!lines.has(lineId) || !details || typeof details !== 'object' ||
        Array.isArray(details) || Object.keys(details).some(k => !CONTEXT_KEYS.has(k))) {
      throw new TypeError('Invalid operator binding');
    }
  }
}

/**
 * @param {object} input
 * @param {string} input.scriptText - unchanged script, with Lxx references
 * @param {Array} input.events - strict V1 event tuples (from validated input)
 * @param {object} [input.operatorBindings] - independently entered review data,
 *   keyed by source line ID (never populated from model response)
 */
export function bridgeV1EventsToScenicV2({scriptText,events,operatorBindings={}}={}) {
  const lines = new Set(parseScript(scriptText).map(line=>line.id));
  if (!Array.isArray(events) || events.length > MAX_EVENTS) {
    throw new TypeError('Invalid V1 event collection');
  }
  validateBindings(operatorBindings,lines);
  const normalized = events.map(event=>validateEvent(event,lines));
  const observations = normalized.map(event=>({
    lineId:event.lineId,
    intent:event.transport,
    cueKind:event.cueKind,
    // Only the trusted operator can provide playback bindings and semantics.
    ...(operatorBindings[event.lineId] ?? {}),
  }));
  const advisory = interpretScenicObservations({scriptText,observations});
  return {
    version:2,
    status:'ADVISORY_ONLY',
    source:'STRICT_V1_EVENT_TUPLES',
    requiresOperatorReview:true,
    scriptLineCount:advisory.scriptLineCount,
    items:advisory.items.map((item,index)=>({
      ...item,
      basis:normalized[index].basis,
      cueKind:normalized[index].cueKind,
    })),
  };
}
