/** Unified Show Builder acceptance smoke: real Chrome, local files, zero paid calls. */
import assert from 'node:assert/strict';
import {createAppServer} from './dev-server.mjs';
import {chromium} from 'playwright-core';
const pcm=()=>{
 const rate=16000,frames=rate;const b=Buffer.alloc(44+frames*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
 b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(Math.sin(i/27)*3500),44+i*2);
 return b;
};
const stateOf=page=>page.evaluate(()=>{
 let s;document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:v=>{s=v;}}}));
 return s;
});
const server=createAppServer();let browser;
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='127.0.0.1'&&u.port===String(server.address().port))await route.continue();
  else await route.abort();
 });
 await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await page.locator('[data-workspace-nav="ai"]').click();
 assert.equal(await page.locator('#rqShowBuilder').isVisible(),true);
 assert.equal(await page.locator('#rqShowBuilderAutomationSlot').count(),1);
 assert.equal(await page.locator('#rqPrepareShow').isVisible(),false,'Old batch wizard is optional, not a second header');
 const script='ESCENA 1\nMARA: La puerta se abre cuando termina esta frase.\n(Se abre la puerta lentamente.)';
 await page.locator('#scriptFileInput').setInputFiles({name:'obra.txt',mimeType:'text/plain',buffer:Buffer.from(script)});
 await page.waitForFunction(()=>document.querySelector('#showName')?.value==='obra');
 assert.equal((await stateOf(page)).project.scriptText,script);
 await page.locator('[data-builder-line-select="L3"]').check();
 await page.locator('#rqShowBuilderCreateSelected').click();
 await page.waitForFunction(()=>{
   let s;document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:x=>{s=x;}}}));
   return s?.project.cues.length===1;
 });
 await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="cues"]').click();
 assert.equal(await page.locator('[data-review-cue]').count(),1);
 const first=page.locator('[data-review-cue]').first();
 await first.locator('[data-review-select]').check();
 await page.locator('#rqReviewTriggerPreview').count();
 await page.locator('#rqReviewList').waitFor({state:'visible'});
 await page.getByRole('button',{name:'Suggest triggers',exact:true}).click();
 assert.equal(await page.locator('#rqReviewTriggerPreview').isVisible(),true);
 assert.match(await page.locator('#rqReviewTriggerPreview').textContent(),/L2/);
 await page.locator('#rqReviewTriggerPreview .rq-review-row-actions .btn.accent').click();
 await page.waitForFunction(()=>{
   let s;document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:x=>{s=x;}}}));
   return s?.project.cues[0]?.trigger?.includes('la puerta se abre')||
     s?.project.cues[0]?.trigger?.includes('puerta se abre');
 });
 await first.locator('.rq-review-details > summary').click();
 await first.locator('.rq-review-edit input').first().fill('Puerta · escena inicial');
 await first.locator('.rq-review-edit .btn.accent').click();
 assert.equal((await stateOf(page)).project.cues[0].label,'Puerta · escena inicial');
 // The same row opens the native local WAV picker without switching workspace.
 const chooserPromise=page.waitForEvent('filechooser');
 await page.locator('[data-review-cue] .rq-review-row-actions button').first().click();
 await (await chooserPromise).setFiles({name:'door-inline.wav',mimeType:'audio/wav',buffer:pcm()});
 await page.waitForFunction(()=>{
  let s;document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:x=>{s=x;}}}));
  return s?.project.cues[0]?.actions[0]?.type==='PLAY' &&
    s?.project.assets.some(a=>a.name==='door-inline.wav');
 });
 assert.equal((await page.locator('.shell').getAttribute('data-active-workspace')),'ai');
 page.once('dialog',dialog=>void dialog.accept());
 await page.locator('[data-review-cue] .rq-review-row-actions button').nth(1).click();
 await page.waitForFunction(()=>{
  let s;document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:x=>{s=x;}}}));
  return s?.project.cues[0]?.actions[0]?.type==='SILENT';
 });
 await page.locator('[data-workspace-nav="operation"]').click();
 const prepared=await page.locator('#preparedCueStatus').innerText();
 assert.match(prepared,/1/);
 assert.equal(await page.locator('#operatorGoBtn').isEnabled(),true);
 await page.locator('#operatorGoBtn').click();
 await page.waitForFunction(()=>document.querySelector('#operatorLastGo')?.textContent?.includes('1'));
 assert.equal((await stateOf(page)).project.cues[0].actions[0].type,'SILENT');
 assert.deepEqual(errors,[]);
 console.log('UNIFIED_BUILDER_E2E_PASS: script TXT, inline cue, trigger proposal, cue edit, local WAV and silent GO');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
