/**
 * Browser acceptance smoke: real headless Chrome DOM interaction with a deterministic
 * in-memory AudioContext, not an audible hardware or professional latency test.
 * No model API, no paid inference, no browser-driver runtime dependency.
 * CI installs pinned playwright-core transiently, without changing project deps.
 */
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createAppServer } from './dev-server.mjs';
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
    class FakeAudioContext {
      constructor() { this.state = 'running'; this.currentTime = 1; this.destination = {}; }
      async resume() {}
      async close() { this.state = 'closed'; }
      async decodeAudioData() { return { duration: 3, numberOfChannels: 1 }; }
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
          stop() { window.__testAudioStops += 1; } };
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
  await capture('02-editor-1366.png');
  assert.equal((await page.locator('#operatorGoBtn').isEnabled()), true);
  assert.match(await page.locator('#preparedCueStatus').innerText(), /1\s*[·.]/);
  assert.equal((await page.evaluate(() => window.__testAudioStarts)), 0);
  assert.equal(await page.locator('[data-workspace-nav="cues"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-workspace-nav="audio"]').click();
  assert.equal(await page.locator('#assetList .asset-list-row').count(), 3);
  assert.equal(await page.locator('#runqAudioOverview').count(), 1);
  assert.equal(await page.locator('#runqAssetCount').innerText(), '3');
  assert.equal(await page.locator('#runqReadyCount').innerText(), '3');
  await capture('05-audio-1366.png');
  await page.locator('[data-workspace-nav="setup"]').click();
  assert.ok((await page.locator('#setupReadinessSummary').innerText()).includes('3/3'));
  await page.locator('[data-workspace-nav="cues"]').click();
  // Real cue-editor settings never execute audio merely by being saved.
  const inspector = page.locator('#cuePlaybackForm');
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
  assert.equal(await page.evaluate(() => window.__testAudioStarts), 0);
  const preparedBeforeNavigation = await page.locator('#preparedCueStatus').innerText();
  // Moving to a different cue is deliberate, and never triggers audio.
  await page.locator('[data-workspace-nav="operation"]').click();
  await page.getByRole('button', { name: 'Set next', exact: true }).nth(1).click();
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
  await page.locator('#cueList [data-cue-select]').nth(1).click();
  assert.equal(await page.locator('#preparedCueStatus').innerText(), preparedBeforeNavigation);
  // Cue 2 is programmed to fade/stop cue 1 on its manually pressed GO.
  await page.locator('#cueInspector [data-inspector-tab="actions"]').click();
  await page.locator('#cueTargetStopForm [data-stop-target="cue-1"]').check();
  await page.locator('#cueTargetStopForm').getByRole('button',{name:'Save target actions'}).click();
  assert.match(await page.locator('#statusMessage').innerText(), /Target-stop actions saved/);
  await page.locator('[data-workspace-nav="script"]').click();
  assert.equal(await page.locator('#scriptPreview').isVisible(), true);
  assert.equal(await page.locator('#runqScriptContext').count(), 1);
  await capture('06-script-1366.png');
  await page.locator('[data-workspace-nav="operation"]').click();
  await capture('03-operation-1366.png');
  assert.equal(await page.locator('#preparedCueStatus').innerText(), preparedBeforeNavigation);
  assert.equal((await page.locator('#operatorGoBtn').isEnabled()), true);
  await page.locator('#operatorGoBtn').click();
  await page.waitForFunction(() => window.__testAudioStarts >= 1);
  assert.match(await page.locator('#preparedCueStatus').innerText(), /2\s*[·.]/);
  assert.match(await page.locator('#operatorLastGo').innerText(), /1\s*[·.]/);
  assert.match(await page.locator('#operatorEffectSummary').innerText(), /STOP \/ FADE: 1/);
  const stopsBeforeTarget = await page.evaluate(()=>window.__testAudioStops);
  await page.locator('#operatorGoBtn').click();
  await page.waitForFunction(stops=>window.__testAudioStops>stops,stopsBeforeTarget);
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
  await page.getByRole('button', {name:'Inspect',exact:true}).nth(editedCueIndex).click();
  assert.equal(await page.locator('#cuePlaybackForm [name="fadeInMs"]').inputValue(),'250');
  await page.locator('[data-workspace-nav="operation"]').click();
  assert.equal(await page.locator('[data-cue-action="go"]').count(), 0);
  const directStop = page.locator('[data-cue-action="stop"]').first();
  assert.equal((await directStop.isDisabled()), true);
  assert.equal((await page.locator('#stopAllBtn').isEnabled()), true);
  const startsBeforeDirectGo = await page.evaluate(() => window.__testAudioStarts);
  await page.locator('#operatorGoBtn').click();
  await page.waitForFunction(starts => window.__testAudioStarts > starts, startsBeforeDirectGo);
  assert.match(await page.locator('#preparedCueStatus').innerText(), /2\s*[·.]/);
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
  await page.locator('#uiLocaleSelect').selectOption('es');
  assert.ok((await page.locator('#scriptPreview').innerText()).includes('THE LAST CUE'));
  assert.match(await page.locator('#stopAllBtn').innerText(), /PARAR TODO/);
  assert.equal(await page.locator('.runq-menu').first().locator('summary').innerText(),'Archivo');
  await page.locator('[data-workspace-nav="audio"]').click();
  assert.equal(await page.locator('#runqAudioOverview .runq-audio-introduction strong').innerText(),'Espacio de recursos');
  await page.locator('[data-workspace-nav="operation"]').click();
  await page.setViewportSize({ width: 1093, height: 614 });
  await capture('04-operation-1093.png');
  assert.deepEqual(scriptErrors, []);
  console.log('BROWSER_SMOKE_OK: 3 original cue cards; manual GO; STOP ALL; complete ZIP download/reopen; tampered ZIP rollback preserves show/audio; UI locale change without script mutation; zero external provider calls.');
  await context.close();
} finally {
  try { if (browser) await browser.close(); } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
