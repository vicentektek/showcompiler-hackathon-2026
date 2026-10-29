/**
 * Sound Lab one-step review → library/cue Chrome E2E.
 * Real local HTTP + mocked Modal client, offline PCM16 WAV and Web Audio.
 * No real provider, API key, billable calls or show GO are involved.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from './dev-server.mjs';
import { createSfxJobStore } from '../src/core/sfxJobStore.mjs';
import { inspectPcm16Wav } from '../src/core/modalSfxPilotClient.mjs';
import { chromium } from 'playwright-core';

function fakeWav() {
  const rate=16000,frames=rate*2;
  const b=Buffer.alloc(44+frames*2);
  b.write('RIFF',0,'ascii');b.writeUInt32LE(b.length-8,4);
  b.write('WAVE',8,'ascii');b.write('fmt ',12,'ascii');
  b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
  b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);
  b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
  b.write('data',36,'ascii');b.writeUInt32LE(frames*2,40);
  for(let i=0;i<frames;i++)
    b.writeInt16LE(Math.floor(3000*Math.sin(2*Math.PI*440*i/rate)),44+i*2);
  return b;
}
const wav=fakeWav(),meta=inspectPcm16Wav(wav);
const dir=await mkdtemp(join(tmpdir(),'runq-sfx-one-step-'));
let browser,server;
const calls={start:0,status:0,download:0,review:0};
const client={
  async start(){calls.start++;return {jobId:'fc-'+calls.start,status:'QUEUED'};},
  async status(id){calls.status++;return {jobId:id,status:'COMPLETED',wav:meta};},
  async download(){calls.download++;return {bytes:wav,metadata:meta};},
  async cancel(){throw Error('No cancellation expected');},
};
try{
  server=createAppServer({
    sfxConfig:()=>({enabled:true,estimatedMaxCostUsdPerRequest:0.05,
      dailyBudgetUsd:0.5,modelRevision:'a'.repeat(40)}),
    sfxStore:createSfxJobStore({directory:dir,maxDailyStarts:3}),
    sfxPilotClient:client,
  });
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  await page.addInitScript(()=>{
    window.__auditionStarts=0;
    window.AudioContext=class{
      constructor(){this.state='running';this.destination={};this.currentTime=0;}
      async resume(){}
      async close(){}
      async decodeAudioData(buffer){
        const v=new DataView(buffer),channels=v.getUint16(22,true);
        const rate=v.getUint32(24,true),frames=v.getUint32(40,true)/(2*channels);
        const data=Array.from({length:channels},()=>new Float32Array(frames));
        for(let i=0;i<frames;i++)
          for(let channel=0;channel<channels;channel++)
            data[channel][i]=v.getInt16(44+2*(i*channels+channel),true)/32768;
        return {numberOfChannels:channels,sampleRate:rate,length:frames,
          duration:frames/rate,getChannelData:channel=>data[channel]};
      }
      createGain(){return {gain:{value:1,cancelScheduledValues(){},
        setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};}
      createBufferSource(){return {buffer:null,onended:null,connect(){},disconnect(){},
        start(){window.__auditionStarts++;},stop(){}};}
    };
  });
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#homeDemoBtn').click();
  await page.waitForFunction(()=>document.querySelector('#cuesCount')?.textContent==='3');
  await page.locator('[data-workspace-nav="audio"]').click();
  await page.locator('[data-rq10-sound-tab="generate"]').click();
  await page.waitForFunction(()=>document.querySelector('#engineBadge')?.textContent==='Generador configurado');

  async function generate(){
    await page.locator('#soundPrompt').fill(
      'A single large bronze bell strike recorded close, with a clear attack and natural decay.');
    await page.locator('#duration').fill('2');
    await page.locator('#confirmRequest').check();
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#generateBtn').click();
    await page.waitForFunction(()=>document.querySelector('#jobState')?.textContent?.includes('cola'));
    assert.equal(await page.locator('#importLibraryBtn').isDisabled(),true);
    await page.locator('#sfxCheckResultBtn').click();
    await page.waitForFunction(()=>document.querySelector('#audioName')?.textContent?.includes('Generado'));
    assert.equal(await page.locator('#importLibraryBtn').isDisabled(),true,
      'WAV cannot be accepted/imported before actual audition');
    await page.locator('#playBtn').click();
    assert.equal(await page.locator('#importLibraryBtn').isEnabled(),true);
  }
  await generate();
  const assetsBefore=await page.locator('#assetList .asset-list-row').count();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#importLibraryBtn').click();
  await page.waitForTimeout(300);
  console.log('SFX_ONE_STEP_DIAGNOSTIC',JSON.stringify({
    feedback:await page.locator('#feedback').textContent(),
    jobState:await page.locator('#jobState').textContent(),
    assetsBefore,assetsAfter:await page.locator('#assetList .asset-list-row').count(),
    importedDisabled:await page.locator('#importLibraryBtn').isDisabled(),
    starts:calls.start,downloads:calls.download,pageErrors,
  }));
  await page.waitForFunction(count=>
    document.querySelectorAll('#assetList .asset-list-row').length===count,
    assetsBefore+1,{timeout:3000});
  assert.equal(await page.locator('#cuesCount').textContent(),'3');
  assert.equal(await page.locator('#importLibraryBtn').isDisabled(),true,
    'Saved remote WAV switches to library identity and cannot import twice');
  assert.equal(calls.start,1);
  assert.equal(calls.download,1);
  assert.equal(await page.evaluate(()=>window.__auditionStarts),1);

  // Second fake request demonstrates the other deliberately chosen outcome:
  // accept + import + create one editable, manually triggered cue.
  await generate();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#importCueBtn').click();
  await page.waitForFunction(()=>document.querySelector('#cuesCount')?.textContent==='4');
  assert.equal(calls.start,2);
  assert.equal(calls.download,2);
  assert.equal(await page.evaluate(()=>window.__auditionStarts),2);
  assert.deepEqual(pageErrors,[]);
  console.log('SFX_ONE_STEP_BROWSER_PASS: 2 fake generated WAVs, 2 auditions, 1 library save, 1 cue save, 0 provider network calls.');
} finally {
  await browser?.close();
  if(server)await new Promise(ok=>server.close(ok));
  await rm(dir,{recursive:true,force:true});
}
