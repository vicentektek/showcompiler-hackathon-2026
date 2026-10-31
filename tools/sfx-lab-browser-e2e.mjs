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
  await page.locator('[data-workspace-nav="audio"]').click();
  assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'audio');
  assert.equal(await page.locator('.rq5-audio-library #assetList').count(),1,
    'Library remains present as the permanent left column');
  assert.equal(await page.locator('[data-workspace-nav="soundlab"]').isVisible(),false,
    'Sound Lab is no longer a duplicate navigation route');
  await page.locator('[data-rq10-sound-tab="generate"]').click();
  assert.equal(await page.locator('.rq10-integrated-lab').isVisible(),true);
  assert.equal(await page.locator('.rq5-audio-library').isVisible(),true);
  assert.equal(await page.locator('.rq5-audio-editor').isVisible(),false);
  await page.waitForTimeout(900);
  console.log('SFX_BROWSER_DIAGNOSTIC',JSON.stringify({
    badge:await page.locator('#engineBadge').textContent(),
    currentUrl:page.url(),
    errors
  }));
  await page.waitForFunction(()=>!['Checking engine','Comprobando conexión'].includes(document.querySelector('#engineBadge')?.textContent?.trim()),null,{timeout:4000});
  assert.equal(await page.locator('#generateBtn').isDisabled(),true);
  assert.equal(await page.locator('#waveCanvas').count(),1);
  await page.locator('details.sfx-offline-example').evaluate(el=>{el.open=true;});
  await page.locator('#demoAudioBtn').click();
  await page.getByText('Local audio example loaded.',{exact:false}).waitFor();
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
  // STOP ALL must stop Sound Lab, unlike the old isolated AudioContext.
  await page.locator('#stopAllBtn').click();
  assert.equal(await page.evaluate(()=>window.__labStopped),1,
    'Global STOP ALL must stop SFX preview');
  assert.equal(await page.locator('#stopBtn').isDisabled(),true);
  await page.locator('#playBtn').click();
  assert.equal(await page.evaluate(()=>window.__labStarted),2);
  await page.locator('[data-rq10-sound-tab="library"]').click();
  assert.equal(await page.evaluate(()=>window.__labStopped),2,
    'Switching to library must cancel SFX preview');
  assert.equal(await page.locator('.rq5-audio-editor').isVisible(),true);
  assert.equal(await page.locator('.rq10-integrated-lab').isVisible(),false);
  await page.locator('[data-rq10-sound-tab="generate"]').click();
  // Export is guarded by accepted remote review, so the local test sound
  // remains audition-only rather than impersonating a generated take.
  assert.equal(await page.locator('#exportBtn').isDisabled(),true);
  // RunQ V10: original library media can enter the SAME reviewed waveform,
  // then produce a NEW cue or replace an existing single-track cue. Neither
  // operation sends a GO or changes source bytes.
  await page.locator('[data-workspace-nav="home"]').click();
  await page.locator('#homeDemoBtn').click();
  await page.waitForFunction(()=>document.querySelector('#cuesCount')?.textContent==='3');
  await page.locator('[data-workspace-nav="audio"]').click();
  assert.equal(await page.locator('#assetList [data-sound-edit]').count(),3);
  await page.locator('[data-rq10-sound-tab="generate"]').click();
  await page.locator('details.sfx-offline-example').evaluate(el=>{el.open=true;});
  await page.locator('#demoAudioBtn').click();
  await page.locator('#playBtn').click();
  assert.equal(await page.locator('#operatorGoBtn').isDisabled(),true,
    'Prepared GO must be blocked throughout Sound Lab preview');
  await page.locator('#stopAllBtn').click();
  assert.equal(await page.locator('#operatorGoBtn').isEnabled(),true,
    'STOP ALL releases the preview lease so prepared GO can run');
  const beforeReviewStarts=await page.evaluate(()=>window.__labStarted);
  await page.locator('#assetList [data-sound-edit]').first().click();
  await page.locator('#rq10CreateLibraryCue').waitFor({state:'visible'});
  assert.equal(await page.locator('#rq10CreateLibraryCue').isEnabled(),true);
  assert.equal(await page.locator('[data-rq10-sound-tab="generate"]').getAttribute('aria-selected'),'true');
  await page.locator('#inPoint').fill('0.05');
  await page.locator('#inPoint').dispatchEvent('change');
  page.once('dialog',d=>d.accept());
  await page.locator('#rq10CreateLibraryCue').click();
  await page.waitForFunction(()=>document.querySelector('#cuesCount')?.textContent==='4');
  assert.equal(await page.evaluate(()=>window.__labStarted),beforeReviewStarts,
    'Creating a cue from the audio editor must never trigger playback');
  assert.ok((await page.locator('#rq10TargetCue option').count())>=5,
    'All cue targets must be available from the unified audio desk');
  await page.locator('#rq10TargetCue').selectOption('cue-1');
  page.once('dialog',d=>d.accept());
  await page.locator('#rq10AssignLibraryCue').click();
  assert.equal(await page.evaluate(()=>window.__labStarted),beforeReviewStarts,
    'Assigning sound and trims cannot execute a GO');
  await page.locator('[data-workspace-nav="cues"]').click();
  await page.locator('#cueList [data-cue-select]').first().click();
  assert.equal(await page.locator('#cuePlaybackForm [name="startAtMs"]').inputValue(),'50',
    'Library-to-cue review settings must be persisted as milliseconds');
  assert.equal(billableCalls,0);
  assert.deepEqual(errors,[]);
  if(process.env.RUNQ_CAPTURE_UI==='1'){
    await mkdir('artifacts/runq-ui',{recursive:true});
    await page.screenshot({path:'artifacts/runq-ui/sfx-lab-offline.png',fullPage:true});
  }
  console.log('SFX Lab V10 smoke PASS — unified library, mode toggle, STOP ALL, SFX preview cancellation, no provider calls.');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
