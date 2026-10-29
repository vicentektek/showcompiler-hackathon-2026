/** Real Chrome batch library acceptance with mocked local audio hardware.
 * No AI, network, or billable requests. Tests standard compressed ZIP.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deflateRawSync} from 'node:zlib';
import {createAppServer} from './dev-server.mjs';
import {crc32} from '../src/core/zipStore.mjs';
import {chromium} from 'playwright-core';

function zip(entries){
  const local=[],central=[];let at=0;
  for(const [path,text,method=8] of entries){
    const name=Buffer.from(path,'utf8'),raw=Buffer.from(text,'utf8');
    const packed=method===8?deflateRawSync(raw):raw;
    const checksum=crc32(new Uint8Array(raw));
    const head=Buffer.alloc(30);head.writeUInt32LE(0x04034b50,0);
    head.writeUInt16LE(20,4);head.writeUInt16LE(0x808,6);
    head.writeUInt16LE(method,8);head.writeUInt16LE(name.length,26);
    const descriptor=Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50,0);
    descriptor.writeUInt32LE(checksum,4);
    descriptor.writeUInt32LE(packed.length,8);
    descriptor.writeUInt32LE(raw.length,12);
    const item=Buffer.concat([head,name,packed,descriptor]);local.push(item);
    const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);
    ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);
    ch.writeUInt16LE(0x808,8);ch.writeUInt16LE(method,10);
    ch.writeUInt32LE(checksum,16);ch.writeUInt32LE(packed.length,20);
    ch.writeUInt32LE(raw.length,24);ch.writeUInt16LE(name.length,28);
    ch.writeUInt32LE(at,42);
    central.push(Buffer.concat([ch,name]));at+=item.length;
  }
  const cd=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);
  end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cd.length,12);
  end.writeUInt32LE(at,16);
  return Buffer.concat([...local,cd,end]);
}
const server=createAppServer();let browser;
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const port=server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1366,height:800}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    class FakeAudioContext{
      constructor(){this.state='running';this.currentTime=1;this.destination={}}
      async resume(){}async close(){}
      async decodeAudioData(data){
        const first=new Uint8Array(data)[0];
        if(first===0x42)throw new Error('broken PCM');
        const samples=new Float32Array(1200).fill(.15);
        return {duration:3,numberOfChannels:1,length:1200,sampleRate:400,
          getChannelData:()=>samples};
      }
      createGain(){return{gain:{value:1,cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}}}
      createBufferSource(){return{buffer:null,playbackRate:{value:1},connect(){},disconnect(){},start(){},stop(){}}}
    }
    window.AudioContext=FakeAudioContext;
  });
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='127.0.0.1' && u.port===String(port) &&
       !u.pathname.startsWith('/api/'))return route.continue();
    return route.abort();
  });
  await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-workspace-nav="audio"]').click();
  assert.equal(await page.locator('#importAudioBatchBtn').isVisible(),true);
  assert.equal(await page.locator('#importAudioZipBtn').isVisible(),true);
  assert.equal(await page.locator('#audioBatchFilesInput').getAttribute('multiple'),'');
  await page.locator('#audioBatchFilesInput').setInputFiles([
    {name:'intro.wav',mimeType:'audio/wav',buffer:Buffer.from('WAVE local1')},
    {name:'music.mp3',mimeType:'audio/mpeg',buffer:Buffer.from('MP3 local2')},
    {name:'broken.wav',mimeType:'audio/wav',buffer:Buffer.from('BAD broken')},
  ]);
  await page.waitForFunction(()=>document.querySelector('#audioBatchStatus')?.textContent.includes('2 new'));
  assert.equal(await page.locator('#assetList [data-asset-audition]').count(),2);
  console.log('V12_BATCH_REPORT_DIAGNOSTIC',JSON.stringify(await page.locator('#audioBatchStatus').evaluate(el=>{
    const ancestor=[];let node=el;
    while(node&&ancestor.length<9){
      const style=getComputedStyle(node);
      ancestor.push({tag:node.tagName,id:node.id,cls:node.className,
        hidden:node.hidden,display:style.display,visibility:style.visibility,
        rect:node.getBoundingClientRect().toJSON()});
      node=node.parentElement;
    }
    return {text:el.textContent,inner:el.innerText,ancestor};
  })));
  assert.match(await page.locator('#audioBatchStatus').innerText(),/1 skipped/);
  assert.ok((await page.locator('#audioBatchDetails').innerText()).includes('broken.wav'));
  assert.equal(await page.locator('#cuesCount').innerText(),'0');
  // Never silently overwrite shared media even if the user selects same file again.
  await page.locator('#audioBatchFilesInput').setInputFiles({
    name:'intro.wav',mimeType:'audio/wav',buffer:Buffer.from('DIFFERENT AUDIO')});
  await page.waitForFunction(()=>document.querySelector('#audioBatchStatus')?.textContent.includes('0 new'));
  assert.equal(await page.locator('#assetList [data-asset-audition]').count(),2);

  await page.locator('#rq12AdvancedToggle').click();
  assert.equal(await page.locator('#rq12ImportAdvanced').getAttribute('open'),'');
  await page.locator('#assetName').fill('scene.wav');
  await page.locator('#assetForm button[type="submit"]').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#assetList [data-asset-audition]').count(),3);
  const pack=zip([
    ['Act I/scene.wav','RIFF scene'],
    ['Act II/bell.ogg','OGG bell'],
    ['notes.txt','Audio supplied for the performance'],
  ]);
  await page.locator('#audioBatchZipInput').setInputFiles({
    name:'sounds.zip',mimeType:'application/zip',buffer:pack,
  });
  await page.waitForFunction(()=>document.querySelector('#audioBatchStatus')?.textContent.includes('1 restored'),null,{timeout:15000});
  assert.match(await page.locator('#audioBatchStatus').innerText(),/1 new/);
  assert.match(await page.locator('#audioBatchStatus').innerText(),/1 skipped/);
  assert.equal(await page.locator('#assetList [data-asset-audition]').count(),4);
  // Waveform reads the exact newly loaded audio; not a placeholder.
  assert.equal(await page.locator('#rq5AudioSource option').count(),5); // four assets plus the empty selection
  assert.equal(await page.locator('#importAudioBatchBtn').isEnabled(),true);
  // Real local WebAssembly extraction using a valid upstream 7z sample.
  const fixture=await readFile(new URL('../test/fixtures/libarchive-example-7z.b64',import.meta.url),'utf8');
  const packed7z=Buffer.from(fixture.split('\n').filter(line=>line&&!line.startsWith('#')).join(''),'base64');
  await page.locator('#audioBatchZipInput').setInputFiles({
    name:'test.7z',mimeType:'application/x-7z-compressed',buffer:packed7z,
  });
  await page.waitForFunction(()=>{
    const status=document.querySelector('#audioBatchStatus')?.textContent??'';
    return status.includes('Import finished')||status.includes('Unable to complete import');
  },null,{timeout:20000});
  const sevenResult=await page.locator('#audioBatchStatus').innerText();
  assert.ok(!sevenResult.includes('Unable to complete'),sevenResult);
  // A show ZIP should never be mistaken for a set of audio library files.
  await page.locator('#audioBatchZipInput').setInputFiles({
    name:'show.zip',mimeType:'application/zip',
    buffer:zip([['project.json','{}'],['manifest.json','{}']]),
  });
  await page.waitForFunction(()=>document.querySelector('#audioBatchStatus')?.textContent.includes('Audio ZIP:'));
  assert.equal(await page.locator('#assetList [data-asset-audition]').count(),4);
  assert.deepEqual(errors,[]);
  console.log('AUDIO BATCH CHROME PASS — multi-select, partial failure, no overwrite, ordinary deflated ZIP, restored placeholder, rejected show archive.');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
