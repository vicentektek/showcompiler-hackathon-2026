/** Offline browser acceptance for the interface rework. No provider or microphone. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createAppServer } from './dev-server.mjs';

const server=createAppServer();
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const windowsChrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await chromium.launch({headless:true,...(existsSync(windowsChrome)?{executablePath:windowsChrome}:{channel:'chrome'})});
const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
const errors=[];
const providerPosts=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.startsWith('/api/')&&route.request().method()==='POST')providerPosts.push(url.pathname);
  return url.origin===origin&&!url.pathname.startsWith('/api/')?route.continue():route.abort();
});
await page.addInitScript(()=>{
  window.audioStarts=0;window.audioStops=0;
  window.microphoneRequests=0;window.microphoneStops=0;window.microphoneConstraints=[];
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
    enumerateDevices:async()=>[{kind:'audioinput',label:'Mock microphone',deviceId:'mic-1'}],
    getUserMedia:async constraints=>{
      window.microphoneRequests++;window.microphoneConstraints.push(constraints);
      return {getTracks:()=>[{stop(){window.microphoneStops++;}}]};
    },
  }});
  class MockAudioContext {
    constructor(){this.state='running';this.currentTime=1;this.destination={};}
    async resume(){} async close(){this.state='closed';}
    async decodeAudioData(){const samples=Float32Array.from({length:1200},(_,i)=>Math.sin(i/15)*.4);return {duration:3,numberOfChannels:1,length:1200,sampleRate:400,getChannelData:()=>samples};}
    createGain(){return {gain:{value:1,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}},connect(){},disconnect(){}};}
    createStereoPanner(){return {pan:{value:0},connect(){},disconnect(){}};}
    createBufferSource(){return {buffer:null,onended:null,playbackRate:{value:1},connect(){},disconnect(){},start(){window.audioStarts++;},stop(){window.audioStops++;}};}
    createOscillator(){return {frequency:{value:0},onended:null,connect(){},disconnect(){},start(){},stop(){this.onended?.();}};}
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
    createAnalyser(){return {fftSize:0,getByteTimeDomainData(samples){samples.fill(128);}};}
  }
  window.AudioContext=MockAudioContext;
});
const prepared=()=>page.locator('.cue-prepared [data-cue-select]').getAttribute('data-cue-select');
const route=async name=>{
  await page.locator(`[data-workspace-nav="${name}"]`).click();
  await page.waitForFunction(name=>document.querySelector('.shell').dataset.activeWorkspace===name,name);
  assert.equal(await page.locator('[data-workspace-nav][aria-selected="true"]').count(),1);
};
try {
  await page.goto(origin);
  await page.locator('#homeDemoBtn').click();
  await page.waitForFunction(()=>document.querySelector('#cueList')?.children.length===3);
  await page.locator('[data-cue-select]').first().click();
  const sequence=page.locator('.rq5-sequence-frame');
  const handle=page.locator('.rq7-split-handle');
  const before=await sequence.boundingBox();
  const box=await handle.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+80);
  await page.mouse.down();
  await page.mouse.move(box.x-110,box.y+80,{steps:8});
  await page.mouse.up();
  const after=await sequence.boundingBox();
  assert.ok(before.width-after.width>70,'Dragging the divider must resize the panels, not just move a line');
  console.log('PASS: divider resizes the actual cue panels');
  await handle.focus();await page.keyboard.press('ArrowRight');
  assert.ok((await sequence.boundingBox()).width>after.width+10,'Keyboard resizing changes the panels');
  await page.locator('#rq16ResetLayout').click();
  assert.equal(await handle.getAttribute('aria-valuenow'),'55');
  const initialPrepared=await prepared();
  const sourceText=await page.locator('#scriptPreview').textContent();
  await page.locator('[data-editor-view="inspector"]').click();
  assert.equal(await sequence.isVisible(),false);
  assert.ok((await page.locator('#cueInspector').boundingBox()).width>900);
  await page.locator('[data-editor-view="sequence"]').click();
  assert.equal(await page.locator('#cueInspector').isVisible(),false);
  await page.locator('#rq16ResetLayout').click();
  assert.equal(await prepared(),initialPrepared);
  assert.equal(await page.evaluate(()=>window.audioStarts),0);
  // Text edits remain staged when changing only the pane layout.
  const gain=page.locator('#cuePlaybackForm input[name="gainDb"]');
  await gain.fill('-6');
  await page.locator('[data-editor-view="inspector"]').click();
  assert.equal(await gain.inputValue(),'-6');
  await page.locator('#rq16ResetLayout').click();
  await page.locator('#cuePlaybackForm button[type="submit"]').click();
  assert.equal(await prepared(),initialPrepared);
  await page.locator('#cueSearchInput').fill('no match');
  assert.equal(await page.locator('[data-cue-select]').count(),0);
  await page.locator('#cueSearchInput').fill('');
  assert.equal(await prepared(),initialPrepared);
  console.log('PASS: focus, search and staged editing preserve NEXT and never play');

  await mkdir('artifacts/interface-review',{recursive:true});
  for(const size of [{width:1920,height:1080},{width:1440,height:900},{width:1093,height:614},{width:768,height:900}]){
    await page.setViewportSize(size);
    for(const name of ['home','cues','script','audio','ai','setup','preflight','rehearsal','operation']){
      await route(name);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${name}: no page overflow at ${size.width}`);
      if(['cues','rehearsal','operation'].includes(name)){
        assert.ok(await page.locator('#operatorGoBtn').isVisible());
        assert.ok(await page.locator('#operatorPanicBtn').isVisible());
      }
      if(name==='cues'&&size.width>=1000){
        const go=await page.locator('#operatorGoBtn').boundingBox();
        assert.ok(go.y+go.height<=size.height,`GO stays on screen at ${size.width}`);
        assert.ok((await page.locator('#cueInspector').boundingBox()).height>=180);
      }
      await page.screenshot({path:`artifacts/interface-review/${name}-${size.width}.png`,animations:'disabled'});
    }
  }
  assert.equal(await page.locator('#scriptPreview').textContent(),sourceText);
  assert.equal(await prepared(),initialPrepared);
  assert.equal(await page.evaluate(()=>window.audioStarts),0);
  console.log('PASS: all nine workspaces at four sizes; original script, NEXT and audio untouched');

  await route('setup');
  assert.equal(await page.evaluate(()=>window.microphoneRequests),0,'Opening Setup must not request the microphone');
  await page.locator('#setupTabAudio').click();
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(()=>document.querySelector('#setupTabMicrophone').getAttribute('aria-selected')==='true');
  assert.equal(await page.locator('#setupTabMicrophone').getAttribute('aria-selected'),'true');
  await page.locator('#setupTabAudio').click();
  await page.locator('#setupMasterVolume').evaluate(element=>{
    element.value='40';element.dispatchEvent(new Event('input',{bubbles:true}));
    element.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('runq.operator.preferences.v1')).masterVolume===0.4);
  await page.locator('#setupTestOutput').click();
  await page.waitForFunction(()=>document.querySelector('#setupAudioStatus').textContent.includes('test tone'));
  await page.locator('#setupTabMicrophone').click();
  await page.locator('#rqLiveDevice').selectOption('mic-1');
  await page.locator('#setupMicStart').click();
  await page.waitForFunction(()=>window.microphoneRequests===1);
  assert.deepEqual(await page.evaluate(()=>window.microphoneConstraints[0].audio.deviceId),{exact:'mic-1'});
  await page.locator('#setupMicStop').click();
  assert.equal(await page.evaluate(()=>window.microphoneStops),1);
  await page.locator('#setupTabRehearsal').click();
  await page.locator('#rqLiveLang').selectOption('mixed');
  await page.locator('#rqLiveMode').selectOption('assist');
  await page.waitForFunction(()=>{
    const prefs=JSON.parse(localStorage.getItem('runq.operator.preferences.v1'));
    return prefs.voiceLanguage==='mixed'&&prefs.voiceMode==='assist';
  });
  assert.equal(await page.locator('#rqLiveArm').getAttribute('aria-pressed'),'false');
  await page.locator('#setupTabInterface').click();
  await page.locator('#setupCueDensity').selectOption('comfortable');
  assert.equal(await page.locator('.shell').getAttribute('data-cue-density'),'comfortable');
  await page.locator('#setupResetInterface').click();
  assert.equal(await page.locator('.shell').getAttribute('data-cue-density'),'standard');
  await page.locator('#setupTabAudio').click();
  await page.locator('#setupResetAudio').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('runq.operator.preferences.v1')).masterVolume===1);
  assert.equal(await page.evaluate(()=>window.microphoneRequests),1,'Microphone capture is only requested by its explicit test button');
  console.log('PASS: Setup persists the shared output/input preferences and microphone capture remains explicit');

  await page.setViewportSize({width:1440,height:900});
  await route('audio');
  const wave=page.locator('#rq5WaveCanvas');
  const compact=await wave.boundingBox();
  await page.locator('#rq11ExpandWave').click();
  assert.ok((await wave.boundingBox()).height>compact.height+50,'Expand waveform actually enlarges it');
  await page.locator('#rq11ExpandWave').click();
  await page.locator('#rq10LibrarySearch').fill('clock');
  assert.equal(await page.locator('.asset-list-row:visible').count(),1);
  await page.locator('#rq10LibrarySearch').fill('');
  await page.locator('[data-rq10-sound-tab="generate"]').click();
  assert.ok((await page.locator('.rq10-integrated-lab').boundingBox()).width>700);
  assert.equal(await page.locator('#assetList').isVisible(),false);
  await page.screenshot({path:'artifacts/interface-review/sound-create-1440.png',animations:'disabled'});
  await page.locator('[data-rq10-sound-tab="library"]').click();
  assert.equal(await page.locator('#assetList').isVisible(),true);
  console.log('PASS: sound search, waveform expansion and full-width creation');

  // Explicit operator transport still executes; design operations above did not.
  await route('cues');
  await page.locator('#operatorGoBtn').click();
  await page.waitForFunction(()=>window.audioStarts===1);
  assert.notEqual(await prepared(),initialPrepared);
  await page.locator('#operatorPanicBtn').click();
  assert.ok(await page.evaluate(()=>window.audioStops)>0);
  const next=await prepared();
  await page.locator('[data-cue-select]').first().click();
  assert.equal(await page.locator('[data-preview-cue]').isEnabled(),true,'STOP after ZIP import must unlock audition without reselecting a different cue');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-preview-cue]').click();
  await page.waitForFunction(()=>window.audioStarts===2);
  assert.equal(await prepared(),next);
  await page.locator('#stopAllBtn').click();
  console.log('PASS: explicit GO, STOP ALL and audition retain separate transport state');

  // Drag-to-resize panels change layout only and persist per workspace.
  await route('operation');
  const liveCols=()=>page.evaluate(()=>getComputedStyle(document.querySelector('.cue-workspace-body')).gridTemplateColumns.split(' ')[0]);
  const liveBefore=parseFloat(await liveCols());
  const grip=await page.locator('.cue-workspace-body > .rq-grip-col').boundingBox();
  await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);
  await page.mouse.down();
  await page.mouse.move(grip.x+grip.width/2+200,grip.y+grip.height/2,{steps:5});
  await page.mouse.up();
  assert.ok(parseFloat(await liveCols())>liveBefore+150,'Live cue list widens when its grip is dragged');
  await route('cues');
  await route('operation');
  assert.ok(parseFloat(await liveCols())>liveBefore+150,'Live panel width persists across workspace switches');
  await page.locator('.cue-workspace-body > .rq-grip-col').dblclick();
  assert.ok(Math.abs(parseFloat(await liveCols())-liveBefore)<2,'Double-click restores the default width');
  assert.equal(await prepared(),next,'Resizing never changes the prepared cue');
  // Live script follow panel: opt-in, read-only, follows NEXT's source line.
  assert.equal(await page.locator('.layout>.panel[data-workspaces~="script"]').isVisible(),false,'Live hides the script by default');
  await page.locator('.rq-live-script-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#scriptPreview').getBoundingClientRect().width>200);
  assert.equal(await page.locator('#scriptPreview').isVisible(),true,'Live script drawer opens');
  await page.waitForFunction(()=>document.querySelectorAll('.rq-live-next-line').length===1);
  assert.equal(await prepared(),next,'Showing the script never changes the prepared cue');
  await page.locator('.rq-live-script-toggle').click();
  await page.waitForFunction(()=>document.querySelector('.layout>.panel[data-workspaces~=script]').getBoundingClientRect().width===0);
  console.log('PASS: draggable panels resize, persist and reset without touching NEXT');

  await page.locator('#uiLocaleSelect').selectOption('es');
  await page.reload();
  await route('rehearsal');
  assert.match(await page.locator('#rqvfPrimaryTitle').textContent(),/SEGUIMIENTO/);
  assert.match(await page.locator('#rqLiveTitle').textContent(),/SEGUIMIENTO/);
  await page.locator('#uiLocaleSelect').selectOption('en');
  assert.match(await page.locator('#rqLiveTitle').textContent(),/LIVE VOICE/);
  assert.deepEqual(providerPosts,[],'No provider submissions during offline acceptance');
  assert.deepEqual(errors,[]);
  console.log('PASS: stored ES locale, EN switch, no script errors or provider submissions');
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
