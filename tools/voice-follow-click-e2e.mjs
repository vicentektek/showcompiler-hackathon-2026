/**
 * Independent Chrome click acceptance for Voice Follow and navigation.
 * No provider calls; no microphone; does not call GO.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createAppServer } from './dev-server.mjs';

const server=createAppServer();
let browser;
const scriptErrors=[];
try{
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const port=server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  page.on('pageerror',error=>scriptErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')scriptErrors.push(message.text());});
  page.on('requestfailed',request=>scriptErrors.push('NETWORK '+request.url()+' '+request.failure()?.errorText));
  await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'networkidle'});
  const inspect=async selector=>page.locator(selector).evaluate(element=>{
    const rect=element.getBoundingClientRect();
    const at=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
    const style=getComputedStyle(element);
    return {visible:rect.width>0&&rect.height>0,tag:at?.tagName,id:at?.id,classes:at?.className,
      targetIsSelf:at===element||element.contains(at),pointerEvents:style.pointerEvents,rect:{x:rect.x,y:rect.y,w:rect.width,h:rect.height}};
  });
  const tryClick=async selector=>{
    try{await page.locator(selector).click({timeout:3500});}
    catch(error){
      console.error('CLICK_DIAGNOSTIC',selector,JSON.stringify(await inspect(selector)));
      throw error;
    }
  };
  // Control check: navigation must respond before even entering rehearsal.
  await tryClick('[data-workspace-nav="rehearsal"]');
  assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'rehearsal');
  assert.equal(await page.locator('#rqvfPanel').isVisible(),true);
  assert.equal(await page.locator('#rqvfCounter').textContent(),'0 / 0');
  await tryClick('#rqvfStep');
  await page.waitForFunction(()=>document.querySelector('#rqvfCounter')?.textContent==='1 / 4',{timeout:4000});
  assert.ok((await page.locator('#rqvfCue').textContent()).includes('C14'));
  await tryClick('#rqvfStep');
  await page.waitForFunction(()=>document.querySelector('#rqvfCounter')?.textContent==='2 / 4',{timeout:4000});
  await tryClick('#rqvfStep');
  await page.waitForFunction(()=>document.querySelector('#rqvfCounter')?.textContent==='3 / 4',{timeout:4000});
  assert.ok((await page.locator('#rqvfCue').textContent()).includes('C15'));
  await tryClick('#rqvfReset');
  assert.equal(await page.locator('#rqvfCounter').textContent(),'0 / 0');
  await tryClick('#rqvfPlay');
  await page.waitForFunction(()=>document.querySelector('#rqvfCounter')?.textContent!=='0 / 0',null,{timeout:5000});
  await tryClick('#rqvfPause');
  const paused=await page.locator('#rqvfCounter').textContent();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#rqvfCounter').textContent(),paused);
  await tryClick('[data-workspace-nav="home"]');
  assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'home');
  await tryClick('#homeDemoBtn');
  await page.waitForFunction(()=>document.querySelector('#cuesCount')?.textContent==='3',null,{timeout:10000});
  assert.deepEqual(scriptErrors,[], 'Chrome browser errors: '+JSON.stringify(scriptErrors));
  console.log('VOICE FOLLOW CLICK SMOKE PASS: rehearsal nav, example step/reset/play/pause, home demo; no runtime errors');
}catch(error){
  console.error('VOICE FOLLOW CLICK SMOKE FAILED:',error.message);
  console.error('CHROME_ERRORS:',JSON.stringify(scriptErrors));
  throw error;
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
