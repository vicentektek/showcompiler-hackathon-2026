import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('Sound Lab hides detailed billing diagnostics behind an optional disclosure',async()=>{
  const html=await read('index.html');
  assert.match(html,/<details[^>]+id="sfxConnectionDetails"/);
  const detail=html.indexOf('id="sfxConnectionDetails"');
  const cost=html.indexOf('id="costEstimate"');
  assert.ok(detail>0 && cost>detail);
  assert.doesNotMatch(html,/id="confirmRequest"/);
  assert.match(html,/id="sfxProviderDiagnostics"/);
  assert.match(html,/data-sfx-en="Create a sound"/);
});

test('SFX retains explicit authorization and backend cost acknowledgement without duplicate prompt',async()=>{
  const ui=await read('src/sfx/lab.mjs');
  const backend=await read('tools/sfxRoutes.mjs');
  assert.doesNotMatch(ui,/\$\('confirmRequest'\)/);
  assert.match(ui,/acknowledgedMaxCostUsd:policy\.perRequest/);
  assert.match(ui,/confirmed:true/);
  assert.doesNotMatch(ui,/confirm\(`Submit ONE external generation request/);
  assert.match(backend,/requireAcknowledgement: true/);
  assert.match(backend,/authorizationId/);
});

test('Agent AI button authorizes a bounded request without a second permission checkbox',async()=>{
  const ui=await read('src/ui/runq-agent-ui.mjs');
  assert.doesNotMatch(ui,/rqAgentConsent['"]/);
  assert.match(ui,/'X-Runq-Agent-Consent':'yes'/);
  assert.match(ui,/const aiOptions=make\('details'/);
  assert.match(ui,/userFacingError\(error/);
});

test('bulk audio starts directly, with optional planning and no AI permission dialogs',async()=>{
  const ui=await read('src/ui/show-preparation-ui.mjs');
  assert.doesNotMatch(ui,/window\.confirm|rqBatchAuthorize/);
  assert.match(ui,/rqIncludeShowAudio/);
  assert.match(ui,/rqEditAudioBatch/);
  assert.match(ui,/confirmed: true/);
  assert.match(ui,/acknowledgedMaxCostUsd: policy\.estimatedMaxCostUsdPerRequest/);
});
