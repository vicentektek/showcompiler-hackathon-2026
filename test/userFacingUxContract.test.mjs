import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('Sound Lab uses prompt-only presentation and hides legacy provider panels',async()=>{
  const html=await read('index.html');
  assert.match(html,/<details[^>]+id="sfxConnectionDetails"/);
  const detail=html.indexOf('id="sfxConnectionDetails"');
  const cost=html.indexOf('id="costEstimate"');
  assert.ok(detail>0 && cost>detail);
  assert.doesNotMatch(html,/id="confirmRequest"/);
  assert.match(html,/id="sfxProviderDiagnostics"/);
  assert.match(html,/class="rq-prompt-only"/);
  assert.match(html,/data-sfx-en="Sound assistant"/);
  assert.match(html,/id="rqPromptImportCue"/);
  assert.match(html,/id="rqPromptOpenLibrary"/);
  const css=await read('src/sfx/lab.css');
  assert.match(css,/rq-prompt-only-legacy-jobs/);
});

test('historic SFX code retains authorization, while runtime makes new generation unreachable',async()=>{
  const ui=await read('src/sfx/lab.mjs');
  const backend=await read('tools/sfxRoutes.mjs');
  assert.doesNotMatch(ui,/\$\('confirmRequest'\)/);
  assert.match(ui,/acknowledgedMaxCostUsd:policy\.perRequest/);
  assert.match(ui,/confirmed:true/);
  assert.doesNotMatch(ui,/confirm\(`Submit ONE external generation request/);
  assert.match(backend,/requireAcknowledgement: true/);
  assert.match(backend,/authorizationId/);
  assert.match(backend,/generationDisabled/);
  assert.match(ui,/const PROMPT_ONLY = true/);
});

test('Agent AI button authorizes a bounded request without a second permission checkbox',async()=>{
  const ui=await read('src/ui/runq-agent-ui.mjs');
  assert.doesNotMatch(ui,/rqAgentConsent['"]/);
  assert.match(ui,/'X-Runq-Agent-Consent':'yes'/);
  assert.match(ui,/const aiOptions=make\('details'/);
  assert.match(ui,/userFacingError\(error/);
});

test('bulk sound preparation exports prompt plans without starting generation',async()=>{
  const ui=await read('src/ui/show-preparation-ui.mjs');
  assert.doesNotMatch(ui,/window\.confirm|rqBatchAuthorize/);
  assert.match(ui,/rqIncludeShowAudio/);
  assert.match(ui,/rqEditAudioBatch/);
  assert.match(ui,/confirmed: true/);
  assert.match(ui,/runq-sound-prompts\.txt/);
  assert.match(ui,/await showAudioPlan\(true\)/);
  assert.doesNotMatch(ui,/if \(!edit\) await generateAudio\(\)/);
});
