import { createAppServer } from './dev-server.mjs';

const server = createAppServer({ sfxConfig: () => ({ enabled: false }) });
const results = [];
const push = (name, ok, extra = '') => { results.push({ name, ok, extra }); };

try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const mainPage = await fetch(`${base}/`);
  push('GET / serves Stagecraft app', mainPage.ok && (await mainPage.text()).includes('uiLocaleSelect'));

  const lab = await fetch(`${base}/sound-lab`);
  const labText = await lab.text();
  push('GET /sound-lab serves lab page', lab.ok, `status=${lab.status} canvas=${labText.includes('waveCanvas')} offlineBtn=${labText.includes('demoAudioBtn')}`);

  const status = await fetch(`${base}/api/sfx/status`);
  const statusJson = await status.json();
  push('GET /api/sfx/status disabled', status.ok && statusJson.enabled === false, JSON.stringify(statusJson).slice(0, 120));

  const blocked = await fetch(`${base}/api/sfx/jobs`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'x'.repeat(10), durationSeconds: 3, seed: 1, kind: 'SFX' }),
  });
  const blockedJson = await blocked.json().catch(() => ({}));
  push('POST /api/sfx/jobs refused when provider disabled (no spend)', !blocked.ok && ![undefined].includes(blockedJson.code), `status=${blocked.status} code=${blockedJson.code}`);
} catch (error) {
  push('smoke crashed', false, String(error));
} finally {
  await new Promise(r => server.close(r));
}
let failed = 0;
for (const r of results) { console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.extra}`); if (!r.ok) failed++; }
process.exit(failed ? 1 : 0);
