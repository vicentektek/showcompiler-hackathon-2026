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
  assert.match(html, /IA SIMULADA · AUDIO LOCAL REAL/);
  assert.match(html, /ORIGEN IDENTIFICADO/);
  assert.match(html, /id="analyzeMetaBtn"/);
  assert.match(html, /no quedan dentro del JSON/);
  assert.match(html, /id="stopAllBtn"/);
  assert.match(html, /id="audioFileInput"/);
  assert.match(css, /@media/);
});

test('frontend imports backend facade, never Web Audio engine directly', () => {
  assert.match(client, /from '\.\.\/core\/audioBackend\.mjs'/);
  assert.doesNotMatch(client, /from '\.\.\/core\/browserAudio\.mjs'/);
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
  const backendFacade = await fetch(base + '/src/core/audioBackend.mjs');
  assert.equal(backendFacade.status, 200);
  assert.match(await backendFacade.text(), /createBrowserAudioBackend/);
  const blocked = await fetch(base + '/tools/dev-server.mjs');
  assert.equal(blocked.status, 404);
  const post = await fetch(base + '/', { method: 'POST' });
  assert.equal(post.status, 405);
  const head = await fetch(base + '/index.html', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});
