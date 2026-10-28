/**
 * Real Chromium browser E2E for opt-in rehearsal auto GO.
 * Uses the genuine local demo WAVs and fake completed ASR events.
 * Zero Meta, Modal or Baseten calls; checks the real browser sound engine.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createAppServer} from './dev-server.mjs';
import {buildDemoPackage} from '../src/core/demoShow.mjs';
import {importPortableShow,exportPortableShow} from '../src/core/showArchive.mjs';
import {normalizeShowProject} from '../src/core/projectPersistence.mjs';

const sample=[
 'Nora we have ninety seconds to choose the winning project',
 'Alex we are still debating the future together',
 'Nora the cue is prepared the operator chooses now',
];
const built=await buildDemoPackage();
const {project,audioFiles}=await importPortableShow(new Uint8Array(built.archive));
const modified=normalizeShowProject({...project,cues:project.cues.map((c,i)=>({...c,trigger:sample[i]}))});
const fileMap=new Map(audioFiles.map(a=>[a.assetId,{
 name:a.name,size:a.bytes.byteLength,
 arrayBuffer:async()=>a.bytes.buffer.slice(a.bytes.byteOffset,a.bytes.byteOffset+a.bytes.byteLength),
}]));
const archive=Buffer.from(await exportPortableShow(modified,fileMap));
const server=createAppServer();
await new Promise((resolve,reject)=>{
 server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
});
let browser;const errors=[],remote=[];
try{
 const port=server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true,args:[
  '--no-sandbox','--autoplay-policy=no-user-gesture-required',
 ]});
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',dialog=>void dialog.accept());
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  const local=url.hostname==='127.0.0.1'&&url.port===String(port);
  const readonly=local&&['/api/meta/status','/api/sfx/status'].includes(url.pathname);
  if(!local||(url.pathname.startsWith('/api/')&&!readonly)){
   remote.push(url.href);return route.abort();
  }
  return route.continue();
 });
 await page.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});
 await page.locator('#bundleFileInput').setInputFiles({name:'auto-rehearsal.showcompiler.zip',
  mimeType:'application/zip',buffer:archive});
 await page.waitForFunction(()=>document.querySelector('#cuesCount')?.textContent==='3',null,{timeout:15000});
 await page.locator('[data-workspace-nav="rehearsal"]').click();
 await page.locator('#rqLiveMode').selectOption('auto');
 // Mock "Muse stream is ready" only. It cannot request external services,
 // bypass arming or synthesize fake sound in the browser engine.
 await page.evaluate(()=>{
  document.body.dataset.runqVoiceCapture='live';
  document.dispatchEvent(new CustomEvent('runq:voice-live-ready'));
 });
 assert.equal(await page.locator('#rqLiveArm').isEnabled(),true);
 assert.equal(await page.locator('#rqLiveArm').getAttribute('aria-pressed'),'false');
 const send=async(i,turnId)=>page.evaluate(({trigger,turnId})=>{
  const detail={text:trigger,turnId,handled:false};
  document.dispatchEvent(new CustomEvent('runq:voice-live-final',{detail}));
  return detail.handled;
 },{trigger:sample[i],turnId});
 // Without ARM, no GO even for exact transcript.
 assert.equal(await send(0,'disarmed'),false);
 await page.waitForTimeout(150);
 assert.equal(/\b1\s*·/.test(await page.locator('#operatorLastGo').textContent()),false);
 await page.locator('#rqLiveArm').click();
 await page.waitForFunction(()=>document.querySelector('#rqLiveArm')?.getAttribute('aria-pressed')==='true',null,{timeout:5000});
 assert.equal(await send(0,'first'),true);
 await page.waitForFunction(()=>document.querySelector('#rqLiveCue')?.textContent?.includes('First'),null,{timeout:7000});
 assert.equal(/\b1\s*·/.test(await page.locator('#operatorLastGo').textContent()),true);
 // Jump directly to cue 3: cue 2 must not play.
 assert.equal(await send(2,'skip'),true);
 await page.waitForFunction(()=>document.querySelector('#rqLiveCue')?.textContent?.includes('Jump ahead'),null,{timeout:7000});
 assert.equal(/\b3\s*·/.test(await page.locator('#operatorLastGo').textContent()),true);
 // Rewind from cue 3 to cue 2.
 assert.equal(await send(1,'rewind'),true);
 await page.waitForFunction(()=>document.querySelector('#rqLiveCue')?.textContent?.includes('Backwards'),null,{timeout:7000});
 assert.equal(/\b2\s*·/.test(await page.locator('#operatorLastGo').textContent()),true);
 // Panic must always disarm; speech after emergency stop cannot fire.
 await page.locator('#stopAllBtn').click();
 assert.equal(await page.locator('#rqLiveArm').getAttribute('aria-pressed'),'false');
 assert.equal(await send(0,'after-panic'),false);
 await page.waitForTimeout(150);
 assert.equal(/\b2\s*·/.test(await page.locator('#operatorLastGo').textContent()),true);
 assert.deepEqual(remote,[], 'No provider calls in browser rehearsal E2E');
 assert.deepEqual(errors,[], 'Browser runtime errors');
 console.log('REHEARSAL AUTO GO E2E PASS: off by default, arm unlock, skip, rewind, STOP ALL override, real WAV');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
