import { validateCueProposals } from './proposals.mjs';

const MAX_CUE_NUMBER = 10_000;
const CUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const failure = (error) => ({ ok: false, error, reviewedProposal: null, cue: null });

/**
 * Pure, non-executing transition from an untrusted AI suggestion to a reviewed
 * proposal and, on explicit approval, a DRAFT cue.
 *
 * The UI must pass operatorConfirmed=true ONLY from an actual operator action.
 * This function cannot establish the human identity or trigger audio playback.
 */
export function reviewCueProposal({
  proposal,
  decision,
  scriptLines,
  assetIds,
  existingCues = [],
  cueId,
  operatorConfirmed = false,
} = {}) {
  if (decision !== 'APPROVE' && decision !== 'REJECT') {
    return failure('Decision must be APPROVE or REJECT');
  }
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal) || proposal.status !== 'PENDING') {
    return failure('Only pending proposals can be reviewed');
  }
  if (!Array.isArray(existingCues)) return failure('Existing cues must be an array');

  // Validate again at the final trust boundary: do not rely on a UI's prior check.
  const validation = validateCueProposals([proposal], scriptLines, assetIds);
  if (!validation.valid || validation.proposals.length !== 1) {
    return failure('Proposal failed validation: ' + validation.errors.join('; '));
  }
  const safeProposal = validation.proposals[0];
  if (decision === 'REJECT') {
    return {
      ok: true,
      error: null,
      reviewedProposal: { ...safeProposal, status: 'REJECTED' },
      cue: null,
    };
  }

  if (operatorConfirmed !== true) return failure('Explicit operator confirmation is required');
  if (typeof cueId !== 'string' || !CUE_ID_PATTERN.test(cueId)) {
    return failure('A valid, explicit cueId is required');
  }
  if (existingCues.length >= MAX_CUE_NUMBER) return failure('Maximum cue count exceeded');

  let highestNumber = 0;
  const cueIds = new Set();
  const cueNumbers = new Set();
  const proposalIds = new Set();
  for (const existing of existingCues) {
    if (!existing || typeof existing !== 'object' || Array.isArray(existing) ||
        typeof existing.id !== 'string' || !CUE_ID_PATTERN.test(existing.id) ||
        !Number.isSafeInteger(existing.number) || existing.number < 1 || existing.number > MAX_CUE_NUMBER ||
        cueIds.has(existing.id) || cueNumbers.has(existing.number)) {
      return failure('Existing cue list is invalid or contains duplicates');
    }
    cueIds.add(existing.id);
    cueNumbers.add(existing.number);
    if (existing.sourceProposalId !== undefined) {
      if (typeof existing.sourceProposalId !== 'string' || proposalIds.has(existing.sourceProposalId)) {
        return failure('Existing cues contain invalid or duplicate proposal references');
      }
      proposalIds.add(existing.sourceProposalId);
    }
    highestNumber = Math.max(highestNumber, existing.number);
  }
  if (cueIds.has(cueId)) return failure('Cue identifier already exists');
  if (proposalIds.has(safeProposal.id)) return failure('This proposal was already converted into a cue');
  if (highestNumber >= MAX_CUE_NUMBER) return failure('Cue numbering limit reached');

  return {
    ok: true,
    error: null,
    reviewedProposal: { ...safeProposal, status: 'APPROVED' },
    cue: {
      id: cueId,
      number: highestNumber + 1,
      label: safeProposal.label,
      sourceProposalId: safeProposal.id,
      sourceLineIds: [...safeProposal.sourceLineIds],
      actions: safeProposal.actions.map((action) => ({ ...action })),
      status: 'DRAFT',
    },
  };
}
