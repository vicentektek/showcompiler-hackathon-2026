/**
 * Actual original show/WAV/UI review. Provider replies are offline fixtures;
 * neither screenshots nor this test measure provider quality or microphones.
 */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {createAppServer} from './dev-server.mjs';
import {buildEnglishVideoDemo} from './video/build-the-last-go.mjs';
import {serializeShowProject} from '../src/core/projectPersistence.mjs';

const built=await buildEnglishVideoDemo(),server=createAppServer();
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const captures=process.env.RUNQ_UI_CAPTURE_DIR;
if(captures)await mkdir(captures,{recursive:true});
let browser;
const external=[],errors=[],requests=[];
let respond;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>void dialog.accept());
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin){external.push(url.hostname);return route.abort();}
  if(url.pathname==='/api/agent/interpret'){
   requests.push(route.request().postDataJSON());
   const reply=await new Promise(resolve=>{respond=resolve;});
   if(reply.abort)return route.abort(reply.abort);
   return route.fulfill({status:reply.status,contentType:'application/json',body:JSON.stringify(reply.body)});
  }
  if(url.pathname.startsWith('/api/')&&route.request().method()!=='GET')return route.abort();
  return route.continue();
 });
 await page.goto(origin);
 await page.locator('#bundleFileInput').setInputFiles({name:'original-last-go.zip',
  mimeType:'application/zip',buffer:Buffer.from(built.archive)});
 await page.waitForFunction(()=>{
  let state;document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:s=>{state=s;}}}));
  return state?.cueCount===3&&state.assets.length===3&&state.assets.every(asset=>asset.ready);
 });
 const read=()=>page.evaluate(()=>{
  let s;document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:value=>{s=value;}}}));return s;
 });
 const original=await read();
 const route=async workspace=>{await page.locator(`[data-workspace-nav="${workspace}"]`).click();};
 await route('ai');
 await page.locator('#rqShowBuilderAskAssistant').click();
 if(captures){
  const before=path.join(captures,'ai-v3-before.png');
  if(!existsSync(before))await page.screenshot({path:before,animations:'disabled'});
  await page.screenshot({path:path.join(captures,'ai-v3-current.png'),animations:'disabled'});
 }
 assert.equal(await page.locator('#rqAgentContextCue').count(),1,'Main AI needs a visible actual cue context');
 assert.ok((await page.locator('#rqAgentContextCue').textContent()).includes(built.project.cues[0].label));
 assert.ok((await page.locator('#rqAgentContextSource').textContent()).includes('L7'));
 assert.ok((await page.locator('#rqAgentContextAudio').textContent()).includes('01_atmosphere.wav'));
 const chatWidth=await page.locator('#rqAgentMessages').boundingBox();
 assert.ok(chatWidth.width>=260,`Embedded conversation must remain readable: ${chatWidth.width}px`);
 const beforeExample=await read();
 await page.locator('[data-agent-example="closing"]').click();
 assert.equal(await page.locator('#rqAgentPrompt').inputValue(),'Add three cues to finish the show');
 assert.equal(await page.locator('#rqAgentProposal').isVisible(),false,
  'Choosing an example fills the composer without preparing or applying changes');
 assert.equal((await read()).cueCount,beforeExample.cueCount);
 assert.equal(requests.length,0);
 assert.equal(await page.locator('#rqAgentAskAI').isVisible(),true,
  'Direct AI consultation is visible without opening optional details');
 assert.equal(await page.locator('#rqAgentAskAI').evaluate(el=>getComputedStyle(el).backgroundColor),
  'rgb(167, 178, 143)','Direct AI is the visually primary action');
 assert.notEqual(await page.locator('#rqAgentSubmit').evaluate(el=>getComputedStyle(el).backgroundColor),
  'rgb(167, 178, 143)','Offline planning remains a secondary option');
 assert.equal(await page.locator('#rqAgentDrawer').getAttribute('aria-busy'),'false');
 assert.equal(await page.locator('.rq5-ai-workspace>.panel-head').isVisible(),false,
  'The old title must not duplicate the creative welcome and agent heading');
 assert.equal(await page.locator('#rqShowBuilder').isVisible(),true,
  'Unified Show Builder replaces the redundant creative welcome and preparation header');
 assert.equal(await page.locator('#rqPrepareShow').isVisible(),false,
  'Old batch preparation is intentionally an optional collapsed disclosure');
 const primaryAction=await page.locator('#rqAgentAskAI').boundingBox();
 assert.ok(primaryAction.y+primaryAction.height<=900,
  `Primary design action remains above the fold: ${JSON.stringify(primaryAction)}`);
 for(const width of [1440,1024,768,390]){
  await page.setViewportSize({width,height:900});
  const conversation=await page.locator('#rqAgentMessages').boundingBox();
  assert.ok(conversation.width>=(width<768?220:260),
   `Readable conversation at ${width}px: ${conversation.width}px`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.locator('#rqShowBuilderAskAssistant').click();
  assert.equal(await page.locator('#rqAgentPrompt').evaluate(el=>document.activeElement===el),true);
  const action=await page.locator('#rqAgentAskAI').boundingBox();
  assert.ok(action.y>=0&&action.y+action.height<=900,
   `Open assistant brings preparation into view at ${width}px`);
  assert.equal((await read()).cueCount,original.cueCount);
  assert.equal(requests.length,0);
  if(captures)await page.screenshot({path:path.join(captures,'ai-organized-'+width+'.png'),animations:'disabled'});
 }
 await page.setViewportSize({width:1366,height:900});
 for(const prompt of ['Is cue 2 ready?','Are we ready to go live?']){
  const beforeReadiness=await read();
  await page.locator('#rqAgentPrompt').fill(prompt);
  await page.locator('#rqAgentSubmit').click();
  const answer=await page.locator('#rqAgentMessages article').last().textContent();
  assert.match(answer,/cannot certify live readiness/i);
  if(prompt.includes('cue 2')){
   assert.match(answer,/Cue 2/);
   assert.doesNotMatch(answer,/Cue 1/);
   assert.match(answer,/decoded audio/i);
  }
  assert.equal(requests.length,0,'Readiness queries must not consult a provider');
  assert.equal(await page.locator('#rqAgentProposal').isVisible(),false);
  assert.deepEqual(await read(),beforeReadiness,'Reading readiness must preserve selection, prepared GO and transport');
 }
 await page.locator('#rqAgentPrompt').fill('prepara los cues');
 await page.locator('#rqAgentSubmit').click();
 assert.ok((await page.locator('#rqAgentMessages article').last().textContent()).includes('1.'));
 const prepareCues=page.getByRole('button',{name:'Prepare cues from script',exact:true});
 await prepareCues.click();
 assert.equal(await page.locator('#rqShowBuilderCueTask').isVisible(),true);
 assert.equal(requests.length,0,'Cue guidance opens real tools without spending or approving');
 assert.equal((await read()).cueCount,original.cueCount);
 assert.equal((await read()).preparedCueId,original.preparedCueId);
 await page.locator('#rqAgentPrompt').fill('quiero un diseño sonoro por escenas');
 await page.locator('#rqAgentSubmit').click();
 const prepareAI=page.getByRole('button',{name:'Prepare AI consultation',exact:true}).last();
 const guidanceRequest=page.waitForRequest('**/api/agent/interpret');
 await prepareAI.click();
 await guidanceRequest;
 assert.equal(await page.locator('#rqAgentConsent').count(),0);
 assert.equal(requests.length,1,'Explicit AI consultation action starts work directly without a second permission step');
 respond({status:200,body:{status:'CLARIFY',message:'What sound should this scene emphasize?',operations:[]}});
 await page.waitForFunction(()=>document.querySelector('#rqAgentDrawer')?.getAttribute('aria-busy')==='false');
 await prepareCues.click();
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('runq:navigate-to-source',{detail:{lineId:'L9999'}})));
 assert.equal((await read()).workspace,'ai','Nonexistent source navigation must be rejected without changing workspace');
 assert.equal((await read()).preparedCueId,original.preparedCueId);
 await page.locator('#rqAgentContextDetails summary').click();
 await page.locator('#rqAgentViewSource').click();
 assert.equal((await read()).workspace,'script');
 assert.equal((await read()).preparedCueId,original.preparedCueId);
 await route('ai');
 await page.locator('#rqAgentOpenCue').click();
 assert.equal((await read()).workspace,'cues');
 assert.equal((await read()).selectedCueId,original.selectedCueId);
 await route('ai');await page.locator('#rqAgentOpenLibrary').click();
 assert.equal((await read()).workspace,'audio');
 await route('ai');
 await page.locator('#rqAgentPrompt').fill('Improve sound for cue 1');
 await page.locator('#rqAgentSubmit').click();
 const soundAction=page.getByRole('button',{name:'Prepare alternative in Sound Lab',exact:true});
 assert.equal(await soundAction.count(),1);
 await page.locator('#rqAgentPrompt').fill('Show summary');
 await page.locator('#rqAgentSubmit').click();
 assert.equal(await soundAction.count(),1,
  'A conversational follow-up must not erase the reviewed Sound Lab action');
 await soundAction.click();
 assert.equal((await read()).workspace,'audio');
 assert.ok((await page.locator('#soundPrompt').inputValue()).includes(built.project.cues[0].label));
 assert.equal((await read()).active.length,0);
 assert.equal(requests.length,1,'Preparing a sound alternative never submits another generation');
 await route('ai');
 await page.locator('#rqAgentPrompt').fill('Set cue 1 gain to -6 dB');
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentProposal').waitFor({state:'visible'});
 await page.locator('#rqAgentApply').click();
 await soundAction.click();
 assert.equal((await read()).workspace,'ai','Stale sound advice must not navigate after its cue changes');
 assert.ok((await page.locator('#rqAgentStatus').textContent()).includes('show has changed'));
 await page.locator('#rqAgentUndo').click();
 await page.locator('#rqAgentMoreOptions summary').first().click();
 await page.locator('#rqAgentSelectedSound').selectOption(built.project.assets[0].id);
 await page.locator('#rqAgentPrompt').fill('Insert a cue before cue three. Name it Decision Tension. Use the selected sound. Set the voice trigger to line twenty.');
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentProposal').waitFor({state:'visible'});
 assert.ok((await page.locator('#rqAgentReviewSummary').textContent()).includes('1'));
 assert.equal(await page.locator('#rqAgentDrawer').getAttribute('data-phase'),'review');
 assert.ok((await page.locator('#rqAgentOps').textContent()).includes('Add cue with sound'));
 assert.equal((await page.locator('#rqAgentOps').textContent()).includes('create configured cue'),false);
 for(const size of [{width:1440,height:900},{width:1366,height:900},{width:1093,height:768},{width:768,height:900}]){
  await page.setViewportSize(size);
  await page.locator('#rqAgentApply').scrollIntoViewIfNeeded();
  const box=await page.locator('#rqAgentProposal').boundingBox();
  assert.ok(box.width>=280&&box.x>=0&&box.x+box.width<=size.width+1,
   `Proposal review stays usable at ${size.width}px: ${JSON.stringify(box)}`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  if(captures)await page.screenshot({path:path.join(captures,'ai-v3-review-'+size.width+'.png'),animations:'disabled'});
 }
 assert.equal((await read()).cueCount,3);assert.equal((await read()).active.length,0);
 await page.locator('#rqAgentOps input').first().uncheck();
 assert.equal(await page.locator('#rqAgentApply').isEnabled(),false);
 assert.ok((await page.locator('#rqAgentReviewSummary').textContent()).includes('0'));
 await page.locator('#rqAgentOps input').first().check();
 await page.locator('#rqAgentApply').click();
 assert.equal((await read()).cueCount,4);
 await page.locator('#rqAgentUndo').click();
 assert.equal((await read()).cueCount,3);
 await page.setViewportSize({width:1366,height:900});
 await page.locator('#rqAgentAiOptions summary').click();
 await page.locator('#rqAgentPrompt').fill('Review original script context using the offline response fixture');
 const request=page.waitForRequest('**/api/agent/interpret');
 await page.locator('#rqAgentAskAI').click();await request;
 assert.equal(await page.locator('#rqAgentDrawer').getAttribute('aria-busy'),'true');
 assert.equal(await page.locator('#rqAgentPhase').textContent(),'Preparing proposal');
 assert.equal(await page.locator('#rqAgentApply').isEnabled(),false);
 respond({status:401,body:{error:'HTTP_401'}});
 await page.waitForFunction(()=>document.querySelector('#rqAgentDrawer')?.dataset.phase==='error');
 assert.equal(await page.locator('#rqAgentConsent').count(),0);
 assert.equal(await page.locator('#rqAgentDrawer').getAttribute('aria-busy'),'false');
 assert.ok((await page.locator('#rqAgentMessages').textContent()).includes('credentials'));
 assert.equal(requests.length,2);
 assert.ok(requests[1].conversation.every(turn=>Object.keys(turn).sort().join(',')==='role,text'),
  'Local sound actions and their cue snapshots must never be added to provider conversation');
 const failOnce=async(prompt,reply)=>{
  await page.locator('#rqAgentPrompt').fill(prompt);
  const pending=page.waitForRequest('**/api/agent/interpret');
  await page.locator('#rqAgentAskAI').click();await pending;
  await page.waitForFunction(()=>document.querySelector('#rqAgentDrawer')?.getAttribute('aria-busy')==='true');
  respond(reply);
  await page.waitForFunction(()=>document.querySelector('#rqAgentDrawer')?.getAttribute('aria-busy')==='false');
 };
 await failOnce('One-shot rate-limit fixture',{status:429,body:{error:'HTTP_429'}});
 await failOnce('One-shot timeout fixture',{abort:'timedout'});
 await new Promise(resolve=>setTimeout(resolve,100));
 assert.equal(requests.length,4,'401, 429 and timeout each submit exactly once with no automatic retry');
 if(captures)await page.screenshot({path:path.join(captures,'ai-v3-error.png'),animations:'disabled'});
 await page.locator('#uiLocaleSelect').selectOption('es');
 assert.equal(await page.locator('#rqAgentViewSource').textContent(),'Ver guion');
 assert.equal(await page.locator('#rqAgentAskAI').textContent(),'Trabajar con IA');
 assert.equal(await page.locator('#rqAgentPhase').textContent(),'Revisar error');
 assert.ok((await page.locator('#rqAgentConsentDisclosure').textContent()).includes('No se envían archivos de audio'));
 assert.equal((await read()).scriptText,original.scriptText);
 assert.equal((await read()).active.length,0);
 const audioState=()=>page.evaluate(()=>{
  let state;document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:s=>{state=s;}}}));return state;
 });
 const beforeAudio=(await audioState()).project,beforePrepared=(await read()).preparedCueId;
 const firstCue=beforeAudio.cues[0].id,lastCue=beforeAudio.cues.at(-1).id;
 const edits=[
  {op:'UPDATE_CUE',cueId:firstCue,changes:{loop:true}},
  {op:'SET_CUE_STOP',cueId:lastCue,targetCueId:firstCue,fadeMs:5000},
  {op:'ASSIGN_AUDIO',cueId:beforeAudio.cues[1].id,assetId:beforeAudio.assets[0].id},
  {op:'ADD_AUDIO_TRACK',cueId:firstCue,assetId:beforeAudio.assets[1].id,
   changes:{gainDb:-12,pan:0.5,fadeInMs:1000}},
  {op:'SET_ENTRY_POLICY',cueId:lastCue,mode:'OVERLAP',fadeMs:0},
 ];
 await failOnce('Configura el loop y la parada final con fade; añade una capa sin reproducir.',
  {status:200,body:{status:'PLAN',message:'Propuesta de edición de audio, pendiente de aplicar.',operations:edits}});
 assert.equal(await page.locator('#rqAgentProposal').isVisible(),true);
 assert.deepEqual((await audioState()).project,beforeAudio,'Audio plans do not apply or play before approval');
 assert.equal((await read()).active.length,0);
 assert.ok((await page.locator('#rqAgentDiff').textContent()).includes('5000'));
 assert.ok((await page.locator('#rqAgentDiff').textContent()).includes('"pan":0.5'));
 await page.locator('#rqAgentApply').click();
 const configured=(await audioState()).project;
 assert.equal(configured.cues[0].playback.loop,true);
 assert.equal(configured.cues[0].playback.fadeOutMs,0);
 assert.equal(configured.cues[0].audioTracks.at(-1).playback.pan,0.5);
 assert.equal(configured.cues.at(-1).stopFadeOverrides[firstCue],5000);
 assert.equal((await read()).preparedCueId,beforePrepared);
 assert.equal((await read()).active.length,0,'Applying audio configuration never executes transport');
 await page.locator('#rqAgentUndo').click();
 assert.deepEqual((await audioState()).project,beforeAudio,'Audio assignments, layers and targeted fades undo together');
 assert.equal((await read()).preparedCueId,beforePrepared);
 await failOnce('Invalid continuous fade fixture',{status:200,body:{status:'PLAN',
  message:'THIS INVALID SUCCESS CLAIM MUST NOT APPEAR',
  operations:[{op:'UPDATE_CUE',cueId:firstCue,changes:{loop:true,fadeOutMs:5000}}]}});
 assert.equal(await page.locator('#rqAgentProposal').isVisible(),false);
 assert.ok((await page.locator('#rqAgentMessages article').last().textContent()).includes('loop continuo'));
 assert.ok(!(await page.locator('#rqAgentMessages').textContent()).includes('THIS INVALID SUCCESS CLAIM MUST NOT APPEAR'));
 assert.deepEqual((await audioState()).project,beforeAudio);
 await page.locator('#rqAgentPrompt').fill('cue 1 debe ser loop y cue 3 debe detener cue 1 con un fade out de 5 segundos');
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentProposal').waitFor({state:'visible'});
 await page.locator('#rqAgentApply').click();
 await route('cues');
 await page.locator(`[data-cue-quick-go="${firstCue}"]`).click();
 await page.waitForFunction(id=>{
  let state;document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:s=>{state=s;}}}));
  return state?.active.some(c=>c.cueId===id&&!c.stopping&&c.durationSeconds===null);
 },firstCue);
 await page.locator(`[data-cue-quick-go="${lastCue}"]`).click();
 await page.waitForFunction(id=>{
  let state;document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:s=>{state=s;}}}));
  return state?.active.some(c=>c.cueId===id&&c.stopping);
 },firstCue);
 const fading=(await read()).active.find(c=>c.cueId===firstCue);
 assert.ok(fading.remainingSeconds>3.5&&fading.remainingSeconds<=5,
  `Manual final GO applies the configured 5-second fade: ${JSON.stringify(fading)}`);
 assert.equal((await read()).preparedCueId,beforePrepared,'Explicit row GO does not move prepared GO');
 await page.waitForFunction(id=>{
  let state;document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:s=>{state=s;}}}));
  return state&&!state.active.some(c=>c.cueId===id);
 },firstCue);
 await page.locator('#stopAllBtn').click();
 assert.equal((await read()).active.length,0);
 await route('ai');
 await page.locator('#rqAgentUndo').click();
 assert.deepEqual((await audioState()).project,beforeAudio);
 await page.locator('#projectFileInput').setInputFiles({name:'original-show-metadata-only.json',
  mimeType:'application/json',buffer:Buffer.from(serializeShowProject(built.project))});
 await page.waitForFunction(()=>{
  let s;document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:v=>{s=v;}}}));
  return s?.assets.length===3&&s.assets.every(asset=>!asset.ready);
 });
 await route('ai');
 assert.ok((await page.locator('#rqAgentContextAudio').textContent()).includes('NO DISPONIBLE'));
 assert.equal(await page.locator('#rqAgentSelectedSound option:enabled').count(),1,
  'Metadata-only import cannot silently choose or play unavailable audio');
 assert.equal(await page.locator('#rqAgentPhase').textContent(),'Próxima instrucción');
 assert.equal(requests.length,6,'Two audio planning fixtures each add exactly one provider request; local GO testing adds none');
 await page.locator('#uiLocaleSelect').selectOption('en');
 const projectState=()=>page.evaluate(()=>{
  let s;document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:value=>{s=value;}}}));return s;
 });
 const instruct=async text=>{
  await page.locator('#rqAgentPrompt').fill(text);
  await page.locator('#rqAgentSubmit').click();
 };
 await instruct('Add 2 empty cues at the end');
 await page.locator('#rqAgentProposal').waitFor({state:'visible'});
 for(let i=0;i<20;i++)await instruct('Rehearsal note '+i);
 await instruct('make it 4 cues instead');
 await page.locator('#rqAgentProposal').waitFor({state:'visible'});
 assert.equal((await projectState()).project.cues.length,3,'Long-chat corrections remain unapplied');
 await page.locator('#rqAgentApply').click();
 let revised=(await projectState()).project;
 assert.equal(revised.cues.length,7,'Pending intent survives 40+ display turns');
 assert.ok(revised.cues.slice(3).every(cue=>cue.actions[0].type==='PLAN_AUDIO'));
 assert.equal((await read()).active.length,0);
 await instruct('Rename cue 4 to Door: Finale');
 await page.locator('#rqAgentProposal').waitFor({state:'visible'});
 assert.notEqual((await projectState()).project.cues[3].label,'Door: Finale');
 await page.locator('#rqAgentApply').click();
 assert.equal((await projectState()).project.cues[3].label,'Door: Finale');
 await instruct('Cue 4, fade out 2 seconds');
 await page.locator('#rqAgentProposal').waitFor({state:'visible'});
 await page.locator('#rqAgentApply').click();
 revised=(await projectState()).project;
 assert.equal(revised.cues[3].playback.fadeOutMs,2000);
 assert.equal(revised.cues[3].actions[0].type,'PLAN_AUDIO');
 assert.equal((await read()).active.length,0,'Settings on unresolved cues never start audio');
 await route('cues');
 await page.locator(`[data-cue-select="${revised.cues[3].id}"]`).click();
 await page.locator('[data-inspector-tab="audio"]').click();
 assert.equal(await page.locator('#cuePlaybackForm [name="fadeOutMs"]').inputValue(),'2000',
  'Manual inspector exposes the same saved unresolved-cue settings');
 await route('ai');
 await instruct('Add 2 empty cues at the end');
 await page.locator('#rqAgentProposal').getByRole('button',{name:'Discard',exact:true}).click();
 await instruct('you decide');
 assert.equal(await page.locator('#rqAgentProposal').isVisible(),false,
  'Discard explicitly invalidates pending task memory');
 assert.equal((await projectState()).project.cues.length,7);
 await instruct('Add 2 empty cues at the end');
 await page.locator('#rqAgentCancel').click();
 await instruct('you decide');
 assert.equal(await page.locator('#rqAgentProposal').isVisible(),false,'Cancel invalidates pending intent');
 assert.equal((await projectState()).project.cues.length,7);
 await instruct('Add 2 empty cues at the end');
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('runq:operator-stop-all')));
 await instruct('you decide');
 assert.equal(await page.locator('#rqAgentProposal').isVisible(),false,'STOP ALL cannot revive pending intent');
 await instruct('Add 2 empty cues at the end');
 await page.locator('#projectFileInput').setInputFiles({name:'replacement-show.json',
  mimeType:'application/json',buffer:Buffer.from(serializeShowProject(built.project))});
 await page.waitForFunction(()=>{
  let s;document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:value=>{s=value;}}}));
  return s?.project.cues.length===3;
 });
 await route('ai');await instruct('you decide');
 assert.equal(await page.locator('#rqAgentProposal').isVisible(),false,'Replacement invalidates old project intent');
 assert.equal((await read()).active.length,0);
 assert.equal(requests.length,6,'Memory, rename and fade improvements use zero additional provider requests');
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 console.log('AI REVIEW E2E PASS: original WAVs/source, audio assignment/layers/loop/stop-fade review/apply/undo, manual GO verifies the final cue fades the loop for 5 seconds, unchanged prepared GO, actionable errors, long-chat task correction, cancel/STOP ALL/project invalidation, one-shot offline error and ES/EN. No provider/microphone/acoustic measurement.');
}finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));server.closeAllConnections();
}
