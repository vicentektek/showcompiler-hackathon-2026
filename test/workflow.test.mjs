import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseScript } from '../src/core/script.mjs';
import { validateCueProposals } from '../src/core/proposals.mjs';
import { reviewCueProposal } from '../src/core/review.mjs';

test('complete simulated script → proposal → human review produces a draft only', () => {
  const script = readFileSync(new URL('../examples/escena-prueba.txt', import.meta.url), 'utf8');
  const lines = parseScript(script);
  assert.equal(lines[1].id, 'L2');
  assert.match(lines[1].text, /Ambiente musical/);
  const assetIds = ['mock-intro.wav'];
  const raw = [{ id: 'mock-1', label: 'Música inicial', sourceLineIds: ['L2'], actions: [{ type: 'PLAY', assetId: 'mock-intro.wav' }] }];
  const checked = validateCueProposals(raw, lines, assetIds);
  assert.equal(checked.valid, true);
  const withoutApproval = reviewCueProposal({ proposal: checked.proposals[0], decision: 'APPROVE', scriptLines: lines, assetIds, cueId: 'cue-demo-1' });
  assert.equal(withoutApproval.ok, false);
  const reviewed = reviewCueProposal({ proposal: checked.proposals[0], decision: 'APPROVE', scriptLines: lines, assetIds, cueId: 'cue-demo-1', operatorConfirmed: true });
  assert.equal(reviewed.ok, true);
  assert.equal(reviewed.cue.status, 'DRAFT');
  assert.equal(reviewed.cue.sourceLineIds[0], 'L2');
  assert.equal(reviewed.cue.actions[0].assetId, 'mock-intro.wav');
});

test('terminal operator explicitly approves example without playback', () => {
  const r = spawnSync(process.execPath, ['tools/review-demo.mjs'], { input: 'APROBAR\n', encoding: 'utf8', cwd: new URL('..', import.meta.url) });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /"status"\s*:\s*"DRAFT"/);
  assert.match(r.stdout, /No se ha ejecutado ninguna orden de audio/);
});

test('terminal operator can reject without generating cue', () => {
  const r = spawnSync(process.execPath, ['tools/review-demo.mjs'], { input: 'RECHAZAR\n', encoding: 'utf8', cwd: new URL('..', import.meta.url) });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /"decision"\s*:\s*"REJECTED"/);
  assert.match(r.stdout, /"cue"\s*:\s*null/);
});
