import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeCueAnalysisRequest, parseMetaCueResponse, callMetaCueModel, validateMetaModelId,
} from '../src/core/metaCueProvider.mjs';
import { createNewShow, addAudioReference } from '../src/core/workspace.mjs';

function show(scriptText = 'ESCENA\n(SONIDO DE LLUVIA)\nANA: Escucha') {
  const s = createNewShow({ id: 'test-show', scriptText });
  return addAudioReference(s, 'lluvia.wav');
}
const response = proposals => ({
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ proposals }) } }],
});

test('builds bounded structured Meta API request without audio file content', () => {
  const req = makeCueAnalysisRequest(show());
  assert.equal(req.model, 'muse-spark-1.3');
  assert.equal(req.response_format.type, 'json_schema');
  assert.equal(req.response_format.json_schema.strict, true);
  assert.equal(req.messages[0].role, 'developer');
  assert.equal(req.reasoning_effort, 'low');
  assert.equal(req.max_completion_tokens, 1200);
  const body = JSON.parse(req.messages[1].content);
  assert.equal(body.scriptExcerpt[1].lineId, 'L2');
  assert.deepEqual(body.availableAudio, [{ assetId: 'asset-1', title: 'lluvia.wav' }]);
  assert.doesNotMatch(req.messages[1].content, /audioBuffer|binary|apiKey/);
});

test('caps large scripts to 120 lines and truncates each supplied line', () => {
  const text = Array.from({ length: 200 }, () => 'A'.repeat(300)).join('\n');
  const req = makeCueAnalysisRequest(show(text));
  const body = JSON.parse(req.messages[1].content);
  assert.equal(body.scriptExcerpt.length, 120);
  assert.equal(body.scriptExcerpt[0].text.length, 250);
});

test('model names are an explicit allowlist, not client-controlled URLs', () => {
  assert.equal(validateMetaModelId('muse-spark-1.3'), 'muse-spark-1.3');
  assert.throws(() => validateMetaModelId('https://evil.example'));
  assert.throws(() => validateMetaModelId('other-model'));
});

test('parses valid structured proposals only on completed responses', () => {
  assert.deepEqual(parseMetaCueResponse(response([{ lineId: 'L2', assetId: 'asset-1', label: '  Lluvia  ' }])), [
    { lineId: 'L2', assetId: 'asset-1', label: 'Lluvia' },
  ]);
  assert.throws(() => parseMetaCueResponse({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }), /interrupted/);
});

test('rejects malformed, oversized or command-shaped model output', () => {
  assert.throws(() => parseMetaCueResponse(response([{ lineId: 'L2', assetId: 'asset-1', label: 'GO', command: 'RUN' }])));
  assert.throws(() => parseMetaCueResponse(response(Array.from({ length: 9 }, () => ({ lineId: 'L2', assetId: 'asset-1', label: 'X' })))));
  assert.throws(() => parseMetaCueResponse({ choices: [{ finish_reason: 'stop', message: { content: 'not-json' } }] }));
});

test('calls exact Meta endpoint with server-only bearer key and returns provenance', async () => {
  let request;
  const fetchImpl = async (url, init) => {
    request = { url, init };
    return { ok: true, status: 200, text: async () => JSON.stringify(response([{ lineId: 'L2', assetId: 'asset-1', label: 'Lluvia' }])) };
  };
  const result = await callMetaCueModel({ show: show(), apiKey: 'TEST_SECRET', fetchImpl });
  assert.deepEqual(result.proposals, [{ lineId: 'L2', assetId: 'asset-1', label: 'Lluvia' }]);
  assert.equal(result.provider, 'META_MODEL_API');
  assert.equal(request.url, 'https://api.meta.ai/v1/chat/completions');
  assert.equal(request.init.headers.Authorization, 'Bearer TEST_SECRET');
  assert.equal(request.init.method, 'POST');
  assert.doesNotMatch(request.init.body, /TEST_SECRET/);
});

test('without key it fails closed and never sends a request', async () => {
  let called = false;
  await assert.rejects(callMetaCueModel({ show: show(), apiKey: '', fetchImpl: async () => { called = true; } }), /not configured/);
  assert.equal(called, false);
});

test('remote error never leaks response body or secret', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => 'SECRET IN BODY' });
  await assert.rejects(callMetaCueModel({ show: show(), apiKey: 'TOP_SECRET', fetchImpl }), error => {
    assert.match(error.message, /status 401/);
    assert.doesNotMatch(error.message, /TOP_SECRET|SECRET IN BODY/);
    return true;
  });
});

test('rejects empty script or no asset before model call', () => {
  assert.throws(() => makeCueAnalysisRequest(createNewShow()));
  assert.throws(() => makeCueAnalysisRequest(createNewShow({scriptText:'Hola'})), /referencia de audio/);
});
