import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAppServer } from '../tools/dev-server.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/ui/app.mjs', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/ui/style.css', import.meta.url), 'utf8');

test('browser wiring references only actual HTML element IDs', () => {
  const declared = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const used = [...client.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
  assert.ok(used.length > 20);
  for (const id of used) assert.ok(declared.has(id), `Missing HTML id: ${id}`);
});

test('prototype labels mock AI, real local audio and incomplete JSON packaging', () => {
  assert.match(html, /OPTIONAL META AI · REAL LOCAL AUDIO/);
  assert.match(html, /SOURCE TRACKED/);
  assert.match(html, /id="analyzeMetaBtn"/);
  assert.match(html, /id="modelProviderSelect"/);
  assert.match(html, /<option value="meta"[^>]*selected/);
  assert.match(html, /value="baseten"/);
  assert.match(html, /value="meta"/);
  assert.match(html, /id="metaCoverage"[^>]*aria-live="polite"/);
  assert.match(html, /id="uiLocaleSelect"/);
  assert.match(html, /id="scriptLanguageSelect"/);
  assert.match(html, /audio is not embedded in JSON/);
  assert.match(html, /id="stopAllBtn"/);
  assert.match(html, /id="audioFileInput"/);
  assert.match(css, /@media/);
});

test('frontend imports backend facade, never Web Audio engine directly', () => {
  assert.match(client, /from '\.\.\/core\/audioBackend\.mjs'/);
  assert.match(client, /from '\.\.\/core\/sceneAnalysis\.mjs'/);
  assert.doesNotMatch(client, /from '\.\.\/core\/browserAudio\.mjs'/);
});

test('scene coverage is transient and each Meta batch remains explicitly authorized', () => {
  assert.match(client, /metaWindowsPerRequest\s*=\s*2/);
  assert.match(client, /analysisWindowStart/);
  assert.match(client, /window\.confirm\(t\('status\.confirmMeta'/);
  assert.doesNotMatch(client, /show\s*=\s*\{[^}]*metaCoverage/s);
});

test('untrusted script and cue labels do not use innerHTML', () => {
  assert.doesNotMatch(client, /innerHTML\s*=/);
  assert.match(client, /textContent/);
});

test('HTTP server serves only its allowlisted local resources with restrictive headers', async (t) => {
  const server = createAppServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /SHOWCOMPILER/);
  assert.match(home.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.equal(home.headers.get('access-control-allow-origin'), null);
  const module = await fetch(base + '/src/core/workspace.mjs');
  assert.equal(module.status, 200);
  assert.match(module.headers.get('content-type'), /javascript/);
  const audioModule = await fetch(base + '/src/core/browserAudio.mjs');
  assert.equal(audioModule.status, 200);
  assert.match(await audioModule.text(), /class BrowserAudioEngine/);
  const enLocale = await fetch(base + '/src/ui/locales/en.json');
  assert.equal(enLocale.status, 200);
  assert.match(enLocale.headers.get('content-type'), /application\/json/);
  assert.equal((await enLocale.json())['top.panic'], 'STOP ALL');
  const esLocale = await fetch(base + '/src/ui/locales/es.json');
  assert.equal(esLocale.status, 200);
  assert.equal((await esLocale.json())['top.panic'], 'PARAR TODO');
  const i18nModule = await fetch(base + '/src/ui/i18n.mjs');
  assert.equal(i18nModule.status, 200);
  const scriptLanguageModule = await fetch(base + '/src/core/scriptLanguage.mjs');
  assert.equal(scriptLanguageModule.status, 200);
  const navigationModule = await fetch(base + '/src/core/scriptNavigation.mjs');
  assert.equal(navigationModule.status, 200);
  assert.match(await navigationModule.text(), /findScriptMatches/);
  const preflightModule = await fetch(base + '/src/core/showPreflight.mjs');
  assert.equal(preflightModule.status, 200);
  assert.match(await preflightModule.text(), /inspectShowReadiness/);
  const sceneAnalysisModule = await fetch(base + '/src/core/sceneAnalysis.mjs');
  assert.equal(sceneAnalysisModule.status, 200);
  assert.match(await sceneAnalysisModule.text(), /planScriptAnalysis/);
  const backendFacade = await fetch(base + '/src/core/audioBackend.mjs');
  assert.equal(backendFacade.status, 200);
  assert.match(await backendFacade.text(), /createBrowserAudioBackend/);
  const privateBaseten = await fetch(base + '/tools/basetenRoutes.mjs');
  assert.equal(privateBaseten.status, 404);
  const privateProvider = await fetch(base + '/src/core/basetenCueProvider.mjs');
  assert.equal(privateProvider.status, 404);
  const blocked = await fetch(base + '/tools/dev-server.mjs');
  assert.equal(blocked.status, 404);
  const post = await fetch(base + '/', { method: 'POST' });
  assert.equal(post.status, 405);
  const head = await fetch(base + '/index.html', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('client does not reach model providers directly or make calls on load', () => {
  assert.match(client, /\/api\/.*?status/);
  assert.match(client, /window\.confirm\(t\(/);
  assert.doesNotMatch(client, /inference\.baseten\.co|api\.meta\.ai/);
  assert.doesNotMatch(html, /BASETEN_API_KEY|MODEL_API_KEY/);
});

test('cue cards offer direct local audio choice and replacement without remote upload', () => {
  assert.match(client, /function pickAudioFile\(cueId = null\)/);
  assert.match(client, /function cueAudioPicker\(cueId, translationKey\)/);
  assert.match(client, /soundPlan\.loadFile/);
  assert.match(client, /soundPlan\.replaceFile/);
  assert.match(client, /linkLocalAudioToCue\(before, cueId, file\.name\)/);
  assert.match(client, /await player\.loadFile\(file, assetId\)/);
  assert.match(client, /generation !== projectGeneration \|\| show !== before/);
  assert.match(client, /transport\.activeCueCount \|\| transport\.pendingGoCount/);
  assert.match(client, /show = nextShow;/);
  assert.match(client, /audioInFlight/);
  assert.doesNotMatch(client, /fetch\([^\n]*file/);
});

test('script search, source links and preflight expose safe, actual UI controls', () => {
  assert.match(html, /id="scriptSearchInput"/);
  assert.match(html, /id="scriptSearchPrevBtn"/);
  assert.match(html, /id="scriptSearchNextBtn"/);
  assert.match(html, /id="checkPreflightBtn"/);
  assert.match(html, /id="preflightReport"/);
  assert.match(client, /sourceButton\(cue\.sourceLineIds\[0\]\)/);
  assert.match(client, /sourceButton\(proposal\.sourceLineIds\[0\]\)/);
  assert.match(client, /inspectShowReadiness\(show, assetId/);
  assert.match(client, /scriptWindow\(lines, scriptFocusLineId, maximumShownLines\)/);
  assert.match(client, /findScriptMatches\(lines, \$\('scriptSearchInput'\)\.value\)/);
  assert.doesNotMatch(client, /\.innerHTML\s*=/);
});

test('approved cue exposes safe editable operator details with no direct model execution', () => {
  assert.match(client, /function cueDetailsEditor\(cue\)/);
  assert.match(client, /updateCueOperatorDetails\(show, cue\.id/);
  assert.match(client, /notesInput\.maxLength = 1500/);
  assert.match(client, /triggerInput\.maxLength = 300/);
  assert.match(client, /t\('cue\.editDetails'\)/);
  assert.doesNotMatch(client, /\.innerHTML\s*=/);
});
