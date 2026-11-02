/**
 * Real Chrome/Web Audio history roundtrip. Default WAVs are original synthetic
 * fixtures. An opt-in LOCAL historical journal uses existing WAVs, never a
 * provider. All approvals modify an isolated copy, not the original journal.
 */
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,copyFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import {createAppServer} from './dev-server.mjs';
import {createSfxJobStore} from '../src/core/sfxJobStore.mjs';
import {inspectPcm16Wav} from '../src/core/modalSfxPilotClient.mjs';
import {importPortableShow} from '../src/core/showArchive.mjs';
import {buildEnglishVideoDemo} from './video/build-the-last-go.mjs';

const directory=await mkdtemp(path.join(tmpdir(),'runq-history-browser-'));
const historical=process.env.RUNQ_SFX_HISTORY_DIRECTORY;
const captures=process.env.RUNQ_UI_CAPTURE_DIR;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
let browser,server;
const originals=[],results=[];
let providerCalls=0;
try{
 if(captures)await mkdir(captures,{recursive:true});
 if(historical){
  for(const name of (await readdir(historical)).filter(n=>/^(job|wav)-[a-f0-9]{64}\.(json|wav)$/.test(n))){
   const source=path.join(historical,name),bytes=await readFile(source);
   originals.push({source,sha256:digest(bytes)});
   await copyFile(source,path.join(directory,name));
  }
 }else{
  const built=await buildEnglishVideoDemo();
  const seedStore=createSfxJobStore({directory,maxDailyStarts:3});
  for(let i=0;i<2;i++){
   const audio=built.audioFiles[0],metadata=inspectPcm16Wav(audio.bytes);
   const requestId='history-fixture-'+i;
   await seedStore.reserve({
    requestId,authorizationId:'history-authorization-'+i,sourceLineId:'L2',
    kind:'SFX',modelCandidate:'stabilityai/stable-audio-3-small-sfx',modelRevision:'a'.repeat(40),
    prompt:'Original synthetic history fixture '+i,durationSeconds:Math.round(metadata.durationSeconds),
    seed:42,estimatedMaxCostUsdPerRequest:0.05,dailyBudgetUsd:0.5,acknowledgedMaxCostUsd:0.05,
   },{confirm:true});
   await seedStore.update(requestId,'QUEUED',{remoteJobId:'fixture-job-'+i});
   await seedStore.storeWav(requestId,audio.bytes,metadata);
  }
 }
 const store=createSfxJobStore({directory});
 const {jobs}=await store.list();
 const takes=jobs.filter(j=>j.status==='READY_FOR_REVIEW').slice(0,2);
 assert.equal(takes.length,2,'Need two already-ready local takes; do not generate replacements');
 const unknownId='history-unknown-fixture';
 await store.reserve({
  requestId:unknownId,authorizationId:'history-unknown-authorization',sourceLineId:null,
  kind:'SFX',modelCandidate:'stabilityai/stable-audio-3-small-sfx',modelRevision:takes[0].modelRevision,
  prompt:'Original synthetic unknown-state regression fixture',durationSeconds:4,seed:42,
  estimatedMaxCostUsdPerRequest:0.05,dailyBudgetUsd:0.5,acknowledgedMaxCostUsd:0.05,
 },{confirm:true});
 const deny=async()=>{providerCalls++;throw new Error('NO_PROVIDER_REQUESTS_ALLOWED');};
 server=createAppServer({
  sfxStore:store,sfxConfig:()=>({enabled:true,estimatedMaxCostUsdPerRequest:0.05,
   dailyBudgetUsd:0.5,modelRevision:takes[0].modelRevision}),
  sfxPilotClient:{start:deny,status:deny,download:deny,cancel:deny},
  reserveCampaign:deny,
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(let i=0;i<takes.length;i++){
  const job=takes[i],locale=i===0?'en':'es';
  const viewport={width:i===0?1366:768,height:900};
  const context=await browser.newContext({acceptDownloads:true,viewport});
  const page=await context.newPage(),errors=[];
  let downloads=0,holdAudio=false,releaseAudio=null;
  const watchJob={...job,requestId:'watch-fixture',status:'RUNNING',wav:null};
  let statusChecks=0,watchFailure=true,completeAt=3;
  page.on('pageerror',()=>errors.push('PAGE_ERROR'));
  page.on('dialog',dialog=>void dialog.accept());
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==origin){providerCalls++;return route.abort();}
   if(i===0&&url.pathname==='/api/sfx/jobs'&&request.method()==='GET'){
    const response=await route.fetch(),data=await response.json();
    return route.fulfill({json:{...data,jobs:[...data.jobs,watchJob]}});
   }
   if(url.pathname==='/api/sfx/jobs/watch-fixture'){
    return route.fulfill({json:watchJob});
   }
   if(url.pathname==='/api/sfx/jobs/watch-fixture/refresh'){
    statusChecks++;
    if(watchFailure)return route.fulfill({status:503,json:{code:'SFX_SERVICE'}});
    return route.fulfill({json:statusChecks>=completeAt?
      {...watchJob,status:'READY_FOR_REVIEW',wav:job.wav}:watchJob});
   }
   if(url.pathname.endsWith('/audio')){
    downloads++;
    if(holdAudio)await new Promise(resolve=>{releaseAudio=resolve;});
   }
   if(url.pathname.startsWith('/api/')&&request.method()!=='GET'&&
     !/^\/api\/sfx\/jobs\/[^/]+\/review$/.test(url.pathname)){
    providerCalls++;return route.abort();
   }
   return route.continue();
  });
  const read=()=>page.evaluate(()=>{
   let state;document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:v=>{state=v;}}}));return state;
  });
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.locator('#uiLocaleSelect').selectOption(locale);
  const maxLine=Math.max(2,...takes.map(j=>Number(j.sourceLineId?.slice(1))||0));
  const script=Array.from({length:maxLine+1},(_,n)=>'Original integration fixture line '+(n+1)).join('\n');
  await page.locator('#scriptFileInput').setInputFiles({
   name:'independent-original-script.txt',mimeType:'text/plain',buffer:Buffer.from(script),
  });
  await page.locator('[data-workspace-nav="audio"]').click();
  await page.locator('[data-rq10-sound-tab="generate"]').click();
  await page.locator('#soundPrompt').fill('Original short sound fixture');
  await page.waitForFunction(()=>!document.querySelector('#generateBtn')?.disabled);
  await page.locator('#sfxShortTakeBtn').click();
  assert.equal(await page.locator('#duration').inputValue(),'3');
  assert.equal(await page.locator('#confirmRequest').count(),0);
  assert.equal(providerCalls,0,'Short duration shortcut never submits a generation');
  if(captures&&i===0){
   const before=path.join(captures,'sfx-history-before.png');
   try{await readFile(before);}catch(error){
    if(error.code!=='ENOENT')throw error;
    await page.screenshot({path:before,animations:'disabled'});
   }
  }
  assert.equal(await page.locator('#sfxHistoryRefreshBtn').isVisible(),true,
   'Saved takes need a visible history action, not a hidden opaque request ID');
  const baseline=await read();
  await page.locator('#sfxHistoryRefreshBtn').click();
  await page.waitForFunction(()=>document.querySelector('#sfxHistorySelect')?.options.length>=3);
  const historyBounds=await page.locator('#sfxHistorySelect').boundingBox();
  assert.ok(historyBounds.width>=100&&historyBounds.x>=0&&
    historyBounds.x+historyBounds.width<=viewport.width+1,'Saved history must fit actual viewport');
  if(i===0){
   await page.locator('#sfxHistorySelect').selectOption(watchJob.requestId);
   await page.waitForFunction(()=>!document.querySelector('#sfxWatchBtn')?.disabled);
   assert.equal(statusChecks,0,'Opening active history never starts status tracking');
   await page.locator('#sfxWatchBtn').click();
   await page.waitForFunction(()=>document.querySelector('#sfxStopWatchBtn')?.disabled);
   assert.equal(statusChecks,1,'Tracking error stops without retry');
   watchFailure=false;
   await page.locator('#sfxWatchBtn').click();
   await page.waitForFunction(()=>document.querySelector('#jobState')?.textContent==='Ready to listen');
   assert.equal(statusChecks,3,'Explicit tracking discovers completion on its next 5-second check');
   assert.equal(await page.locator('#sfxStopWatchBtn').isDisabled(),true);
   assert.equal(downloads,0,'Status completion never downloads or plays audio automatically');
   assert.equal(await page.locator('#acceptBtn').isEnabled(),true,'Ready takes can be accepted without audition');
   assert.equal((await read()).cueCount,baseline.cueCount);
   assert.equal((await read()).active.length,0);
   completeAt=Infinity;
   await page.locator('#sfxHistorySelect').selectOption(job.requestId);
   await page.locator('#sfxHistorySelect').selectOption(watchJob.requestId);
   await page.waitForFunction(()=>!document.querySelector('#sfxWatchBtn')?.disabled);
   const checked=page.waitForResponse('**/watch-fixture/refresh');
   await page.locator('#sfxWatchBtn').click();
   await checked;
   await page.locator('#stopAllBtn').evaluate(button=>button.click());
   assert.equal(await page.locator('#sfxStopWatchBtn').isDisabled(),true);
   const stoppedChecks=statusChecks;
   await page.waitForTimeout(5500);
   assert.equal(statusChecks,stoppedChecks,'STOP ALL invalidates scheduled status checks');
  }
  await page.locator('#sfxHistorySelect').selectOption(unknownId);
  await page.waitForFunction(id=>document.querySelector('#requestId')?.value===id,unknownId);
  assert.equal(await page.locator('#sfxCheckResultBtn').isDisabled(),true);
  assert.equal(await page.locator('#refreshBtn').isDisabled(),true);
  assert.equal(await page.locator('#acceptBtn').isDisabled(),true);
  assert.equal((await read()).active.length,0,'Unknown-state history cannot replay or retry');
  await page.locator('#sfxHistorySelect').selectOption(job.requestId);
  await page.waitForFunction(id=>document.querySelector('#requestId')?.value===id,job.requestId);
  assert.equal((await read()).preparedCueId,baseline.preparedCueId);
  assert.equal((await read()).cueCount,baseline.cueCount);
  assert.equal((await read()).active.length,0,'History cannot play or create cues');
  const listen=page.locator('#sfxListenBtn');
  assert.equal(await listen.isEnabled(),true,'Ready take must be directly listenable');
  holdAudio=true;
  const pendingAudio=page.waitForRequest('**/audio');
  await listen.click();await pendingAudio;
  await page.locator('#sfxStopPreviewBtn').click();
  holdAudio=false;releaseAudio();
  await page.waitForFunction(()=>!document.querySelector('#sfxListenBtn')?.disabled);
  assert.equal(await page.locator('#acceptBtn').isEnabled(),true,
   'Stopping a pending preview does not require listening before explicit acceptance');
  assert.equal(await page.locator('#stopBtn').isDisabled(),true);
  assert.equal(await page.locator('#playBtn').isDisabled(),true);
  await listen.click();
  await page.waitForFunction(()=>!document.querySelector('#acceptBtn')?.disabled);
  assert.equal(downloads,2,'Direct preview downloads only the cancelled attempt and the chosen take');
  await page.locator('#sfxPreviewLevel').press('ArrowRight');
  assert.equal(await page.locator('#monitorLevel').inputValue(),'16');
  assert.equal(await page.locator('#sfxStopPreviewBtn').isEnabled(),true,
   'Volume adjustment must not interrupt audition');
  await page.locator('#sfxStopPreviewBtn').click();
  await listen.click();
  await page.locator('#stopAllBtn').click();
  assert.equal(await page.locator('#sfxStopPreviewBtn').isDisabled(),true);
  assert.equal(downloads,2,'Repeated preview reuses decoded audio');
  assert.equal((await read()).cueCount,baseline.cueCount);
  assert.equal((await read()).active.length,0);
  // Loading a take enables explicit acceptance without starting playback.
  await page.locator('.sfx-technical-jobs').evaluate(el=>{el.open=true;});
  await page.locator('#loadGeneratedBtn').click();
  await page.waitForFunction(()=>!document.querySelector('#playBtn')?.disabled);
  assert.equal(await page.locator('#acceptBtn').isEnabled(),true,'Decode permits acceptance without audition');
  await page.locator('#inPoint').fill('0.05');await page.locator('#inPoint').dispatchEvent('change');
  const end=Math.min(0.8,job.wav.durationSeconds*0.8);
  await page.locator('#outPoint').fill(String(end));await page.locator('#outPoint').dispatchEvent('change');
  await page.locator('#sfxFadeIn').press('ArrowRight');
  await page.locator('#sfxFadeOut').press('ArrowRight');
  await page.locator('#playBtn').click();
  await page.waitForFunction(()=>!document.querySelector('#acceptBtn')?.disabled);
  await page.locator('#stopBtn').click();
  await page.locator('#acceptBtn').click();
  await page.waitForFunction(()=>!document.querySelector('#importCueBtn')?.disabled);
  await listen.click();
  await page.locator('#importLibraryBtn').click();
  await page.waitForFunction(()=>{
   let s;document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:v=>{s=v;}}}));
   return s.assets.length===1&&s.assets[0].ready;
  });
  assert.equal((await read()).cueCount,0,'Saving a previewing take to the library must not create a cue');
  await page.locator('[data-rq10-sound-tab="generate"]').click();
  if(captures)await page.screenshot({path:path.join(captures,'sfx-history-'+locale+'-after.png'),animations:'disabled'});
  await page.locator('#importCueBtn').click();
  await page.waitForFunction(()=>{
   let s;document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:v=>{s=v;}}}));
   return s.cueCount===1&&s.assets.length===1&&s.assets[0].ready;
  });
  const imported=await read();
  assert.equal(imported.assets.length,1,'Creating a cue from a saved generated take reuses the verified asset');
  assert.deepEqual(imported.cues[0].sourceLineIds,[],
   'A past take cannot claim a matching L# in an unrelated script');
  assert.equal(imported.active.length,0,'Manual import/create still cannot GO');
  assert.equal(imported.preparedCueId,baseline.preparedCueId,'Cue creation must not advance prepared GO');
  await page.locator('[data-workspace-nav="audio"]').click();
  await page.locator('[data-rq10-sound-tab="generate"]').click();
  await page.locator('#rq10TargetCue').selectOption(imported.cues[0].id);
  await listen.click();
  await page.locator('#importAssignCueBtn').click();
  await page.waitForFunction(()=>{
   let s;document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:v=>{s=v;}}}));
   return s.workspace==='cues';
  });
  const reassigned=await read();
  assert.equal(reassigned.assets.length,1,'Assigning a saved take reuses the verified library asset');
  assert.equal(reassigned.cueCount,1,'Assignment cannot create another cue');
  assert.equal(reassigned.preparedCueId,baseline.preparedCueId,'Assignment during preview cannot prepare GO');
  assert.equal(reassigned.active.length,0);
  await page.locator('[data-cue-quick-next="'+imported.cues[0].id+'"]').click();
  assert.equal((await read()).active.length,0,'Explicit NEXT preparation is silent');
  await page.locator('#operatorGoBtn').click();
  await page.waitForFunction(()=>{
   let s;document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:v=>{s=v;}}}));
   return s.active.length===1;
  });
  await page.locator('#stopAllBtn').click();
  assert.equal((await read()).active.length,0);
  const fileMenu=page.locator('.runq-menu').first();
  await page.locator('#rq16AppMenu>summary').click();
  await fileMenu.locator('summary').click();
  const [download]=await Promise.all([
   page.waitForEvent('download'),
   fileMenu.getByRole('button',{name:locale==='es'?'Exportar espectáculo completo':'Export complete show',exact:true}).click(),
  ]);
  const bytes=await readFile(await download.path());
  const archive=await importPortableShow(bytes);
  assert.equal(archive.project.scriptText,script);
  assert.equal(archive.project.cues.length,1);
  assert.deepEqual(archive.project.cues[0].sourceLineIds,[]);
  assert.equal(archive.project.cues[0].playback.startAtMs,50);
  assert.equal(archive.project.cues[0].playback.endAtMs,Math.round(end*1000));
  assert.equal(archive.project.cues[0].playback.fadeInMs,50);
  assert.equal(archive.project.cues[0].playback.fadeOutMs,50);
  assert.equal(archive.project.assets[0].provenance.sha256,job.wav.sha256);
  assert.equal(digest(archive.audioFiles[0].bytes),job.wav.sha256);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#bundleFileInput').setInputFiles({
   name:'historical-audio-roundtrip.zip',mimeType:'application/zip',buffer:bytes,
  });
  await page.waitForFunction(()=>{
   let s;document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:v=>{s=v;}}}));
   return s.cueCount===1&&s.assets[0]?.ready;
  });
  assert.equal((await read()).scriptText,script);
  assert.equal((await read()).active.length,0);
  assert.deepEqual(errors,[]);
  if(captures)await writeFile(path.join(captures,'historical-audio-'+locale+'.showcompiler.zip'),bytes);
  results.push({locale,wavSha256:job.wav.sha256,bytes:job.wav.byteLength,
   durationSeconds:job.wav.durationSeconds,channels:job.wav.channels,sampleRateHz:job.wav.sampleRateHz,
   browserDecode:true,manualGoState:true,portableRoundtrip:true,sourceReferencesNotInvented:true});
  await context.close();
 }
 for(const original of originals)assert.equal(digest(await readFile(original.source)),original.sha256);
 assert.equal(providerCalls,0);
 const evidence={source:historical?'EXISTING_HISTORICAL_MODAL_WAVS':'ORIGINAL_SYNTHETIC_FIXTURES',
  distinctWavHashes:new Set(results.map(r=>r.wavSha256)).size,
  unknownStateRegression:'SYNTHETIC_LOCAL_JOURNAL_ONLY_NO_SUBMISSION',
  providerCalls:0,realWebAudio:true,approval:'AUTOMATED_ISOLATED_COPY_ONLY',
  physicalAcousticReview:false,originalJournalUnchanged:true,results};
 if(captures)await writeFile(path.join(captures,'history-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log('SFX HISTORY E2E PASS '+JSON.stringify(evidence));
}finally{
 if(browser)await browser.close();
 if(server?.listening)await new Promise(resolve=>server.close(resolve));
 await rm(directory,{recursive:true,force:true});
}
