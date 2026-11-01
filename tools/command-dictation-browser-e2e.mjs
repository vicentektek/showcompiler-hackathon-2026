/**
 * Offline stale-result and reviewed-command regression. Speech and provider
 * responses are controlled fixtures, not real microphone/model measurements.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createAppServer} from './dev-server.mjs';
import {openShowBuilderAssistant} from './browserTestRuntime.mjs';
import {buildEnglishVideoDemo} from './video/build-the-last-go.mjs';

const built=await buildEnglishVideoDemo();
const server=createAppServer();
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const pending=[],voiceReplies=[],voiceRequests=[],cueReplies=[],errors=[],external=[];
try{
 const port=server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 await page.addInitScript(()=>{
  window.microphoneRequests=0;window.microphoneStops=0;
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
   enumerateDevices:async()=>[],
   getUserMedia:async()=>{
    window.microphoneRequests++;
    return {getTracks:()=>[{stop(){window.microphoneStops++;}}]};
   },
  }});
  const proto=window.AudioContext.prototype,createProcessor=proto.createScriptProcessor;
  proto.createMediaStreamSource=function(){return this.createGain();};
  proto.createScriptProcessor=function(...args){
   const node=createProcessor.apply(this,args);window.commandProcessor=node;return node;
  };
 });
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>void dialog.accept());
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1'||url.port!==String(port)){
   external.push(url.hostname);return route.abort();
  }
  if(url.pathname==='/api/agent/interpret'){
   const reply=await new Promise(resolve=>pending.push(resolve));
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(reply)});
  }
  if(url.pathname==='/api/voice/transcribe'){
   voiceRequests.push({headers:route.request().headers(),bytes:route.request().postDataBuffer()});
   const reply=await new Promise(resolve=>voiceReplies.push(resolve));
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(reply)});
  }
  if(url.pathname==='/api/cue-chat/interpret'){
   const reply=await new Promise(resolve=>cueReplies.push(resolve));
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(reply)});
  }
  if(url.pathname.startsWith('/api/')&&route.request().method()==='POST')return route.abort();
  return route.continue();
 });
 await page.goto('http://127.0.0.1:'+port);
 await page.locator('#bundleFileInput').setInputFiles({
  name:'last-go.zip',mimeType:'application/zip',buffer:Buffer.from(built.archive),
 });
 await page.waitForFunction(()=>document.querySelector('#cuesCount')?.textContent==='3');
 await page.locator('[data-workspace-nav="ai"]').click();
 await openShowBuilderAssistant(page);
 await page.locator('#rqAgentAiOptions summary').click();
 await page.locator('#rqAgentPrompt').fill('Rename cue one to Late result');
 await page.locator('#rqAgentConsent').check();
 const request=page.waitForRequest('**/api/agent/interpret');
 const settled=Promise.race([
  page.waitForResponse('**/api/agent/interpret'),
  page.waitForEvent('requestfailed',{predicate:req=>req.url().endsWith('/api/agent/interpret')}),
 ]);
 await page.locator('#rqAgentAskAI').click();await request;
 await page.locator('[data-workspace-nav="operation"]').click();
 await page.locator('[data-workspace-nav="ai"]').click();
 pending.shift()({status:'PLAN',message:'Late offline result',operations:[
  {op:'UPDATE_CUE',cueId:built.project.cues[0].id,changes:{label:'Late result'}},
 ]});
 await settled;
 await page.waitForFunction(()=>document.querySelector('#rqAgentAskAI')?.disabled===false);
 assert.equal(await page.locator('#rqAgentProposal').isVisible(),false,
  'A late AI result must remain invalid after leaving Stage, even when the project is identical');
 assert.equal(await page.locator('#rqAgentMessages').textContent().then(text=>text.includes('Late offline result')),false);
 const read=()=>page.evaluate(()=>{
  let result;
  document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:value=>{result=value;}}}));
  return result;
 });
 const initial=await read();
 const command='Insert a cue before cue three. Name it Decision Tension. Use the selected sound. Set the voice trigger to line twenty.';
 await page.locator('#rqAgentMoreOptions summary').first().click();
 await page.locator('#rqAgentVoice summary').click();
 assert.equal(await page.evaluate(()=>window.microphoneRequests),0,'Opening dictation never acquires a microphone');
 const capture=async prefix=>{
  await page.locator('#'+prefix+'Record').click();
  await page.waitForFunction(()=>Boolean(window.commandProcessor?.onaudioprocess));
  await page.evaluate(()=>{
   window.commandProcessor.onaudioprocess({
    inputBuffer:{getChannelData:()=>new Float32Array(16000).fill(.02)},
   });
  });
  await page.locator('#'+prefix+'Record').click();
  await page.waitForFunction(id=>document.getElementById(id)?.disabled===false,prefix+'Transcribe');
 };
 const upload=async prefix=>{
  await page.locator('#'+prefix+'VoiceConsent').check();
  const request=page.waitForRequest('**/api/voice/transcribe');
  const settled=Promise.race([
   page.waitForResponse('**/api/voice/transcribe'),
   page.waitForEvent('requestfailed',{predicate:req=>req.url().endsWith('/api/voice/transcribe')}),
  ]);
  await page.locator('#'+prefix+'Transcribe').click();await request;return {settled};
 };
 await page.locator('#rqAgentPrompt').fill('');
 await capture('rqAgent');
 assert.equal(voiceRequests.length,0,'Recording alone never uploads');
 assert.equal((await read()).active.length,0,'Silent command capture never starts a cue');
 const recognized=await upload('rqAgent');
 voiceReplies.shift()({transcript:command});await recognized.settled;
 await page.waitForFunction(expected=>document.querySelector('#rqAgentPrompt').value===expected,command);
 assert.equal(voiceRequests[0].headers['x-runq-voice-consent'],'yes');
 assert.equal(voiceRequests[0].headers['content-type'],'audio/wav');
 assert.equal(voiceRequests[0].bytes.subarray(0,4).toString(),'RIFF');
 assert.equal(await page.locator('#rqAgentVoiceConsent').isChecked(),false);
 assert.equal((await read()).cueCount,3,'Recognized command only fills the editor');
 assert.equal(await page.locator('#rqAgentProposal').isVisible(),false);
 await page.locator('#rqAgentSelectedSound').selectOption(built.project.assets[0].id);
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentProposal').waitFor({state:'visible'});
 assert.equal((await read()).cueCount,3);
 await page.locator('#rqAgentApply').click();assert.equal((await read()).cueCount,4);
 await page.locator('#rqAgentUndo').click();assert.equal((await read()).cueCount,3);

 await page.locator('#rqAgentPrompt').fill('Keep this reviewed text');
 await capture('rqAgent');const stopped=await upload('rqAgent');
 assert.equal(await page.locator('#stopAllBtn').isVisible(),false,
  'No-audio design context does not expose a live transport button');
 await page.locator('#stopAllBtn').evaluate(button=>button.click());
 voiceReplies.shift()({transcript:'Late stopped command'});await stopped.settled;
 assert.equal(await page.locator('#rqAgentPrompt').inputValue(),'Keep this reviewed text',
  'STOP ALL invalidates a late transcription');
 assert.equal(await page.locator('#rqAgentRecord').isEnabled(),true,
  JSON.stringify({errors,status:await page.locator('#rqAgentVoiceStatus').textContent(),
   agentStatus:await page.locator('#rqAgentStatus').textContent(),voiceRequests:voiceRequests.length}));
 await capture('rqAgent');
 const replaced=await upload('rqAgent');
 await page.locator('#bundleFileInput').setInputFiles({
  name:'same-last-go.zip',mimeType:'application/zip',buffer:Buffer.from(built.archive),
 });
 await page.waitForFunction(previous=>{
  let next;
  document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:value=>{next=value.generation;}}}));
  return next>previous;
 },initial.generation);
 voiceReplies.shift()({transcript:'Late replaced command'});await replaced.settled;
 assert.notEqual(await page.locator('#rqAgentPrompt').inputValue(),'Late replaced command',
  'Reopening identical project content invalidates the recording generation');

 await page.locator('[data-workspace-nav="cues"]').click();
 await page.locator('[data-editor-view="inspector"]').click();
 await page.locator('#cueInspector .rq-chat-open').click();
 await page.locator('#rqChatVoiceDetails summary').click();
 await page.locator('#rqChatPrompt').fill('Keep this cue text');
 await capture('rqChat');const closed=await upload('rqChat');
 await page.locator('#rqChatClose').click();
 voiceReplies.shift()({transcript:'Late closed cue command'});await closed.settled;
 assert.equal(await page.locator('#rqChatPrompt').inputValue(),'Keep this cue text');
 await page.locator('#cueInspector .rq-chat-open').click();
 await page.locator('#rqChatPrompt').fill('Suggest a carefully balanced volume change informed by the original dialogue');
 await page.locator('#rqChatAiConsent').check();
 const cueRequest=page.waitForRequest('**/api/cue-chat/interpret');
 const cueSettled=Promise.race([
  page.waitForResponse('**/api/cue-chat/interpret'),
  page.waitForEvent('requestfailed',{predicate:req=>req.url().endsWith('/api/cue-chat/interpret')}),
 ]);
 await page.locator('#rqChatSubmit').click();await cueRequest;
 await page.locator('#rqChatClose').click();
 await page.locator('#cueInspector .rq-chat-open').click();
 cueReplies.shift()({status:'PATCH',message:'Late cue model result',changes:{gainDb:-9}});
 await cueSettled;
 assert.equal(await page.locator('#rqChatProposal').isVisible(),false,
  'Close/reopen invalidates a pending single-cue AI proposal, not only voice transcription');
 assert.equal((await read()).preparedCueId,initial.preparedCueId);
 assert.equal((await read()).active.length,0);
 assert.equal(await page.evaluate(()=>document.body.dataset.runqVoiceCapture??null),null);
 assert.equal(await page.evaluate(()=>window.microphoneRequests===window.microphoneStops),true);
 assert.deepEqual(errors,[]);
 assert.deepEqual(external,[]);
 console.log('DICTATED COMMAND E2E PASS: explicit silent capture/upload, transcript-only Hero review/apply/undo, Stage/STOP ALL/identical reopen/close invalidate late results. PCM and ASR are synthetic; no provider or hardware measurement.');
}finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));
}
