import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createAppServer} from './dev-server.mjs';
import {importPortableShow} from '../src/core/showArchive.mjs';

// Original synthetic mono PCM, decoded by the real browser audio engine.
function wav(frequency=220){
  const samples=44100*5,buffer=Buffer.alloc(44+samples*2);
  buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);
  buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);
  buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);
  buffer.writeUInt32LE(44100,24);buffer.writeUInt32LE(88200,28);
  buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);
  buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);
  for(let index=0;index<samples;index++)
    buffer.writeInt16LE(Math.round(1500*Math.sin(2*Math.PI*frequency*index/44100)),44+index*2);
  return buffer;
}
const source=wav(),otherSource=wav(440);
const server=createAppServer();
await new Promise((resolve,reject)=>{
  server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
});
let browser;
const errors=[],forbiddenRequests=[];
try{
  const port=server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const locale of ['en','es']){
    for(const workspace of ['cues','rehearsal','operation']){
      const page=await browser.newPage();
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.hostname!=='127.0.0.1'||url.port!==String(port)||
           (url.pathname.startsWith('/api/')&&request.method()!=='GET')){
          forbiddenRequests.push(url.pathname);return route.abort();
        }
        return route.continue();
      });
      await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
      await page.locator('#uiLocaleSelect').selectOption(locale);
      await page.locator('#scriptFileInput').setInputFiles({
        name:'original.txt',mimeType:'text/plain',buffer:Buffer.from('Original source text'),
      });
      await page.locator('[data-workspace-nav="audio"]').click();
      await page.locator('#audioBatchFilesInput').setInputFiles({
        name:'existing.wav',mimeType:'audio/wav',buffer:source,
      });
      const read=()=>page.evaluate(()=>{
        let state;
        document.dispatchEvent(new CustomEvent('runq:show-state-read',{
          detail:{respond:value=>{state=value;}},
        }));
        return state;
      });
      await page.waitForFunction(()=>document.querySelector('#audioBatchStatus')
        ?.textContent.includes('1'));
      await page.waitForFunction(()=>{
        let state;document.dispatchEvent(new CustomEvent('runq:show-state-read',{
          detail:{respond:value=>{state=value;}},
        }));
        return state.assets.length===1&&state.assets[0].ready;
      });
      assert.equal((await read()).cueCount,0,'Sound library still only imports resources');
      await page.locator(`[data-workspace-nav="${workspace}"]`).click();
      const hint=page.locator('#cueAudioDropHint');
      assert.ok(await hint.isVisible(),'Audio drop instructions must be visible in every cue workspace');
      assert.match(await hint.textContent(),/Windows/);
      assert.equal(await hint.evaluate(element=>element.closest('.rq5-sequence-frame')!==null),true);
      for(const viewport of [{width:1366,height:768},{width:1024,height:640}]){
        await page.setViewportSize(viewport);
        if(viewport.height<700)await hint.scrollIntoViewIfNeeded();
        const bounds=await hint.boundingBox();
        assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&
          bounds.x+bounds.width<=viewport.width&&bounds.y+bounds.height<=viewport.height,
        `Drop instructions outside viewport: ${workspace} ${JSON.stringify(viewport)} ${JSON.stringify(bounds)}`);
      }
      await page.setViewportSize({width:1366,height:768});
      await page.locator('#cueList').evaluate(target=>{
        const transfer=new DataTransfer();
        transfer.items.add(new File(['synthetic'],'hover.wav',{type:'audio/wav'}));
        target.dispatchEvent(new DragEvent('dragover',{dataTransfer:transfer,bubbles:true,cancelable:true}));
      });
      assert.equal(await hint.evaluate(element=>element.classList.contains('is-file-drag')),true);
      await page.locator('#rqMain').evaluate(target=>target.dispatchEvent(new DragEvent('dragleave',{
        bubbles:true,cancelable:true,relatedTarget:null,
      })));
      assert.equal(await hint.evaluate(element=>element.classList.contains('is-file-drag')),false);
      const drop=async(files,selector='#rqMain')=>{
        await page.locator(selector).evaluate((target,entries)=>{
          const transfer=new DataTransfer();
          for(const entry of entries)transfer.items.add(new File(
            [Uint8Array.from(entry.bytes)],entry.name,{type:entry.type??'audio/wav'}));
          target.dispatchEvent(new DragEvent('dragover',{
            dataTransfer:transfer,bubbles:true,cancelable:true,
          }));
          target.dispatchEvent(new DragEvent('drop',{
            dataTransfer:transfer,bubbles:true,cancelable:true,
          }));
        },files.map(file=>({...file,bytes:Array.from(file.bytes)})));
      };
      const waitCount=expected=>page.waitForFunction(count=>{
        let state;document.dispatchEvent(new CustomEvent('runq:show-state-read',{
          detail:{respond:value=>{state=value;}},
        }));
        return state.cueCount===count;
      },expected);
      await drop([{name:'existing.wav',bytes:otherSource}],'#cueList');
      await waitCount(1);
      assert.equal(await hint.evaluate(element=>element.classList.contains('is-file-drag')),false);
      const first=await read();
      assert.equal(first.preparedCueId,first.cues[0].id);
      assert.equal(first.audioStatus.activeCueCount,0);
      assert.equal(first.assets.length,2,'Matching names never overwrite library originals');
      const files=Array.from({length:20},(_,index)=>({
        name:`Track ${index+1}.wav`,bytes:source,
      }));
      await drop([...files,{name:'notes.txt',bytes:Buffer.from('not audio'),type:'text/plain'},
        {name:'broken.wav',bytes:Buffer.from('corrupt audio')}]);
      await page.waitForFunction(()=>{
        const text=document.querySelector('#cueAudioDropStatus')?.textContent??'';
        return /20/.test(text)&&/2/.test(text)&&/broken.wav/.test(text);
      });
      const batch=await read();
      assert.equal(batch.cueCount,21);
      assert.equal(batch.preparedCueId,first.preparedCueId);
      assert.equal(batch.selectedCueId,first.selectedCueId);
      assert.equal(batch.scriptText,'Original source text');
      assert.deepEqual(batch.cues.slice(1).map(cue=>cue.label),files.map(file=>file.name));
      assert.ok(batch.cues.every(cue=>cue.sourceLineIds.length===0));
      assert.equal(batch.audioStatus.activeCueCount,0);
      assert.equal(batch.audioStatus.pendingGoCount,0);
      assert.equal(batch.audioStatus.auditionActive,false);
      assert.ok(await page.locator('#cueAudioDropStatus').isVisible());

      const downloadPromise=page.waitForEvent('download',{timeout:10000});
      await page.locator('#saveBundleBtn').evaluate(button=>button.click());
      const download=await downloadPromise.catch(async error=>{
        throw new Error(`${error.message}; UI: ${await page.locator('#statusMessage').textContent()}`);
      });
      const archive=await importPortableShow(new Uint8Array(await readFile(await download.path())));
      assert.equal(archive.project.cues.length,21);
      archive.project.cues.forEach(cue=>{
        assert.equal(cue.origin,'MANUAL');
        assert.equal(cue.status,'DRAFT');
        assert.equal(cue.actions.length,1);
        assert.equal(cue.actions[0].type,'PLAY');
        assert.ok(archive.project.assets.some(asset=>asset.id===cue.actions[0].assetId));
        assert.equal(cue.automation,undefined);
      });
      assert.equal(new Set(archive.project.cues.map(cue=>cue.actions[0].assetId)).size,21);
      assert.equal(archive.audioFiles.length,22);
      assert.deepEqual(Buffer.from(archive.audioFiles.find(file=>file.assetId===first.assets[0].id).bytes),source);
      assert.deepEqual(Buffer.from(archive.audioFiles.find(file=>file.assetId===first.assets[1].id).bytes),otherSource);

      await page.locator('#operatorGoBtn').click();
      await page.waitForFunction(()=>{
        let state;document.dispatchEvent(new CustomEvent('runq:show-state-read',{
          detail:{respond:value=>{state=value;}},
        }));
        return state.audioStatus.activeCueCount===1;
      });
      const running=await read();
      const startsBeforeBlockedDrop=await page.evaluate(()=>window.audioStarts??0);
      await drop([{name:'must-not-play.wav',bytes:source}]);
      const blocked=await read();
      assert.equal(blocked.cueCount,21);
      assert.equal(blocked.preparedCueId,running.preparedCueId);
      assert.ok(blocked.active.every(cue=>running.active.some(active=>active.cueId===cue.cueId)),
        'A naturally completed short fixture may disappear, but drop cannot start a different cue');
      assert.equal(await page.evaluate(()=>window.audioStarts??0),startsBeforeBlockedDrop,
        'Dropping audio while transport is busy never starts playback');
      assert.match(await page.locator('#cueAudioDropStatus').textContent(),
        locale==='es'?/Detén/:/Stop playback/);
      await page.locator('#stopAllBtn').click();
      let completed=await read();
      while(completed.preparedCueId){
        await page.locator('#operatorSkipBtn').click();
        completed=await read();
      }
      assert.equal(completed.audioStatus.activeCueCount,0);
      await drop([{name:'after-finished-queue.wav',bytes:source}]);
      await waitCount(22);
      const afterFinishedQueue=await read();
      assert.equal(afterFinishedQueue.preparedCueId,afterFinishedQueue.cues.at(-1).id,
        'Audio dropped after the sequence ends is prepared as the new NEXT cue');
      assert.equal(afterFinishedQueue.audioStatus.activeCueCount,0,'Preparing the new NEXT cue never starts playback');
      assert.equal(afterFinishedQueue.audioStatus.pendingGoCount,0,'Preparing the new NEXT cue never schedules GO');
      await page.close();
      console.log(`PASS ${locale} ${workspace}: visible hint, drag feedback, single + 20 files, NEXT, ZIP, busy GO`);
    }
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(forbiddenRequests,[]);
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
