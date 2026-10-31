import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('Sound Lab hides detailed billing diagnostics behind an optional disclosure',async()=>{
  const html=await read('index.html');
  assert.match(html,/<details[^>]+id="sfxConnectionDetails"/);
  const detail=html.indexOf('id="sfxConnectionDetails"');
  const cost=html.indexOf('id="costEstimate"');
  const consent=html.indexOf('id="confirmRequest"');
  assert.ok(detail>0 && cost>detail && consent>cost);
  assert.match(html,/id="sfxProviderDiagnostics"/);
  assert.match(html,/data-sfx-en="Create a sound"/);
});

test('SFX retains explicit authorization and backend cost acknowledgement without duplicate prompt',async()=>{
  const ui=await read('src/sfx/lab.mjs');
  const backend=await read('tools/sfxRoutes.mjs');
  assert.match(ui,/\$('confirmRequest'\)\.checked/);
  assert.match(ui,/acknowledgedMaxCostUsd:policy\.perRequest/);
  assert.match(ui,/confirmed:true/);
  assert.doesNotMatch(ui,/confirm\(`Submit ONE external generation request/);
  assert.match(backend,/requireAcknowledgement: true/);
  assert.match(backend,/authorizationId/);
});

test('Agent external request remains opt-in and provider diagnostics are optional',async()=>{
  const ui=await read('src/ui/runq-agent-ui.mjs');
  assert.match(ui,/if\(forceAI&&!\$('rqAgentConsent'\)\.checked\)/);
  assert.match(ui,/settings\.open=true/);
  assert.match(ui,/const aiOptions=make\('details'/);
  assert.match(ui,/userFacingError\(error/);
});
