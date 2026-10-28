/**
 * Offline Chrome regression: one Sound space, existing Audio Library and
 * Sound Lab routes kept intact. Never grants paid generation or GO.
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
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'networkidle'});
  await page.waitForSelector('#rqSoundWorkspaceTabs',{state:'attached'});
  for(const locale of ['en','es']){
    await page.locator('#uiLocaleSelect').selectOption(locale);
    for(const viewport of [{width:1366,height:768},{width:1093,height:614}]){
      await page.setViewportSize(viewport);
      await page.locator('[data-workspace-nav="audio"]').click();
      assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'audio');
      assert.equal(await page.locator('#rqSoundWorkspaceTabs').isVisible(),true);
      assert.equal(await page.locator('#assetList').isVisible(),true);
      assert.equal(await page.locator('[data-workspace-nav="soundlab"]').isVisible(),false);
      assert.equal(await page.locator('[data-workspace-nav="audio"]').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#rqSoundLibraryBtn').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#rqSoundGeneratorBtn').getAttribute('aria-pressed'),'false');
      assert.equal(await page.locator('#rqSoundLibraryBtn').innerText(),locale==='es'?'Biblioteca de audio':'Audio library');

      await page.locator('#rqSoundGeneratorBtn').click();
      assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'soundlab');
      assert.equal(await page.locator('#generateForm').isVisible(),true);
      assert.equal(await page.locator('#rqSoundGeneratorBtn').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('[data-workspace-nav="audio"]').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#confirmRequest').isChecked(),false,
        'Opening sound generator must not authorize a paid request');
      if(process.env.RUNQ_CAPTURE_UI==='1'&&locale==='es'&&viewport.width===1366){
        await mkdir('artifacts/runq-ui',{recursive:true});
        await page.screenshot({path:'artifacts/runq-ui/runq-v5-sonido-generador.png'});
      }
      await page.locator('#rqSoundLibraryBtn').click();
      assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'audio');
      assert.equal(await page.locator('#assetList').isVisible(),true);
      if(process.env.RUNQ_CAPTURE_UI==='1'&&locale==='es'&&viewport.width===1366)
        await page.screenshot({path:'artifacts/runq-ui/runq-v5-sonido-biblioteca.png'});
      await page.locator('[data-workspace-nav="script"]').click();
      assert.equal(await page.locator('#rqSoundWorkspaceTabs').isVisible(),false);
    }
  }
  assert.deepEqual(errors,[],'Browser errors: '+JSON.stringify(errors));
  console.log('SOUND V5 CHROME PASS: bilingual shared workspace, source routes, preview access, no paid consent');
}catch(error){
  console.error('SOUND V5 CHROME FAILURE',String(error),JSON.stringify(errors));throw error;
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
