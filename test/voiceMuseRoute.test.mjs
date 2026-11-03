import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../tools/dev-server.mjs';
import {convertToMuseWav} from '../tools/voiceTranscribeRoutes.mjs';

function makeWav(rate=48000,seconds=1){
 const samples=Math.round(rate*seconds),b=Buffer.alloc(44+samples*2);
 b.write('RIFF',0);b.writeUInt32LE(36+samples*2,4);b.write('WAVEfmt ',8);
 b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
 b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(samples*2,40);
 return b;
}
async function withServer(options,fn){
 const server=createAppServer(options);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{return await fn('http://127.0.0.1:'+server.address().port);}
 finally{await new Promise(resolve=>server.close(resolve));}
}
function post(base,audio=makeWav(),headers={}){
 return fetch(base+'/api/voice/transcribe',{method:'POST',headers:{
  'Content-Type':'audio/wav','X-RunQ-Voice-Consent':'yes','X-RunQ-Voice-Language':'es',...headers
 },body:audio});
}
test('16-bit mono at 48k is converted to Muse 16k WAV, with 10 sec cap',()=>{
 const out=convertToMuseWav(makeWav());
 assert.equal(out.readUInt32LE(24),16000);
 assert.equal(out.readUInt16LE(22),1);
 assert.equal(out.readUInt32LE(40),32000);
 assert.throws(()=>convertToMuseWav(makeWav(48000,11)),/INVALID_DURATION/);
 assert.throws(()=>convertToMuseWav(Buffer.from('corrupt')),/INVALID_WAV/);
});
test('missing consent or credentials never calls Meta',async()=>{
 let calls=0;
 await withServer({getVoiceKey:()=>'',voiceFetch:async()=>{calls++;throw Error('should not run');}},async base=>{
  assert.equal((await post(base,makeWav(),{'X-RunQ-Voice-Consent':'no'})).status,403);
  assert.equal((await post(base)).status,503);
 });
 assert.equal(calls,0);
});
test('ES/EN/mixed and one authorized mock Muse request, server does not expose secret',async()=>{
 const captured=[];
 await withServer({getVoiceKey:()=> 'test-private-key',voiceFetch:async(url,options)=>{
  captured.push({url,auth:options.headers.Authorization,form:options.body});
  return {ok:true,json:async()=>({transcript:captured.length===1?'Escuchad la tormenta':'Listen to the storm',audioDurationMs:1000,sessionId:'test'})};
 }},async base=>{
  for(const [language,expected] of [
   ['es','Escuchad la tormenta'],['en','Listen to the storm'],['mixed','Listen to the storm'],
  ]){
   const res=await post(base,makeWav(),{'X-RunQ-Voice-Language':language});
   assert.equal(res.status,200);
   const data=await res.json();
   assert.equal(data.transcript,expected);
   assert.equal(data.language,language);
   assert.ok(!JSON.stringify(data).includes('private-key'));
  }
  assert.equal((await post(base,makeWav(),{'X-RunQ-Voice-Language':'xx'})).status,400);
 });
 assert.equal(captured.length,3);
 for(const request of captured){
  assert.equal(request.url,'https://api.meta.ai/v1/asr/transcribe');
  assert.equal(request.auth,'Bearer test-private-key');
  const settings=JSON.parse(await request.form.get('request').text());
  assert.equal(settings.model,'muse-voice-transcribe-1.0');
  assert.equal(settings.mode,'PUSH_TO_TALK');
  assert.ok(
   JSON.stringify(settings.languageBias)==='["Spanish"]'||
   JSON.stringify(settings.languageBias)==='["English"]'||
   JSON.stringify(settings.languageBias)==='["Spanish","English"]',
  );
  const sound=Buffer.from(await request.form.get('audio').arrayBuffer());
  assert.equal(sound.readUInt32LE(24),16000);
 }
});
test('upstream failure is safe; no automatic retry',async()=>{
 let calls=0;
 await withServer({getVoiceKey:()=> 'key',voiceFetch:async()=>{calls++;return {ok:false,status:429};}},async base=>{
  const response=await post(base);
  assert.equal(response.status,502);
  assert.equal((await response.json()).error,'META_TRANSCRIPTION_FAILED');
 });
 assert.equal(calls,1);
});
