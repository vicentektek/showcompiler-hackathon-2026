/**
 * Explicit, offline V9 visual smoke for video preproduction.
 *
 * Captures layout and navigation ONLY. It deliberately does NOT claim to prove
 * Meta inference, hardware audio output, live mic recognition, or the final demo.
 * Not included in mass campaigns or the default npm test command.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createAppServer } from './dev-server.mjs';

const out = resolve('artifacts/video-smoke');
const server = createAppServer({ sfxConfig: () => ({ enabled: false }) });
let browser;
const evidence = {
  kind: 'UI_LAYOUT_ONLY_NOT_FUNCTIONAL_PROOF',
  runAt: new Date().toISOString(),
  viewport: { width: 1920, height: 1080 },
  captured: [], jsErrors: [], remoteRequests: [],
  caveats: ['No genuine Meta inference','No microphone or paid transcription',
    'No recorded acoustic waveform', 'No professional playback evidence'],
};
try {
  await new Promise((resolveReady, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveReady);
  });
  const port = server.address().port;
  browser = await chromium.launch({
    channel: 'chrome', headless: true, args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: evidence.viewport, deviceScaleFactor: 1 });
  page.on('pageerror', e => evidence.jsErrors.push(e.message));
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    const sameOrigin = u.hostname === '127.0.0.1' && u.port === String(port);
    const safeStatus = ['GET /api/meta/status','GET /api/sfx/status','GET /api/baseten/status']
      .includes(route.request().method() + ' ' + u.pathname);
    if (sameOrigin && (!u.pathname.startsWith('/api/') || safeStatus)) return route.continue();
    evidence.remoteRequests.push({ method: route.request().method(), path: u.pathname });
    return route.abort();
  });
  await page.goto('http://127.0.0.1:' + port + '/', { waitUntil:'domcontentloaded' });
  assert.equal(await page.locator('html.rq8').count(), 1, 'RunQ V8/V9 shell missing');
  assert.equal(await page.locator('html.rq9').count(), 1, 'RunQ V9 expected');
  assert.equal(await page.locator('#rq8Identity').count(), 1);
  await mkdir(out, { recursive: true });
  const captures = [
    ['S03-brand', 'home', '#rq8Identity'],
    ['S04-script-layout', 'script', '#scriptPreview'],
    ['S04-ai-layout', 'ai', '#proposalList'],
    ['S05-cue-editor-layout', 'cues', '#cueList'],
    ['S06-audio-library-layout', 'audio', '#importAudioBatchBtn'],
    ['S08-rehearsal-layout', 'rehearsal', '#rqvfPanel'],
    ['S09-operation-layout', 'operation', '#operatorGoBtn'],
  ];
  for (const [file, workspace, selector] of captures) {
    await page.locator('[data-workspace-nav="' + workspace + '"]').click();
    assert.equal(await page.locator(selector).count(),1,'Missing '+selector+' in '+workspace);
    assert.equal(await page.locator('[data-workspace-nav="' + workspace + '"]')
      .getAttribute('aria-pressed'), 'true');
    const png = file + '.png';
    await page.screenshot({ path: out + '/' + png, fullPage: false });
    evidence.captured.push({ file:png, workspace, expectedSelector:selector,
      proof:'Only that the UI is visible at 1920x1080' });
  }
  assert.equal(evidence.jsErrors.length,0,'Browser JS errors: '+evidence.jsErrors.join(', '));
  assert.equal(evidence.remoteRequests.length,0,'Unexpected network requests.');
  evidence.result='LAYOUT_SMOKE_OK';
  console.log('VIDEO_LAYOUT_SMOKE_OK: '+evidence.captured.length+' V9 stills; NO real AI/audio/voice claims.');
} catch (e) {
  evidence.result='LAYOUT_SMOKE_FAILED';
  evidence.failure=String(e.message || e);
  process.exitCode=1;
  console.error('VIDEO_LAYOUT_SMOKE_FAILED: '+evidence.failure);
} finally {
  await mkdir(out,{recursive:true});
  await writeFile(out + '/manifest.json',JSON.stringify(evidence,null,2)+'\n');
  if (browser) await browser.close();
  if (server.listening) await new Promise(r=>server.close(r));
}
