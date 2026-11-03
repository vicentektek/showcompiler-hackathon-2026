/** From the Script: immediate truthful Meta activity, completion and no forced navigation. No paid calls. */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
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
 assert.equal(await page.locator('#rqScriptReviewCues').isVisible(),false,
   'No duplicate CTA between completed analysis and the suggestions themselves');
 assert.equal(calls,1,'One click must produce exactly one Meta request');
 assert.equal(await page.locator('#rqScriptQuickReview').isVisible(),true,
   'Suggestions appear directly on From the Script');
 assert.equal(await page.locator('#rqScriptAnalysisCard').isVisible(),false,
   'Completed analysis collapses into the actual review, removing duplicate status panels');
 assert.match(await page.locator('#rqScriptQuickProgressText').innerText(),/Reviewed 0 of 3/);
 const rows=page.locator('[data-script-proposal]');
 assert.equal(await rows.count(),1,'Focus on one decision instead of three full cards');
 await mkdir('artifacts/runq-ui',{recursive:true});
 await page.locator('#rqShowBuilderSourceTask').screenshot({
   path:'artifacts/runq-ui/11-script-one-decision.png',
   animations:'disabled',
 });

 assert.match(await page.locator('#rqScriptQuickShowMore').textContent(),/View all suggestions \(3\)/);
 await page.locator('#rqScriptQuickShowMore').click();
 assert.equal(await rows.count(),3,'The complete list is still available on request');
 await page.locator('#rqScriptQuickShowMore').click();
 assert.equal(await rows.count(),1);
 assert.equal(await page.locator('#rqShowBuilderCanvas').getAttribute('data-active-task'),'project');
 const first=rows.first();
 await first.locator('[data-quick-edit]').click();
 await first.locator('.rq-script-quick-edit-form input').fill('Puerta · propuesta corregida');
 // A routine show-status refresh must not lose the text being edited.
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('runq:show-state-changed')));
 assert.equal(await first.locator('.rq-script-quick-edit-form input').inputValue(),'Puerta · propuesta corregida');
 await first.locator('.rq-script-quick-edit-form button').first().click();
 assert.equal(await rows.first().locator('strong').innerText(),'Puerta · propuesta corregida');
 await rows.first().locator('[data-quick-approve]').click();
 await page.waitForFunction(()=>{
   let s;document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:v=>s=v}}));
   return s?.project?.cues.length===1;
 });
 assert.equal(await page.locator('#rqShowBuilderCanvas').getAttribute('data-active-task'),'project');
 assert.equal(await rows.count(),1,'The next suggestion replaces the approved card in the same position');
 assert.match(await page.locator('#rqScriptQuickProgressText').innerText(),/Reviewed 1 of 3/);
 assert.equal(await page.locator('#rqScriptQuickUndo').isVisible(),true);
 await page.locator('#rqScriptQuickUndo').click();
 await page.waitForFunction(()=>{
   let s;document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:v=>s=v}}));
   return s?.project?.cues.length===0;
 });
 assert.match(await page.locator('#rqScriptQuickProgressText').innerText(),/Reviewed 0 of 3/);
 await rows.first().locator('[data-quick-approve]').click();
 await page.waitForFunction(()=>{
   let s;document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:v=>s=v}}));
   return s?.project?.cues.length===1;
 });
 page.once('dialog',dialog=>void dialog.accept());
 await page.locator('#rqScriptQuickApproveAll').click();
 await page.waitForFunction(()=>{
   let s;document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:v=>s=v}}));
   return s?.project?.proposals.every(p=>p.status!=='PENDING')&&s?.project?.cues.length===3;
 });
 assert.equal(await rows.count(),0);
 assert.match(await page.locator('#rqScriptQuickReview').textContent(),/Review complete/);
 // An explicit repeat error must be shown inline, not hidden in the provider panel.
 failNext=true;
 await page.locator('#rqShowBuilderProposeCues').click();
 await page.waitForFunction(()=>document.querySelector('#rqScriptAnalysisCard')?.dataset.state==='error');
 assert.equal(await page.locator('#rqScriptAnalysisProgress').isVisible(),false);
 assert.equal(await page.locator('#rqScriptConfigureAnalysis').isVisible(),true);
 assert.equal(await page.locator('#rqShowBuilderCanvas').getAttribute('data-active-task'),'project');
 assert.equal(calls,2);
 assert.deepEqual(errors,[]);
 console.log('SCRIPT_ANALYSIS_FEEDBACK_PASS: progress, inline edit, approve and bulk decision, explicit error, no paid calls');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
