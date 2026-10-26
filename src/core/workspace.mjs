/** Pure application workflow. No audio execution, model calls or persistence side effects. */
import { parseScript } from './script.mjs';
import { validateCueProposals } from './proposals.mjs';
import { reviewCueProposal } from './review.mjs';
import { normalizeShowProject, PROJECT_SCHEMA_VERSION } from './projectPersistence.mjs';

export function createNewShow({ id = 'show-1', name = 'Nuevo espectáculo', scriptText = '' } = {}) {
  return normalizeShowProject({
    schemaVersion: PROJECT_SCHEMA_VERSION, id, name, scriptText,
    assets: [], proposals: [], cues: [],
  });
}

export function replaceShowScript(project, scriptText) {
  const current = normalizeShowProject(project);
  if (current.proposals.length || current.cues.length) {
    throw new Error('Cannot replace script while proposals or cues exist; create a new show');
  }
  return normalizeShowProject({ ...current, scriptText });
}

export function addAudioReference(project, name) {
  const current = normalizeShowProject(project);
  if (typeof name !== 'string' || !name.trim()) throw new TypeError('Provide an audio reference name');
  const id = nextAvailableId('asset', current.assets.map(a => a.id));
  return normalizeShowProject({ ...current, assets: [...current.assets, { id, name: name.trim() }] });
}

export function nextAvailableId(prefix, usedIds) {
  if (typeof prefix !== 'string' || !/^[a-z][a-z0-9-]*$/.test(prefix)) {
    throw new TypeError('Invalid ID prefix');
  }
  if (!Array.isArray(usedIds)) throw new TypeError('Invalid existing identifiers');
  const used = new Set(usedIds);
  for (let index = 1; index <= 9999; index += 1) {
    const id = `${prefix}-${index}`;
    if (!used.has(id)) return id;
  }
  throw new Error('Identifier limit reached');
}

export function addMockProposal(project, { lineId, assetId, label } = {}) {
  const current = normalizeShowProject(project);
  const proposal = {
    id: nextAvailableId('proposal', current.proposals.map(p => p.id)),
    label, sourceLineIds: [lineId], actions: [assetId ? { type: 'PLAY', assetId } : { type: 'PLAN_AUDIO', prompt: label, resolution: 'DEFER' }], source: 'MANUAL_MOCK',
  };
  const verified = validateCueProposals([proposal], parseScript(current.scriptText), current.assets.map(a => a.id));
  if (!verified.valid) throw new TypeError(verified.errors.join('; '));
  return normalizeShowProject({ ...current, proposals: [...current.proposals, verified.proposals[0]] });
}

/**
 * Integrate server-verified Meta text proposals without auto-approving or executing.
 * The browser revalidates raw response data against the current project.
 */
export function addModelProposals(project, suggestions, provider = 'META_MODEL_API') {
  if (!['META_MODEL_API', 'BASETEN_MUSE_SPARK_OPEN'].includes(provider)) {
    throw new TypeError('Unsupported AI suggestion provider');
  }
  const current = normalizeShowProject(project);
  if (!Array.isArray(suggestions) || suggestions.length > 8) throw new TypeError('Meta returned too many suggestions');
  if (current.proposals.length + suggestions.length > 100) throw new RangeError('Proposal limit reached');
  const allLines = parseScript(current.scriptText);
  // First-party Meta requests can explicitly advance through later scene
  // windows. Baseten's separate fallback contract still sends only line 1–120.
  const permittedLines = new Set((provider === 'META_MODEL_API' ? allLines : allLines.slice(0, 120))
    .map(line => line.id));
  const permittedAssets = new Set(current.assets.slice(0, 80).map(asset => asset.id));
  const proposed = [];
  const usedIds = current.proposals.map(p => p.id);
  for (const item of suggestions) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        !permittedLines.has(item.lineId) ||
        (item.assetId != null && !permittedAssets.has(item.assetId)) ||
        typeof item.label !== 'string' || !item.label.trim() ||
        (item.assetId == null && (typeof item.soundPrompt !== 'string' || !item.soundPrompt.trim())) ||
        (item.soundPrompt !== undefined && (typeof item.soundPrompt !== 'string' || !item.soundPrompt.trim() || item.soundPrompt.length > 500))) {
      throw new TypeError('Meta suggestion does not match supplied script excerpt or audio list');
    }
    const id = nextAvailableId('proposal', usedIds);
    usedIds.push(id);
    proposed.push({
      id, label: item.label.trim(), sourceLineIds: [item.lineId],
      actions: [item.assetId == null
        ? { type: 'PLAN_AUDIO', prompt: item.soundPrompt.trim(), resolution: 'DEFER' }
        : { type: 'PLAY', assetId: item.assetId }],
      source: provider,
    });
  }
  const validated = validateCueProposals(proposed, allLines, current.assets.map(asset => asset.id));
  if (!validated.valid) throw new TypeError('Meta suggestions failed validation: ' + validated.errors.join('; '));
  return normalizeShowProject({ ...current, proposals: [...current.proposals, ...validated.proposals] });
}

/** Resolve an approved-but-unbound cue by choosing an existing audio asset.
 * The approved proposal and its cue change together to preserve source traceability.
 * A missing decoded browser file still prevents GO until explicitly loaded.
 */
export function assignAudioToCue(project, cueId, assetId) {
  const current = normalizeShowProject(project);
  const cue = current.cues.find(item => item.id === cueId);
  if (!cue || !cue.actions.some(action => action.type === 'PLAN_AUDIO')) {
    throw new TypeError('Cue has no unresolved audio');
  }
  if (!current.assets.some(asset => asset.id === assetId)) throw new TypeError('Unknown audio asset');
  if (cue.actions.length !== 1) throw new TypeError('Multi-action cue resolution is not supported yet');
  const parent = current.proposals.find(proposal => proposal.id === cue.sourceProposalId);
  if (!parent || parent.status !== 'APPROVED') throw new TypeError('Approved parent is missing');
  const action = { type: 'PLAY', assetId };
  return normalizeShowProject({
    ...current,
    proposals: current.proposals.map(item => item.id === parent.id ? { ...item, actions: [action] } : item),
    cues: current.cues.map(item => item.id === cueId ? { ...item, actions: [action] } : item),
  });
}

/** Link one locally selected file to a cue without ever starting playback.
 * Used only after the browser has successfully decoded the file.
 * Filename identity reuses an existing library reference (for JSON reloads).
 * The approved parent proposal stays aligned with the cue.
 */
export function linkLocalAudioToCue(project, cueId, fileName) {
  const current = normalizeShowProject(project);
  const cue = current.cues.find(item => item.id === cueId);
  if (!cue || cue.actions.length !== 1 ||
      !['PLAN_AUDIO', 'PLAY'].includes(cue.actions[0].type)) {
    throw new TypeError('Cue cannot accept one local audio file');
  }
  if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > 200) {
    throw new TypeError('Invalid audio filename');
  }
  const matches = current.assets.filter(asset => asset.name === fileName);
  if (matches.length > 1) throw new TypeError('Duplicate audio filename references');
  const withAsset = matches.length ? current : addAudioReference(current, fileName);
  const assetId = matches.length ? matches[0].id : withAsset.assets.at(-1).id;
  const result = cue.actions[0].type === 'PLAN_AUDIO'
    ? assignAudioToCue(withAsset, cueId, assetId)
    : replaceCueAudioAsset(withAsset, cueId, assetId);
  return { project: result, assetId };
}

/** Replace the asset of an existing single-PLAY DRAFT cue.
 * No change to cue number, original source references or playback state.
 */
export function replaceCueAudioAsset(project, cueId, assetId) {
  const current = normalizeShowProject(project);
  const cue = current.cues.find(item => item.id === cueId);
  if (!cue || cue.status !== 'DRAFT' || cue.actions.length !== 1 ||
      cue.actions[0].type !== 'PLAY') {
    throw new TypeError('Cue has no replaceable PLAY action');
  }
  if (!current.assets.some(asset => asset.id === assetId)) throw new TypeError('Unknown audio asset');
  const parent = current.proposals.find(item => item.id === cue.sourceProposalId);
  if (!parent || parent.status !== 'APPROVED') throw new TypeError('Approved parent is missing');
  const action = { type: 'PLAY', assetId };
  return normalizeShowProject({
    ...current,
    proposals: current.proposals.map(item => item.id === parent.id ? { ...item, actions: [action] } : item),
    cues: current.cues.map(item => item.id === cueId ? { ...item, actions: [action] } : item),
  });
}

/** Mark an unresolved cue for later sound design or explicit generation.
 * This records intent only. No provider is called and no credits are consumed.
 */
export function setCueSoundResolution(project, cueId, resolution) {
  const current = normalizeShowProject(project);
  if (!['DEFER', 'GENERATE'].includes(resolution)) throw new TypeError('Unsupported sound resolution');
  const cue = current.cues.find(item => item.id === cueId);
  if (!cue || cue.actions.length !== 1 || cue.actions[0].type !== 'PLAN_AUDIO') {
    throw new TypeError('Cue is not waiting for sound design');
  }
  const action = { ...cue.actions[0], resolution };
  return normalizeShowProject({
    ...current,
    proposals: current.proposals.map(item => item.id === cue.sourceProposalId ? { ...item, actions: [action] } : item),
    cues: current.cues.map(item => item.id === cueId ? { ...item, actions: [action] } : item),
  });
}

export function addMetaProposals(project, suggestions) {
  return addModelProposals(project, suggestions, 'META_MODEL_API');
}

export function decideProposal(project, proposalId, decision) {
  const current = normalizeShowProject(project);
  const proposal = current.proposals.find(p => p.id === proposalId);
  if (!proposal) throw new Error('Proposal does not exist');
  if (proposal.status !== 'PENDING') throw new Error('Proposal already reviewed');
  const cueId = nextAvailableId('cue', current.cues.map(c => c.id));
  const reviewed = reviewCueProposal({
    proposal, decision,
    scriptLines: parseScript(current.scriptText),
    assetIds: current.assets.map(a => a.id),
    existingCues: current.cues, cueId,
    operatorConfirmed: decision === 'APPROVE',
  });
  if (!reviewed.ok) throw new Error(reviewed.error);
  const proposals = current.proposals.map(p => p.id === proposalId ? reviewed.reviewedProposal : p);
  const cues = reviewed.cue ? [...current.cues, reviewed.cue] : current.cues;
  return normalizeShowProject({ ...current, proposals, cues });
}
