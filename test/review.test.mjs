import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewCueProposal } from '../src/core/review.mjs';
import { validateCueProposals } from '../src/core/proposals.mjs';
import { parseScript } from '../src/core/script.mjs';

const scriptLines = parseScript('ACTO 1\nANA: Adelante\n(MÚSICA)');
const assetIds = ['intro.wav'];
function pending() {
  const generated = [{ id: 'suggestion-1', label: 'Entrada', sourceLineIds: ['L3'], actions: [{ type: 'PLAY', assetId: 'intro.wav' }] }];
  return validateCueProposals(generated, scriptLines, assetIds).proposals[0];
}
function review(overrides = {}) {
  return reviewCueProposal({ proposal: pending(), decision: 'APPROVE', cueId: 'cue-1', operatorConfirmed: true, scriptLines, assetIds, existingCues: [], ...overrides });
}

test('explicit human-approved proposal becomes a draft, not a running cue', () => {
  const result = review();
  assert.equal(result.ok, true);
  assert.equal(result.reviewedProposal.status, 'APPROVED');
  assert.deepEqual(result.cue, {
    id: 'cue-1', number: 1, label: 'Entrada', sourceProposalId: 'suggestion-1',
    sourceLineIds: ['L3'], actions: [{ type: 'PLAY', assetId: 'intro.wav' }], status: 'DRAFT',
  });
});

test('an explicit rejection never creates a cue', () => {
  const result = review({ decision: 'REJECT', operatorConfirmed: false, cueId: undefined });
  assert.equal(result.ok, true);
  assert.equal(result.reviewedProposal.status, 'REJECTED');
  assert.equal(result.cue, null);
});

test('no cue without explicit confirmation', () => {
  const result = review({ operatorConfirmed: false });
  assert.equal(result.ok, false);
  assert.match(result.error, /confirmation/);
});

test('review fails closed on unsupported decision and non-pending status', () => {
  assert.equal(review({ decision: 'EXECUTE' }).ok, false);
  assert.equal(review({ proposal: { ...pending(), status: 'APPROVED' } }).ok, false);
  assert.equal(reviewCueProposal().ok, false);
});

test('review revalidates proposal against current script and assets', () => {
  assert.equal(review({ scriptLines: parseScript('Sin línea L3') }).ok, false);
  assert.equal(review({ assetIds: [] }).ok, false);
  assert.equal(review({ proposal: { ...pending(), actions: [{ type: 'DELETE_FILES' }] } }).ok, false);
});

test('generates next number without modifying existing cues', () => {
  const existing = [{ id: 'cue-old', number: 8, sourceProposalId: 'old-suggestion' }];
  const before = structuredClone(existing);
  const result = review({ existingCues: existing });
  assert.equal(result.ok, true);
  assert.equal(result.cue.number, 9);
  assert.deepEqual(existing, before);
});

test('rejects reuse of cueId and sourceProposalId', () => {
  assert.equal(review({ existingCues: [{ id: 'cue-1', number: 1 }] }).ok, false);
  assert.equal(review({ existingCues: [{ id: 'cue-other', number: 1, sourceProposalId: 'suggestion-1' }] }).ok, false);
});

test('rejects malformed existing cue list and invalid cue IDs', () => {
  assert.equal(review({ existingCues: [{ id: 'a', number: 1 }, { id: 'b', number: 1 }] }).ok, false);
  assert.equal(review({ cueId: '../illegal' }).ok, false);
  assert.equal(review({ cueId: '' }).ok, false);
  assert.equal(review({ existingCues: [null] }).ok, false);
  assert.equal(review({ existingCues: 'not a list' }).ok, false);
});

test('rejects cue number overflow and preserves input objects', () => {
  assert.equal(review({ existingCues: [{ id: 'cue-max', number: 10000 }] }).ok, false);
  const proposal = pending();
  const result = review({ proposal });
  result.cue.actions[0].assetId = 'different.wav';
  result.reviewedProposal.sourceLineIds[0] = 'L1';
  assert.equal(proposal.actions[0].assetId, 'intro.wav');
  assert.equal(proposal.sourceLineIds[0], 'L3');
});
