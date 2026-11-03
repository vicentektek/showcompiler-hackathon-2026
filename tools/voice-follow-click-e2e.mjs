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
  page.on('console',message=>{if(message.type()==='error')scriptErrors.push(JSON.stringify({message:message.text(),location:message.location()}));});
  page.on('response',response=>{if(response.status()>=400)scriptErrors.push('HTTP '+response.status()+' '+response.url());});
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
  console.log('START_CONTEXT',JSON.stringify({location:page.url(),errors:scriptErrors}));
  for(const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:1024,height:768}]){
    await page.setViewportSize(viewport);
    await tryClick('[data-workspace-nav="rehearsal"]');
    assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'rehearsal');
    await page.locator('#rqvfAdvanced').evaluate(details=>{details.open=true;});
    await tryClick('#rqvfStep');
    await page.waitForFunction(()=>document.querySelector('#rqvfCounter')?.textContent==='1 / 4',null,{timeout:4000});
    await tryClick('#rqvfReset');
    await tryClick('[data-workspace-nav="home"]');
    assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'home');
    console.log('VIEWPORT_CLICK_PASS',viewport.width,JSON.stringify({nav:await inspect('[data-workspace-nav="rehearsal"]')}));
  }
  await page.setViewportSize({width:1366,height:768});
  // Control check: navigation must respond before even entering rehearsal.
  await tryClick('[data-workspace-nav="rehearsal"]');
  assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'rehearsal');
  assert.equal(await page.locator('#rqvfPanel').isVisible(),true);
  assert.equal(await page.locator('#rqvfAdvanced').evaluate(el=>el.open),true,
    'Diagnostic panel remains operator-controlled after earlier opening');
  assert.equal(await page.locator('#rqLiveConsent').count(),0,'Listening uses its explicit Start action, without another permission checkbox');
  assert.ok(await page.locator('#rqvfPrimaryState').isVisible());
  // Voice Live remains strictly opt-in even when the microphone is available.
  assert.equal(await page.locator('#rqLivePanel').isVisible(),true);
  assert.equal(await page.locator('#rqLiveStop').isDisabled(),true);
  assert.equal(await page.locator('#rqLivePrepare').isDisabled(),true);
  assert.equal(await page.locator('#rqLiveDismiss').isDisabled(),true);
  await page.locator('#rqLiveSettingsSummary').click();
  assert.ok(await page.locator('#rqLiveStart').isEnabled(),'Listening is available without extra permissions; this navigation test does not start capture');
  assert.equal(await page.locator('#rqLiveStop').isDisabled(),true);
  await tryClick('[data-workspace-nav="setup"]');
  await tryClick('#setupTabRehearsal');
  await page.locator('#rqLiveLang').selectOption('en');
  await page.locator('#rqLiveLang').selectOption('mixed');
  await page.locator('#rqLiveLang').selectOption('es');
  await tryClick('[data-workspace-nav="rehearsal"]');

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
  // Regression: opening ANY workspace must not throw before event handlers bind.
  for(const workspace of ['script','ai','cues','audio','setup','rehearsal','operation','home']){
    await tryClick('[data-workspace-nav="'+workspace+'"]');
    assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),workspace,'Cannot open '+workspace);
    if(workspace==='audio'){
      await tryClick('[data-rq10-sound-tab="generate"]');
      assert.equal(await page.locator('#generateForm').isVisible(),true,
        'Prompt-only Sound Assistant remains accessible inside Sonido');
      assert.equal(await page.locator('#rqPromptImportCue').isVisible(),true,
        'Manual audio import must remain visible');
      assert.equal(await page.locator('#waveCanvas').isVisible(),false,
        'The redundant legacy waveform editor must be hidden in the prompt view');
      await tryClick('[data-rq10-sound-tab="edit"]');
      assert.equal(await page.locator('#waveCanvas').isVisible(),true,
        'The real non-destructive WAV editor must remain reachable in its own tab');
      await tryClick('[data-rq10-sound-tab="library"]');
      assert.equal(await page.locator('#assetList').isVisible(),true,
        'The actual library must remain accessible');
    }
  }
  const fatal=scriptErrors.filter(error=>!error.includes('Content Security Policy directive')&&!error.includes('/favicon.ico')&&!error.includes('Failed to load resource: the server responded with a status of 404'));
  console.log('BROWSER_DIAGNOSTICS',JSON.stringify(scriptErrors));
  assert.deepEqual(fatal,[], 'Fatal Chrome browser errors: '+JSON.stringify(fatal));
  console.log('VOICE FOLLOW CLICK SMOKE PASS: rehearsal nav, example step/reset/play/pause, home demo; no runtime errors');
}catch(error){
  console.error('VOICE FOLLOW CLICK SMOKE FAILED:',error.message);
  console.error('CHROME_ERRORS:',JSON.stringify(scriptErrors));
  throw error;
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
