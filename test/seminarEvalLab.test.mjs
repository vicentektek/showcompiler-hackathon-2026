import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readSeminarCorpus } from '../tools/seminarCorpus.mjs';
import { evaluateSeminarCorpus } from '../tools/seminar-offline-eval.mjs';
import { parseLiveOptions, runMetaSeminarEval,
  estimateMetaRequestReserve,reportedMetaUSD } from '../tools/metaSeminarEval.mjs';
import { createNewShow } from '../src/core/workspace.mjs';
import { planScriptAnalysis } from '../src/core/sceneAnalysis.mjs';
import { prepareTheatricalCueAnalysis } from '../src/core/theatreCueAnalysis.mjs';
import { MetaOutputError } from '../src/core/metaCueProvider.mjs';
import { evaluateStageEventCases } from '../src/core/stageCueQa.mjs';

const tempOutput=async t=>{
  const path=await mkdtemp(join(tmpdir(),'runq-seminar-'));
  t.after(()=>rm(path,{recursive:true,force:true}));
  return path;
};

test('seminar corpus has 9 rights-clear original scripts with precise immutable gold',async()=>{
  const c=await readSeminarCorpus();
  assert.equal(c.cases.length,9);
  assert.equal(c.humanReviewStatus,'PROVISIONAL_OPERATOR_REVIEW_REQUIRED');
  assert.equal(c.cases.reduce((n,x)=>n+x.expected.length,0),49);
  assert.equal(c.cases.reduce((n,x)=>n+x.forbiddenPlayLineIds.length,0),43);
  assert.equal(c.cases.some(x=>x.tags.includes('prompt-injection')),true);
  assert.equal(c.cases.some(x=>x.tags.includes('long-script')),true);
  for(const item of c.cases){
    const lines=new Set(Array.from({length:item.scriptText.replace(/\r\n?/g,'\n').split('\n').length},(_,i)=>'L'+(i+1)));
    assert.ok(item.expected.every(x=>lines.has(x.lineId)));
    assert.ok(item.forbiddenPlayLineIds.every(x=>lines.has(x)));
    assert.ok(item.expected.every(x=>x.basis==='EXPLICIT'));
    assert.ok(item.scriptText.length>100);
  }
});

test('all gold source spans are covered by exactly one model core window, without network',async t=>{
  const report=await evaluateSeminarCorpus({output:await tempOutput(t)});
  assert.equal(report.kind,'OFFLINE_GOLD_AND_META_CONTRACT_VALIDATION');
  assert.equal(report.trainedModelEvaluated,false);
  assert.equal(report.totals.scripts,9);
  assert.equal(report.totals.expectedEvents,49);
  assert.equal(report.totals.forbiddenPlay,43);
  assert.equal(report.totals.windows,10);
  assert.ok(report.cases.find(c=>c.id==='umbra-long').windowCount>1);
  assert.ok(report.cases.find(c=>c.id==='delta-signal').windowCount===1);
  assert.ok(report.cases.every(c=>c.windows.every(w=>w.outputTokenBudget===8192)));
  assert.ok(report.cases.every(c=>c.windows.every(w=>w.maximumSuggestionItems===8)));
});

test('script prompt injection remains untrusted task input and never becomes a cue',async()=>{
  const c=await readSeminarCorpus();
  const sample=c.cases.find(x=>x.id==='adversarial-prompt');
  const project=createNewShow({name:'harness',scriptText:sample.scriptText});
  const p=prepareTheatricalCueAnalysis(project,{performanceKind:'play',documentKind:'dramatic_script'});
  const user=JSON.parse(p.request.messages[1].content);
  assert.equal(p.request.store,false);
  assert.equal(p.request.stream,false);
  assert.equal(p.request.reasoning_effort,'low');
  assert.equal(p.request.response_format.json_schema.strict,true);
  assert.ok(JSON.stringify(user).includes('L999'));
  assert.match(p.request.messages[0].content,/untrusted theatrical material/i);
  assert.equal(project.cues.length,0);
  assert.equal(project.proposals.length,0);
});

test('full original gold predictions would score perfectly; mismatches are detected',async()=>{
  const corpus=await readSeminarCorpus();
  const predictions={version:1,predictionsByCase:{}};
  for(const c of corpus.cases){
    predictions.predictionsByCase[c.id]=c.expected.map(x=>({sourceLineId:x.lineId,
      transport:x.transport,cueKind:x.cueKind,basis:x.basis}));
  }
  const perfect=evaluateStageEventCases(corpus,predictions);
  assert.equal(perfect.summary.f1,1);
  const c=corpus.cases[0];
  predictions.predictionsByCase[c.id].push({sourceLineId:c.forbiddenPlayLineIds[0],
    transport:'PLAY',cueKind:'FX',basis:'EXPLICIT'});
  const mismatch=evaluateStageEventCases(corpus,predictions);
  assert.ok(mismatch.summary.precision<1);
  assert.equal(mismatch.summary.forbiddenPlay,1);
});

test('paid mode requires explicit CLI pair; refuses unknown options and budget above $2',()=>{
  assert.equal(parseLiveOptions([]).live,false);
  assert.equal(parseLiveOptions(['--live','--ack-paid']).maxRequests,13);
  for(const args of [
    ['--live'],['--ack-paid'],['--max-requests','100'],
    ['--budget-usd','2.01'],['--budget-usd','0'],
    ['--mode','off'],['--case','../../secrets'],['--api-key','x'],
  ])assert.throws(()=>parseLiveOptions(args),TypeError);
  assert.equal(parseLiveOptions(['--mode','balanced','--case','hotel-door']).caseId,'hotel-door');
});

test('reserve is conservative and usage pricing distinguishes cached input tokens',()=>{
  const p=prepareTheatricalCueAnalysis(createNewShow({name:'t',scriptText:'SCENE 1\n(A bell rings.)'}));
  const r=estimateMetaRequestReserve(p.request);
  assert.ok(r>.03&&r<.25,r);
  assert.equal(reportedMetaUSD({promptTokens:1000,cachedPromptTokens:500,completionTokens:2000}),.0092);
  assert.equal(reportedMetaUSD({promptTokens:300,completionTokens:400}),.002075);
  assert.equal(reportedMetaUSD({completionTokens:100}),null);
  assert.throws(()=>estimateMetaRequestReserve({...p.request,store:true}),TypeError);
  assert.throws(()=>estimateMetaRequestReserve({...p.request,model:'muse-spark-1.3-contributor'}),TypeError);
});

test('default dry-run plans all 10 windows without key, billing, fetch or model calls',async t=>{
  let calls=0;
  const report=await runMetaSeminarEval({output:await tempOutput(t),
    modelCaller:async()=>{calls++;throw Error('SHOULD_NOT_CALL')},
    fetchImpl:async()=>{calls++;throw Error('SHOULD_NOT_FETCH')}});
  assert.equal(calls,0);
  assert.equal(report.realInferenceExecuted,false);
  assert.equal(report.submittedRequests,0);
  assert.equal(report.plannedRequests,10);
  assert.equal(report.scoredCases,0);
  assert.equal(report.conservativeReservedUsd<2,true);
  assert.equal(report.cases.length,9);
});

test('explicitly-authorized, mocked single-case live run scores PLAY, STOP and independent observations',async t=>{
  const corpus=await readSeminarCorpus();
  const sample=corpus.cases.find(c=>c.id==='hotel-door');
  let calls=0;
  const fake=async({show,analysisWindowStart})=>{
    calls++;
    assert.equal(show.scriptText,sample.scriptText);
    const prepared=prepareTheatricalCueAnalysis(show,{windowStart:analysisWindowStart});
    const events=sample.expected.map(e=>({sourceLineId:e.lineId,
      transport:e.transport,cueKind:e.cueKind,basis:e.basis}));
    return {details:events.filter(x=>x.transport==='PLAY'),
      observations:events.filter(x=>x.transport!=='PLAY'),
      coverage:prepared.coverage,
      diagnostics:{finishReason:'stop',usage:{promptTokens:1000,completionTokens:2000,
        cachedPromptTokens:0}},
      independentReview:{totalUnreviewed:0}};
  };
  const output=await tempOutput(t);
  const report=await runMetaSeminarEval({live:true,ackPaid:true,apiKey:'MOCK_TEST_KEY',
    modelCaller:fake,caseId:'hotel-door',budgetUsd:0.15,maxRequests:1,output});
  assert.equal(calls,1);
  assert.equal(report.realInferenceExecuted,true);
  assert.equal(report.scoredCases,1);
  assert.equal(report.score.truePositives,3);
  assert.equal(report.score.falseNegatives,0);
  assert.equal(report.score.f1,1);
  assert.equal(report.cases[0].status,'COMPLETE');
  const markdown=await readFile(join(output,'report.md'),'utf8');
  assert.doesNotMatch(markdown,/MOCK_TEST_KEY/);
  assert.doesNotMatch(markdown,/¿Quién ha dejado/);
});

test('truncated Meta reply stops batch and retains no partial cues or secret',async t=>{
  let calls=0;
  const output=await tempOutput(t);
  const report=await runMetaSeminarEval({live:true,ackPaid:true,apiKey:'SENSITIVE_FAKE_KEY',
    budgetUsd:2,maxRequests:13,output,
    modelCaller:async()=>{calls++;throw new MetaOutputError('TRUNCATED',{
      phase:'MODEL_FINISH',finishReason:'length',usage:{
        promptTokens:2300,completionTokens:8192,reasoningTokens:1300,
      }});}});
  assert.equal(calls,1);
  assert.equal(report.haltReason,'TRUNCATED');
  assert.equal(report.cases.length,1);
  assert.equal(report.cases[0].requests[0].finishReason,'length');
  assert.equal(report.scoredCases,0);
  const content=await readFile(join(output,'report.json'),'utf8');
  assert.doesNotMatch(content,/SENSITIVE_FAKE_KEY/);
  assert.doesNotMatch(content,/EL ARCHIVO PROHIBIDO/);
});

test('$2 budget guard refuses a request before any model call when reserve exceeds remaining',async t=>{
  let calls=0;
  const report=await runMetaSeminarEval({live:true,ackPaid:true,apiKey:'FAKE',
    maxRequests:10,budgetUsd:0.0001,output:await tempOutput(t),
    modelCaller:async()=>{calls++;throw Error('SHOULD_NOT_CALL')}});
  assert.equal(calls,0);
  assert.equal(report.submittedRequests,0);
  assert.equal(report.haltReason,'BUDGET_ESTIMATE_REACHED');
});
