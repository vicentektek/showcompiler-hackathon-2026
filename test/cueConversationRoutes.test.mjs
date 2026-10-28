import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../tools/dev-server.mjs';
function candidate(){
 return {prompt:'Baja la tormenta a menos nueve decibelios y que entre durante tres segundos',
  language:'es',lastField:null,pendingChanges:null,
  cue:{id:'cue-1',number:4,label:'Tormenta',trigger:'La tormenta se acerca',
   notes:'',playback:{gainDb:0,fadeInMs:0}}};
}
function metaResponse({status='PATCH',message='Propongo cambios',edits=[
 {field:'gainDb',numeric:-9,text:null,boolean:null},
 {field:'fadeInMs',numeric:3000,text:null,boolean:null}
]}={}){
 return {ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',
  message:{content:JSON.stringify({status,message,edits})}}]})};
}
async function withServer(options,fn){
 const server=createAppServer(options);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{return await fn(base);}
 finally{await new Promise(resolve=>server.close(resolve));}
}
async function submit(base,request=candidate(),headers={}){
 const res=await fetch(base+'/api/cue-chat/interpret',{method:'POST',
  headers:{Origin:base,'Content-Type':'application/json',
   'X-RunQ-Chat-Consent':'yes',...headers},
  body:JSON.stringify(request)});
 return {status:res.status,data:await res.json()};
}
test('without consent no paid service is called',async()=>{
 let calls=0;
 await withServer({getCueChatKey:()=> 'secret',cueChatFetch:async()=>{calls++;return metaResponse();}},async base=>{
  const denied=await submit(base,candidate(),{'X-RunQ-Chat-Consent':'no'});
  assert.equal(denied.status,403);
  assert.equal(calls,0);
  const origin=await submit(base,candidate(),{Origin:'http://evil.test'});
  assert.equal(origin.status,403);
  assert.equal(calls,0);
 });
});
test('no key yields clear local error without touching Meta',async()=>{
 await withServer({getCueChatKey:()=>'',cueChatFetch:async()=>{throw Error('never');}},async base=>{
  const res=await submit(base);
  assert.equal(res.status,503);
  assert.equal(res.data.error,'MODEL_API_KEY_NOT_CONFIGURED');
 });
});
test('one exact Muse Spark request returns validated ES draft, excludes private key',async()=>{
 const captured=[];
 await withServer({getCueChatKey:()=> 'server-only-secret',
  cueChatFetch:async(uri,args)=>{captured.push({uri,args});return metaResponse();}},async base=>{
  const res=await submit(base);
  assert.equal(res.status,200);
  assert.equal(res.data.status,'PATCH');
  assert.equal(res.data.changes.gainDb,-9);
  assert.equal(res.data.changes.fadeInMs,3000);
  assert.ok(!JSON.stringify(res.data).includes('server-only-secret'));
 });
 assert.equal(captured.length,1);
 assert.equal(captured[0].uri,'https://api.meta.ai/v1/chat/completions');
 assert.equal(captured[0].args.headers.Authorization,'Bearer server-only-secret');
 const payload=JSON.parse(captured[0].args.body);
 assert.equal(payload.store,false);
 assert.equal(payload.model,'muse-spark-1.3');
 assert.equal(payload.response_format.type,'json_schema');
 assert.equal(payload.messages[1].role,'user');
 assert.ok(!payload.messages[1].content.includes('server-only-secret'));
});
test('model clarification is never a patch, no retries',async()=>{
 let calls=0;
 await withServer({getCueChatKey:()=> 'key',cueChatFetch:async()=>{
  calls++;return metaResponse({status:'CLARIFY',message:'¿Cuál cue?',edits:[]});
 }},async base=>{
  const result=await submit(base);
  assert.equal(result.status,200);
  assert.equal(result.data.status,'CLARIFY');
  assert.equal(result.data.changes,null);
 });
 assert.equal(calls,1);
});
test('unknown or unsafe remote fields rejected, never applied',async()=>{
 await withServer({getCueChatKey:()=> 'key',cueChatFetch:async()=>
  metaResponse({edits:[{field:'operatorGo',numeric:1,text:null,boolean:null}]})},async base=>{
  const result=await submit(base);
  assert.equal(result.status,502);
  assert.equal(result.data.error,'EDITOR_INTERPRETATION_FAILED');
 });
});
test('malformed user payload rejected without provider calls',async()=>{
 let calls=0;
 await withServer({getCueChatKey:()=> 'key',cueChatFetch:async()=>{calls++;return metaResponse();}},async base=>{
  const res=await submit(base,{...candidate(),prompt:'A',action:'GO'});
  assert.equal(res.status,400);
  assert.equal(calls,0);
 });
});
