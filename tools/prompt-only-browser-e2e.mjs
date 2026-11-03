/** Prompt-only sound workflow: actual Chrome, local WAV and zero provider calls. */
import assert from 'node:assert/strict';
import { createAppServer } from './dev-server.mjs';
import { chromium } from 'playwright-core';

const pcm = () => {
  const sampleRate = 16000, frames = sampleRate;
  const b = Buffer.alloc(44 + frames * 2);
  b.write('RIFF',0); b.writeUInt32LE(b.length - 8,4); b.write('WAVE',8);
  b.write('fmt ',12); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20);
  b.writeUInt16LE(1,22); b.writeUInt32LE(sampleRate,24);
  b.writeUInt32LE(sampleRate*2,28); b.writeUInt16LE(2,32);
  b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(frames*2,40);
  for(let i=0;i<frames;i++) b.writeInt16LE(Math.round(Math.sin(i/20)*4000),44+i*2);
  return b;
};
const server=createAppServer();
let browser;
try {
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const settings=await(await page.request.get(origin+'/api/sfx/status')).json();
  assert.equal(settings.promptOnly,true);
  assert.equal(settings.enabled,false);
  const denied=await page.request.post(origin+'/api/sfx/jobs',{data:{},headers:{Origin:origin,'Content-Type':'application/json'}});
  assert.equal(denied.status(),403);
  assert.equal((await denied.json()).code,'SFX_PROMPT_ONLY');
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-workspace-nav="audio"]').click();
  await page.locator('[data-rq10-sound-tab="generate"]').click();
  assert.equal(await page.locator('.rq10-integrated-lab').isVisible(),true);
  assert.equal(await page.locator('#rqPromptImportCue').isVisible(),true);
  assert.equal(await page.locator('#rqPromptTargetCue').isVisible(),true);
  assert.equal(await page.locator('#sfxScriptDetails').isVisible(),true,
    'Script direction interpretation must remain accessible as an optional accordion');
  // The demo must no longer expose controls from the disabled audio generator.
  for(const selector of ['#generateForm > .sfx-row-fields','#sfxAdvanced',
    '.rq-prompt-only-legacy-jobs','.sfx-audio-panel'])
    assert.equal(await page.locator(selector).isVisible(),false,`${selector} must stay hidden in prompt-only mode`);
  assert.equal(await page.locator('#sfxReconnectBtn').isVisible(),false);
  assert.equal(await page.locator('#generateBtn').isDisabled(),true);
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'clipboard',{
      configurable:true,value:{writeText:async text=>{window.__promptCopied=text;}}
    });
  });
  await page.locator('#soundPrompt').fill('Heavy wooden door creaking open, no music or speech.');
  await page.locator('#generateBtn').click();
  await page.waitForFunction(()=>window.__promptCopied?.includes('Heavy wooden door'));
  const chooserPromise=page.waitForEvent('filechooser');
  await page.locator('#rqPromptImportCue').click();
  const chooser=await chooserPromise;
  await chooser.setFiles({name:'original-door.wav',mimeType:'audio/wav',buffer:pcm()});
  await page.waitForFunction(()=>{
    let state;
    document.dispatchEvent(new CustomEvent('runq:show-state-read',{
      detail:{respond:value=>{state=value;}},
    }));
    return state?.assets?.some(asset=>asset.name==='original-door.wav'&&asset.ready);
  });
  await page.locator('#rqPromptOpenLibrary').click();
  assert.equal(await page.locator('[data-rq10-sound-tab="library"]').getAttribute('aria-selected'),'true');
  // The real media editor, previously embedded in Sound Lab, must open from a library item.
  await page.locator('[data-sound-edit]').first().click();
  await page.waitForFunction(()=>document.querySelector('[data-rq10-sound-tab="edit"]')?.getAttribute('aria-selected')==='true');
  assert.equal(await page.locator('#waveCanvas').isVisible(),true);
  await page.locator('#uiLocaleSelect').selectOption('es');
  await page.locator('[data-rq10-sound-tab="generate"]').click();
  assert.match(await page.locator('#generateBtn').textContent(),/Copiar prompt/);
  // Separate fresh project: importing audio with an explicit cue must create PLAY.
  const cuePage=await browser.newPage({viewport:{width:1440,height:900}});
  cuePage.on('pageerror',error=>errors.push(error.message));
  await cuePage.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await cuePage.locator('#homeDemoBtn').click();
  await cuePage.waitForFunction(()=>document.querySelector('#cuesCount')?.textContent==='3');
  await cuePage.locator('[data-workspace-nav="audio"]').click();
  await cuePage.locator('[data-rq10-sound-tab="generate"]').click();
  const choices=cuePage.locator('#rqPromptTargetCue option');
  assert.ok(await choices.count()>1,'Existing editable cues must be offered as import destinations');
  const cueId=await choices.nth(1).getAttribute('value');
  await cuePage.locator('#rqPromptTargetCue').selectOption(cueId);
  assert.match(await cuePage.locator('#rqPromptImportCue').textContent(),/assign to cue|asignar al cue/i);
  const cueChooserPromise=cuePage.waitForEvent('filechooser');
  await cuePage.locator('#rqPromptImportCue').click();
  const cueChooser=await cueChooserPromise;
  await cueChooser.setFiles({name:'assigned-door.wav',mimeType:'audio/wav',buffer:pcm()});
  await cuePage.waitForTimeout(1200);
  const cueDiagnostic=await cuePage.evaluate(()=>{
    let state;
    document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:value=>{state=value;}}}));
    return {cues:state?.cues?.map(c=>({id:c.id,status:c.status,actions:c.actions})),
      assets:state?.assets?.map(a=>({name:a.name,ready:a.ready})),
      uiStatus:document.querySelector('#statusMessage')?.textContent,
      target:document.querySelector('#rqPromptTargetCue')?.value,
      context:document.querySelector('#sfxCueContext')?.textContent};
  });
  console.log('CUE_IMPORT_DIAGNOSTIC',JSON.stringify({cueId,cueDiagnostic}));
  await cuePage.waitForFunction(cueId=>{
    let state;
    document.dispatchEvent(new CustomEvent('runq:show-state-read',{
      detail:{respond:value=>{state=value;}}
    }));
    return state?.cues?.some(cue=>cue.id===cueId&&cue.actions?.some(action=>action.type==='PLAY'))&&
      state?.assets?.some(asset=>asset.name==='assigned-door.wav'&&asset.ready);
  },cueId);
  await cuePage.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: prompt-only Sound assistant copies prompts, imports WAV locally, uses library, blocks Modal and supports ES/EN');
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
