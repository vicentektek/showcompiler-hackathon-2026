/**
 * Browser regression: Studio Agent never calls a paid provider or executes
 * playback; two-stage plan/approval/undo operates on one authoritative show.
 * Run after CI installs playwright-core; no audio hardware required.
 */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createAppServer} from './dev-server.mjs';
import {createNewShow} from '../src/core/workspace.mjs';
import {insertManualCue} from '../src/core/manualCues.mjs';
import {normalizeShowProject,serializeShowProject} from '../src/core/projectPersistence.mjs';

const lines=[
 'ANA: Ya estamos preparados para empezar esta obra',
 '(Se abre el telón)',
 'LUIS: Tendremos que salir por esa puerta rápidamente',
 '(La puerta se abre)'
].join('\n');
let project=createNewShow({name:'Agente E2E',scriptText:lines});
for(const label of ['Música','Puerta'])project=insertManualCue(project,{label}).project;
project=normalizeShowProject({...project,cues:project.cues.map((c,i)=>({
 ...c,sourceLineIds:[i===0?'L2':'L4']
}))});
const server=createAppServer();
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
let browser;const errors=[],remote=[],agentRequests=[];
try{
 const port=server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>void dialog.accept());
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1'&&url.port===String(port)&&url.pathname==='/api/agent/interpret'){
   agentRequests.push(route.request().postDataJSON());
   return route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({status:'CLARIFY',message:'Offline E2E mock; no show changes.',operations:[]})});
  }
  if(url.hostname!=='127.0.0.1'||url.port!==String(port)){
   remote.push(url.href);return route.abort();
  }
  return route.continue();
 });
 await page.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});
 await page.locator('#projectFileInput').setInputFiles({
  name:'agent-fixture.json',mimeType:'application/json',
  buffer:Buffer.from(serializeShowProject(project))
 });
 await page.waitForFunction(()=>document.querySelector('#cuesCount')?.textContent==='2');
 await page.locator('#rqAgentToggle').click();
 assert.equal(await page.locator('#rqAgentDrawer').isVisible(),true);
 const surface=await page.locator('#rqAgentDrawer').evaluate(el=>getComputedStyle(el).backgroundColor);
 assert.equal(surface,'rgb(25, 39, 52)','V15 dark agent surface must be applied');
 await page.locator('#rqAgentAiOptions summary').click();
 const disclosure=await page.locator('#rqAgentConsentDisclosure').textContent();
 assert.ok(disclosure.includes('120 original script lines'));
 assert.ok(disclosure.includes('Audio files are never sent'));
 assert.equal(await page.locator('#rqAgentConsent').count(),0,
  'Opening AI permissions never authorizes or submits a provider request');
 await page.locator('#rqAgentPrompt').fill('Revisa el cue seleccionado');
 await page.locator('#rqAgentAskAI').click();
 await page.waitForFunction(()=>{
  const status=document.querySelector('#rqAgentStatus')?.textContent??'';
  return status.includes('Consulta finalizada.')||status.includes('Completed. The show was not modified.');
 });
 assert.equal(agentRequests.length,1,'Explicit consent sends exactly one request to the offline mock');
 assert.equal(agentRequests[0].context.workspace,'cues');
 assert.equal(agentRequests[0].context.mode,'design-manual');
 assert.equal(agentRequests[0].context.selectedCueId,project.cues[0].id);
 assert.ok(agentRequests[0].context.cues.some(cue=>cue.id===project.cues[0].id));
 assert.equal(Object.hasOwn(agentRequests[0].context,'audioFiles'),false,
  'The consented context contains asset metadata, never audio file bytes');
 if(process.env.RUNQ_CAPTURE_UI==='1'){
  await mkdir('artifacts/runq-ui',{recursive:true});
  await page.screenshot({path:'artifacts/runq-ui/runq-v15-agent-studio.png'});
 }
 const conversation=await page.locator('#rqAgentMessages').textContent();
 const prepared=()=>page.evaluate(()=>{
  let id;
  document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:value=>{id=value.preparedCueId;}}}));
  return id;
 });
 const before=await prepared();
 await page.locator('[data-workspace-nav="ai"]').click();
 await page.locator('#rqShowBuilderAskAssistant').click();
 assert.equal(await page.locator('#rqAgentWorkspace #rqAgentDrawer').count(),1);
 assert.equal(await page.locator('#rqAgentDrawer').count(),1,'Main AI uses the existing agent instance');
 assert.equal(await page.locator('#rqAgentDrawer').evaluate(element=>getComputedStyle(element).position),'static');
 assert.equal(await page.locator('#rqAgentClose').isVisible(),false);
 assert.equal(await page.locator('#rqAgentMessages').textContent(),conversation,'Docking preserves the conversation');
 assert.equal(agentRequests.length,1,'Entering main AI does not submit a provider request');
 assert.equal(await prepared(),before);
 await page.locator('#rqAgentPrompt').fill('Propón pies de voz para el cue seleccionado');
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentApply').waitFor({state:'visible'});
 assert.equal(await page.locator('#rqAgentOps input').count(),1,
  'Selected-cue voice request must never prepare a whole-show batch');
 assert.equal(agentRequests.length,1,'Explicit selected-cue planning stays local');
 await page.locator('#rqAgentProposal').locator('button').last().click();
 await page.locator('#rqAgentPrompt').fill('Pon pies de voz coherentes a todos los cues');
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentApply').waitFor({state:'visible'});
 assert.equal(await page.locator('#rqAgentDiff li').count(),2);
 await page.locator('#rqAgentOps input').first().uncheck();
 assert.equal(await page.locator('#rqAgentDiff li').count(),1,
  'Selective approval previews only the checked operation');
 await page.locator('[data-workspace-nav="cues"]').click();
 assert.equal(await page.locator('#rqAgentDrawer').isVisible(),false,'Leaving main AI does not leave an overlay open');
 await page.locator('#rqAgentToggle').click();
 assert.equal(await page.locator('#rqAgentDiff li').count(),1,'Contextual agent preserves the same reviewed proposal');
 const read=()=>page.evaluate(()=>{
  let snapshot;
  document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:value=>{snapshot=value;}}}));
  return {cues:snapshot.project.cues.map(c=>({id:c.id,trigger:c.trigger??''})),
    workspace:snapshot.workspace};
 });
 assert.deepEqual((await read()).cues.map(c=>c.trigger),['',''],
  'Preparing a plan must not modify cues');
 await page.locator('#rqAgentApply').click();
 await page.waitForFunction(()=>{
  let state;document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:s=>{state=s;}}}));
  return !state?.project.cues[0]?.trigger && (state?.project.cues[1]?.trigger??'').length>10;
 });
 assert.equal((await read()).cues[0].trigger,'');
 assert.ok((await read()).cues[1].trigger.length>10);
 await page.locator('#rqAgentUndo').click();
 assert.deepEqual((await read()).cues.map(c=>c.trigger),['','']);
 await page.locator('#rqAgentPrompt').fill('Añade 3 cues vacíos al final');
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentApply').waitFor({state:'visible'});
 assert.equal(await page.locator('#rqAgentOps input').count(),3,
   'V15 natural-language empty cue creation should prepare three independently selectable operations');
 assert.deepEqual((await read()).cues.map(c=>c.trigger),['',''],
   'Creative cue preview may not modify show');
 await page.locator('#rqAgentProposal').locator('button').last().click();
 // A destructive edit in an 81-cue show must show all resulting renumbers,
 // not silently truncate after 75. Never apply this plan in the test.
 let longShow=createNewShow({name:'Large review',scriptText:lines});
 for(let i=0;i<81;i++)longShow=insertManualCue(longShow,{label:'Effect '+i}).project;
 await page.locator('#projectFileInput').setInputFiles({
  name:'agent-large-fixture.json',mimeType:'application/json',
  buffer:Buffer.from(serializeShowProject(longShow))
 });
 await page.waitForFunction(()=>document.querySelector('#cuesCount')?.textContent==='81');
 await page.locator('#rqAgentPrompt').fill('Elimina el cue 1');
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentApply').waitFor({state:'visible'});
 assert.equal(await page.locator('#rqAgentDiff li.rq-agent-diff-item').count(),82,
  '81 changed cues plus a visible large-batch warning must be reviewable');
 assert.equal((await read()).cues.length,81,'A preview never deletes a cue');
 await page.locator('[data-workspace-nav="rehearsal"]').click();
 assert.equal(await page.locator('#rqAgentToggle').isVisible(),false);
 assert.equal(await page.locator('#rqAgentDrawer').isVisible(),false);
 const eventTypes=await page.evaluate(()=>{
  let result=[];document.dispatchEvent(new CustomEvent('runq:show-event-read',{
   detail:{respond:x=>{result=x;}}
  }));return result.map(x=>x.type);
 });
 assert.equal(eventTypes.includes('CUE_STARTED'),false);
 assert.deepEqual(remote,[],'No provider calls during offline agent demonstration');
 assert.deepEqual(errors,[],'No browser runtime errors');
 console.log('RUNQ AGENT E2E PASS: bounded active context, explicit consent, script-linked proposals, human apply, undo, Stage/Ensayo isolation');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
