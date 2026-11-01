import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../tools/dev-server.mjs';
import {createNewShow} from '../src/core/workspace.mjs';
import {buildExpertAgentContext} from '../src/core/agentExpertContext.mjs';
import {buildAgentPayload} from '../tools/agentRoutes.mjs';

const project = createNewShow({name:'Original synthetic expert route', scriptText:'SCENE 1\n(A bell rings.)'});
const context = () => buildExpertAgentContext(project, 'Help with L2');
async function request(input, output = {status:'ANSWER', message:'Evidence: L2.', operations:[]}) {
  let called = 0, payload;
  const server = createAppServer({getAgentKey:()=>'synthetic-not-a-credential',
    getBasetenAgentKey:()=>{throw new Error('FORBIDDEN_PROVIDER_ACCESS');},
    agentFetch:async(url, options)=>{
      called++;
      assert.equal(url,'https://api.meta.ai/v1/chat/completions');
      payload=JSON.parse(options.body);
      return {ok:true, text:async()=>JSON.stringify({choices:[{
        finish_reason:'stop', message:{content:JSON.stringify(output)}}]})};
    }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const root='http://127.0.0.1:'+server.address().port;
    const response=await fetch(root+'/api/agent/interpret',{method:'POST',
      headers:{'Content-Type':'application/json',Origin:root,'X-Runq-Agent-Consent':'yes'},
      body:JSON.stringify({prompt:'Help with L2',language:'en',context:input,provider:'meta'})});
    return {status:response.status, body:await response.json(),called,payload};
  } finally {await new Promise(resolve=>server.close(resolve));}
}
test('expert route uses verified server capabilities, not a forged capability claim',async()=>{
  const input=context();
  input.expert.capabilities=[{id:'fictional',description:'Certified ASIO and light console'}];
  const result=await request(input);
  assert.equal(result.status,200);
  const supplied=JSON.parse(result.payload.messages[1].content).context.expert.capabilities;
  assert.ok(Array.isArray(supplied)&&supplied.length>0);
  assert.equal(JSON.stringify(supplied).includes('fictional'),false);
  assert.match(result.payload.messages[0].content,/Selected cue, prepared GO and active cue/);
});
test('expert replies cannot cite source lines omitted from the evidence pack',async()=>{
  const result=await request(context(),{status:'ANSWER',message:'According to L9999.',operations:[]});
  assert.equal(result.status,502);
  assert.equal(result.called,1);
  assert.equal(result.body.error,'AGENT_INFERENCE_FAILED');
});
test('clarification can identify an explicitly requested missing line without claiming source evidence',async()=>{
  const input=buildExpertAgentContext(project,'Explain L9999');
  const result=await request(input,{status:'CLARIFY',message:'L9999 is unavailable. Please provide the correct reference.',operations:[]});
  assert.equal(result.status,200);
  assert.deepEqual(result.body.operations,[]);
});
test('cross-project or malformed task memory is rejected before any remote request',async()=>{
  const input=context();
  input.expert.memory={identity:'other-project',entries:[]};
  const result=await request(input);
  assert.equal(result.status,400);
  assert.equal(result.called,0);
});
test('A and B/C/D preserve the same original prompt and output contract except expert guidance',()=>{
  const input={prompt:'What is implemented?',language:'en',context:context(),conversation:[]};
  const baseline=buildAgentPayload(input,'muse-spark-1.3',{expert:false});
  const enhanced=buildAgentPayload(input);
  assert.ok(enhanced.messages[0].content.startsWith(baseline.messages[0].content));
  assert.deepEqual(baseline.response_format,enhanced.response_format);
  assert.equal(baseline.max_completion_tokens,enhanced.max_completion_tokens);
  assert.equal(baseline.reasoning_effort,enhanced.reasoning_effort);
});
