import test from 'node:test';
import assert from 'node:assert/strict';
import { runMetaSmoke } from '../tools/meta-smoke.mjs';

const validResult = {
  provider: 'META_MODEL_API',
  model: 'muse-spark-1.3',
  proposals: [{
    lineId: 'L2',
    assetId: null,
    label: 'Bell',
    soundPrompt: 'One small dry brass bell strike, close, with a short natural decay.',
  }],
  diagnostics: {
    requestId: 'meta-safe-test',
    phase: 'COMPLETE',
    code: 'OK',
    durationMs: 12,
    finishReason: 'stop',
    usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 },
  },
};

test('smoke test refuses to call Meta without explicit billable authorization', async () => {
  let calls = 0;
  await assert.rejects(runMetaSmoke({
    authorized: false,
    apiKey: 'TEST_ONLY',
    modelClient: async () => { calls += 1; return validResult; },
  }), /authorization/i);
  assert.equal(calls, 0);
});

test('smoke test refuses to call Meta without a key', async () => {
  let calls = 0;
  await assert.rejects(runMetaSmoke({
    authorized: true,
    apiKey: '',
    modelClient: async () => { calls += 1; return validResult; },
  }), /MODEL_API_KEY/);
  assert.equal(calls, 0);
});

test('authorized smoke performs exactly one tiny zero-asset request and returns safe metadata', async () => {
  let calls = 0;
  const result = await runMetaSmoke({
    authorized: true,
    apiKey: 'TEST_ONLY_SECRET',
    modelClient: async request => {
      calls += 1;
      assert.equal(request.model, 'muse-spark-1.3');
      assert.equal(request.scriptLanguage, 'en');
      assert.equal(request.show.assets.length, 0);
      assert.equal(request.show.scriptText.split('\n').length, 3);
      return validResult;
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.proposalCount, 1);
  const printed = JSON.stringify(result);
  assert.doesNotMatch(printed, /TEST_ONLY_SECRET|brass bell|ALEX/);
});

test('smoke fails closed when the one response lacks the expected null-asset proposal', async () => {
  let calls = 0;
  await assert.rejects(runMetaSmoke({
    authorized: true,
    apiKey: 'TEST_ONLY',
    modelClient: async () => { calls += 1; return { ...validResult, proposals: [] }; },
  }), /expected unbound L2/);
  assert.equal(calls, 1);
});
