/**
 * Versioned, dependency-free project document codec for the hackathon prototype.
 * Stores ONLY script text, cue/proposal definitions, and audio asset metadata.
 * Audio file contents, AI secrets, and live transport state are deliberately excluded.
 */
import { parseScript } from './script.mjs';
import { validateCueProposals } from './proposals.mjs';
import { validateCueAutomationPlan } from './cueAutomation.mjs';
import { normalizeCuePlayback } from './cuePlayback.mjs';
import { normalizeStopFadeOverrides } from './cueStopFades.mjs';

export const PROJECT_SCHEMA_VERSION = 1;
export const MAX_PROJECT_JSON_BYTES = 2_000_000;
const MAX_SCRIPT_CHARS = 500_000;
const MAX_ASSETS = 500;
const MAX_PROPOSALS = 100;
const MAX_CUES = 2_000;
const MAX_CUE_NUMBER = 10_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const STATES = new Set(['PENDING', 'APPROVED', 'REJECTED']);
const encoder = new TextEncoder();

function invalid(message) {
  const error = new TypeError("Invalid show project: " + message);
  error.code = 'INVALID_SHOW_PROJECT';
  throw error;
}
function record(value, where) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(where + " must be an object");
  return value;
}
function fields(value, names, where) {
  record(value, where);
  for (const name of Object.keys(value)) if (!names.includes(name)) invalid(where + " contains unsupported field " + name);
}
function requiredString(value, max, where) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) invalid(where + " must be nonempty text of at most " + max + " characters");
  return value;
}
function optionalText(value, max, where) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > max ||
      /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) invalid(where + ' is invalid');
  return value.trim() || undefined;
}
function identifier(value, where) {
  if (typeof value !== 'string' || !ID.test(value)) invalid(where + " must be a valid identifier");
  return value;
}
function limitedArray(value, max, where) {
  if (!Array.isArray(value) || value.length > max) invalid(where + " must be an array (max " + max + ")");
  return value;
}
function uniqueId(items, where) {
  const set = new Set();
  for (const entry of items) {
    if (set.has(entry.id)) invalid(where + " contains duplicate id " + entry.id);
    set.add(entry.id);
  }
}
function lineRefs(refs, known, where) {
  if (!Array.isArray(refs) || refs.length === 0 || refs.length > 50) invalid(where + " must contain 1–50 source references");
  if (refs.some(id => typeof id !== 'string' || !known.has(id))) invalid(where + " contains a missing script reference");
  if (new Set(refs).size !== refs.length) invalid(where + " contains duplicate script references");
  return [...refs];
}
function actions(value, knownAssets, where) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) invalid(where + " must contain 1–12 actions");
  return value.map((action, index) => {
    const at = where + "[" + index + "]";
    if (action?.type === 'PLAN_AUDIO') {
      fields(action, ['type', 'prompt', 'resolution'], at);
      if (!['DEFER', 'GENERATE'].includes(action.resolution)) invalid(at + " has invalid resolution");
      return { type: 'PLAN_AUDIO', prompt: requiredString(action.prompt, 500, at + ".prompt"), resolution: action.resolution };
    }
    fields(action, ['type', 'assetId'], at);
    if (action.type !== 'PLAY') invalid(at + " has an unsupported action type");
    const assetId = identifier(action.assetId, at + ".assetId");
    if (!knownAssets.has(assetId)) invalid(at + " references a missing asset");
    return { type: 'PLAY', assetId };
  });
}
function matchesArray(a, b) { return a.length === b.length && a.every((value, i) => value === b[i]); }
function matchesActions(a, b) { return a.length === b.length && a.every((value, i) => value.type === b[i].type && (value.type === 'PLAY' ? value.assetId === b[i].assetId : value.prompt === b[i].prompt && value.resolution === b[i].resolution)); }

/** Validate and create an entirely detached, canonical project object. */
export function normalizeShowProject(input) {
  fields(input, ['schemaVersion', 'id', 'name', 'scriptText', 'assets', 'proposals', 'cues'], 'project');
  if (input.schemaVersion !== PROJECT_SCHEMA_VERSION) invalid('unsupported schemaVersion');
  const id = identifier(input.id, 'project.id');
  const name = requiredString(input.name, 120, 'project.name');
  const scriptText = input.scriptText;
  if (typeof scriptText !== 'string' || scriptText.length > MAX_SCRIPT_CHARS || scriptText.includes('\0')) invalid('scriptText is invalid or too long');
  const sourceLines = new Set(parseScript(scriptText).map(line => line.id));

  const assets = limitedArray(input.assets, MAX_ASSETS, 'assets').map((asset, index) => {
    fields(asset, ['id', 'name'], "assets[" + index + "]");
    return { id: identifier(asset.id, "assets[" + index + "].id"), name: requiredString(asset.name, 200, "assets[" + index + "].name") };
  });
  uniqueId(assets, 'assets');
  const knownAssets = new Set(assets.map(asset => asset.id));

  const proposals = limitedArray(input.proposals, MAX_PROPOSALS, 'proposals').map((proposal, index) => {
    const at = "proposals[" + index + "]";
    fields(proposal, ['id', 'label', 'sourceLineIds', 'actions', 'status', 'source'], at);
    const proposalId = identifier(proposal.id, at + ".id");
    if (!STATES.has(proposal.status)) invalid(at + ".status is invalid");
    if (proposal.source !== undefined && !['MANUAL_MOCK', 'META_MODEL_API', 'BASETEN_MUSE_SPARK_OPEN'].includes(proposal.source)) {
      invalid(at + ".source is invalid");
    }
    return {
      id: proposalId,
      label: requiredString(proposal.label, 200, at + ".label"),
      sourceLineIds: lineRefs(proposal.sourceLineIds, sourceLines, at + ".sourceLineIds"),
      actions: actions(proposal.actions, knownAssets, at + ".actions"),
      status: proposal.status,
      ...(proposal.source === undefined ? {} : { source: proposal.source }),
    };
  });
  uniqueId(proposals, 'proposals');
  const verification = validateCueProposals(proposals, parseScript(scriptText), [...knownAssets]);
  if (!verification.valid) invalid('proposals failed cue proposal validation');
  const proposalIndex = new Map(proposals.map(p => [p.id, p]));

  const cues = limitedArray(input.cues, MAX_CUES, 'cues').map((cue, index) => {
    const at = "cues[" + index + "]";
    fields(cue, ['id', 'number', 'label', 'sourceProposalId', 'sourceLineIds', 'actions', 'status', 'trigger', 'notes', 'automation', 'playback', 'stopFadeOverrides', 'origin'], at);
    const cueId = identifier(cue.id, at + ".id");
    if (!Number.isSafeInteger(cue.number) || cue.number < 1 || cue.number > MAX_CUE_NUMBER) invalid(at + ".number is invalid");
    if (cue.status !== 'DRAFT') invalid(at + ".status must be DRAFT");
    const manual = cue.origin === 'MANUAL';
    if (cue.origin !== undefined && !manual) invalid(at + '.origin is invalid');
    const refs = manual && Array.isArray(cue.sourceLineIds) && cue.sourceLineIds.length === 0
      ? [] : lineRefs(cue.sourceLineIds, sourceLines, at + '.sourceLineIds');
    const cueActions = actions(cue.actions, knownAssets, at + ".actions");
    const sourceProposalId = manual ? undefined : identifier(cue.sourceProposalId, at + '.sourceProposalId');
    if (!manual) {
      const parent = proposalIndex.get(sourceProposalId);
      if (!parent || parent.status !== 'APPROVED') invalid(at + ' must reference an approved proposal');
      if (!matchesArray(refs, parent.sourceLineIds) || !matchesActions(cueActions, parent.actions)) invalid(at + ' diverges from its approved proposal');
    }
    return {
      id: cueId,
      number: cue.number,
      label: requiredString(cue.label, 200, at + ".label"),
      ...(optionalText(cue.trigger, 300, at + '.trigger') === undefined ? {} : { trigger: optionalText(cue.trigger, 300, at + '.trigger') }),
      ...(optionalText(cue.notes, 1500, at + '.notes') === undefined ? {} : { notes: optionalText(cue.notes, 1500, at + '.notes') }),
      ...(manual ? { origin: 'MANUAL' } : { sourceProposalId }),
      sourceLineIds: refs,
      actions: cueActions,
      status: 'DRAFT',
      ...(cue.automation === undefined ? {} : { automation: cue.automation }),
      ...(cue.playback === undefined ? {} : { playback: normalizeCuePlayback(cue.playback) }),
      ...(cue.stopFadeOverrides === undefined ? {} : { stopFadeOverrides: cue.stopFadeOverrides }),
    };
  });
  uniqueId(cues, 'cues');
  if (new Set(cues.map(c => c.number)).size !== cues.length) invalid('cues contain duplicate numbers');
  const approvedSourceIds = cues.filter(c => c.sourceProposalId).map(c => c.sourceProposalId);
  if (new Set(approvedSourceIds).size !== approvedSourceIds.length) invalid('approved proposals are used by more than one cue');

  // Existing schema-v1 files remain valid; automation is optional and operator-owned.
  // Validate cross-cue references only after all cue identifiers are known.
  try {
    const plan = validateCueAutomationPlan(cues.map(cue => ({ id: cue.id, automation: cue.automation })));
    for (let index = 0; index < cues.length; index += 1) {
      if (cues[index].stopFadeOverrides !== undefined) {
        cues[index].stopFadeOverrides = normalizeStopFadeOverrides(
          cues[index].stopFadeOverrides, plan[index].automation.stopCueIds);
      }
      if (cues[index].automation !== undefined) cues[index].automation = {
        ...plan[index].automation, stopCueIds: [...plan[index].automation.stopCueIds],
      };
    }
  } catch (error) { invalid('cue automation: ' + error.message); }
  return { schemaVersion: PROJECT_SCHEMA_VERSION, id, name, scriptText, assets, proposals, cues };
}

/** Return a stable JSON string. No filesystem interaction and no audio binaries. */
export function serializeShowProject(project) {
  const canonical = normalizeShowProject(project);
  const text = JSON.stringify(canonical, null, 2);
  if (encoder.encode(text).byteLength > MAX_PROJECT_JSON_BYTES) invalid('serialized document exceeds size limit');
  return text;
}

/** Load JSON; reject corrupt, oversized and future-version documents. */
export function deserializeShowProject(json) {
  if (typeof json !== 'string') invalid('JSON input must be a string');
  if (encoder.encode(json).byteLength > MAX_PROJECT_JSON_BYTES) invalid('JSON input exceeds size limit');
  let parsed;
  try { parsed = JSON.parse(json); }
  catch { invalid('malformed JSON'); }
  return normalizeShowProject(parsed);
}
