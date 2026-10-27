/**
 * Non-executable stage-event planning layer.
 *
 * Consumes validated or human-authored CueSuggestionV2 records, anchors them
 * to unchanged script evidence, and resolves ONLY explicitly assigned sound
 * identities. Labels, prompts and the model's "confidence" are never used
 * to guess which running sound a STOP or CONTINUE refers to.
 *
 * This layer is preparation data: it does not mutate projects, persist cues,
 * send network requests, call GO, or control a playback engine.
 */
import { analyzeScriptStructure } from './scriptStructure.mjs';

const TRANSPORTS = new Set(['PLAY', 'CONTINUE', 'STOP', 'SILENCE']);
const CUE_KINDS = new Set(['FX', 'AMBIENCE', 'MUSIC', 'VOICE', 'SILENCE', 'TRANSITION']);
const BASES = new Set(['EXPLICIT', 'SUGGESTED']);
const SOURCE_MODES = new Set(['UNDETERMINED', 'RECORDED', 'LIVE_PERFORMER', 'PRACTICAL', 'SET_PROP']);
const MAX_EVENTS = 1000;

function bindings(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(name + ' must be an object mapping event IDs to values');
  }
  return value;
}

function assigned(map, id) {
  return Object.hasOwn(map, id) ? map[id] : null;
}

/**
 * @param {string} scriptText - original untouched play text
 * @param {Array<object>} suggestions - source-validated CueSuggestionV2 or matching human-authored records
 * @param {object} options - operator-supplied explicit identities/sources keyed by event ID
 */
export function planStageEvents(scriptText, suggestions, options = {}) {
  if (!Array.isArray(suggestions) || suggestions.length > MAX_EVENTS) {
    throw new TypeError('Expected a bounded stage-event array');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).some(key => !['identityByEventId', 'sourceByEventId'].includes(key))) {
    throw new TypeError('Invalid stage-event planning options');
  }
  const identityByEventId = bindings(options.identityByEventId ?? {}, 'identityByEventId');
  const sourceByEventId = bindings(options.sourceByEventId ?? {}, 'sourceByEventId');
  const structure = analyzeScriptStructure(scriptText);
  const sourceById = new Map(structure.lines.map(line => [line.lineId, line]));
  const perLine = new Map();

  const events = suggestions.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        typeof item.sourceLineId !== 'string' ||
        typeof item.sourceEvidence !== 'string' || !item.sourceEvidence.trim() ||
        !TRANSPORTS.has(item.transport) || !CUE_KINDS.has(item.cueKind) ||
        !BASES.has(item.basis)) {
      throw new TypeError('Invalid stage-event suggestion');
    }
    const source = sourceById.get(item.sourceLineId);
    if (!source || !source.text.includes(item.sourceEvidence)) {
      throw new RangeError('Stage event has no exact original source evidence');
    }
    if ((item.cueKind === 'SILENCE') !== (item.transport === 'SILENCE')) {
      throw new TypeError('Incompatible silence/transport intent');
    }

    const sequence = (perLine.get(item.sourceLineId) ?? 0) + 1;
    perLine.set(item.sourceLineId, sequence);
    const eventId = 'E-' + item.sourceLineId + '-' + sequence;
    const identity = assigned(identityByEventId, eventId);
    const mode = assigned(sourceByEventId, eventId) ?? 'UNDETERMINED';
    if ((identity !== null &&
         (typeof identity !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(identity))) ||
        !SOURCE_MODES.has(mode)) {
      throw new TypeError('Invalid operator stage-event binding');
    }

    return {
      eventId,
      sourceLineId: item.sourceLineId,
      sceneId: source.sceneId,
      sourceEvidence: item.sourceEvidence,
      lineRole: source.role,
      speaker: source.speaker,
      cueKind: item.cueKind,
      basis: item.basis,
      transport: item.transport,
      trigger: item.trigger ?? 'ON_LINE',
      sourceMode: mode,
      soundIdentity: identity,
      linkedPlayEventId: null,
      reviewIssues: [],
      // No model value, binding or reviewIssue authorizes automatic execution.
      executable: false,
    };
  });

  // Source order, not response order, controls temporal continuity.
  events.sort((a, b) => Number(a.sourceLineId.slice(1)) - Number(b.sourceLineId.slice(1)) ||
    Number(a.eventId.split('-').at(-1)) - Number(b.eventId.split('-').at(-1)));

  const active = new Map();
  for (const event of events) {
    if (event.lineRole === 'DIALOGUE' && event.basis === 'EXPLICIT') {
      event.reviewIssues.push('DIALOGUE_TIMING_REQUIRES_REHEARSAL');
    }
    if (event.sourceMode === 'UNDETERMINED') {
      event.reviewIssues.push('SOURCE_MODE_UNCONFIRMED');
    }
    const identity = event.soundIdentity;
    if (event.transport === 'PLAY') {
      if (identity !== null) {
        if (active.has(identity)) {
          event.reviewIssues.push('SOUND_ALREADY_ACTIVE');
        } else {
          active.set(identity, event.eventId);
        }
      }
    } else if (event.transport === 'CONTINUE' || event.transport === 'STOP') {
      if (identity !== null && active.has(identity)) {
        event.linkedPlayEventId = active.get(identity);
        if (event.transport === 'STOP') active.delete(identity);
      } else {
        event.reviewIssues.push('TARGET_SOUND_UNRESOLVED');
      }
    } else {
      // A silence direction is a design/rehearsal decision, not an audio file
      // and not an implicit STOP ALL command.
      event.reviewIssues.push('SILENCE_REQUIRES_OPERATOR_DECISION');
    }
  }

  return {
    events,
    activeSoundIdentities: [...active.keys()],
    unresolvedEventIds: events.filter(event => event.reviewIssues.length > 0)
      .map(event => event.eventId),
    // This plan is not the live transport or the persisted schema-v1 project.
    executable: false,
  };
}
