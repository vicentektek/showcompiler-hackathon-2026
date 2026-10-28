import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {crc32} from '../src/core/zipStore.mjs';
import {extractAudioZip,planAudioLibraryBatch,MAX_AUDIO_BATCH_FILES} from '../src/core/audioBatchImport.mjs';

// Standard ZIP fixture writer independent from the production ZIP reader.
// Supports normal STORE and DEFLATE and optionally ZIP data descriptors.
function makeZip(entries,{comment=''}={}){
  const local=[],central=[];let offset=0;
  for(const item of entries){
    const name=Buffer.from(item.name,'utf8');
    const raw=Buffer.from(item.data??'abc');
    const method=item.method??8,descriptor=item.descriptor??true;
    const compressed=method===8?deflateRawSync(raw):raw;
    const flags=0x0800|(descriptor?8:0);
    const checksum=crc32(new Uint8Array(raw));
    const header=Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);
    header.writeUInt16LE(flags,6);header.writeUInt16LE(method,8);
    if(!descriptor){
      header.writeUInt32LE(checksum,14);header.writeUInt32LE(compressed.length,18);
      header.writeUInt32LE(raw.length,22);
    }
    header.writeUInt16LE(name.length,26);
    const desc=descriptor?Buffer.alloc(16):Buffer.alloc(0);
    if(descriptor){
      desc.writeUInt32LE(0x08074b50,0);desc.writeUInt32LE(checksum,4);
      desc.writeUInt32LE(compressed.length,8);desc.writeUInt32LE(raw.length,12);
    }
    const part=Buffer.concat([header,name,compressed,desc]);local.push(part);
    const c=Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);
    c.writeUInt16LE(flags,8);c.writeUInt16LE(method,10);
    c.writeUInt32LE(checksum,16);c.writeUInt32LE(compressed.length,20);
    c.writeUInt32LE(raw.length,24);c.writeUInt16LE(name.length,28);
    c.writeUInt32LE(offset,42);
    central.push(Buffer.concat([c,name]));
    offset+=part.length;
  }
  const dir=Buffer.concat(central);
  const tail=Buffer.alloc(22+Buffer.byteLength(comment,'utf8'));
  tail.writeUInt32LE(0x06054b50,0);
  tail.writeUInt16LE(entries.length,8);tail.writeUInt16LE(entries.length,10);
  tail.writeUInt32LE(dir.length,12);tail.writeUInt32LE(offset,16);
  tail.writeUInt16LE(tail.length-22,20);
  tail.write(comment,22);
  return new Uint8Array(Buffer.concat([...local,dir,tail]));
}
const file=(name,data='sample data')=>new File([data],name);
test('normal Windows-style deflated ZIP extracts audio from folders and ignores unrelated docs',async()=>{
  const zip=makeZip([
    {name:'Acto I/'},{name:'Acto I/01 Ambiente.wav',data:'WAVE content'},
    {name:'Acto I/02 Música.mp3',data:'MP3 content'},
    {name:'Mac/__MACOSX/'},{name:'Mac/__MACOSX/.DS_Store'},
    {name:'carpeta/instrucciones.txt'},
  ],{comment:'Audio sources'});
  const result=await extractAudioZip(zip);
  assert.deepEqual(result.files.map(x=>x.name),['01 Ambiente.wav','02 Música.mp3']);
  assert.equal(await result.files[0].text(),'WAVE content');
  assert.ok(result.skipped.some(x=>x.name.includes('instrucciones.txt')));
});
test('uncompressed STORE ZIP and bare files work (no RunQ project metadata)',async()=>{
  const archive=makeZip([{name:'intro.wav',method:0,descriptor:false,data:'RIFF fake'}]);
  const result=await extractAudioZip(archive);
  assert.deepEqual(result.files.map(f=>f.name),['intro.wav']);
  assert.equal(await result.files[0].text(),'RIFF fake');
});
test('archive traversal, hidden bytes, repeated paths and spoofed show package are rejected',async()=>{
  for(const names of [
    ['../outside.wav'],['folder/../../evil.wav'],['/root.wav'],
    ['folder\\evil.wav'],['music.wav','music.wav'],
    ['project.json','manifest.json','audio/file.wav'],
  ]){
    await assert.rejects(extractAudioZip(makeZip(names.map(name=>({name})))),/Audio ZIP:/);
  }
  const good=makeZip([{name:'sound.wav'}]);
  const corrupted=good.slice();corrupted[corrupted.length-24]^=1;
  await assert.rejects(extractAudioZip(corrupted),/Audio ZIP:/);
});
test('CRC corruption skips affected audio but imports healthy neighbors',async()=>{
  const archive=makeZip([
    {name:'bad.wav',method:0,descriptor:false,data:'BAD audio bytes'},
    {name:'ok.wav',method:0,descriptor:false,data:'GOOD audio bytes'},
  ]);
  // Alter one byte in first local source without fixing checksum.
  const pos=30+Buffer.byteLength('bad.wav');archive[pos]^=4;
  const result=await extractAudioZip(archive);
  assert.deepEqual(result.files.map(x=>x.name),['ok.wav']);
  assert.match(result.skipped[0].reason,/CRC/);
});
test('duplicate names across folders never overwrite each other in a ZIP',async()=>{
  const archive=makeZip([
    {name:'scenes/intro.wav',data:'sound a'},
    {name:'scenes-two/intro.wav',data:'sound b'},
  ]);
  const result=await extractAudioZip(archive);
  assert.equal(result.files.length,1);
  assert.equal(await result.files[0].text(),'sound a');
  assert.match(result.skipped[0].reason,/same filename/);
});
test('plain multi-selection reuses unloaded placeholders, skips loaded and repeats',()=>{
  const files=[file('intro.wav'),file('missing.mp3'),file('INTRO.WAV'),file('bad.exe')];
  const assets=[{id:'asset-1',name:'intro.wav'},{id:'asset-2',name:'missing.mp3'}];
  const result=planAudioLibraryBatch(files,assets,id=>id==='asset-1');
  assert.deepEqual(result.accepted.map(x=>[x.file.name,x.assetId,x.kind]),
    [['missing.mp3','asset-2','restore']]);
  assert.equal(result.skipped.length,3);
  assert.ok(result.skipped.some(x=>/already loaded/.test(x.reason)));
});
test('selection creates new refs without silently replacing shared decoded media',()=>{
  const r=planAudioLibraryBatch([file('bell.wav'),file('bell.wav'),file('room.wav')],
    [{id:'asset-1',name:'bell.wav'}],id=>id==='asset-1');
  assert.deepEqual(r.accepted.map(x=>x.file.name),['room.wav']);
  assert.equal(r.skipped.length,2);
  assert.equal(MAX_AUDIO_BATCH_FILES,100);
});
