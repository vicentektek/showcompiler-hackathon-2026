/** Real Chrome click validation of the reorganized Voice/Rehearsal UI.
 * No microphone permission, no paid Muse request and no audio GO.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createAppServer} from './dev-server.mjs';
import {mkdir} from 'node:fs/promises';
const server=createAppServer();
let browser;
const errors=[];
try{
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve);
 });
 const port=server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{
  if(response.status()>=400)errors.push('HTTP '+response.status()+' '+response.url());
 });
 await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'networkidle'});
 for(const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:1024,height:768}]){
  await page.setViewportSize(viewport);
  await page.locator('[data-workspace-nav="voice"]').click();
  assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'voice');
  assert.equal(await page.locator('#rqLivePanel').isVisible(),true);
  assert.equal(await page.locator('#rqvfPlay').isVisible(),false);
  await page.locator('[data-rq-voice-tab="simulator"]').click();
  assert.equal(await page.locator('#rqvfPlay').isVisible(),true);
  await page.locator('#rqvfStep').click();
  await page.waitForFunction(()=>document.querySelector('#rqvfCounter')?.textContent==='1 / 4');
  await page.locator('#rqvfReset').click();
  await page.locator('[data-rq-voice-tab="diagnostics"]').click();
  assert.equal(await page.locator('#rqMicPanel').isVisible(),true);
  await page.locator('[data-rq-voice-tab="configure"]').click();
  await page.locator('[data-workspace-nav="rehearsal"]').click();
  assert.equal(await page.locator('#rqRehearsalDeck').isVisible(),true);
  assert.equal(await page.locator('#rqvfPanel').isVisible(),false);
  assert.equal(await page.locator('#scriptPreview').isVisible(),true);
  assert.equal(await page.locator('#operatorGoBtn').isVisible(),true);
  assert.equal(await page.locator('#rqRehArm').isDisabled(),true);
  assert.equal(await page.locator('#rqRehStop').isDisabled(),true);
  await page.locator('#rqRehMode').selectOption('auto');
  assert.equal(await page.locator('#rqRehArm').isDisabled(),true,
    'Automatic GO must be impossible without live mic and operator consent');
  await page.locator('#rqRehMode').selectOption('assist');
  assert.equal(await page.locator('#rqRehMode').inputValue(),'assist');
  assert.equal(await page.locator('#rqRehArm').isDisabled(),true);
  await page.locator('#rqRehConfigure').click();
  assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'voice');
  if(process.env.RUNQ_CAPTURE_UI==='1'&&viewport.width===1366){
   await mkdir('artifacts/runq-ui',{recursive:true});
   await page.screenshot({path:'artifacts/runq-ui/voice-v5-configuration.png'});
   await page.locator('[data-workspace-nav="rehearsal"]').click();
   await page.screenshot({path:'artifacts/runq-ui/voice-v5-rehearsal.png'});
  }
 }
 await page.setViewportSize({width:1366,height:768});
 await page.locator('[data-workspace-nav="home"]').click();
 await page.locator('#homeDemoBtn').click();
 await page.waitForFunction(()=>document.querySelector('#cuesCount')?.textContent==='3');
 await page.locator('[data-workspace-nav="voice"]').click();
 await page.locator('[data-rq-voice-tab="triggers"]').click();
 const count=await page.locator('#rqVoiceTriggersList .rq-voice-trigger-row').count();
 assert.equal(count,3);
 await page.locator('#rqVoiceTriggersList button').first().click();
 assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'cues');
 assert.equal(await page.locator('#cueInspectorTab-details').getAttribute('aria-selected'),'true');
 assert.deepEqual(errors,[],'Browser console/network failures: '+JSON.stringify(errors));
 console.log('VOICE V5 CHROME PASS: separate config/simulator/diagnostics, rehearsal safety and trigger navigation');
}catch(error){
 console.error('VOICE V5 CHROME FAILURE',String(error),JSON.stringify(errors));throw error;
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
