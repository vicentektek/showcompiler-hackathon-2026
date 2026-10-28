/**
 * Server-only, opt-in SFX pilot transport. Never import into browser UI or GO/STOP.
 * No hidden retries, provider fallback, cue mutation or automatic import.
 */
import { createHash } from 'node:crypto';

const MODEL = 'stabilityai/stable-audio-3-small-sfx';
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const STATES = new Set(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']);
const MAX_WAV_BYTES = 4 * 1024 * 1024;

function validId(value, name) {
  if (typeof value !== 'string' || !ID.test(value)) throw new TypeError('Invalid ' + name);
  return value;
}

export function buildSfxPilotRequest(plan, { requestId, seed = 42 } = {}) {
  if (!plan || plan.phase !== 'PREPARATION_ONLY' ||
      plan.status !== 'AUTHORIZED_FOR_ONE_GENERATION' ||
      !['SFX', 'ENVIRONMENT'].includes(plan.kind) ||
      plan.modelCandidate !== MODEL ||
      plan.automaticSubmission !== false ||
      !plan.authorization || plan.authorization.scope !== 'ONE_GENERATION_REQUEST') {
    throw new TypeError('Pilot requires an explicitly authorized SFX or environment plan');
  }
  validId(plan.authorization.id, 'authorization ID');
  if (plan.sourceLineId !== null) validId(plan.sourceLineId, 'source line');
  validId(requestId, 'request ID');
  if (typeof plan.prompt !== 'string' || !plan.prompt.trim() ||
      plan.prompt.length > 1000 || /(?:https?|data|file):/i.test(plan.prompt)) {
    throw new TypeError('Invalid SFX prompt');
  }
  if (!Number.isInteger(plan.durationSeconds) ||
      plan.durationSeconds < 1 || plan.durationSeconds > 12) {
    throw new RangeError('Pilot duration must be between 1 and 12 seconds');
  }
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647) {
    throw new RangeError('Invalid seed');
  }
  return Object.freeze({
    requestId, authorizationId: plan.authorization.id,
    // The current Modal pilot contract requires an identifier. UNBOUND is a
    // transport-only sentinel; the durable local provenance remains null.
    sourceLineId: plan.sourceLineId ?? 'UNBOUND', kind: plan.kind,
    modelCandidate: MODEL, prompt: plan.prompt.trim(),
    durationSeconds: plan.durationSeconds, seed,
  });
}

export function inspectPcm16Wav(bytes) {
  const data = Buffer.from(bytes);
  if (data.length < 44 || data.length > MAX_WAV_BYTES ||
      data.toString('ascii', 0, 4) !== 'RIFF' ||
      data.toString('ascii', 8, 12) !== 'WAVE' ||
      data.readUInt32LE(4) + 8 !== data.length) {
    throw new TypeError('Invalid RIFF/WAVE envelope');
  }
  let format = null;
  let dataLength = null;
  for (let offset = 12; offset + 8 <= data.length;) {
    const tag = data.toString('ascii', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const begin = offset + 8;
    if (size > data.length - begin) throw new TypeError('Invalid WAV chunk length');
    if (tag === 'fmt ' && format === null) {
      if (size < 16) throw new TypeError('Missing PCM format details');
      format = {
        codec: data.readUInt16LE(begin),
        channels: data.readUInt16LE(begin + 2),
        sampleRateHz: data.readUInt32LE(begin + 4),
        byteRate: data.readUInt32LE(begin + 8),
        blockAlign: data.readUInt16LE(begin + 12),
        bits: data.readUInt16LE(begin + 14),
      };
    }
    if (tag === 'data' && dataLength === null) dataLength = size;
    offset = begin + size + (size % 2);
  }
  if (!format || dataLength === null || format.codec !== 1 || format.bits !== 16 ||
      format.channels < 1 || format.channels > 2 ||
      format.sampleRateHz < 16000 || format.sampleRateHz > 96000 ||
      format.blockAlign !== format.channels * 2 ||
      format.byteRate !== format.sampleRateHz * format.blockAlign ||
      dataLength <= 0 || dataLength % format.blockAlign !== 0) {
    throw new TypeError('Unsupported or malformed PCM16 WAV');
  }
  const durationSeconds = dataLength / format.byteRate;
  if (!(durationSeconds > 0 && durationSeconds <= 13)) {
    throw new RangeError('Unexpected pilot audio duration');
  }
  return Object.freeze({
    sha256: createHash('sha256').update(data).digest('hex'),
    byteLength: data.length, sampleRateHz: format.sampleRateHz,
    channels: format.channels, durationSeconds,
  });
}

export function createModalSfxPilotClient({
  endpointUrl, proxyTokenId, proxyTokenSecret,
  fetchImpl = globalThis.fetch, timeoutMs = 30000,
} = {}) {
  const u = new URL(endpointUrl);
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.modal.run') ||
      u.username || u.password || u.port || u.search || u.hash ||
      (u.pathname !== '/' && u.pathname !== '')) {
    throw new TypeError('Endpoint must be an HTTPS Modal web-function root');
  }
  if (typeof proxyTokenId !== 'string' || !/^wk-[A-Za-z0-9_-]+$/.test(proxyTokenId) ||
      typeof proxyTokenSecret !== 'string' ||
      !/^ws-[A-Za-z0-9_-]+$/.test(proxyTokenSecret)) {
    throw new TypeError('Modal proxy credentials must stay on the server');
  }
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) ||
      timeoutMs < 1000 || timeoutMs > 120000) throw new TypeError('Invalid client settings');

  const usedAuthorizationIds = new Set();
  const baseUrl = u.origin;

  async function request(path, method = 'GET', body = undefined, binary = false) {
    const headers = { 'Modal-Key': proxyTokenId, 'Modal-Secret': proxyTokenSecret };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetchImpl(baseUrl + path, {
        method, headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
    } catch {
      throw new Error('Modal pilot request failed; status unknown, do not retry automatically');
    }
    if (!response.ok) {
      throw new Error('Modal pilot returned HTTP ' + response.status + '; do not retry automatically');
    }
    if (binary) {
      const size = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(size) && size > MAX_WAV_BYTES) throw new Error('WAV exceeds pilot limit');
      const bytes = Buffer.from(await response.arrayBuffer());
      return { bytes, metadata: inspectPcm16Wav(bytes) };
    }
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new TypeError('Invalid Modal pilot JSON response');
    }
    return data;
  }

  return Object.freeze({
    async start(plan, options) {
      const payload = buildSfxPilotRequest(plan, options);
      if (usedAuthorizationIds.has(payload.authorizationId)) {
        throw new Error('Authorization already consumed; no automatic resubmission');
      }
      // Consume before network request: a timeout may still have started a billable job.
      usedAuthorizationIds.add(payload.authorizationId);
      const result = await request('/jobs', 'POST', payload);
      validId(result.jobId, 'Modal job ID');
      if (result.status !== 'QUEUED') throw new TypeError('Invalid Modal creation status');
      return Object.freeze({
        jobId: result.jobId, status: 'QUEUED', requestId: payload.requestId,
        authorizationId: payload.authorizationId,
      });
    },
    async status(jobId) {
      const result = await request('/jobs/' + encodeURIComponent(validId(jobId, 'job ID')));
      if (!STATES.has(result.status) || result.jobId !== jobId) {
        throw new TypeError('Invalid Modal job status');
      }
      if (result.status === 'COMPLETED' && (!result.wav ||
          !/^[a-f0-9]{64}$/.test(result.wav.sha256 ?? '') ||
          result.wav.channels < 1 || result.wav.channels > 2 ||
          !Number.isFinite(result.wav.durationSeconds))) {
        throw new TypeError('Invalid completed WAV metadata');
      }
      return Object.freeze(result);
    },
    async download(jobId) {
      return request('/jobs/' + encodeURIComponent(validId(jobId, 'job ID')) + '/audio', 'GET', undefined, true);
    },
    async cancel(jobId) {
      const result = await request('/jobs/' + encodeURIComponent(validId(jobId, 'job ID')) + '/cancel', 'POST');
      if (result.jobId !== jobId || result.status !== 'CANCEL_REQUESTED') {
        throw new TypeError('Invalid cancel response');
      }
      return Object.freeze(result);
    },
  });
}
