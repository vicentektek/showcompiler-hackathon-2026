import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAppServer } from '../tools/dev-server.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/ui/app.mjs', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/ui/style.css', import.meta.url), 'utf8');
const demoModule = readFileSync(new URL('../src/core/demoShow.mjs', import.meta.url), 'utf8');

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
  assert.match(html, /id="operatorPanicBtn"/);
  assert.match(client, /emergencyStopAllAudio/);
  assert.match(client, /player\.stopAll\(\)/);
  assert.match(html, /id="audioFileInput"/);
  assert.match(css, /@media/);
});

test('frontend imports backend facade, never Web Audio engine directly', () => {
  assert.match(client, /from '\.\.\/core\/audioBackend\.mjs'/);
  assert.match(client, /from '\.\.\/core\/sceneAnalysis\.mjs'/);
  assert.doesNotMatch(client, /from '\.\.\/core\/browserAudio\.mjs'/);
});

test('scene coverage is transient and each Meta batch remains explicitly authorized', () => {
  assert.match(client, /metaWindowsPerRequest\s*=\s*1/);
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
  assert.match(await home.text(), /RUNQ/);
  const runqTheme = await fetch(base + '/src/ui/runq-theme.css');
  assert.equal(runqTheme.status, 200);
  assert.match(runqTheme.headers.get('content-type'), /text\/css/);
  const runqMenu = await fetch(base + '/src/ui/runq-menu.mjs');
  assert.equal(runqMenu.status, 200);
  assert.match(runqMenu.headers.get('content-type'), /javascript/);
  const backdrop = await fetch(base + '/assets/runq-backstage.png');
  assert.equal(backdrop.status, 200);
  assert.equal(backdrop.headers.get('content-type'), 'image/png');
  assert.deepEqual([...new Uint8Array(await backdrop.arrayBuffer()).slice(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.match(home.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.equal(home.headers.get('access-control-allow-origin'), null);
  const module = await fetch(base + '/src/core/workspace.mjs');
  assert.equal(module.status, 200);
  assert.match(module.headers.get('content-type'), /javascript/);
  const audioModule = await fetch(base + '/src/core/browserAudio.mjs');
  assert.equal(audioModule.status, 200);
  assert.match(await audioModule.text(), /class BrowserAudioEngine/);
  const playbackModule = await fetch(base + '/src/core/cuePlayback.mjs');
  assert.equal(playbackModule.status, 200);
  assert.match(await playbackModule.text(), /normalizeCuePlayback/);
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
  const operatorModule = await fetch(base + '/src/core/operatorQueue.mjs');
  assert.equal(operatorModule.status, 200);
  assert.match(await operatorModule.text(), /prepareOperatorCue/);
  const automationModel = await fetch(base + '/src/core/cueAutomation.mjs');
  assert.equal(automationModel.status, 200);
  assert.match(await automationModel.text(), /normalizeCueAutomation/);
  const automationRuntime = await fetch(base + '/src/core/cueAutomationRuntime.mjs');
  assert.equal(automationRuntime.status, 404); // Not exposed until a safe runtime is wired.
  const preflightModule = await fetch(base + '/src/core/showPreflight.mjs');
  assert.equal(preflightModule.status, 200);
  assert.match(await preflightModule.text(), /inspectShowReadiness/);
  const sceneAnalysisModule = await fetch(base + '/src/core/sceneAnalysis.mjs');
  assert.equal(sceneAnalysisModule.status, 200);
  assert.match(await sceneAnalysisModule.text(), /planScriptAnalysis/);
  const backendFacade = await fetch(base + '/src/core/audioBackend.mjs');
  assert.equal(backendFacade.status, 200);
  assert.match(await backendFacade.text(), /createBrowserAudioBackend/);
  const setupController = await fetch(base + '/src/ui/setup-ui.mjs');
  assert.equal(setupController.status, 200);
  assert.match(await setupController.text(), /startMicrophoneTest/);
  const setupStyles = await fetch(base + '/src/ui/setup-ui.css');
  assert.equal(setupStyles.status, 200);
  assert.match(setupStyles.headers.get('content-type'), /text\/css/);
  const preferences = await fetch(base + '/src/core/operatorPreferences.mjs');
  assert.equal(preferences.status, 200);
  assert.match(await preferences.text(), /normalizeOperatorPreferences/);
  const bundle = await fetch(base + '/src/core/showArchive.mjs');
  assert.equal(bundle.status, 200);
  assert.match(await bundle.text(), /exportPortableShow/);
  const zip = await fetch(base + '/src/core/zipStore.mjs');
  assert.equal(zip.status, 200);
  const demo = await fetch(base + '/src/core/demoShow.mjs');
  assert.equal(demo.status, 200);
  const privatePayload = await fetch(base + '/tools/private-archive-upload');
  assert.equal(privatePayload.status, 404);
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
  assert.match(html, /id="preflightSummary"/);
  assert.match(html, /id="preflightIssues"/);
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
  assert.match(client, /panel\.append\(cueDetailsEditor\(cue\)\)/);
  assert.doesNotMatch(client, /\.innerHTML\s*=/);
});

test('manual operator queue is separate from source inspection and GO is guarded', () => {
  assert.match(html, /id="operatorGoBtn"[^>]*disabled/);
  assert.match(html, /id="operatorSkipBtn"[^>]*disabled/);
  assert.match(html, /id="operatorResetBtn"/);
  assert.match(client, /prepareOperatorCue\(operatorQueue, show\.cues, cue\.id\)/);
  assert.match(client, /await player\.go\(cue\)/);
  assert.match(client, /completePreparedCue\(operatorQueue,\s*show\.cues,\s*id\)/);
  assert.match(client, /skipPreparedCue\(operatorQueue, show\.cues\)/);
  assert.match(client, /operatorQueue = startOperatorQueue\(project\.cues\)/);
  assert.match(client, /lastGoCueId\s*=\s*id/);
  assert.match(client, /previousOperatorCue\(operatorQueue, show\.cues\)/);
  assert.match(html, /id="operatorBackBtn"/);
  assert.match(html, /id="operatorTrigger"/);
  assert.match(html, /id="operatorProgress"/);
  assert.doesNotMatch(client, /data\.cueAction === 'go'/);
  assert.doesNotMatch(client, /\.innerHTML\s*=/);
});

test('complete-show ZIP requires explicit local file selection and stages decode before project swap', () => {
  assert.match(html, /id="saveBundleBtn"/);
  assert.match(html, /id="openBundleBtn"/);
  assert.match(html, /id="bundleFileInput"/);
  assert.match(client, /exportPortableShow\(canonical, originalAudioFiles\)/);
  assert.match(client, /await loadCompleteZip\(new Uint8Array\(await file\.arrayBuffer\(\)\)\)/);
  assert.match(client, /const archive = await importPortableShow\(inputBytes\)/);
  assert.match(client, /await stage\.loadFile\(restoredFile, item\.assetId\)/);
  assert.match(client, /if \(!committed\)/);
  assert.match(client, /await stage\.dispose\(\)/);
  assert.match(client, /originalAudioFiles\.set\(assetId, file\)/);
  assert.doesNotMatch(client, /innerHTML\s*=/);
});

test('original rights-clear complete demo is callable offline from the browser UI', async () => {
  assert.match(html, /id="audibleExampleBtn"/);
  assert.match(client, /await buildDemoPackage\(\)/);
  assert.match(client, /await loadCompleteZip\(archive\)/);
  assert.match(client, /generation !== projectGeneration/);
  assert.match(demoModule, /buildDemoPackage/);
  assert.doesNotMatch(demoModule, /node:fs|node:path|node:url/);
});

test('same-output audition controls are distinct from GO and disclose routing limits', () => {
  assert.match(html, /id="stopAuditionBtn"/);
  assert.match(html, /id="assetList"/);
  assert.match(client, /player\.auditionAsset\(asset\.id\)/);
  assert.match(client, /player\.stopAudition\(\)/);
  assert.match(client, /audio\.auditionConfirm/);
  assert.match(client, /transport\.auditionActive \|\| transport\.auditionPending/);
  assert.match(client, /\!prepared \|\| audioInFlight \|\| auditioning/);
  assert.doesNotMatch(client, /\.innerHTML\s*=/);
});


test('Meta independent verifier is a transient, review-only UI with source links', () => {
  assert.match(html, /id="metaIndependentReview"/);
  assert.match(html, /id="metaIndependentReviewLines"/);
  assert.match(client, /applyMetaIndependentReview\(result\.independentReview, result\.coverage\)/);
  assert.match(client, /sourceButton\(lineId\)/);
  assert.doesNotMatch(client, /metaIndependentReview\s*=\s*show/);
});

test('cue rows and the show builder never display the internal pending-sound placeholder', () => {
  const builder = readFileSync(new URL('../src/ui/show-builder-ui.mjs', import.meta.url), 'utf8');
  const describe = client.slice(client.indexOf('function describeCueActions'), client.indexOf('function pickAudioFile'));
  assert.match(describe, /plannedAudioDetail\(action\.prompt\)/);
  assert.doesNotMatch(describe, /\+ ': ' \+ action\.prompt/);
  assert.match(builder, /isOperatorSoundPlaceholder\(action\.prompt\)/);
  assert.doesNotMatch(builder, /Operator sound selection pending/);
});

test('the Audio tab of a cue that still needs sound offers loading or assigning audio', () => {
  const source = client.slice(client.indexOf('function cueAudioSourceControls'), client.indexOf('function cueAdditionalTracksEditor'));
  const pending = source.slice(source.indexOf("action.type === 'PLAN_AUDIO'"));
  assert.ok(pending.length < source.length, 'pending-sound branch exists');
  assert.match(pending, /cueAudioPicker\(cue\.id, 'soundPlan\.loadFile'\)/);
  assert.match(pending, /cuePlanLibraryAssign\(cue\)/);
  const actions = client.slice(client.indexOf('function cueActionInspector'), client.indexOf('function cueAudioSourceControls'));
  assert.match(actions, /cuePlanLibraryAssign\(cue\)/, 'both tabs share one library-assign control');
});

test('the context inspector follows cue selections made by the app without overriding a proposal batch', () => {
  const context = readFileSync(new URL('../src/ui/runq-context-inspector.mjs', import.meta.url), 'utf8');
  const render = context.slice(context.indexOf('function render()'), context.indexOf('const pendingIds = new Set'));
  assert.match(render, /const appCueId = state\.selectedCueId \?\? null;/);
  assert.match(render, /if \(appCueId !== lastAppCueId\)/);
  assert.match(render, /!selectedProposalIds\.size/);
  assert.match(render, /kind: 'cue',\s*ids: \[appCueId\]/);
  assert.match(render, /lastAppCueId = null;/, 'a new project or generation forgets the previous app selection');
  const agentRead = client.slice(client.indexOf("'runq:agent-read'"));
  assert.match(agentRead.slice(0, 2000), /selectedCueId/);
});
