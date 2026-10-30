import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createAppServer } from '../tools/dev-server.mjs';

const require = createRequire(import.meta.url);
const { sameAppOrigin, allowAudioOnly } = require('../electron/security.cjs');

test('Electron navigation is limited to the exact ephemeral loopback origin', () => {
  const origin = 'http://127.0.0.1:53127';
  assert.equal(sameAppOrigin(origin + '/index.html', origin), true);
  assert.equal(sameAppOrigin(origin + '/sound-lab', origin), true);
  for (const url of [
    'http://127.0.0.1:53128/', 'http://localhost:53127/',
    'https://127.0.0.1:53127/', 'http://evil.example/',
    'javascript:alert(1)', 'http://127.0.0.1:53127.evil.example/',
    'http://user:pass@127.0.0.1:53127/',
  ]) assert.equal(sameAppOrigin(url, origin), false, url);
});

test('Electron permission gate rejects video, screen and external origins', () => {
  const expectedOrigin = 'http://127.0.0.1:53127';
  const req = { expectedOrigin, requestingUrl: expectedOrigin + '/' };
  assert.equal(allowAudioOnly({ ...req, permission: 'media', mediaTypes: ['audio'] }), true);
  assert.equal(allowAudioOnly({ ...req, permission: 'media', mediaType: 'audio' }), true);
  for (const input of [
    { permission: 'media', mediaTypes: ['video'] },
    { permission: 'media', mediaTypes: ['audio','video'] },
    { permission: 'media', mediaTypes: [] },
    { permission: 'geolocation', mediaTypes: ['audio'] },
    { permission: 'display-capture', mediaTypes: ['audio'] },
    { permission: 'media', mediaType: 'video' },
    { permission: 'media' },
  ]) assert.equal(allowAudioOnly({ ...req, ...input }), false);
  assert.equal(allowAudioOnly({
    ...req, requestingUrl: 'http://localhost:53127/',
    permission: 'media', mediaTypes: ['audio'],
  }), false);
});

test('Embedded RUNQ server can serve UI at an ephemeral loopback port without provider calls', async () => {
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert.equal(address.address, '127.0.0.1');
    assert.ok(address.port > 0);
    const base = 'http://127.0.0.1:' + address.port;
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<html/i);
    const missing = await fetch(base + '/not-a-route');
    assert.equal(missing.status, 404);
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
});
