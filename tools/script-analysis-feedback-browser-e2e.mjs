/** From the Script: immediate truthful Meta activity, completion and no forced navigation. No paid calls. */
import assert from 'node:assert/strict';
import {createAppServer} from './dev-server.mjs';
import {planScriptAnalysis} from '../src/core/sceneAnalysis.mjs';
import {chromium} from 'playwright-core';

const server=createAppServer();let browser;
try{
 await new Promise((resolve,reject)=>{
   server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
 });
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let calls=0,failNext=false;
 await page.route('**/api/meta/status',route=>route.fulfill({
   status:200,contentType:'application/json',
   body:JSON.stringify({configured:true,model:'muse-spark-1.3',provider:'META_MODEL_API'})
 }));
 await page.route('**/api/meta/proposals',async route=>{
   calls++;
   if(failNext){
     await route.fulfill({status:503,contentType:'application/json',
       body:JSON.stringify({code:'META_SERVICE'})});
     return;
   }
   const req=route.request().postDataJSON();
   const plan=planScriptAnalysis(req.project.scriptText);
   const start=req.analysisWindowStart??0;
   const selected=plan.windows.slice(start,start+1);
   const end=start+selected.length;
   const lineIds=selected.flatMap(w=>w.coreLines.map(line=>line.id));
   await new Promise(resolve=>setTimeout(resolve,1450));
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     provider:'META_MODEL_API',model:'muse-spark-1.3',
     proposals:lineIds.slice(0,3).map((lineId,i)=>({
       lineId,assetId:null,label:'Verified script suggestion '+(i+1),
       soundPrompt:'Door closes softly, no voices or music'
     })),
     observations:[],duplicatesRemoved:0,
     coverage:{
       totalLines:plan.coverage.totalLines,sceneCount:plan.coverage.sceneCount,
       totalWindows:plan.coverage.windowCount,batchStartWindow:start,
       batchEndWindowExclusive:end,analyzedWindowIds:selected.map(w=>w.id),
       analyzedLineIds:lineIds,analyzedLines:lineIds.length,
       nextWindowStart:end<plan.windows.length?end:null,
       complete:end===plan.windows.length,
     },
   })});
 });
 await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await page.locator('[data-workspace-nav="ai"]').click();
 const chooser=page.waitForEvent('filechooser');
 await page.locator('#rqShowBuilderImportScript').click();
 await (await chooser).setFiles({name:'escena.txt',mimeType:'text/plain',
   buffer:Buffer.from('ESCENA 1\nMARA: Abre la puerta.\n(Se cierra la puerta.)\nESCENA 2\nMARA: Espera aquí.')});
 await page.waitForFunction(()=>document.querySelector('#showName')?.value==='escena');
 assert.equal(await page.locator('#rqScriptImportSummary').isVisible(),true);
 assert.equal(await page.locator('#rqScriptExplorer').getAttribute('open'),null);
 await page.waitForFunction(()=>!document.querySelector('#analyzeMetaBtn')?.disabled);
 await page.locator('#rqShowBuilderProposeCues').click();
 assert.equal(await page.locator('#rqShowBuilderCanvas').getAttribute('data-active-task'),'project',
   'The operator must remain in From the Script throughout analysis');
 assert.equal(await page.locator('#rqScriptAnalysisCard').getAttribute('data-state'),'running');
 assert.equal(await page.locator('#rqScriptAnalysisProgress').isVisible(),true);
 await page.waitForFunction(()=>document.querySelector('#rqScriptAnalysisScope')?.textContent?.includes('window'));
 await page.waitForFunction(()=>document.querySelector('#rqScriptAnalysisCard')?.dataset.state==='success');
 assert.equal(await page.locator('#rqScriptAnalysisProgress').isVisible(),false);
 assert.equal(await page.locator('#rqScriptReviewCues').isVisible(),true);
 assert.equal(calls,1,'One click must produce exactly one Meta request');
 await page.locator('#rqScriptReviewCues').click();
 assert.equal(await page.locator('#rqShowBuilderCanvas').getAttribute('data-active-task'),'cues');
 assert.ok(await page.locator('[data-review-proposal]').count()>0);
 // An explicit repeat error must be shown inline, not hidden in the provider panel.
 await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="project"]').click();
 failNext=true;
 await page.locator('#rqShowBuilderProposeCues').click();
 await page.waitForFunction(()=>document.querySelector('#rqScriptAnalysisCard')?.dataset.state==='error');
 assert.equal(await page.locator('#rqScriptAnalysisProgress').isVisible(),false);
 assert.equal(await page.locator('#rqScriptConfigureAnalysis').isVisible(),true);
 assert.equal(await page.locator('#rqShowBuilderCanvas').getAttribute('data-active-task'),'project');
 assert.equal(calls,2);
 assert.deepEqual(errors,[]);
 console.log('SCRIPT_ANALYSIS_FEEDBACK_PASS: import, visible real progress, review, explicit retry error, no paid calls');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
