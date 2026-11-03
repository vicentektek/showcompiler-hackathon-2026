/** Offline browser acceptance for the interface rework. No provider or microphone. */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createAppServer } from './dev-server.mjs';
import { launchTestBrowser } from './browserTestRuntime.mjs';

const server=createAppServer();
const errors=[];
const consoleErrors=[];
const failedRequests=[];
const httpErrors=[];
const expectedAborts=new Set();
const providerPosts=[];
const localStatusChecks=[];
let localStatusFault=null;
let expectedStatusAbortCount=0;
let browser=null;
let page=null;
let evidenceDirectory='';
try {
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const origin=`http://127.0.0.1:${server.address().port}`;
  const launched=await launchTestBrowser();
  browser=launched.browser;
  console.log(`Browser: ${launched.label} (${await browser.version()})`);
  page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  evidenceDirectory=join('artifacts','interface-review',`run-${Date.now()}`);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{
    if(message.type()==='error')consoleErrors.push({
      text:message.text(),
      location:message.location(),
    });
  });
  page.on('response',response=>{
    if(response.status()>=400)httpErrors.push({
      status:response.status(),
      url:response.url(),
      method:response.request().method(),
    });
  });
  page.on('requestfailed',request=>{
    if(!expectedAborts.delete(request.url()))
      failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText??'failed'}`);
  });
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/api/')&&route.request().method()==='POST')providerPosts.push(url.pathname);
    if(url.pathname.endsWith('/status')&&route.request().method()==='GET'){
      localStatusChecks.push(url.pathname);
      if(localStatusFault==='not-found')return route.fulfill({status:404,contentType:'text/plain',body:'Not Found'});
      if(localStatusFault==='offline'){
        expectedAborts.add(route.request().url());
        expectedStatusAbortCount++;
        return route.abort();
      }
    }
    if(url.origin===origin&&url.pathname.endsWith('/status')&&route.request().method()==='GET')return route.continue();
    return url.origin===origin&&!url.pathname.startsWith('/api/')?route.continue():route.abort();
  });
  await page.addInitScript(()=>{
  window.audioStarts=0;window.audioStops=0;
  window.microphoneRequests=0;window.microphoneStops=0;window.microphoneConstraints=[];
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
    enumerateDevices:async()=>[{kind:'audioinput',label:'Mock microphone',deviceId:'mic-1'}],
    getUserMedia:async constraints=>{
      window.microphoneRequests++;window.microphoneConstraints.push(constraints);
      return {getTracks:()=>[{stop(){window.microphoneStops++;}}]};
    },
  }});
  class MockAudioContext {
    constructor(){this.state='running';this.currentTime=1;this.destination={};}
    async resume(){
      if(window.holdAudioResume)await new Promise(resolve=>{window.releaseAudioResume=resolve;});
    }
    async close(){this.state='closed';}
    async decodeAudioData(){const samples=Float32Array.from({length:1200},(_,i)=>Math.sin(i/15)*.4);return {duration:3,numberOfChannels:1,length:1200,sampleRate:400,getChannelData:()=>samples};}
    createGain(){return {gain:{value:1,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}},connect(){},disconnect(){}};}
    createStereoPanner(){return {pan:{value:0},connect(){},disconnect(){}};}
    createBufferSource(){return {buffer:null,onended:null,playbackRate:{value:1},connect(){},disconnect(){},start(){window.audioStarts++;},stop(){window.audioStops++;}};}
    createOscillator(){return {frequency:{value:0},onended:null,connect(){},disconnect(){},start(){},stop(){this.onended?.();}};}
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
    createAnalyser(){return {fftSize:0,getByteTimeDomainData(samples){samples.fill(128);}};}
  }
  window.AudioContext=MockAudioContext;
  });
  const prepared=()=>page.locator('.cue-prepared [data-cue-select]').getAttribute('data-cue-select');
  const assertAccessibleControls=async workspace=>{
    const unnamed=await page.locator(
      'button:visible,a[href]:visible,input:not([type="hidden"]):visible,select:visible,textarea:visible,[role="button"]:visible'
    ).evaluateAll(elements=>elements.flatMap(element=>{
      const labelledBy=(element.getAttribute('aria-labelledby')??'').split(/\s+/)
        .map(id=>document.getElementById(id)?.textContent?.trim()??'').join(' ').trim();
      const name=element.getAttribute('aria-label')?.trim()||
        labelledBy||
        [...(element.labels??[])].map(label=>label.textContent.trim()).join(' ').trim()||
        element.getAttribute('title')?.trim()||
        element.innerText?.trim()||
        element.getAttribute('alt')?.trim()||
        (element instanceof HTMLInputElement?element.value.trim():'');
      return name?[]:[{
        tag:element.tagName,
        type:element.getAttribute('type'),
        html:element.outerHTML.slice(0,240),
      }];
    }));
    assert.deepEqual(unnamed,[],`${workspace}: visible controls have accessible names`);
  };
  const route=async name=>{
    const button=page.locator(`[data-workspace-nav="${name}"]`);
    await button.click();
    await page.waitForFunction(name=>document.querySelector('.shell').dataset.activeWorkspace===name,name);
    const hit=await button.evaluate(el=>{
      const rect=el.getBoundingClientRect();
      const x=rect.left+rect.width/2;
      const y=rect.top+rect.height/2;
      const inViewport=x>=0&&x<innerWidth&&y>=0&&y<innerHeight;
      const target=inViewport?document.elementFromPoint(x,y):null;
      return {
        inViewport,
        receivesPointer:Boolean(target&&el.contains(target)),
        target:target?.outerHTML?.slice(0,240)??null,
        pointerEvents:getComputedStyle(el).pointerEvents,
        rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
        animations:el.getAnimations().map(animation=>animation.playState),
      };
    });
    assert.ok(hit.inViewport&&hit.receivesPointer&&hit.pointerEvents!=='none',
      `${name}: real pointer target is obstructed: ${JSON.stringify(hit)}`);
    assert.equal(await page.locator('#workspaceNav [aria-selected="true"]').count(),name==='setup'?0:1);
    assert.equal(await page.locator('[data-workspace-nav="setup"]').getAttribute('aria-pressed'),String(name==='setup'));
    await assertAccessibleControls(name);
  };
  await mkdir(evidenceDirectory,{recursive:true});
  await page.goto(origin);
  await assertAccessibleControls('home');
  const settings=page.locator('.top-actions [data-workspace-nav="setup"]');
  assert.equal(await settings.count(),1,'Settings belongs next to the language selector');
  assert.equal(await settings.textContent(),'Settings');
  assert.equal(await settings.locator('svg').count(),1);
  assert.equal(await settings.evaluate(el=>el.nextElementSibling.id==='uiLocaleSelect'),true);
  assert.equal(await page.locator('#workspaceNav [data-workspace-nav="setup"]').count(),0);
  assert.equal(await page.locator('.rq16-home-backdrop').count(),1,'Home uses the supplied stage backdrop');
  await page.waitForFunction(()=>[...document.querySelectorAll('.home-panel img,.rq16-brand-mark')]
    .every(image=>image.complete&&image.naturalWidth>0));
  assert.equal(await page.locator('#workspaceNav').evaluate(el=>el.closest('.topbar')!==null),true);
  assert.equal(await page.locator('#rq16StartAI').isVisible(),true,'AI has a primary entry on the home screen');
  assert.equal(await page.locator('#rq16StartAI').textContent(),'Prepare my show →',
    'the primary action opens the integrated show builder');
  assert.equal(await page.locator('#rq16GuidedDemo').count(),0,
    'the home screen does not promote a separate concept as another product');
  assert.equal(await page.locator('#stopAllBtn').isVisible(),false,'Empty home does not show redundant transport');
  assert.equal(await page.locator('.topbar #saveBundleBtn').count(),0,'Export belongs to project actions, not global chrome');
  assert.equal(await page.locator('.home-tiles .home-tile').count(),4);
  await page.locator('#rq16StartAI').click();
  await page.waitForFunction(()=>document.querySelector('.shell').dataset.activeWorkspace==='ai');
  assert.equal(await page.locator('#rqShowBuilderAutomationSlot').count(),1,
    'Advanced batch preparation belongs inside the unified Show Builder');
  assert.equal(await page.locator('.rq-preparation[data-integrated=true]').count(),0,
    'The obsolete duplicate preparation wizard is no longer a second header');
  assert.equal(await page.locator('#rq16AIWelcome').isVisible(),false,
    'Duplicate marketing copy does not push the preparation and assistant actions down');
  assert.equal(await page.locator('#rqAgentPrompt').isVisible(),false,
    'The optional contextual assistant stays collapsed until requested');
  assert.equal(await page.locator('#rqShowBuilder').isVisible(),true,'RUNQ AI contains the guided Show Builder');
  assert.equal(await page.locator('#rqShowBuilderCanvas').isVisible(),true,'Show Builder provides a task canvas inside the current show workspace');
  for(const stage of ['project','cues','audio','configuration','verification']){
    assert.equal(await page.locator(`#rqShowBuilder .rq16-builder-stage[data-stage="${stage}"]`).isVisible(),true,
      `${stage} remains directly accessible in the progress bar`);
  }
  assert.equal(await page.locator('#rqShowBuilder [data-builder-stage]:visible').count(),1,
    'Only the current task is shown in the focused workspace');
  assert.equal(await page.locator('#rqShowBuilderSourceTask').isVisible(),true,'Script import and source review are part of the Builder canvas');
  assert.equal(await page.locator('#rqShowBuilder [data-builder-route]').count(),4,
    'The same show can be entered from script, cue, audio or the assistant');
  await page.locator('#rqShowBuilder [data-builder-route="cue"]').click();
  assert.equal(await page.locator('#rqShowBuilderCueTask').isVisible(),true,
    'The cue route opens the existing proposal and cue tools in place');
  assert.equal(await page.locator('#rqShowBuilderSourceTask').isVisible(),false,
    'Switching tasks keeps unrelated forms out of the active workspace');
  await page.locator('#rqShowBuilder [data-builder-route="audio"]').click();
  assert.equal(await page.locator('#rqShowBuilderAudioTask').isVisible(),true,
    'The audio route opens the existing sound task without requiring a script or cue');
  await page.locator('#rqShowBuilder [data-builder-route="script"]').click();
  assert.equal(await page.locator('#rqShowBuilderSourceTask').isVisible(),true,
    'The script route returns to source work without changing show context');
  assert.match(await page.locator('#rqShowBuilderSourceLines').textContent(),/No script yet/);
  assert.equal(await page.locator('.rq5-ai-workspace > .help').isVisible(),false,
    'Old AI instructions do not compete with the guided wizard');
  assert.equal(await page.locator('.rq5-ai-workspace > .rq5-ai-grid').isVisible(),false,
    'Legacy empty AI panels do not appear below the integrated Builder');
  assert.equal(await page.locator('#metaStatus').isVisible(),false,
    'Provider diagnostics stay out of the way until the cues step');
  await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="cues"]').click();
  assert.equal(await page.locator('#metaStatus').isVisible(),true,
    'Local AI configuration status is available on the cues step');
  const localCheck=page.locator('#checkMetaStatusBtn');
  await localCheck.waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('#checkMetaStatusBtn').disabled);
  const checksBefore=localStatusChecks.length;
  const providerPostsBefore=providerPosts.length;
  await localCheck.click();
  await page.waitForFunction(()=>!document.querySelector('#checkMetaStatusBtn').disabled);
  assert.equal(localStatusChecks.length,checksBefore+1,'The local check performs exactly one GET status request');
  assert.equal(providerPosts.length,providerPostsBefore,'The local check never submits a provider request');
  localStatusFault='not-found';
  await localCheck.click();
  await page.waitForFunction(()=>!document.querySelector('#checkMetaStatusBtn').disabled);
  assert.match(await page.locator('#metaStatus').textContent(),/address|dirección|port|puerto|version|versión/i,
    'An unknown local status route is diagnosed as an endpoint/address mismatch');
  localStatusFault='offline';
  await localCheck.click();
  await page.waitForFunction(()=>!document.querySelector('#checkMetaStatusBtn').disabled);
  assert.match(await page.locator('#metaStatus').textContent(),/address|dirección|port|puerto/i,
    'An unreachable local status endpoint advises checking its address/port');
  localStatusFault=null;
  assert.equal(providerPosts.length,providerPostsBefore,'Diagnostic failures never submit provider requests');
  await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="project"]').click();
  assert.equal(await page.locator('#rqShowBuilder .rq16-builder-stage').count(),5);
  assert.equal(await page.locator('#rqShowBuilder .rq16-ai-steps > li').count(),5,
    'Wizard contains only the five actionable, labeled steps');
  assert.equal(await page.locator('#rqShowBuilder .rq16-builder-stage-label').count(),5);
  assert.equal(await page.locator('#rqShowBuilderProgress').textContent(),'0 of 5 steps ready');
  assert.equal(await page.locator('#rqShowBuilderAiHelp').getAttribute('open'),null,
    'Contextual AI help is available without overwhelming the initial wizard step');
  await page.locator('#rqShowBuilderSkip').click();
  assert.match(await page.locator('#rqShowBuilderStatus').textContent(),/Not required without a script/);
  assert.equal(await page.locator('#rqShowBuilderProgress').textContent(),'0 of 5 steps ready',
    'Skipping a step never marks it complete');
  await page.locator('#rqShowBuilderNext').click();
  assert.equal(await page.locator('#rqShowBuilderStep').textContent(),'Step 3 of 5');
  assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'ai',
    'Continuing through the Builder never switches workspaces');
  assert.equal(await page.locator('#rqShowBuilder [data-builder-stage]:visible').count(),1,
    'Changing steps shows only the selected task');
  assert.equal(await page.locator('#rqShowBuilder [data-builder-stage]:visible').getAttribute('data-builder-stage'),'audio');
  await page.locator('#rqShowBuilderBack').click();
  assert.equal(await page.locator('#rqShowBuilderStep').textContent(),'Step 2 of 5');
  await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="project"]').click();
  assert.match(await page.locator('#rqShowBuilderStatus').textContent(),/Skipped for now · still incomplete/);
  await page.reload();
  await page.locator('#rq16StartAI').click();
  await page.waitForFunction(()=>document.querySelector('.shell').dataset.activeWorkspace==='ai');
  await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="project"]').click();
  assert.match(await page.locator('#rqShowBuilderStatus').textContent(),/Skipped for now · still incomplete/,
    'Assistant step and omission state resume after reload without modifying show data');
  await page.locator('#rqShowBuilderAiHelp > summary').click();
  assert.equal(await page.locator('#rqShowBuilderAiHelp').getAttribute('open'),'',
    'Ask RUNQ AI opens the contextual assistant disclosure');
  await page.waitForFunction(()=>document.activeElement?.id==='rqAgentPrompt');
  assert.equal(await page.locator('#rqAgentPrompt').evaluate(el=>document.activeElement===el),true,
    'Ask RUNQ AI focuses the existing assistant without submitting a provider request');
  assert.equal(await page.evaluate(()=>window.audioStarts),0);
  assert.deepEqual(providerPosts,[],'AI navigation never submits a model request');
  await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="audio"]').click();
  await page.locator('#rqShowBuilderAddSounds').click();
  assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'ai',
    'Choosing to add sound does not navigate away before the operator opens the sound desk');
  await page.locator('#rqShowBuilderOpenSoundWorkspace').click();
  await page.waitForFunction(()=>document.querySelector('.shell').dataset.activeWorkspace==='audio');
  assert.equal(await page.locator('[data-rq10-sound-tab="generate"]').getAttribute('aria-selected'),'true',
    'The explicit sound action opens the existing creation workflow');
  await route('ai');
  await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="audio"]').click();
  await page.locator('#rqShowBuilderSkipSounds').click();
  assert.match(await page.locator('#rqShowBuilderSoundPlanStatus').textContent(),/deferred|aplazado/i);
  assert.equal(await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="audio"]').getAttribute('data-complete'),'true');
  assert.equal(await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="verification"]').getAttribute('data-complete'),'false',
    'Deferring sound never makes an empty show appear verified or playable');
  assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'ai');
  assert.deepEqual(providerPosts,[],'Sound-plan choices and navigation never submit provider requests');
  await route('home');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  const settingsBox=await settings.boundingBox();
  const languageBox=await page.locator('#uiLocaleSelect').boundingBox();
  assert.ok(settingsBox.x+settingsBox.width<=languageBox.x&&Math.abs(settingsBox.y-languageBox.y)<=2,
    'Settings stays beside language on mobile');
  await settings.focus();
  await page.keyboard.press('Enter');
  assert.equal(await settings.getAttribute('aria-pressed'),'true','Settings opens with the keyboard');
  assert.equal(await page.locator('#setupHeading').textContent(),'Settings');
  await route('home');
  assert.ok((await page.locator('#rq16StartAI').boundingBox()).width>=200,'Mobile AI action remains prominent');
  await page.setViewportSize({width:1440,height:900});
  console.log('PASS: stage home, primary AI entry and contextual project actions');
  await page.locator('#homeDemoBtn').click();
  await page.waitForFunction(()=>document.querySelector('#cueList')?.children.length===3);
  const providerPostsBeforeBuilderSound=providerPosts.length;
  const audioStartsBeforeBuilderSound=await page.evaluate(()=>window.audioStarts);
  await route('ai');
  await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="audio"]').click();
  assert.equal(await page.locator('#rqShowBuilderCueSoundList [data-builder-sound-cue]').count(),3,
    'Audio planning lists the current show cues, not fixture or mock data');
  const builderTargetId=await page.locator('#rqShowBuilderCueSoundList [data-builder-open-cue-sound]').first()
    .getAttribute('data-builder-open-cue-sound');
  const soundTargetCue=page.locator(`[data-cue-select="${builderTargetId}"]`);
  const builderLine=await soundTargetCue.locator('.cue-row-meta').textContent();
  await page.locator(`[data-builder-open-cue-sound="${builderTargetId}"]`).click();
  await page.waitForFunction(()=>document.querySelector('.shell').dataset.activeWorkspace==='audio'&&
    document.querySelector('#rq10TargetCue')?.value);
  assert.equal(await page.locator('#rq10TargetCue').inputValue(),builderTargetId,
    'Opening sound from a Builder cue pins the exact destination');
  const sourceLineId=builderLine.match(/L\d+/)?.[0];
  assert.ok(sourceLineId,'The selected Builder cue has an original script reference');
  const soundPrompt=await page.locator('#soundPrompt').inputValue();
  assert.ok(soundPrompt.includes((await soundTargetCue.locator('.cue-row-title').textContent()).trim()),
    'The English sound brief retains the selected cue idea');
  assert.ok(soundPrompt.includes(`script reference ${sourceLineId}`),
    'The English sound brief carries the original source-line reference');
  assert.match(soundPrompt,/approximately \d+ seconds/,
    'The sound brief includes its interpreted duration');
  assert.equal(await page.locator('#sourceLine').inputValue(),sourceLineId,
    'Sound context retains the cue original source-line reference');
  assert.equal(providerPosts.length,providerPostsBeforeBuilderSound,
    'Opening contextual sound does not submit a provider request');
  assert.equal(await page.evaluate(()=>window.audioStarts),audioStartsBeforeBuilderSound,
    'Opening contextual sound never starts playback');
  await route('cues');
  console.log('PASS: Builder sound task pins a real cue and its source without generation or playback');
  await page.locator('[data-cue-select]').first().click();
  const sequence=page.locator('.rq5-sequence-frame');
  const handle=page.locator('.rq7-split-handle');
  const before=await sequence.boundingBox();
  const box=await handle.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+80);
  await page.mouse.down();
  await page.mouse.move(box.x-110,box.y+80,{steps:8});
  await page.mouse.up();
  const after=await sequence.boundingBox();
  assert.ok(before.width-after.width>70,'Dragging the divider must resize the panels, not just move a line');
  console.log('PASS: divider resizes the actual cue panels');
  await handle.focus();await page.keyboard.press('ArrowRight');
  assert.ok((await sequence.boundingBox()).width>after.width+10,'Keyboard resizing changes the panels');
  await page.locator('#rq16ResetLayout').click();
  assert.equal(await handle.getAttribute('aria-valuenow'),'55');
  const initialPrepared=await prepared();
  const sourceText=await page.locator('#scriptPreview').textContent();
  await route('home');
  assert.match(await page.locator('#rq16ProjectSummary').textContent(),/3 cues/);
  await page.locator('#rq16AppMenu>summary').click();
  await page.locator('#rq16AppMenu .runq-menu>summary').first().click();
  const exported=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export complete show',exact:true}).click();
  const archive=await exported;
  assert.match(archive.suggestedFilename(),/\.zip$/);
  assert.equal(await archive.failure(),null,'Secondary File menu exports a real complete ZIP');
  assert.equal(await page.locator('#rq16AppMenu').getAttribute('open'),null);
  assert.equal(await prepared(),initialPrepared,'Export does not change NEXT');
  await page.locator('#rq16StartAI').click();
  assert.equal(await prepared(),initialPrepared,'Primary AI navigation preserves NEXT');
  assert.equal(await page.locator('#scriptPreview').textContent(),sourceText);
  await route('cues');
  await page.locator('button[data-editor-view="inspector"]').click();
  assert.equal(await sequence.isVisible(),false);
  assert.ok((await page.locator('#cueInspector').boundingBox()).width>900);
  await page.locator('button[data-editor-view="sequence"]').click();
  assert.equal(await page.locator('#cueInspector').isVisible(),false);
  await page.locator('#rq16ResetLayout').click();
  assert.equal(await prepared(),initialPrepared);
  assert.equal(await page.evaluate(()=>window.audioStarts),0);
  // Text edits remain staged when changing only the pane layout.
  const gain=page.locator('#cuePlaybackForm input[name="gainDb"]');
  await gain.fill('-6');
  await page.locator('button[data-editor-view="inspector"]').click();
  assert.equal(await gain.inputValue(),'-6');
  await page.locator('#rq16ResetLayout').click();
  await page.locator('#cuePlaybackForm button[type="submit"]').click();
  assert.equal(await prepared(),initialPrepared);
  await page.locator('#cueSearchInput').fill('no match');
  assert.equal(await page.locator('[data-cue-select]').count(),0);
  await page.locator('#cueSearchInput').fill('');
  assert.equal(await prepared(),initialPrepared);
  console.log('PASS: focus, search and staged editing preserve NEXT and never play');

  await mkdir('artifacts/interface-review',{recursive:true});
  await page.locator('button[data-editor-view="sequence"]').click();
  await page.locator('[data-cue-select]').first().click();
  await page.locator('button[data-editor-view="inspector"]').click();
  await page.locator('#cueInspector .rq-chat-open').click();
  await page.locator('#rqCueChatPanel').waitFor({state:'visible'});
  const cueContext=await page.locator('#rqChatContext').textContent();
  assert.ok(cueContext.includes('The Last Cue'));
  assert.ok(cueContext.includes('SCENE 1 — THE LAST CUE'));
  const consentText=await page.locator('#rqChatAiConsentText').textContent();
  assert.ok(consentText.includes('linked lines'));
  assert.ok(consentText.includes('nearby script lines'));
  assert.ok(consentText.includes('linked audio status'));
  assert.ok(consentText.includes('linked audio titles'));
  assert.ok(consentText.includes('No audio files are sent'));
  await page.screenshot({path:join(evidenceDirectory,'cue-ai-context-1440x900.png'),animations:'disabled'});
  await page.locator('#rqChatPrompt').fill('Fade in 2 seconds and fade out 5 seconds');
  await page.locator('#rqChatSubmit').click();
  await page.locator('#rqChatProposal').waitFor({state:'visible'});
  const proposedChanges=await page.locator('#rqChatDiff').textContent();
  assert.ok(proposedChanges.includes('Fade in'));
  assert.ok(proposedChanges.includes('Fade out'));
  assert.ok(proposedChanges.includes('2 s'));
  assert.ok(proposedChanges.includes('5 s'));
  assert.deepEqual(providerPosts,[],'Local cue edits and contextual display never submit a provider request');
  assert.equal(await page.evaluate(()=>window.audioStarts),0,'Conversational proposals never execute GO');
  await page.locator('#rqChatDiscard').click();
  await page.locator('#rqChatClose').click();
  await page.locator('button[data-editor-view="inspector"]').click();
  await page.waitForFunction(()=>{
    const panel=document.querySelector('#rqCueChatPanel');
    return panel?.hidden&&!document.querySelector('.rq5-inspector-frame')?.classList.contains('rq7-chat-active');
  });
  console.log('PASS: selected cue context, explicit disclosure and distinct fade-in/fade-out draft');

  for(const size of [
    {width:1920,height:1080},{width:1440,height:900},{width:1366,height:768},
    {width:1093,height:614},{width:900,height:600},{width:768,height:900},
  ]){
    await page.setViewportSize(size);
    for(const name of ['home','cues','script','audio','ai','setup','preflight','rehearsal','operation']){
      await route(name);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${name}: no page overflow at ${size.width}`);
      if(name==='ai'){
        const assistantDisclosure=page.locator('#rqShowBuilderAiHelp');
        if(!(await assistantDisclosure.evaluate(element=>element.open)))
          await page.locator('#rqShowBuilderAiHelp > summary').click();
        assert.equal(await page.locator('#rqAgentWorkspace #rqAgentDrawer').count(),1);
        assert.equal(await page.locator('#rqShowBuilder .rq16-builder-stage').count(),5,
          `Show Builder remains available at ${size.width}px`);
        assert.equal(await page.locator('#rqAgentDrawer').count(),1);
        const prompt=await page.locator('#rqAgentPrompt').boundingBox();
        assert.ok(prompt&&prompt.width>=240,`Main AI composer usable at ${size.width}`);
        assert.equal(await page.locator('#rqAgentAskAI').isVisible(),true);
        if(size.width>=1440){
          const submit=await page.locator('#rqAgentAskAI').boundingBox();
          assert.ok(submit.y+submit.height<=size.height,
            `Main AI action is above the fold on desktop (bottom=${submit.y+submit.height}, viewport=${size.height})`);
        }
        assert.equal(await page.locator('#proposalList').count(),1,'Proposal review remains available');
      }
      if(['cues','rehearsal','operation'].includes(name)){
        assert.ok(await page.locator('#operatorGoBtn').isVisible());
        assert.ok(await page.locator('#operatorPanicBtn').isVisible());
      }
      if(name==='rehearsal'&&size.width===1440){
        const rehearsalScriptGeometry=await page.locator('#scriptPreview .script-line').first().evaluate(row=>{
          const text=row.querySelector('.line-text');
          const rowBox=row.getBoundingClientRect();
          const textBox=text.getBoundingClientRect();
          return {rowWidth:rowBox.width,textWidth:textBox.width};
        });
        assert.ok(rehearsalScriptGeometry.rowWidth>=280&&rehearsalScriptGeometry.textWidth>=180,
          `Rehearsal script remains readable instead of wrapping into a narrow column: ${JSON.stringify(rehearsalScriptGeometry)}`);
      }
      assert.equal(await page.locator('#stopAllBtn').isVisible(),['cues','rehearsal','operation'].includes(name),
        `Idle global panic is contextual in ${name} at ${size.width}`);
      if(name==='operation'){
        const toggle=page.locator('.rq-live-script-toggle');
        assert.equal(await toggle.getAttribute('aria-controls'),'scriptPreview');
        assert.equal(await toggle.textContent(),'Show script');
        if(size.height<=720){
          const desk=await page.locator('.rq5-desk').evaluate(el=>({
            overflowY:getComputedStyle(el).overflowY,
            scrollTop:el.scrollTop,
          }));
          assert.equal(desk.overflowY,'auto','Compact Live desk stays scrollable');
        }
        await toggle.scrollIntoViewIfNeeded();
        const toggleHit=await toggle.evaluate(element=>{
          const rect=element.getBoundingClientRect();
          const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
          const target=document.elementFromPoint(x,y);
          const events=document.querySelector('#rq14Events');
          const eventsRect=events.getBoundingClientRect();
          const targetRect=target?.getBoundingClientRect();
          const toggleStyle=getComputedStyle(element);
          const toggleAncestors=[];
          for(let parent=element.parentElement;parent;parent=parent.parentElement){
            const rect=parent.getBoundingClientRect(),style=getComputedStyle(parent);
            toggleAncestors.push({tag:parent.tagName,id:parent.id,className:String(parent.className),
              rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
              position:style.position,zIndex:style.zIndex,pointerEvents:style.pointerEvents,
              overflow:style.overflow,transform:style.transform});
            if(parent.classList.contains('rq5-show-workspace'))break;
          }
          return {
            receivesPointer:Boolean(target&&element.contains(target)),
            target:target?.outerHTML?.slice(0,320)??null,
            targetRect:targetRect&&{x:targetRect.x,y:targetRect.y,width:targetRect.width,height:targetRect.height},
            toggleStyle:{position:toggleStyle.position,zIndex:toggleStyle.zIndex},
            toggleAncestors,
            targetAncestors:target?[target.parentElement,target.parentElement?.parentElement].filter(Boolean).map(parent=>{
              const rect=parent.getBoundingClientRect(),style=getComputedStyle(parent);
              return {tag:parent.tagName,id:parent.id,className:String(parent.className),
                rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
                position:style.position,zIndex:style.zIndex,pointerEvents:style.pointerEvents,
                overflow:style.overflow,transform:style.transform};
            }):[],
            toggle:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
            events:{x:eventsRect.x,y:eventsRect.y,width:eventsRect.width,height:eventsRect.height},
            animations:element.getAnimations().map(animation=>animation.playState),
            scroll:{x:scrollX,y:scrollY},
          };
        });
        assert.ok(toggleHit.receivesPointer,
          `Live script toggle is intercepted: ${JSON.stringify(toggleHit)}`);
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-pressed'),'true');
        assert.equal(await toggle.textContent(),'Hide script');
        await page.locator('.layout > .panel[data-workspaces~="script"]').evaluate(async el=>{
          await Promise.all(el.getAnimations().map(animation=>animation.finished));
        });
        assert.equal(await page.locator('#scriptPreview').isVisible(),true);
        assert.equal(await prepared(),initialPrepared,'Live script reading never prepares another GO');
        assert.equal(await page.evaluate(()=>window.audioStarts),0);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,
          `Live script panel has no page overflow at ${size.width}`);
        const go=await page.locator('#operatorGoBtn').boundingBox();
        assert.ok(go&&go.x>=0&&go.x+go.width<=size.width+1&&go.y+go.height<=size.height+1,
          `GO stays usable with Live script open at ${size.width}`);
        const liveBody=await page.locator('.cue-workspace-body').evaluate(el=>({
          width:el.clientWidth,content:el.scrollWidth,
          right:el.getBoundingClientRect().right,
          inspectorRight:el.querySelector('#rq14StageCurrent').getBoundingClientRect().right,
        }));
        assert.ok(liveBody.content<=liveBody.width+1&&liveBody.inspectorRight<=liveBody.right+1,
          `Live inspector must not be horizontally clipped at ${size.width}: ${JSON.stringify(liveBody)}`);
        if(size.width>=1093){
          const panel=page.locator('.layout > .panel[data-workspaces~="script"]');
          const originalWidth=(await panel.boundingBox()).width;
          const grip=panel.locator('[data-rq-panel="live-script"]');
          assert.equal(await grip.isVisible(),true,'Live script exposes its actual width grip');
          const box=await grip.boundingBox();
          await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
          await page.mouse.down();
          await page.mouse.move(box.x+box.width/2+80,box.y+box.height/2);
          await page.mouse.up();
          await page.waitForFunction(expected=>{
            const width=document.querySelector('.layout > .panel[data-workspaces~="script"]').getBoundingClientRect().width;
            return width>=expected+60;
          },originalWidth);
          const savedWidth=await page.evaluate(()=>JSON.parse(localStorage.getItem('runq.panels.v1'))['live-script']);
          assert.ok(Math.abs(savedWidth-originalWidth-80)<=2,'Live script width is genuinely resized and saved');
          await grip.dblclick();
          await page.waitForFunction(expected=>{
            const width=document.querySelector('.layout > .panel[data-workspaces~="script"]').getBoundingClientRect().width;
            return Math.abs(width-expected)<=2;
          },originalWidth);
          if(size.width===1920){
            const sequenceGrip=page.locator('[data-rq-panel="live-cues"]');
            await sequenceGrip.focus();
            await sequenceGrip.press('ArrowLeft');
            const sequencePreference=await page.evaluate(()=>JSON.parse(localStorage.getItem('runq.panels.v1'))['live-cues']);
            const edge=await grip.boundingBox();
            await page.mouse.move(edge.x+edge.width/2,edge.y+edge.height/2);
            await page.mouse.down();
            await page.mouse.move(edge.x+edge.width/2+360,edge.y+edge.height/2);
            await page.mouse.up();
            await page.setViewportSize({width:768,height:900});
            await panel.evaluate(async el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
            assert.ok((await panel.boundingBox()).width<=368,'Stored wide script panel is clamped in a smaller window');
            const narrowGo=await page.locator('#operatorGoBtn').boundingBox();
            assert.ok(narrowGo&&narrowGo.x+narrowGo.width<=769&&narrowGo.y+narrowGo.height<=901);
            const monitor=page.locator('#rq14StageCurrent');
            await monitor.scrollIntoViewIfNeeded();
            const frame=await page.locator('.cue-workspace-body').boundingBox();
            const box=await monitor.boundingBox();
            assert.ok(box.width>=frame.width-3&&box.x+box.width<=frame.x+frame.width+1,
              'Narrow Live status/inspector is full-width and reachable by vertical scrolling');
            assert.equal(await sequenceGrip.isVisible(),false,'Horizontal split grip is unavailable in stacked mode');
            assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('runq.panels.v1'))['live-cues']),
              sequencePreference,'Narrow layout preserves the operator preferred wide split');
            await toggle.click();
            await page.setViewportSize(size);
            await toggle.click();
            await panel.evaluate(async el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
            await grip.dblclick();
            await page.waitForFunction(expected=>{
              const width=document.querySelector('.layout > .panel[data-workspaces~="script"]').getBoundingClientRect().width;
              return Math.abs(width-expected)<=2;
            },originalWidth);
            assert.equal(await sequenceGrip.isVisible(),true,'Wide Live split remains resizable after narrow stacking');
            const restoredSequence=await page.locator('.cue-workspace-body').evaluate(el=>parseFloat(getComputedStyle(el).gridTemplateColumns));
            assert.ok(Math.abs(restoredSequence-sequencePreference)<=1,'Returning wide restores the actual preferred track width');
            await sequenceGrip.dblclick();
            assert.equal(await page.evaluate(()=>Object.hasOwn(JSON.parse(localStorage.getItem('runq.panels.v1')),'live-cues')),false,
              'Double-click clears the saved wide preference after responsive restoration');
          }
          assert.equal(await prepared(),initialPrepared);
        }
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-pressed'),'false');
      }
      if(name==='cues'&&size.width>=1000){
        const go=await page.locator('#operatorGoBtn').boundingBox();
        assert.ok(go.y+go.height<=size.height,`GO stays on screen at ${size.width}`);
        const inspectorBox=await page.locator('#cueInspector').boundingBox();
        assert.ok(inspectorBox&&inspectorBox.height>=180);
      }
      await page.screenshot({path:join(evidenceDirectory,`${name}-${size.width}x${size.height}.png`),animations:'disabled'});
    }
  }
  assert.equal(await page.locator('#scriptPreview').textContent(),sourceText);
  assert.equal(await prepared(),initialPrepared);
  assert.equal(await page.evaluate(()=>window.audioStarts),0);
  console.log('PASS: all nine workspaces at four sizes; original script, NEXT and audio untouched');

  await route('setup');
  assert.equal(await page.evaluate(()=>window.microphoneRequests),0,'Opening Setup must not request the microphone');
  await page.locator('#setupTabAudio').click();
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(()=>document.querySelector('#setupTabMicrophone').getAttribute('aria-selected')==='true');
  assert.equal(await page.locator('#setupTabMicrophone').getAttribute('aria-selected'),'true');
  await page.locator('#setupTabAudio').click();
  await page.locator('#setupMasterVolume').evaluate(element=>{
    element.value='40';element.dispatchEvent(new Event('input',{bubbles:true}));
    element.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('runq.operator.preferences.v1')).masterVolume===0.4);
  await page.locator('#setupTestOutput').click();
  await page.waitForFunction(()=>document.querySelector('#setupAudioStatus').textContent.includes('test tone'));
  await page.locator('#setupTabMicrophone').click();
  await page.locator('#rqLiveDevice').selectOption('mic-1');
  await page.locator('#setupMicStart').click();
  await page.waitForFunction(()=>window.microphoneRequests===1);
  assert.deepEqual(await page.evaluate(()=>window.microphoneConstraints[0].audio.deviceId),{exact:'mic-1'});
  await page.locator('#setupMicStop').click();
  assert.equal(await page.evaluate(()=>window.microphoneStops),1);
  await page.locator('#setupTabRehearsal').click();
  await page.locator('#rqLiveLang').selectOption('mixed');
  await page.locator('#rqLiveMode').selectOption('assist');
  await page.waitForFunction(()=>{
    const prefs=JSON.parse(localStorage.getItem('runq.operator.preferences.v1'));
    return prefs.voiceLanguage==='mixed'&&prefs.voiceMode==='assist';
  });
  assert.equal(await page.locator('#rqLiveArm').getAttribute('aria-pressed'),'false');
  await page.locator('#setupTabInterface').click();
  await page.locator('#setupCueDensity').selectOption('comfortable');
  assert.equal(await page.locator('.shell').getAttribute('data-cue-density'),'comfortable');
  await page.locator('#setupResetInterface').click();
  assert.equal(await page.locator('.shell').getAttribute('data-cue-density'),'standard');
  await page.locator('#setupTabAudio').click();
  await page.locator('#setupResetAudio').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('runq.operator.preferences.v1')).masterVolume===1);
  assert.equal(await page.evaluate(()=>window.microphoneRequests),1,'Microphone capture is only requested by its explicit test button');
  console.log('PASS: Setup persists the shared output/input preferences and microphone capture remains explicit');

  await page.setViewportSize({width:1440,height:900});
  await route('audio');
  await page.locator('[data-rq10-sound-tab="library"]').click();
  const wave=page.locator('#rq5WaveCanvas');
  const compact=await wave.boundingBox();
  await page.locator('#rq11ExpandWave').click();
  assert.ok((await wave.boundingBox()).height>compact.height+50,'Expand waveform actually enlarges it');
  await page.locator('#rq11ExpandWave').click();
  await page.locator('#rq10LibrarySearch').fill('clock');
  assert.equal(await page.locator('.asset-list-row:visible').count(),1);
  await page.locator('#rq10LibrarySearch').fill('');
  await page.locator('[data-rq10-sound-tab="generate"]').click();
  assert.ok((await page.locator('.rq10-integrated-lab').boundingBox()).width>700);
  assert.equal(await page.locator('#assetList').isVisible(),false);
  await page.screenshot({path:join(evidenceDirectory,'sound-create-1440x900.png'),animations:'disabled'});
  await page.locator('[data-rq10-sound-tab="library"]').click();
  assert.equal(await page.locator('#assetList').isVisible(),true);
  console.log('PASS: sound search, waveform expansion and full-width creation');

  // Explicit operator transport still executes; design operations above did not.
  await route('cues');
  await page.locator('button[data-editor-view="sequence"]').click();
  await page.locator('#operatorGoBtn').click();
  await page.waitForFunction(()=>window.audioStarts===1);
  assert.notEqual(await prepared(),initialPrepared);
  await page.locator('#operatorPanicBtn').click();
  assert.ok(await page.evaluate(()=>window.audioStops)>0);
  const next=await prepared();
  await page.locator('[data-cue-select]').first().click();
  await page.locator('button[data-editor-view="inspector"]').click();
  assert.equal(await page.locator('[data-preview-cue]').isEnabled(),true,'STOP after ZIP import must unlock audition without reselecting a different cue');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-preview-cue]').click();
  await page.waitForFunction(()=>window.audioStarts===2);
  assert.equal(await prepared(),next);
  await route('home');
  assert.equal(await page.locator('#stopAllBtn').isVisible(),true,'Audition exposes global STOP ALL on home');
  await page.locator('#stopAllBtn').click();
  await page.waitForFunction(()=>document.querySelector('#stopAllBtn').hidden);
  assert.equal(await prepared(),next);
  assert.equal(await page.evaluate(()=>window.audioStarts),2,'Returning home and stopping never starts audio');
  await route('cues');
  await page.evaluate(()=>{window.holdAudioResume=true;});
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-preview-cue]').click();
  await page.waitForFunction(()=>typeof window.releaseAudioResume==='function');
  await route('home');
  assert.equal(await page.locator('#stopAllBtn').isVisible(),true,'Pending audition exposes global STOP ALL');
  await page.locator('#stopAllBtn').click();
  await page.evaluate(()=>{window.holdAudioResume=false;window.releaseAudioResume();});
  await page.waitForFunction(()=>document.querySelector('#stopAllBtn').hidden);
  assert.equal(await page.evaluate(()=>window.audioStarts),2,'STOP ALL fences late audio resume');
  assert.equal(await prepared(),next);
  console.log('PASS: explicit GO, STOP ALL and audition retain separate transport state');

  // Drag-to-resize panels change layout only and persist per workspace.
  await route('operation');
  const liveCols=()=>page.evaluate(()=>getComputedStyle(document.querySelector('.cue-workspace-body')).gridTemplateColumns.split(' ')[0]);
  const liveBefore=parseFloat(await liveCols());
  const grip=await page.locator('.cue-workspace-body > .rq-grip-col').boundingBox();
  await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);
  await page.mouse.down();
  await page.mouse.move(grip.x+grip.width/2+200,grip.y+grip.height/2,{steps:5});
  await page.mouse.up();
  assert.ok(parseFloat(await liveCols())>liveBefore+150,'Live cue list widens when its grip is dragged');
  await route('cues');
  await route('operation');
  assert.ok(parseFloat(await liveCols())>liveBefore+150,'Live panel width persists across workspace switches');
  await page.locator('.cue-workspace-body > .rq-grip-col').dblclick();
  assert.ok(Math.abs(parseFloat(await liveCols())-liveBefore)<2,'Double-click restores the default width');
  assert.equal(await prepared(),next,'Resizing never changes the prepared cue');
  // Live script follow panel: opt-in, read-only, follows NEXT's source line.
  assert.equal(await page.locator('.layout>.panel[data-workspaces~="script"]').isVisible(),false,'Live hides the script by default');
  await page.locator('.rq-live-script-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#scriptPreview').getBoundingClientRect().width>200);
  assert.equal(await page.locator('#scriptPreview').isVisible(),true,'Live script drawer opens');
  await page.waitForFunction(()=>document.querySelectorAll('.rq-live-next-line').length===1);
  assert.equal(await prepared(),next,'Showing the script never changes the prepared cue');
  await page.locator('.rq-live-script-toggle').click();
  await page.waitForFunction(()=>document.querySelector('.layout>.panel[data-workspaces~=script]').getBoundingClientRect().width===0);
  console.log('PASS: draggable panels resize, persist and reset without touching NEXT');

  await page.locator('#uiLocaleSelect').selectOption('es');
  assert.equal(await settings.textContent(),'Ajustes');
  await page.reload();
  await route('rehearsal');
  assert.match(await page.locator('#rqvfPrimaryTitle').textContent(),/SEGUIMIENTO/);
  assert.match(await page.locator('#rqLiveTitle').textContent(),/SEGUIMIENTO/);
  await page.locator('#uiLocaleSelect').selectOption('en');
  assert.match(await page.locator('#rqLiveTitle').textContent(),/LIVE VOICE/);
  await page.reload();
  await route('script');
  const scriptToolbar=page.locator('.rq16-script-toolbar');
  assert.equal(await scriptToolbar.getAttribute('role'),'toolbar');
  assert.equal(await scriptToolbar.locator('button .rq16-toolbar-icon').count(),5);
  assert.equal(await scriptToolbar.locator('button .rq16-toolbar-label').count(),5);
  assert.match(await page.locator('#rq16DetectScriptCues').textContent(),/Detect cues with AI/);
  await page.locator('#uiLocaleSelect').selectOption('es');
  assert.match(await page.locator('#rq16DetectScriptCues').textContent(),/Detectar cues con IA/);
  await page.locator('#uiLocaleSelect').selectOption('en');
  await page.locator('#exampleBtn').click();
  await page.locator('#scriptPreview [data-script-line-select="L2"]').waitFor({state:'visible'});
  await route('ai');
  await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="project"]').click();
  assert.equal(await page.locator('#rqShowBuilderProposeCues').isVisible(),true,
    'The imported script offers one direct next step to propose cues');
  assert.match(await page.locator('#rqShowBuilderProposeCues').textContent(),/Suggest cues to review/);
  const proposalPostsBeforeDirectAction=providerPosts.length;
  await page.locator('#analyzeMetaBtn').evaluate(button=>{button.disabled=true;});
  await page.locator('#rqShowBuilderProposeCues').click();
  await page.waitForFunction(()=>document.querySelector('#rqShowBuilderCanvas')?.dataset.activeTask==='cues');
  assert.equal(providerPosts.length,proposalPostsBeforeDirectAction,
    'The direct script action opens the existing consent-gated flow without submitting a provider request');
  await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="cues"]').click();
  assert.equal(await page.locator('#rqShowBuilderCueTask').isVisible(),true);
  assert.equal(await page.locator('#rqShowBuilderSourceTask').isVisible(),false);
  assert.equal(await page.locator('#rqShowBuilderCueTask #proposalList').count(),1,
    'The existing live proposal list is embedded in the Builder review task');
  assert.equal(await page.locator('#rqShowBuilderAiControls #analyzeMetaBtn').count(),1,
    'Optional AI controls retain the original consent-gated handler');
  assert.match(await page.locator('#rqShowBuilderAiControls > summary').textContent(),/Optional advanced settings/);
  const aiControls=page.locator('#rqShowBuilderAiControls');
  if((await aiControls.getAttribute('open'))===null)
    await aiControls.locator(':scope > summary').click();
  const soundIdea='Quiet wind through an abandoned library';
  await page.locator('#proposalLabel').fill(soundIdea);
  await page.locator('#lineSelect').selectOption('L2');
  await page.locator('#createProposalBtn').click();
  await page.locator('#proposalLabel').fill('Distant footsteps in a stone corridor');
  await page.locator('#createProposalBtn').click();
  const approveAll=page.locator('#rqShowBuilderApproveAllProposals');
  assert.equal(await approveAll.isVisible(),true,
    'The review step offers one explicit action for multiple pending proposals');
  assert.match(await approveAll.textContent(),/Approve all \d+ pending proposals/);
  await page.evaluate(()=>{
    window.batchApprovalConfirmations=[];
    window.confirm=message=>{
      window.batchApprovalConfirmations.push(message);
      return true;
    };
  });
  await approveAll.click();
  assert.match(await page.evaluate(()=>window.batchApprovalConfirmations[0]),/Approve exactly \d+ selected proposals/);
  await page.waitForFunction(()=>{
    let result=null;
    document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:value=>{result=value;}}}));
    return result?.project?.proposals.every(proposal=>proposal.status!=='PENDING');
  });
  assert.equal(await page.locator('#rqContextInspector [data-rq-context-action="undo-batch"]').count(),1,
    'Bulk approval preserves the existing batch undo action');
  let approvedSoundCue=null;
  await page.waitForFunction(label=>{
    let result=null;
    document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:value=>{result=value;}}}));
    return result?.project?.cues.some(cue=>cue.label===label&&
      cue.actions.some(action=>action.type==='PLAN_AUDIO'&&action.prompt===label));
  },soundIdea);
  approvedSoundCue=await page.evaluate(label=>{
    let result=null;
    document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:value=>{result=value;}}}));
    return result?.project?.cues.find(cue=>cue.label===label);
  },soundIdea);
  assert.ok(approvedSoundCue,'Approving a sound proposal creates a draft cue with its audio idea intact');
  await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="audio"]').click();
  const soundCueRow=page.locator(`[data-builder-sound-cue="${approvedSoundCue.id}"]`);
  assert.match(await soundCueRow.locator('.rq16-builder-sound-idea').textContent(),/Quiet wind through an abandoned library/,
    'The Sound step surfaces the proposal audio idea next to its cue');
  await soundCueRow.locator('[data-builder-open-cue-sound]').click();
  assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'audio',
    'Preparing the cue opens the existing audio workspace directly');
  assert.equal(await page.evaluate(()=>{
    let result=null;
    document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:value=>{result=value;}}}));
    return result?.selectedCueId;
  }),approvedSoundCue.id,'The audio workspace retains the approved cue as its target');
  const generatedSoundPrompt=await page.locator('#soundPrompt').inputValue();
  assert.ok(generatedSoundPrompt.includes(soundIdea),
    'The English sound request retains the generated cue idea');
  assert.match(generatedSoundPrompt,/^Cue \d+, script reference L\d+\./,
    'The English sound request includes its cue number and original script reference');
  assert.match(generatedSoundPrompt,/approximately \d+ seconds/,
    'The cue sound request includes an estimated duration');
  assert.equal(await page.locator('#confirmRequest').count(),0,
    'Sound generation uses the explicit Generate action, not a repeated permission checkbox');
  assert.equal(await page.evaluate(()=>window.audioStarts),0,'Opening the sound workspace never executes GO');
  await route('ai');
  await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="project"]').click();
  assert.equal(await page.locator('#rqShowBuilderSourceTask').isVisible(),true);
  await page.locator('#rqShowBuilderSourceLines [data-builder-line-select="L3"]').check();
  assert.equal(await page.locator('#rqShowBuilderAnalyzeSelected').isEnabled(),true);
  const builderCuesBefore=await page.locator('#cueList [data-cue-select]').count();
  await page.locator('#rqShowBuilderCreateSelected').click();
  assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'ai',
    'Creating from the Builder keeps the operator in the same project workspace');
  await page.waitForFunction(count=>document.querySelectorAll('#cueList [data-cue-select]').length===count+1,
    builderCuesBefore);
  const builderCue=await page.evaluate(()=>{
    let result=null;
    document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:value=>{result=value;}}}));
    return result?.project?.cues.find(cue=>cue.sourceLineIds.includes('L3')&&cue.origin==='MANUAL');
  });
  assert.ok(builderCue,'Builder creates a real cue linked to the exact original L# line');
  assert.equal(await page.evaluate(()=>window.audioStarts),0,'Inline Builder cue creation never executes GO');
  await route('script');
  await page.locator('#scriptPreview [data-script-line-select="L2"]').check();
  const selectedSourceText=await page.locator('.script-line[data-script-line-id="L2"] .line-text').textContent();
  assert.equal(await page.locator('#rq16CreateCueFromLines').isEnabled(),true);
  const scriptLine=page.locator('.script-line[data-script-line-id="L2"]');
  await scriptLine.locator('.line-text').click({button:'right'});
  const scriptContextMenu=page.locator('#rq16ScriptContextMenu');
  await scriptContextMenu.waitFor({state:'visible'});
  assert.equal(await scriptContextMenu.getAttribute('role'),'menu');
  assert.equal(await scriptContextMenu.locator('[role="menuitem"]').count(),4);
  await scriptContextMenu.locator('[data-script-context-action="analyze"]').click();
  await page.waitForFunction(()=>document.querySelector('.shell').dataset.activeWorkspace==='ai');
  assert.match(await page.locator('#rqAgentPrompt').inputValue(),/L2/);
  assert.match(await page.locator('#rqAgentContextSource').textContent(),/L2/);
  assert.ok((await page.locator('#rqAgentContextSource').textContent()).includes(selectedSourceText.trim()));
  assert.deepEqual(providerPosts,[],'Preparing selected-line analysis never submits a provider request');
  await route('script');
  await page.locator('.script-line[data-script-line-id="L2"] .line-text').click({button:'right'});
  await page.locator('#rq16ScriptContextMenu [data-script-context-action="detect"]').click();
  await page.waitForFunction(()=>document.querySelector('.shell').dataset.activeWorkspace==='ai');
  assert.match(await page.locator('#rq16ScriptSelectionStatus').textContent(),/analysis|análisis/i,
    'Detect from Script opens the existing analysis flow without submitting');
  assert.deepEqual(providerPosts,[]);
  await route('script');
  await page.locator('.script-line[data-script-line-id="L2"] .line-text').click({button:'right'});
  await page.locator('#rq16ScriptContextMenu [data-script-context-action="ask"]').click();
  await page.waitForFunction(()=>document.querySelector('.shell').dataset.activeWorkspace==='ai');
  assert.equal(await page.locator('#rqAgentPrompt').evaluate(el=>document.activeElement===el),true,
    'Ask RUNQ AI opens the existing assistant without submitting');
  assert.deepEqual(providerPosts,[]);
  await route('script');
  const startsBeforeSourceCue=await page.evaluate(()=>window.audioStarts);
  await page.locator('.script-line[data-script-line-id="L2"] .line-text').click({button:'right'});
  await page.locator('#rq16ScriptContextMenu [data-script-context-action="create"]').click();
  await page.waitForFunction(()=>document.querySelector('.shell').dataset.activeWorkspace==='cues');
  const sourceCue=await page.evaluate(()=>{
    let result=null;
    document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:value=>{result=value;}}}));
    return result?.project?.cues.find(cue=>cue.id===result.selectedCueId);
  });
  assert.ok(sourceCue,'Creating a cue from a real selected line opens the new cue in Studio');
  assert.deepEqual(sourceCue.sourceLineIds,['L2'],'Manual cue retains the exact original stable line reference');
  assert.equal(sourceCue.origin,'MANUAL');
  assert.equal(await page.evaluate(()=>window.audioStarts),startsBeforeSourceCue,'Script selection and cue creation never execute GO');
  await route('cues');
  const cueToolbar=page.locator('.cue-create-actions');
  assert.equal(await cueToolbar.getAttribute('role'),'toolbar');
  assert.equal(await cueToolbar.locator('button .rq16-toolbar-icon').count(),6);
  assert.equal(await cueToolbar.locator('button .rq16-toolbar-label').count(),6);
  assert.match(await page.locator('#cueAddBtn').textContent(),/Add cue/);
  assert.match(await page.locator('#cueDeleteBtn').textContent(),/Delete selected/);
  await page.locator('#rq16EditorViews [data-editor-view="both"]').click();
  const sourceRow=page.locator(`#cueList [data-cue-select="${sourceCue.id}"]`);
  await sourceRow.click({button:'right'});
  const contextMenu=page.locator('#rq16CueContextMenu');
  await contextMenu.waitFor({state:'visible'});
  assert.equal(await contextMenu.getAttribute('role'),'menu');
  await contextMenu.locator('[data-context-action="sound"]').click();
  assert.equal(await page.locator('#cueInspectorTab-audio').getAttribute('aria-selected'),'true',
    'Context sound action opens unresolved audio assignment and draft settings together');
  assert.equal(await page.locator('#cuePlaybackForm [name="fadeOutMs"]').isVisible(),true);
  assert.ok(await page.locator(`[data-cue-audio-pick="${sourceCue.id}"]`).count()>=1);
  await page.locator('#rq16EditorViews [data-editor-view="both"]').click();
  await sourceRow.click({button:'right'});
  await page.locator('#rq16CueContextMenu [data-context-action="properties"]').click();
  assert.equal(await page.locator('#rq16EditorViews [data-editor-view="inspector"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#cueInspectorTab-details').getAttribute('aria-selected'),'true');
  await page.locator('#rq16EditorViews [data-editor-view="both"]').click();
  const beforeContextDuplicate=await page.locator('#cueList [data-cue-select]').count();
  await sourceRow.click({button:'right'});
  await page.locator('#rq16CueContextMenu [data-context-action="duplicate"]').click();
  await page.waitForFunction(count=>document.querySelectorAll('#cueList [data-cue-select]').length===count+1,
    beforeContextDuplicate);
  const duplicatedRow=page.locator('#cueList .cue-item.cue-selected [data-cue-select]');
  const duplicateId=await duplicatedRow.getAttribute('data-cue-select');
  await page.evaluate(()=>{window.confirm=()=>true;});
  await duplicatedRow.click({button:'right'});
  await page.locator('#rq16CueContextMenu [data-context-action="delete"]').click();
  await page.waitForFunction(count=>document.querySelectorAll('#cueList [data-cue-select]').length===count,
    beforeContextDuplicate);
  assert.equal(await page.locator(`#cueList [data-cue-select="${duplicateId}"]`).count(),0);
  assert.equal(await page.evaluate(()=>window.audioStarts),startsBeforeSourceCue,
    'Contextual properties, audio assignment and cue edits never execute GO');
  const beforeShortcutCount=await page.locator('#cueList [data-cue-select]').count();
  await page.evaluate(()=>document.activeElement?.blur());
  await page.keyboard.press('Alt+Shift+A');
  await page.waitForFunction(count=>document.querySelectorAll('#cueList [data-cue-select]').length===count+1,
    beforeShortcutCount);
  const afterShortcutCount=await page.locator('#cueList [data-cue-select]').count();
  await page.locator('#cueSearchInput').focus();
  await page.keyboard.press('Alt+Shift+A');
  assert.equal(await page.locator('#cueList [data-cue-select]').count(),afterShortcutCount,
    'Studio edit shortcuts do not fire while typing in search');
  await page.locator('#cueList [data-cue-select]').first().press('ContextMenu');
  await contextMenu.waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  assert.equal(await contextMenu.isVisible(),false,'Keyboard context menu closes safely with Escape');
  for(const viewport of [{width:1920,height:1080},{width:1440,height:900}]){
    await page.setViewportSize(viewport);
    for(const locale of ['es','en']){
      await page.locator('#uiLocaleSelect').selectOption(locale);
      for(const [workspace,selector] of [
        ['cues','.cue-create-actions'],
        ['script','.rq16-script-toolbar'],
      ]){
        await route(workspace);
        const toolbar=page.locator(selector);
        const layout=await toolbar.evaluate(element=>({
          bounds:element.getBoundingClientRect().toJSON(),
          actions:[...element.querySelectorAll('button')].map(button=>{
            const label=button.querySelector('.rq16-toolbar-label');
            const icon=button.querySelector('.rq16-toolbar-icon');
            return {
              visible:button.getBoundingClientRect().width>0&&button.getBoundingClientRect().height>0,
              labelVisible:Boolean(label&&label.getBoundingClientRect().width>0&&label.getBoundingClientRect().height>0),
              iconVisible:Boolean(icon&&icon.getBoundingClientRect().width>0&&icon.getBoundingClientRect().height>0),
            };
          }),
          viewportWidth:innerWidth,
        }));
        assert.ok(layout.bounds.width>0&&layout.bounds.right<=layout.viewportWidth+1,
          `${workspace} toolbar fits at ${viewport.width}px (${locale})`);
        assert.ok(layout.actions.length>0&&layout.actions.every(action=>
          action.visible&&action.labelVisible&&action.iconVisible),
          `${workspace} action labels and icons remain visible at ${viewport.width}px (${locale}): ${JSON.stringify(layout)}`);
      }
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#uiLocaleSelect').selectOption('es');
  await route('ai');
  const mobileBuilder=page.locator('#rqShowBuilder');
  const mobileBounds=await mobileBuilder.evaluate(element=>({
    viewportWidth:innerWidth,
    bounds:element.getBoundingClientRect().toJSON(),
    stages:[...element.querySelectorAll('.rq16-builder-stage')].map(stage=>
        stage.getBoundingClientRect().toJSON()),
    actions:[...element.querySelectorAll('.rq16-builder-actions .btn:not([hidden])')].map(action=>
        action.getBoundingClientRect().toJSON()),
  }));
  assert.ok(mobileBounds.bounds.width>0&&mobileBounds.bounds.left>=0
    &&mobileBounds.bounds.right<=mobileBounds.viewportWidth+1,
  `Show Builder fits the 390px mobile viewport: ${JSON.stringify(mobileBounds)}`);
  assert.equal(mobileBounds.stages.length,5,'All five Builder stages remain available on mobile');
  assert.ok(mobileBounds.stages.every(stage=>stage.width>0&&stage.left>=0
    &&stage.right<=mobileBounds.viewportWidth+1),
  `Every Builder stage fits the mobile viewport: ${JSON.stringify(mobileBounds)}`);
  assert.ok(mobileBounds.actions.length>=3&&mobileBounds.actions.every(action=>
    action.width>0&&action.left>=0&&action.right<=mobileBounds.viewportWidth+1),
  `Builder navigation actions fit the mobile viewport: ${JSON.stringify(mobileBounds)}`);
  await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="cues"]').click();
  const mobileCueTask=await page.locator('#rqShowBuilderCueTask').boundingBox();
  assert.ok(mobileCueTask&&mobileCueTask.width>0&&mobileCueTask.x>=0
    &&mobileCueTask.x+mobileCueTask.width<=390+1,
  `Cue task fits the mobile viewport: ${JSON.stringify(mobileCueTask)}`);
  await page.setViewportSize({width:1440,height:900});
  assert.equal(await page.evaluate(()=>window.audioStarts),startsBeforeSourceCue,
    'Studio edit shortcuts reuse edit actions and never execute GO');
  await route('ai');
  await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="project"]').click();
  const importedSource='Original source remains unchanged.\nSecond line keeps its L2 reference.';
  page.once('dialog',dialog=>dialog.accept());
  const importChooser=page.waitForEvent('filechooser');
  await page.locator('#rqShowBuilderImportScript').click();
  await (await importChooser).setFiles({
    name:'builder-original-source.txt',
    mimeType:'text/plain',
    buffer:Buffer.from(importedSource),
  });
  await page.waitForFunction(script=>{
    let result=null;
    document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:value=>{result=value;}}}));
    return result?.project?.scriptText===script;
  },importedSource);
  assert.equal(await page.locator('.shell').getAttribute('data-active-workspace'),'ai',
    'Importing from the Builder keeps the operator in the same project workspace');
  assert.equal(await page.locator('#rqShowBuilderSourceLines [data-builder-line-select="L2"]').count(),1,
    'Imported original script receives a stable L2 reference without translation');
  assert.deepEqual(providerPosts,[],'Script import does not submit a provider request');
  for(const size of [
    {width:1920,height:1080},{width:1440,height:900},
    {width:1366,height:768},{width:900,height:600},
  ]){
    await page.setViewportSize(size);
    for(const locale of ['es','en']){
      await page.locator('#uiLocaleSelect').selectOption(locale);
      await route('ai');
      const builder=page.locator('#rqShowBuilder');
      const bounds=await builder.boundingBox();
      assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=size.width+1,
        `Show Builder fits ${size.width}px in ${locale}`);
      assert.equal(await builder.locator('[data-builder-stage]:visible').count(),1,
        `Only the active task is visible at ${size.width}px in ${locale}`);
      assert.equal(await builder.locator('.rq16-builder-stage-label').first().textContent(),
        locale==='es'?'Proyecto':'Project');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,
        `Show Builder has no horizontal overflow at ${size.width}px in ${locale}`);
      await page.screenshot({
        path:join(evidenceDirectory,`show-builder-${locale}-${size.width}x${size.height}.png`),
        animations:'disabled',
      });
    }
  }
  assert.deepEqual(providerPosts,[],'No provider submissions during offline acceptance');
  assert.deepEqual(errors,[],'No uncaught JavaScript errors');
  const expectedStatusConsoleErrors=consoleErrors.filter(({text,location})=>
    location.url.endsWith('/api/meta/status')
    &&(text.includes('404 (Not Found)')||text.includes('net::ERR_FAILED')));
  const unexpectedConsoleErrors=consoleErrors.filter(error=>!expectedStatusConsoleErrors.includes(error));
  assert.equal(expectedStatusConsoleErrors.length,2,
    `The injected 404 and offline status checks produce only their two expected browser diagnostics: ${JSON.stringify(consoleErrors)}`);
  assert.deepEqual(unexpectedConsoleErrors,[],
    `No unexpected browser console errors: ${JSON.stringify(unexpectedConsoleErrors)}`);
  const expectedStatusHttpErrors=httpErrors.filter(error=>
    error.status===404&&error.url.endsWith('/api/meta/status'));
  const unexpectedHttpErrors=httpErrors.filter(error=>!expectedStatusHttpErrors.includes(error));
  assert.equal(expectedStatusHttpErrors.length,1,
    `The deliberate unknown-status-route check produces one 404: ${JSON.stringify(httpErrors)}`);
  assert.deepEqual(unexpectedHttpErrors,[],
    `No unexpected failed HTTP responses: ${JSON.stringify(unexpectedHttpErrors)}`);
  assert.equal(expectedStatusAbortCount,1,'The deliberate offline status check aborts exactly one request');
  assert.deepEqual(failedRequests,[],'No failed network requests');
  console.log('PASS: stored ES locale, EN switch, contextual source-line workflow, no script errors or provider submissions');
} catch(error) {
  try {
    await page.screenshot({path:join(evidenceDirectory,'failure.png'),animations:'disabled'});
    console.error(`Failure screenshot: ${join(evidenceDirectory,'failure.png')}`);
  } catch(screenshotError) {
    console.error('Unable to capture failure screenshot:',screenshotError);
  }
  throw error;
} finally {
  try {
    if(browser)await browser.close();
  } finally {
    if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}
