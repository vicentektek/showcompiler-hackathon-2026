/**
 * SFX preparation API; kept separate from deterministic operator transport.
 * Loopback only, explicit operator POST, no startup jobs or automatic retries.
 */
import { dirname, join } from 'node:path';
import {acquireGlobalSpendLedger,globalLedgerDefaultPath} from '../src/qa/globalSpendLedger.mjs';
import {
  createSfxJobStore, normalizeSfxCostPolicy, normalizeSfxModelRevision,
} from '../src/core/sfxJobStore.mjs';
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
  return Object.keys(value).every(key => allowed.includes(key));
}

function configuration() {
  return {
    enabled: process.env.RUNQ_SFX_PILOT_ENABLED === '1',
    endpointUrl: process.env.MODAL_SFX_ENDPOINT,
    proxyTokenId: process.env.MODAL_PROXY_TOKEN_ID,
    proxyTokenSecret: process.env.MODAL_PROXY_TOKEN_SECRET,
    estimatedMaxCostUsdPerRequest:
      Number(process.env.RUNQ_SFX_ESTIMATED_MAX_COST_USD),
    dailyBudgetUsd: Number(process.env.RUNQ_SFX_DAILY_BUDGET_USD),
    modelRevision: process.env.RUNQ_SFX_MODEL_REVISION || null,
  };
}

function makeDefaultClient(config) {
  return createModalSfxPilotClient(config);
}

async function reserveModalCampaign(input){
  const ledger=await acquireGlobalSpendLedger();
  try{
    const result=await ledger.reserve({
      requestId:'modal-'+input.requestId,runId:'modal-'+input.authorizationId,
      provider:'modal',estimatedMaximumUsd:input.estimatedMaxCostUsdPerRequest,
    });
    if(!result.accepted){
      const error=new Error('Campaign reservation rejected');
      error.code='SFX_CAMPAIGN_'+result.reason;
      throw error;
    }
  }finally{await ledger.close();}
}
function safePolicy(config) {
  try { return normalizeSfxCostPolicy(config); }
  catch { return null; }
}

function safeRevision(config) {
  try {
    const revision = normalizeSfxModelRevision(config.modelRevision);
    // Imported SFX assets require reproducible 40/64-character source SHAs.
    // A missing or free-form revision must not make the pilot appear ready.
    return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision ?? '')
      ? revision : undefined;
  } catch { return undefined; }
}

function sendFailure(response, error, headers) {
  const status = error?.status === 413 ? 413 :
    ['SFX_DUPLICATE','SFX_TRANSITION','SFX_BUDGET_UNKNOWN'].includes(error?.code) ? 409 :
    ['SFX_DAILY_LIMIT','SFX_ACTIVE_LIMIT','SFX_DAILY_BUDGET'].includes(error?.code) ? 429 :
    error?.code === 'SFX_NOT_FOUND' ? 404 :
    error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError ? 400 : 503;
  const code = error?.code === 'SFX_DUPLICATE' ? 'SFX_DUPLICATE' :
    error?.code === 'SFX_DAILY_LIMIT' ? 'SFX_DAILY_LIMIT' :
    error?.code === 'SFX_DAILY_BUDGET' ? 'SFX_DAILY_BUDGET' :
    error?.code === 'SFX_BUDGET_UNKNOWN' ? 'SFX_BUDGET_UNKNOWN' :
    error?.code === 'SFX_ACTIVE_LIMIT' ? 'SFX_ACTIVE_LIMIT' :
    error?.code === 'SFX_TRANSITION' ? 'SFX_INVALID_STATE' :
    /^SFX_CAMPAIGN_(BUDGET_LIMIT|DUPLICATE_ID|PROVIDER_PROHIBITED)$/.test(error?.code??'')
      ? error.code :
    status === 413 ? 'SFX_TOO_LARGE' :
    status === 400 ? 'SFX_INVALID_REQUEST' :
    status === 404 ? 'SFX_NOT_FOUND' : 'SFX_SERVICE';
  json(response, status, { code }, headers);
}

/** Dependency injection keeps every endpoint test free, local and deterministic. */
export function makeSfxRoute({
  sfxStore = createSfxJobStore({
    directory: join(dirname(globalLedgerDefaultPath()), 'shared-modal-jobs-v1'),
  }),
  sfxConfig = configuration,
  sfxPilotClient = null,
  reserveCampaign = reserveModalCampaign,
} = {}) {
  let busy = false; // One in-flight pilot or journal mutation per local server.
  return async function handle(request, response, pathname, headers) {
    if (!pathname.startsWith('/api/sfx/')) return false;
    const origin = 'http://127.0.0.1:' + request.socket.localPort;
    if (request.headers.host !== origin.slice('http://'.length)) {
      json(response, 403, { code: 'SFX_ORIGIN' }, headers);
      return true;
    }

    let config = {};
    try { config = sfxConfig() ?? {}; } catch {}
    const policy = safePolicy(config);
    const revision = safeRevision(config);
    const transportConfigured = Boolean(sfxPilotClient ||
      (config.endpointUrl && config.proxyTokenId && config.proxyTokenSecret));
    const enabled = config.enabled === true && transportConfigured &&
      policy !== null && revision !== undefined;
    const configSafe = {
      enabled,
      kinds: ['SFX','ENVIRONMENT'],
      model: 'stabilityai/stable-audio-3-small-sfx',
      modelRevision: revision ?? null,
      minDurationSeconds: 1,
      maxDurationSeconds: 12,
      maxSimultaneousJobs: 1,
      requiresExplicitConfirmation: true,
      requiresExactCostAcknowledgement: true,
      estimatedMaxCostUsdPerRequest:
        policy?.estimatedMaxCostUsdPerRequest ?? null,
      dailyBudgetUsd: policy?.dailyBudgetUsd ?? null,
      actualBillingStatus: 'UNKNOWN',
      manualImportOnly: true,
      // Diagnostic flags contain no credentials or provider addresses.
      // They let the UI explain a disabled button without requiring users
      // to disclose .env files or guess which setting is missing.
      configurationChecks: {
        pilotEnabled: config.enabled === true,
        endpointConfigured: Boolean(config.endpointUrl),
        proxyTokenIdConfigured: Boolean(config.proxyTokenId),
        proxyTokenSecretConfigured: Boolean(config.proxyTokenSecret),
        costPolicyValid: policy !== null,
        modelRevisionValid: revision !== undefined,
      },
    };

    if (pathname === '/api/sfx/status') {
      if (request.method !== 'GET') json(response, 405, { code: 'SFX_METHOD' }, headers);
      else json(response, 200, configSafe, headers);
      return true;
    }

    if (pathname === '/api/sfx/jobs' && request.method === 'GET') {
      try { json(response, 200, await sfxStore.list({ limit: 50 }), headers); }
      catch (error) { sendFailure(response, error, headers); }
      return true;
    }
    if (pathname === '/api/sfx/jobs' && request.method !== 'POST') {
      json(response, 405, { code: 'SFX_METHOD' }, headers);
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

    // These reads are always local and remain available with the provider off.
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

    // Review is a local human decision. It must not depend on provider state.
    if (!isStart && operation === 'review') {
      if (busy) {
        json(response, 429, { code: 'SFX_BUSY' }, headers);
        return true;
      }
      busy = true;
      try {
        const input = await bodyJson(request);
        if (!exactly(input, ['decision']) || !['ACCEPT','REJECT'].includes(input.decision)) {
          throw new TypeError('Invalid SFX review');
        }
        const job = await sfxStore.read(id);
        if (!job) {
          const error = new Error('SFX job not found'); error.code = 'SFX_NOT_FOUND'; throw error;
        }
        const next = input.decision === 'ACCEPT'
          ? 'ACCEPTED_FOR_MANUAL_IMPORT' : 'REJECTED';
        json(response, 200, await sfxStore.update(id, next), headers);
      } catch (error) {
        sendFailure(response, error, headers);
      } finally { busy = false; }
      return true;
    }

    // Start, refresh and cancellation can touch Modal and therefore fail closed.
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
          'durationSeconds','seed','confirmed','acknowledgedMaxCostUsd',
        ]) || input.confirmed !== true || !ID.test(input.requestId ?? '') ||
            !ID.test(input.authorizationId ?? '')) {
          throw new TypeError('Explicitly authorized request required');
        }
        const acknowledgedPolicy = normalizeSfxCostPolicy({
          ...policy,
          acknowledgedMaxCostUsd: input.acknowledgedMaxCostUsd,
        }, { requireAcknowledgement: true });
        const plan = authorizeAudioGenerationPlan(prepareAudioGenerationPlan({
          sourceLineId: input.sourceLineId, kind: input.kind, prompt: input.prompt,
          modelCandidate: 'stabilityai/stable-audio-3-small-sfx',
          durationSeconds: input.durationSeconds,
        }), { confirmed: true, authorizationId: input.authorizationId });
        const client = sfxPilotClient || makeDefaultClient(config);
        const requestData = {
          requestId: input.requestId,
          authorizationId: input.authorizationId,
          sourceLineId: plan.sourceLineId,
          kind: plan.kind,
          prompt: plan.prompt,
          durationSeconds: plan.durationSeconds,
          modelCandidate: plan.modelCandidate,
          modelRevision: revision,
          seed: input.seed ?? 42,
          estimatedMaxCostUsdPerRequest:
            acknowledgedPolicy.estimatedMaxCostUsdPerRequest,
          dailyBudgetUsd: acknowledgedPolicy.dailyBudgetUsd,
          acknowledgedMaxCostUsd: acknowledgedPolicy.acknowledgedMaxCostUsd,
        };
        // Reserve BEFORE any paid submission; duplicates and budget fail closed.
        if(await sfxStore.read(input.requestId)){
          const error=new Error('Duplicate SFX job');error.code='SFX_DUPLICATE';throw error;
        }
        await reserveCampaign(requestData);
        const job = await sfxStore.reserve(requestData, { confirm: true });
        const submittedAt = performance.now();
        try {
          const result = await client.start(plan, {
            requestId: job.requestId, seed: requestData.seed,
          });
          const queued = await sfxStore.update(job.requestId, 'QUEUED', {
            remoteJobId: result.jobId,
            latencies: { submissionMs: performance.now() - submittedAt },
          });
          json(response, 202, queued, headers);
        } catch {
          // A timeout MAY have created a charged job. Record the wait, preserve
          // SUBMISSION_UNKNOWN and never retry automatically.
          try {
            await sfxStore.update(job.requestId, 'SUBMISSION_UNKNOWN', {
              latencies: { submissionMs: performance.now() - submittedAt },
            });
          } catch {}
          json(response, 502, {
            code: 'SFX_SUBMISSION_UNKNOWN', requestId: job.requestId,
          }, headers);
        }
        return true;
      }

      const job = await sfxStore.read(id);
      if (!job) {
        json(response, 404, { code: 'SFX_NOT_FOUND' }, headers); return true;
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
        const latencies = remote.latencies;
        let updated;
        if (remote.status === 'COMPLETED') {
          const audio = await client.download(internal.remoteJobId);
          if (remote.wav?.sha256 !== audio.metadata.sha256) {
            throw new TypeError('SFX audio does not match job metadata');
          }
          updated = await sfxStore.storeWav(id, audio.bytes, audio.metadata, { latencies });
        } else if (remote.status === 'CANCELLED') {
          updated = await sfxStore.update(id, 'CANCELLED', { latencies });
        } else if (remote.status === 'FAILED') {
          updated = await sfxStore.update(id, 'FAILED', { latencies });
        } else if (job.status !== 'CANCEL_REQUESTED' &&
                   ['QUEUED','RUNNING'].includes(remote.status)) {
          updated = await sfxStore.update(id, 'RUNNING', { latencies });
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
        json(response, 202, await sfxStore.update(id, 'CANCEL_REQUESTED'), headers);
        return true;
      }
      throw new TypeError('Unsupported SFX operation');
    } catch (error) {
      sendFailure(response, error, headers);
    } finally { busy = false; }
    return true;
  };
}
