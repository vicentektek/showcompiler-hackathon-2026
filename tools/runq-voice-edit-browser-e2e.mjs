/**
 * Browser E2E for conversational voice cue editing. Simulated: Chrome uses a
 * synthetic microphone (fake capture device fed with a generated WAV) and the
 * transcription endpoint is stubbed in the page, so there is no network,
 * provider or billable request. Run after: npm install --no-save
 * --package-lock=false playwright-core@1.56.1
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {createAppServer} from './dev-server.mjs';
import {createNewShow} from '../src/core/workspace.mjs';
import {insertManualCue} from '../src/core/manualCues.mjs';
import {serializeShowProject} from '../src/core/projectPersistence.mjs';
import {encodeWavPcm16} from '../src/core/wavEncode.mjs';

let project=createNewShow({name:'Voice E2E',scriptText:'ANA: Hola\n(Puerta)\nLUIS: Adios'});
for(const label of ['Intro','Puerta','Final'])project=insertManualCue(project,{label}).project;
await mkdir('artifacts/voice-edit-campaign',{recursive:true});
const wavPath=resolve('artifacts/voice-edit-campaign/fake-mic.wav');
const tone=new Float32Array(48000*3);
for(let i=0;i<tone.length;i++)tone[i]=.3*Math.sin(2*Math.PI*220*i/48000);
await writeFile(wavPath,encodeWavPcm16(tone,48000));

const server=createAppServer();
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
let browser;const errors=[],remote=[],uploads=[];let nextTranscript='Elimina el cue dos';
try{
 const port=server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox',
  '--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-audio-capture='+wavPath]});
 const context=await browser.newContext({viewport:{width:1440,height:900},permissions:['microphone']});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.text()))errors.push(m.text());});
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1'||url.port!==String(port)){remote.push(url.href);return route.abort();}
  if(url.pathname==='/api/voice/transcribe'){
   uploads.push({consent:route.request().headers()['x-runq-voice-consent'],type:route.request().headers()['content-type'],
    bytes:route.request().postDataBuffer()?.length??0});
   return route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({transcript:nextTranscript,language:'es',audioDurationMs:3000})});
  }
  if(url.pathname==='/api/agent/interpret'){remote.push(url.href);return route.abort();}
  return route.continue();
 });
 await page.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});
 await page.locator('#projectFileInput').setInputFiles({name:'v.json',mimeType:'application/json',
  buffer:Buffer.from(serializeShowProject(project))});
 await page.waitForFunction(()=>document.querySelector('#cuesCount')?.textContent==='3');
 const read=()=>page.evaluate(()=>{let s;document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:v=>{s=v;}}}));
  return {labels:s.project.cues.map(c=>c.label),statuses:s.project.cues.map(c=>c.status),canApply:s.canApply};});
 await page.locator('#rqAgentToggle').click();
 const rec=page.locator('#rqAgentVoiceRecord');
 await rec.waitFor({state:'visible'});
 // hold to talk
 const box=await rec.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await page.mouse.down();
 await page.waitForFunction(()=>document.getElementById('rqAgentVoice').dataset.state==='recording');
 assert.equal(await page.evaluate(()=>document.body.dataset.runqVoiceCapture),'agent-voice');
 await page.waitForTimeout(1200);
 await page.mouse.up();
 await page.waitForFunction(()=>document.getElementById('rqAgentVoice').dataset.state==='recorded');
 assert.equal(await page.evaluate(()=>document.body.dataset.runqVoiceCapture??null),null,'capture lock released');
 // consent gate
 await page.locator('#rqAgentVoiceTranscribe').click();
 assert.equal(uploads.length,0,'no upload without consent');
 await page.locator('#rqAgentVoiceConsent').check();
 await page.locator('#rqAgentVoiceTranscribe').click();
 await page.waitForFunction(()=>document.getElementById('rqAgentVoice').dataset.state==='review');
 assert.equal(uploads.length,1);assert.equal(uploads[0].type,'audio/wav');assert.ok(uploads[0].bytes>10000);
 assert.equal(await page.locator('#rqAgentPrompt').inputValue(),'Elimina el cue dos');
 assert.equal(await page.locator('#rqAgentVoiceConsent').isChecked(),false,'consent is single-use');
 assert.deepEqual((await read()).labels,['Intro','Puerta','Final'],'transcript alone changes nothing');
 // reviewable + editable transcript, then propose
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentApply').waitFor({state:'visible'});
 assert.deepEqual((await read()).labels,['Intro','Puerta','Final'],'preview changes nothing');
 await page.locator('#rqAgentApply').click();
 await page.waitForFunction(()=>document.querySelector('#cuesCount')?.textContent==='2');
 assert.deepEqual((await read()).labels,['Intro','Final']);
 assert.match(await page.locator('#rqAgentVoiceHistory li').first().textContent(),/APPLIED/);
 await page.locator('#rqAgentUndo').click();
 await page.waitForFunction(()=>document.querySelector('#cuesCount')?.textContent==='3');
 // cancel path
 await page.locator('#rqAgentPrompt').fill('Elimina el cue 1');
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentDiscard').click();
 assert.deepEqual((await read()).labels,['Intro','Puerta','Final']);
 // transport speech must be rejected and never executed
 nextTranscript='Elimina el cue 2 y dale go';
 await rec.focus();await page.keyboard.down('Space');await page.waitForTimeout(900);await page.keyboard.up('Space');
 await page.waitForFunction(()=>document.getElementById('rqAgentVoice').dataset.state==='recorded');
 await page.locator('#rqAgentVoiceConsent').check();
 await page.locator('#rqAgentVoiceTranscribe').click();
 await page.waitForFunction(()=>document.getElementById('rqAgentVoice').dataset.state==='review');
 await page.locator('#rqAgentSubmit').click();
 await page.waitForFunction(()=>/VOICE_TRANSPORT_REJECTED/.test(document.getElementById('rqAgentMessages').textContent));
 assert.equal(await page.locator('#rqAgentApply').isVisible(),false);
 const after=await read();
 assert.deepEqual(after.labels,['Intro','Puerta','Final']);
 assert.ok(after.statuses.every(s=>s==='DRAFT'));
 assert.equal(uploads.length,2);
 assert.deepEqual(remote,[],'no external or agent/interpret request');
 assert.deepEqual(errors,[],'no console errors');
 await page.screenshot({path:'artifacts/voice-edit-campaign/agent-voice-drawer-1440x900.png'});
 console.log(JSON.stringify({ok:true,uploads:uploads.length,remote:remote.length,errors:errors.length}));
}finally{
 await browser?.close();server.close();
}
