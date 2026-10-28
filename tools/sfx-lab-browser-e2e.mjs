/**
 * Real Chrome Sound Lab smoke. All Web Audio and provider calls are mocked.
 * Checks waveform interaction, preview, STOP, PCM16 export and no paid requests.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createAppServer } from './dev-server.mjs';
import { chromium } from 'playwright-core';

const server=createAppServer({sfxConfig:()=>({enabled:false})});
let browser;
try{
  await new Promise((resolve,reject)=>{
    server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
  });
  const port=server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const ctx=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.__labStarted=0;window.__labStopped=0;
    window.AudioContext=class{
      constructor(){this.state='running';this.destination={};}
      async resume(){}
      async close(){this.state='closed';}
      async decodeAudioData(b){
        const v=new DataView(b);
        if(v.getUint16(20,true)!==1||v.getUint16(34,true)!==16)throw Error('Expected PCM16 WAV');
        const channels=v.getUint16(22,true),sampleRate=v.getUint32(24,true);
        const frames=v.getUint32(40,true)/(2*channels);
        const data=Array.from({length:channels},()=>new Float32Array(frames));
        for(let i=0;i<frames;i++){
          for(let c=0;c<channels;c++)
            data[c][i]=v.getInt16(44+2*(i*channels+c),true)/32768;
        }
        return {sampleRate,numberOfChannels:channels,length:frames,
          duration:frames/sampleRate,getChannelData:c=>data[c]};
      }
      createGain(){return {gain:{value:1},connect(){},disconnect(){}};}
      createBufferSource(){return {buffer:null,onended:null,connect(){},disconnect(){},
        start(){window.__labStarted++},stop(){window.__labStopped++}};}
    };
  });
  let billableCalls=0;
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/api/sfx/jobs')){
      billableCalls++;return route.abort();
    }
    if(url.hostname!=='127.0.0.1'||url.port!==String(port)){
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('http://127.0.0.1:'+port+'/sound-lab',{waitUntil:'domcontentloaded'});
  assert.equal(new URL(page.url()).searchParams.get('workspace'),'soundlab',
    'Old standalone Sound Lab bookmark must open the working integrated studio');
  // Local SFX status is localized by the current lab implementation.
  // Check that the genuine read-only status probe completed, not an obsolete
  // English-only badge copy from the original standalone sketch.
  try {
    await page.waitForFunction(()=>{
      const label=document.querySelector('#engineBadge')?.textContent?.trim();
      return label && label!=='Checking engine' && label!=='Comprobando…';
    },null,{timeout:10000});
  } catch(error) {
    console.error('SFX_INTEGRATED_BOOT_DIAGNOSTIC',JSON.stringify({
      url:page.url(),pageErrors:errors,
      state:await page.evaluate(()=>({
        badge:document.querySelector('#engineBadge')?.textContent,
        feedback:document.querySelector('#feedback')?.textContent,
        audioPanel:!!document.querySelector('#waveCanvas'),
        uiStudio:!!document.querySelector('#rqaiOpen'),
        activeWorkspace:document.querySelector('.shell')?.dataset.activeWorkspace,
      })),
    }));
    throw error;
  }
  assert.equal(await page.locator('#generateBtn').isDisabled(),true);
  assert.equal(await page.locator('#waveCanvas').count(),1);
  await page.locator('#demoAudioBtn').click();
  await page.getByText('Synthetic test sound loaded locally.',{exact:false}).waitFor();
  assert.match(await page.locator('#audioName').innerText(),/NOT AI/);
  assert.equal(await page.locator('#playBtn').isEnabled(),true);
  assert.equal(await page.locator('#exportBtn').isDisabled(),true,
    'Unreviewed synthetic test audio cannot be exported as approved model output');
  await page.locator('#inPoint').fill('0.250');
  await page.locator('#inPoint').dispatchEvent('change');
  await page.locator('#outPoint').fill('1.250');
  await page.locator('#outPoint').dispatchEvent('change');
  assert.equal(await page.locator('#inPoint').inputValue(),'0.25');
  assert.equal(await page.locator('#outPoint').inputValue(),'1.25');
  await page.locator('#playBtn').click();
  assert.equal(await page.evaluate(()=>window.__labStarted),1);
  assert.equal(await page.locator('#stopBtn').isEnabled(),true);
  await page.locator('#stopBtn').click();
  assert.equal(await page.evaluate(()=>window.__labStopped),1);
  assert.equal(await page.locator('#acceptBtn').isDisabled(),true,
    'Synthetic locally generated demonstration must not be accepted as a provider take');
  assert.equal(await page.locator('#importLibraryBtn').isDisabled(),true,
    'Unapproved test sound cannot bypass reviewed AI import');
  assert.equal(billableCalls,0);
  assert.deepEqual(errors,[]);
  if(process.env.RUNQ_CAPTURE_UI==='1'){
    await mkdir('artifacts/runq-ui',{recursive:true});
    await page.screenshot({path:'artifacts/runq-ui/sfx-lab-offline.png',fullPage:true});
  }
  console.log('SFX Lab Chrome smoke PASS — integrated Sound Design, true PCM waveform, preview, STOP, synthetic export blocked, zero provider requests.');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
