/**
 * Real Chrome Sound Lab smoke. All Web Audio and provider calls are mocked.
 * Checks waveform interaction, preview, STOP, PCM16 export and no paid requests.
 */
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
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
  await page.getByText('Offline editing',{exact:true}).waitFor();
  assert.equal(await page.locator('#generateBtn').isDisabled(),true);
  assert.equal(await page.locator('#waveCanvas').count(),1);
  await page.locator('#demoAudioBtn').click();
  await page.getByText('Synthetic demo loaded (no AI request)',{exact:false}).waitFor();
  assert.match(await page.locator('#audioName').innerText(),/NOT AI/);
  assert.equal(await page.locator('#playBtn').isEnabled(),true);
  assert.equal(await page.locator('#exportBtn').isEnabled(),true);
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
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#exportBtn').click();
  const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),'runq-local-trim.wav');
  const bytes=await readFile(await download.path());
  const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(header.getUint16(22,true),1);
  assert.equal(header.getUint32(24,true),22050);
  assert.equal(header.getUint32(40,true),22050*2);
  assert.equal(billableCalls,0);
  assert.deepEqual(errors,[]);
  if(process.env.RUNQ_CAPTURE_UI==='1'){
    await mkdir('artifacts/runq-ui',{recursive:true});
    await page.screenshot({path:'artifacts/runq-ui/sfx-lab-offline.png',fullPage:true});
  }
  console.log('SFX Lab Chrome smoke PASS — offline waveform, preview, STOP, exported PCM16, zero provider requests.');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
