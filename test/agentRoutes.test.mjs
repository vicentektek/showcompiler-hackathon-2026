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

test('agent route rejects operation or forged focus context before provider access',async()=>{
  let called=0;
  await withServer({getAgentKey:()=> 'test-key',
   agentFetch:async()=>{called++;return reply(proposal);}},async root=>{
   for(const focus of [
    {workspace:'operation'},
    {mode:'rehearsal'},
    {selectedCueId:'cue-999'},
   ]){
    const request=params(root);
    request.body=JSON.stringify({...JSON.parse(request.body),
     context:{...context,...focus}});
    const response=await fetch(root+'/api/agent/interpret',request);
    assert.equal(response.status,400);
    assert.equal((await response.json()).error,'INVALID_AGENT_INPUT');
   }
   assert.equal(called,0);
  });
});

test('model may not target cues absent from consented context',async()=>{
 const rogue={...proposal,operations:[{...proposal.operations[0],cueId:'cue-999'}]};
 await withServer({getAgentKey:()=> 'test-key',agentFetch:async()=>reply(rogue)},
  async root=>{
   const response=await fetch(root+'/api/agent/interpret',params(root));
   assert.equal(response.status,502);
   assert.equal((await response.json()).error,'AGENT_INFERENCE_FAILED');
  });
});
test('model may not fabricate voice triggers without evidence from the original script',async()=>{
 const invalid={...proposal,operations:[{
  op:'UPDATE_CUE',cueId:'cue-2',afterCueId:null,targetCueId:null,
  position:null,label:null,
  edits:[{field:'trigger',numeric:null,text:'Invented words not in any script dialogue',boolean:null}]
 }]};
 await withServer({getAgentKey:()=> 'test-key',agentFetch:async()=>reply(invalid)},
  async root=>{
   const response=await fetch(root+'/api/agent/interpret',params(root));
   assert.equal(response.status,502);
   assert.equal((await response.json()).error,'AGENT_INFERENCE_FAILED');
  });
});

test('Baseten fallback uses independent server-side key and never requests unsupported JSON mode',async()=>{
 let called=0;
 await withServer({
  getAgentKey:()=>'',getBasetenAgentKey:()=> 'baseten-test-secret',
  agentFetch:async(url,request)=>{
   called++;
   assert.equal(url,'https://inference.baseten.co/v1/chat/completions');
   const body=JSON.parse(request.body);
   assert.equal(body.model,'meta-models/muse-spark-open-1026');
   assert.equal(Object.hasOwn(body,'response_format'),false);
   assert.equal(request.headers.Authorization,'Bearer baseten-test-secret');
   return reply(proposal);
  }
 },async root=>{
  const input=params(root);input.body=JSON.stringify({
   ...JSON.parse(input.body),provider:'baseten'
  });
  const response=await fetch(root+'/api/agent/interpret',input);
  assert.equal(response.status,200);
  assert.equal((await response.json()).provider,'BASETEN_MUSE_SPARK_OPEN');
  assert.equal(called,1);
 });
});
