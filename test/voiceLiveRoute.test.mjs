import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLivePcmEncoder} from '../src/core/livePcm.mjs';
import {createAppServer} from '../tools/dev-server.mjs';

function transport(){
 const messages=[];
 class FakeMuseSocket extends EventTarget {
  static latest=null;
  readyState=0;bufferedAmount=0;
  constructor(url){
   super();assert.equal(url,'wss://api.meta.ai/v1/asr/realtime');
   FakeMuseSocket.latest=this;
   queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});
  }
  send(data){
   messages.push(data);
   if(typeof data==='string'){
    const info=JSON.parse(data);
    if(info.authorization){
     assert.equal(info.authorization.accessToken,'Bearer mock-key');
     assert.equal(info.model,'muse-voice-transcribe-1.0');
     assert.equal(info.mode,'ENDPOINTING');
     assert.equal(info.audioEncoding,'PCM_16KHZ');
     queueMicrotask(()=>this.deliver({sessionId:'mock-session'}));
    }
    if(info.type==='endStream'){
     queueMicrotask(()=>{this.deliver({type:'speechComplete',turnId:1,transcript:'Listen to the storm.'});this.close();});
    }
   }
  }
  deliver(data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(data)}));}
  close(){if(this.readyState===3)return;this.readyState=3;this.dispatchEvent(new Event('close'));}
 }
 return {WebSocketCtor:FakeMuseSocket,messages};
}
async function withServer(fn){
 const upstream=transport(),server=createAppServer({getVoiceKey:()=> 'mock-key',voiceWebSocket:upstream.WebSocketCtor,
  voiceCampaignProhibited:false});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await fn('http://127.0.0.1:'+server.address().port,upstream);}
 finally{upstream.WebSocketCtor.latest?.close();await new Promise(resolve=>server.close(resolve));}
}
async function api(base,action,{session='',body,lang='en',consent=true}={}){
 const start=action==='start',poll=action==='poll',method=poll?'GET':'POST';
 const res=await fetch(base+'/api/voice/live/'+action,{method,
  headers:{...(session?{'X-RunQ-Voice-Session':session}:{}),
   ...(start?{'Content-Type':'application/json','X-RunQ-Voice-Consent':consent?'yes':'no'}:{}),
   ...(action==='chunk'?{'Content-Type':'application/octet-stream'}:{})},
  body:start?JSON.stringify({language:lang}):body,
 });
 return {status:res.status,body:await res.json()};
}
test('PCM encoder is stable across browser sample rates and render buffer boundaries',()=>{
 for(const rate of [44100,48000,96000]){
  const encoder=makeLivePcmEncoder(rate);
  let frames=[],received=0;
  for(let done=0;done<rate;done+=4096){
   const samples=new Float32Array(Math.min(4096,rate-done));
   samples.fill(0.5);
   frames.push(...encoder.push(samples));received+=samples.length;
  }
  assert.equal(encoder.processedInputSamples,received);
  assert.equal(frames.length,6);
  assert.ok(encoder.bufferedSamples>=630&&encoder.bufferedSamples<=650);
  for(const f of frames){
   assert.equal(f.byteLength,5120);
   const view=new DataView(f);
   for(let i=0;i<f.byteLength;i+=2)assert.ok(Math.abs(view.getInt16(i,true)-16384)<=1);
  }
 }
});
test('unauthorized realtime requests cannot open a Muse socket',async()=>{
 await withServer(async(base,upstream)=>{
  const bad=await api(base,'start',{consent:false});
  assert.equal(bad.status,403);
  assert.equal(upstream.WebSocketCtor.latest,null);
  const wrongLang=await api(base,'start',{lang:'fr'});
  assert.equal(wrongLang.status,400);
  assert.equal(upstream.WebSocketCtor.latest,null);
 });
});
test('malformed or cross-origin browser requests cannot open upstream sessions',async()=>{
 await withServer(async(base,upstream)=>{
  for(const origin of ['https://evil.example','this-is-not-a-url']){
   const res=await fetch(base+'/api/voice/live/start',{method:'POST',
    headers:{Origin:origin,'X-RunQ-Voice-Consent':'yes','Content-Type':'application/json'},
    body:JSON.stringify({language:'es'})});
   assert.equal(res.status,403);
  }
  assert.equal(upstream.WebSocketCtor.latest,null);
 });
});
test('one bilingual live session, simulated event delivery, bounded PCM, explicit endStream',async()=>{
 await withServer(async(base,upstream)=>{
  const start=await api(base,'start',{lang:'mixed'});
  assert.equal(start.status,200);
  assert.equal(start.body.maximumSeconds,180);
  const id=start.body.session;
  assert.ok(typeof id==='string'&&id.length>20);
  assert.deepEqual(JSON.parse(upstream.messages[0]).languageBias,['Spanish','English']);
  assert.equal((await api(base,'start',{lang:'es'})).status,409);
  assert.equal((await api(base,'chunk',{session:'incorrect',body:Buffer.alloc(5120)})).status,404);
  assert.equal((await api(base,'chunk',{session:id,body:Buffer.alloc(5120)})).status,200);
  assert.equal(upstream.messages[1].byteLength,5120);
  upstream.WebSocketCtor.latest.deliver({type:'transcript',transcript:'Listen to',final:false});
  let poll=await api(base,'poll',{session:id});
  assert.equal(poll.status,200);
  assert.ok(poll.body.events.some(e=>e.type==='transcript'&&e.final===false));
  assert.ok(!JSON.stringify(poll.body).includes('mock-key'));
  assert.equal((await api(base,'stop',{session:id})).status,200);
  assert.ok(upstream.messages.some(x=>typeof x==='string'&&JSON.parse(x).type==='endStream'));
  poll=await api(base,'poll',{session:id});
  assert.ok(poll.body.events.some(x=>x.type==='speechComplete'&&x.transcript==='Listen to the storm.'));
  assert.ok(!JSON.stringify(poll.body).includes('mock-key'));
 });
});
test('PCM chunk accepts mono 16bit only, blocks oversized payload',async()=>{
 await withServer(async(base)=>{
  const start=await api(base,'start',{lang:'es'}),session=start.body.session;
  assert.equal((await api(base,'chunk',{session,body:Buffer.from([0])})).status,400);
  assert.equal((await api(base,'chunk',{session,body:Buffer.alloc(16384)})).status,413);
  await api(base,'stop',{session});
 });
});
test('client code never contains Meta token or GO transport calls',async()=>{
 const {readFileSync}=await import('node:fs');
 const {fileURLToPath}=await import('node:url');
 const path=fileURLToPath(new URL('../src/ui/voice-live-ui.mjs',import.meta.url));
 const code=readFileSync(path,'utf8');
 for(const invalid of ['api.meta.ai','MODEL_API_KEY','operatorGoBtn','player.go(','runq:operator-quick-go','localStorage.setItem'])
  assert.ok(!code.includes(invalid),invalid);
 assert.ok(code.includes("type==='speechComplete'"));
 assert.ok(code.includes('runq:voice-follow-highlight-line'));
});
