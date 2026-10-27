import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBasetenEvalOptions,makeBasetenTheatreRequest,callBasetenTheatre,
  compareProviderReports,renderProviderComparisonReport,
} from '../tools/basetenSeminarEval.mjs';
import {prepareTheatricalCueAnalysis} from '../src/core/theatreCueAnalysis.mjs';
import {createNewShow} from '../src/core/workspace.mjs';
import {BASETEN_MODEL} from '../src/core/basetenCueProvider.mjs';

const prepared=()=>prepareTheatricalCueAnalysis(createNewShow({name:'test',scriptText:'A bell rings in the distance.'}),{designMode:'literal'});

test('safe nested local report outputs are allowed without accepting traversal or absolute paths',()=>{
  const ok=parseBasetenEvalOptions(['--case','hotel-door','--output','artifacts/three-case-quality/baseten-hotel-door']);
  assert.equal(ok.output,'artifacts/three-case-quality/baseten-hotel-door');
  for(const unsafe of ['../outside','artifacts/../outside','artifacts/three-case-quality/../../outside',
    'C:\\\\secrets','artifacts/three-case-quality/too/deep','artifacts/three-case-quality\\\\bad']){
    assert.throws(()=>parseBasetenEvalOptions(['--output',unsafe]),/Invalid bounded/);
  }
});

test('default is offline, paid mode needs both switches, bounded requests',()=>{
  assert.equal(parseBasetenEvalOptions([]).live,false);
  assert.throws(()=>parseBasetenEvalOptions(['--live']),/Invalid bounded/);
  assert.throws(()=>parseBasetenEvalOptions(['--live','--ack-paid','--max-requests','999']),/Invalid bounded/);
});
test('Baseten request uses exact hackathon model, same source window and no unsupported JSON schema flag',()=>{
  const r=makeBasetenTheatreRequest(prepared());
  assert.equal(r.model,BASETEN_MODEL);
  assert.equal(r.response_format,undefined);
  assert.match(r.messages[0].content,/sourceEvidence/);
  assert.match(r.messages[1].content,/A bell rings/);
});
test('truncated reasoning-only completion is not counted as success',async()=>{
  const result=await callBasetenTheatre({prepared:prepared(),apiKey:'test-only',
    fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'length',message:{content:null}}],usage:{completion_tokens:500}})})});
  assert.equal(result.status,'INCOMPLETE');
  assert.equal(result.diagnostics.usage.completionTokens,500);
});
test('malformed JSON does not become zero cues',async()=>{
  const result=await callBasetenTheatre({prepared:prepared(),apiKey:'test-only',
    fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:'not json'}}]})})});
  assert.equal(result.status,'INVALID');
});
test('timeout is a typed sanitized failure with measured latency and no retry',async()=>{
  let calls=0;
  const error=Object.assign(new Error('private transport detail'),{name:'TimeoutError'});
  await assert.rejects(callBasetenTheatre({prepared:prepared(),apiKey:'test-only',
    now:(()=>{const ticks=[100,145];return()=>ticks.shift()})(),
    fetchImpl:async()=>{calls++;throw error}}),failure=>{
      assert.equal(failure.safeReason,'TIMEOUT');
      assert.equal(failure.diagnostics.durationMs,45);
      assert.doesNotMatch(failure.message,/private transport detail|test-only/);
      return true;
    });
  assert.equal(calls,1);
});
test('only completed overlapping cases are compared',()=>{
  const corpus={version:1,provenance:'test',cases:[
    {id:'x',scriptText:'Bell rings',expected:[],forbiddenPlayLineIds:[]},
    {id:'y',scriptText:'Rain',expected:[],forbiddenPlayLineIds:[]},
  ]};
  const usage={promptTokens:10,completionTokens:20,reasoningTokens:5,cachedPromptTokens:2};
  const meta={model:'muse-spark-1.3',realInferenceExecuted:true,cases:[
    {id:'x',status:'COMPLETE',typedEvents:[],requests:[{status:'COMPLETED',durationMs:25,usage}]},
    {id:'y',status:'COMPLETE',typedEvents:[],requests:[{status:'COMPLETED',durationMs:999,usage}]},
  ]};
  const baseten={model:BASETEN_MODEL,realInferenceExecuted:true,cases:[
    {id:'x',status:'PARTIAL',typedEvents:[],requests:[]},
    {id:'y',status:'PARTIAL',typedEvents:[],requests:[]},
  ]};
  assert.equal(compareProviderReports(meta,baseten,corpus).comparable,false);
  baseten.cases[0].status='COMPLETE';
  baseten.cases[0].requests=[{status:'COMPLETED',diagnostics:{durationMs:40,usage}}];
  const result=compareProviderReports(meta,baseten,corpus);
  assert.equal(result.casesCompared,1);
  assert.equal(result.meta.f1,result.baseten.f1);
  assert.equal(result.metaMeasurements.latencyMs.total,25);
  assert.equal(result.basetenMeasurements.latencyMs.total,40);
  assert.equal(result.metaMeasurements.tokens.reasoning,5);
  const markdown=renderProviderComparisonReport(result);
  assert.match(markdown,/Identical complete cases: 1/);
  assert.match(markdown,/Prompt \/ completion \/ reasoning \/ cached/);
  assert.doesNotMatch(markdown,/999/);
});
test('offline request plans can never masquerade as a zero-quality paired model run',()=>{
  const corpus={version:1,provenance:'test',cases:[
    {id:'x',scriptText:'Bell rings',expected:[],forbiddenPlayLineIds:[]},
  ]};
  const dryCase={id:'x',status:'COMPLETE',typedEvents:[],requests:[{status:'DRY_RUN_NO_API'}]};
  assert.throws(()=>compareProviderReports(
    {model:'muse-spark-1.3',realInferenceExecuted:false,cases:[dryCase]},
    {model:BASETEN_MODEL,realInferenceExecuted:false,cases:[dryCase]},corpus),
  /real completed inference/);
});
