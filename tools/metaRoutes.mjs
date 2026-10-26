/**
 * Local-only Meta Model API endpoint. No secrets in browser source or responses.
 * An explicit same-origin POST is required before any external model request.
 */
import { deserializeShowProject, MAX_PROJECT_JSON_BYTES } from '../src/core/projectPersistence.mjs';
import { addMetaProposals } from '../src/core/workspace.mjs';
import { normalizeScriptLanguageHint } from '../src/core/scriptLanguage.mjs';
import { callMetaCueModel, DEFAULT_META_MODEL, validateMetaModelId } from '../src/core/metaCueProvider.mjs';

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

/** Returns a handler that sends only selected script lines + asset *names* to Meta. */
export function makeMetaRoute({
  modelClient = callMetaCueModel,
  getKey = () => process.env.MODEL_API_KEY,
  getModel = () => process.env.META_MODEL_ID || DEFAULT_META_MODEL,
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
    const available = Boolean(getKey());
    let model = DEFAULT_META_MODEL;
    try { model = validateMetaModelId(getModel()); }
    catch { /* invalid server configuration -> no model calls */ }

    if (path === '/api/meta/status' && request.method === 'GET') {
      answer(response, 200, {
        configured: available && getModel() === model,
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
    if (request.headers.origin !== 'http://' + localHost ||
        !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] ?? '')) {
      answer(response, 403, { error: 'Model request must originate in this local app' }, headers);
      return true;
    }
    if (!available || getModel() !== model) {
      answer(response, 503, { error: 'Meta API no configurada: MODEL_API_KEY' }, headers);
      return true;
    }
    if (busy) {
      answer(response, 429, { error: 'Ya existe un análisis en curso' }, headers);
      return true;
    }
    busy = true;
    try {
      // The limit is on bytes from browser, regardless of claimed Content-Length.
      const raw = await readBoundedBody(request, MAX_PROJECT_JSON_BYTES);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
          Object.keys(parsed).some(key => key !== 'project' && key !== 'scriptLanguage') ||
          typeof parsed.project !== 'object') {
        answer(response, 400, { error: 'Solicitud de proyecto no válida' }, headers);
        return true;
      }
      const project = deserializeShowProject(JSON.stringify(parsed.project));
      const scriptLanguage = normalizeScriptLanguageHint(parsed.scriptLanguage);
      const result = await modelClient({
        show: project, apiKey: getKey(), model, scriptLanguage,
      });
      // Revalidate everything on the server before returning anything to the UI.
      const accepted = addMetaProposals(project, result.proposals);
      const output = accepted.proposals.slice(project.proposals.length).map(proposal => ({
        lineId: proposal.sourceLineIds[0],
        assetId: proposal.actions[0].assetId,
        label: proposal.label,
      }));
      answer(response, 200, { provider: 'META_MODEL_API', model, proposals: output }, headers);
    } catch (error) {
      // Never reflect provider bodies, stack traces, secrets or untrusted scripts.
      const code = error?.status === 413 ? 413 :
        error instanceof SyntaxError || error?.code === 'INVALID_SHOW_PROJECT' ||
        error instanceof TypeError || error instanceof RangeError ? 400 : 502;
      const upstreamCode = Number.isInteger(error?.metaStatus) ? error.metaStatus : null;
      const safeMessage =
        upstreamCode === 401 || upstreamCode === 403
          ? 'Meta rechaza la clave o los permisos de tu cuenta. Comprueba API keys, créditos y facturación.'
          : upstreamCode === 429
            ? 'Meta aplica un límite de solicitudes o cuota (429). Comprueba créditos, límites y espera antes de reintentar.'
            : upstreamCode === 400
              ? 'Meta no acepta esta solicitud (400). Puede necesitar adaptar el esquema o los parámetros del modelo.'
              : code === 413 ? 'Solicitud demasiado grande'
                : code === 400 ? 'Proyecto o respuesta no válida'
                  : 'No se ha podido completar el análisis de Meta';
      answer(response, code, { error: safeMessage }, headers);
    } finally {
      busy = false;
    }
    return true;
  };
}
