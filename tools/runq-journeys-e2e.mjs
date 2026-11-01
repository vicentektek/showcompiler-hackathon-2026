#!/usr/bin/env node
/**
 * RUNQ F4 virtual-operator journeys (offline, resumable).
 *
 * Real headless Chrome drives the real RUNQ UI end to end as four personas
 * (beginner, intermediate, stage manager, creative) in ES/EN on five
 * viewports. Every provider endpoint is mocked inside the browser; the local
 * guard server answers 403 to any /api request that escapes the mocks and the
 * Node process refuses outbound fetch. Web Audio is a deterministic fake:
 * these journeys measure workflow, state and persistence, NOT audible sound,
 * real Meta quality, real Modal generation or live-show certification.
 *
 * Usage:
 *   node tools/runq-journeys-e2e.mjs --out <dir> [--only full-show|recovery|manual-show]
 *     [--persona beginner|intermediate|stage-manager|creative] [--locale es|en]
 *     [--limit N] [--concurrency 3] [--resume] [--trace on-failure|off] [--screens failures|all]
 * Final line: unique=N journeys=N checks=N failed=N completed=x/y forbidden=N
 */
import { createServer } from 'node:http';
import { mkdir, writeFile, readFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import { createAppServer } from './dev-server.mjs';
import { launchTestBrowser } from './browserTestRuntime.mjs';
import { planScriptAnalysis } from '../src/core/sceneAnalysis.mjs';
import { importPortableShow } from '../src/core/showArchive.mjs';
import { approvedDetailCoverage } from '../src/core/soundPromptCompiler.mjs';

let nodeFetchAttempts = 0;
globalThis.fetch = async () => {
  nodeFetchAttempts += 1;
  throw new Error('RUNQ journeys are offline: outbound fetch is blocked');
};

export const PERSONAS = ['beginner', 'intermediate', 'stage-manager', 'creative'];
export const LOCALES = ['es', 'en'];
export const VIEWPORTS = ['1920x1080', '1440x900', '1366x768', '1280x720', '1024x768'];
export const JOURNEY_TYPES = ['full-show', 'recovery', 'manual-show'];

export const SCRIPTS = {
  es: {
    file: 'travesia.txt',
    lines: [
      'ESCENA 1. MUELLE DEL PUERTO, AMANECER',
      '(Gaviotas sobre el agua. Una sirena de niebla suena a lo lejos.)',
      'MARTA: El ferry llega tarde otra vez.',
      'TOMÁS: Siempre llega tarde cuando hay niebla.',
      '(Las campanas del faro repican tres veces.)',
      'MARTA: Entonces subamos antes de que zarpe.',
      '',
      'ESCENA 2. CUBIERTA DEL FERRY',
      '(El viento golpea las lonas y cruje la madera.)',
      'TOMÁS: Agárrate fuerte, el mar está bravo.',
      'MARTA: Mira, allí se ve la isla.',
      '(Una tormenta lejana retumba sobre el mar.)',
      'TOMÁS: Llegaremos antes de que empiece a llover.',
    ],
    trigger: 'siempre llega tarde cuando hay niebla',
    notes: 'Entrar con la última palabra de Tomás; loop hasta la salida de Marta.',
    proposals: {
      L2: ['Gaviotas y sirena de niebla', 'gaviotas sobre el puerto y una sirena de niebla lejana'],
      L3: ['Ambiente de muelle', 'murmullo de muelle con agua contra el casco'],
      L5: ['Campanas del faro', 'tres toques claros de campana de faro'],
      L9: ['Viento en las lonas', 'viento golpeando lonas y madera que cruje'],
      L12: ['Tormenta lejana', 'trueno lejano retumbando sobre el mar'],
    },
  },
  en: {
    file: 'crossing.txt',
    lines: [
      'SCENE 1. HARBOUR PIER, DAWN',
      '(Gulls over the water. A foghorn sounds in the distance.)',
      'MARTA: The ferry is late again.',
      'TOMAS: It is always late when there is fog.',
      '(The lighthouse bells ring three times.)',
      'MARTA: Then let us board before it sails.',
      '',
      'SCENE 2. FERRY DECK',
      '(Wind slaps the canvas and the timber creaks.)',
      'TOMAS: Hold on tight, the sea is rough.',
      'MARTA: Look, you can see the island.',
      '(A distant storm rumbles over the sea.)',
      'TOMAS: We will arrive before the rain starts.',
    ],
    trigger: 'it is always late when there is fog',
    notes: 'Enter on Tomas last word; loop until Marta exits.',
    proposals: {
      L2: ['Gulls and foghorn', 'gulls over the harbour and a distant foghorn'],
      L3: ['Pier ambience', 'quiet pier murmur with water against the hull'],
      L5: ['Lighthouse bells', 'three clear lighthouse bell strikes'],
      L9: ['Wind in the canvas', 'wind slapping canvas and creaking timber'],
      L12: ['Distant storm', 'distant thunder rumbling over the sea'],
    },
  },
};
for (const script of Object.values(SCRIPTS)) script.text = script.lines.join('\n');

const MENU = {
  en: { new: 'New show', openZip: 'Open portable show', saveZip: 'Export complete show' },
  es: { new: 'Nuevo espectáculo', openZip: 'Abrir espectáculo ZIP', saveZip: 'Exportar espectáculo completo' },
};
const TEXT = {
  en: { rate: '(429)', bundleFailed: 'Could not complete show ZIP' },
  es: { rate: '(429)', bundleFailed: 'No se pudo completar el paquete ZIP' },
};

export function buildMatrix() {
  const specs = [];
  for (const type of JOURNEY_TYPES)
    for (const persona of PERSONAS)
      for (const locale of LOCALES)
        for (const viewport of VIEWPORTS)
          specs.push({ id: `${type}-${persona}-${locale}-${viewport}`, type, persona, locale, viewport });
  return specs;
}

export function makeWav(seed = 15, seconds = 1) {
  const sampleRate = 16000, frames = Math.round(sampleRate * seconds);
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8);
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) bytes.writeInt16LE(Math.round(Math.sin(i / seed) * 5000), 44 + i * 2);
  return bytes;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const normalizeText = value => String(value ?? '').replace(/\r\n/g, '\n').replace(/\n+$/, '');

class CheckFailure extends Error {}

/** Browser-side deterministic Web Audio. onended never fires: cues stay active until STOP. */
function fakeAudioInit() {
  window.__rqStarts = 0;
  window.__rqStops = 0;
  const param = value => ({
    value, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; },
    linearRampToValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; },
    setTargetAtTime(v) { this.value = v; },
  });
  const nodeBase = () => ({ connect() {}, disconnect() {} });
  class FakeAudioContext {
    constructor() { this.state = 'running'; this.currentTime = 1; this.sampleRate = 48000; this.destination = { maxChannelCount: 2 }; }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
    async decodeAudioData(buffer) {
      try {
        const v = new DataView(buffer);
        if (v.getUint16(20, true) !== 1 || v.getUint16(34, true) !== 16) throw new Error('not pcm16');
        const channels = v.getUint16(22, true), sampleRate = v.getUint32(24, true);
        const frames = v.getUint32(40, true) / (2 * channels);
        const data = Array.from({ length: channels }, () => new Float32Array(frames));
        for (let i = 0; i < frames; i++)
          for (let c = 0; c < channels; c++) data[c][i] = v.getInt16(44 + 2 * (i * channels + c), true) / 32768;
        return { sampleRate, numberOfChannels: channels, length: frames, duration: frames / sampleRate,
          getChannelData: c => data[c] };
      } catch {
        const samples = new Float32Array(1200);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i / 15) * 0.4;
        return { duration: 3, numberOfChannels: 1, length: samples.length, sampleRate: 400,
          getChannelData(channel) { if (channel !== 0) throw new RangeError('channel'); return samples; } };
      }
    }
    createGain() { return { ...nodeBase(), gain: param(1) }; }
    createStereoPanner() { return { ...nodeBase(), pan: param(0) }; }
    createBufferSource() {
      return { ...nodeBase(), buffer: null, onended: null, loop: false, loopStart: 0, loopEnd: 0,
        playbackRate: param(1), detune: param(0),
        start() { window.__rqStarts += 1; }, stop() { window.__rqStops += 1; } };
    }
    createOscillator() {
      return { ...nodeBase(), type: 'sine', frequency: param(440), detune: param(0), onended: null,
        start() {}, stop() {} };
    }
    createAnalyser() {
      return { ...nodeBase(), fftSize: 2048, frequencyBinCount: 1024, smoothingTimeConstant: 0.8,
        getFloatTimeDomainData(a) { a?.fill?.(0); }, getByteTimeDomainData(a) { a?.fill?.(128); },
        getByteFrequencyData(a) { a?.fill?.(0); }, getFloatFrequencyData(a) { a?.fill?.(-100); } };
    }
    createMediaStreamSource() { return nodeBase(); }
    createMediaElementSource() { return nodeBase(); }
    createChannelMerger() { return nodeBase(); }
    createChannelSplitter() { return nodeBase(); }
    createDynamicsCompressor() { return { ...nodeBase(), threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }; }
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: c => data[c] };
    }
  }
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;
}

async function readState(page) {
  return page.evaluate(() => { let s; document.dispatchEvent(new CustomEvent('runq:show-state-read', { detail: { respond: v => { s = v; } } })); return s; });
}
async function readAgent(page) {
  return page.evaluate(() => { let s; document.dispatchEvent(new CustomEvent('runq:agent-read', { detail: { respond: v => { s = v; } } })); return s; });
}
async function readStarted(page) {
  return page.evaluate(() => {
    let events = [];
    document.dispatchEvent(new CustomEvent('runq:show-event-read', { detail: { respond: v => { events = v ?? []; } } }));
    return events.filter(e => e.type === 'CUE_STARTED').map(e => e.cueId);
  });
}

class Journey {
  constructor(spec, env) {
    Object.assign(this, spec);
    const [w, h] = spec.viewport.split('x').map(Number);
    this.viewportSize = { width: w, height: h };
    this.env = env;
    this.S = SCRIPTS[spec.locale];
    this.steps = [];
    this.actions = 0; this.navs = 0; this.navSkipped = 0; this.checks = 0; this.dialogs = 0;
    this.dialogMessages = [];
    this.findings = []; this.errors = []; this.forbidden = []; this.unmockedApi = []; this.blockedProvider = [];
    this.failedStep = null; this.error = null;
    this.contexts = [];
    this.meta = { requests: 0, starts: [], plan: [] };
    this.sfx = { jobs: new Map(), order: [], plan: [], refresh: 0, review: 0, audioServed: new Set() };
  }
  async step(name, fn) {
    const t0 = Date.now(), a0 = this.actions, c0 = this.checks;
    try {
      await fn();
      this.steps.push({ name, ok: true, ms: Date.now() - t0, actions: this.actions - a0, checks: this.checks - c0 });
    } catch (error) {
      this.steps.push({ name, ok: false, ms: Date.now() - t0, actions: this.actions - a0, checks: this.checks - c0 });
      this.failedStep ??= name;
      throw error;
    }
  }
  check(condition, message) {
    this.checks += 1;
    if (!condition) throw new CheckFailure(message);
  }
  finding(code, severity, detail) {
    if (!this.findings.some(f => f.code === code)) this.findings.push({ code, severity, detail });
  }
  async click(locator, options) { this.actions += 1; await locator.click(options); }
  async fill(locator, value) { this.actions += 1; await locator.fill(String(value)); }
  async select(locator, value) { this.actions += 1; await locator.selectOption(value); }
  async check_(locator) { this.actions += 1; await locator.check(); }
  async upload(trigger, files) {
    this.actions += 1;
    const [chooser] = await Promise.all([this.page.waitForEvent('filechooser'), trigger.click()]);
    await chooser.setFiles(files);
  }
  async workspace() { return this.page.locator('.shell').getAttribute('data-active-workspace'); }
  async waitWorkspace(ws) {
    await this.page.waitForFunction(w => document.querySelector('.shell')?.dataset.activeWorkspace === w, ws);
  }
  async nav(ws) {
    if (await this.workspace() === ws) { this.navSkipped += 1; return; }
    this.navs += 1;
    await this.click(this.page.locator(`[data-workspace-nav="${ws}"]:visible`).first());
    await this.waitWorkspace(ws);
  }
  async menu(key) {
    const page = this.page;
    const app = page.locator('#rq16AppMenu');
    if (await app.count() && !await app.evaluate(e => e.open)) await this.click(page.locator('#rq16AppMenu > summary'));
    const file = page.locator('.runq-menu').first();
    if (!await file.evaluate(e => e.open)) await this.click(file.locator('summary'));
    await this.click(file.locator('.runq-menu-panel').getByRole('button', { name: MENU[this.locale][key], exact: true }));
  }
  async until(fn, message, timeout = 15000, interval = 100) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      last = await fn();
      if (last) return last;
      await sleep(interval);
    }
    throw new CheckFailure('Timed out: ' + message);
  }
}

async function routeJourney(context, j) {
  const port = j.env.port;
  await context.route('**/*', async route => {
    const request = route.request();
    let url;
    try { url = new URL(request.url()); } catch { return route.abort(); }
    if (url.protocol === 'blob:' || url.protocol === 'data:') return route.continue();
    if (url.hostname !== '127.0.0.1' || url.port !== String(port)) {
      j.forbidden.push('EXTERNAL ' + url.origin);
      return route.abort();
    }
    const path = url.pathname, method = request.method();
    const json = (status, body) => {
      if (status >= 400) j.env.intentional.add(request);
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    };
    if (/^\/api\/(baseten|fireworks)/i.test(path)) {
      j.blockedProvider.push(method + ' ' + path);
      if (method !== 'GET') j.forbidden.push('PROVIDER ' + method + ' ' + path);
      return json(403, { code: 'PROVIDER_EXCLUDED_BY_CAMPAIGN' });
    }
    if (path === '/api/meta/status')
      return json(200, { configured: true, model: 'muse-spark-1.3', provider: 'META_MODEL_API' });
    if (path === '/api/meta/proposals' && method === 'POST') return metaProposals(route, request, j, json);
    if (path === '/api/sfx/status')
      return json(200, { enabled: true, estimatedMaxCostUsdPerRequest: 0.1, dailyBudgetUsd: 10,
        actualBillingStatus: 'UNKNOWN', requiresExplicitConfirmation: true,
        requiresExactCostAcknowledgement: true, manualImportOnly: true });
    if (path.startsWith('/api/sfx/jobs')) return sfxJobs(route, request, j, json, path, method);
    if (path.startsWith('/api/')) {
      j.unmockedApi.push(method + ' ' + path);
      if (method !== 'GET' && method !== 'HEAD') j.forbidden.push('UNMOCKED ' + method + ' ' + path);
      return json(503, { code: 'E2E_BLOCKED' });
    }
    return route.continue();
  });
}

async function metaProposals(route, request, j, json) {
  j.meta.requests += 1;
  const body = request.postDataJSON() ?? {};
  const start = body.analysisWindowStart ?? 0;
  j.meta.starts.push(start);
  const outcome = j.meta.plan.shift() ?? 'ok';
  await sleep(150);
  if (outcome === 'rate') return json(429, { code: 'META_RATE', message: 'rate limited' });
  const plan = planScriptAnalysis(body.project?.scriptText ?? '');
  const selected = plan.windows.slice(start, start + 1);
  const end = start + selected.length;
  const ids = selected.flatMap(w => w.coreLines.map(line => line.id));
  const catalogue = SCRIPTS[j.locale].proposals;
  const proposals = Object.entries(catalogue)
    .filter(([lineId]) => ids.includes(lineId))
    .map(([lineId, [label, soundPrompt]]) => ({ lineId, assetId: null, label, soundPrompt }));
  return json(200, {
    provider: 'META_MODEL_API', model: 'muse-spark-1.3', proposals, observations: [], duplicatesRemoved: 0,
    coverage: {
      totalLines: plan.coverage.totalLines, sceneCount: plan.coverage.sceneCount,
      totalWindows: plan.coverage.windowCount, batchStartWindow: start, batchEndWindowExclusive: end,
      analyzedWindowIds: selected.map(w => w.id), analyzedLineIds: ids, analyzedLines: ids.length,
      nextWindowStart: end < plan.windows.length ? end : null, complete: end === plan.windows.length,
    },
  });
}

async function sfxJobs(route, request, j, json, path, method) {
  const now = new Date().toISOString();
  if (path === '/api/sfx/jobs' && method === 'POST') {
    const input = request.postDataJSON() ?? {};
    if (input.confirmed !== true) return json(400, { code: 'SFX_CONFIRMATION_REQUIRED' });
    const wav = makeWav(9 + j.sfx.order.length * 3);
    const job = {
      requestId: input.requestId, sourceLineId: input.sourceLineId, kind: input.kind, prompt: input.prompt,
      durationSeconds: input.durationSeconds, seed: input.seed, status: 'QUEUED',
      modelCandidate: 'stabilityai/stable-audio-3-small-sfx', modelRevision: 'a'.repeat(40),
      createdAt: now, updatedAt: now, cost: { estimatedMaxCostUsd: 0.05, actualBilledUsd: null },
      wav: { fileName: 'take-' + (j.sfx.order.length + 1) + '.wav', sha256: createHash('sha256').update(wav).digest('hex'),
        durationSeconds: 1, sampleRateHz: 16000, channels: 1, byteLength: wav.length },
    };
    j.sfx.jobs.set(job.requestId, { job, wav, outcome: j.sfx.plan.shift() ?? 'ok' });
    j.sfx.order.push(job.requestId);
    return json(200, job);
  }
  if (path === '/api/sfx/jobs' && method === 'GET') return json(200, { jobs: [] });
  const match = path.match(/^\/api\/sfx\/jobs\/([^/]+)(?:\/(refresh|audio|review))?$/);
  const entry = match && j.sfx.jobs.get(decodeURIComponent(match[1]));
  if (!entry) return json(404, { code: 'SFX_NOT_FOUND' });
  const operation = match[2] ?? 'read';
  if (operation === 'refresh') {
    j.sfx.refresh += 1;
    entry.job = entry.outcome === 'fail'
      ? { ...entry.job, status: 'FAILED', error: { code: 'SFX_PROVIDER_FAILED', message: 'Synthetic provider failure' }, updatedAt: now }
      : { ...entry.job, status: 'READY_FOR_REVIEW', updatedAt: now };
    return json(200, entry.job);
  }
  if (operation === 'audio' && method === 'GET') {
    if (entry.job.status === 'FAILED') return json(409, { code: 'SFX_NOT_READY' });
    j.sfx.audioServed.add(entry.job.requestId);
    return route.fulfill({ status: 200, contentType: 'audio/wav', body: entry.wav });
  }
  if (operation === 'review' && method === 'POST') {
    j.sfx.review += 1;
    entry.job = { ...entry.job, status: 'ACCEPTED_FOR_MANUAL_IMPORT', updatedAt: now };
    return json(200, entry.job);
  }
  return json(200, entry.job);
}

async function openContext(j) {
  const context = await j.env.browser.newContext({
    acceptDownloads: true, viewport: j.viewportSize, locale: j.locale === 'es' ? 'es-ES' : 'en-US',
  });
  context.setDefaultTimeout(15000);
  if (j.env.trace !== 'off') await context.tracing.start({ screenshots: true, snapshots: true });
  await context.addInitScript(fakeAudioInit);
  await routeJourney(context, j);
  const page = await context.newPage();
  page.on('dialog', dialog => {
    j.dialogs += 1;
    j.dialogMessages.push(dialog.type() + ': ' + dialog.message().slice(0, 140));
    dialog.accept().catch(() => {});
  });
  page.on('pageerror', error => j.errors.push('JS ' + error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/Failed to load resource/i.test(text)) return;
    j.errors.push('CONSOLE ' + text.slice(0, 300));
  });
  page.on('response', response => {
    if (response.status() >= 400 && !j.env.intentional.has(response.request()))
      j.errors.push('HTTP ' + response.status() + ' ' + new URL(response.url()).pathname);
  });
  j.contexts.push(context);
  j.page = page;
  await page.goto(`http://127.0.0.1:${j.env.port}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#uiLocaleSelect').waitFor({ state: 'attached' });
  if (await page.locator('#uiLocaleSelect').inputValue() !== j.locale)
    await j.select(page.locator('#uiLocaleSelect'), j.locale);
  return page;
}

function scriptFile(j) {
  return { name: j.S.file, mimeType: 'text/plain', buffer: Buffer.from(j.S.text, 'utf8') };
}

async function createShowAndImport(j, { direct = j.persona === 'creative' } = {}) {
  const page = j.page;
  await j.step('create-show-import-script', async () => {
    let newId = null;
    if (direct) {
      await j.upload(page.locator('#homeImportScriptBtn'), scriptFile(j));
    } else {
      if (j.persona === 'beginner') await j.click(page.locator('#homeNewBtn'));
      else await j.menu('new');
      await j.waitWorkspace('script');
      newId = (await readState(page)).projectId;
      await j.upload(page.locator('#importScriptBtn'), scriptFile(j));
    }
    const state = await j.until(async () => {
      const s = await readState(page);
      return s?.scriptText?.includes(j.S.lines[1]) ? s : null;
    }, 'script import');
    j.check(normalizeText(state.scriptText) === j.S.text, 'Imported script text is preserved verbatim');
    j.check(await page.locator('#scriptPreview').innerText().then(t => t.includes(j.S.lines[11])),
      'Script preview shows the last stage direction');
    j.check(state.cueCount === 0, 'A fresh import has no cues');
    if (newId && state.projectId !== newId)
      j.finding('IMPORT_AFTER_NEW_REPLACES_SHOW', 'P3',
        '"New show" then "Import script" discards the just-created show and creates another; the New step is redundant.');
  });
}

async function openAiStage(j) {
  const page = j.page;
  await j.nav('ai');
  const stage = page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="cues"]');
  if (await stage.getAttribute('aria-current') !== 'step') await j.click(stage);
}

async function ensureAiControls(j) {
  const page = j.page;
  if (!await page.locator('#rqShowBuilderAiControls').evaluate(el => el.open))
    await j.click(page.locator('#rqShowBuilderAiControls > summary'));
  if (await page.locator('#modelProviderSelect').inputValue() !== 'meta')
    await j.select(page.locator('#modelProviderSelect'), 'meta');
  await page.waitForFunction(() => !document.querySelector('#analyzeMetaBtn')?.disabled);
}

async function runAiPass(j, { expectRequests }) {
  const page = j.page;
  const before = j.meta.requests;
  if (j.persona === 'beginner') {
    await j.click(page.locator('#rqShowBuilderGenerateCues'));
    const started = await j.until(async () => j.meta.requests > before, 'beginner generate', 2500).catch(() => false);
    if (!started) {
      j.finding('BUILDER_GENERATE_NEEDS_HIDDEN_CONTROLS', 'P2',
        'The visible Show Builder "generate" button did not start analysis; the beginner had to open AI controls.');
      await ensureAiControls(j);
      await j.click(page.locator('#analyzeMetaBtn'));
    }
  } else {
    await ensureAiControls(j);
    await j.click(page.locator('#analyzeMetaBtn'));
  }
  await j.until(async () => j.meta.requests >= expectRequests, 'Meta request sent');
  await page.locator('#aiAnalysisActivity').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => !document.querySelector('#analyzeMetaBtn')?.disabled);
}

function proposalCard(j, proposal) {
  return j.page.locator(`#proposalList .item[data-proposal-id="${proposal.id}"]`);
}

async function proposalsByLine(j) {
  const agent = await readAgent(j.page);
  return { agent, byLine: new Map(agent.project.proposals.map(p => [p.sourceLineIds[0], p])) };
}

async function decide(j, proposal, approve) {
  const card = proposalCard(j, proposal);
  await card.scrollIntoViewIfNeeded();
  await j.click(card.locator('.item-actions').first().locator('button').nth(approve ? 0 : 1));
  await j.until(async () => {
    const agent = await readAgent(j.page);
    return agent.project.proposals.find(p => p.id === proposal.id)?.status === (approve ? 'APPROVED' : 'REJECTED');
  }, 'proposal decision');
}

async function selectCue(j, cueId) {
  await j.nav('cues');
  const row = j.page.locator(`#cueList [data-cue-select="${cueId}"]`);
  await row.scrollIntoViewIfNeeded();
  if ((await readState(j.page)).selectedCueId !== cueId) await j.click(row);
  await j.until(async () => (await readState(j.page)).selectedCueId === cueId, 'cue selected');
}

async function openSoundFromBuilder(j, cueId) {
  const page = j.page;
  await j.nav('ai');
  const audioStage = page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="audio"]');
  if (await audioStage.getAttribute('aria-current') !== 'step') {
    const next = page.locator('#rqShowBuilderNext');
    const onCues = await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="cues"]').getAttribute('aria-current') === 'step';
    if (onCues && await next.isVisible() && await next.isEnabled()) await j.click(next);
    if (await audioStage.getAttribute('aria-current') !== 'step') await j.click(audioStage);
  }
  const open = page.locator(`[data-builder-open-cue-sound="${cueId}"]`);
  if (!await open.isVisible()) {
    const add = page.locator('#rqShowBuilderAddSounds');
    if (await add.isVisible()) await j.click(add);
  }
  await open.scrollIntoViewIfNeeded();
  await j.click(open);
}

async function openSoundFromStudio(j, cueId) {
  const page = j.page;
  await j.nav('cues');
  const contextSound = page.locator('#cueInspector [data-rq-context-action="sound"]');
  const cue = (await readAgent(page)).project.cues.find(c => c.id === cueId);
  const contextTitle = await page.locator('#rqContextInspector .rq-context-inspector-body > strong').first().textContent().catch(() => '');
  const contextShowsCue = await contextSound.isVisible() && contextTitle.startsWith(`Cue ${cue.number} ·`);
  if (!contextShowsCue) {
    if ((await readState(page)).selectedCueId === cueId)
      j.finding('CONTEXT_INSPECTOR_IGNORES_SELECTED_CUE', 'P2',
        'Studio shows the cue selected in the inspector, but the context panel says "select an item" and hides "Prepare sound" until the row is clicked again.');
    const row = page.locator(`#cueList [data-cue-select="${cueId}"]`);
    await row.scrollIntoViewIfNeeded();
    await j.click(row);
  }
  await j.click(contextSound);
}

async function generateSoundForCue(j, cueId, { expectFailure = false, alreadyOpen = false } = {}) {
  const page = j.page;
  if (!alreadyOpen) {
    if (j.persona === 'beginner') await openSoundFromBuilder(j, cueId);
    else await openSoundFromStudio(j, cueId);
    await page.locator('[data-rq10-sound-tab="generate"]').waitFor({ state: 'visible' });
    j.check(await page.locator('#sfxCueContext').isVisible(), 'Sound lab shows the pinned cue context');
    j.sfxCueContextText = (await page.locator('#sfxCueContext').textContent()) ?? '';
  }
  const cue = (await readAgent(page)).project.cues.find(c => c.id === cueId);
  j.check(await page.locator('#sourceLine').inputValue() === cue.sourceLineIds[0],
    'Sound lab source line matches the cue L#');
  if (!(await page.locator('#soundPrompt').inputValue()).trim()) {
    j.finding('SOUND_PROMPT_NOT_PREFILLED', 'P3', 'Opening sound from an AI cue left the description empty.');
    await j.fill(page.locator('#soundPrompt'), 'harbour ambience');
  }
  await j.check_(page.locator('#confirmRequest'));
  await page.waitForFunction(() => !document.querySelector('#generateBtn')?.disabled);
  const jobsBefore = j.sfx.order.length;
  await j.click(page.locator('#generateBtn'));
  await j.until(async () => j.sfx.order.length > jobsBefore, 'SFX job submitted');
  const requestId = j.sfx.order.at(-1);
  if (expectFailure) {
    await j.until(async () => j.sfx.refresh > 0 && j.sfx.jobs.get(requestId).job.status === 'FAILED', 'SFX failure refreshed');
    await page.waitForFunction(() => document.querySelector('#feedback')?.classList.contains('error'));
    j.check(!j.sfx.audioServed.has(requestId), 'A failed take never serves audio');
    return requestId;
  }
  await page.waitForFunction(id => document.querySelector('#audioName')?.textContent.includes(id), requestId);
  const startsBefore = await page.evaluate(() => window.__rqStarts);
  await page.waitForFunction(() => !document.querySelector('#sfxListenBtn')?.disabled);
  await j.click(page.locator('#sfxListenBtn'));
  await j.until(async () => await page.evaluate(() => window.__rqStarts) > startsBefore, 'audition started');
  const stopPreview = page.locator('#sfxStopPreviewBtn');
  if (await stopPreview.isVisible() && await stopPreview.isEnabled()) await j.click(stopPreview);
  else await j.click(page.locator('#stopBtn'));
  await page.waitForFunction(() => !document.querySelector('#acceptBtn')?.disabled);
  const assetsBefore = (await readState(page)).assets.length;
  await j.click(page.locator('#acceptBtn'));
  await j.waitWorkspace('cues');
  const state = await j.until(async () => {
    const s = await readState(page);
    return s.assets.length > assetsBefore && s.assets.every(a => a.ready) ? s : null;
  }, 'accepted take is a ready asset');
  const agent = await readAgent(page);
  const updated = agent.project.cues.find(c => c.id === cueId);
  j.check(updated.actions.length === 1 && updated.actions[0].type === 'PLAY' && updated.actions[0].assetId,
    'Accepted take converts the cue to PLAY with an asset');
  j.check(state.selectedCueId === cueId, 'Accepting selects the requesting cue');
  return requestId;
}

async function editCueOne(j, cueId) {
  const page = j.page;
  await j.step('edit-fade-loop-trigger', async () => {
    await selectCue(j, cueId);
    const audioTab = page.locator('#cueInspector [data-inspector-tab="audio"]');
    if (await audioTab.getAttribute('aria-selected') !== 'true') await j.click(audioTab);
    const form = page.locator('#cuePlaybackForm');
    const fadeIn = form.locator('input[data-timecode="fadeInMs"]');
    await j.fill(fadeIn, j.locale === 'es' ? '0,5' : '0.5');
    await fadeIn.press('Tab');
    j.check(await fadeIn.getAttribute('aria-invalid') !== 'true', 'Readable fade-in timecode accepted');
    await j.check_(form.locator('[name="loop"]'));
    if (j.persona === 'creative') {
      await j.fill(form.locator('[name="gainDb"]'), -6);
      await j.fill(form.locator('[name="pan"]'), -0.5);
    }
    await j.click(form.locator(':scope > button[type="submit"]'));
    await j.until(async () => {
      const cue = (await readAgent(page)).project.cues.find(c => c.id === cueId);
      return cue.playback?.fadeInMs === 500 && cue.playback?.loop === true;
    }, 'playback saved');
    await j.click(page.locator('#cueInspector [data-inspector-tab="details"]'));
    const details = page.locator('#cueInspector .cue-details-editor');
    await j.fill(details.locator('input').nth(1), j.S.trigger);
    if (j.persona === 'creative') await j.fill(details.locator('textarea.cue-notes-input'), j.S.notes);
    await j.click(details.locator('button[type="submit"]'));
    const cue = await j.until(async () => {
      const c = (await readAgent(page)).project.cues.find(x => x.id === cueId);
      return c.trigger === j.S.trigger ? c : null;
    }, 'details saved');
    j.check(cue.playback.loop === true && cue.playback.fadeInMs === 500, 'Fade and loop persist after details save');
    if (j.persona === 'creative')
      j.check(cue.playback.gainDb === -6 && cue.playback.pan === -0.5 && cue.notes === j.S.notes,
        'Creative gain, pan and notes persist');
    const visibleCopy = await page.locator('#cueInspector').innerText();
    if (/fades configurables y loops están desactivados|configurable fades\/loops are disabled/i.test(visibleCopy))
      j.finding('AUTO_NOT_WIRED_CONTRADICTS_EDITOR', 'P3', 'Inspector claims fades/loops are disabled while the editor applies them.');
  });
}

async function rehearsalAuto(j, cueId) {
  const page = j.page;
  await j.step('rehearsal-auto-arm-disarm-panic', async () => {
    await j.nav('rehearsal');
    await j.select(page.locator('#rqLiveSessionMode'), 'auto');
    await page.evaluate(() => {
      // Simulated ASR session: the live module's own buttons reflect an active microphone.
      document.body.dataset.runqVoiceCapture = 'live';
      document.querySelector('#rqLiveStart').disabled = true;
      document.querySelector('#rqLiveStop').disabled = false;
      document.dispatchEvent(new CustomEvent('runq:voice-live-ready'));
    });
    const quick = page.locator('#rqLiveAutoStart');
    await page.waitForFunction(() => document.querySelector('#rqLiveAutoStart')?.dataset.state === 'needs-arm');
    await j.click(quick);
    await page.waitForFunction(() => document.querySelector('#rqLiveArm')?.getAttribute('aria-pressed') === 'true');
    j.check(await quick.getAttribute('data-state') === 'running', 'Visible autopilot button reports the armed state');
    const send = (text, turnId) => page.evaluate(({ text, turnId }) => {
      const detail = { text, turnId, handled: false };
      document.dispatchEvent(new CustomEvent('runq:voice-live-final', { detail }));
      return detail.handled;
    }, { text, turnId });
    j.check(await send(j.S.trigger, j.id + '-t1') === true, 'Armed auto rehearsal handles the spoken cue line');
    await j.until(async () => (await readState(page)).active.some(a => a.cueId === cueId), 'auto GO started cue 1');
    j.check((await readStarted(page)).filter(id => id === cueId).length === 1, 'Exactly one CUE_STARTED for cue 1');
    if (['beginner', 'creative'].includes(j.persona)) {
      await j.click(quick);
      await page.waitForFunction(() => !document.body.dataset.runqVoiceCapture);
    } else {
      const settings = page.locator('#rqLiveSettings');
      if (!await settings.evaluate(el => el.open)) await j.click(settings.locator('> summary'));
      await j.click(page.locator('#rqLiveArm'));
    }
    await page.waitForFunction(() => document.querySelector('#rqLiveArm')?.getAttribute('aria-pressed') === 'false');
    const startedBefore = (await readStarted(page)).length;
    j.check(await send(j.S.trigger, j.id + '-t2') === false, 'Disarmed rehearsal ignores a new spoken turn');
    await sleep(250);
    j.check((await readStarted(page)).length === startedBefore, 'Disarmed turn never starts a cue');
    await j.click(page.locator('#rqLivePanicBtn'));
    await j.until(async () => (await readState(page)).active.length === 0, 'panic stops all');
    j.check(await page.locator('#rqLiveArm').getAttribute('aria-pressed') === 'false', 'Panic leaves rehearsal disarmed');
  });
}

async function goOnce(j) {
  const page = j.page;
  if (j.persona === 'stage-manager') {
    await page.evaluate(() => document.activeElement?.blur?.());
    j.actions += 1;
    await page.keyboard.press('Space');
  } else {
    await page.waitForFunction(() => !document.querySelector('#operatorGoBtn')?.disabled);
    await j.click(page.locator('#operatorGoBtn'));
  }
}

async function stopAll(j) {
  const selector = ['intermediate', 'creative'].includes(j.persona) ? '#stopAllBtn' : '#operatorPanicBtn';
  await j.click(j.page.locator(selector));
  await j.until(async () => (await readState(j.page)).active.length === 0, 'STOP ALL silences every cue');
}

async function operate(j, cueIds) {
  const page = j.page;
  await j.step('operation-go-go-stop-stopall', async () => {
    await j.nav('operation');
    let state = await readState(page);
    if (state.preparedCueId !== cueIds[0]) {
      const reset = page.locator('#operatorResetBtn');
      j.check(await reset.isEnabled(), 'Operator can return to the top of the show');
      await j.click(reset);
      state = await j.until(async () => {
        const s = await readState(page);
        return s.preparedCueId === cueIds[0] ? s : null;
      }, 'reset prepares cue 1');
      j.finding('RESET_AFTER_REHEARSAL', 'INFO', 'After rehearsal GO stays prepared on the next cue; the operator returns to the top explicitly (by design: reading or rehearsing never moves the prepared GO implicitly).');
    }
    await goOnce(j);
    await j.until(async () => (await readState(page)).active.some(a => a.cueId === cueIds[0]), 'GO starts cue 1');
    await j.until(async () => (await readState(page)).preparedCueId === cueIds[1], 'cue 2 prepared');
    await goOnce(j);
    state = await j.until(async () => {
      const s = await readState(page);
      return s.active.length === 2 ? s : null;
    }, 'second GO overlaps cue 2');
    j.check(state.active.some(a => a.cueId === cueIds[1]), 'Cue 2 is running');
    const stop = page.locator(`#runqActiveCuesList [data-running-cue="${cueIds[0]}"] [data-active-action="stop"]`);
    await j.click(stop);
    state = await j.until(async () => {
      const s = await readState(page);
      return !s.active.some(a => a.cueId === cueIds[0]) ? s : null;
    }, 'individual STOP');
    j.check(state.active.length === 1 && state.active[0].cueId === cueIds[1], 'Individual STOP leaves cue 2 running');
    await stopAll(j);
  });
}

async function exportZip(j) {
  const page = j.page;
  let bytes;
  await j.step('export-zip', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), j.menu('saveZip')]);
    const target = join(j.env.out, 'downloads', j.id + '.showcompiler.zip');
    await download.saveAs(target);
    bytes = await readFile(target);
    j.check(/\.showcompiler\.zip$/.test(download.suggestedFilename()), 'Export uses the portable show extension');
  });
  return bytes;
}

async function verifyArchive(j, bytes, expectation) {
  await j.step('verify-zip-offline', async () => {
    const { project, audioFiles } = await importPortableShow(new Uint8Array(bytes));
    j.check(project.cues.length === expectation.cues, 'ZIP keeps every cue');
    j.check(project.cues.every(c => c.actions.length === 1 && c.actions[0].type === 'PLAY'), 'ZIP cues are PLAY');
    j.check(audioFiles.length === expectation.audio, 'ZIP embeds every real audio file');
    j.check(normalizeText(project.scriptText) === j.S.text, 'ZIP keeps the original script');
    if (expectation.playbackCue) {
      const cue = project.cues[0];
      j.check(cue.playback?.loop === true && cue.playback?.fadeInMs === 500, 'ZIP keeps fade-in and loop');
      j.check(cue.trigger === j.S.trigger, 'ZIP keeps the voice cue line');
    }
    if (expectation.sourceLines)
      j.check(JSON.stringify(project.cues.map(c => c.sourceLineIds)) === JSON.stringify(expectation.sourceLines),
        'ZIP keeps source L# references');
  });
}

async function reopenAndRun(j, bytes, expectation) {
  await j.step('close-reopen-verify', async () => {
    const page = await openContext(j);
    const file = { name: 'reopen.showcompiler.zip', mimeType: 'application/zip', buffer: bytes };
    if (j.persona === 'beginner') await j.upload(page.locator('#homeOpenZipBtn'), file);
    else {
      const chooser = page.waitForEvent('filechooser');
      await j.menu('openZip');
      j.actions += 1;
      await (await chooser).setFiles(file);
    }
    const state = await j.until(async () => {
      const s = await readState(page);
      return s.cueCount === expectation.cues && s.assets.length === expectation.audio && s.assets.every(a => a.ready) ? s : null;
    }, 'reopened ZIP restores cues and ready assets', 20000);
    const agent = await readAgent(page);
    j.check(normalizeText(agent.project.scriptText) === j.S.text, 'Reopened show keeps the script');
    if (expectation.playbackCue) {
      const cue = agent.project.cues[0];
      j.check(cue.playback?.loop === true && cue.playback?.fadeInMs === 500 && cue.trigger === j.S.trigger,
        'Reopened cue keeps fade, loop and voice cue line');
    }
    if (expectation.sourceLines)
      j.check(JSON.stringify(agent.project.cues.map(c => c.sourceLineIds)) === JSON.stringify(expectation.sourceLines),
        'Reopened cues keep L# references');
    j.check(state.active.length === 0, 'Reopening never starts audio');
    j.check((await readStarted(page)).length === 0, 'Reopening never emits CUE_STARTED');
    await j.nav('operation');
    await goOnce(j);
    await j.until(async () => (await readState(page)).active.length === 1, 'GO after reopen');
    await stopAll(j);
  });
}

async function fullShowJourney(j) {
  await j.step('open-app', () => openContext(j));
  const page = j.page;
  await createShowAndImport(j);
  let byLine;
  await j.step('ai-pass-1', async () => {
    await openAiStage(j);
    await runAiPass(j, { expectRequests: 1 });
    ({ byLine } = await proposalsByLine(j));
    const agent = await readAgent(page);
    j.check(agent.project.proposals.length === 3, 'Pass 1 returns three proposals for scene 1');
    j.check(['L2', 'L3', 'L5'].every(id => byLine.get(id)?.status === 'PENDING'), 'Pass 1 proposals are PENDING');
    j.check(agent.project.cues.length === 0, 'Proposals never create cues without approval');
    for (const id of ['L2', 'L5']) {
      const text = await proposalCard(j, byLine.get(id)).innerText();
      j.check(text.includes(id) && text.includes(j.S.lines[Number(id.slice(1)) - 1]),
        `Proposal ${id} shows its source line text`);
    }
  });
  await j.step('reject-and-pass-2', async () => {
    await decide(j, byLine.get('L2'), false);
    await runAiPass(j, { expectRequests: 2 });
    j.check(j.meta.starts[1] === 1, 'The second pass continues at scene 2');
    ({ byLine } = await proposalsByLine(j));
    const agent = await readAgent(page);
    j.check(agent.project.proposals.length === 5, 'Second pass adds two scene-2 proposals');
    j.check(byLine.get('L2').status === 'REJECTED', 'A rejected proposal stays rejected after another pass');
  });
  let cueIds;
  await j.step('approve-two', async () => {
    await decide(j, byLine.get('L5'), true);
    await decide(j, byLine.get('L9'), true);
    const agent = await readAgent(page);
    j.check(agent.project.cues.length === 2, 'Two approvals create exactly two cues');
    j.check(agent.project.cues[0].sourceLineIds[0] === 'L5' && agent.project.cues[1].sourceLineIds[0] === 'L9',
      'Approved cues keep their L# in script order');
    j.check(agent.project.cues.every(c => c.status === 'DRAFT' && c.actions[0]?.type === 'PLAN_AUDIO'),
      'Approved proposals are DRAFT sound plans');
    cueIds = agent.project.cues.map(c => c.id);
  });
  for (const [index, cueId] of cueIds.entries()) {
    await j.step('sound-generate-listen-accept-' + (index + 1), async () => {
      await generateSoundForCue(j, cueId);
      const cue = (await readAgent(page)).project.cues.find(c => c.id === cueId);
      const prompt = j.sfx.jobs.get(j.sfx.order.at(-1)).job.prompt ?? '';
      const lineId = cue.sourceLineIds[0];
      const proposalPrompt = j.S.proposals[lineId][1];
      const expectedSource = { L5: /\bbells?\b/i, L9: /\bwind\b/i }[lineId];
      if (expectedSource && !expectedSource.test(prompt))
        j.finding('SOUND_PROMPT_WRONG_SOURCE', 'P1',
          `The generation prompt does not describe the approved sound source. approved="${proposalPrompt}" sent="${prompt.slice(0, 240)}"`);
      else if (!prompt.includes(proposalPrompt)) {
        const coverage = approvedDetailCoverage(proposalPrompt, prompt);
        const hidden = coverage.untranslated.filter(word => !(j.sfxCueContextText ?? '').includes(word));
        if (coverage.add.length)
          j.finding('SOUND_PROMPT_DROPS_APPROVED_DETAIL', 'P2',
            `The English prompt silently drops approved detail. approved="${proposalPrompt}" missing="${coverage.add.join(', ')}" sent="${prompt.slice(0, 200)}"`);
        else if (hidden.length)
          j.finding('SOUND_PROMPT_UNTRANSLATED_DETAIL_HIDDEN', 'P2',
            `Approved detail could not be translated and the sound lab did not tell the user. approved="${proposalPrompt}" words="${hidden.join(', ')}"`);
        j.check(coverage.add.length === 0, 'Every translatable approved detail reaches the English generation prompt');
      }
      j.check((await readStarted(page)).length === 0, 'Reviewing and accepting sound never executes GO');
    });
  }
  await editCueOne(j, cueIds[0]);
  await rehearsalAuto(j, cueIds[0]);
  await operate(j, cueIds);
  const bytes = await exportZip(j);
  const expectation = { cues: 2, audio: 2, playbackCue: true, sourceLines: [['L5'], ['L9']] };
  await verifyArchive(j, bytes, expectation);
  await j.step('close-original', async () => { await j.contexts[0].close(); });
  await reopenAndRun(j, bytes, expectation);
}

async function recoveryJourney(j) {
  j.meta.plan = ['rate', 'ok'];
  j.sfx.plan = ['fail', 'ok'];
  await j.step('open-app', () => openContext(j));
  const page = j.page;
  await createShowAndImport(j, { direct: true });
  await j.step('meta-429-visible', async () => {
    await openAiStage(j);
    await runAiPass(j, { expectRequests: 1 });
    await j.until(async () => (await page.locator('#statusMessage').innerText()).includes(TEXT[j.locale].rate),
      'rate-limit message visible');
    j.check((await readAgent(page)).project.proposals.length === 0, 'A 429 creates no proposals');
  });
  let cueId;
  await j.step('meta-retry-approve', async () => {
    await runAiPass(j, { expectRequests: 2 });
    j.check(j.meta.starts[1] === 0, 'Retry repeats the failed window instead of skipping it');
    const { byLine, agent } = await proposalsByLine(j);
    j.check(agent.project.proposals.length === 3, 'Retry returns three proposals');
    await decide(j, byLine.get('L5'), true);
    cueId = (await readAgent(page)).project.cues[0].id;
  });
  await j.step('sfx-failure-no-asset', async () => {
    await generateSoundForCue(j, cueId, { expectFailure: true });
    const agent = await readAgent(page);
    j.check(agent.project.assets.length === 0, 'A failed generation adds no asset');
    j.check(agent.project.cues[0].actions[0].type === 'PLAN_AUDIO', 'A failed generation leaves the cue unresolved');
  });
  await j.step('sfx-regenerate-accept', async () => {
    await generateSoundForCue(j, cueId, { alreadyOpen: true });
    await j.nav('operation');
    await page.waitForFunction(() => !document.querySelector('#operatorGoBtn')?.disabled);
    j.check(true, 'GO enabled once the regenerated take is accepted');
  });
  const bytes = await exportZip(j);
  await j.step('tampered-zip-preserves-show', async () => {
    const before = await readState(page);
    const tampered = Buffer.from(bytes);
    tampered[44] ^= 0xff;
    const chooser = page.waitForEvent('filechooser');
    await j.menu('openZip');
    j.actions += 1;
    await (await chooser).setFiles({ name: 'damaged.showcompiler.zip', mimeType: 'application/zip', buffer: tampered });
    await j.until(async () => (await page.locator('#statusMessage').innerText()).includes(TEXT[j.locale].bundleFailed),
      'damaged ZIP error visible');
    const after = await readState(page);
    j.check(after.projectId === before.projectId && after.cueCount === before.cueCount, 'Damaged ZIP keeps the open show');
    j.check(after.assets.length === 1 && after.assets[0].ready, 'Damaged ZIP keeps the ready asset');
    await j.nav('operation');
    await goOnce(j);
    await j.until(async () => (await readState(page)).active.length === 1, 'GO still works after damaged ZIP');
    await stopAll(j);
  });
}

async function manualShowJourney(j) {
  await j.step('open-app', () => openContext(j));
  const page = j.page;
  await createShowAndImport(j, { direct: false });
  const cueIds = [];
  await j.step('cues-from-script-lines', async () => {
    for (const group of [['L2', 'L3'], ['L9']]) {
      await j.nav('script');
      for (const lineId of group) await j.check_(page.locator(`#scriptPreview [data-script-line-select="${lineId}"]`));
      await j.click(page.locator('#rq16CreateCueFromLines'));
      await j.waitWorkspace('cues');
      const agent = await j.until(async () => {
        const a = await readAgent(page);
        return a.project.cues.length === cueIds.length + 1 ? a : null;
      }, 'cue created from lines');
      const cue = agent.project.cues.at(-1);
      j.check(JSON.stringify(cue.sourceLineIds) === JSON.stringify(group), 'Cue keeps selected L# lines');
      cueIds.push(cue.id);
    }
  });
  await j.step('assign-local-audio', async () => {
    for (const [index, cueId] of cueIds.entries()) {
      await selectCue(j, cueId);
      const rowText = await page.locator(`#cueList [data-cue-select="${cueId}"]`).innerText();
      if (/operator sound selection pending/i.test(rowText))
        j.finding('INTERNAL_SOUND_PLACEHOLDER_VISIBLE', 'P2',
          'A manual cue row shows the internal English placeholder "Operator sound selection pending" instead of a localized status.');
      let picker = page.locator(`#cueInspector [data-cue-audio-pick="${cueId}"]:visible`);
      if (!await picker.count()) {
        j.finding('AUDIO_TAB_CANNOT_LOAD_PENDING_SOUND', 'P2',
          'The Audio tab of a cue that needs sound shows playback properties but no way to load audio; the picker is only under Actions.');
        await j.click(page.locator('#cueInspector [data-inspector-tab="actions"]'));
        picker = page.locator(`#cueInspector [data-cue-audio-pick="${cueId}"]:visible`);
      }
      await picker.first().scrollIntoViewIfNeeded();
      await j.upload(picker.first(), { name: index ? 'viento.wav' : 'gaviotas.wav', mimeType: 'audio/wav', buffer: makeWav(7 + index * 4, 2) });
      await j.until(async () => {
        const a = await readAgent(page);
        const cue = a.project.cues.find(c => c.id === cueId);
        return cue.actions[0]?.type === 'PLAY' && a.assets.length === index + 1 && a.assets.every(x => x.ready);
      }, 'local audio assigned');
    }
  });
  await j.step('add-move-delete-cue', async () => {
    await selectCue(j, cueIds[1]);
    await j.click(page.locator('#cueAddBtn'));
    const added = await j.until(async () => {
      const a = await readAgent(page);
      return a.project.cues.length === 3 ? a.project.cues.find(c => !cueIds.includes(c.id)) : null;
    }, 'cue added');
    await selectCue(j, added.id);
    const orderBefore = (await readAgent(page)).project.cues.map(c => c.id);
    await j.click(page.locator('#cueMoveUpBtn'));
    await j.until(async () => {
      const order = (await readAgent(page)).project.cues.map(c => c.id);
      return order.indexOf(added.id) === orderBefore.indexOf(added.id) - 1;
    }, 'cue moved up');
    await j.click(page.locator('#cueDeleteBtn'));
    const agent = await j.until(async () => {
      const a = await readAgent(page);
      return a.project.cues.length === 2 ? a : null;
    }, 'cue deleted');
    j.check(JSON.stringify(agent.project.cues.map(c => c.id)) === JSON.stringify(cueIds), 'Original cue order is restored');
  });
  await operate(j, cueIds);
  const bytes = await exportZip(j);
  const expectation = { cues: 2, audio: 2, sourceLines: [['L2', 'L3'], ['L9']] };
  await verifyArchive(j, bytes, expectation);
  await j.step('close-original', async () => { await j.contexts[0].close(); });
  await reopenAndRun(j, bytes, expectation);
}

const RUNNERS = { 'full-show': fullShowJourney, recovery: recoveryJourney, 'manual-show': manualShowJourney };

async function runJourney(spec, env) {
  const j = new Journey(spec, env);
  const t0 = Date.now();
  let timer;
  try {
    await Promise.race([
      RUNNERS[spec.type](j),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('JOURNEY_TIMEOUT')), env.journeyTimeoutMs); }),
    ]);
  } catch (error) {
    j.error = (error instanceof CheckFailure ? 'CHECK ' : 'ERROR ') + String(error?.message ?? error).split('\n')[0].slice(0, 400);
  } finally { clearTimeout(timer); }
  const unexpectedErrors = j.errors.filter(Boolean);
  const ok = !j.error && unexpectedErrors.length === 0 && j.forbidden.length === 0;
  if (!ok && !j.error) j.error = 'RUNTIME ' + (unexpectedErrors[0] ?? j.forbidden[0]);
  if (j.page && !j.page.isClosed() && (!ok || env.screens === 'all')) {
    await j.page.screenshot({ path: join(env.out, 'screens', j.id + '.png') }).catch(() => {});
  }
  for (const [index, context] of j.contexts.entries()) {
    if (env.trace !== 'off') {
      const path = !ok ? join(env.out, 'traces', `${j.id}-${index + 1}.zip`) : undefined;
      await context.tracing.stop(path ? { path } : undefined).catch(() => {});
    }
    await context.close().catch(() => {});
  }
  return {
    id: j.id, type: j.type, persona: j.persona, locale: j.locale, viewport: j.viewport, ok,
    ms: Date.now() - t0, actions: j.actions, navs: j.navs, navSkipped: j.navSkipped, checks: j.checks,
    dialogs: j.dialogs, dialogMessages: j.dialogMessages, failedStep: j.failedStep, error: j.error,
    steps: j.steps, findings: j.findings, errors: unexpectedErrors.slice(0, 10), forbidden: j.forbidden,
    unmockedApi: [...new Set(j.unmockedApi)], blockedProvider: [...new Set(j.blockedProvider)],
    metaRequests: j.meta.requests, sfxJobs: j.sfx.order.length, sfxReviews: j.sfx.review,
    finishedAt: new Date().toISOString(),
  };
}

function summarize(records, planned, extra) {
  const rate = key => {
    const groups = {};
    for (const r of records) {
      const g = groups[r[key]] ??= { total: 0, passed: 0, actions: [] };
      g.total += 1; if (r.ok) g.passed += 1; g.actions.push(r.actions);
    }
    return Object.fromEntries(Object.entries(groups).map(([k, g]) => [k,
      { passed: g.passed, total: g.total, successRate: +(g.passed / g.total).toFixed(3), medianActions: median(g.actions) }]));
  };
  const findings = {};
  for (const r of records) for (const f of r.findings) {
    const entry = findings[f.code] ??= { severity: f.severity, detail: f.detail, count: 0, sample: [] };
    entry.count += 1; if (entry.sample.length < 5) entry.sample.push(r.id);
  }
  const failures = records.filter(r => !r.ok).map(r => ({ id: r.id, failedStep: r.failedStep, error: r.error }));
  const failureSteps = {};
  for (const f of failures) failureSteps[f.failedStep ?? 'unknown'] = (failureSteps[f.failedStep ?? 'unknown'] ?? 0) + 1;
  return {
    generatedAt: new Date().toISOString(),
    scope: 'Offline virtual-operator journeys. Real Chrome + real RUNQ UI; Meta, Modal SFX and Web Audio are deterministic mocks. Not a measurement of model quality or audible output.',
    planned, recorded: records.length, passed: records.filter(r => r.ok).length, failed: failures.length,
    checks: records.reduce((s, r) => s + r.checks, 0),
    actions: { total: records.reduce((s, r) => s + r.actions, 0), median: median(records.map(r => r.actions)) },
    dialogs: { total: records.reduce((s, r) => s + r.dialogs, 0), median: median(records.map(r => r.dialogs)) },
    navigation: { navs: records.reduce((s, r) => s + r.navs, 0), redundantNavAvoided: records.reduce((s, r) => s + r.navSkipped, 0) },
    forbidden: records.reduce((s, r) => s + r.forbidden.length, 0) + extra.serverApiHits + extra.nodeFetchAttempts,
    serverApiHits: extra.serverApiHits, nodeFetchAttempts: extra.nodeFetchAttempts,
    unmockedApi: [...new Set(records.flatMap(r => r.unmockedApi))].sort(),
    blockedProvider: [...new Set(records.flatMap(r => r.blockedProvider))].sort(),
    byType: rate('type'), byPersona: rate('persona'), byLocale: rate('locale'), byViewport: rate('viewport'),
    findings, failureSteps, failures: failures.slice(0, 50),
  };
}

function reportMarkdown(summary) {
  const table = (title, data) => [`### ${title}`, '', '| Group | Passed | Total | Success | Median actions |', '|---|---:|---:|---:|---:|',
    ...Object.entries(data).map(([k, v]) => `| ${k} | ${v.passed} | ${v.total} | ${(v.successRate * 100).toFixed(1)}% | ${v.medianActions} |`), ''].join('\n');
  return [
    '# RUNQ virtual-operator journeys (F4)', '',
    `> ${summary.scope}`, '',
    `- Recorded: **${summary.recorded}/${summary.planned}** · passed **${summary.passed}** · failed **${summary.failed}**`,
    `- Checks: ${summary.checks} · actions: ${summary.actions.total} (median ${summary.actions.median}/journey)`,
    `- Confirm dialogs: ${summary.dialogs.total} (median ${summary.dialogs.median}/journey)`,
    `- Forbidden network: ${summary.forbidden} (server /api hits ${summary.serverApiHits}, node fetch ${summary.nodeFetchAttempts})`,
    `- Unmocked local API (answered 503): ${summary.unmockedApi.join(', ') || 'none'}`,
    `- Provider endpoints blocked locally: ${summary.blockedProvider.join(', ') || 'none'}`, '',
    table('By journey type', summary.byType), table('By persona', summary.byPersona),
    table('By locale', summary.byLocale), table('By viewport', summary.byViewport),
    '### Observed friction / findings', '',
    ...(Object.keys(summary.findings).length
      ? ['| Code | Severity | Journeys | Detail |', '|---|---|---:|---|',
        ...Object.entries(summary.findings).map(([code, f]) => `| ${code} | ${f.severity} | ${f.count} | ${f.detail} |`)]
      : ['None recorded.']), '',
    '### Failures', '',
    ...(summary.failures.length ? summary.failures.map(f => `- \`${f.id}\` @ ${f.failedStep}: ${f.error}`) : ['None.']), '',
  ].join('\n');
}

function parseArgs(argv) {
  const opts = { out: join('artifacts', 'long-campaign', 'journeys'), concurrency: 3, trace: 'on-failure', screens: 'failures', limit: Infinity, resume: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i], next = () => argv[++i];
    if (arg === '--out') opts.out = next();
    else if (arg === '--only') opts.only = next();
    else if (arg === '--persona') opts.persona = next();
    else if (arg === '--locale') opts.locale = next();
    else if (arg === '--viewport') opts.viewport = next();
    else if (arg === '--limit') opts.limit = Number(next());
    else if (arg === '--concurrency') opts.concurrency = Math.max(1, Number(next()) || 1);
    else if (arg === '--trace') opts.trace = next();
    else if (arg === '--screens') opts.screens = next();
    else if (arg === '--resume') opts.resume = true;
    else if (arg === '--journey-timeout') opts.journeyTimeoutMs = Number(next());
    else throw new Error('Unknown argument ' + arg);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const out = resolve(opts.out);
  for (const dir of ['', 'screens', 'traces', 'downloads']) await mkdir(join(out, dir), { recursive: true });
  const all = buildMatrix();
  const inList = (value, list) => !list || list.split(',').map(item => item.trim()).includes(value);
  const selected = all.filter(s => inList(s.type, opts.only) && inList(s.persona, opts.persona)
    && inList(s.locale, opts.locale) && inList(s.viewport, opts.viewport)).slice(0, opts.limit);
  const ledger = join(out, 'journeys.jsonl');
  const previous = new Map();
  if (opts.resume && existsSync(ledger)) {
    for (const line of (await readFile(ledger, 'utf8')).split('\n').filter(Boolean)) {
      try { const r = JSON.parse(line); previous.set(r.id, r); } catch {}
    }
  } else await writeFile(ledger, '');
  const pending = selected.filter(s => !previous.has(s.id));

  const app = createAppServer({
    sfxConfig: () => ({ enabled: false }), basetenCampaignProhibited: true, voiceCampaignProhibited: true,
    getKey: () => undefined, getBasetenKey: () => undefined, getVoiceKey: () => undefined,
    getCueChatKey: () => undefined, getAgentKey: () => undefined, getBasetenAgentKey: () => undefined,
  });
  const handler = app.listeners('request')[0];
  let serverApiHits = 0;
  const guard = createServer((request, response) => {
    if ((request.url ?? '').startsWith('/api/')) {
      serverApiHits += 1;
      response.writeHead(403, { 'Content-Type': 'application/json' });
      response.end('{"code":"E2E_GUARD_BLOCKED"}');
      return;
    }
    handler(request, response);
  });
  await new Promise((res, rej) => { guard.once('error', rej); guard.listen(0, '127.0.0.1', res); });
  let browser;
  try {
    try { browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] }); }
    catch { ({ browser } = await launchTestBrowser()); }
    const env = { browser, port: guard.address().port, out, trace: opts.trace, screens: opts.screens,
      intentional: new WeakSet(), journeyTimeoutMs: opts.journeyTimeoutMs ?? 240000 };
    const queue = [...pending];
    let done = 0;
    const worker = async () => {
      while (queue.length) {
        const spec = queue.shift();
        const record = await runJourney(spec, env);
        previous.set(record.id, record);
        await appendFile(ledger, JSON.stringify(record) + '\n');
        done += 1;
        console.log(`[${done}/${pending.length}] ${record.ok ? 'PASS' : 'FAIL'} ${record.id} actions=${record.actions} checks=${record.checks} ${Math.round(record.ms / 1000)}s${record.ok ? '' : ' @' + record.failedStep + ' ' + record.error}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(opts.concurrency, pending.length || 1) }, worker));
  } finally {
    await browser?.close().catch(() => {});
    await new Promise(res => guard.close(res));
  }
  const records = selected.map(s => previous.get(s.id)).filter(Boolean);
  const summary = summarize(records, selected.length, { serverApiHits, nodeFetchAttempts });
  await writeFile(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
  await writeFile(join(out, 'report.md'), reportMarkdown(summary));
  console.log(`unique=${all.length} journeys=${records.length} checks=${summary.checks} failed=${summary.failed} completed=${records.length}/${selected.length} forbidden=${summary.forbidden}`);
  if (summary.failed || summary.forbidden || records.length < selected.length) process.exitCode = 1;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/runq-journeys-e2e.mjs')) {
  main().catch(error => { console.error(error?.stack ?? error); process.exitCode = 1; });
}
