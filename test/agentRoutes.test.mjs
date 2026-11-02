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
test('model audio tools decode strict plans, expose context and reject invented assets, tracks and stop targets',async()=>{
   let output;
   const inputs=[];
   const audioContext={...context,cues:[
    {...context.cues[0],sourceLineIds:['L2'],playback:{},audioTracks:[{id:'track-1',assetId:'asset-1'}]},
    {id:'cue-3',number:3,label:'End',sourceLineIds:['L3'],audioTracks:[]},
   ],assets:[{id:'asset-1',name:'rain.wav',available:true},{id:'asset-2',name:'missing.wav',available:false}],
   lines:[{id:'L2',text:'(Rain falls.)'},{id:'L3',text:'(Rain stops.)'}]};
   const operation=(op,fields={})=>({...proposal.operations[0],op,cueId:'cue-2',
    assetId:null,trackId:null,mode:null,fadeMs:null,...fields});
   await withServer({getAgentKey:()=> 'test-key',agentFetch:async(_url,request)=>{
    inputs.push(JSON.parse(request.body));return reply({...proposal,operations:output});
   }},async root=>{
    async function send(operations){
     output=operations;
     const input=params(root);input.body=JSON.stringify({...JSON.parse(input.body),context:audioContext});
     return fetch(root+'/api/agent/interpret',input);
    }
    const tools=[
     operation('UPDATE_CUE',{edits:[{field:'loop',boolean:true,numeric:null,text:null}]}),
     operation('SET_CUE_STOP',{cueId:'cue-3',targetCueId:'cue-2',fadeMs:5000}),
     operation('ASSIGN_AUDIO',{assetId:'asset-1'}),
     operation('ADD_AUDIO_TRACK',{assetId:'asset-1',edits:[
      {field:'gainDb',numeric:-9,text:null,boolean:null},
     ]}),
     operation('UPDATE_AUDIO_TRACK',{trackId:'track-1',edits:[
      {field:'endAtMs',numeric:null,text:null,boolean:null},
      {field:'gainDb',numeric:-12,text:null,boolean:null},
     ]}),
     operation('REMOVE_AUDIO_TRACK',{trackId:'track-1'}),
     operation('SET_ENTRY_POLICY',{mode:'STOP_PREVIOUS',fadeMs:2000}),
     operation('REMOVE_CUE_STOP',{cueId:'cue-3',targetCueId:'cue-2'}),
    ];
    const response=await send(tools);
    assert.equal(response.status,200);
    const body=await response.json();
    assert.deepEqual(body.operations[1],{op:'SET_CUE_STOP',cueId:'cue-3',targetCueId:'cue-2',fadeMs:5000});
    assert.equal(body.operations[4].changes.endAtMs,null);
    assert.equal(body.operations[3].changes.gainDb,-9);
    const replaced=await send([operation('UPDATE_AUDIO_TRACK',{trackId:'track-1',assetId:'asset-1'})]);
    assert.equal(replaced.status,200);
    assert.deepEqual((await replaced.json()).operations,[{
     op:'UPDATE_AUDIO_TRACK',cueId:'cue-2',trackId:'track-1',assetId:'asset-1',
    }]);
    assert.deepEqual(inputs[0].messages[1]&&JSON.parse(inputs[0].messages[1].content).context,audioContext);
    const schema=inputs[0].response_format.json_schema.schema.properties.operations.items;
    assert.ok(schema.properties.op.enum.includes('SET_CUE_STOP'));
    assert.ok(schema.required.includes('fadeMs'));
    for(const bad of [
     operation('SET_CUE_STOP',{targetCueId:'cue-999',fadeMs:1000}),
     operation('SET_CUE_STOP',{targetCueId:'cue-2',fadeMs:1000}),
     operation('ASSIGN_AUDIO',{assetId:'asset-999'}),
     operation('ASSIGN_AUDIO',{assetId:'asset-2'}),
     operation('UPDATE_AUDIO_TRACK',{trackId:'track-999',edits:[{field:'pan',numeric:1,text:null,boolean:null}]}),
     operation('UPDATE_AUDIO_TRACK',{trackId:'track-1',edits:[{field:'label',numeric:null,text:'Not playback',boolean:null}]}),
     operation('SET_ENTRY_POLICY',{mode:'AUTO_GO',fadeMs:0}),
    ])assert.equal((await send([bad])).status,502,JSON.stringify(bad));
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

test('agent prompt preserves explicit door actions while keeping ambience optional in English and Spanish',async()=>{
 const cases=[
  {language:'en',line:'A door opens.',prompt:'Suggest a sound for this script line.'},
  {language:'es',line:'Se abre una puerta.',prompt:'Sugiere un sonido para esta línea del guion.'},
  {language:'es',line:'Se abre la puerta y entra una fuerte ráfaga de viento.',
   prompt:'Sugiere sonidos para esta línea del guion.'},
 ];
 const requests=[];
 await withServer({
  getAgentKey:()=> 'test-key',
  agentFetch:async(_url,request)=>{
   requests.push(JSON.parse(request.body));
   return reply({status:'ANSWER',message:'Suggestions only.',operations:[]});
  },
 },async root=>{
  for(const item of cases){
   const input=params(root);
   input.body=JSON.stringify({
    ...JSON.parse(input.body),prompt:item.prompt,language:item.language,
    context:{...context,lines:[{id:'L4',text:item.line}]},
   });
   const response=await fetch(root+'/api/agent/interpret',input);
   assert.equal(response.status,200);
  }
 });
 assert.equal(requests.length,cases.length);
 for(let index=0;index<cases.length;index++){
  const [developer,user]=requests[index].messages;
  assert.match(developer.content,/preserve the acoustic identity of explicit actions/i);
  assert.match(developer.content,/Do not replace an explicit action with unrelated ambience/i);
  assert.match(developer.content,/optional, separately identified layer/i);
  assert.match(developer.content,/must not displace the explicit action/i);
  const input=JSON.parse(user.content);
  assert.equal(input.language,cases[index].language);
  assert.deepEqual(input.context.lines,[{id:'L4',text:cases[index].line}]);
 }
});
