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
  page.on('pageerror',e=>errors.push('JS '+e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE '+m.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url());});
  await page.addInitScript(()=>{
    window.__labStarted=0;window.__labStopped=0;
    window.AudioContext=class{
      constructor(){this.state='running';this.destination={};this.currentTime=0;}
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
      createGain(){return {gain:{value:1,cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};}
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
  await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
  // V5 combines the existing Sound Lab behind the visible Sonido workspace.
  await page.locator('[data-workspace-nav="audio"]').click();
  await page.locator('#rqSoundGeneratorBtn').click();
  assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'soundlab');
  await page.waitForTimeout(900);
  console.log('SFX_BROWSER_DIAGNOSTIC',JSON.stringify({
    badge:await page.locator('#engineBadge').textContent(),
    currentUrl:page.url(),
    errors
  }));
  await page.waitForFunction(()=>!['Checking engine','Comprobando conexión'].includes(document.querySelector('#engineBadge')?.textContent?.trim()),null,{timeout:4000});
  assert.equal(await page.locator('#generateBtn').isDisabled(),true);
  assert.equal(await page.locator('#waveCanvas').count(),1);
  await page.locator('#demoAudioBtn').click();
  await page.getByText('Synthetic test sound loaded locally.',{exact:false}).waitFor();
  assert.match(await page.locator('#audioName').innerText(),/NOT AI/);
  assert.equal(await page.locator('#playBtn').isEnabled(),true);
  assert.equal(await page.locator('#exportBtn').isDisabled(),true,'Offline demo WAV is not an accepted remote generation; it must not be exportable as an AI take');
  assert.equal(await page.locator('#sfxFadeIn').isEnabled(),true);
  assert.equal(await page.locator('#sfxFadeOut').isEnabled(),true);
  assert.equal(await page.locator('#importCueBtn').isDisabled(),true,'Offline demo must not create a generated cue');
  await page.locator('#sfxFadeIn').evaluate(input=>{
    input.value='0.5';input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  assert.match(await page.locator('#sfxFadeInLabel').textContent(),/0\.50 s/);
  await page.locator('#sfxFadeOut').evaluate(input=>{
    input.value='0.25';input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  assert.match(await page.locator('#sfxFadeOutLabel').textContent(),/0\.25 s/);
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
  // Export is guarded by accepted remote review, so the local test sound
  // remains audition-only rather than impersonating a generated take.
  assert.equal(await page.locator('#exportBtn').isDisabled(),true);
  assert.equal(billableCalls,0);
  assert.deepEqual(errors,[]);
  if(process.env.RUNQ_CAPTURE_UI==='1'){
    await mkdir('artifacts/runq-ui',{recursive:true});
    await page.screenshot({path:'artifacts/runq-ui/sfx-lab-offline.png',fullPage:true});
  }
  console.log('SFX Lab Chrome smoke PASS — offline demo waveform, preview, STOP, guarded export, zero provider requests.');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
