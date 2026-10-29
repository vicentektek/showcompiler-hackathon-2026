/**
 * Browser regression: Studio Agent never calls a paid provider or executes
 * playback; two-stage plan/approval/undo operates on one authoritative show.
 * Run after CI installs playwright-core; no audio hardware required.
 */
import assert from 'node:assert/strict';
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
let browser;const errors=[],remote=[];
try{
 const port=server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>void dialog.accept());
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1'||url.port!==String(port)||url.pathname==='/api/agent/interpret'){
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
 await page.locator('#rqAgentPrompt').fill('Pon pies de voz coherentes a todos los cues');
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentApply').waitFor({state:'visible'});
 assert.equal(await page.locator('#rqAgentDiff li').count(),2);
 await page.locator('#rqAgentOps input').first().uncheck();
 assert.equal(await page.locator('#rqAgentDiff li').count(),1,
  'Selective approval previews only the checked operation');
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
 console.log('RUNQ AGENT E2E PASS: script-linked voice proposals, human apply, undo, Stage/Ensayo isolation');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
