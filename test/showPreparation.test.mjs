import test from 'node:test';
import assert from 'node:assert/strict';
import { planShowAudio, runPreparationQueue, cueSoundIdentity, validateAudioBatch } from '../src/core/showPreparation.mjs';
import { createNewShow, addMockProposal, decideProposal, addAudioReference, assignAudioToCue } from '../src/core/workspace.mjs';

function project() {
  let show = createNewShow({ id: 'batch-show', scriptText: '(A bell rings.)\n(Wind blows.)' });
  for (const lineId of ['L1', 'L2']) {
    show = addMockProposal(show, { lineId, label: lineId === 'L1' ? 'Bell' : 'Wind' });
    show = decideProposal(show, show.proposals.at(-1).id, 'APPROVE');
  }
  return show;
}

test('bulk audio preserves provenance, excludes linked audio and never creates cues', () => {
  let show = project();
  const before = JSON.stringify(show);
  const plan = planShowAudio(show);
  assert.equal(plan.items.length, 2);
  assert.deepEqual(plan.items.map(i => i.draft.sourceLineId), ['L1', 'L2']);
  assert.equal(JSON.stringify(show), before);
  show = addAudioReference(show, 'bell.wav');
  show = assignAudioToCue(show, show.cues[0].id, show.assets[0].id);
  assert.equal(planShowAudio(show).items.length, 1);
  assert.notEqual(cueSoundIdentity(show.cues[0]), plan.items[0].cueIdentity);
});

test('queue is serial, stops on failure, never retries and retains completed work', async () => {
  const calls = [], completed = [];
  await assert.rejects(runPreparationQueue([1, 2, 3], {
    assertCurrent() {},
    async execute(item) { calls.push(item); if (item === 2) throw new Error('HTTP_429'); return item; },
    onComplete(item) { completed.push(item); },
  }), /HTTP_429/);
  assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(completed, [1]);
});

test('cancel and project changes block late results and subsequent requests', async () => {
  const abort = new AbortController(), calls = [], completed = [];
  await assert.rejects(runPreparationQueue([1, 2], {
    signal: abort.signal, assertCurrent() {},
    async execute(item) { calls.push(item); abort.abort(); return item; },
    onComplete(item) { completed.push(item); },
  }), /CANCELLED/);
  assert.deepEqual(calls, [1]);
  assert.deepEqual(completed, []);
  let current = true;
  await assert.rejects(runPreparationQueue([1, 2], {
    assertCurrent() { if (!current) throw new Error('SHOW_CHANGED'); },
    async execute() { current = false; return 1; },
    onComplete() { throw new Error('late result applied'); },
  }), /SHOW_CHANGED/);
});

test('batch requires exact review authorization and respects daily, kind and prompt limits', () => {
  const items = planShowAudio(project()).items;
  const policy = { enabled: true, estimatedMaxCostUsdPerRequest: 0.05, dailyBudgetUsd: 0.5, maxDailyStarts: 10 };
  assert.doesNotThrow(() => validateAudioBatch(items, policy, true));
  assert.throws(() => validateAudioBatch(items, policy, false), /AUTHORIZATION/);
  assert.throws(() => validateAudioBatch(items, { ...policy, estimatedMaxCostUsdPerRequest: NaN }, true), /AUTHORIZATION/);
  assert.throws(() => validateAudioBatch(items, { ...policy, dailyBudgetUsd: 0.05 }, true), /DAILY_CEILING/);
  assert.throws(() => validateAudioBatch(items, { ...policy, maxDailyStarts: 1 }, true), /DAILY_CEILING/);
  for (const draft of [{ ...items[0].draft, kind: 'MUSIC' }, { ...items[0].draft, prompt: 'https://provider.test/' },
    { ...items[0].draft, durationSeconds: 13 }])
    assert.throws(() => validateAudioBatch([{ draft }], policy, true), /PROMPT_INVALID/);
});
