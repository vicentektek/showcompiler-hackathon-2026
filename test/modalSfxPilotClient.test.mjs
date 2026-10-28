import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSfxPilotRequest, createModalSfxPilotClient, inspectPcm16Wav,
} from '../src/core/modalSfxPilotClient.mjs';
import { prepareAudioGenerationPlan, authorizeAudioGenerationPlan } from '../src/core/audioGenerationPlan.mjs';

function plan(kind = 'SFX', durationSeconds = 3, id = 'auth-1') {
  const draft = prepareAudioGenerationPlan({
    sourceLineId: 'L12', kind,
    modelCandidate: 'stabilityai/stable-audio-3-small-sfx',
    prompt: 'Distant stage thunder, one clear impact, no dialogue',
    durationSeconds,
  });
  return authorizeAudioGenerationPlan(draft, {
    confirmed: true, authorizationId: id,
  });
}

function wav({ sampleRateHz = 16000, channels = 1, seconds = 1 } = {}) {
  const pcmBytes = sampleRateHz * channels * seconds * 2;
  const b = Buffer.alloc(44 + pcmBytes);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(sampleRateHz, 24);
  b.writeUInt32LE(sampleRateHz * channels * 2, 28);
  b.writeUInt16LE(channels * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(pcmBytes, 40);
  return b;
}

function mockResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => data,
    arrayBuffer: async () => data,
  };
}

function client(fetchImpl) {
  return createModalSfxPilotClient({
    endpointUrl: 'https://runq--sfx-pilot.modal.run',
    proxyTokenId: 'wk-test-id', proxyTokenSecret: 'ws-test-secret',
    fetchImpl,
  });
}

test('one explicit authorization creates one SFX pilot payload with provenance', () => {
  const payload = buildSfxPilotRequest(plan(), { requestId: 'request-1', seed: 17 });
  assert.deepEqual(payload, {
    requestId: 'request-1', authorizationId: 'auth-1', sourceLineId: 'L12',
    kind: 'SFX', modelCandidate: 'stabilityai/stable-audio-3-small-sfx',
    prompt: 'Distant stage thunder, one clear impact, no dialogue',
    durationSeconds: 3, seed: 17,
  });
  assert.equal(Object.hasOwn(payload, 'assetId'), false);
  assert.equal(Object.hasOwn(payload, 'go'), false);
  assert.ok(Object.isFrozen(payload));
});

test('no unauthorized, long, voice or music requests can start SFX pilot', async () => {
  const draft = prepareAudioGenerationPlan({
    sourceLineId: 'L1', kind: 'SFX', prompt: 'Rain', durationSeconds: 2,
    modelCandidate: 'stabilityai/stable-audio-3-small-sfx',
  });
  let calls = 0;
  const pilot = client(async () => { calls++; return mockResponse({}); });
  await assert.rejects(pilot.start(draft, { requestId: 'req-a' }));
  await assert.rejects(pilot.start(plan('ENVIRONMENT', 20), { requestId: 'req-b' }));
  assert.throws(() => buildSfxPilotRequest({
    ...plan(), kind: 'VOICEOVER',
  }, { requestId: 'req-c' }));
  assert.equal(calls, 0);
});

test('start never retries and consumes one authorization even when HTTP outcome is unknown', async () => {
  let calls = 0;
  const pilot = client(async () => { calls++; throw new Error('secret transport detail'); });
  await assert.rejects(pilot.start(plan(), { requestId: 'req-1' }), /do not retry/);
  await assert.rejects(pilot.start(plan(), { requestId: 'req-2' }), /already consumed/);
  assert.equal(calls, 1);
});

test('start uses Modal proxy headers and explicit request; never forwards a key to output', async () => {
  let lastUrl, lastOptions;
  const pilot = client(async (url, options) => {
    lastUrl = url; lastOptions = options;
    return mockResponse({ jobId: 'fc-123', status: 'QUEUED' }, 202);
  });
  const started = await pilot.start(plan(), { requestId: 'req-3', seed: 99 });
  assert.deepEqual(started, {
    jobId: 'fc-123', status: 'QUEUED',
    requestId: 'req-3', authorizationId: 'auth-1',
  });
  assert.equal(lastUrl, 'https://runq--sfx-pilot.modal.run/jobs');
  assert.equal(lastOptions.headers['Modal-Key'], 'wk-test-id');
  assert.equal(lastOptions.headers['Modal-Secret'], 'ws-test-secret');
  assert.equal(lastOptions.redirect, 'error');
  assert.equal(JSON.parse(lastOptions.body).seed, 99);
  assert.equal(JSON.stringify(started).includes('ws-test'), false);
});

test('status and cancellation have separate semantics and never mutate a cue', async () => {
  const pilot = client(async (url, opts) => {
    if (opts.method === 'POST') {
      return mockResponse({ jobId: 'fc-123', status: 'CANCEL_REQUESTED' });
    }
    return mockResponse({ jobId: 'fc-123', status: 'RUNNING' });
  });
  assert.equal((await pilot.status('fc-123')).status, 'RUNNING');
  assert.equal((await pilot.cancel('fc-123')).status, 'CANCEL_REQUESTED');
});

test('validates PCM WAV, hash, and rejects mismatched/unsupported audio', async () => {
  const original = wav();
  const details = inspectPcm16Wav(original);
  assert.equal(details.durationSeconds, 1);
  assert.equal(details.channels, 1);
  assert.equal(details.sampleRateHz, 16000);
  assert.equal(details.sha256.length, 64);
  const damaged = Buffer.from(original);
  damaged.write('RIFX', 0, 'ascii');
  assert.throws(() => inspectPcm16Wav(damaged));
  const badCodec = Buffer.from(original);
  badCodec.writeUInt16LE(3, 20);
  assert.throws(() => inspectPcm16Wav(badCodec));

  const pilot = client(async () => mockResponse(original));
  const result = await pilot.download('fc-123');
  assert.equal(result.metadata.sha256, details.sha256);
  assert.ok(result.bytes.equals(original));
});

test('rejects non-Modal endpoints and forged completion data', async () => {
  assert.throws(() => createModalSfxPilotClient({
    endpointUrl: 'https://not-modal.example', proxyTokenId: 'wk-a',
    proxyTokenSecret: 'ws-b',
  }));
  const pilot = client(async () => mockResponse({
    jobId: 'fc-123', status: 'COMPLETED', wav: { sha256: 'fake' },
  }));
  await assert.rejects(pilot.status('fc-123'), /WAV metadata/);
});
