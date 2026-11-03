/**
 * Local-only Meta Model API endpoint. No secrets in browser source or responses.
 * An explicit same-origin POST is required before any external model request.
 */
import { deserializeShowProject, MAX_PROJECT_JSON_BYTES } from '../src/core/projectPersistence.mjs';
import { addMetaProposals } from '../src/core/workspace.mjs';
import { normalizeScriptLanguageHint } from '../src/core/scriptLanguage.mjs';
import { validateProductionContext } from '../src/core/performanceKnowledge.mjs';
import {
  callMetaCueModel,
  createMetaRequestId,
  DEFAULT_META_MODEL,
  MetaOutputError,
  MetaProviderError,
  sanitizeMetaDiagnostic,
  validateMetaModelId,
} from '../src/core/metaCueProvider.mjs';
import {campaignMetaFetch} from './campaignFetch.mjs';

const campaignMetaClient=options=>callMetaCueModel({...options,fetchImpl:campaignMetaFetch});

function answer(response, code, data, headers) {
  response.writeHead(code, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

async function readBoundedBody(request, maximum) {
  let size = 0;
  let tooLarge = false;
  const buffers = [];
  for await (const part of request) {
    size += part.length;
    if (size > maximum) {
      // Drain incoming bytes without retaining them. Respond after request
      // completion so HTTP clients cannot hang on an unread upload body.
      tooLarge = true;
      continue;
    }
    buffers.push(part);
  }
  if (tooLarge) {
    const err = new Error('Project request too large');
    err.status = 413;
    throw err;
  }
  return Buffer.concat(buffers).toString('utf8');
}

const LINE_ID = /^L[1-9]\d*$/;
const WINDOW_ID = /^S[1-9]\d*-W[1-9]\d*$/;
const CUE_KINDS = new Set(['FX', 'AMBIENCE', 'MUSIC', 'VOICE', 'SILENCE', 'TRANSITION']);
const BASES = new Set(['EXPLICIT', 'SUGGESTED']);
const TRANSPORTS = new Set(['PLAY', 'CONTINUE', 'STOP', 'SILENCE']);

function safeCoverage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Number.isSafeInteger(value.totalLines) || value.totalLines < 1 ||
      !Number.isSafeInteger(value.sceneCount) || value.sceneCount < 1 ||
      !Number.isSafeInteger(value.totalWindows) || value.totalWindows < 1 ||
      !Number.isSafeInteger(value.batchStartWindow) || value.batchStartWindow < 0 ||
      !Number.isSafeInteger(value.batchEndWindowExclusive) ||
      value.batchEndWindowExclusive <= value.batchStartWindow ||
      value.batchEndWindowExclusive > value.totalWindows ||
      !Array.isArray(value.analyzedWindowIds) || value.analyzedWindowIds.length > 2 ||
      value.analyzedWindowIds.some(id => typeof id !== 'string' || !WINDOW_ID.test(id)) ||
      new Set(value.analyzedWindowIds).size !== value.analyzedWindowIds.length ||
      !Array.isArray(value.analyzedLineIds) || value.analyzedLineIds.length > 240 ||
      value.analyzedLineIds.some(id => typeof id !== 'string' || !LINE_ID.test(id)) ||
      new Set(value.analyzedLineIds).size !== value.analyzedLineIds.length ||
      !Number.isSafeInteger(value.analyzedLines) || value.analyzedLines !== value.analyzedLineIds.length ||
      !(value.nextWindowStart === null ||
        (Number.isSafeInteger(value.nextWindowStart) && value.nextWindowStart === value.batchEndWindowExclusive)) ||
      typeof value.complete !== 'boolean' || value.complete !== (value.nextWindowStart === null)) {
    throw new TypeError('Invalid Meta scene coverage');
  }
  return {
    totalLines: value.totalLines,
    sceneCount: value.sceneCount,
    totalWindows: value.totalWindows,
    batchStartWindow: value.batchStartWindow,
    batchEndWindowExclusive: value.batchEndWindowExclusive,
    analyzedWindowIds: [...value.analyzedWindowIds],
    analyzedLineIds: [...value.analyzedLineIds],
    analyzedLines: value.analyzedLines,
    nextWindowStart: value.nextWindowStart,
    complete: value.complete,
  };
}

function safeIndependentReview(value, coverage) {
  if (!coverage || !value || typeof value !== 'object' || Array.isArray(value) ||
      !Array.isArray(value.reviewFlags) || value.reviewFlags.length > 16 ||
      !Number.isSafeInteger(value.totalUnreviewed) ||
      value.totalUnreviewed < value.reviewFlags.length ||
      value.totalUnreviewed > coverage.analyzedLines) {
    throw new TypeError('Invalid Meta independent review');
  }
  const permitted = new Set(coverage.analyzedLineIds);
  if (value.reviewFlags.some(id => typeof id !== 'string' || !LINE_ID.test(id) || !permitted.has(id)) ||
      new Set(value.reviewFlags).size !== value.reviewFlags.length) {
    throw new TypeError('Independent review references invalid source lines');
  }
  return { reviewFlags: [...value.reviewFlags], totalUnreviewed: value.totalUnreviewed };
}

function safeTheatricalDetail(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !CUE_KINDS.has(value.cueKind) || !BASES.has(value.basis) ||
      !TRANSPORTS.has(value.transport) || typeof value.reason !== 'string' ||
      !value.reason.trim() || value.reason.length > 300) {
    throw new TypeError('Invalid Meta theatrical detail');
  }
  return {
    cueKind: value.cueKind,
    basis: value.basis,
    transport: value.transport,
    reason: value.reason.trim(),
  };
}

function safeObservation(value,coverage){
  const detail=safeTheatricalDetail(value);
  if(value.sourceLineId===undefined)return detail;
  if(!LINE_ID.test(value.sourceLineId)||!coverage?.analyzedLineIds.includes(value.sourceLineId)){
    throw new TypeError('Meta observation does not match supplied script excerpt or audio list');
  }
  return {...detail,sourceLineId:value.sourceLineId};
}

/** Returns a handler that sends only selected script lines + asset *names* to Meta. */
export function makeMetaRoute({
  modelClient = campaignMetaClient,
  getKey = () => process.env.MODEL_API_KEY,
  getModel = () => process.env.META_MODEL_ID || DEFAULT_META_MODEL,
  requestIdFactory = createMetaRequestId,
} = {}) {
  let busy = false;
  return async function handle(request, response, path, headers) {
    if (path !== '/api/meta/status' && path !== '/api/meta/proposals') return false;
    const localPort = request.socket.localPort;
    const localHost = '127.0.0.1:' + localPort;
    const sameHost = request.headers.host === localHost;
    if (!sameHost) {
      answer(response, 403, { error: 'Local server access only' }, headers);
      return true;
    }
    const apiKey = getKey();
    const available = typeof apiKey === 'string' && Boolean(apiKey.trim());
    let model = DEFAULT_META_MODEL;
    let modelValid = true;
    try { model = validateMetaModelId(getModel()); }
    catch { modelValid = false; }

    if (path === '/api/meta/status' && request.method === 'GET') {
      const configurationIssues = [
        ...(!available ? ['MISSING_API_KEY'] : []),
        ...(!modelValid ? ['INVALID_MODEL'] : []),
      ];
      answer(response, 200, {
        configured: configurationIssues.length === 0,
        configurationIssues,
        model,
        provider: 'META_MODEL_API',
        externalRequestRequiresConfirmation: true,
      }, headers);
      return true;
    }
    if (path !== '/api/meta/proposals' || request.method !== 'POST') {
      answer(response, 405, { error: 'Unsupported model endpoint method' }, headers);
      return true;
    }
    const requestId = requestIdFactory();
    const localDiagnostic = (phase, code, extra = {}) => sanitizeMetaDiagnostic({
      requestId, phase, code, ...extra,
    });
    if (request.headers.origin !== 'http://' + localHost ||
        !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] ?? '')) {
      answer(response, 403, { error: 'Model request must originate in this local app' }, headers);
      return true;
    }
    if (!available || getModel() !== model) {
      answer(response, 503, {
        code: 'META_NOT_CONFIGURED',
        error: 'Meta API no configurada: MODEL_API_KEY',
        diagnostic: localDiagnostic('LOCAL_VALIDATION', 'NOT_CONFIGURED'),
      }, headers);
      return true;
    }
    if (busy) {
      answer(response, 429, {
        code: 'META_BUSY',
        error: 'Ya existe un análisis en curso',
        diagnostic: localDiagnostic('LOCAL_VALIDATION', 'BUSY'),
      }, headers);
      return true;
    }
    busy = true;
    try {
      // The limit is on bytes from browser, regardless of claimed Content-Length.
      const raw = await readBoundedBody(request, MAX_PROJECT_JSON_BYTES);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
          Object.keys(parsed).some(key => !['project', 'scriptLanguage', 'analysisWindowStart', 'designMode', 'performanceKind', 'documentKind'].includes(key)) ||
          typeof parsed.project !== 'object') {
        answer(response, 400, { error: 'Solicitud de proyecto no válida' }, headers);
        return true;
      }
      const project = deserializeShowProject(JSON.stringify(parsed.project));
      const scriptLanguage = normalizeScriptLanguageHint(parsed.scriptLanguage);
      const analysisWindowStart = parsed.analysisWindowStart ?? 0;
      const designMode = parsed.designMode ?? 'balanced';
      const productionContext = {
        performanceKind: parsed.performanceKind ?? 'auto',
        documentKind: parsed.documentKind ?? 'auto',
      };
      validateProductionContext(productionContext);
      if (!['literal', 'balanced', 'expressive'].includes(designMode)) {
        throw new TypeError('Unsupported Meta sound design mode');
      }
      if (!Number.isSafeInteger(analysisWindowStart) || analysisWindowStart < 0) {
        throw new TypeError('Invalid Meta scene window start');
      }
      const result = await modelClient({
        show: project, apiKey: getKey(), model, scriptLanguage, requestId,
        analysisWindowStart, designMode, ...productionContext,
      });
      if (!result || result.provider !== 'META_MODEL_API' || !Array.isArray(result.proposals)) {
        throw new TypeError('Invalid Meta provider result');
      }
      const coverage = result.coverage === undefined ? undefined : safeCoverage(result.coverage);
      if (coverage) {
        const permitted = new Set(coverage.analyzedLineIds);
        if (result.proposals.some(proposal => !permitted.has(proposal?.lineId))) {
          throw new TypeError('Meta suggestion does not match supplied script excerpt or audio list');
        }
      }
      // Revalidate everything on the server before returning anything to the UI.
      const accepted = addMetaProposals(project, result.proposals);
      const output = accepted.proposals.slice(project.proposals.length).map(proposal => ({
        lineId: proposal.sourceLineIds[0],
        assetId: proposal.actions[0].type === 'PLAY' ? proposal.actions[0].assetId : null,
        ...(proposal.actions[0].type === 'PLAN_AUDIO' ? { soundPrompt: proposal.actions[0].prompt } : {}),
        label: proposal.label,
      }));
      const independentReview = result.independentReview === undefined ? undefined : safeIndependentReview(result.independentReview, coverage);
      const proposalDetails = result.details === undefined ? undefined : result.details.map(safeTheatricalDetail);
      const observations = result.observations === undefined ? undefined : result.observations.map(value=>safeObservation(value,coverage));
      const duplicatesRemoved = result.duplicatesRemoved === undefined ? undefined : result.duplicatesRemoved;
      if (proposalDetails && proposalDetails.length !== output.length) {
        throw new TypeError('Invalid Meta theatrical detail count');
      }
      if (duplicatesRemoved !== undefined &&
          (!Number.isSafeInteger(duplicatesRemoved) || duplicatesRemoved < 0 || duplicatesRemoved > 8)) {
        throw new TypeError('Invalid Meta duplicate count');
      }
      answer(response, 200, {
        provider: 'META_MODEL_API',
        model,
        proposals: output,
        diagnostic: sanitizeMetaDiagnostic(result.diagnostics ?? localDiagnostic('COMPLETE', 'OK')),
        ...(coverage === undefined ? {} : { coverage }),
        ...(independentReview === undefined ? {} : { independentReview }),
        ...(proposalDetails === undefined ? {} : { proposalDetails }),
        ...(observations === undefined ? {} : { observations }),
        ...(duplicatesRemoved === undefined ? {} : { duplicatesRemoved }),
      }, headers);
    } catch (error) {
      // Expose only an enumerated, non-sensitive reason. Never return script/model text.
      if (error instanceof MetaOutputError) {
        const envelope = error.safeReason === 'ENVELOPE';
        answer(response, envelope ? 502 : 422, {
          code: envelope ? 'META_UPSTREAM_ENVELOPE' : 'META_OUTPUT_' + error.safeReason,
          diagnostic: sanitizeMetaDiagnostic(error.diagnostic),
        }, headers);
        return true;
      }
      if (error instanceof TypeError &&
          /suggestion does not match supplied script excerpt or audio list|suggestions failed validation/i.test(error.message)) {
        answer(response, 422, {
          code: 'META_BAD_REFERENCES',
          diagnostic: localDiagnostic('LOCAL_SEMANTIC_VALIDATION', 'BAD_REFERENCES'),
        }, headers);
        return true;
      }
      if (error instanceof MetaProviderError) {
        const diagnostic = sanitizeMetaDiagnostic(error.diagnostic);
        const upstream = diagnostic.upstreamStatus;
        const phase = diagnostic.phase;
        const schemaFailure = phase === 'SCHEMA_INCOMPATIBILITY';
        const timeout = phase === 'UPSTREAM_TIMEOUT';
        const transport = phase === 'UPSTREAM_TRANSPORT';
        const envelope = phase === 'UPSTREAM_ENVELOPE';
        const code = schemaFailure ? 'META_SCHEMA_INCOMPATIBLE'
          : timeout ? 'META_TIMEOUT'
            : transport ? 'META_TRANSPORT'
              : envelope ? 'META_UPSTREAM_ENVELOPE'
                : upstream === 401 || upstream === 403 ? 'META_AUTH'
                  : upstream === 402 ? 'META_BILLING'
                    : upstream === 404 ? 'META_MODEL_NOT_FOUND'
                      : upstream === 429 ? 'META_RATE'
                        : upstream === 504 ? 'META_UPSTREAM_TIMEOUT'
                          : upstream === 400 ? 'META_BAD_REQUEST' : 'META_UPSTREAM_HTTP';
        const message = schemaFailure ? 'Meta rejected the structured-output schema.'
          : timeout ? 'The local Meta request reached its timeout. It was not retried.'
            : transport ? 'The local server could not reach Meta. It was not retried.'
              : envelope ? 'Meta returned an incompatible response envelope.'
                : upstream === 401 || upstream === 403 ? 'Meta rejected the API key or account permissions.'
                  : upstream === 402 ? 'Meta reported a billing or credit requirement.'
                    : upstream === 404 ? 'Meta did not recognize the endpoint or model.'
                      : upstream === 429 ? 'Meta applied a request or quota limit.'
                        : upstream === 504 ? 'Meta timed out upstream. The request was not retried.'
                          : upstream === 400 ? 'Meta rejected a request parameter.'
                            : 'Meta returned an upstream HTTP failure.';
        answer(response, timeout || upstream === 504 ? 504 : 502, {
          code, error: message, diagnostic,
        }, headers);
        return true;
      }
      // Backward-compatible boundary for injected/test clients that expose only
      // a numeric upstream status. Production callMetaCueModel uses the typed
      // MetaProviderError path above.
      if (Number.isInteger(error?.metaStatus)) {
        const upstream = error.metaStatus;
        const errorCode = upstream === 401 || upstream === 403 ? 'META_AUTH'
          : upstream === 402 ? 'META_BILLING'
            : upstream === 404 ? 'META_MODEL_NOT_FOUND'
              : upstream === 429 ? 'META_RATE'
                : upstream === 504 ? 'META_UPSTREAM_TIMEOUT'
                  : upstream === 400 ? 'META_BAD_REQUEST' : 'META_UPSTREAM_HTTP';
        const safeMessage = upstream === 401 || upstream === 403
          ? 'Meta rechaza la clave o los permisos de tu cuenta. Comprueba API keys, créditos y facturación.'
          : upstream === 429
            ? 'Meta aplica un límite de solicitudes o cuota (429). Comprueba créditos y límites antes de reintentar.'
            : upstream === 400
              ? 'Meta no acepta esta solicitud (400). Puede necesitar adaptar el esquema o los parámetros del modelo.'
              : 'Meta devolvió un error HTTP.';
        answer(response, upstream === 504 ? 504 : 502, {
          code: errorCode,
          error: safeMessage,
          diagnostic: localDiagnostic('UPSTREAM_HTTP', 'HTTP_FAILURE', { upstreamStatus: upstream }),
        }, headers);
        return true;
      }
      // Never reflect provider bodies, stack traces, secrets or untrusted scripts.
      const code = error?.status === 413 ? 413 :
        error instanceof SyntaxError || error?.code === 'INVALID_SHOW_PROJECT' ||
        error instanceof TypeError || error instanceof RangeError ? 400 : 502;
      const safeMessage = code === 413 ? 'Solicitud demasiado grande'
        : code === 400 ? 'Proyecto o respuesta no válida'
          : 'No se ha podido completar el análisis de Meta';
      const errorCode = code === 413 ? 'META_TOO_LARGE'
        : code === 400 ? 'META_INVALID_PROJECT' : 'META_SERVICE';
      answer(response, code, {
        code: errorCode,
        error: safeMessage,
        diagnostic: localDiagnostic('LOCAL_VALIDATION', errorCode),
      }, headers);
    } finally {
      busy = false;
    }
    return true;
  };
}
