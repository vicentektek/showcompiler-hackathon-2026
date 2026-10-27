import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBasetenEvalOptions,makeBasetenTheatreRequest,callBasetenTheatre,compareProviderReports} from '../tools/basetenSeminarEval.mjs';
import {prepareTheatricalCueAnalysis} from '../src/core/theatreCueAnalysis.mjs';
import {createNewShow} from '../src/core/workspace.mjs';
import {BASETEN_MODEL} from '../src/core/basetenCueProvider.mjs';

const prepared=()=>prepareTheatricalCueAnalysis(createNewShow({name:'test',scriptText:'A bell rings in the distance.'}),{designMode:'literal'});

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
test('only completed overlapping cases are compared',()=>{
  const corpus={version:1,provenance:'test',cases:[{id:'x',scriptText:'Bell rings',expected:[],forbiddenPlayLineIds:[]}]};
  const meta={model:'muse-spark-1.3',cases:[{id:'x',status:'COMPLETE',typedEvents:[]}]};
  const baseten={model:BASETEN_MODEL,cases:[{id:'x',status:'PARTIAL',typedEvents:[]}]};
  assert.equal(compareProviderReports(meta,baseten,corpus).comparable,false);
  baseten.cases[0].status='COMPLETE';
  const result=compareProviderReports(meta,baseten,corpus);
  assert.equal(result.casesCompared,1);
  assert.equal(result.meta.f1,result.baseten.f1);
});
