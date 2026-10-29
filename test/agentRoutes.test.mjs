import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../tools/dev-server.mjs';

const proposal={
 status:'PLAN',message:'Delete cue 2 after review.',
 operations:[{op:'DELETE_CUE',cueId:'cue-2',afterCueId:null,
  targetCueId:null,position:null,label:null,edits:[]}]
};
const reply=data=>({
 ok:true,status:200,
 text:async()=>JSON.stringify({choices:[{finish_reason:'stop',
  message:{content:JSON.stringify(data)}}]})
});
const context={projectId:'test',projectName:'Demo',counts:{cues:1},cues:[
 {id:'cue-2',number:2,label:'Door',trigger:'',sourceLineIds:[]}
 ],lines:[],assets:[],truncated:{cues:false,script:false}};
async function withServer(options,callback){
 const server=createAppServer(options);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const root='http://127.0.0.1:'+server.address().port;
  return await callback(root);
 }finally{
  await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
 }
}
const params=(root,consent='yes')=>({
 method:'POST',
 headers:{'Content-Type':'application/json','Origin':root,
  ...(consent?{'X-Runq-Agent-Consent':consent}:{})},
 body:JSON.stringify({prompt:'Delete cue 2',language:'en',context})
});
test('agent route rejects requests without explicit one-shot consent and keeps keys private',async()=>{
 let called=0;
 await withServer({
  getAgentKey:()=> 'local-test-secret',
  agentFetch:async()=>{called++;return reply(proposal);}
 },async root=>{
  const no=await fetch(root+'/api/agent/interpret',params(root,''));
  assert.equal(no.status,403);
  assert.equal(called,0);
  const allowed=await fetch(root+'/api/agent/interpret',params(root));
  assert.equal(allowed.status,200);
  assert.deepEqual((await allowed.json()).operations,[{op:'DELETE_CUE',cueId:'cue-2'}]);
  assert.equal(called,1);
 });
});
test('model cannot return arbitrary transport commands; provider never edits the show',async()=>{
 await withServer({
  getAgentKey:()=> 'test-key',
  agentFetch:async()=>reply({...proposal,operations:[{op:'GO',cueId:'cue-2'}]})
 },async root=>{
  const response=await fetch(root+'/api/agent/interpret',params(root));
  assert.equal(response.status,502);
  assert.equal((await response.json()).error,'AGENT_INFERENCE_FAILED');
 });
});
test('model request fails closed if credentials are unavailable',async()=>{
 let called=0;
 await withServer({getAgentKey:()=>'',agentFetch:async()=>{called++;return reply(proposal);}},
  async root=>{
   const response=await fetch(root+'/api/agent/interpret',params(root));
   assert.equal(response.status,503);
   assert.equal(called,0);
  });
});
