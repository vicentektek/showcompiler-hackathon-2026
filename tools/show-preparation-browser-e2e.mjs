import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createAppServer } from './dev-server.mjs';
import { launchTestBrowser } from './browserTestRuntime.mjs';
import { planScriptAnalysis } from '../src/core/sceneAnalysis.mjs';
import { serializeShowProject } from '../src/core/projectPersistence.mjs';

globalThis.fetch = async () => { throw new Error('OFFLINE_PROVIDER_REQUEST_BLOCKED'); };
const app = createAppServer({
  getKey: () => undefined, getBasetenKey: () => undefined, getAgentKey: () => undefined,
  getBasetenAgentKey: () => undefined, getVoiceKey: () => undefined, getCueChatKey: () => undefined,
  sfxConfig: () => ({ enabled: false }),
});
const handler = app.listeners('request')[0];
let escaped = 0;
const server = createServer((request, response) => {
  if (request.url.startsWith('/api/')) {
    escaped++; response.writeHead(403, { 'Content-Type': 'application/json' });
    response.end('{"code":"OFFLINE_GUARD"}'); return;
  }
  handler(request, response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const script = 'SCENE 1. ROOM\n(A bell rings.)\nANA: Ready.\n\nSCENE 2. STREET\n(Wind blows outside.)';
function wav() {
  const frames = 16000, b = Buffer.alloc(44 + frames * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) b.writeInt16LE(Math.round(Math.sin(i / 12) * 4000), 44 + i * 2);
  return b;
}
let browser;
try {
  ({ browser } = await launchTestBrowser());
  for (const locale of ['es', 'en']) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = [], metaCalls = [], starts = [], jobs = new Map();
    let reviews = 0, mode = 'ready', maxActive = 0, active = 0, changedPolicy = false, metaDelay = 0, statusDelay = 0;
    const audio = wav();
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => void d.accept());
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname;
      const json = (body, status = 200) => route.fulfill({ status, json: body });
      if (url.origin !== origin) { escaped++; return route.abort(); }
      if (!path.startsWith('/api/')) return route.continue();
      if (path === '/api/meta/status') return json({ configured: true, provider: 'META_MODEL_API', model: 'offline-muse' });
      if (path === '/api/sfx/status') {
        if (statusDelay) await new Promise(resolve => setTimeout(resolve, statusDelay));
        return json({ enabled: true, estimatedMaxCostUsdPerRequest: 0.05,
          dailyBudgetUsd: changedPolicy ? 0.01 : 0.5, maxDailyStarts: 10, modelRevision: 'a'.repeat(40) });
      }
      if (path === '/api/agent/status') return json({ configured: true, provider: 'meta' });
      if (path === '/api/meta/proposals') {
        const body = req.postDataJSON(); metaCalls.push(body);
        if (metaDelay) await new Promise(resolve => setTimeout(resolve, metaDelay));
        const plan = planScriptAnalysis(body.project.scriptText), start = body.analysisWindowStart;
        const window = plan.windows[start], ids = window.coreLines.map(l => l.id);
        const proposals = window.coreLines.filter(l => /bell|Wind/.test(l.text)).map(l => ({
          lineId: l.id, label: /bell/.test(l.text) ? 'Bell' : 'Wind',
          soundPrompt: /bell/.test(l.text) ? 'a single bell rings' : 'wind blowing outside',
        }));
        return json({ provider: 'META_MODEL_API', proposals, observations: [], duplicatesRemoved: 0,
          coverage: { totalLines: plan.coverage.totalLines, sceneCount: plan.coverage.sceneCount,
            totalWindows: plan.windows.length, batchStartWindow: start, batchEndWindowExclusive: start + 1,
            analyzedWindowIds: [window.id], analyzedLineIds: ids, analyzedLines: ids.length,
            nextWindowStart: start + 1 < plan.windows.length ? start + 1 : null, complete: start + 1 === plan.windows.length } });
      }
      if (path === '/api/sfx/jobs' && req.method() === 'GET') return json({ jobs: [...jobs.values()] });
      if (path === '/api/sfx/jobs' && req.method() === 'POST') {
        const input = req.postDataJSON(); starts.push(input);
        assert.equal(input.confirmed, true); assert.equal(input.acknowledgedMaxCostUsd, 0.05);
        assert.ok(input.prompt.trim()); assert.ok(input.durationSeconds <= 12);
        active++; maxActive = Math.max(maxActive, active);
        if (mode === 'failure') { active--; return json({ code: 'SFX_DAILY_LIMIT' }, 429); }
        const job = { ...input, status: 'QUEUED', modelCandidate: 'stabilityai/stable-audio-3-small-sfx',
          modelRevision: 'a'.repeat(40), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          cost: { estimatedMaxCostUsd: 0.05, actualBilledUsd: null },
          wav: { fileName: input.requestId + '.wav', sha256: createHash('sha256').update(audio).digest('hex'),
            byteLength: audio.length, durationSeconds: 1, sampleRateHz: 16000, channels: 1 } };
        jobs.set(input.requestId, job); return json(job);
      }
      const match = /^\/api\/sfx\/jobs\/([^/]+)(?:\/(refresh|audio|review))?$/.exec(path);
      if (match) {
        const job = jobs.get(match[1]);
        if (!job) return json({ code: 'SFX_NOT_FOUND' }, 404);
        if (match[2] === 'refresh' && mode !== 'hold') { job.status = 'READY_FOR_REVIEW'; active = 0; }
        if (match[2] === 'audio') return route.fulfill({ status: 200, contentType: 'audio/wav', body: audio });
        if (match[2] === 'review') { reviews++; job.status = 'ACCEPTED_FOR_MANUAL_IMPORT'; }
        return json(job);
      }
      return json({ configured: false, enabled: false, code: 'OFFLINE_DISABLED' });
    });
    const read = () => page.evaluate(() => {
      let s; document.dispatchEvent(new CustomEvent('runq:agent-read', { detail: { respond: v => { s = v; } } })); return s;
    });
    const importScript = async (name = 'batch-original.txt') => {
      await page.locator('#scriptFileInput').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(script) });
      await page.locator('[data-workspace-nav="ai"]').click();
    };
    await page.goto(origin);
    await page.locator('#uiLocaleSelect').selectOption(locale);
    await importScript();
    await page.waitForFunction(() => document.querySelector('#rqPrepareShow') &&
      !document.querySelector('#rqPrepareShow').disabled);
    const toolbarBounds = await page.locator('#rqPrepareShow').boundingBox();
    assert.ok(toolbarBounds.y >= 0 && toolbarBounds.y + toolbarBounds.height < 900,
      'Primary preparation action is discoverable without scrolling');
    await page.locator('#rqPrepareShow').click();
    await page.waitForFunction(() => document.querySelector('#rqPreparationStatus')?.textContent.match(/Guion analizado|Script analyzed/));
    assert.equal(metaCalls.length, planScriptAnalysis(script).windows.length);
    assert.deepEqual(metaCalls.map(c => c.analysisWindowStart), [0, 1]);
    assert.equal((await read()).project.cues.length, 0, 'Full-show generation pauses before human proposal approval');
    assert.equal(starts.length, 0);
    assert.equal((await read()).project.proposals.length, 2);
    await page.locator('#rqAcceptAllCues').click();
    await page.locator('.rq-preparation-dialog').waitFor({ state: 'visible' });
    assert.equal((await read()).project.cues.length, 2);
    assert.equal(starts.length, 0, 'Approval does not authorize audio');
    await page.locator('#rqStartAudioBatch').click();
    assert.match(await page.locator('#rqBatchError').textContent(), /autoriza|authorize/);
    assert.equal(starts.length, 0);
    await page.locator('#rqBatchAuthorize').check();
    await page.locator('#rqStartAudioBatch').click();
    await page.waitForFunction(() => document.querySelector('#rqPreparationStatus')?.textContent.match(/2\/2 tomas generadas|2\/2 takes generated/));
    assert.equal(starts.length, 2); assert.equal(maxActive, 1);
    assert.equal(reviews, 0); assert.equal((await read()).project.assets.length, 0);
    const cue1 = (await read()).project.cues[0];
    await page.locator('[data-batch-review]').first().click();
    await page.waitForFunction(() => !document.querySelector('#sfxListenBtn')?.disabled);
    assert.equal(await page.locator('#acceptBtn').isEnabled(), false, 'Human audition still required');
    await page.locator('#sfxListenBtn').click();
    await page.waitForFunction(() => !document.querySelector('#acceptBtn')?.disabled);
    await page.locator('#sfxStopPreviewBtn').click();
    await page.locator('#acceptBtn').click();
    await page.waitForFunction(() => {
      let s; document.dispatchEvent(new CustomEvent('runq:agent-read', { detail: { respond: v => { s = v; } } }));
      return s?.project.assets.length === 1;
    });
    assert.equal((await read()).project.cues[0].id, cue1.id);
    assert.equal((await read()).project.cues[0].actions[0].type, 'PLAY');
    assert.equal(reviews, 1);
    await page.locator('[data-workspace-nav="ai"]').click();
    assert.equal(await page.locator('#rqGenerateAllAudio').isEnabled(), false, 'Existing ready take is not generated again');
    const saved = (await read()).project;
    const savedJson = serializeShowProject(saved);
    await page.reload();
    await page.locator('#projectFileInput').setInputFiles({
      name: 'restored-batch.json', mimeType: 'application/json', buffer: Buffer.from(savedJson),
    });
    await page.waitForFunction(() => {
      let s; document.dispatchEvent(new CustomEvent('runq:agent-read', { detail: { respond: v => { s = v; } } }));
      return s?.project.assets.length === 1;
    });
    await page.locator('[data-workspace-nav="ai"]').click();
    assert.equal((await read()).project.scriptText, script);
    assert.deepEqual((await read()).project.cues.map(c => [c.id, c.sourceLineIds]), saved.cues.map(c => [c.id, c.sourceLineIds]));
    assert.equal(await page.locator('#rqGenerateAllAudio').isEnabled(), false, 'Reload and JSON reopening recover batch references without duplicate requests');
    assert.equal(await page.locator('[data-batch-review]:enabled').count(), 1, 'Unimported take remains manually reviewable after reopening');
    await mkdir('artifacts\\bulk-preparation', { recursive: true });
    await page.screenshot({ path: 'artifacts\\bulk-preparation\\completed-' + locale + '.png' });

    // New project with the same cue IDs must not receive or repeat the old batch.
    await importScript('batch-cancel.txt');
    await page.locator('#rqPrepareShow').click();
    await page.waitForFunction(() => document.querySelector('#rqPreparationStatus')?.textContent.match(/Guion analizado|Script analyzed/));
    await page.locator('#rqAcceptAllCues').click();
    await page.locator('.rq-preparation-dialog').waitFor({ state: 'visible' });
    mode = 'hold'; const beforeCancel = starts.length;
    const submitted = page.waitForResponse(r => new URL(r.url()).pathname === '/api/sfx/jobs' && r.request().method() === 'POST');
    await page.locator('#rqBatchAuthorize').check(); await page.locator('#rqStartAudioBatch').click();
    await submitted;
    await page.waitForFunction(() => !document.querySelector('#rqCancelPreparation')?.hidden);
    await page.locator('[data-workspace-nav="cues"]').click();
    await page.locator('#stopAllBtn').click();
    await page.waitForFunction(() => document.querySelector('#rqCancelPreparation')?.hidden);
    await page.waitForTimeout(2200);
    assert.equal(starts.length, beforeCancel + 1, 'STOP ALL invalidates the remaining batch');
    assert.equal((await read()).project.assets.length, 0);

    await importScript('batch-failure.txt');
    mode = 'failure';
    changedPolicy = true;
    await page.locator('#rqPrepareShow').click();
    await page.waitForFunction(() => document.querySelector('#rqPreparationStatus')?.textContent.match(/Guion analizado|Script analyzed/));
    await page.locator('#rqAcceptAllCues').click();
    await page.locator('#rqBatchAuthorize').check();
    const beforeFailure = starts.length;
    await page.locator('#rqStartAudioBatch').click();
    assert.match(await page.locator('#rqBatchError').textContent(), /límite diario|daily ceiling/);
    assert.equal(starts.length, beforeFailure, 'Known daily ceiling blocks before any request');
    await page.locator('#rqCloseAudioBatch').click();
    changedPolicy = false;
    await page.locator('[data-workspace-nav="audio"]').click();
    await page.locator('[data-rq10-sound-tab="generate"]').click();
    await page.locator('#rqSoundGenerateAllAudio').click();
    await page.locator('.rq-preparation-dialog').waitFor({ state: 'visible' });
    await page.locator('#rqBatchAuthorize').check();
    const rejected = page.waitForResponse(r => new URL(r.url()).pathname === '/api/sfx/jobs' && r.request().method() === 'POST');
    await page.locator('#rqStartAudioBatch').click();
    await rejected;
    await page.waitForFunction(() => document.querySelector('#rqCancelPreparation')?.hidden);
    await page.waitForTimeout(250);
    assert.equal(starts.length, beforeFailure + 1, '429 stops the batch without retries');
    assert.equal((await read()).project.assets.length, 0);

    await importScript('batch-late-meta.txt');
    metaDelay = 800;
    const beforeLate = metaCalls.length;
    const analyzing = page.waitForRequest(r => new URL(r.url()).pathname === '/api/meta/proposals');
    await page.locator('[data-workspace-nav="home"]').click();
    await page.locator('#rqHomePrepareShow').click();
    await analyzing;
    await importScript('replacement-while-analyzing.txt');
    await page.waitForTimeout(1000);
    assert.equal(metaCalls.length, beforeLate + 1, 'Replacement invalidates later Meta windows');
    assert.equal((await read()).project.proposals.length, 0, 'Late Meta response cannot mutate replacement show');
    metaDelay = 0;

    await page.locator('#rqPrepareShow').click();
    await page.waitForFunction(() => document.querySelector('#rqPreparationStatus')?.textContent.match(/Guion analizado|Script analyzed/));
    await page.locator('#rqAcceptAllCues').click();
    await page.locator('.rq-preparation-dialog').waitFor({ state: 'visible' });
    mode = 'hold';
    const beforeButtonCancel = starts.length;
    const cancelSubmitted = page.waitForResponse(r => new URL(r.url()).pathname === '/api/sfx/jobs' && r.request().method() === 'POST');
    await page.locator('#rqBatchAuthorize').check();
    await page.locator('#rqStartAudioBatch').click();
    await cancelSubmitted;
    await page.locator('#rqCancelPreparation').click();
    await page.waitForFunction(() => document.querySelector('#rqCancelPreparation')?.hidden);
    await page.waitForTimeout(2200);
    assert.equal(starts.length, beforeButtonCancel + 1, 'Cancel button prevents remaining audio requests');
    for (const job of jobs.values()) if (job.status === 'QUEUED') job.status = 'READY_FOR_REVIEW';
    active = 0; // The already submitted remote fixture finishes without another generation.
    await page.locator('[data-workspace-nav="audio"]').click();
    await page.locator('[data-rq10-sound-tab="generate"]').click();
    await page.locator('#rqSoundGenerateAllAudio').click();
    await page.locator('.rq-preparation-dialog').waitFor({ state: 'visible' });
    const soundSubmitted = page.waitForResponse(r => new URL(r.url()).pathname === '/api/sfx/jobs' && r.request().method() === 'POST');
    await page.locator('#rqBatchAuthorize').check();
    await page.locator('#rqStartAudioBatch').click();
    await soundSubmitted;
    await page.locator('#rqSoundCancelPreparation').click();
    await page.waitForFunction(() => document.querySelector('#rqSoundCancelPreparation')?.hidden);
    assert.equal(starts.length, beforeButtonCancel + 2, 'Sound desk exposes its own cancel action and does not resend uncertain take');

    await importScript('batch-plan-cancel.txt');
    await page.locator('#rqPrepareShow').click();
    await page.waitForFunction(() => document.querySelector('#rqPreparationStatus')?.textContent.match(/Guion analizado|Script analyzed/));
    statusDelay = 800;
    const checking = page.waitForRequest(r => new URL(r.url()).pathname === '/api/sfx/status');
    await page.locator('#rqAcceptAllCues').click();
    await checking;
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('runq:operator-stop-all')));
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('.rq-preparation-dialog').isVisible(), false, 'STOP ALL prevents a late budget response from opening an authorization dialog');
    assert.equal(starts.length, beforeButtonCancel + 2);
    const events = await page.evaluate(() => {
      let e; document.dispatchEvent(new CustomEvent('runq:show-event-read', { detail: { respond: v => { e = v; } } })); return e;
    });
    assert.equal(events.filter(e => e.type === 'CUE_STARTED').length, 0);
    assert.deepEqual(errors, []);
    assert.equal(escaped, 0);
    console.log(`PASS bulk preparation ${locale}: visible controls, review gates, serial audio, audition/import, reopen, budget, cancel, STOP ALL, 429, late Meta, no GO`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
