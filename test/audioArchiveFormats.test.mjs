import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveKind,describeArchiveIssue,extractAudioArchive} from '../src/core/audioArchiveFormats.mjs';
const mk=(magic,name)=>new File([new Uint8Array([...magic,0,0,0,0])],name);
const sig={zip:[80,75,3,4],rar4:[82,97,114,33,26,7,0],
  rar5:[82,97,114,33,26,7,1,0],seven:[55,122,188,175,39,28]};
test('reads binary signatures, regardless of filename or Windows filter',()=>{
  assert.equal(archiveKind(new Uint8Array(sig.zip)),'zip');
  assert.equal(archiveKind(new Uint8Array(sig.rar4)),'rar');
  assert.equal(archiveKind(new Uint8Array(sig.rar5)),'rar');
  assert.equal(archiveKind(new Uint8Array(sig.seven)),'7z');
  assert.equal(archiveKind(new Uint8Array([1,2,3,4])),null);
});
test('rejects incorrect extensions and invalid archive bytes with clear Spanish diagnosis',async()=>{
  const wrong=mk([1,2,3,4,5,6,7],'Music.zip');
  await assert.rejects(extractAudioArchive(wrong),/no tiene una cabecera válida ZIP, RAR o 7z/);
  await assert.rejects(extractAudioArchive(mk(sig.rar5,'Music.exe')),/selecciona un archivo/);
  assert.equal(describeArchiveIssue(mk(sig.rar5,'Music.rar'),new Uint8Array(sig.rar5)),null);
  await assert.rejects(extractAudioArchive(
    {name:'huge.7z',size:70_000_000,arrayBuffer:async()=>new ArrayBuffer(1)}),/máximo provisional es 64 MB/);
});
test('RAR and 7z are offered as local files; never uploads or links cues',async()=>{
  for(const [signature,name] of [[sig.rar4,'sounds.rar'],[sig.rar5,'sfx.rar'],[sig.seven,'cues.7z']]){
    let closed=false;
    const out=await extractAudioArchive(mk(signature,name),{openArchive:async()=>({
      async hasEncryptedData(){return false},
      async getFilesArray(){return [
        {path:'Acto 1/',file:{name:'golpe.wav',size:4,
          extract:async()=>new File(['RIFF'],'golpe.wav')}},
        {path:'Acto 2/',file:{name:'golpe.wav',size:4,
          extract:async()=>new File(['DIFF'],'golpe.wav')}},
        {path:'Docs/',file:{name:'readme.txt',size:3,
          extract:async()=>new File(['TXT'],'readme.txt')}},
      ]},
      async close(){closed=true},
    })});
    assert.equal(out.format,name.endsWith('.7z')?'7z':'rar');
    assert.deepEqual(out.files.map(f=>f.name),['golpe.wav']);
    assert.equal(await out.files[0].text(),'RIFF');
    assert.equal(out.skipped.length,2);
    assert.equal(closed,true);
  }
});
test('libarchive listing rejects traversal, encryption and bounded per-entry size',async()=>{
  const file=mk(sig.rar5,'bad.rar');
  await assert.rejects(extractAudioArchive(file,{openArchive:async()=>({
    async hasEncryptedData(){return true},
    async close(){},
  })}),/protegido con contraseña/);
  await assert.rejects(extractAudioArchive(file,{openArchive:async()=>({
    async hasEncryptedData(){return false},
    async getFilesArray(){return [{path:'../',file:{name:'evil.wav',size:4}}]},
    async close(){},
  })}),/ruta insegura/);
  const out=await extractAudioArchive(file,{openArchive:async()=>({
    async hasEncryptedData(){return false},
    async getFilesArray(){return [{path:'',file:{name:'large.wav',size:40_000_000,
      extract:()=>{throw Error('must not extract oversized entry')}}}]},
    async close(){},
  })});
  assert.equal(out.files.length,0);
  assert.equal(out.skipped.length,1);
});
