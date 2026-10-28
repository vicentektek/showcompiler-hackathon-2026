/**
 * Offline Chrome smoke for file -> manual show cues; fake PCM decoding only.
 * Exercises rendered V8 app and checks that importing never starts audio.
 */
import assert from 'node:assert/strict';
import {createAppServer} from './dev-server.mjs';
import {chromium} from 'playwright-core';

const server=createAppServer();let browser;
try{
  await new Promise((resolve,reject)=>{
    server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
  });
  const port=server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1366,height:850}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    window.__goStarts=0;
    class FakeAudioContext{
      constructor(){this.state='running';this.currentTime=1;this.destination={}}
      async resume(){} async close(){}
      async decodeAudioData(bytes){
        if(new Uint8Array(bytes)[0]===0x42)throw Error('bad PCM');
        const samples=new Float32Array(1200).fill(.15);
        return {duration:3,numberOfChannels:1,length:1200,sampleRate:400,
          getChannelData:()=>samples};
      }
      createGain(){return{gain:{value:1,cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}}}
      createBufferSource(){return{buffer:null,playbackRate:{value:1},connect(){},disconnect(){},
        start(){window.__goStarts++},stop(){}}}
    }
    window.AudioContext=FakeAudioContext;
  });
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1'&&url.port===String(port)&&
      !url.pathname.startsWith('/api/'))return route.continue();
    return route.abort();
  });
  await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-workspace-nav="cues"]').click();
  assert.equal(await page.locator('#cueList .rq-audio-cue-import button').count(),1);
  await page.locator('#cueList input[type=file]').setInputFiles([
    {name:'01 Start.mp3',mimeType:'audio/mpeg',buffer:Buffer.from('MP3 start')},
    {name:'03 End.wav',mimeType:'audio/wav',buffer:Buffer.from('WAV end')},
    {name:'bad.wav',mimeType:'audio/wav',buffer:Buffer.from('BAD audio')},
  ]);
  await page.waitForFunction(()=>document.querySelectorAll('#cueList [data-rq-cue-row]').length===2);
  assert.deepEqual(await page.locator('#cueList .cue-row-title').allInnerTexts(),['01 Start','03 End']);
  assert.match(await page.locator('#cueList .rq-audio-cue-report').innerText(),/2/);
  assert.equal(await page.locator('#assetList [data-asset-audition]').count(),2);
  // Drop a third source before the second cue (the cursor is above its midpoint).
  await page.locator('#cueList').evaluate(list=>{
    const second=list.querySelectorAll('[data-rq-cue-row]')[1];
    const box=second.getBoundingClientRect();
    const files=new DataTransfer();
    files.items.add(new File(['WAV middle'],'02 Middle.wav',{type:'audio/wav'}));
    second.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,
      clientY:box.top+2,dataTransfer:files}));
  });
  await page.waitForFunction(()=>document.querySelectorAll('#cueList [data-rq-cue-row]').length===3);
  assert.deepEqual(await page.locator('#cueList .cue-row-title').allInnerTexts(),
    ['01 Start','02 Middle','03 End']);
  // Existing audio can create another cue without overwriting or decoding it.
  await page.locator('[data-workspace-nav="audio"]').click();
  await page.locator('#assetList .asset-list-row').first().getByRole('button',{name:/Create cue|Crear cue/}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#cueList [data-rq-cue-row]').length===4);
  assert.equal(await page.locator('#assetList [data-asset-audition]').count(),3);
  await page.locator('[data-workspace-nav="cues"]').click();
  // Move first cue to end using the native drag payload, with no playback.
  await page.locator('#cueList').evaluate(list=>{
    const first=list.querySelector('[data-rq-cue-row]');
    const transfer=new DataTransfer();
    transfer.setData('application/x-runq-cue-id',first.dataset.rqCueRow);
    list.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,
      clientY:0,dataTransfer:transfer}));
  });
  assert.deepEqual(await page.locator('#cueList .cue-row-title').allInnerTexts(),
    ['02 Middle','03 End','01 Start','01 Start']);
  assert.equal(await page.evaluate(()=>window.__goStarts),0);
  assert.deepEqual(errors,[]);
  console.log('AUDIO CUE DROP CHROME PASS: batch, partial failure, insert between cues, library reuse, reorder, no GO.');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
