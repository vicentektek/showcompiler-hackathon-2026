/**
 * SFX preparation API; kept separate from the Cue Editor and deterministic
 * operator transport. Loopback only, explicit operator POST, no startup jobs.
 */
import { resolve } from 'node:path';
import { createSfxJobStore } from '../src/core/sfxJobStore.mjs';
import {
  prepareAudioGenerationPlan, authorizeAudioGenerationPlan,
} from '../src/core/audioGenerationPlan.mjs';
import { createModalSfxPilotClient } from '../src/core/modalSfxPilotClient.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const routes = /^\/api\/sfx\/jobs\/([A-Za-z0-9][A-Za-z0-9._:-]{0,99})(?:\/(refresh|cancel|review|audio))?$/;
const MAX_BODY = 4096;

function json(response, status, value, headers) {
  response.writeHead(status, {
    ...headers, 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
}
async function bodyJson(request) {
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY) {
      const error = new Error('Input too large'); error.status = 413; throw error;
    }
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!input || Array.isArray(input) || typeof input !== 'object') {
    throw new TypeError('Invalid request object');
  }
  return input;
}
function exactly(value, allowed) {
  return Object.keys(value).every(k => allowed.includes(k));
}
function configuration() {
  return {
    enabled: process.env.RUNQ_SFX_PILOT_ENABLED === '1',
    endpointUrl: process.env.MODAL_SFX_ENDPOINT,
    proxyTokenId: process.env.MODAL_PROXY_TOKEN_ID,
    proxyTokenSecret: process.env.MODAL_PROXY_TOKEN_SECRET,
  };
}
function makeDefaultClient(config) {
  return createModalSfxPilotClient(config);
}

/** Dependency injection makes all endpoint tests entirely free and offline. */
export function makeSfxRoute({
  sfxStore = createSfxJobStore({
    directory: resolve(process.cwd(), '.runq-local', 'sfx-generation'),
  }),
  sfxConfig = configuration,
  sfxPilotClient = null,
} = {}) {
  let busy = false; // One in-flight pilot action per local server.
  return async function handle(request, response, pathname, headers) {
    if (!pathname.startsWith('/api/sfx/')) return false;
    const origin = 'http://127.0.0.1:' + request.socket.localPort;
    if (request.headers.host !== origin.slice('http://'.length)) {
      json(response, 403, { code: 'SFX_ORIGIN' }, headers);
      return true;
    }
    const config = sfxConfig();
    const enabled = config.enabled === true && Boolean(sfxPilotClient ||
      (config.endpointUrl && config.proxyTokenId && config.proxyTokenSecret));
    const configSafe = { enabled, kinds: ['SFX','ENVIRONMENT'],
      model: 'stabilityai/stable-audio-3-small-sfx',
      minDurationSeconds: 1, maxDurationSeconds: 12,
      maxSimultaneousJobs: 1,
      requiresExplicitConfirmation: true,
      manualImportOnly: true,
    };
    if (pathname === '/api/sfx/status') {
      if (request.method !== 'GET') json(response, 405, { code: 'SFX_METHOD' }, headers);
      else json(response, 200, configSafe, headers);
      return true;
    }
    const match = routes.exec(pathname);
    const isStart = pathname === '/api/sfx/jobs' && request.method === 'POST';
    if (!isStart && !match) {
      json(response, 404, { code: 'SFX_NOT_FOUND' }, headers);
      return true;
    }
    const id = match?.[1], operation = match?.[2];
    const method = !match ? 'POST' : operation === undefined || operation === 'audio' ? 'GET' : 'POST';
    if (request.method !== method) {
      json(response, 405, { code: 'SFX_METHOD' }, headers);
      return true;
    }
    if (method === 'POST' && (
      request.headers.origin !== origin ||
      !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] ?? '')
    )) {
      json(response, 403, { code: 'SFX_ORIGIN' }, headers);
      return true;
    }

    if (!isStart && operation === undefined) {
      try {
        const job = await sfxStore.read(id);
        json(response, job ? 200 : 404,
          job ? sfxStore.publicView(job) : { code: 'SFX_NOT_FOUND' }, headers);
      } catch { json(response, 503, { code: 'SFX_STORE' }, headers); }
      return true;
    }
    if (!isStart && operation === 'audio') {
      try {
        const bytes = await sfxStore.wavBytes(id);
        if (!bytes) {
          json(response, 409, { code: 'SFX_NOT_REVIEWABLE' }, headers);
        } else {
          response.writeHead(200, {
            ...headers, 'Cache-Control': 'no-store',
            'Content-Type': 'audio/wav', 'Content-Length': bytes.byteLength,
            'Content-Disposition': 'attachment; filename="runq-sfx-' + id + '.wav"',
          });
          response.end(bytes);
        }
      } catch { json(response, 503, { code: 'SFX_WAV_INTEGRITY' }, headers); }
      return true;
    }
    // All writes require explicit feature flag and same-origin operator intent.
    if (!enabled) {
      json(response, 503, { code: 'SFX_NOT_CONFIGURED' }, headers);
      return true;
    }
    if (busy) {
      json(response, 429, { code: 'SFX_BUSY' }, headers);
      return true;
    }
    busy = true;
    try {
      const input = await bodyJson(request);
      if (isStart) {
        if (!exactly(input, [
          'requestId','authorizationId','sourceLineId','kind','prompt',
          'durationSeconds','seed','confirmed',
        ]) || input.confirmed !== true || !ID.test(input.requestId ?? '') ||
            !ID.test(input.authorizationId ?? '')) {
          throw new TypeError('Explicitly authorized request required');
        }
        const plan = authorizeAudioGenerationPlan(prepareAudioGenerationPlan({
          sourceLineId: input.sourceLineId, kind: input.kind, prompt: input.prompt,
          modelCandidate: 'stabilityai/stable-audio-3-small-sfx',
          durationSeconds: input.durationSeconds,
        }), { confirmed: true, authorizationId: input.authorizationId });
        const client = sfxPilotClient || makeDefaultClient(config);
        const requestData = {
          requestId: input.requestId, authorizationId: input.authorizationId,
          sourceLineId: plan.sourceLineId, kind: plan.kind, prompt: plan.prompt,
          durationSeconds: plan.durationSeconds, modelCandidate: plan.modelCandidate,
          seed: input.seed ?? 42,
        };
        // Reserve BEFORE paid provider submission; duplicates and daily cap fail closed.
        const job = await sfxStore.reserve(requestData, { confirm: true });
        try {
          const result = await client.start(plan, { requestId: job.requestId, seed: requestData.seed });
          const queued = await sfxStore.update(job.requestId, 'QUEUED',
            { remoteJobId: result.jobId });
          json(response, 202, queued, headers);
        } catch {
          // A timeout MAY have created a charged job. Never retry automatically.
          json(response, 502, { code: 'SFX_SUBMISSION_UNKNOWN', requestId: job.requestId }, headers);
        }
        return true;
      }

      const job = await sfxStore.read(id);
      if (!job) {
        json(response, 404, { code: 'SFX_NOT_FOUND' }, headers); return true;
      }
      if (operation === 'review') {
        if (!exactly(input, ['decision']) ||
            !['ACCEPT','REJECT'].includes(input.decision)) {
          throw new TypeError('Invalid SFX review');
        }
        const next = input.decision === 'ACCEPT' ?
          'ACCEPTED_FOR_MANUAL_IMPORT' : 'REJECTED';
        const reviewed = await sfxStore.update(id, next);
        json(response, 200, reviewed, headers);
        return true;
      }
      if (!exactly(input, [])) throw new TypeError('Unexpected SFX request body');
      const internal = job;
      if (operation === 'refresh') {
        if (!['QUEUED','RUNNING','CANCEL_REQUESTED'].includes(job.status)) {
          json(response, 200, sfxStore.publicView(job), headers); return true;
        }
        if (!internal.remoteJobId) throw new TypeError('Unresolved remote job');
        const client = sfxPilotClient || makeDefaultClient(config);
        const remote = await client.status(internal.remoteJobId);
        let updated;
        if (remote.status === 'COMPLETED') {
          const audio = await client.download(internal.remoteJobId);
          // Server-side persistence verifies hash and formats a second time.
          // A provider may return inconsistent status and output: fail closed.
          if (remote.wav?.sha256 !== audio.metadata.sha256) {
            throw new TypeError('SFX audio does not match job metadata');
          }
          updated = await sfxStore.storeWav(id, audio.bytes, audio.metadata);
        } else if (remote.status === 'CANCELLED') {
          updated = await sfxStore.update(id, 'CANCELLED');
        } else if (remote.status === 'FAILED') {
          updated = await sfxStore.update(id, 'FAILED');
        } else if (job.status !== 'CANCEL_REQUESTED' &&
                   ['QUEUED','RUNNING'].includes(remote.status)) {
          updated = await sfxStore.update(id, 'RUNNING');
        } else {
          updated = sfxStore.publicView(job);
        }
        json(response, 200, updated, headers);
        return true;
      }
      if (operation === 'cancel') {
        if (!['QUEUED','RUNNING'].includes(job.status) || !internal.remoteJobId) {
          json(response, 409, { code: 'SFX_NOT_CANCELLABLE' }, headers); return true;
        }
        const client = sfxPilotClient || makeDefaultClient(config);
        await client.cancel(internal.remoteJobId);
        const updated = await sfxStore.update(id, 'CANCEL_REQUESTED');
        json(response, 202, updated, headers);
        return true;
      }
    } catch (error) {
      const status = error?.status === 413 ? 413 :
        ['SFX_DUPLICATE','SFX_TRANSITION'].includes(error?.code) ? 409 :
        error?.code === 'SFX_DAILY_LIMIT' ? 429 :
        error?.code === 'SFX_NOT_FOUND' ? 404 :
        error instanceof TypeError || error instanceof RangeError ? 400 : 503;
      const code = error?.code === 'SFX_DUPLICATE' ? 'SFX_DUPLICATE' :
        error?.code === 'SFX_DAILY_LIMIT' ? 'SFX_DAILY_LIMIT' :
        error?.code === 'SFX_TRANSITION' ? 'SFX_INVALID_STATE' :
        status === 413 ? 'SFX_TOO_LARGE' :
        status === 400 ? 'SFX_INVALID_REQUEST' :
        status === 404 ? 'SFX_NOT_FOUND' : 'SFX_SERVICE';
      json(response, status, { code }, headers);
    } finally { busy = false; }
    return true;
  };
}
