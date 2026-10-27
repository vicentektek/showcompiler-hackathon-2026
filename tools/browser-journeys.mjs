/**
 * RunQ V3 isolated end-to-end browser journeys.
 * Chrome + deterministic fake audio output; local server only; no paid model calls.
 * Each test is independent. Failures do not suppress later tests.
 */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createAppServer} from './dev-server.mjs';
import {readZipStore} from '../src/core/zipStore.mjs';
const OUT='artifacts/runq-journeys';
const results=[];
let blockedExternal=0;
const wait=(p,fn,ms=12000)=>p.waitForFunction(fn,null,{timeout:ms});
const started=p=>p.evaluate(()=>window.__journey.starts);
const stopped=p=>p.evaluate(()=>window.__journey.stops);
const next=p=>p.locator('#preparedCueStatus').innerText();
const goTo=async(p,name)=>{
  await p.locator('[data-workspace-nav="'+name+'"]').click();
  assert.equal(await p.locator('.shell').getAttribute('data-active-workspace'),name);
};
const dialog=(p,allow=true)=>p.once('dialog',d=>allow?d.accept():d.dismiss());
const demo=async p=>{
  await p.locator('#homeDemoBtn').click();
  await wait(p,()=>document.querySelector('#cuesCount')?.textContent==='3');
  assert.equal(await p.locator('#cueList .cue-item').count(),3);
  assert.equal(await started(p),0);
};
const cases=[
  ['Navigation','Workspace navigation and menus',async p=>{
    for(const section of ['script','ai','cues','audio','setup','operation','home']){
      await goTo(p,section);
      assert.equal(await p.locator('[data-workspace-nav][aria-pressed="true"]').count(),1);
    }
    assert.equal(await p.locator('.runq-menu').count(),6);
    assert.equal(await started(p),0);
  }],
  ['Cue operation','Inspection versus one-click NEXT GO, double click and Enter',async p=>{
    await demo(p);await goTo(p,'operation');
    assert.equal(await p.locator('[data-cue-prepare]').count(),3);
    await p.locator('[data-cue-select]').nth(1).dblclick();
    assert.match(await next(p),/1\s*[·.]/);
    await p.locator('[data-cue-prepare]').nth(2).click();
    assert.match(await next(p),/3\s*[·.]/);
    assert.equal(await p.locator('[data-cue-select]').nth(1).getAttribute('aria-pressed'),'true');
    assert.equal(await p.locator('[data-cue-prepare]').nth(2).getAttribute('aria-pressed'),'true');
    await p.locator('[data-cue-prepare]').first().press('Enter');
    assert.match(await next(p),/1\s*[·.]/);
    await goTo(p,'cues');
    await p.locator('[data-cue-prepare]').nth(1).click();
    assert.match(await next(p),/2\s*[·.]/);
    assert.equal(await started(p),0);
  }],
  ['Transport','Space GO, live retarget, STOP ALL, restart guard',async p=>{
    await demo(p);await goTo(p,'operation');
    await p.locator('#cueSearchInput').focus();
    await p.keyboard.press('Space');
    assert.equal(await started(p),0);
    await p.evaluate(()=>document.activeElement?.blur());
    await p.keyboard.press('Space');
    await wait(p,()=>window.__journey.starts>0);
    const before=await started(p),stopsBefore=await stopped(p);
    await p.locator('[data-cue-prepare]').nth(2).click();
    assert.match(await next(p),/3\s*[·.]/);
    assert.equal(await started(p),before);
    assert.equal(await stopped(p),stopsBefore);
    await p.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{
      key:' ',code:'Space',repeat:true,bubbles:true
    })));
    assert.equal(await started(p),before);
    await p.locator('#operatorResetBtn').click();
    assert.match(await next(p),/3\s*[·.]/);
    await p.locator('#operatorPanicBtn').click();
    assert.ok(await stopped(p)>stopsBefore);
    await p.locator('#operatorResetBtn').click();
    assert.match(await next(p),/1\s*[·.]/);
    assert.equal(await p.locator('#stopAllBtn').isEnabled(),true);
  }],
  ['Manual authoring','Create, insert, duplicate, move and remove manual cues',async p=>{
    await p.locator('#homeNewBtn').click();await goTo(p,'cues');
    assert.equal(await p.locator('.cue-item').count(),0);
    for(const name of ['cueAddBtn','cueInsertBtn','cueDuplicateBtn']) await p.locator('#'+name).click();
    assert.equal(await p.locator('.cue-item').count(),3);
    await p.locator('#cueMoveUpBtn').click();
    await p.locator('#cueMoveDownBtn').click();
    dialog(p,false);await p.locator('#cueDeleteBtn').click();
    assert.equal(await p.locator('.cue-item').count(),3);
    dialog(p,true);await p.locator('#cueDeleteBtn').click();
    assert.equal(await p.locator('.cue-item').count(),2);
    await goTo(p,'operation');
    assert.equal(await p.locator('#operatorGoBtn').isDisabled(),true);
    assert.equal(await started(p),0);
  }],
  ['Inspector','Unsaved edit cancellation, discard and eventual save',async p=>{
    await demo(p);await goTo(p,'cues');
    await p.locator('[data-inspector-tab="details"]').click();
    const first=p.locator('.cue-details-editor input').first();
    const original=await first.inputValue();
    await first.fill('Unsaved title');
    dialog(p,false);await p.locator('[data-cue-select]').nth(1).click();
    assert.equal(await p.locator('[data-cue-select]').first().getAttribute('aria-pressed'),'true');
    dialog(p,true);await p.locator('[data-cue-select]').nth(1).click();
    await p.locator('[data-cue-select]').first().click();
    assert.equal(await p.locator('.cue-details-editor input').first().inputValue(),original);
    await p.locator('.cue-details-editor input').first().fill('Saved QA title');
    await p.locator('.cue-details-editor button[type="submit"]').click();
    assert.match(await p.locator('[data-cue-select]').first().innerText(),/Saved QA title/);
    assert.equal(await started(p),0);
  }],
  ['Audio cue editing','Playback params, loop/repeat, extra track and removal',async p=>{
    await demo(p);await goTo(p,'cues');
    await p.locator('#cuePlaybackForm [name="fadeInMs"]').fill('250');
    await p.locator('#cuePlaybackForm [name="gainDb"]').fill('-12');
    await p.locator('#cuePlaybackForm button[type="submit"]').click();
    assert.equal(await p.locator('#cuePlaybackForm [name="fadeInMs"]').inputValue(),'250');
    await p.locator('#cuePlaybackForm [name="loop"]').check();
    assert.equal(await p.locator('#cuePlaybackForm [name="repeatCount"]').isDisabled(),true);
    await p.locator('#cuePlaybackForm [name="loop"]').uncheck();
    await p.locator('#cuePlaybackForm [name="repeatCount"]').fill('3');
    await p.locator('#cuePlaybackForm button[type="submit"]').click();
    assert.equal(await p.locator('#cuePlaybackForm [name="repeatCount"]').inputValue(),'3');
    await p.locator('#cueAddTrackSelect').selectOption('asset-2');
    await p.locator('#cueAddTrackBtn').click();
    assert.equal(await p.locator('.cue-extra-track').count(),1);
    await p.locator('.cue-extra-track summary').click();
    await p.locator('.cue-track-form [name="fadeOutMs"]').fill('1200');
    await p.locator('.cue-track-form button[type="submit"]').click();
    assert.equal(await p.locator('.cue-extra-track').count(),1);
    dialog(p,true);
    await p.locator('.cue-extra-track .cue-track-header button').click();
    assert.equal(await p.locator('.cue-extra-track').count(),0);
    assert.equal(await started(p),0);
  }],
  ['Script and review','TXT import, search and manual approval',async p=>{
    const script='ACT I\nNORA: Opening line.\nSFX: Thunder in the distance.\nNORA: Goodbye.\n';
    await p.locator('#scriptFileInput').setInputFiles({
      name:'qa-rehearsal.txt',mimeType:'text/plain',buffer:Buffer.from(script)
    });
    await wait(p,()=>document.querySelector('#linesCount')?.textContent==='5');
    assert.match(await p.locator('#scriptPreview').innerText(),/SFX: Thunder/);
    await p.locator('#scriptSearchInput').fill('thunder');
    assert.match(await p.locator('#scriptSearchStatus').innerText(),/1/);
    await p.locator('#scriptSearchNextBtn').click();
    await goTo(p,'ai');
    await p.locator('#proposalLabel').fill('Thunder manually authored');
    await p.locator('#lineSelect').selectOption('L3');
    await p.locator('#createProposalBtn').click();
    assert.match(await p.locator('#proposalList').innerText(),/Thunder manually authored/);
    await p.locator('#proposalList').getByRole('button',{name:'Approve'}).click();
    assert.equal(await p.locator('#cueList .cue-item').count(),1);
    assert.equal(await p.locator('#operatorGoBtn').isDisabled(),true);
    assert.equal(await started(p),0);
  }],
  ['Audio library','Audition, stop and local file import',async p=>{
    await demo(p);await goTo(p,'audio');
    dialog(p,true);await p.locator('[data-asset-audition]').first().click();
    await wait(p,()=>window.__journey.starts>0);
    assert.equal(await p.locator('#stopAuditionBtn').isEnabled(),true);
    await p.locator('#stopAuditionBtn').click();
    assert.equal(await p.locator('#stopAuditionBtn').isDisabled(),true);
    const before=await started(p);
    const rate=22050,frames=rate/4,b=Buffer.alloc(44+frames*2);
    b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);
    b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
    b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
    b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);
    b.writeUInt32LE(frames*2,40);
    await p.locator('#audioFileInput').setInputFiles({
      name:'qa-local.wav',mimeType:'audio/wav',buffer:b
    });
    await wait(p,()=>document.querySelector('#assetList')?.textContent.includes('qa-local.wav'));
    assert.equal(await p.locator('.asset-list-row').count(),4);
    assert.equal(await started(p),before);
  }],
  ['Waveform','True PCM display, cancel/save graphical IN, library read-only',async p=>{
    await demo(p);await goTo(p,'cues');
    await p.locator('#cueInspector').getByRole('button',{name:'View waveform'}).click();
    await wait(p,()=>document.querySelector('#waveformStatus')?.textContent.includes('Real PCM waveform'));
    assert.equal(await p.locator('#waveformTrimTools').isVisible(),true);
    await p.locator('#waveformCanvas').scrollIntoViewIfNeeded();
    const box=await p.locator('#waveformCanvas').boundingBox();
    assert.ok(box?.width>200);
    await p.mouse.click(box.x+box.width*.32,box.y+box.height*.5);
    assert.equal(await p.locator('#waveformSaveIn').isEnabled(),true);
    await p.locator('#waveformCancelIn').click();
    assert.equal(await p.locator('#waveformSaveIn').isDisabled(),true);
    await p.mouse.click(box.x+box.width*.18,box.y+box.height*.5);
    await p.locator('#waveformSaveIn').click();
    assert.match(await p.locator('#waveformStatus').innerText(),/IN point saved/);
    await goTo(p,'cues');
    assert.ok(Number(await p.locator('#cuePlaybackForm [name="startAtMs"]').inputValue())>0);
    await goTo(p,'audio');
    await p.locator('[data-asset-waveform]').first().click();
    await wait(p,()=>document.querySelector('#waveformStatus')?.textContent.includes('Real PCM waveform'));
    assert.equal(await p.locator('#waveformTrimTools').isVisible(),false);
    assert.equal(await started(p),0);
  }],
  ['JSON persistence','Serialize edits and restore with missing real media',async p=>{
    await demo(p);await goTo(p,'cues');
    await p.locator('#cuePlaybackForm [name="fadeInMs"]').fill('350');
    await p.locator('#cuePlaybackForm button[type="submit"]').click();
    const waiting=p.waitForEvent('download');
    await p.locator('#saveProjectBtn').click();
    const dl=await waiting,bytes=await readFile(await dl.path());
    const saved=JSON.parse(bytes.toString('utf8'));
    assert.equal(saved.cues[0].playback.fadeInMs,350);
    assert.equal(saved.assets.length,3);
    assert.ok(bytes.length<1000000);
    dialog(p,true);
    await p.locator('#projectFileInput').setInputFiles({
      name:'restore.json',mimeType:'application/json',buffer:bytes
    });
    await wait(p,()=>document.querySelector('#cuesCount')?.textContent==='3');
    assert.equal(await p.locator('#operatorGoBtn').isDisabled(),true);
    assert.equal(await started(p),0);
  }],
  ['ZIP recovery','Full audio archive, reload and reject corrupt JSON',async p=>{
    await demo(p);
    const waiting=p.waitForEvent('download');
    await p.locator('#saveBundleBtn').click();
    const dl=await waiting,bytes=await readFile(await dl.path());
    assert.ok(readZipStore(new Uint8Array(bytes)).has('project.json'));
    const old=await p.locator('#showName').inputValue();
    dialog(p,true);
    await p.locator('#bundleFileInput').setInputFiles({
      name:'qa.showcompiler.zip',mimeType:'application/zip',buffer:bytes
    });
    await wait(p,()=>document.querySelector('#statusMessage')?.textContent.includes('restored with 3 real audio files'));
    assert.equal(await p.locator('#operatorGoBtn').isEnabled(),true);
    dialog(p,true);
    await p.locator('#projectFileInput').setInputFiles({
      name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{broken')
    });
    await wait(p,()=>document.querySelector('#statusMessage')?.classList.contains('error') ||
      /invalid|error|failed/i.test(document.querySelector('#statusMessage')?.textContent||''));
    assert.equal(await p.locator('#showName').inputValue(),old);
    assert.equal(await p.locator('#cueList .cue-item').count(),3);
    assert.equal(await started(p),0);
  }],
  ['Responsive and i18n','EN/ES, densities and 3 viewport sizes',async p=>{
    await demo(p);await goTo(p,'cues');
    for(const locale of ['es','en']){
      await p.locator('#uiLocaleSelect').selectOption(locale);
      assert.equal(await p.locator('#uiLocaleSelect').inputValue(),locale);
      for(const density of ['standard','compact']){
        await p.locator('#runqCueDensity').selectOption(density);
        assert.equal(await p.locator('.shell').getAttribute('data-cue-density'),density);
      }
    }
    for(const [width,height] of [[1920,1080],[1366,768],[1093,614]]){
      await p.setViewportSize({width,height});
      const dims=await p.evaluate(()=>({
        list:document.querySelector('#cueList').getBoundingClientRect().width,
        inspector:document.querySelector('#cueInspector').getBoundingClientRect().width,
        go:document.querySelector('#operatorGoBtn').getBoundingClientRect().bottom,
        stop:document.querySelector('#operatorPanicBtn').getBoundingClientRect().bottom,
      }));
      assert.ok(dims.list>275 && dims.inspector>245,JSON.stringify(dims));
      assert.ok(dims.go<=height && dims.stop<=height,JSON.stringify(dims));
    }
    assert.equal(await started(p),0);
  }],
  ['AI safety','Unconfigured providers cannot generate or play anything',async p=>{
    await demo(p);await goTo(p,'ai');
    for(const value of ['baseten','meta']){
      await p.locator('#modelProviderSelect').selectOption(value);
      assert.equal(await p.locator('#analyzeMetaBtn').isDisabled(),true);
    }
    assert.equal(await started(p),0);
  }],
];
const server=createAppServer();
let browser;
try{
  await new Promise((resolve,reject)=>{
    server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
  });
  const port=server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  await mkdir(OUT,{recursive:true});
  for(const [index,[area,name,fn]] of cases.entries()){
    const at=Date.now(),errors=[],context=await browser.newContext({
      acceptDownloads:true,viewport:{width:1366,height:768},
    });
    const page=await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      window.__journey={starts:0,stops:0};
      class FakeAudioContext{
        constructor(){this.state='running';this.currentTime=1;this.destination={};}
        async resume(){}
        async close(){this.state='closed';}
        async decodeAudioData(){return {duration:3,numberOfChannels:1};}
        createGain(){
          const gain={value:1,cancelScheduledValues(){},
            setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}};
          return{gain,connect(){},disconnect(){}};
        }
        createStereoPanner(){return{pan:{value:0},connect(){},disconnect(){}};}
        createBufferSource(){
          return{buffer:null,onended:null,playbackRate:{value:1},
            connect(){},disconnect(){},
            start(){window.__journey.starts++;},
            stop(){window.__journey.stops++;}
          };
        }
      }
      window.AudioContext=FakeAudioContext;
    });
    await page.route('**/*',route=>{
      const u=new URL(route.request().url());
      if(u.hostname==='127.0.0.1' && u.port===String(port))return route.continue();
      blockedExternal++;return route.abort();
    });
    try{
      await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
      await fn(page);
      assert.deepEqual(errors,[],'Uncaught browser exceptions');
      results.push({area,name,result:'PASS',ms:Date.now()-at});
      console.log('JOURNEY_PASS '+area+' — '+name);
    }catch(error){
      const screenshot=String(index+1).padStart(2,'0')+'-fail.png';
      try{await page.screenshot({path:OUT+'/'+screenshot,timeout:5000});}catch{}
      const message=String(error?.stack??error).slice(0,2500);
      results.push({area,name,result:'FAIL',ms:Date.now()-at,error:message,screenshot,errors});
      console.error('JOURNEY_FAIL '+area+' — '+name+'\n'+message);
    }finally{await context.close();}
  }
}finally{
  try{if(browser)await browser.close();}
  finally{await new Promise(resolve=>server.close(resolve));}
}
const passed=results.filter(r=>r.result==='PASS').length,total=results.length;
const md=[
  '# RunQ V3 — isolated user journey verification','',
  'Chrome headless, mock audio output, loopback only; no paid model requests.','',
  '**'+passed+'/'+total+' scenarios passed.**','',
  '| Domain | Scenario | Result | Time |','|---|---|---|---:|',
  ...results.map(r=>'| '+r.area+' | '+r.name+' | '+r.result+' | '+r.ms+' ms |'),
  '',...results.filter(r=>r.result==='FAIL').flatMap(r=>[
    '## Failure: '+r.name,'',r.error,'','Screenshot: '+r.screenshot,'',
  ]),
  '## Limitations','',
  'No physical audio, native ASIO/PFL or professional real-time timing validation.',
  'No model inference or provider cost: provider request paths stay local.',
  'Journey coverage is not exhaustive code branch coverage.','',
];
await mkdir(OUT,{recursive:true});
await writeFile(OUT+'/report.json',JSON.stringify({
  passed,total,failed:total-passed,blockedExternalRequests:blockedExternal,results
},null,2)+'\n');
await writeFile(OUT+'/report.md',md.join('\n'));
console.log('JOURNEYS_SUMMARY '+passed+'/'+total);
if(passed!==total)process.exitCode=1;
