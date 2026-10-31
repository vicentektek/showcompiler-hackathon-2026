/**
 * Run only against a freshly extracted Windows package. Actual EXE/Node/HTTP/
 * browser/WAV exercise; no microphones, provider calls or acoustic claims.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {importPortableShow} from '../../src/core/showArchive.mjs';

const root=process.argv[2];
if(process.platform!=='win32'||!root)throw new Error('Specify an extracted Windows package root');
const manifest=JSON.parse(await readFile(path.join(root,'FILE_HASHES.json'),'utf8'));
for(const file of manifest.files){
 assert.ok(!/(^|\/)(?:\.env(?:\.[^/]*)?|\.git|\.runq-local|artifacts|respaldo-runq-cambios\.patch)(\/|$)/i.test(file.name));
 const bytes=await readFile(path.join(root,...file.name.split('/')));
 assert.equal(bytes.length,file.bytes);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.name);
}
const executable=path.join(root,'RUNQ.exe');
const smoke=execFileSync(executable,['--smoke-test'],{encoding:'utf8',timeout:25000});
assert.ok(smoke.includes('RUNQ_WINDOWS_SMOKE_OK'));
assert.throws(()=>process.kill(Number(/RUNQ_SERVER_PID (\d+)/.exec(smoke)[1]),0),{code:'ESRCH'});
assert.throws(()=>execFileSync(executable,['--unsupported'],{stdio:'pipe',timeout:5000}));
const app=spawn(executable,['--no-browser'],{stdio:['pipe','pipe','pipe']});
let browser,url,serverPid,output='',diagnostics='';
const exited=new Promise(resolve=>app.once('exit',(code,signal)=>resolve({code,signal})));
const ready=new Promise((resolve,reject)=>{
 const timeout=setTimeout(()=>reject(new Error('Packaged launcher readiness timed out')),20000);
 app.once('error',error=>{clearTimeout(timeout);reject(error);});
 app.stdout.on('data',chunk=>{
  output+=chunk.toString();
  url=/RUNQ_READY (http:\/\/127\.0\.0\.1:\d+)/.exec(output)?.[1];
  serverPid=Number(/RUNQ_SERVER_PID (\d+)/.exec(output)?.[1]);
  if(url&&serverPid){clearTimeout(timeout);resolve();}
 });
 app.stderr.on('data',chunk=>{diagnostics+=chunk.toString();});
});
try{
 await ready;
 const errors=[],remote=[];
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>void dialog.accept());
 await page.route('**/*',route=>{
  const request=new URL(route.request().url()),base=new URL(url);
  if(request.origin!==base.origin){remote.push(request.hostname);return route.abort();}
  if(request.pathname.startsWith('/api/'))return route.abort();
  return route.continue();
 });
 await page.goto(url,{waitUntil:'domcontentloaded'});
 const archive=await readFile(path.join(root,'demo','RUNQ_THE_LAST_GO_EN.showcompiler.zip'));
 await page.locator('#bundleFileInput').setInputFiles({name:'last-go.zip',mimeType:'application/zip',buffer:archive});
 const read=()=>page.evaluate(()=>{
  let result;
  document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:value=>{result=value;}}}));
  return result;
 });
 const waitReady=count=>page.waitForFunction(expected=>{
  let result;
  document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:value=>{result=value;}}}));
  return result?.cueCount===expected&&result.assets.length===3&&result.assets.every(asset=>asset.ready);
 },count);
 await waitReady(3);
 const original=await read();
 await page.locator('[data-workspace-nav="ai"]').click();
 assert.equal(await page.locator('#rqAgentWorkspace #rqAgentDrawer').count(),1);
 assert.ok((await page.locator('#rqAgentContextSource').textContent()).includes('L7'));
 assert.ok((await page.locator('#rqAgentContextAudio').textContent()).includes('READY'));
 await page.locator('#rqAgentSelectedSound').selectOption(original.assets[0].id);
 await page.locator('#rqAgentPrompt').fill('Insert a cue before cue three. Name it Decision Tension. Use the selected sound. Set the voice trigger to line twenty.');
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentApply').waitFor({state:'visible'});
 assert.equal((await read()).cueCount,3);assert.equal((await read()).active.length,0);
 await page.locator('#rqAgentApply').click();assert.equal((await read()).cueCount,4);
 const downloaded=page.waitForEvent('download');
 await page.locator('#saveBundleBtn').click();
 const file=await downloaded;
 const saved=await readFile(await file.path());
 const restored=await importPortableShow(saved);
 assert.equal(restored.project.cues.length,4);assert.equal(restored.audioFiles.length,3);
 assert.equal(restored.project.scriptText,original.scriptText);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#bundleFileInput').setInputFiles({name:'reviewed-last-go.zip',mimeType:'application/zip',buffer:saved});
 await waitReady(4);
 assert.equal((await read()).scriptText,original.scriptText);
 await page.locator('[data-workspace-nav="audio"]').click();
 assert.equal(await page.locator('#audioBatchDropZone').isVisible(),true,
  'The extracted package must contain the actual visible drop surface and live handler');
 const source=restored.audioFiles[0];
 assert.equal(await page.locator('#audioBatchDropZone').evaluate((el,{name,base64})=>{
  const data=new DataTransfer();
  data.items.add(new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],name,{type:'audio/wav'}));
  return el.dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));
 },{name:source.name,base64:Buffer.from(source.bytes).toString('base64')}),false);
 await page.waitForFunction(()=>document.querySelector('#audioBatchStatus')?.textContent.includes('1 skipped'));
 assert.deepEqual((await read()).assets.map(asset=>asset.id),original.assets.map(asset=>asset.id));
 assert.equal((await read()).cueCount,4);
 assert.equal((await read()).active.length,0,'Packaged duplicate drop must not execute or overwrite audio');
 await page.locator('[data-workspace-nav="operation"]').click();
 await page.locator('#operatorGoBtn').click();
 await page.waitForFunction(()=>{
  let state;
  document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:value=>{state=value;}}}));
  return state.active.length===1;
 });
 await page.locator('#operatorPanicBtn').click();
 assert.equal((await read()).active.length,0);
 await page.locator('#bundleFileInput').setInputFiles({name:'original-last-go.zip',mimeType:'application/zip',buffer:archive});
 await waitReady(3);
 const prepared=(await read()).preparedCueId;
 await page.locator('[data-workspace-nav="operation"]').click();
 await page.setViewportSize({width:768,height:900});
 await page.locator('.rq-live-script-toggle').click();
 await page.locator('.layout > .panel[data-workspaces~="script"]').evaluate(async el=>
  Promise.all(el.getAnimations().map(animation=>animation.finished)));
 await page.locator('#rq14StageCurrent').scrollIntoViewIfNeeded();
 const body=await page.locator('.cue-workspace-body').evaluate(el=>({width:el.clientWidth,content:el.scrollWidth}));
 assert.ok(body.content<=body.width+1,'Actual packaged Live inspector must not be horizontally clipped');
 console.log('WINDOWS_NARROW_LAYOUT_OK '+JSON.stringify(body));
 assert.equal((await read()).preparedCueId,prepared);assert.equal((await read()).active.length,0);
 await page.screenshot({path:path.join(path.dirname(root),'live-inspector-768.png'),animations:'disabled'});
 assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
 console.log('WINDOWS PACKAGE E2E PASS: '+manifest.files.length+' file hashes, actual EXE/runtime/HTTP, original Last GO WAVs, visible AI cue/source/readiness, reviewed Hero, complete ZIP export/reload/reopen, actual visible no-overwrite drop, real browser GO/STOP ALL. No provider or acoustic measurement.');
}finally{
 await browser?.close();
 app.stdin.end('exit\n');
 const result=await Promise.race([exited,new Promise(resolve=>setTimeout(()=>resolve(null),10000))]);
 if(!result){
  if(serverPid)process.kill(serverPid);
  app.kill();
  throw new Error('Packaged processes did not stop within 10 seconds');
 }
 assert.equal(result.code,0,'Launcher should exit cleanly: '+diagnostics);
 assert.throws(()=>process.kill(serverPid,0),{code:'ESRCH'});
 if(url){
  await assert.rejects(fetch(url),/fetch failed/,'Package server must no longer be reachable');
 }
}
