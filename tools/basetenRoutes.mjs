/**
 * Opt-in loopback-only partner-inference endpoint.
 * The API key is available only to Node, never to JS/browser or show JSON.
 */
import { deserializeShowProject, MAX_PROJECT_JSON_BYTES } from '../src/core/projectPersistence.mjs';
import { addModelProposals } from '../src/core/workspace.mjs';
import { normalizeScriptLanguageHint } from '../src/core/scriptLanguage.mjs';
import { callBasetenCueModel, BASETEN_MODEL, BASETEN_PROVIDER, BasetenOutputError } from '../src/core/basetenCueProvider.mjs';

function reply(res, status, object, headers) {
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(object));
}

async function parseBody(req) {
  const buffers = [];
  let total = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_PROJECT_JSON_BYTES) {
      tooLarge = true;
      continue; // Consume safely; do not store the rest or leave unread upload.
    }
    buffers.push(chunk);
  }
  if (tooLarge) {
    const e = new Error('Payload too large');
    e.httpStatus = 413;
    throw e;
  }
  const parsed = JSON.parse(Buffer.concat(buffers).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      !Object.hasOwn(parsed, 'project') ||
      Object.keys(parsed).some(k => k !== 'project' && k !== 'scriptLanguage')) {
    throw new TypeError('Invalid local inference request');
  }
  return {
    show: deserializeShowProject(JSON.stringify(parsed.project)),
    scriptLanguage: normalizeScriptLanguageHint(parsed.scriptLanguage),
  };
}

export function makeBasetenRoute({
  modelClient = callBasetenCueModel,
  getKey = () => process.env.BASETEN_API_KEY,
} = {}) {
  let busy = false;
  return async function handle(req, res, path, headers) {
    if (path !== '/api/baseten/status' && path !== '/api/baseten/proposals') return false;
    const origin = 'http://127.0.0.1:' + req.socket.localPort;
    if (req.headers.host !== origin.slice('http://'.length)) {
      reply(res, 403, { code: 'BASETEN_ORIGIN' }, headers);
      return true;
    }
    if (path === '/api/baseten/status' && req.method === 'GET') {
      reply(res, 200, {
        provider: BASETEN_PROVIDER,
        model: BASETEN_MODEL,
        configured: typeof getKey() === 'string' && Boolean(getKey().trim()),
        externalRequestRequiresConfirmation: true,
        strictOutputGuaranteed: false,
      }, headers);
      return true;
    }
    if (path !== '/api/baseten/proposals' || req.method !== 'POST') {
      reply(res, 405, { code: 'BASETEN_METHOD' }, headers);
      return true;
    }
    if (req.headers.origin !== origin ||
        !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')) {
      reply(res, 403, { code: 'BASETEN_ORIGIN' }, headers);
      return true;
    }
    if (typeof getKey() !== 'string' || !getKey().trim()) {
      reply(res, 503, { code: 'BASETEN_UNCONFIGURED' }, headers);
      return true;
    }
    if (busy) {
      reply(res, 429, { code: 'BASETEN_BUSY' }, headers);
      return true;
    }
    busy = true;
    try {
      const { show, scriptLanguage } = await parseBody(req);
      const response = await modelClient({
        show, scriptLanguage, apiKey: getKey(),
      });
      if (!response || response.provider !== BASETEN_PROVIDER || !Array.isArray(response.proposals)) {
        throw new TypeError('Invalid provider result');
      }
      // All or nothing: backend revalidates line/audio IDs before sending to UI.
      const reviewed = addModelProposals(show, response.proposals, BASETEN_PROVIDER);
      const checked = reviewed.proposals.slice(show.proposals.length);
      const proposals = checked.map(item => ({
        lineId: item.sourceLineIds[0],
        assetId: item.actions[0].type === 'PLAY' ? item.actions[0].assetId : null,
        ...(item.actions[0].type === 'PLAN_AUDIO' ? { soundPrompt: item.actions[0].prompt } : {}),
        label: item.label,
      }));
      reply(res, 200, { provider: BASETEN_PROVIDER, model: BASETEN_MODEL, proposals }, headers);
    } catch (error) {
      const status = error?.httpStatus === 413 ? 413 :
        error instanceof SyntaxError || error instanceof TypeError ||
        error instanceof RangeError || error?.code === 'INVALID_SHOW_PROJECT' ? 400 : 502;
      // Preserve only a small, fixed classification; never expose the model text.
      if (error instanceof BasetenOutputError) {
        reply(res, 422, { code: 'BASETEN_OUTPUT_' + error.safeReason }, headers);
        return true;
      }
      // Safe category for hallucinated source line/audio IDs.
      if (error instanceof TypeError &&
          /suggestion does not match supplied script excerpt or audio list|suggestions failed validation/i.test(error.message)) {
        reply(res, 422, { code: 'BASETEN_BAD_REFERENCES' }, headers);
        return true;
      }
      // No secret, full prompt, provider response body or stack trace to browser.
      const remoteStatus = Number.isInteger(error?.basetenStatus) ? error.basetenStatus : 0;
      const code = remoteStatus === 401 || remoteStatus === 403 ? 'BASETEN_AUTH' :
        remoteStatus === 429 ? 'BASETEN_RATE' :
          remoteStatus === 400 || remoteStatus === 404 ? 'BASETEN_MODEL' :
            status === 413 ? 'BASETEN_TOO_LARGE' :
              status === 400 ? 'BASETEN_INVALID' : 'BASETEN_SERVICE';
      reply(res, status, { code }, headers);
    } finally {
      busy = false;
    }
    return true;
  };
}
