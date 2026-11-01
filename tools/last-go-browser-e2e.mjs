/**
 * Original Last GO show + reviewed Hero cue + genuine local WAV playback.
 * Completed speech turns are injected; this is NOT live ASR/model accuracy.
 * No external requests or microphone capture are permitted.
 */
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {createAppServer} from './dev-server.mjs';
import {openShowBuilderAssistant} from './browserTestRuntime.mjs';
import {buildEnglishVideoDemo} from './video/build-the-last-go.mjs';
import {importPortableShow} from '../src/core/showArchive.mjs';
import {planScriptAnalysis} from '../src/core/sceneAnalysis.mjs';
import {compareSpeech,normalizeSpeech} from '../src/core/voiceFollow.mjs';

const built=await buildEnglishVideoDemo();
const command='Insert a cue before cue three. Name it Decision Tension. Use the selected sound. Set the voice trigger to line twenty.';
const server=createAppServer();
await new Promise((resolve,reject)=>{
 server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
});
let browser;
const errors=[],requests=[],fixtureRequests=[];
try{
 const port=server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>void dialog.accept());
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1'||url.port!==String(port)||
     (url.pathname.startsWith('/api/')&&route.request().method()!=='GET')){
   requests.push(url.pathname);return route.abort();
  }
  return route.continue();
 });
 await page.route('**/api/meta/status',route=>route.fulfill({
  status:200,contentType:'application/json',body:JSON.stringify({
   configured:true,provider:'META_MODEL_API',model:'offline-contract-fixture',
  }),
 }));
 await page.route('**/api/meta/proposals',route=>{
  const request=route.request().postDataJSON();
  fixtureRequests.push(request);
  const plan=planScriptAnalysis(request.project.scriptText),windows=plan.windows.slice(0,1);
  const lineIds=windows.flatMap(window=>window.coreLines.map(line=>line.id));
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   provider:'META_MODEL_API',model:'offline-contract-fixture',
   proposals:built.project.cues.map(cue=>({
    label:cue.label,lineId:cue.sourceLineIds[0],
    assetId:request.project.assets.find(asset=>asset.name===
     built.project.assets.find(asset=>asset.id===cue.actions[0].assetId).name).id,
   })),
   proposalDetails:[],observations:[],duplicatesRemoved:0,
   coverage:{
    totalLines:plan.coverage.totalLines,sceneCount:plan.coverage.sceneCount,
    totalWindows:plan.windows.length,batchStartWindow:0,batchEndWindowExclusive:windows.length,
    analyzedWindowIds:windows.map(window=>window.id),analyzedLineIds:lineIds,
    analyzedLines:lineIds.length,nextWindowStart:null,complete:true,
   },
  })});
 });
 await page.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});
 const load=async(bytes,count)=>{
  await page.locator('#bundleFileInput').setInputFiles({
   name:'RUNQ_THE_LAST_GO_EN.showcompiler.zip',mimeType:'application/zip',buffer:Buffer.from(bytes),
  });
  await page.waitForFunction(expected=>document.querySelector('#cuesCount')?.textContent===String(expected),count);
 };
 const read=()=>page.evaluate(()=>{
  let state;
  document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:value=>{state=value;}}}));
  return state;
 });
 await page.locator('#scriptFileInput').setInputFiles({
  name:'THE_LAST_GO_ORIGINAL.txt',mimeType:'text/plain',buffer:Buffer.from(built.project.scriptText),
 });
 await page.waitForFunction(script=>{
  let s;document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:v=>{s=v;}}}));
  return s.scriptText===script;
 },built.project.scriptText);
 assert.equal((await read()).cueCount,0);
 await page.locator('[data-workspace-nav="audio"]').click();
 await page.locator('#audioBatchFilesInput').setInputFiles(built.audioFiles.map(wav=>({
  name:wav.name,mimeType:'audio/wav',buffer:Buffer.from(wav.bytes),
 })));
 await page.waitForFunction(()=>{
  let s;document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:v=>{s=v;}}}));
  return s.assets.length===3&&s.assets.every(asset=>asset.ready);
 });
 assert.equal((await read()).cueCount,0,'Multiple sound import modifies only the library');
 await page.locator('[data-workspace-nav="ai"]').click();
 await page.locator('.rq16-builder-stage[data-stage="cues"]').click();
 await page.locator('#rqShowBuilderAiControls > summary').click();
 await page.locator('#modelProviderSelect').selectOption('meta');
 await page.waitForFunction(()=>document.querySelector('#analyzeMetaBtn')?.disabled===false);
 await page.locator('#analyzeMetaBtn').click();
 await page.waitForFunction(()=>document.querySelector('#analyzeMetaBtn')?.getAttribute('aria-busy')==='false');
 assert.equal(await page.locator('#statusMessage').getAttribute('data-tone'),'success',
  await page.locator('#statusMessage').textContent());
 assert.equal(await page.locator('#proposalList article').count(),3);
 assert.equal(fixtureRequests.length,1,'One explicit confirmation = one offline contract fixture');
 assert.equal((await read()).cueCount,0,'Model-shaped proposals cannot create approved cues');
 assert.equal((await read()).active.length,0);
 for(let index=0;index<3;index++){
  await page.locator('#proposalList').getByRole('button',{name:'Approve',exact:true}).first().click();
 }
 await openShowBuilderAssistant(page);
 await page.locator('#rqAgentPrompt').fill('Propose voice triggers for the whole show');
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentProposal').waitFor({state:'visible'});
 await page.locator('#rqAgentApply').click();
 for(const cue of (await read()).cues){
  const spoken=built.project.cues.find(original=>original.number===cue.number).trigger;
  assert.ok(normalizeSpeech(spoken).endsWith(normalizeSpeech(cue.trigger)),
   'Reviewed trigger must be verbatim terminal words from original dialogue');
  assert.equal(compareSpeech(spoken,cue.trigger),1,'Original full spoken dialogue must match the reviewed foot');
 }
 await page.locator('[data-workspace-nav="cues"]').click();
 const initial=await read();
 assert.equal(initial.assets.every(asset=>asset.ready),true);
 await page.locator('#rqAgentToggle').click();
 await page.locator('#rqAgentPrompt').fill(command);
 await page.locator('#rqAgentSubmit').click();
 await page.waitForFunction(()=>document.querySelector('#rqAgentSubmit')?.disabled===false);
 assert.equal((await read()).cueCount,3,'Unselected sound cannot create a cue');
 assert.equal(await page.locator('#rqAgentProposal').isVisible(),false);
 await page.locator('#rqAgentMoreOptions summary').first().click();
 await page.locator('#rqAgentSelectedSound').selectOption(built.project.assets[0].id);
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentProposal').waitFor({state:'visible'});
 const preview=await page.locator('#rqAgentDiff').textContent();
 assert.ok(preview.includes('L20'));
 assert.ok(preview.includes('01_atmosphere.wav'));
 assert.ok(preview.includes('And what happens if we skip straight to the decision?'));
 assert.equal((await read()).cueCount,3,'Human preview never applies or plays');
 assert.equal((await read()).active.length,0);
 await page.locator('#rqAgentApply').click();
 assert.equal((await read()).cueCount,4);
 await page.locator('#rqAgentUndo').click();
 assert.equal((await read()).cueCount,3);
 await page.locator('#rqAgentSubmit').click();
 await page.locator('#rqAgentProposal').waitFor({state:'visible'});
 await page.locator('#rqAgentApply').click();
 const configured=(await read()).cues.find(cue=>cue.label==='Decision Tension');
 assert.equal(configured.number,3);
 assert.deepEqual(configured.sourceLineIds,['L20']);
 assert.equal((await read()).scriptText,initial.scriptText);
 await page.locator('#rqAgentClose').click();
 await page.locator('[data-workspace-nav="audio"]').click();
 await page.locator('[data-rq10-sound-tab="library"]').click();
 await page.locator('#assetList [data-sound-edit]').first().click();
 await page.locator('#rq10AssignLibraryCue').waitFor({state:'visible'});
 for(const [id,value] of [['inPoint','0.05'],['outPoint','1']]){
  await page.locator('#'+id).fill(value);await page.locator('#'+id).dispatchEvent('change');
 }
 await page.locator('#rq10TargetCue').selectOption(initial.cues[0].id);
 await page.locator('#rq10AssignLibraryCue').click();
 assert.equal((await read()).active.length,0,'Graphical library review/assignment cannot audition or GO');
 await page.locator('[data-workspace-nav="cues"]').click();
 await page.locator('[data-cue-select="'+initial.cues[0].id+'"]').click();
 assert.equal(await page.locator('#cuePlaybackForm [name="startAtMs"]').inputValue(),'50');
 await page.locator('#cuePlaybackForm .cue-wave-ms-advanced summary').click();
 await page.locator('#cuePlaybackForm [name="fadeInMs"]').fill('100');
 await page.locator('#cuePlaybackForm [name="loop"]').check();
 await page.locator('#cuePlaybackForm button[type="submit"]').click();
 await page.locator('[data-cue-select="'+initial.cues[1].id+'"]').click();
 await page.locator('#cuePlaybackForm .cue-wave-ms-advanced summary').click();
 await page.locator('#cuePlaybackForm [name="fadeOutMs"]').fill('150');
 await page.locator('#cuePlaybackForm button[type="submit"]').click();
 const downloadPromise=page.waitForEvent('download');
 await page.locator('#rq16AppMenu>summary').click();
 await page.locator('#rq16AppMenu .runq-menu>summary').first().click();
 await page.getByRole('button',{name:'Export complete show',exact:true}).click();
 const download=await downloadPromise;
 const bytes=await readFile(await download.path());
 const restored=await importPortableShow(bytes);
 assert.equal(restored.project.cues.length,4);
 assert.equal(restored.audioFiles.length,3);
 assert.equal(restored.project.scriptText,built.project.scriptText);
 assert.equal(restored.project.cues[2].trigger,configured.trigger);
 assert.deepEqual({
  start:restored.project.cues[0].playback.startAtMs,end:restored.project.cues[0].playback.endAtMs,
  fade:restored.project.cues[0].playback.fadeInMs,loop:restored.project.cues[0].playback.loop,
 },{start:50,end:1000,fade:100,loop:true});
 assert.equal(restored.project.cues[1].playback.fadeOutMs,150);
 await page.reload({waitUntil:'domcontentloaded'});
 await load(bytes,4);
 assert.equal((await read()).assets.every(asset=>asset.ready),true);
 await page.locator('[data-workspace-nav="rehearsal"]').click();
 await page.locator('#rqLiveSessionMode').selectOption('auto');
 await page.evaluate(()=>{
  document.body.dataset.runqVoiceCapture='live';
  document.dispatchEvent(new CustomEvent('runq:voice-live-ready'));
 });
 await page.locator('#rqLiveAutoStart').click();
 await page.waitForFunction(()=>document.querySelector('#rqLiveArm')?.getAttribute('aria-pressed')==='true');
 const speech=async(cue,turnId,text=cue.trigger)=>page.evaluate(({text,turnId})=>{
  document.dispatchEvent(new CustomEvent('runq:voice-live-final',{
   detail:{text,turnId,handled:false},
  }));
 },{text,turnId});
 for(const [index,turnId] of [[0,'opening'],[2,'hero-jump'],[1,'rewind']]){
  const cue=restored.project.cues[index];
  await speech(cue,turnId,index===0?built.project.cues[0].trigger:
   index===1?built.project.cues[1].trigger:cue.trigger);
  await page.waitForFunction(id=>{
   let state;
   document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:value=>{state=value;}}}));
   return state.active.some(item=>item.cueId===id)&&
    !document.querySelector('#rqLiveCue')?.textContent.includes('evaluating');
  },cue.id);
  if(index===0){
   await page.waitForTimeout(1100);
   assert.ok((await read()).active.some(item=>item.cueId===cue.id),
    'The genuine 950ms waveform region must remain running beyond its end when loop is enabled');
  }
 }
 const starts=()=>page.evaluate(()=>{
  let events;document.dispatchEvent(new CustomEvent('runq:show-event-read',{detail:{respond:v=>{events=v;}}}));
  return events.filter(event=>event.type==='CUE_STARTED').reverse().map(event=>event.cueId);
 });
 assert.deepEqual(await starts(),[initial.cues[0].id,configured.id,initial.cues[1].id]);
 await speech(restored.project.cues[1],'rewind',built.project.cues[1].trigger);
 await page.waitForTimeout(100);
 assert.equal((await starts()).length,3,'An identical completed turn cannot replay');
 await page.waitForTimeout(2600);
 await speech(restored.project.cues[1],'repeat-original',built.project.cues[1].trigger);
 await page.waitForFunction(()=>document.querySelector('#rqLiveCue')?.textContent.includes('Repeat take'));
 assert.equal((await starts()).length,4);
 const loopStop=page.locator('[data-cue-action="stop"][data-cue-id="'+initial.cues[0].id+'"]');
 await loopStop.scrollIntoViewIfNeeded();
 const loopStopHit=await loopStop.evaluate(button=>{
  const box=button.getBoundingClientRect();
  const target=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
  const rect=element=>{const value=element.getBoundingClientRect();return {x:value.x,y:value.y,width:value.width,height:value.height}};
  return {
   button:rect(button),cueList:rect(document.querySelector('#cueList')),
   sequence:rect(document.querySelector('.rq5-sequence-frame')),
   monitor:rect(document.querySelector('#rq14StageCurrent')),
   target:target?.outerHTML?.slice(0,180)??null,
   receivesPointer:Boolean(target&&button.contains(target)),
  };
 });
 assert.equal(loopStopHit.receivesPointer,true,
  `Running-cue STOP must remain physically clickable in Rehearsal: ${JSON.stringify(loopStopHit)}`);
 await loopStop.click();
 assert.equal((await read()).active.some(item=>item.cueId===initial.cues[0].id),false);
 assert.ok((await read()).active.some(item=>item.cueId===initial.cues[1].id),
  'Individual STOP of the loop must preserve the independently running repeated bell');
 assert.ok((await read()).active.length>0,'Real decoded WAV engine has running instances');
 await page.locator('#rqLivePanicBtn').click();
 assert.equal((await read()).active.length,0);
 assert.equal(await page.locator('#rqLiveArm').getAttribute('aria-pressed'),'false');
 await speech(restored.project.cues[0],'after-panic',built.project.cues[0].trigger);
 await page.waitForTimeout(100);
 assert.equal((await read()).active.length,0,'Speech after panic cannot restart the show');
 await page.locator('[data-workspace-nav="cues"]').click();
 await page.locator('#rq16AppMenu>summary').click();
 await page.locator('.runq-menu').first().locator('summary').click();
 const [jsonFile]=await Promise.all([
  page.waitForEvent('download'),
  (async()=>{
   await page.locator('.runq-menu').first().getByRole('button',{name:'Save project JSON',exact:true}).click();
   assert.equal(await page.locator('#statusMessage').getAttribute('data-tone'),'success',
    await page.locator('#statusMessage').textContent());
  })(),
 ]);
 const jsonBytes=await readFile(await jsonFile.path());
 assert.equal(JSON.parse(jsonBytes).scriptText,initial.scriptText);
 await page.reload({waitUntil:'domcontentloaded'});
 const beforeJson=(await read()).generation;
 await page.locator('#projectFileInput').setInputFiles({
  name:'last-go-metadata.json',mimeType:'application/json',buffer:jsonBytes,
 });
 await page.waitForFunction(generation=>{
  let s;document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:v=>{s=v;}}}));
  return s.generation>generation&&s.cueCount===4&&s.assets.every(asset=>!asset.ready);
 },beforeJson);
 await page.locator('[data-workspace-nav="operation"]').click();
 assert.equal(await page.locator('#operatorGoBtn').isDisabled(),true,'Metadata-only media cannot GO');
 await page.locator('[data-workspace-nav="audio"]').click();
 const dropZone=page.locator('#audioBatchDropZone');
 assert.equal(await dropZone.count(),1,'The library must expose an actual file-drop intake surface');
 assert.equal(await dropZone.isVisible(),true,'File-drop intake must be reachable without opening hidden advanced settings');
 const capture=async name=>{
  if(!process.env.RUNQ_UI_CAPTURE_DIR)return;
  await mkdir(process.env.RUNQ_UI_CAPTURE_DIR,{recursive:true});
  await page.screenshot({path:join(process.env.RUNQ_UI_CAPTURE_DIR,name)});
 };
 await capture('last-go-missing-audio.png');
 const dropped=built.audioFiles.map(wav=>({name:wav.name,base64:Buffer.from(wav.bytes).toString('base64')}));
 const drop=(files=dropped)=>dropZone.evaluate((zone,files)=>{
  const data=new DataTransfer();
  for(const file of files){
   const bytes=Uint8Array.from(atob(file.base64),char=>char.charCodeAt(0));
   data.items.add(new File([bytes],file.name,{type:'audio/wav'}));
  }
  return zone.dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));
 },files);
 assert.equal(await drop(),false,'Dropped files must be handled, not navigate the browser');
 await page.waitForFunction(()=>{
  let s;document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:v=>{s=v;}}}));
  return s.assets.length===3&&s.assets.every(asset=>asset.ready)&&
   document.querySelector('#importAudioBatchBtn')?.disabled===false;
 });
 assert.ok((await page.locator('#audioBatchStatus').textContent()).includes('3 restored'));
 assert.equal((await read()).cueCount,4,'Relocalization restores existing IDs without creating cues');
 assert.equal((await read()).scriptText,initial.scriptText);
 assert.equal((await read()).active.length,0,'Dropped sound relocalization never plays');
 assert.equal(await drop(),false);
 await page.waitForFunction(()=>document.querySelector('#audioBatchStatus')?.textContent.includes('3 skipped'));
 assert.deepEqual((await read()).assets.map(asset=>asset.id),initial.assets.map(asset=>asset.id),
  'Repeated drops cannot overwrite loaded files or duplicate references');
 const visibleListHeight=()=>page.locator('#assetList').evaluate(el=>{
  const rect=el.getBoundingClientRect();
  let top=Math.max(0,rect.top),bottom=Math.min(innerHeight,rect.bottom);
  for(let parent=el.parentElement;parent;parent=parent.parentElement){
   if(!/^(auto|scroll|hidden|clip)$/.test(getComputedStyle(parent).overflowY))continue;
   const clip=parent.getBoundingClientRect();top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom);
  }
  return Math.max(0,bottom-top);
 });
 const listHeight=await visibleListHeight();
 assert.ok(listHeight>=64,'Import feedback/drop controls must retain >=64px of unclipped file-list viewport, got '+listHeight);
 const geometry=[{width:1366,height:768,visibleListPx:listHeight}];
 for(const size of [{width:1093,height:614},{width:768,height:900}]){
  await page.setViewportSize(size);
  if(size.width>900){
   assert.equal(await page.locator('.rq5-audio-library').evaluate(el=>getComputedStyle(el).overflowY),'auto',
    'Short desktop library must allow native scrolling rather than irreversibly clipping row controls');
   await page.locator('.rq5-audio-library').hover();
   await page.mouse.wheel(0,160);
   await page.waitForTimeout(200);
  }
  const visible=await visibleListHeight();
  assert.ok(visible>=64,'Library must retain an actually reachable >=64px file viewport at '+size.width+', got '+visible);
  geometry.push({...size,visibleListPx:visible});
 }
 console.log('LAST_GO_LIBRARY_GEOMETRY',JSON.stringify(geometry));
 await page.setViewportSize({width:1366,height:768});
 await capture('last-go-relocalized.png');
 await page.locator('[data-workspace-nav="operation"]').click();
 await capture('last-go-final-live.png');
 if(await page.locator('#operatorResetBtn').isEnabled())await page.locator('#operatorResetBtn').click();
 assert.equal((await read()).preparedCueId,initial.cues[0].id);
 await page.locator('#operatorSkipBtn').click();
 await page.locator('#operatorBackBtn').click();
 assert.equal((await read()).active.length,0,'NEXT/back only prepare, never execute');
 await page.locator('#operatorGoBtn').click();
 await page.waitForFunction(()=>{
  let state;
  document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:value=>{state=value;}}}));
  return state.active.length>0;
 });
 const liveBefore=await read();
 await page.locator('[data-workspace-nav="audio"]').click();
 assert.equal(await drop([{...dropped[0],name:'blocked-while-playing.wav'}]),false);
 assert.equal(await page.locator('#audioBatchStatus').textContent(),'Stop playback and audition before importing.');
 assert.deepEqual((await read()).assets.map(asset=>asset.id),liveBefore.assets.map(asset=>asset.id));
 assert.ok((await read()).active.some(item=>item.cueId===initial.cues[0].id),
  'Rejected busy drop must leave the current sound running');
 await page.locator('#stopAllBtn').click();
 assert.equal((await read()).active.length,0);
 await page.locator('[data-workspace-nav="operation"]').click();
 if(process.env.RUNQ_CAPTURE_UI==='1'){
  await mkdir('artifacts/interface-review',{recursive:true});
  await page.screenshot({path:'artifacts/interface-review/last-go-live.png'});
 }
 assert.deepEqual(requests,[],'No external/billable requests');
 assert.deepEqual(errors,[],'No browser runtime errors');
 console.log('LAST GO E2E PASS: original TXT/WAV imports, OFFLINE model-shaped proposals and human approval, reviewed original voice feet, Hero apply/undo, waveform trim/loop/fade, ZIP and JSON reopen, visible actual drop relocalization and no overwrite, synthetic speech skip/rewind/repeat, independent STOP, STOP ALL, busy-drop protection and manual Live GO/NEXT/back. Live API/ASR/acoustic validation NOT measured.');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
