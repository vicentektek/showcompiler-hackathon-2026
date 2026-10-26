import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeCueAnalysisRequest, parseMetaCueResponse, callMetaCueModel, validateMetaModelId,
  MetaProviderError,
} from '../src/core/metaCueProvider.mjs';
import { createNewShow, addAudioReference } from '../src/core/workspace.mjs';

function show(scriptText = 'ESCENA\n(SONIDO DE LLUVIA)\nANA: Escucha') {
  const s = createNewShow({ id: 'test-show', scriptText });
  return addAudioReference(s, 'lluvia.wav');
}
const response = proposals => ({
  id: 'chatcmpl-test',
  choices: [{
    index: 0,
    finish_reason: 'stop',
    message: { role: 'assistant', content: JSON.stringify({ proposals }), refusal: null },
  }],
  usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
});
const bound = (overrides = {}) => ({
  lineId: 'L2',
  assetId: 'asset-1',
  label: 'Lluvia',
  soundPrompt: 'Fine exterior rain, soft and steady, seamless loop, no voices.',
  ...overrides,
});

test('builds bounded structured Meta API request without audio file content', () => {
  const req = makeCueAnalysisRequest(show());
  assert.equal(req.model, 'muse-spark-1.3');
  assert.equal(req.response_format.type, 'json_schema');
  assert.equal(req.response_format.json_schema.strict, true);
  assert.equal(req.messages[0].role, 'developer');
  assert.equal(req.reasoning_effort, 'low');
  assert.equal(req.max_completion_tokens, 4096);
  assert.equal(req.stream, false);
  assert.equal(req.store, false);
  const body = JSON.parse(req.messages[1].content);
  assert.equal(body.scriptExcerpt[1].lineId, 'L2');
  assert.deepEqual(body.availableAudio, [{ assetId: 'asset-1', title: 'lluvia.wav' }]);
  const schema = req.response_format.json_schema.schema;
  assert.equal(schema.properties.proposals.maxItems, 8);
  assert.deepEqual(schema.properties.proposals.items.required, ['lineId', 'assetId', 'label', 'soundPrompt']);
  assert.deepEqual(schema.properties.proposals.items.properties.lineId.enum, ['L1', 'L2', 'L3']);
  assert.deepEqual(schema.properties.proposals.items.properties.assetId.anyOf[0].enum, ['asset-1']);
  assert.doesNotMatch(req.messages[1].content, /audioBuffer|binary|apiKey/);
});

test('zero-asset strict schema permits only null assetId', () => {
  const request = makeCueAnalysisRequest(createNewShow({ scriptText: 'SCENE\n(Bell rings)' }));
  const assetSchema = request.response_format.json_schema.schema
    .properties.proposals.items.properties.assetId;
  assert.deepEqual(assetSchema, { type: 'null' });
});

test('caps large scripts to 120 lines and truncates each supplied line', () => {
  const text = Array.from({ length: 200 }, () => 'A'.repeat(300)).join('\n');
  const req = makeCueAnalysisRequest(show(text));
  const body = JSON.parse(req.messages[1].content);
  assert.equal(body.scriptExcerpt.length, 120);
  assert.equal(body.scriptExcerpt[0].text.length, 250);
});

test('model infers script language by default, independent from English UI', () => {
  const text = 'シーン 1\n(雨の音)\n声: 始めよう';
  const req = makeCueAnalysisRequest(show(text));
  const body = JSON.parse(req.messages[1].content);
  assert.equal(body.scriptLanguageHint, 'auto');
  assert.equal(body.scriptExcerpt[1].text, '(雨の音)');
  assert.match(req.messages[0].content, /do not translate/i);
});

test('explicit BCP47 hint guides cue labels without modifying original source', () => {
  const text = 'SCÈNE UNE\n(On entend la pluie)';
  const before = show(text);
  const req = makeCueAnalysisRequest(before, 'muse-spark-1.3', 'fr-FR');
  const body = JSON.parse(req.messages[1].content);
  assert.equal(body.scriptLanguageHint, 'fr-FR');
  assert.equal(before.scriptText, text);
  assert.throws(() => makeCueAnalysisRequest(before, 'muse-spark-1.3', '<ignore>'), TypeError);
});

test('model names are an explicit allowlist, not client-controlled URLs', () => {
  assert.equal(validateMetaModelId('muse-spark-1.3'), 'muse-spark-1.3');
  assert.throws(() => validateMetaModelId('https://evil.example'));
  assert.throws(() => validateMetaModelId('other-model'));
});

test('parses valid structured proposals only on completed responses', () => {
  assert.deepEqual(parseMetaCueResponse(response([bound({ label: '  Lluvia  ', soundPrompt: '  Rain loop  ' })])), [
    { lineId: 'L2', assetId: 'asset-1', label: 'Lluvia', soundPrompt: 'Rain loop' },
  ]);
  assert.throws(() => parseMetaCueResponse({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }), error => error.safeReason === 'TRUNCATED');
});

test('rejects malformed, oversized or command-shaped model output', () => {
  assert.throws(() => parseMetaCueResponse(response([{ ...bound(), command: 'RUN' }])));
  assert.throws(() => parseMetaCueResponse(response(Array.from({ length: 9 }, () => bound()))));
  assert.throws(() => parseMetaCueResponse({ choices: [{ finish_reason: 'stop', message: { content: 'not-json' } }] }));
});

test('strict local parser requires a valid soundPrompt, including for null assets', () => {
  const valid = { lineId: 'L2', assetId: null, label: 'Campana', soundPrompt: 'Single distant bell with a natural decay.' };
  assert.deepEqual(parseMetaCueResponse(response([valid])), [valid]);
  for (const soundPrompt of [undefined, '', ' '.repeat(3), 'x'.repeat(501)]) {
    const item = { ...valid };
    if (soundPrompt === undefined) delete item.soundPrompt;
    else item.soundPrompt = soundPrompt;
    assert.throws(() => parseMetaCueResponse(response([item])), error => error.safeReason === 'SCHEMA');
  }
});

test('distinguishes truncation, refusal, unexpected finish and envelope incompatibility', () => {
  const message = { content: JSON.stringify({ proposals: [] }), refusal: null };
  assert.throws(() => parseMetaCueResponse({ choices: [{ finish_reason: 'length', message }] }), error =>
    error.safeReason === 'TRUNCATED' && error.diagnostic.phase === 'MODEL_FINISH');
  assert.throws(() => parseMetaCueResponse({ choices: [{ finish_reason: 'content_filter', message }] }), error =>
    error.safeReason === 'REFUSED');
  assert.throws(() => parseMetaCueResponse({ choices: [{ finish_reason: 'stop', message: { ...message, refusal: 'blocked' } }] }), error =>
    error.safeReason === 'REFUSED');
  assert.throws(() => parseMetaCueResponse({ choices: [{ finish_reason: 'tool_calls', message }] }), error =>
    error.safeReason === 'FINISH_REASON');
  assert.throws(() => parseMetaCueResponse({ choices: [] }), error =>
    error.safeReason === 'ENVELOPE' && error.diagnostic.phase === 'UPSTREAM_ENVELOPE');
});

test('calls exact Meta endpoint with server-only bearer key and returns provenance', async () => {
  let request;
  const fetchImpl = async (url, init) => {
    request = { url, init };
    return { ok: true, status: 200, text: async () => JSON.stringify(response([bound()])) };
  };
  const result = await callMetaCueModel({
    show: show(), apiKey: 'TEST_SECRET', fetchImpl, requestId: 'meta-contract-test', now: () => 100,
    analysisMode: 'SMOKE',
  });
  assert.deepEqual(result.proposals, [bound()]);
  assert.equal(result.provider, 'META_MODEL_API');
  assert.deepEqual(result.diagnostics, {
    requestId: 'meta-contract-test',
    phase: 'COMPLETE',
    code: 'OK',
    finishReason: 'stop',
    durationMs: 0,
    usage: { promptTokens: 40, completionTokens: 20, totalTokens: 60 },
  });
  assert.equal(request.url, 'https://api.meta.ai/v1/chat/completions');
  assert.equal(request.init.headers.Authorization, 'Bearer TEST_SECRET');
  assert.equal(request.init.method, 'POST');
  assert.doesNotMatch(request.init.body, /TEST_SECRET/);
});

test('default call uses scene-aware V2 and returns transient coverage/details only', async () => {
  let request;
  const proposal = {
    windowId: 'S1-W1',
    sourceLineId: 'L2',
    sourceEvidence: '(SONIDO DE LLUVIA)',
    cueKind: 'AMBIENCE',
    basis: 'EXPLICIT',
    transport: 'PLAY',
    label: 'Lluvia',
    soundPrompt: 'Lluvia exterior fina, evolución suave, bucle sin costura, sin voces ni música.',
    assetId: null,
    trigger: 'ON_LINE',
    durationSeconds: 60,
    loop: true,
    fadeInSeconds: 2,
    fadeOutSeconds: 3,
    confidence: 0.95,
    reason: 'La acotación pide lluvia de forma explícita.',
  };
  const fetchImpl = async (url, init) => {
    request = { url, init };
    return { ok: true, status: 200, text: async () => JSON.stringify(response([proposal])) };
  };
  const result = await callMetaCueModel({
    show: createNewShow({ scriptText: 'ESCENA 1\n(SONIDO DE LLUVIA)\nANA: Escucha' }),
    apiKey: 'TEST_SECRET',
    fetchImpl,
    requestId: 'meta-theatre-test',
  });
  assert.deepEqual(result.proposals, [{
    lineId: 'L2', assetId: null, label: 'Lluvia', soundPrompt: proposal.soundPrompt,
  }]);
  assert.equal(result.details[0].basis, 'EXPLICIT');
  assert.equal(result.details[0].cueKind, 'AMBIENCE');
  assert.deepEqual(result.observations, []);
  assert.equal(result.duplicatesRemoved, 0);
  assert.equal(result.coverage.complete, true);
  assert.deepEqual(result.coverage.analyzedLineIds, ['L1', 'L2', 'L3']);
  const sent = JSON.parse(request.init.body);
  assert.equal(sent.response_format.json_schema.name, 'showcompiler_theatre_cue_suggestions_v2');
  assert.match(sent.messages[0].content, /dialogue|mentioning/i);
  assert.doesNotMatch(request.init.body, /TEST_SECRET/);
});

test('V2 semantic evidence failure has a local semantic diagnostic', async () => {
  const bad = {
    windowId: 'S1-W1', sourceLineId: 'L2', sourceEvidence: 'invented evidence',
    cueKind: 'FX', basis: 'EXPLICIT', transport: 'PLAY', label: 'Rain',
    soundPrompt: 'Rain', assetId: null, trigger: 'ON_LINE', durationSeconds: 2,
    loop: false, fadeInSeconds: 0, fadeOutSeconds: 0, confidence: 0.9, reason: 'Explicit.',
  };
  await assert.rejects(callMetaCueModel({
    show: createNewShow({ scriptText: 'SCENE 1\n(Rain starts)' }),
    apiKey: 'TEST_SECRET',
    requestId: 'meta-semantic-test',
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(response([bad])) }),
  }), error => error.safeReason === 'SEMANTIC' && error.diagnostic.phase === 'LOCAL_SEMANTIC_VALIDATION');
});

test('without key it fails closed and never sends a request', async () => {
  let called = false;
  await assert.rejects(callMetaCueModel({ show: show(), apiKey: '', fetchImpl: async () => { called = true; } }), /not configured/);
  assert.equal(called, false);
});

test('remote error never leaks response body or secret', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => 'SECRET IN BODY' });
  await assert.rejects(callMetaCueModel({ show: show(), apiKey: 'TOP_SECRET', fetchImpl }), error => {
    assert.ok(error instanceof MetaProviderError);
    assert.equal(error.safeCode, 'HTTP_FAILURE');
    assert.equal(error.diagnostic.phase, 'UPSTREAM_HTTP');
    assert.equal(error.diagnostic.upstreamStatus, 401);
    assert.doesNotMatch(JSON.stringify(error.diagnostic), /TOP_SECRET|SECRET IN BODY/);
    return true;
  });
});

test('sanitizes official 400 schema diagnostics without exposing upstream messages', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 400,
    text: async () => JSON.stringify({
      error: {
        message: 'PRIVATE SCRIPT AND SECRET',
        type: 'invalid_request_error',
        param: 'response_format.json_schema',
        code: 'invalid_json_schema',
      },
    }),
  });
  await assert.rejects(callMetaCueModel({
    show: show(), apiKey: 'TOP_SECRET', fetchImpl, requestId: 'meta-schema-test',
  }), error => {
    assert.equal(error.safeCode, 'SCHEMA_INCOMPATIBLE');
    assert.equal(error.diagnostic.phase, 'SCHEMA_INCOMPATIBILITY');
    assert.deepEqual(error.diagnostic.providerError, {
      type: 'invalid_request_error',
      param: 'response_format.json_schema',
      code: 'invalid_json_schema',
    });
    assert.doesNotMatch(JSON.stringify(error.diagnostic), /PRIVATE|SECRET/);
    return true;
  });
});

test('classifies provider HTTP failures deterministically and never retries', async () => {
  for (const status of [400, 401, 402, 403, 404, 429, 500, 503, 504]) {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return { ok: false, status, text: async () => '{"error":{"message":"PRIVATE"}}' };
    };
    await assert.rejects(callMetaCueModel({
      show: show(), apiKey: 'TEST_SECRET', fetchImpl, requestId: `meta-http-${status}`,
    }), error => error.safeCode === 'HTTP_FAILURE' && error.diagnostic.upstreamStatus === status);
    assert.equal(calls, 1);
  }
});

test('classifies local timeout and transport failures separately with one attempt', async () => {
  for (const [name, expectedCode, expectedPhase] of [
    ['TimeoutError', 'TIMEOUT', 'UPSTREAM_TIMEOUT'],
    ['TypeError', 'TRANSPORT', 'UPSTREAM_TRANSPORT'],
  ]) {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      const error = new Error('PRIVATE SCRIPT TRANSPORT DETAIL');
      error.name = name;
      throw error;
    };
    await assert.rejects(callMetaCueModel({
      show: show(), apiKey: 'TEST_SECRET', fetchImpl, requestId: `meta-${expectedCode.toLowerCase()}`,
    }), error => {
      assert.equal(error.safeCode, expectedCode);
      assert.equal(error.diagnostic.phase, expectedPhase);
      assert.doesNotMatch(JSON.stringify(error.diagnostic), /PRIVATE|SCRIPT/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('malformed or oversized successful HTTP envelopes have a distinct safe category', async () => {
  for (const text of ['{"choices":', 'x'.repeat(100_001)]) {
    await assert.rejects(callMetaCueModel({
      show: show(), apiKey: 'TEST_SECRET', requestId: 'meta-envelope-test',
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => text }),
    }), error => error.safeCode === 'ENVELOPE' && error.diagnostic.phase === 'UPSTREAM_ENVELOPE');
  }
});

test('rejects empty scripts but allows analysing a script without audio assets', () => {
  assert.throws(() => makeCueAnalysisRequest(createNewShow()));
  const request = makeCueAnalysisRequest(createNewShow({scriptText:'Hola'}));
  const body = JSON.parse(request.messages[1].content);
  assert.deepEqual(body.availableAudio, []);
  assert.equal(body.scriptExcerpt[0].text, 'Hola');
});

test('theatrical prompt guards against false sound triggers and unsafe overproduction', () => {
  const req = makeCueAnalysisRequest(show());
  const developer = req.messages[0].content;
  assert.match(developer, /merely mentioning an object/);
  assert.match(developer, /remember a thunderstorm/);
  assert.match(developer, /continuing ambience/);
  assert.match(developer, /seamless loop/);
  assert.match(developer, /assetId to null/);
  assert.match(developer, /cannot represent STOP/);
  assert.equal(req.max_completion_tokens, 4096);
});
