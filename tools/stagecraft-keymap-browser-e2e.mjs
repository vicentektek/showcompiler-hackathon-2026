/**
 * Real Chrome acceptance of Stagecraft cue controls and optional operator keys.
 * AudioContext is a deterministic no-speaker mock. NO billable requests.
 */
import assert from 'node:assert/strict';
import { createAppServer } from './dev-server.mjs';
import { chromium } from 'playwright-core';

const server=createAppServer();
let browser;
try{
  await new Promise((resolve,reject)=>{
    server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
  });
  const port=server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1366,height:768}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.addInitScript(()=>{
    window.__testAudioStarts=0;
    window.__testAudioStops=0;
    class FakeAudioContext {
      constructor(){this.state='running';this.currentTime=1;this.destination={};}
      async resume(){}
      async close(){this.state='closed';}
      async decodeAudioData(){return {duration:3,numberOfChannels:1,
        sampleRate:400,length:1200,getChannelData:()=>new Float32Array(1200).fill(.3)};}
      createGain(){
        const gain={value:1,cancelScheduledValues(){},
          setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}};
        return {gain,connect(){},disconnect(){}};
      }
      createStereoPanner(){return {pan:{value:0},connect(){},disconnect(){}};}
      createBufferSource(){
        return {buffer:null,onended:null,playbackRate:{value:1},
          connect(){},disconnect(){},
          start(){window.__testAudioStarts++;},
          stop(){window.__testAudioStops++;}};
      }
    }
    window.AudioContext=FakeAudioContext;
  });
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='127.0.0.1'||url.port!==String(port)||
        url.pathname.startsWith('/api/')) return route.abort();
    return route.continue();
  });
  await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('#runqGoKey').count(),1);
  await page.locator('#homeDemoBtn').click();
  await page.waitForFunction(()=>document.querySelector('#cuesCount')?.textContent==='3');
  await page.locator('[data-workspace-nav="cues"]').click();
  const rows=page.locator('#cueList [data-cue-select]');
  assert.equal(await rows.count(),3);
  // Regression 1: selected cue transport buttons must NOT be CSS-hidden.
  await rows.first().click();
  const selected=page.locator('#cueList .cue-item.cue-selected');
  assert.equal(await selected.locator('.cue-operation-actions').isVisible(),true);
  assert.equal(await selected.locator('.cue-operation-actions button').count(),3);
  assert.equal(await page.locator('#cuePlaybackForm').count(),1);
  // Regression 2: selected source-file actions must survive A -> B -> A.
  await page.waitForFunction(()=>document.querySelectorAll('.rq5-selected-tools .cue-edit-actions button').length>0);
  const firstTools=await page.locator('.rq5-selected-tools button').count();
  assert.ok(firstTools>0);
  await rows.nth(1).click();
  await page.waitForFunction(()=>document.querySelector('.rq5-selected-tools')?.dataset.cueId==='cue-2');
  await rows.first().click();
  await page.waitForFunction(()=>document.querySelector('.rq5-selected-tools')?.dataset.cueId==='cue-1');
  assert.equal(await page.locator('.rq5-selected-tools button').count(),firstTools);
  assert.equal(await selected.locator('.cue-operation-actions').isVisible(),true);
  assert.equal(await page.evaluate(()=>window.__testAudioStarts),0);
  // Space while a cue row has focus must trigger prepared NEXT, NOT select+GO.
  // Enter still handles keyboard selection in the native row button.
  await rows.first().focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.__testAudioStarts===1);
  await page.evaluate(()=>document.activeElement?.blur());
  // Held-key repeats cannot fire the next prepared cue.
  await page.keyboard.down('Space');
  await page.waitForFunction(()=>window.__testAudioStarts===2);
  await page.keyboard.down('Space');
  assert.equal(await page.evaluate(()=>window.__testAudioStarts),2);
  await page.keyboard.up('Space');
  // Keyboard while editing an audio property cannot trigger GO.
  await page.locator('#cuePlaybackForm [name="gainDb"]').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>window.__testAudioStarts),2);
  // Focusing an EDITOR ACTION button never converts Space into another GO.
  await page.locator('#cueAddBtn').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>window.__testAudioStarts),2);
  // Setup shows local persistent remapping, not show/cue fields.
  await page.locator('[data-workspace-nav="setup"]').click();
  assert.equal(await page.locator('#runqGoKey').inputValue(),'Space');
  assert.equal(await page.locator('#runqStopKey').inputValue(),'None');
  await page.locator('#runqGoKey').selectOption('KeyG');
  await page.locator('#runqStopKey').selectOption('Escape');
  assert.equal(await page.locator('#runqGoKey').inputValue(),'KeyG');
  // The two transport actions cannot share a key.
  await page.locator('#runqStopKey').selectOption('KeyG');
  assert.equal(await page.locator('#runqStopKey').inputValue(),'Escape');
  await page.locator('[data-workspace-nav="operation"]').click();
  await page.evaluate(()=>document.activeElement?.blur());
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>window.__testAudioStarts),2);
  await page.keyboard.press('g');
  await page.waitForFunction(()=>window.__testAudioStarts===3);
  assert.ok((await page.locator('#operatorGoBtn').getAttribute('aria-keyshortcuts')).includes('G'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.__testAudioStops>0);
  // Preference survives refresh; original show transport isn't persisted by keymap.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-workspace-nav="setup"]').click();
  assert.equal(await page.locator('#runqGoKey').inputValue(),'KeyG');
  assert.equal(await page.locator('#runqStopKey').inputValue(),'Escape');
  await page.locator('#runqKeyboardReset').click();
  assert.equal(await page.locator('#runqGoKey').inputValue(),'Space');
  assert.equal(await page.locator('#runqStopKey').inputValue(),'None');
  assert.deepEqual(errors,[]);
  console.log('STAGECRAFT KEYMAP SMOKE PASS: controls restored, A-B-A actions, Space GO once, remap, panic, persistence; zero provider calls.');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
