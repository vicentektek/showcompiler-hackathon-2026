/**
 * Meta-only EUR accounting, constrained by the still-active shared policy.
 * Every liability is mirrored under the existing campaign lock.
 */
import {createHash} from 'node:crypto';
import {mkdir, open, readFile, rename, unlink} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {acquireGlobalSpendLedger, checkLedgerAuthorization, globalLedgerDefaultPath} from './globalSpendLedger.mjs';

export const ASSISTANT_V3_ENDPOINT = 'https://api.meta.ai/v1/chat/completions';
export const ASSISTANT_V3_MODEL = 'muse-spark-1.3';
export const ASSISTANT_V3_POLICY = Object.freeze({
  id: 'runq-assistant-v3-meta-eur-20261101-v1',
  capEurMicros: 60_000_000,
  requestCap: 1800,
  inputWindowTokens: 1_048_576,
  maxCompletionTokens: 2200,
  inputUsdPerMillion: 1.25,
  outputUsdPerMillion: 4.25,
  conservativeEurMicrosPerUsd: 1_250_000,
  publishedUsdReserveMicros: 1_320_070,
  requestReserveEurMicros: 1_650_088,
  pricingVerifiedAt: '2026-11-01T22:15:00.000Z',
  pricingExpiresAt: '2026-11-02T22:15:00.000Z',
  fxDate: '2026-10-30',
  fxUsdPerEur: 1.1172,
});

const VERSION = 1;
const EXTENSION_ID = ASSISTANT_V3_POLICY.id;
const V3_ID = /^v3-[a-f0-9]{64}$/;
const V3_RUN_ID = /^v3-run-[a-f0-9]{32}$/;
const STATUS = new Set(['RESERVED', 'COMPLETED', 'UNKNOWN']);
const DEFAULT_SIDECAR = resolve(
  process.env.LOCALAPPDATA || join(process.env.USERPROFILE || process.cwd(), 'AppData', 'Local'),
  'RunQ', 'Evaluation', 'assistant-v3-eur-budget.json',
);
const digest = value => createHash('sha256').update(value).digest('hex');
const stableJson = value => JSON.stringify(value);
const ceilMicros = amount => Math.ceil(amount * 1_000_000);

function assertPolicyFresh(now = Date.now()) {
  if (!Number.isFinite(now) || now >= Date.parse(ASSISTANT_V3_POLICY.pricingExpiresAt) ||
      now < Date.parse(ASSISTANT_V3_POLICY.pricingVerifiedAt)) {
    throw new Error('V3_PRICING_VERIFICATION_EXPIRED');
  }
}

export function estimateAssistantV3Reserve() {
  const usd = (ASSISTANT_V3_POLICY.inputWindowTokens * ASSISTANT_V3_POLICY.inputUsdPerMillion +
    ASSISTANT_V3_POLICY.maxCompletionTokens * ASSISTANT_V3_POLICY.outputUsdPerMillion) / 1_000_000;
  const eur = usd * ASSISTANT_V3_POLICY.conservativeEurMicrosPerUsd / 1_000_000;
  return {
    usdMicros: ceilMicros(usd),
    eurMicros: Math.max(ASSISTANT_V3_POLICY.requestReserveEurMicros, ceilMicros(eur)),
    inputWindowTokens: ASSISTANT_V3_POLICY.inputWindowTokens,
    maxCompletionTokens: ASSISTANT_V3_POLICY.maxCompletionTokens,
  };
}

export function validateAssistantV3MetaRequest(url, options) {
  if (String(url) !== ASSISTANT_V3_ENDPOINT || options?.method !== 'POST' ||
      typeof options.body !== 'string' || Buffer.byteLength(options.body) > 80_000) {
    throw new TypeError('V3_META_ENDPOINT_OR_REQUEST_REJECTED');
  }
  let payload;
  try {
    payload = JSON.parse(options.body);
  } catch {
    throw new TypeError('V3_META_PAYLOAD_INVALID');
  }
  const allowed = new Set([
    'model', 'messages', 'response_format', 'reasoning_effort',
    'max_completion_tokens', 'stream', 'store',
  ]);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      Object.keys(payload).some(key => !allowed.has(key)) ||
      payload.model !== ASSISTANT_V3_MODEL || payload.stream !== false || payload.store !== false ||
      payload.reasoning_effort !== 'low' || payload.max_completion_tokens !== ASSISTANT_V3_POLICY.maxCompletionTokens ||
      !Array.isArray(payload.messages) || payload.messages.length !== 2 ||
      payload.response_format?.type !== 'json_schema' ||
      payload.response_format?.json_schema?.name !== 'runq_agent_plan_v1' ||
      payload.response_format?.json_schema?.strict !== true ||
      !payload.response_format?.json_schema?.schema ||
      payload.messages.some(message => !message || typeof message.content !== 'string' ||
        !['developer', 'user'].includes(message.role)) ||
      payload.messages[0].role !== 'developer' || payload.messages[1].role !== 'user' ||
      Object.hasOwn(payload, 'tools') || Object.hasOwn(payload, 'tool_choice') ||
      Object.hasOwn(payload, 'n') || Object.hasOwn(payload, 'modalities')) {
    throw new TypeError('V3_META_PAYLOAD_OUT_OF_POLICY');
  }
  return payload;
}

function globalHistoryWithoutV3(state) {
  const history = structuredClone(state);
  const ownIds=new Set(history.extensionCampaigns?.[EXTENSION_ID]?.reservations?.map(row=>row.requestId)??[]);
  history.reservations=history.reservations.filter(row=>!ownIds.has(row.requestId));
  if (history.extensionCampaigns && Object.hasOwn(history.extensionCampaigns, EXTENSION_ID)) {
    delete history.extensionCampaigns[EXTENSION_ID];
    if (Object.keys(history.extensionCampaigns).length === 0) delete history.extensionCampaigns;
  }
  return history;
}

function defaultSidecarPath() {
  return DEFAULT_SIDECAR;
}

async function readSidecar(file) {
  try {
    const raw = await readFile(file, 'utf8');
    if (Buffer.byteLength(raw) > 8_000_000) throw new TypeError('V3_BUDGET_SIDECAR_TOO_LARGE');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function validateSidecar(state) {
  const allowedStateKeys = new Set([
    'version', 'policyId', 'capEurMicros', 'requestCap',
    'sharedBaselineSha256', 'reservations',
  ]);
  const allowedEntryKeys = new Set([
    'requestId', 'runId', 'status', 'eurMicros', 'usdMicros',
    'sourceSha256', 'corpusSha256', 'caseSha256', 'model', 'variant', 'createdAt',
  ]);
  if (!state || state.version !== VERSION || state.policyId !== ASSISTANT_V3_POLICY.id ||
      state.capEurMicros !== ASSISTANT_V3_POLICY.capEurMicros ||
      state.requestCap !== ASSISTANT_V3_POLICY.requestCap ||
      !/^[a-f0-9]{64}$/.test(state.sharedBaselineSha256) ||
      !Array.isArray(state.reservations) || state.reservations.length > ASSISTANT_V3_POLICY.requestCap ||
      Object.keys(state).some(key => !allowedStateKeys.has(key))) {
    throw new TypeError('V3_BUDGET_SIDECAR_INVALID');
  }
  const ids = new Set();
  for (const entry of state.reservations) {
    if (!entry || !V3_ID.test(entry.requestId) || !V3_RUN_ID.test(entry.runId) ||
        Object.keys(entry).some(key => !allowedEntryKeys.has(key)) ||
        ids.has(entry.requestId) ||
        entry.eurMicros !== ASSISTANT_V3_POLICY.requestReserveEurMicros ||
        entry.usdMicros !== estimateAssistantV3Reserve().usdMicros ||
        !STATUS.has(entry.status) || !/^[a-f0-9]{64}$/.test(entry.sourceSha256) ||
        !/^[a-f0-9]{64}$/.test(entry.corpusSha256) ||
        !/^[a-f0-9]{64}$/.test(entry.caseSha256) ||
        !['A', 'B', 'C', 'D'].includes(entry.variant) ||
        entry.model !== ASSISTANT_V3_MODEL || typeof entry.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(entry.createdAt))) {
      throw new TypeError('V3_BUDGET_SIDECAR_CORRUPT');
    }
    ids.add(entry.requestId);
  }
  const reservedEur = state.reservations.reduce((total, entry) => total + entry.eurMicros, 0);
  if (reservedEur > ASSISTANT_V3_POLICY.capEurMicros) {
    throw new TypeError('V3_BUDGET_SIDECAR_CORRUPT');
  }
  return state;
}

function validateSharedExtension(sharedState) {
  const campaigns = sharedState.extensionCampaigns;
  if (campaigns !== undefined && (!campaigns || typeof campaigns !== 'object' || Array.isArray(campaigns))) {
    throw new TypeError('V3_SHARED_EXTENSION_CORRUPT');
  }
  const extension = campaigns?.[EXTENSION_ID];
  if (extension === undefined) return null;
  const allowedExtensionKeys = new Set(['version', 'policyId', 'capEurMicros', 'requestCap', 'reservations']);
  const allowedEntryKeys = new Set(['requestId', 'runId', 'provider', 'amountMicros', 'status']);
  if (!extension || typeof extension !== 'object' || Array.isArray(extension) ||
      Object.keys(extension).some(key => !allowedExtensionKeys.has(key)) ||
      extension.version !== VERSION || extension.policyId !== EXTENSION_ID ||
      extension.capEurMicros !== ASSISTANT_V3_POLICY.capEurMicros ||
      extension.requestCap !== ASSISTANT_V3_POLICY.requestCap ||
      !Array.isArray(extension.reservations) ||
      extension.reservations.length > ASSISTANT_V3_POLICY.requestCap) {
    throw new TypeError('V3_SHARED_EXTENSION_CORRUPT');
  }
  const ids = new Set();
  for (const entry of extension.reservations) {
    const legacy=sharedState.reservations.find(row=>row.requestId===entry?.requestId);
    if (!entry || Object.keys(entry).some(key => !allowedEntryKeys.has(key)) ||
        !V3_ID.test(entry.requestId) || !V3_RUN_ID.test(entry.runId) ||
        entry.provider !== 'meta' || entry.amountMicros !== estimateAssistantV3Reserve().usdMicros ||
        !STATUS.has(entry.status) || ids.has(entry.requestId)||
        !legacy||legacy.runId!==entry.runId||legacy.provider!=='meta'||
        legacy.amountMicros!==entry.amountMicros||legacy.status!==entry.status) {
      throw new TypeError('V3_SHARED_EXTENSION_CORRUPT');
    }
    ids.add(entry.requestId);
  }
  return extension;
}

function reconcile(sharedState, sidecar) {
  const sharedExtension = validateSharedExtension(sharedState);
  const sharedV3 = sharedExtension?.reservations ?? [];
  if (!sidecar) {
    if (sharedV3.length) throw new Error('V3_BUDGET_LEDGER_MISMATCH');
    return {
      version: VERSION,
      policyId: ASSISTANT_V3_POLICY.id,
      capEurMicros: ASSISTANT_V3_POLICY.capEurMicros,
      requestCap: ASSISTANT_V3_POLICY.requestCap,
      sharedBaselineSha256: digest(stableJson(globalHistoryWithoutV3(sharedState))),
      reservations: [],
    };
  }
  validateSidecar(sidecar);
  if (sidecar.sharedBaselineSha256 !== digest(stableJson(globalHistoryWithoutV3(sharedState)))) {
    throw new Error('V3_SHARED_HISTORY_CHANGED_RECONCILE_REQUIRED');
  }
  const byId = new Map(sidecar.reservations.map(item => [item.requestId, item]));
  if (sharedV3.length !== byId.size || sharedV3.some(entry => {
    const local = byId.get(entry.requestId);
    return !local || entry.provider !== 'meta' || entry.runId !== local.runId ||
      entry.amountMicros !== local.usdMicros || entry.status !== local.status;
  })) throw new Error('V3_BUDGET_LEDGER_MISMATCH');
  return sidecar;
}

async function writeSharedState(file, state) {
  const temp = `${file}.tmp-v3-${process.pid}`;
  let created = false;
  try {
    const handle = await open(temp, 'wx', 0o600);
    created = true;
    try { await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`); }
    finally { await handle.close(); }
    await rename(temp, file);
  } catch (error) {
    if (created) {
      try {await unlink(temp);}
      catch(cleanup) {throw new AggregateError([error,cleanup],'V3_SHARED_LEDGER_CLEANUP_FAILED');}
    }
    throw error;
  }
}

async function writeSidecar(file, state) {
  await mkdir(dirname(file), {recursive: true, mode: 0o700});
  const temp = `${file}.tmp-${process.pid}`;
  let created = false;
  try {
    const handle = await open(temp, 'wx', 0o600);
    created = true;
    try { await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`); }
    finally { await handle.close(); }
    await rename(temp, file);
  } catch (error) {
    if (created) {
      try {await unlink(temp);}
      catch(cleanup) {throw new AggregateError([error,cleanup],'V3_SIDECAR_CLEANUP_FAILED');}
    }
    throw error;
  }
}

function addSharedExtensionReservation(sharedState, identity, estimate, status = 'RESERVED') {
  const updated = structuredClone(sharedState);
  updated.reservations.push({requestId:identity.requestId,runId:identity.runId,
    provider:'meta',amountMicros:estimate.usdMicros,status});
  // The EUR authorization does not silently replace the active shared policy.
  checkLedgerAuthorization(updated);
  updated.extensionCampaigns ??= {};
  const extension = updated.extensionCampaigns[EXTENSION_ID] ?? {
    version: VERSION,
    policyId: EXTENSION_ID,
    capEurMicros: ASSISTANT_V3_POLICY.capEurMicros,
    requestCap: ASSISTANT_V3_POLICY.requestCap,
    reservations: [],
  };
  extension.reservations.push({
    requestId: identity.requestId,
    runId: identity.runId,
    provider: 'meta',
    amountMicros: estimate.usdMicros,
    status,
  });
  updated.extensionCampaigns[EXTENSION_ID] = extension;
  return updated;
}

async function withSharedLedger({sharedOptions, sharedFile, sidecarFile}, work) {
  const options = {...(sharedOptions ?? {})};
  if (sharedFile) options.file = sharedFile;
  const file = resolve(options.file ?? globalLedgerDefaultPath());
  const shared = await acquireGlobalSpendLedger(options);
  try {
    const current = JSON.parse(await readFile(file, 'utf8'));
    return await work({
      shared, sharedState: current, sharedFile: file,
      sidecarPath: resolve(sidecarFile ?? defaultSidecarPath()),
    });
  } finally {
    await shared.close();
  }
}

export async function acquireAssistantV3Budget({
  sharedOptions, sharedFile, sidecarFile, now = Date.now, writeSidecarImpl = writeSidecar,
} = {}) {
  return {
    async status() {
      return withSharedLedger({sharedOptions, sharedFile, sidecarFile}, async ({shared, sharedState, sidecarPath}) => {
        const sidecar = reconcile(sharedState, await readSidecar(sidecarPath));
        const committedEurMicros = sidecar.reservations.reduce((sum, item) => sum + item.eurMicros, 0);
        const sharedStatus = shared.status();
        return {
          policyId: ASSISTANT_V3_POLICY.id,
          capEur: ASSISTANT_V3_POLICY.capEurMicros / 1_000_000,
          reservedEur: committedEurMicros / 1_000_000,
          remainingEur: Math.max(0, ASSISTANT_V3_POLICY.capEurMicros - committedEurMicros) / 1_000_000,
          requestCount: sidecar.reservations.length,
          requestsRemaining: Math.max(0, Math.min(
            ASSISTANT_V3_POLICY.requestCap - sidecar.reservations.length,
            Math.floor((ASSISTANT_V3_POLICY.capEurMicros - committedEurMicros) /
              ASSISTANT_V3_POLICY.requestReserveEurMicros),
          )),
          maxNewSafeRequests: Math.max(0, Math.min(
            sharedStatus.perProvider.meta.requestsRemaining,
            Math.floor(sharedStatus.perProvider.meta.remainingUsd*1_000_000/estimateAssistantV3Reserve().usdMicros),
            Math.floor(sharedStatus.remainingUsd*1_000_000/estimateAssistantV3Reserve().usdMicros),
            ASSISTANT_V3_POLICY.requestCap - sidecar.reservations.length,
            Math.floor((ASSISTANT_V3_POLICY.capEurMicros - committedEurMicros) /
              ASSISTANT_V3_POLICY.requestReserveEurMicros),
          )),
          sharedMetaUsdRemaining: sharedStatus.perProvider.meta.remainingUsd,
          sharedMetaRequestsRemaining: sharedStatus.perProvider.meta.requestsRemaining,
          pricingExpiresAt: ASSISTANT_V3_POLICY.pricingExpiresAt,
        };
      });
    },
    async reserve(identity) {
      assertPolicyFresh(now());
      const estimate = estimateAssistantV3Reserve();
      const allowedIdentityKeys = new Set([
        'requestId', 'runId', 'sourceSha256', 'corpusSha256', 'caseSha256', 'variant',
      ]);
      if (!identity || !V3_ID.test(identity.requestId) || !V3_RUN_ID.test(identity.runId) ||
          Object.keys(identity).some(key => !allowedIdentityKeys.has(key)) ||
          !/^[a-f0-9]{64}$/.test(identity.sourceSha256 ?? '') ||
          !/^[a-f0-9]{64}$/.test(identity.corpusSha256 ?? '') ||
          !/^[a-f0-9]{64}$/.test(identity.caseSha256 ?? '') ||
          !['A', 'B', 'C', 'D'].includes(identity.variant)) {
        throw new TypeError('V3_RESERVATION_IDENTITY_INVALID');
      }
      return withSharedLedger({sharedOptions, sharedFile, sidecarFile}, async ({shared, sharedState, sharedFile: lockedSharedFile, sidecarPath}) => {
        const state = reconcile(sharedState, await readSidecar(sidecarPath));
        if (state.reservations.some(item => item.requestId === identity.requestId) ||
            sharedState.reservations.some(item => item.requestId === identity.requestId)) {
          throw new Error('V3_DUPLICATE_OR_ALREADY_ATTEMPTED');
        }
        const spent = state.reservations.reduce((sum, item) => sum + item.eurMicros, 0);
        if (state.reservations.length >= ASSISTANT_V3_POLICY.requestCap ||
            spent + estimate.eurMicros > ASSISTANT_V3_POLICY.capEurMicros) {
          throw new Error('V3_EUR_BUDGET_LIMIT');
        }
        const entry = {
          requestId: identity.requestId,
          runId: identity.runId,
          status: 'RESERVED',
          eurMicros: estimate.eurMicros,
          usdMicros: estimate.usdMicros,
          sourceSha256: identity.sourceSha256,
          corpusSha256: identity.corpusSha256,
          caseSha256: identity.caseSha256,
          model: ASSISTANT_V3_MODEL,
          variant: identity.variant,
          createdAt: new Date(now()).toISOString(),
        };
        const updatedShared = addSharedExtensionReservation(
          sharedState, identity, estimate, entry.status,
        );
        if (state.sharedBaselineSha256 !== digest(stableJson(globalHistoryWithoutV3(updatedShared)))) {
          throw new Error('V3_SHARED_HISTORY_CHANGED_RECONCILE_REQUIRED');
        }
        await writeSharedState(lockedSharedFile, updatedShared);
        state.reservations.push(entry);
        // Keep the extension reservation if its mirror write fails; reconciliation
        // blocks further requests until the shared-first write is repaired.
        await writeSidecarImpl(sidecarPath, state);
        return structuredClone(entry);
      });
    },
    async lookup(requestId) {
      return withSharedLedger({sharedOptions, sharedFile, sidecarFile}, async ({sharedState, sidecarPath}) => {
        const state = reconcile(sharedState, await readSidecar(sidecarPath));
        const entry = state.reservations.find(item => item.requestId === requestId);
        return entry ? structuredClone(entry) : null;
      });
    },
    async mark(identity, status) {
      if (!STATUS.has(status) || status === 'RESERVED') throw new TypeError('V3_RESULT_STATUS_INVALID');
      return withSharedLedger({sharedOptions, sharedFile, sidecarFile}, async ({sharedState, sharedFile: lockedSharedFile, sidecarPath}) => {
        const state = reconcile(sharedState, await readSidecar(sidecarPath));
        const entry = state.reservations.find(item => item.requestId === identity?.requestId);
        if (!entry) throw new Error('V3_RESERVATION_NOT_FOUND');
        if (entry.status === 'UNKNOWN' || entry.status === 'COMPLETED') {
          if (entry.status !== status) throw new Error('V3_RESULT_STATUS_IMMUTABLE');
          return structuredClone(entry);
        }
        entry.status = status;
        const extension = validateSharedExtension(sharedState);
        if (!extension) throw new Error('V3_BUDGET_LEDGER_MISMATCH');
        const extensionEntry = extension.reservations.find(item => item.requestId === entry.requestId);
        if (!extensionEntry || extensionEntry.status !== 'RESERVED') throw new Error('V3_BUDGET_LEDGER_MISMATCH');
        const updatedShared = structuredClone(sharedState);
        updatedShared.extensionCampaigns[EXTENSION_ID]
          .reservations.find(item => item.requestId === entry.requestId).status = status;
        updatedShared.reservations.find(item=>item.requestId===entry.requestId).status=status;
        await writeSharedState(lockedSharedFile, updatedShared);
        await writeSidecarImpl(sidecarPath, state);
        return structuredClone(entry);
      });
    },
  };
}

export async function guardedAssistantV3Fetch({
  url, options, identity, budget, fetchImpl = fetch, beforeRequest = async () => {},
}) {
  validateAssistantV3MetaRequest(url, options);
  if (!budget || typeof budget.reserve !== 'function') throw new TypeError('V3_BUDGET_REQUIRED');
  const reservation = await budget.reserve(identity);
  await beforeRequest(reservation);
  return fetchImpl(ASSISTANT_V3_ENDPOINT, options);
}
