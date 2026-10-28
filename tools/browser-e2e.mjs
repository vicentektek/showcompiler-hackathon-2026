/**
 * Browser acceptance smoke: real headless Chrome DOM interaction with a deterministic
 * in-memory AudioContext, not an audible hardware or professional latency test.
 * No model API, no paid inference, no browser-driver runtime dependency.
 * CI installs pinned playwright-core transiently, without changing project deps.
 */
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createAppServer } from './dev-server.mjs';
import { planScriptAnalysis } from '../src/core/sceneAnalysis.mjs';
import { readZipStore } from '../src/core/zipStore.mjs';
import { chromium } from 'playwright-core';

const server = createAppServer();
let browser;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const scriptErrors = [];
  page.on('pageerror', err => scriptErrors.push(err.message));
  const captureRunq = process.env.RUNQ_CAPTURE_UI === '1';
  const capture = async name => {
    if (!captureRunq) return;
    await mkdir('artifacts/runq-ui', { recursive: true });
    await page.screenshot({ path: 'artifacts/runq-ui/' + name, fullPage: false });
  };
  await page.addInitScript(() => {
    window.__testAudioStarts = 0;
    window.__testAudioStops = 0;
    window.__testStopTimes = [];
    class FakeAudioContext {
      constructor() { this.state = 'running'; this.currentTime = 1; this.destination = {}; }
      async resume() {}
      async close() { this.state = 'closed'; }
      async decodeAudioData() {
        const samples=new Float32Array(1200);
        for(let index=0;index<samples.length;index++)samples[index]=Math.sin(index/15)*.4;
        return {
          duration:3, numberOfChannels:1,length:samples.length,sampleRate:400,
          getChannelData(channel){if(channel!==0)throw new RangeError('channel');return samples;}
        };
      }
      createGain() {
        const gain = { value: 1, cancelScheduledValues() {},
          setValueAtTime(v) { this.value = v; },
          linearRampToValueAtTime(v) { this.value = v; } };
        return { gain, connect() {}, disconnect() {} };
      }
      createStereoPanner() {
        return {pan:{value:0},connect(){},disconnect(){}};
      }
      createBufferSource() {
        return { buffer: null, onended: null, playbackRate:{value:1}, connect() {}, disconnect() {},
          start() { window.__testAudioStarts += 1; },
          stop(time) { window.__testAudioStops += 1; window.__testStopTimes.push(time); } };
      }
    }
    window.AudioContext = FakeAudioContext;
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' && url.port === String(port)) {
      await route.continue();
    } else {
      await route.abort();
    }
  });
  await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'domcontentloaded' });
  // V8 composition contract: daylight Studio vs blackout Stage and a
  // subordinate voice dock. These are visual layout checks, not fake playback.
  assert.equal(await page.locator('html.rq8').count(),1);
  assert.equal(await page.locator('#rq8Identity').count(),1);
  const studioColor=await page.locator('main').evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.equal(studioColor,'rgb(232, 238, 244)','Studio should use a daylight editorial surface');
  assert.equal(await page.locator('.rq7-tasks').isVisible(),false,
    'V8 has one tool navigation rather than duplicate horizontal tool tabs');
  // Voice Follow: real DOM integration against a checked-in offline transcript.
  // This must never access audio playback, microphones or provider endpoints.
  await page.locator('[data-workspace-nav="rehearsal"]').click();
  assert.equal(await page.locator('#rqvfPanel').isVisible(),true);
  assert.equal(await page.locator('#rq8VoiceToggle').getAttribute('aria-expanded'),'false');
  const voiceDockPosition=await page.evaluate(()=>{
    const script=document.querySelector('.layout').getBoundingClientRect();
    const voice=document.querySelector('#rqvfPanel').getBoundingClientRect();
    return {scriptBottom:script.bottom,voiceTop:voice.top};
  });
  assert.ok(voiceDockPosition.voiceTop>=voiceDockPosition.scriptBottom-2,
    'V8 voice must dock below the script and real operator transport');
  await page.locator('#rq8VoiceToggle').click();
  assert.equal(await page.locator('#rq8VoiceToggle').getAttribute('aria-expanded'),'true');
  await page.locator('#rq8VoiceToggle').click();
  await page.locator('#rqvfAdvanced').evaluate(details=>{details.open=true;});
  await page.locator('#rqvfStep').click();
  await page.waitForFunction(()=>document.querySelector('#rqvfCounter')?.textContent==='1 / 4');
  assert.ok((await page.locator('#rqvfCue').textContent()).includes('C14'));
  assert.equal(await page.evaluate(()=>window.__testAudioStarts),0);
  await page.locator('#rqvfStep').click();
  await page.waitForFunction(()=>document.querySelector('#rqvfCounter')?.textContent==='2 / 4');
  assert.ok((await page.locator('#rqvfResult').textContent()).includes('No reliable cue match'));
  await page.locator('#rqvfStep').click();
  await page.waitForFunction(()=>document.querySelector('#rqvfCounter')?.textContent==='3 / 4');
  assert.ok((await page.locator('#rqvfCue').textContent()).includes('C15'));
  await capture('00-rehearsal-voice-follow.png');
  await page.locator('#rqvfReset').click();
  assert.equal(await page.locator('#rqvfCounter').textContent(),'0 / 0');
  await page.locator('[data-workspace-nav="home"]').click();
  assert.equal(await page.evaluate(()=>window.__testAudioStarts),0);
  // New visual shell must be present and its menus only navigate, never play.
  assert.equal(await page.locator('.runq-menu').count(), 6);
  await capture('01-home-1366.png');
  const railBounds = await page.locator('.workspace-nav').boundingBox();
  const contentBounds = await page.locator('main').boundingBox();
  assert.ok(railBounds && contentBounds && contentBounds.x > railBounds.x + railBounds.width - 2,
    'Desktop workspace rail is beside, not above, the editor');
  await page.locator('.runq-menu').nth(2).locator('summary').click();
  await page.locator('.runq-menu').nth(2).locator('button').filter({hasText:'Script'}).click();
  assert.equal(await page.locator('[data-workspace-nav="script"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>window.__testAudioStarts),0);
  await page.locator('[data-workspace-nav="home"]').click();
  assert.equal(await page.locator('[data-workspace-nav="home"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#homeDemoBtn').click();
  try {
    await page.waitForFunction(() => document.querySelector('#cuesCount')?.textContent === '3', null, { timeout: 10000 });
  } catch (error) {
    console.error('BROWSER_DIAGNOSTIC', JSON.stringify(await page.evaluate(() => ({
      status: document.querySelector('#statusMessage')?.textContent,
      count: document.querySelector('#cuesCount')?.textContent,
      hasCrypto: !!globalThis.crypto?.subtle,
      name: document.querySelector('#showName')?.value,
    }))));
    console.error('BROWSER_PAGE_ERRORS', JSON.stringify(scriptErrors));
    throw error;
  }
  assert.equal((await page.locator('#cueList .cue-item').count()), 3);
  assert.equal(await page.locator('#runqEditorToolbar').count(), 1);
  assert.equal(await page.locator('#cueList .cue-row-index').count(), 3);
  assert.equal(await page.locator('.runq-cue-columns').count(), 1);
  assert.equal(await page.locator('.shell').getAttribute('data-cue-density'), 'compact');
  await page.locator('#runqCueDensity').selectOption('standard');
  assert.equal(await page.locator('.shell').getAttribute('data-cue-density'), 'standard');
  await page.locator('#runqCueDensity').selectOption('compact');
  assert.equal(await page.evaluate(()=>window.__testAudioStarts), 0);
  const workspaceStates = await page.locator('[data-workspace-nav]').evaluateAll(buttons =>
    buttons.map(button => ({ name: button.dataset.workspaceNav,
      pressed: button.getAttribute('aria-pressed'), current: button.classList.contains('is-current') })));
  assert.deepEqual(workspaceStates.filter(state => state.pressed === 'true').map(state => state.name), ['cues'],
    'Exactly one workspace should be pressed when Cue Editor is active');
  assert.deepEqual(workspaceStates.filter(state => state.current).map(state => state.name), ['cues'],
    'Exactly one workspace should carry the current class');
  assert.equal(await page.locator('.rq5-stage-body .rq5-sequence-frame #cueList').count(),1,
    'Actual cue list must be mounted inside new Stagecraft sequence');
  assert.equal(await page.locator('.rq5-inspector-frame #cueInspector').count(),1,
    'Actual inspector must be mounted in the new dedicated pane');
  assert.equal(await page.locator('.rq5-transport-dock #operatorGoBtn').count(),1,
    'Stagecraft must rehome the existing operator GO, not duplicate it');
  assert.equal(await page.locator('#runqStagecraftNonexistentGo').count(),0);
  await capture('02-editor-1366.png');
  const readEditorGeometry = () => page.evaluate(() => {
    const left=document.getElementById('cueList').getBoundingClientRect();
    const right=document.getElementById('cueInspector').getBoundingClientRect();
    const go=document.getElementById('operatorGoBtn').getBoundingClientRect();
    const stop=document.getElementById('operatorPanicBtn').getBoundingClientRect();
    return {left:{x:left.x,right:left.right,width:left.width},right:{x:right.x,width:right.width},
      go:{top:go.top,bottom:go.bottom},stop:{top:stop.top,bottom:stop.bottom}};
  });
  const editorGeometry = await readEditorGeometry();
  assert.ok(editorGeometry.right.x >= editorGeometry.left.right-2, 'Inspector is right of cue list, not a third-row item');
  assert.ok(editorGeometry.left.width >= 280 && editorGeometry.right.width >= 250, 'Both panes remain usable');
  await page.setViewportSize({width:1093,height:614});
  await capture('07-editor-1093.png');
  const compactGeometry=await readEditorGeometry();
  assert.ok(compactGeometry.right.x >= compactGeometry.left.right-2,'Compact inspector stays next to cue list');
  assert.ok(compactGeometry.go.bottom <= 614 && compactGeometry.stop.bottom <= 614,
    'Compact GO and STOP ALL remain visible without scrolling');
  const visibleInspectorField=await page.locator('#cuePlaybackForm [name="gainDb"]').boundingBox();
  assert.ok(visibleInspectorField && visibleInspectorField.y < 614,
    'Compact inspector must show real editable audio settings without page scroll');
  await page.setViewportSize({width:1366,height:768});
  // Conversational cue editor: offline text -> draft -> correction -> apply -> undo.
  assert.equal(await page.locator('#rqCueChatPanel').isHidden(),true);
  const originalFade=await page.locator('#cuePlaybackForm [name="fadeInMs"]').inputValue();
  const originalGain=await page.locator('#cuePlaybackForm [name="gainDb"]').inputValue();
  await page.locator('.rq-chat-open').click();
  assert.equal(await page.locator('#rqCueChatPanel').isVisible(),true);
  await page.locator('#rqChatPrompt').fill('Pon un fade in de 3 segundos y volumen a -9 dB');
  await page.locator('#rqChatSubmit').click();
  await page.waitForFunction(()=>document.querySelectorAll('.rq-chat-change').length===2);
  assert.equal(await page.locator('#cuePlaybackForm [name="fadeInMs"]').inputValue(),originalFade,
    'Draft must not mutate cue');
  await page.locator('#rqChatPrompt').fill('Mejor que sean cuatro segundos');
  await page.locator('#rqChatSubmit').click();
  await page.waitForFunction(()=>document.querySelector('#rqChatDiff')?.textContent?.includes('4 s'));
  await page.locator('#rqChatApply').click();
  await page.waitForFunction(()=>document.querySelector('#cuePlaybackForm [name="fadeInMs"]')?.value==='4000');
  assert.equal(await page.locator('#cuePlaybackForm [name="gainDb"]').inputValue(),'-9');
  await page.locator('#rqChatUndo').click();
  await page.waitForFunction(expected=>document.querySelector('#cuePlaybackForm [name="fadeInMs"]')?.value===expected,originalFade);
  assert.equal(await page.locator('#cuePlaybackForm [name="gainDb"]').inputValue(),originalGain);
  await page.locator('#rqChatClose').click();
  assert.equal(await page.locator('#rqCueChatPanel').isHidden(),true);
  assert.equal(await page.evaluate(()=>window.__testAudioStarts),0,'Cue chat must never GO');

  assert.equal((await page.locator('#operatorGoBtn').isEnabled()), true);
  assert.match(await page.locator('#preparedCueStatus').innerText(), /1\s*[·.]/);
  assert.equal((await page.evaluate(() => window.__testAudioStarts)), 0);
  assert.equal(await page.locator('[data-workspace-nav="cues"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-workspace-nav="audio"]').click();
  assert.equal(await page.locator('[data-workspace-nav="audio"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-workspace-nav="cues"]').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#assetList .asset-list-row').count(), 3);
  assert.equal(await page.locator('#runqAudioOverview').count(), 1);
  assert.equal(await page.locator('#runqAssetCount').innerText(), '3');
  assert.equal(await page.locator('#runqReadyCount').innerText(), '3');
  assert.equal(await page.locator('.rq5-audio-library #assetList').count(),1);
  assert.equal(await page.locator('#rq5WaveCanvas').count(),1);
  await page.waitForFunction(()=>document.querySelector('#rq5WaveStatus')?.textContent?.includes('Decoded audio'));
  assert.equal(await page.locator('#rq5WaveChannels').innerText(),'1');
  assert.equal(await page.evaluate(()=>window.__testAudioStarts),0,
    'Decoding a read-only PCM waveform must never start audio');
  await capture('05-audio-1366.png');
  await page.locator('[data-workspace-nav="setup"]').click();
  assert.ok((await page.locator('#setupReadinessSummary').innerText()).includes('3/3'));
  await page.locator('[data-workspace-nav="cues"]').click();
  // Real cue-editor settings never execute audio merely by being saved.
  const inspector = page.locator('#cuePlaybackForm');
  await inspector.locator('.cue-wave-ms-advanced summary').click();
  assert.equal(await inspector.count(), 1);
  await inspector.locator('[name="gainDb"]').fill('-9');
  await inspector.locator('[name="fadeInMs"]').fill('250');
  await inspector.locator('[name="fadeOutMs"]').fill('500');
  await inspector.locator('[name="startDelayMs"]').fill('400');
  await inspector.locator('[name="startAtMs"]').fill('125');
  await inspector.locator('[name="playbackRate"]').fill('1.25');
  await inspector.locator('[name="pan"]').fill('-0.5');
  await inspector.getByRole('button', {name:'Save playback settings'}).click();
  assert.match(await page.locator('#statusMessage').innerText(), /Playback settings saved/);
  assert.equal(await page.locator('#cuePlaybackForm [name="fadeInMs"]').inputValue(),'250');
  assert.equal(await page.locator('#cueReplaceLibrary').count(),1);
  await page.locator('#cueReplaceLibrary').selectOption('asset-3');
  await page.getByRole('button',{name:'Use library audio'}).click();
  assert.match(await page.locator('#statusMessage').innerText(), /Audio assignment replaced/);
  await page.locator('#cueAddTrackSelect').selectOption('asset-2');
  await page.locator('#cueAddTrackBtn').click();
  assert.match(await page.locator('#statusMessage').innerText(), /Audio track added/);
  assert.equal(await page.locator('[data-extra-track="track-1"]').count(), 1);
  await page.locator('[data-extra-track="track-1"] .cue-track-details > summary').click();
  await page.locator('[data-track-settings="track-1"] [name="gainDb"]').fill('-12');
  await page.locator('[data-track-settings="track-1"] [name="startDelayMs"]').fill('1250');
  await page.locator('[data-track-settings="track-1"]').getByRole('button',{name:'Save track settings'}).click();
  assert.match(await page.locator('#statusMessage').innerText(), /Track settings saved/);
  assert.equal(await page.evaluate(() => window.__testAudioStarts), 0);
  const preparedBeforeNavigation = await page.locator('#preparedCueStatus').innerText();
  // Restored Stagecraft editor action: explicit Set next is visible only for
  // the selected cue. Merely clicking/inspecting does NOT reposition NEXT.
  assert.equal(await page.getByRole('button',{name:'Set next',exact:true}).count(),1);
  await page.locator('[data-workspace-nav="operation"]').click();
  await page.locator('#cueList [data-cue-select]').nth(1).click();
  assert.equal(await page.locator('#preparedCueStatus').innerText(),preparedBeforeNavigation,
    'Inspection in Live must not prepare NEXT');
  await page.locator('#cueList .cue-item.cue-selected .cue-operation-actions button').first().click();
  assert.match(await page.locator('#preparedCueStatus').innerText(), /2\s*[·.]/);
  assert.equal((await page.evaluate(() => window.__testAudioStarts)), 0);
  await page.locator('#operatorBackBtn').click();
  assert.equal(await page.locator('#preparedCueStatus').innerText(), preparedBeforeNavigation);
  await page.locator('[data-workspace-nav="cues"]').click();
  await page.locator('#cueSearchInput').fill('nonexistent-cue-xyz');
  assert.equal(await page.locator('#cueList .cue-item').count(), 0);
  assert.equal(await page.locator('#preparedCueStatus').innerText(), preparedBeforeNavigation);
  await page.locator('#cueSearchInput').fill('');
  assert.equal(await page.locator('#cueList .cue-item').count(), 3);
  await page.locator('[data-cue-select]').nth(1).click();
  assert.equal(await page.locator('#preparedCueStatus').innerText(), preparedBeforeNavigation);
  assert.equal(await page.locator('[data-cue-select]').nth(1).getAttribute('aria-pressed'),'true');
  // Keyboard selection is inspection-only. Moving through filtered cues
  // must not mutate GO position, emit audio, or rebuild the whole page.
  await page.locator('[data-cue-select]').nth(1).press('ArrowUp');
  assert.equal(await page.locator('[data-cue-select]').first().getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#preparedCueStatus').innerText(), preparedBeforeNavigation);
  await page.locator('[data-cue-select]').nth(1).click();
  await page.locator('[data-inspector-tab="actions"]').click();
  // Cue 2 is programmed to fade/stop cue 1 on its manually pressed GO.
  await page.locator('#cueTargetStopForm [data-stop-target="cue-1"]').check();
  await page.locator('#cueTargetStopForm [data-stop-fade="cue-1"]').fill('4');
  await page.locator('#cueTargetStopForm').getByRole('button',{name:'Save target actions'}).click();
  assert.match(await page.locator('#statusMessage').innerText(), /Target-stop actions saved/);
  await page.locator('[data-workspace-nav="script"]').click();
  assert.equal(await page.locator('#scriptPreview').isVisible(), true);
  assert.equal(await page.locator('.rq5-script-scenes').count(),1);
  await capture('08-script-rebuilt.png');
  // Rehearsal reuses real original script and operator queue simultaneously.
  // Merely visiting this view never starts or prepares a cue.
  const beforeRehearsalStarts=await page.evaluate(()=>window.__testAudioStarts);
  await page.locator('[data-workspace-nav="rehearsal"]').click();
  assert.equal(await page.locator('#scriptPreview').isVisible(),true);
  assert.equal(await page.locator('#operatorGoBtn').isVisible(),true);
  assert.equal(await page.locator('#preparedCueStatus').innerText(),preparedBeforeNavigation);
  assert.equal(await page.evaluate(()=>window.__testAudioStarts),beforeRehearsalStarts);
  await capture('09-rehearsal-manual.png');
  await page.locator('[data-workspace-nav="operation"]').click();
  assert.equal(await page.locator('main').evaluate(el=>getComputedStyle(el).backgroundColor),
    'rgb(10, 17, 25)','Stage must be a blackout console, distinct from Studio');
  await capture('03-operation-1366.png');
  assert.equal(await page.locator('#preparedCueStatus').innerText(), preparedBeforeNavigation);
  assert.equal((await page.locator('#operatorGoBtn').isEnabled()), true);
  await page.locator('#operatorGoBtn').click();
  await page.waitForFunction(() => window.__testAudioStarts >= 1);
  assert.match(await page.locator('#preparedCueStatus').innerText(), /2\s*[·.]/);
  assert.match(await page.locator('#operatorLastGo').innerText(), /1\s*[·.]/);
  assert.match(await page.locator('#operatorEffectSummary').innerText(), /STOP \/ FADE: 1/);
  assert.match(await page.locator('#operatorEffectSummary').innerText(), /4\.0 s/);
  const stopsBeforeTarget = await page.evaluate(()=>window.__testAudioStops);
  await page.locator('#operatorGoBtn').click();
  await page.waitForFunction(stops=>window.__testAudioStops>stops,stopsBeforeTarget);
  assert.ok(await page.evaluate(() => window.__testStopTimes.some(t => Math.abs(t - 5.02) < .01)));
  assert.match(await page.locator('#preparedCueStatus').innerText(), /3\s*[·.]/);
  assert.equal(await page.locator('#operatorPanicBtn').isEnabled(), true);
  await page.locator('#operatorPanicBtn').click();
  await page.waitForFunction(() => window.__testAudioStops >= 1);
  const downloadWait = page.waitForEvent('download');
  await page.locator('#saveBundleBtn').click();
  const download = await downloadWait;
  assert.ok(download.suggestedFilename().endsWith('.showcompiler.zip'));
  const zip = await readFile(await download.path());
  assert.ok(zip.length > 1000);
  const exportedProject = JSON.parse(new TextDecoder().decode(readZipStore(new Uint8Array(zip)).get('project.json')));
  const editedCueIndex = exportedProject.cues.findIndex(cue => cue.playback?.fadeInMs === 250);
  assert.ok(editedCueIndex >= 0, 'Edited playback is serialized in complete show ZIP');
  assert.equal(exportedProject.cues[editedCueIndex].playback.pan,-0.5);
  assert.equal(exportedProject.cues[editedCueIndex].playback.playbackRate,1.25);
  assert.equal(exportedProject.cues[editedCueIndex].playback.startAtMs,125);
  assert.deepEqual(exportedProject.cues[1].automation.stopCueIds,['cue-1']);
  assert.equal(exportedProject.cues[1].stopFadeOverrides['cue-1'],4000);
  assert.equal(exportedProject.cues[0].actions[0].assetId,'asset-3');
  assert.equal(exportedProject.cues[0].audioTracks[0].assetId,'asset-2');
  assert.equal(exportedProject.cues[0].audioTracks[0].playback.startDelayMs,1250);
  assert.equal(exportedProject.cues[0].audioTracks[0].playback.gainDb,-12);
  const startsBeforeZipOpen = await page.evaluate(() => window.__testAudioStarts);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#bundleFileInput').setInputFiles({
    name: 'roundtrip.showcompiler.zip', mimeType: 'application/zip', buffer: zip,
  });
  await page.waitForFunction(() => document.querySelector('#statusMessage')?.textContent?.includes('restored with 3 real audio files'));
  assert.equal((await page.locator('#cueList .cue-item').count()), 3);
  assert.equal((await page.locator('#operatorGoBtn').isEnabled()), true);
  assert.match(await page.locator('#preparedCueStatus').innerText(), /1\s*[·.]/);
  assert.equal((await page.evaluate(() => window.__testAudioStarts)), startsBeforeZipOpen);
  await page.locator('[data-workspace-nav="cues"]').click();
  await page.locator('[data-cue-select]').nth(editedCueIndex).click();
  assert.equal(await page.locator('#cuePlaybackForm [name="fadeInMs"]').inputValue(),'250');
  assert.equal(await page.locator('[data-extra-track="track-1"]').count(),1);
  await page.locator('[data-workspace-nav="operation"]').click();
  assert.equal(await page.locator('[data-cue-action="go"]').count(), 0);
  // V7 professional show desk: all cues remain navigable independently of
  // prepared NEXT, while no browse, jump or double-click can trigger GO.
  assert.equal(await page.locator('#rq7LiveNavigator').isVisible(),true,
    'Live full-list transport must be available in Operation');
  assert.equal(await page.locator('#rq7LiveInspector').isVisible(),true,
    'Operation offers an inspector without editable show fields');
  const v7Starts=await page.evaluate(()=>window.__testAudioStarts);
  const v7Prepared=await page.locator('#preparedCueStatus').innerText();
  await page.locator('#rq7JumpCue').fill('3');
  await page.locator('#rq7JumpButton').click();
  assert.match(await page.locator('#rq7LiveInspector').innerText(),/Q0*3/i);
  assert.equal(await page.locator('#preparedCueStatus').innerText(),v7Prepared,
    'Jump/inspect must never change NEXT');
  assert.equal(await page.evaluate(()=>window.__testAudioStarts),v7Starts,
    'Jump/inspect must never run audio');
  await page.locator('#cueList [data-cue-select]').nth(2).dblclick();
  assert.equal(await page.evaluate(()=>window.__testAudioStarts),v7Starts,
    'Double-clicking a cue never GO in V7');
  assert.equal(await page.locator('#preparedCueStatus').innerText(),v7Prepared,
    'Double-clicking a cue never prepares NEXT in V7');
  await page.locator('[data-rq7-action="return"]').click();
  assert.equal(await page.locator('#preparedCueStatus').innerText(),v7Prepared,
    'Return to NEXT is viewport navigation only');

  const queuedStop = page.locator('[data-cue-action="stop"]').first();
  assert.equal((await queuedStop.isDisabled()), true);
  assert.equal((await page.locator('#stopAllBtn').isEnabled()), true);
  const startsBeforeDirectGo = await page.evaluate(() => window.__testAudioStarts);
  await page.locator('#operatorGoBtn').click();
  await page.waitForFunction(starts => window.__testAudioStarts > starts, startsBeforeDirectGo);
  assert.match(await page.locator('#preparedCueStatus').innerText(), /2\s*[·.]/);
  const directStop=page.locator('#runqActiveCuesList [data-active-action="stop"]').first();
  assert.equal((await directStop.isEnabled()), true);
  assert.equal((await page.locator('#stopAllBtn').isEnabled()), true);
  await directStop.click();
  assert.equal((await page.locator('#stopAllBtn').isEnabled()), true);
  const beforeCorrupt = await page.evaluate(() => ({
    name: document.querySelector('#showName')?.value,
    script: document.querySelector('#scriptPreview')?.textContent,
    starts: window.__testAudioStarts,
  }));
  const corruptZip = Buffer.from(zip);
  corruptZip[44] ^= 0xff;
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#bundleFileInput').setInputFiles({
    name: 'tampered.showcompiler.zip', mimeType: 'application/zip', buffer: corruptZip,
  });
  await page.waitForFunction(() => document.querySelector('#statusMessage')?.textContent?.includes('Could not complete show ZIP'));
  assert.equal((await page.locator('#cueList .cue-item').count()), 3);
  assert.equal((await page.locator('#showName').inputValue()), beforeCorrupt.name);
  assert.equal((await page.locator('#scriptPreview').textContent()), beforeCorrupt.script);
  assert.equal((await page.evaluate(() => window.__testAudioStarts)), beforeCorrupt.starts);
  await page.locator('#operatorGoBtn').click();
  await page.waitForFunction(starts => window.__testAudioStarts > starts, beforeCorrupt.starts);
  assert.equal((await page.locator('#stopAllBtn').isEnabled()), true);
  await page.locator('#stopAllBtn').click();
  // Simulate a bounded provider request. The browser must show a truthful
  // indeterminate activity indicator and an operator-controlled repeat pass.
  // No request here can reach an external service or consume model credits.
  await page.route('**/api/meta/status', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      configured: true, model: 'muse-spark-1.3', provider: 'META_MODEL_API',
    }) });
  });
  let mockMetaCalls = 0;
  let sentDesignMode;
  let sentPerformanceKind;
  let sentDocumentKind;
  await page.route('**/api/meta/proposals', async route => {
    mockMetaCalls += 1;
    const request = route.request().postDataJSON();
    sentDesignMode = request.designMode;
    sentPerformanceKind = request.performanceKind;
    sentDocumentKind = request.documentKind;
    const plan = planScriptAnalysis(request.project.scriptText);
    const start = request.analysisWindowStart ?? 0;
    const selected = plan.windows.slice(start, start + 1);
    const end = start + selected.length;
    const ids = selected.flatMap(window => window.coreLines.map(line => line.id));
    await new Promise(resolve => setTimeout(resolve, 1200));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      provider: 'META_MODEL_API', model: 'muse-spark-1.3',
      proposals: [], proposalDetails: [], observations: [], duplicatesRemoved: 0,
      coverage: {
        totalLines: plan.coverage.totalLines,
        sceneCount: plan.coverage.sceneCount,
        totalWindows: plan.coverage.windowCount,
        batchStartWindow: start, batchEndWindowExclusive: end,
        analyzedWindowIds: selected.map(window => window.id),
        analyzedLineIds: ids, analyzedLines: ids.length,
        nextWindowStart: end < plan.windows.length ? end : null,
        complete: end === plan.windows.length,
      },
    }) });
  });
  await page.locator('[data-workspace-nav="ai"]').click();
  assert.equal(await page.locator('.rq5-ai-grid').count(),1);
  assert.equal(await page.locator('.rq5-ai-engine #modelProviderSelect').count(),1);
  assert.equal(await page.locator('.rq5-ai-review #proposalList').count(),1);
  await capture('10-ai-three-pane.png');
  await page.locator('#modelProviderSelect').selectOption('baseten');
  await page.locator('#modelProviderSelect').selectOption('meta');
  await page.waitForFunction(() => !document.querySelector('#analyzeMetaBtn')?.disabled);
  await page.locator('#metaDesignMode').selectOption('expressive');
  await page.locator('#performanceKindSelect').selectOption('gala');
  await page.locator('#documentKindSelect').selectOption('running_order');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#analyzeMetaBtn').click();
  await page.locator('#aiAnalysisActivity').waitFor({ state:'visible', timeout: 10000 });
  assert.equal(await page.locator('#analyzeMetaBtn').getAttribute('aria-busy'), 'true');
  assert.match(await page.locator('#aiAnalysisScope').innerText(), /window/);
  await page.waitForFunction(() => document.querySelector('#aiAnalysisElapsed')?.textContent?.includes('1 s'));
  await page.locator('#aiAnalysisActivity').waitFor({ state:'hidden', timeout: 10000 });
  assert.equal(mockMetaCalls, 1, 'one confirmation = one simulated request');
  assert.equal(sentDesignMode, 'expressive');
  assert.equal(sentPerformanceKind, 'gala');
  assert.equal(sentDocumentKind, 'running_order');
  assert.equal(await page.locator('#analyzeMetaBtn').isEnabled(), true);
  assert.match(await page.locator('#analyzeMetaBtn').innerText(), /another AI pass/);
  assert.equal(await page.evaluate(() => window.__testAudioStarts), beforeCorrupt.starts + 1,
    'Meta simulation and AI activity must never start another audio source');
  await page.locator('#uiLocaleSelect').selectOption('es');
  assert.ok((await page.locator('#scriptPreview').innerText()).includes('THE LAST CUE'));
  assert.match(await page.locator('#stopAllBtn').innerText(), /PARAR TODO/);
  assert.equal(await page.locator('.runq-menu').first().locator('summary').innerText(),'Archivo');
  await page.locator('[data-workspace-nav="audio"]').click();
  assert.equal(await page.locator('#runqAudioOverview .runq-audio-introduction strong').innerText(),'Espacio de recursos');
  await page.locator('[data-workspace-nav="operation"]').click();
  await page.setViewportSize({ width: 1093, height: 614 });
  await capture('04-operation-1093.png');
  // A manual-only show needs neither source script nor an AI analysis request.
  await page.locator('[data-workspace-nav="home"]').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#homeNewBtn').click();
  await page.locator('[data-workspace-nav="cues"]').click();
  assert.equal(await page.locator('#cueList .cue-item').count(),0);
  const beforeManual = await page.evaluate(()=>window.__testAudioStarts);
  await page.locator('#cueAddBtn').click();
  assert.equal(await page.locator('#cueList .cue-item').count(),1);
  await page.locator('#cueInsertBtn').click();
  await page.locator('#cueDuplicateBtn').click();
  assert.equal(await page.locator('#cueList .cue-item').count(),3);
  await page.locator('#cueMoveUpBtn').click();
  assert.equal(await page.evaluate(()=>window.__testAudioStarts),beforeManual);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#cueDeleteBtn').click();
  assert.equal(await page.locator('#cueList .cue-item').count(),2);
  assert.deepEqual(scriptErrors, []);
  console.log('BROWSER_SMOKE_OK: 3 original cue cards; manual GO; STOP ALL; complete ZIP download/reopen; tampered ZIP rollback preserves show/audio; UI locale change without script mutation; zero external provider calls.');
  await context.close();
} finally {
  try { if (browser) await browser.close(); } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
