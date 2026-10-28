/** Offline Chrome acceptance for Stagecraft per-cue waveform, fades,
 * target/overlap policy, opt-in operation quick GO. No physical sound.
 */
import assert from 'node:assert/strict';
import { createAppServer } from './dev-server.mjs';
import { chromium } from 'playwright-core';

const server=createAppServer();let browser;
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1366,height:820},acceptDownloads:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>{
    window.__started=[];window.__stopped=[];window.__previewVoices=[];
    class FakeAudioContext {
      constructor(){this.state='running';this.currentTime=3;this.destination={};}
      async resume(){}async close(){}
      async decodeAudioData(){
        const samples=new Float32Array(48000);
        for(let i=0;i<samples.length;i++)samples[i]=Math.sin(i/75)*.35;
        return {duration:3,numberOfChannels:1,length:48000,sampleRate:16000,
          getChannelData:()=>samples};
      }
      createGain(){
        let value=1;
        const gain={
          get value(){return value},set value(v){value=v},
          cancelScheduledValues(){},setValueAtTime(v){value=v},
          linearRampToValueAtTime(v){value=v},
        };
        return {gain,connect(){},disconnect(){}};
      }
      createStereoPanner(){return{pan:{value:0},connect(){},disconnect(){}};}
      createBufferSource(){
        const voice={buffer:null,onended:null,playbackRate:{value:1},
          connect(){},disconnect(){},
          start(...args){window.__started.push(args);},
          stop(t){window.__stopped.push(t??'now');}};
        window.__previewVoices.push(voice);
        return voice;
      }
    }
    window.AudioContext=FakeAudioContext;
  });
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1' && url.port===String(port) && !url.pathname.startsWith('/api/')) return route.continue();
    return route.abort();
  });
  await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#homeDemoBtn').click();
  await page.waitForFunction(()=>document.querySelector('#cuesCount')?.textContent==='3');
  await page.locator('[data-workspace-nav="cues"]').click();
  const rows=page.locator('#cueList [data-cue-select]');
  await rows.first().click();
  assert.equal(await page.locator('#cuePlaybackForm [name="endAtMs"]').count(),1);
  assert.equal(await page.locator('.cue-waveform-canvas').count(),1);
  const pixels=await page.locator('.cue-waveform-canvas').evaluate(canvas=>{
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let visible=0;for(let i=0;i<pixels.length;i+=40)if(pixels[i+3])visible++;
    return visible;
  });
  assert.ok(pixels>100,'real PCM waveform must be drawn onto canvas');
  const originalPrepared=await page.locator('#preparedCueStatus').innerText();
  const form=page.locator('#cuePlaybackForm');
  await form.locator('.cue-wave-ms-advanced summary').click();
  await form.locator('[name="startAtMs"]').fill('180');
  await form.locator('[name="endAtMs"]').fill('1560');
  await form.locator('[name="fadeInMs"]').fill('220');
  await form.locator('[name="fadeOutMs"]').fill('360');
  // Staged audition must not prepare, stop or GO the show.
  const before=await page.evaluate(()=>window.__started.length);
  await page.locator('[data-preview-cue="cue-1"]').click();
  await page.waitForFunction(n=>window.__started.length===n+1,before);
  assert.equal(await page.locator('#preparedCueStatus').innerText(),originalPrepared);
  await page.locator('[data-preview-stop]').first().click();
  await form.getByRole('button',{name:/Save playback|Guardar/i}).click();
  assert.equal(await page.locator('#cuePlaybackForm [name="endAtMs"]').inputValue(),'1560');
  await rows.nth(1).click();
  assert.equal(await page.locator('#cuePlaybackForm [name="endAtMs"]').inputValue(),'');
  assert.equal(await page.locator('#cuePlaybackForm [name="fadeInMs"]').inputValue(),'0');
  // Cue 2 wants to stop previous sounds; cue 1 settings remain unchanged.
  await page.locator('[data-inspector-tab="actions"]').click();
  assert.equal(await page.locator('#cueEntryMode').inputValue(),'OVERLAP');
  await page.locator('#cueEntryMode').selectOption('STOP_PREVIOUS');
  await page.locator('#cueEntryPolicyForm [name="fadeSeconds"]').fill('0.5');
  await page.locator('#cueEntryPolicyForm button[type="submit"]').click();
  await page.locator('[data-inspector-tab="actions"]').click();
  assert.equal(await page.locator('#cueEntryMode').inputValue(),'STOP_PREVIOUS');
  // Default double-click policy is OFF in both editor and operation.
  await page.locator('[data-workspace-nav="operation"]').click();
  const beforeOperation=await page.evaluate(()=>window.__started.length);
  await rows.nth(1).dblclick();
  assert.equal(await page.evaluate(()=>window.__started.length),beforeOperation);
  assert.equal(await page.locator('#preparedCueStatus').innerText(),originalPrepared);
  await page.locator('[data-workspace-nav="setup"]').click();
  assert.equal(await page.locator('#runqDoubleClickGo').isChecked(),false);
  await page.locator('#runqDoubleClickGo').check();
  await page.locator('[data-workspace-nav="operation"]').click();
  await page.locator('#operatorGoBtn').click(); // GO #1 (trimmed)
  await page.waitForFunction(n=>window.__started.length===n+1,beforeOperation);
  assert.ok((await page.locator('#preparedCueStatus').innerText()).includes('2'));
  const stopCount=await page.evaluate(()=>window.__stopped.length);
  await rows.nth(1).dblclick(); // SET NEXT + GO #2; stop #1 with 500ms fade
  await page.waitForFunction(n=>window.__started.length===n+2,beforeOperation);
  assert.ok((await page.evaluate(n=>window.__stopped.length>n,stopCount)));
  assert.ok((await page.locator('#preparedCueStatus').innerText()).includes('3'));
  const afterQuick=await page.evaluate(()=>window.__started.length);
  await rows.nth(1).dblclick(); // Already running: must be ignored.
  assert.equal(await page.evaluate(()=>window.__started.length),afterQuick);
  await page.locator('[data-workspace-nav="cues"]').click();
  await rows.nth(2).dblclick(); // Never GO from Cue Editor.
  assert.equal(await page.evaluate(()=>window.__started.length),afterQuick);
  await page.locator('#stopAllBtn').click();
  assert.deepEqual(errors,[]);
  console.log('CUE SAFETY CHROME PASS: waveform, staged trim, preview, STOP_PREVIOUS fade, opt-in quick GO, no editor double-click GO.');
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
