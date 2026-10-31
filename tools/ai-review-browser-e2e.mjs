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
 if(captures){
  const before=path.join(captures,'ai-v3-before.png');
  if(!existsSync(before))await page.screenshot({path:before,animations:'disabled'});
  await page.screenshot({path:path.join(captures,'ai-v3-current.png'),animations:'disabled'});
 }
 assert.equal(await page.locator('#rqAgentContextCue').count(),1,'Main AI needs a visible actual cue context');
 assert.ok((await page.locator('#rqAgentContextCue').textContent()).includes(built.project.cues[0].label));
 assert.ok((await page.locator('#rqAgentContextSource').textContent()).includes('L7'));
 assert.ok((await page.locator('#rqAgentContextAudio').textContent()).includes('01_atmosphere.wav'));
 assert.equal(await page.locator('#rqAgentDrawer').getAttribute('aria-busy'),'false');
 assert.ok((await page.locator('.rq5-ai-workspace>.panel-head').boundingBox()).height<=48,
  'Compact title must leave space for actual conversation/context rather than duplicate the Agent heading');
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('runq:navigate-to-source',{detail:{lineId:'L9999'}})));
 assert.equal((await read()).workspace,'ai','Nonexistent source navigation must be rejected without changing workspace');
 assert.equal((await read()).preparedCueId,original.preparedCueId);
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
 assert.equal(requests.length,0,'Preparing a sound alternative never submits a generation');
 await route('ai');
 await page.locator('#rqAgentPrompt').fill('Set cue 1 gain to -6 dB');
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentProposal').waitFor({state:'visible'});
 await page.locator('#rqAgentApply').click();
 await soundAction.click();
 assert.equal((await read()).workspace,'ai','Stale sound advice must not navigate after its cue changes');
 assert.ok((await page.locator('#rqAgentStatus').textContent()).includes('show has changed'));
 await page.locator('#rqAgentUndo').click();
 await page.locator('#rqAgentSelectedSound').selectOption(built.project.assets[0].id);
 await page.locator('#rqAgentPrompt').fill('Insert a cue before cue three. Name it Decision Tension. Use the selected sound. Set the voice trigger to line twenty.');
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentProposal').waitFor({state:'visible'});
 assert.ok((await page.locator('#rqAgentReviewSummary').textContent()).includes('1'));
 assert.equal(await page.locator('#rqAgentDrawer').getAttribute('data-phase'),'review');
 for(const size of [{width:1440,height:900},{width:1366,height:900},{width:1093,height:768},{width:768,height:900}]){
  await page.setViewportSize(size);
  await page.locator('#rqAgentApply').scrollIntoViewIfNeeded();
  const box=await page.locator('#rqAgentProposal').boundingBox();
  assert.ok(box.width>=280&&box.x>=0&&box.x+box.width<=size.width+1);
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
 await page.locator('#rqAgentConsent').check();
 const request=page.waitForRequest('**/api/agent/interpret');
 await page.locator('#rqAgentAskAI').click();await request;
 assert.equal(await page.locator('#rqAgentDrawer').getAttribute('aria-busy'),'true');
 assert.equal(await page.locator('#rqAgentPhase').textContent(),'Preparing proposal');
 assert.equal(await page.locator('#rqAgentApply').isEnabled(),false);
 respond({status:401,body:{error:'HTTP_401'}});
 await page.waitForFunction(()=>document.querySelector('#rqAgentDrawer')?.dataset.phase==='error');
 assert.equal(await page.locator('#rqAgentConsent').isChecked(),false);
 assert.equal(await page.locator('#rqAgentDrawer').getAttribute('aria-busy'),'false');
 assert.ok((await page.locator('#rqAgentMessages').textContent()).includes('credentials'));
 assert.equal(requests.length,1);
 assert.ok(requests[0].conversation.every(turn=>Object.keys(turn).sort().join(',')==='role,text'),
  'Local sound actions and their cue snapshots must never be added to provider conversation');
 if(captures)await page.screenshot({path:path.join(captures,'ai-v3-error.png'),animations:'disabled'});
 await page.locator('#uiLocaleSelect').selectOption('es');
 assert.equal(await page.locator('#rqAgentViewSource').textContent(),'Ver guion');
 assert.equal(await page.locator('#rqAgentAskAI').textContent(),'Consultar IA');
 assert.equal(await page.locator('#rqAgentPhase').textContent(),'Revisar error');
 assert.ok((await page.locator('#rqAgentConsentDisclosure').textContent()).includes('No se envían archivos de audio'));
 assert.equal((await read()).scriptText,original.scriptText);
 assert.equal((await read()).active.length,0);
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
 assert.equal(requests.length,1);
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 console.log('AI REVIEW E2E PASS: original WAVs/source, visible actual cue context, read-only navigation, selective Hero review/apply/undo, responsive review space, one-shot offline error/loading and ES/EN chrome. No provider/microphone/acoustic measurement.');
}finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));server.closeAllConnections();
}
