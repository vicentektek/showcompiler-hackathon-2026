/**
 * Browser acceptance smoke: real headless Chrome DOM interaction with a deterministic
 * in-memory AudioContext, not an audible hardware or professional latency test.
 * No model API, no paid inference, no browser-driver runtime dependency.
 * CI installs pinned playwright-core transiently, without changing project deps.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAppServer } from './dev-server.mjs';
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
      createBufferSource() {
        return { buffer: null, onended: null, connect() {}, disconnect() {},
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
  await page.locator('#audibleExampleBtn').click();
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
  assert.equal((await page.locator('#operatorGoBtn').isDisabled()), true);
  assert.equal((await page.evaluate(() => window.__testAudioStarts)), 0);
  await page.getByRole('button', { name: 'Prepare', exact: true }).first().click();
  assert.equal((await page.locator('#operatorGoBtn').isEnabled()), true);
  await page.locator('#operatorGoBtn').click();
  await page.waitForFunction(() => window.__testAudioStarts >= 1);
  assert.ok(await page.locator('#preparedCueStatus').innerText());
  await page.locator('#stopAllBtn').click();
  await page.waitForFunction(() => window.__testAudioStops >= 1);
  const downloadWait = page.waitForEvent('download');
  await page.locator('#saveBundleBtn').click();
  const download = await downloadWait;
  assert.ok(download.suggestedFilename().endsWith('.showcompiler.zip'));
  const zip = await readFile(await download.path());
  assert.ok(zip.length > 1000);
  const startsBeforeZipOpen = await page.evaluate(() => window.__testAudioStarts);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#bundleFileInput').setInputFiles({
    name: 'roundtrip.showcompiler.zip', mimeType: 'application/zip', buffer: zip,
  });
  await page.waitForFunction(() => document.querySelector('#statusMessage')?.textContent?.includes('restored with 3 real audio files'));
  assert.equal((await page.locator('#cueList .cue-item').count()), 3);
  assert.equal((await page.locator('#operatorGoBtn').isDisabled()), true);
  assert.equal((await page.evaluate(() => window.__testAudioStarts)), startsBeforeZipOpen);
  const directGo = page.locator('[data-cue-action="go"]').first();
  const directStop = page.locator('[data-cue-action="stop"]').first();
  assert.equal((await directGo.isEnabled()), true);
  assert.equal((await directStop.isDisabled()), true);
  assert.equal((await page.locator('#stopAllBtn').isDisabled()), true);
  const startsBeforeDirectGo = await page.evaluate(() => window.__testAudioStarts);
  await directGo.click();
  await page.waitForFunction(starts => window.__testAudioStarts > starts, startsBeforeDirectGo);
  assert.equal((await directGo.isDisabled()), true);
  assert.equal((await directStop.isEnabled()), true);
  assert.equal((await page.locator('#stopAllBtn').isEnabled()), true);
  await directStop.click();
  assert.equal((await directGo.isEnabled()), true);
  assert.equal((await page.locator('#stopAllBtn').isDisabled()), true);
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
  await directGo.click();
  await page.waitForFunction(starts => window.__testAudioStarts > starts, beforeCorrupt.starts);
  assert.equal((await page.locator('#stopAllBtn').isEnabled()), true);
  await page.locator('#stopAllBtn').click();
  await page.locator('#uiLocaleSelect').selectOption('es');
  assert.ok((await page.locator('#scriptPreview').innerText()).includes('THE LAST CUE'));
  assert.match(await page.locator('#stopAllBtn').innerText(), /PARAR TODO/);
  assert.deepEqual(scriptErrors, []);
  console.log('BROWSER_SMOKE_OK: 3 original cue cards; manual GO; STOP ALL; complete ZIP download/reopen; tampered ZIP rollback preserves show/audio; UI locale change without script mutation; zero external provider calls.');
  await context.close();
} finally {
  try { if (browser) await browser.close(); } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
