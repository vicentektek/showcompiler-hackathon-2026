import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyAgentFailure,humanizeAgentError,humanNeedsAiReply,formatHumanReply,detectAgentTopic}
 from '../src/core/agentFallback.mjs';
import {buildAgentContext,fitAgentContext} from '../src/core/agentCore.mjs';
import {createAppServer} from '../tools/dev-server.mjs';
import {createNewShow} from '../src/core/workspace.mjs';

const RAW=/AGENT_INFERENCE_FAILED|MODEL_[A-Z_]+|AI_PROVIDER_UNAVAILABLE|Unable to prepare|[A-Z]{3,}_[A-Z_]{3,}/;

test('every failure class gets a human reply with no raw code and no claim of change',()=>{
 const failures=[{reason:'MODEL_TIMEOUT'},{reason:'AI_PROVIDER_UNAVAILABLE'},
  {reason:'MODEL_TRIGGER_HAS_NO_SCRIPT_EVIDENCE'},{reason:'MODEL_CUE_NOT_IN_CONTEXT'},
  {reason:'BAD_MODEL_REPLY'},{error:'AGENT_INFERENCE_FAILED',reason:'UNKNOWN'},
  {error:'AGENT_BUSY',status:429},{error:'MODEL_API_KEY_NOT_CONFIGURED',status:503},
  {reason:'CONTEXT_EXCEEDS_LIMIT'},{}];
 for(const language of ['es','en'])for(const failure of failures){
  const text=formatHumanReply(humanizeAgentError(failure,{language,
   instruction:'en los OPERATOR TRIGGER pon el nombre del actor que dice también.'}));
  assert.doesNotMatch(text,RAW,JSON.stringify(failure));
  assert.match(text,language==='es'?/No he cambiado nada/:/not changed anything/);
  assert.ok(text.split('\n').length>=3,'offers alternatives');
 }
 assert.equal(classifyAgentFailure({reason:'MODEL_TRIGGER_HAS_NO_SCRIPT_EVIDENCE'}),'MODEL_UNSAFE');
 assert.equal(classifyAgentFailure({reason:'MODEL_TIMEOUT'}),'MODEL_TIMEOUT');
 assert.equal(detectAgentTopic('pon el nombre del actor en el trigger'),'trigger');
});
test('NEEDS_AI becomes guidance that points to the explicit consent flow',()=>{
 const reply=humanNeedsAiReply({language:'en',instruction:'make it more dramatic'});
 assert.match(formatHumanReply(reply),/Ask AI/);
 assert.doesNotMatch(formatHumanReply(reply),RAW);
});
test('context carries speaker evidence and fits the transport budget',()=>{
 const script=Array.from({length:150},(_,i)=>`ANA: línea de diálogo número ${i+1} con bastante texto de relleno para ocupar espacio`).join('\n');
 const project=createNewShow({name:'Demo',scriptText:script});
 const context=buildAgentContext(project,{});
 assert.equal(context.lines[0].speaker,'ANA');
 const fitted=fitAgentContext(context,6000);
 assert.ok(JSON.stringify(fitted).length<=6000);
 assert.ok(fitted.truncated.script);
});
test('unsafe model output is a 502 with a bounded reason, never raw model text',async()=>{
 const server=createAppServer({getAgentKey:()=>'k',agentFetch:async()=>({ok:true,status:200,text:async()=>JSON.stringify({
  choices:[{finish_reason:'stop',message:{content:JSON.stringify({status:'PLAN',message:'x',operations:[{
   op:'UPDATE_CUE',cueId:'cue-2',afterCueId:null,targetCueId:null,position:null,label:null,
   edits:[{field:'trigger',numeric:null,text:'Invented words not in any dialogue',boolean:null}]}]})}}]})})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const root='http://127.0.0.1:'+server.address().port;
  const response=await fetch(root+'/api/agent/interpret',{method:'POST',headers:{
   'Content-Type':'application/json',Origin:root,'X-Runq-Agent-Consent':'yes'},
   body:JSON.stringify({prompt:'pon trigger',language:'es',context:{projectId:'t',projectName:'D',
    counts:{cues:1},cues:[{id:'cue-2',number:2,label:'Door',trigger:'',sourceLineIds:[]}],
    lines:[],assets:[],truncated:{cues:false,script:false}}})});
  const body=await response.json();
  assert.equal(response.status,502);
  assert.equal(body.error,'AGENT_INFERENCE_FAILED');
  assert.equal(body.reason,'MODEL_TRIGGER_HAS_NO_SCRIPT_EVIDENCE');
  assert.equal(classifyAgentFailure(body),'MODEL_UNSAFE');
 }finally{await new Promise(r=>server.close(r));}
});
