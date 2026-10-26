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
    label, sourceLineIds: [lineId], actions: [{ type: 'PLAY', assetId }],
  };
  const verified = validateCueProposals([proposal], parseScript(current.scriptText), current.assets.map(a => a.id));
  if (!verified.valid) throw new TypeError(verified.errors.join('; '));
  return normalizeShowProject({ ...current, proposals: [...current.proposals, verified.proposals[0]] });
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
