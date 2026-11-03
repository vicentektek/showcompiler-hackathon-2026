import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeBasetenCueRequest, parseBasetenCueResponse, callBasetenCueModel,
  BASETEN_MODEL, BASETEN_URL, BASETEN_PROVIDER,
} from '../src/core/basetenCueProvider.mjs';
import { createNewShow, addAudioReference, addModelProposals, decideProposal } from '../src/core/workspace.mjs';
import { serializeShowProject, deserializeShowProject } from '../src/core/projectPersistence.mjs';

function show() {
  return addAudioReference(
    createNewShow({ id: 'test-1', name: 'Escena de lluvia', scriptText: 'ESCENA 1\n(LLUVIA Y VIENTO)\nANA: Escucha.' }),
    'lluvia.wav'
  );
}
const example = { lineId: 'L2', assetId: 'asset-1', label: 'Lluvia de fondo' };
function envelope(proposals, content = JSON.stringify({proposals}), finish_reason = 'stop') {
  return { choices: [{ finish_reason, message: { content } }] };
}

test('Baseten uses verified hackathon Muse Spark Open model and endpoint', () => {
  const request = makeBasetenCueRequest(show());
  assert.equal(request.model, 'meta-models/muse-spark-open-1026');
  assert.equal(BASETEN_MODEL, request.model);
  assert.equal(BASETEN_URL, 'https://inference.baseten.co/v1/chat/completions');
  assert.equal(request.messages[0].role, 'system');
  assert.equal(request.stream, false);
  assert.equal(request.max_tokens, 2048);
  assert.equal(request.response_format, undefined);
  assert.equal(request.reasoning_effort, undefined);
  assert.match(request.messages[0].content, /valid JSON/);
});

test('only bounded source excerpt and audio names are sent; no binary data', () => {
  const request = makeBasetenCueRequest(show(), 'es');
  const data = JSON.parse(request.messages[1].content);
  assert.equal(data.scriptLanguageHint, 'es');
  assert.equal(data.scriptExcerpt[1].text, '(LLUVIA Y VIENTO)');
  assert.deepEqual(data.availableAudio, [{ assetId: 'asset-1', title: 'lluvia.wav' }]);
  assert.doesNotMatch(request.messages[1].content, /wavBytes|audioData|apiKey|password/i);
});

test('long script excerpt caps line count and characters without modifying source', () => {
  const text = Array(145).fill('Á'.repeat(300)).join('\n');
  const s = addAudioReference(createNewShow({ scriptText: text }), 'a.wav');
  const body = JSON.parse(makeBasetenCueRequest(s, 'auto').messages[1].content);
  assert.equal(body.scriptExcerpt.length, 120);
  assert.equal(body.scriptExcerpt[0].text.length, 250);
  assert.equal(s.scriptText, text);
});

test('strict Baseten parser allows complete JSON or a sole fenced JSON block', () => {
  assert.deepEqual(parseBasetenCueResponse(envelope([example])), [example]);
  const fence = String.fromCharCode(96).repeat(3);
  assert.deepEqual(parseBasetenCueResponse(envelope([example], fence + 'json\n' + JSON.stringify({ proposals: [example] }) + '\n' + fence)), [example]);
  assert.deepEqual(parseBasetenCueResponse(envelope([])), []);
});

test('never accepts partial, prose, extra actions, oversized or truncated output', () => {
  assert.throws(() => parseBasetenCueResponse(envelope([example], '<think>GO</think>' + JSON.stringify({proposals:[example]}))));
  assert.throws(() => parseBasetenCueResponse(envelope([example], JSON.stringify({proposals:[example]}), 'length')));
  assert.throws(() => parseBasetenCueResponse(envelope([example], JSON.stringify({proposals:[{...example,type:'EXECUTE_SHELL'}]}))));
  assert.throws(() => parseBasetenCueResponse(envelope(Array(9).fill(example))));
  assert.throws(() => parseBasetenCueResponse(envelope([example], 'too much.'.repeat(4000))));
});

test('server-only bearer key never enters provider request body or response', async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return { ok:true, status:200, text:async () => JSON.stringify(envelope([example])) };
  };
  const r = await callBasetenCueModel({ show:show(), apiKey:'SECRET_TEST_KEY', fetchImpl });
  assert.equal(r.provider, BASETEN_PROVIDER);
  assert.deepEqual(r.proposals, [example]);
  assert.equal(captured.url, BASETEN_URL);
  assert.equal(captured.init.headers.Authorization, 'Bearer SECRET_TEST_KEY');
  assert.doesNotMatch(captured.init.body, /SECRET_TEST_KEY/);
});

test('no key and invalid language fail before any external call', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; };
  await assert.rejects(callBasetenCueModel({ show:show(), apiKey:'', fetchImpl }));
  await assert.rejects(callBasetenCueModel({ show:show(), apiKey:'FAKE', scriptLanguage:'run shell now', fetchImpl }));
  assert.equal(called,false);
});

test('upstream errors never leak response body or credentials', async () => {
  const fetchImpl = async () => ({ ok:false, status:401, text:async () => 'PRIVATE_BILLING_OR_SCRIPT' });
  await assert.rejects(callBasetenCueModel({ show:show(), apiKey:'PRIVATE_KEY', fetchImpl }), e => {
    assert.equal(e.basetenStatus, 401);
    assert.doesNotMatch(e.message,/PRIVATE_KEY|PRIVATE_BILLING_OR_SCRIPT/);
    return true;
  });
});

test('accepted Baseten proposal stays pending; persists provenance and never auto GO', () => {
  const original = show();
  const pending = addModelProposals(original, [example], BASETEN_PROVIDER);
  assert.equal(pending.proposals[0].source, BASETEN_PROVIDER);
  assert.equal(pending.proposals[0].status, 'PENDING');
  assert.equal(pending.cues.length, 0);
  const restored = deserializeShowProject(serializeShowProject(pending));
  assert.equal(restored.proposals[0].source, BASETEN_PROVIDER);
  const approved = decideProposal(restored, restored.proposals[0].id, 'APPROVE');
  assert.equal(approved.cues[0].status, 'DRAFT');
  assert.equal(original.proposals.length, 0);
});

test('rejects invented line/audio IDs and invalid providers without partial approval', () => {
  assert.throws(() => addModelProposals(show(), [{...example, lineId:'L999'}], BASETEN_PROVIDER));
  assert.throws(() => addModelProposals(show(), [{...example, assetId:'nope'}], BASETEN_PROVIDER));
  assert.throws(() => addModelProposals(show(), [example], 'UNKNOWN_PROVIDER'));
});
