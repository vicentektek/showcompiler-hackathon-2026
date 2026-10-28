/** Minimal loopback-only development server; no npm dependencies. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeMetaRoute } from './metaRoutes.mjs';
import { makeBasetenRoute } from './basetenRoutes.mjs';
import { makeSfxRoute } from './sfxRoutes.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * Development-only environment bootstrap. Some Windows/PowerShell sessions
 * export a blank variable that masks an otherwise valid local .env entry.
 * Read only the SFX pilot's allowlisted settings; never print credentials.
 * Explicitly populated process variables always take precedence.
 * Merely enabling this configuration does NOT submit a generation request.
 */
export async function loadLocalSfxEnvironment({ filePath = join(projectRoot,'.env'), env = process.env } = {}) {
  let content;
  try { content=await readFile(filePath,'utf8'); }
  catch(error) { if(error?.code==='ENOENT')return; throw error; }
  const allowedKeys=new Set([
    'RUNQ_SFX_PILOT_ENABLED','MODAL_SFX_ENDPOINT',
    'MODAL_PROXY_TOKEN_ID','MODAL_PROXY_TOKEN_SECRET',
    'RUNQ_SFX_ESTIMATED_MAX_COST_USD','RUNQ_SFX_DAILY_BUDGET_USD',
    'RUNQ_SFX_MODEL_REVISION',
  ]);
  for(const raw of content.replace(/^\uFEFF/,'').split(/\r?\n/)) {
    const match=/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(raw);
    if(!match||!allowedKeys.has(match[1]))continue;
    const key=match[1];
    if(typeof env[key]==='string'&&env[key].trim())continue;
    const entry=match[2].trim();
    const value=((entry.startsWith('"')&&entry.endsWith('"'))||
      (entry.startsWith("'")&&entry.endsWith("'")))
      ?entry.slice(1,-1):entry;
    if(value.trim())env[key]=value.trim();
  }
}

const allowed = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/sound-lab', ['sound-lab.html', 'text/html; charset=utf-8']],
  ['/sound-lab.html', ['sound-lab.html', 'text/html; charset=utf-8']],
  ['/src/sfx/lab.mjs', ['src/sfx/lab.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/soundPromptCompiler.mjs', ['src/core/soundPromptCompiler.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/sfxImportCandidate.mjs', ['src/core/sfxImportCandidate.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/dramaticStructure.mjs', ['src/core/dramaticStructure.mjs', 'text/javascript; charset=utf-8']],
  ['/src/sfx/waveform.mjs', ['src/sfx/waveform.mjs', 'text/javascript; charset=utf-8']],
  ['/src/sfx/lab.css', ['src/sfx/lab.css', 'text/css; charset=utf-8']],
  ['/src/ui/voice-microphone-test.mjs', ['src/ui/voice-microphone-test.mjs', 'text/javascript; charset=utf-8']],
  ['/src/ui/voice-follow-ui.mjs', ['src/ui/voice-follow-ui.mjs', 'text/javascript; charset=utf-8']],
  ['/src/ui/voice-follow.css', ['src/ui/voice-follow.css', 'text/css; charset=utf-8']],
  ['/src/core/voiceFollow.mjs', ['src/core/voiceFollow.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/voiceScenario.mjs', ['src/core/voiceScenario.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/voiceRehearsal.mjs', ['src/core/voiceRehearsal.mjs', 'text/javascript; charset=utf-8']],
  ['/test/fixtures/voice-rehearsal.json', ['test/fixtures/voice-rehearsal.json', 'application/json; charset=utf-8']],
  ['/src/ui/app.mjs', ['src/ui/app.mjs', 'text/javascript; charset=utf-8']],
  ['/src/ui/style.css', ['src/ui/style.css', 'text/css; charset=utf-8']],
  ['/src/ui/runq-theme.css', ['src/ui/runq-theme.css', 'text/css; charset=utf-8']],
  ['/src/ui/runq-menu.mjs', ['src/ui/runq-menu.mjs', 'text/javascript; charset=utf-8']],
  ['/src/ui/runq-workspaces-v2.css', ['src/ui/runq-workspaces-v2.css', 'text/css; charset=utf-8']],
  ['/src/ui/runq-workspaces-v2.mjs', ['src/ui/runq-workspaces-v2.mjs', 'text/javascript; charset=utf-8']],
  ['/src/ui/runq-stagecraft-v4.css', ['src/ui/runq-stagecraft-v4.css', 'text/css; charset=utf-8']],
  ['/src/ui/runq-stagecraft-rebuild.css', ['src/ui/runq-stagecraft-rebuild.css', 'text/css; charset=utf-8']],
  ['/src/ui/operator-keymapping.css', ['src/ui/operator-keymapping.css', 'text/css; charset=utf-8']],
  ['/src/ui/cue-studio-integration.css', ['src/ui/cue-studio-integration.css', 'text/css; charset=utf-8']],
  ['/src/core/audioWaveform.mjs', ['src/core/audioWaveform.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/cueEntryPolicy.mjs', ['src/core/cueEntryPolicy.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/cueTimeEditing.mjs', ['src/core/cueTimeEditing.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/audioBatchImport.mjs', ['src/core/audioBatchImport.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/audioArchiveFormats.mjs', ['src/core/audioArchiveFormats.mjs', 'text/javascript; charset=utf-8']],
  ['/vendor/libarchive/libarchive.js', ['node_modules/libarchive.js/dist/libarchive.js', 'text/javascript; charset=utf-8']],
  ['/vendor/libarchive/worker-bundle.js', ['node_modules/libarchive.js/dist/worker-bundle.js', 'text/javascript; charset=utf-8']],
  ['/vendor/libarchive/libarchive.wasm', ['node_modules/libarchive.js/dist/libarchive.wasm', 'application/wasm']],
  ['/src/ui/audio-library-batch.css', ['src/ui/audio-library-batch.css', 'text/css; charset=utf-8']],
  ['/src/ui/operator-workbench.css', ['src/ui/operator-workbench.css', 'text/css; charset=utf-8']],
  ['/src/ui/runq-stagecraft-rebuild.mjs', ['src/ui/runq-stagecraft-rebuild.mjs', 'text/javascript; charset=utf-8']],
  ['/src/ui/operator-keymapping.mjs', ['src/ui/operator-keymapping.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/operatorKeymap.mjs', ['src/core/operatorKeymap.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/waveformPeaks.mjs', ['src/core/waveformPeaks.mjs', 'text/javascript; charset=utf-8']],
  ['/src/ui/i18n.mjs', ['src/ui/i18n.mjs', 'text/javascript; charset=utf-8']],
  ['/src/ui/locales/en.json', ['src/ui/locales/en.json', 'application/json; charset=utf-8']],
  ['/src/ui/locales/es.json', ['src/ui/locales/es.json', 'application/json; charset=utf-8']],
  ['/src/core/scriptLanguage.mjs', ['src/core/scriptLanguage.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/sceneAnalysis.mjs', ['src/core/sceneAnalysis.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/scriptNavigation.mjs', ['src/core/scriptNavigation.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/showPreflight.mjs', ['src/core/showPreflight.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/operatorQueue.mjs', ['src/core/operatorQueue.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/workspace.mjs', ['src/core/workspace.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/script.mjs', ['src/core/script.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/proposals.mjs', ['src/core/proposals.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/review.mjs', ['src/core/review.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/projectPersistence.mjs', ['src/core/projectPersistence.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/cueAutomation.mjs', ['src/core/cueAutomation.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/cuePlayback.mjs', ['src/core/cuePlayback.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/cueStopFades.mjs', ['src/core/cueStopFades.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/manualCues.mjs', ['src/core/manualCues.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/cueTracks.mjs', ['src/core/cueTracks.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/browserAudio.mjs', ['src/core/browserAudio.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/audioBackend.mjs', ['src/core/audioBackend.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/zipStore.mjs', ['src/core/zipStore.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/showArchive.mjs', ['src/core/showArchive.mjs', 'text/javascript; charset=utf-8']],
  ['/src/core/demoShow.mjs', ['src/core/demoShow.mjs', 'text/javascript; charset=utf-8']],
]);
export function createAppServer(options = {}) {
  const metaRoute = makeMetaRoute(options);
  const basetenRoute = makeBasetenRoute({
    modelClient: options.basetenClient,
    getKey: options.getBasetenKey,
  });
  const sfxRoute = makeSfxRoute(options);
  return createServer(async (request, response) => {
    const headers = {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
    };
    let pathname;
    try { pathname = new URL(request.url, 'http://127.0.0.1').pathname; }
    catch { response.writeHead(400, headers); response.end(); return; }
    if (await metaRoute(request, response, pathname, headers)) return;
    if (await basetenRoute(request, response, pathname, headers)) return;
    if (await sfxRoute(request, response, pathname, headers)) return;
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { ...headers, Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    const entry = allowed.get(pathname);
    if (!entry) { response.writeHead(404, headers); response.end(); return; }
    try {
      const data = await readFile(join(projectRoot, entry[0]));
      response.writeHead(200, { ...headers, 'Content-Type': entry[1], 'Content-Length': data.byteLength });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch {
      response.writeHead(500, headers);
      response.end('Local resource unavailable');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 5173);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error('PORT must be between 1024 and 65535');
    process.exitCode = 1;
  } else {
    await loadLocalSfxEnvironment();
    const server = createAppServer();
    server.once('error', error => {
      console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy; set PORT=5174` : error.message);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`ShowCompiler prototype at http://127.0.0.1:${port}`);
      console.log('Ctrl+C to stop. Local audio enabled; Meta AI requires MODEL_API_KEY and explicit permission.');
    });
  }
}
