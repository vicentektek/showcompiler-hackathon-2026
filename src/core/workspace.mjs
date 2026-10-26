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
    label, sourceLineIds: [lineId], actions: [{ type: 'PLAY', assetId }], source: 'MANUAL_MOCK',
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
  const permittedLines = new Set(allLines.slice(0, 120).map(line => line.id));
  const permittedAssets = new Set(current.assets.slice(0, 80).map(asset => asset.id));
  const proposed = [];
  const usedIds = current.proposals.map(p => p.id);
  for (const item of suggestions) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        !permittedLines.has(item.lineId) || !permittedAssets.has(item.assetId) ||
        typeof item.label !== 'string' || !item.label.trim()) {
      throw new TypeError('Meta suggestion does not match supplied script excerpt or audio list');
    }
    const id = nextAvailableId('proposal', usedIds);
    usedIds.push(id);
    proposed.push({
      id, label: item.label.trim(), sourceLineIds: [item.lineId],
      actions: [{ type: 'PLAY', assetId: item.assetId }],
      source: provider,
    });
  }
  const validated = validateCueProposals(proposed, allLines, current.assets.map(asset => asset.id));
  if (!validated.valid) throw new TypeError('Meta suggestions failed validation: ' + validated.errors.join('; '));
  return normalizeShowProject({ ...current, proposals: [...current.proposals, ...validated.proposals] });
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
