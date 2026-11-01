import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createAppServer } from './dev-server.mjs';
import { launchTestBrowser } from './browserTestRuntime.mjs';

const server=createAppServer();
const pageErrors=[];
const consoleErrors=[];
const failedRequests=[];
const externalRequests=[];
const apiPosts=[];
let browser=null;
let page=null;
const evidenceDirectory=join('artifacts','interface-review',`functional-${Date.now()}`);

try {
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const origin=`http://127.0.0.1:${server.address().port}`;
  const launched=await launchTestBrowser();
  browser=launched.browser;
  console.log(`Functional browser: ${launched.label} (${await browser.version()})`);
  page=await browser.newPage({viewport:{width:1366,height:768},acceptDownloads:true});
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  page.on('requestfailed',request=>
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText??'failed'}`));
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin){
      externalRequests.push(url.href);
      return route.abort();
    }
    if(url.pathname.startsWith('/api/')&&route.request().method()==='POST')
      apiPosts.push(url.pathname);
    return route.continue();
  });
  await page.addInitScript(()=>{
    window.__nativeAudioStarts=0;
    window.__nativeAudioStops=0;
    window.__nativeDecodeBytes=[];
    const NativeAudioContext=window.AudioContext;
    if(!NativeAudioContext)throw new Error('Native Web Audio is unavailable');
    window.AudioContext=class extends NativeAudioContext {
      constructor(...args){
        super(...args);
        window.__trackedAudioContext=this;
      }
      async decodeAudioData(bytes,...args){
        window.__nativeDecodeBytes.push(bytes.byteLength);
        return super.decodeAudioData(bytes,...args);
      }
      createBufferSource(){
        const source=super.createBufferSource();
        const start=source.start.bind(source);
        const stop=source.stop.bind(source);
        source.start=(...args)=>{
          window.__nativeAudioStarts++;
          return start(...args);
        };
        source.stop=(...args)=>{
          window.__nativeAudioStops++;
          return stop(...args);
        };
        return source;
      }
    };
  });
  await mkdir(evidenceDirectory,{recursive:true});
  await page.goto(origin);

  const readState=()=>page.evaluate(()=>{
    let result=null;
    document.dispatchEvent(new CustomEvent('runq:show-state-read',{
      detail:{respond:value=>{result=value;}},
    }));
    return result;
  });
  const readProject=()=>page.evaluate(()=>{
    let result=null;
    document.dispatchEvent(new CustomEvent('runq:agent-read',{
      detail:{respond:value=>{result=value;}},
    }));
    return result?.project??null;
  });
  const clickWorkspace=async name=>{
    const button=page.locator(`[data-workspace-nav="${name}"]`).first();
    await button.scrollIntoViewIfNeeded();
    const hit=await button.evaluate(element=>{
      const rect=element.getBoundingClientRect();
      const x=Math.max(0,Math.min(innerWidth-1,rect.left+rect.width/2));
      const y=Math.max(0,Math.min(innerHeight-1,rect.top+rect.height/2));
      const target=document.elementFromPoint(x,y);
      return {
        receivesPointer:Boolean(target&&element.contains(target)),
        target:target?.outerHTML?.slice(0,240)??null,
        rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
        pointerEvents:getComputedStyle(element).pointerEvents,
        animations:element.getAnimations().map(animation=>animation.playState),
      };
    });
    assert.ok(hit.receivesPointer&&hit.pointerEvents!=='none',
      `${name}: obstructed real click target ${JSON.stringify(hit)}`);
    await button.click();
    await page.waitForFunction(name=>document.querySelector('.shell').dataset.activeWorkspace===name,name);
  };
  const assertNoTransport=async label=>{
    assert.equal(await page.evaluate(()=>window.__nativeAudioStarts),0,`${label}: no cue has started`);
  };

  await page.locator('#homeDemoBtn').click();
  await page.waitForFunction(()=>document.querySelectorAll('#cueList [data-cue-select]').length===3);
  await page.waitForFunction(()=>document.dispatchEvent(new CustomEvent('runq:show-state-read',{
    detail:{respond:value=>{window.__loadedState=value;}},
  }))&&window.__loadedState?.assets?.length===3&&window.__loadedState.assets.every(asset=>asset.ready));
  assert.equal(await page.evaluate(()=>window.__nativeDecodeBytes.length),3,
    'All three local demo assets are decoded by the browser native Web Audio engine');
  assert.ok((await page.evaluate(()=>window.__nativeDecodeBytes)).every(size=>size>44),
    'Decoded assets contain real audio bytes');
  assert.deepEqual((await readState()).assets.map(asset=>asset.ready),[true,true,true]);
  console.log('PASS: demo show loads real local audio through native Web Audio');

  const initialState=await readState();
  const firstCue=initialState.cues[0];
  const secondCue=initialState.cues[1];
  await page.locator(`[data-cue-select="${firstCue.id}"]`).click();
  assert.equal((await readState()).selectedCueId,firstCue.id);
  await assertNoTransport('cue selection');
  await page.locator(`[data-cue-quick-next="${secondCue.id}"]`).click();
  assert.equal((await readState()).preparedCueId,secondCue.id,
    'Set NEXT changes only the prepared cue');
  await assertNoTransport('Set NEXT');
  await page.locator(`[data-cue-quick-next="${firstCue.id}"]`).click();
  assert.equal((await readState()).preparedCueId,firstCue.id);
  console.log('PASS: selecting and changing NEXT never starts playback');

  const pinnedQueueId=(await readState()).preparedCueId;
  await page.locator('#rqContextInspector [data-rq-context-action="pin"]').click();
  await page.locator(`[data-cue-select="${secondCue.id}"]`).click();
  const inspectorText=()=>page.locator('#rqContextInspector').innerText();
  assert.ok((await inspectorText()).includes(secondCue.label),
    'Inspector follows the newly selected cue');
  assert.ok((await inspectorText()).includes(firstCue.label),
    'Pinned task keeps its original cue when selection changes');
  await page.locator('#rqContextInspector [data-rq-context-action="open-task-sound"]').click();
  await page.waitForFunction(({workspace,cueId})=>
    document.querySelector('.shell').dataset.activeWorkspace===workspace&&
    document.querySelector('#rq10TargetCue')?.value===cueId,
  {workspace:'audio',cueId:firstCue.id});
  const contextualSoundPrompt=await page.locator('#soundPrompt').inputValue();
  assert.ok(contextualSoundPrompt.includes(firstCue.label),
    'Sound generation starts with the selected cue as its editable brief');
  assert.ok(contextualSoundPrompt.includes(`script reference ${firstCue.sourceLineIds[0]}`),
    'The editable sound brief carries the original source-line reference');
  assert.match(contextualSoundPrompt,/approximately \d+ seconds/,
    'The editable sound brief includes its estimated duration');
  assert.equal(await page.locator('#sourceLine').inputValue(),firstCue.sourceLineIds[0],
    'Sound generation retains the cue original source-line reference');
  assert.equal(await page.locator('#confirmRequest').isChecked(),false,
    'Opening contextual sound clears generation authorization');
  assert.equal((await readState()).preparedCueId,pinnedQueueId,
    'Opening contextual sound does not alter NEXT');
  await assertNoTransport('opening contextual sound');
  assert.deepEqual(apiPosts,[],'Opening contextual sound does not submit a provider request');
  await clickWorkspace('cues');
  console.log('PASS: contextual audio keeps a pinned cue destination without authorizing generation or changing NEXT');

  await clickWorkspace('script');
  const scriptRow=page.locator('#scriptPreview [data-script-line-id]').first();
  const scriptLineId=await scriptRow.getAttribute('data-script-line-id');
  await scriptRow.click();
  await clickWorkspace('cues');
  assert.ok((await inspectorText()).includes(`Script · ${scriptLineId}`),
    'Selected script line remains the inspector context after navigation');

  await clickWorkspace('audio');
  await page.locator('[data-rq10-sound-tab="library"]').click();
  const audioRow=page.locator('#assetList .asset-list-row').first();
  const audioName=await audioRow.locator('.tag').getAttribute('title');
  await audioRow.locator('.tag').click();
  await clickWorkspace('cues');
  assert.ok((await inspectorText()).includes(audioName),
    'Selected library audio remains the inspector context after navigation');
  assert.equal((await readState()).preparedCueId,pinnedQueueId,
    'Changing script/audio selection leaves NEXT untouched');
  await assertNoTransport('context selection');
  await page.locator(`[data-cue-select="${firstCue.id}"]`).click();

  await clickWorkspace('ai');
  const beforeBatch=await readProject();
  const lineOption=await page.locator('#lineSelect option').first().getAttribute('value');
  assert.ok((await page.locator('#rqShowBuilder [data-context-value="selectedCue"]').textContent())
    .includes(firstCue.label),
  'The Builder context follows the selected cue when returning from another workspace');
  for(const label of ['Context inspector batch A','Context inspector batch B']){
    await page.evaluate(({label,lineId,assetId})=>{
      document.querySelector('#proposalLabel').value=label;
      document.querySelector('#lineSelect').value=lineId;
      document.querySelector('#assetSelect').value=assetId;
      document.querySelector('#proposalForm').dispatchEvent(
        new Event('submit',{bubbles:true,cancelable:true}),
      );
    },{label,lineId:lineOption,assetId:beforeBatch.assets[0].id});
  }
  const afterProposalCreation=await readProject();
  const newProposals=afterProposalCreation.proposals.slice(beforeBatch.proposals.length);
  assert.equal(newProposals.length,2,'Two new proposals are available for explicit batch review');
  const beforeBatchReview=afterProposalCreation;
  await page.locator('#rqShowBuilder .rq16-builder-stage[data-stage="cues"]').click();
  for(const proposal of newProposals)
    await page.locator(`[data-proposal-select="${proposal.id}"]`).check();
  await clickWorkspace('cues');
  assert.ok((await inspectorText()).includes('2 proposals selected'),
    'Inspector summarizes exactly the two selected proposals');
  page.once('dialog',dialog=>dialog.dismiss());
  await page.locator('#rqContextInspector [data-rq-context-action="approve-batch"]').click();
  assert.deepEqual(await readProject(),beforeBatchReview,
    'Cancelling batch confirmation leaves every proposal and cue unchanged');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#rqContextInspector [data-rq-context-action="approve-batch"]').click();
  await page.waitForFunction(ids=>{
    let result=null;
    document.dispatchEvent(new CustomEvent('runq:agent-read',{
      detail:{respond:value=>{result=value;}},
    }));
    return ids.every(id=>result?.project?.proposals.find(item=>item.id===id)?.status==='APPROVED');
  },newProposals.map(proposal=>proposal.id));
  const afterBatch=await readProject();
  assert.equal(afterBatch.cues.length,beforeBatchReview.cues.length+2,
    'Batch approval creates cues only for selected proposals');
  assert.equal(afterBatch.proposals.filter(proposal=>proposal.status==='PENDING').length,
    beforeBatchReview.proposals.filter(proposal=>proposal.status==='PENDING').length-2,
    'Unselected pending proposals remain untouched');
  assert.equal((await readState()).preparedCueId,pinnedQueueId,
    'Batch approval preserves an already prepared NEXT cue');
  await page.locator('#rqContextInspector [data-rq-context-action="undo-batch"]').click();
  assert.deepEqual(await readProject(),beforeBatchReview,
    'Undo restores the exact project snapshot from before batch approval');
  assert.equal((await readState()).preparedCueId,pinnedQueueId,
    'Undo restores the existing NEXT cue');
  await assertNoTransport('proposal batch review and undo');
  console.log('PASS: selected proposal batch is explicit, scoped, undoable and transport-safe');

  await clickWorkspace('ai');
  const disclosure=page.locator('#rqShowBuilderAiHelp');
  if(await disclosure.evaluate(element=>element.open)){
    await page.locator('#rqShowBuilderAiHelp > summary').click();
    assert.equal(await disclosure.getAttribute('open'),null,'Show assistant closes on a real click');
  }
  await page.locator('#rqShowBuilderAiHelp > summary').click();
  assert.equal(await disclosure.getAttribute('open'),'');
  await page.locator('#rqAgentPrompt').fill(
    'Review this show and suggest one safe improvement without applying it.',
  );
  const messageCount=await page.locator('#rqAgentMessages .rq-agent-message').count();
  const providerPostsBefore=apiPosts.length;
  await page.locator('#rqAgentSubmit').click();
  await page.waitForFunction(count=>
    document.querySelectorAll('#rqAgentMessages .rq-agent-message').length>=count+2,messageCount);
  await page.waitForFunction(()=>!document.querySelector('#rqAgentPhase').textContent.includes('Working'));
  assert.equal(apiPosts.length,providerPostsBefore,'Offline assistant consultation makes no API POST');
  assert.deepEqual((await readState()).cues.map(cue=>cue.id),
    initialState.cues.map(cue=>cue.id),'Assistant consultation does not apply or create cues');
  await page.locator('#rqShowBuilderAiHelp > summary').click();
  assert.equal(await disclosure.getAttribute('open'),null,'Show assistant closes on a second real click');
  console.log('PASS: assistant opens, responds offline and closes without applying changes');

  await clickWorkspace('cues');
  await page.locator('button[data-editor-view="inspector"]').click();
  await page.locator('#cuePlaybackForm [name="loop"]').check();
  await page.locator('#cuePlaybackForm button[type="submit"]').click();
  await page.waitForFunction(id=>{
    let result=null;
    document.dispatchEvent(new CustomEvent('runq:agent-read',{
      detail:{respond:value=>{result=value;}},
    }));
    return result?.project?.cues.find(cue=>cue.id===id)?.playback?.loop===true;
  },firstCue.id);
  assert.equal((await readProject()).cues.find(cue=>cue.id===firstCue.id).playback.loop,true,
    'Cue property edit commits to the project');

  await page.locator('#operatorGoBtn').click();
  await page.waitForFunction(()=>window.__nativeAudioStarts>0);
  const firstGoStartCount=await page.evaluate(()=>window.__nativeAudioStarts);
  assert.equal((await readState()).preparedCueId,secondCue.id,
    'GO advances NEXT according to the existing operator queue');
  await clickWorkspace('operation');
  const activeCue=page.locator(`#runqActiveCuesList [data-running-cue="${firstCue.id}"]`);
  await activeCue.waitFor({state:'visible'});
  await activeCue.locator('[data-active-action="stop"]').click();
  await page.waitForFunction(()=>document.querySelector('#runqActiveCuesList .rq5-active-empty'));
  assert.ok(await page.evaluate(()=>window.__nativeAudioStops)>0,'Individual STOP reaches native AudioBufferSourceNode');
  assert.equal((await readState()).preparedCueId,secondCue.id,
    'Individual STOP leaves NEXT untouched');
  console.log('PASS: GO starts a native audio source; individual STOP stops it without changing NEXT');

  await page.locator(`[data-cue-quick-go="${firstCue.id}"]`).click();
  await page.waitForFunction(count=>window.__nativeAudioStarts>count,firstGoStartCount);
  assert.equal((await readState()).preparedCueId,secondCue.id,
    'Direct GO leaves the prepared queue untouched');
  await page.locator('#stopAllBtn').click();
  await page.waitForFunction(()=>document.querySelector('#runqActiveCuesList .rq5-active-empty'));
  assert.equal((await readState()).audioStatus.activeCueCount,0,'STOP ALL stops all running cues');
  assert.equal((await readState()).preparedCueId,secondCue.id,'STOP ALL does not change NEXT');
  console.log('PASS: STOP ALL clears active cues while preserving NEXT');

  await page.locator('#uiLocaleSelect').selectOption('es');
  assert.equal(await page.locator('#uiLocaleSelect').inputValue(),'es');
  await clickWorkspace('ai');
  assert.equal(await page.locator('#rqShowBuilder .rq16-builder-stage-label').first().textContent(),'Proyecto');
  await page.locator('#uiLocaleSelect').selectOption('en');
  assert.equal(await page.locator('#rqShowBuilder .rq16-builder-stage-label').first().textContent(),'Project');

  await clickWorkspace('home');
  const downloaded=page.waitForEvent('download');
  await page.locator('#rq16AppMenu>summary').click();
  await page.locator('#rq16AppMenu .runq-menu>summary').first().click();
  await page.getByRole('button',{name:'Export complete show',exact:true}).click();
  const archive=await downloaded;
  const archivePath=await archive.path();
  assert.ok(archivePath,'A complete ZIP is downloaded from the actual UI');
  assert.equal(await archive.failure(),null);
  assert.equal(await page.locator('#saveState').textContent(),'Saved');

  await page.setViewportSize({width:1920,height:1080});
  await page.screenshot({path:join(evidenceDirectory,'show-1920x1080.png'),animations:'disabled'});
  await page.setViewportSize({width:1366,height:768});
  await page.screenshot({path:join(evidenceDirectory,'show-1366x768.png'),animations:'disabled'});
  await page.setViewportSize({width:900,height:600});
  await page.screenshot({path:join(evidenceDirectory,'show-900x600.png'),animations:'disabled'});

  await page.reload();
  const emptyState=await readState();
  assert.equal(emptyState.cueCount,0,'A normal reload does not silently claim project autosave');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#bundleFileInput').setInputFiles({
    name:archive.suggestedFilename(),
    mimeType:'application/zip',
    buffer:await readFile(archivePath),
  });
  await page.waitForFunction(()=>document.querySelector('#statusMessage')?.textContent?.includes('restored with 3 real audio files'));
  await page.waitForFunction(()=>document.querySelectorAll('#cueList [data-cue-select]').length===3);
  await page.waitForFunction(id=>{
    let result=null;
    document.dispatchEvent(new CustomEvent('runq:agent-read',{
      detail:{respond:value=>{result=value;}},
    }));
    return result?.project?.cues.find(cue=>cue.id===id)?.playback?.loop===true;
  },firstCue.id);
  assert.equal((await readProject()).cues.find(cue=>cue.id===firstCue.id).playback.loop,true,
    'The edited cue property survives ZIP export, reload and import');
  assert.equal(await page.locator('#uiLocaleSelect').inputValue(),'en',
    'The interface locale persists independently of the show archive');
  assert.deepEqual(apiPosts,[],'No AI/provider API submissions were made');
  assert.deepEqual(externalRequests,[],'No external requests were attempted');
  assert.deepEqual(failedRequests,[],'No network requests failed');
  assert.deepEqual(pageErrors,[],'No uncaught JavaScript exceptions');
  assert.deepEqual(consoleErrors,[],'No browser console errors');
  console.log('PASS: ZIP restores the edited project after reload; ES/EN switching and offline checks pass');
  console.log(`Functional evidence: ${evidenceDirectory}`);
} catch(error) {
  if(page){
    try {
      await mkdir(evidenceDirectory,{recursive:true});
      await page.screenshot({path:join(evidenceDirectory,'failure.png'),animations:'disabled'});
    } catch(screenshotError) {
      console.error('Unable to capture failure screenshot:',screenshotError);
    }
  }
  throw error;
} finally {
  try {
    if(browser)await browser.close();
  } finally {
    if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}
