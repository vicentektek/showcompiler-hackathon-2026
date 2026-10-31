/**
 * Original Last GO show + reviewed Hero cue + genuine local WAV playback.
 * Completed speech turns are injected; this is NOT live ASR/model accuracy.
 * No external requests or microphone capture are permitted.
 */
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createAppServer} from './dev-server.mjs';
import {buildEnglishVideoDemo} from './video/build-the-last-go.mjs';
import {importPortableShow} from '../src/core/showArchive.mjs';

const built=await buildEnglishVideoDemo();
const command='Insert a cue before cue three. Name it Decision Tension. Use the selected sound. Set the voice trigger to line twenty.';
const server=createAppServer();
await new Promise((resolve,reject)=>{
 server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
});
let browser;
const errors=[],requests=[];
try{
 const port=server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>void dialog.accept());
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1'||url.port!==String(port)||
     (url.pathname.startsWith('/api/')&&route.request().method()!=='GET')){
   requests.push(url.pathname);return route.abort();
  }
  return route.continue();
 });
 await page.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});
 const load=async(bytes,count)=>{
  await page.locator('#bundleFileInput').setInputFiles({
   name:'RUNQ_THE_LAST_GO_EN.showcompiler.zip',mimeType:'application/zip',buffer:Buffer.from(bytes),
  });
  await page.waitForFunction(expected=>document.querySelector('#cuesCount')?.textContent===String(expected),count);
 };
 const read=()=>page.evaluate(()=>{
  let state;
  document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:value=>{state=value;}}}));
  return state;
 });
 await load(built.archive,3);
 const initial=await read();
 assert.equal(initial.assets.every(asset=>asset.ready),true);
 await page.locator('#rqAgentToggle').click();
 await page.locator('#rqAgentPrompt').fill(command);
 await page.locator('#rqAgentSubmit').click();
 await page.waitForFunction(()=>document.querySelector('#rqAgentSubmit')?.disabled===false);
 assert.equal((await read()).cueCount,3,'Unselected sound cannot create a cue');
 assert.equal(await page.locator('#rqAgentProposal').isVisible(),false);
 await page.locator('#rqAgentSelectedSound').selectOption(built.project.assets[0].id);
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentProposal').waitFor({state:'visible'});
 const preview=await page.locator('#rqAgentDiff').textContent();
 assert.ok(preview.includes('L20'));
 assert.ok(preview.includes('01_atmosphere.wav'));
 assert.ok(preview.includes('And what happens if we skip straight to the decision?'));
 assert.equal((await read()).cueCount,3,'Human preview never applies or plays');
 assert.equal((await read()).active.length,0);
 await page.locator('#rqAgentApply').click();
 assert.equal((await read()).cueCount,4);
 await page.locator('#rqAgentUndo').click();
 assert.equal((await read()).cueCount,3);
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentProposal').waitFor({state:'visible'});
 await page.locator('#rqAgentApply').click();
 const configured=(await read()).cues.find(cue=>cue.label==='Decision Tension');
 assert.equal(configured.number,3);
 assert.deepEqual(configured.sourceLineIds,['L20']);
 assert.equal((await read()).scriptText,initial.scriptText);
 const downloadPromise=page.waitForEvent('download');
 await page.locator('#saveBundleBtn').click();
 const download=await downloadPromise;
 const bytes=await readFile(await download.path());
 const restored=await importPortableShow(bytes);
 assert.equal(restored.project.cues.length,4);
 assert.equal(restored.audioFiles.length,3);
 assert.equal(restored.project.scriptText,built.project.scriptText);
 assert.equal(restored.project.cues[2].trigger,configured.trigger);
 await page.reload({waitUntil:'domcontentloaded'});
 await load(bytes,4);
 assert.equal((await read()).assets.every(asset=>asset.ready),true);
 await page.locator('[data-workspace-nav="rehearsal"]').click();
 await page.locator('#rqLiveSessionMode').selectOption('auto');
 await page.evaluate(()=>{
  document.body.dataset.runqVoiceCapture='live';
  document.dispatchEvent(new CustomEvent('runq:voice-live-ready'));
 });
 await page.locator('#rqLiveAutoStart').click();
 await page.waitForFunction(()=>document.querySelector('#rqLiveArm')?.getAttribute('aria-pressed')==='true');
 const speech=async(cue,turnId)=>page.evaluate(({cue,turnId})=>{
  document.dispatchEvent(new CustomEvent('runq:voice-live-final',{
   detail:{text:cue.trigger,turnId,handled:false},
  }));
 },{cue,turnId});
 for(const [index,turnId] of [[0,'opening'],[2,'hero-jump'],[1,'rewind']]){
  const cue=restored.project.cues[index];
  await speech(cue,turnId);
  await page.waitForFunction(id=>{
   let state;
   document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:value=>{state=value;}}}));
   return state.active.some(item=>item.cueId===id)&&
    !document.querySelector('#rqLiveCue')?.textContent.includes('evaluating');
  },cue.id);
 }
 assert.ok((await read()).active.length>0,'Real decoded WAV engine has running instances');
 await page.locator('#rqLivePanicBtn').click();
 assert.equal((await read()).active.length,0);
 assert.equal(await page.locator('#rqLiveArm').getAttribute('aria-pressed'),'false');
 await page.locator('[data-workspace-nav="operation"]').click();
 await page.locator('#operatorResetBtn').click();
 await page.locator('#operatorGoBtn').click();
 await page.waitForFunction(()=>{
  let state;
  document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:value=>{state=value;}}}));
  return state.active.length>0;
 });
 await page.locator('#stopAllBtn').click();
 assert.equal((await read()).active.length,0);
 if(process.env.RUNQ_CAPTURE_UI==='1'){
  await mkdir('artifacts/interface-review',{recursive:true});
  await page.screenshot({path:'artifacts/interface-review/last-go-live.png'});
 }
 assert.deepEqual(requests,[],'No external/billable requests');
 assert.deepEqual(errors,[],'No browser runtime errors');
 console.log('LAST GO E2E PASS: original script, Hero preview/apply/undo, WAV-inclusive save/reopen, armed synthetic speech jump/rewind, real audio engine, manual Live GO and STOP ALL. Live ASR/acoustic validation NOT measured.');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
