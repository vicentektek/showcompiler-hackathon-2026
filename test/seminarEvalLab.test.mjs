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
import { acquireMetaBudgetLedger } from '../tools/metaBudgetLedger.mjs';

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
  const gala=c.cases.find(x=>x.id==='gala-rundown');
  assert.deepEqual(gala.expected.filter(event=>['L13','L15','L16'].includes(event.lineId))
    .map(event=>event.cueKind),['AMBIENCE','AMBIENCE','AMBIENCE']);
  assert.equal(gala.alternativeAnnotations.length,3);
  assert.ok(gala.alternativeAnnotations.every(annotation=>
    annotation.alternative.cueKind==='MUSIC'&&
    annotation.reviewStatus==='PENDING_HUMAN_REVIEW'));
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
  assert.equal(report.totals.windows,13);
  assert.ok(report.cases.find(c=>c.id==='umbra-long').windowCount>1);
  assert.ok(report.cases.find(c=>c.id==='delta-signal').windowCount===2);
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

test('gala MUSIC versus AMBIENCE mismatch is isolated from location, transport and basis',async()=>{
  const corpus=await readSeminarCorpus();
  const gala=corpus.cases.find(c=>c.id==='gala-rundown');
  const instrumentalLines=new Set(['L13','L15','L16']);
  const predictions=gala.expected.map(event=>({sourceLineId:event.lineId,
    transport:event.transport,
    cueKind:instrumentalLines.has(event.lineId)?'MUSIC':event.cueKind,
    basis:event.basis}));
  const strict=evaluateStageEventCases({version:1,cases:[{...gala,alternativeAnnotations:[]}]},
    {version:1,predictionsByCase:{'gala-rundown':predictions}});
  assert.equal(strict.summary.precision,4/7);
  assert.equal(strict.summary.recall,4/7);
  assert.equal(strict.summary.dimensions.localization.f1,1);
  assert.equal(strict.summary.dimensions.transport.f1,1);
  assert.equal(strict.summary.dimensions.basis.f1,1);
  assert.equal(strict.summary.dimensions.soundClassification.f1,4/7);
  assert.equal(strict.summary.wrongAction,3);

  const reviewed=evaluateStageEventCases({version:1,cases:[gala]},
    {version:1,predictionsByCase:{'gala-rundown':predictions}});
  assert.equal(reviewed.summary.precision,strict.summary.precision);
  assert.equal(reviewed.summary.recall,strict.summary.recall);
  assert.equal(reviewed.summary.semanticAlternativesPending,3);
  assert.equal(reviewed.summary.wrongAction,0);
  assert.equal(reviewed.prioritizedCases[0].issues.filter(
    issue=>issue.type==='SEMANTIC_ALTERNATIVE_REVIEW').length,3);
});

test('hotel-door balanced-style optional suggestion remains human review, not exact-score inflation',async()=>{
  const corpus=await readSeminarCorpus();
  const hotel=corpus.cases.find(c=>c.id==='hotel-door');
  const predictions=hotel.expected.map(event=>({sourceLineId:event.lineId,
    transport:event.transport,cueKind:event.cueKind,basis:event.basis}));
  predictions.push({sourceLineId:'L5',transport:'SILENCE',cueKind:'SILENCE',basis:'SUGGESTED'});
  const scored=evaluateStageEventCases({version:1,cases:[hotel]},
    {version:1,predictionsByCase:{'hotel-door':predictions}});
  assert.equal(scored.summary.precision,1);
  assert.equal(scored.summary.recall,1);
  assert.equal(scored.summary.creativeAwaitingReview,1);
  assert.equal(scored.summary.dimensions.localization.f1,1);
  assert.equal(scored.summary.dimensions.transport.f1,1);
  assert.equal(scored.summary.dimensions.soundClassification.f1,1);
  assert.equal(scored.summary.dimensions.basis.f1,1);
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

test('default dry-run plans all 13 windows without key, billing, fetch or model calls',async t=>{
  let calls=0;
  const report=await runMetaSeminarEval({output:await tempOutput(t),
    modelCaller:async()=>{calls++;throw Error('SHOULD_NOT_CALL')},
    fetchImpl:async()=>{calls++;throw Error('SHOULD_NOT_FETCH')}});
  assert.equal(calls,0);
  assert.equal(report.realInferenceExecuted,false);
  assert.equal(report.submittedRequests,0);
  assert.equal(report.plannedRequests,13);
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

test('hotel-door diagnostics retain only typed event fields without inferring L5 as PLAY',async t=>{
  const corpus=await readSeminarCorpus();
  const sample=corpus.cases.find(c=>c.id==='hotel-door');
  const expected=sample.expected.map(e=>({sourceLineId:e.lineId,
    transport:e.transport,cueKind:e.cueKind,basis:e.basis}));
  const extra={sourceLineId:'L5',transport:'SILENCE',cueKind:'SILENCE',basis:'EXPLICIT',
    label:'PRIVATE LABEL',sourceEvidence:'PRIVATE SOURCE TEXT',reason:'PRIVATE REASON',
    soundPrompt:'PRIVATE PROMPT',rawResponse:'PRIVATE RESPONSE BODY',apiKey:'PRIVATE KEY'};
  const fake=async({show,analysisWindowStart})=>{
    const prepared=prepareTheatricalCueAnalysis(show,{windowStart:analysisWindowStart});
    return {details:expected.filter(x=>x.transport==='PLAY'),
      observations:[...expected.filter(x=>x.transport!=='PLAY'),extra],
      coverage:prepared.coverage,
      diagnostics:{finishReason:'stop',usage:{promptTokens:1000,completionTokens:2000}},
      independentReview:{totalUnreviewed:0}};
  };
  const output=await tempOutput(t);
  const report=await runMetaSeminarEval({live:true,ackPaid:true,apiKey:'PRIVATE KEY',
    modelCaller:fake,caseId:'hotel-door',budgetUsd:0.15,maxRequests:1,output});
  assert.equal(report.score.truePositives,3);
  assert.equal(report.score.falsePositives,1);
  assert.equal(report.score.precision,.75);
  assert.equal(report.score.recall,1);
  assert.equal(report.score.invalidReferences,0);
  assert.equal(report.score.dimensions.localization.precision,.75);
  assert.equal(report.score.dimensions.localization.recall,1);
  assert.equal(report.score.dimensions.transport.precision,.75);
  assert.equal(report.score.dimensions.soundClassification.precision,.75);
  assert.equal(report.score.dimensions.basis.precision,.75);
  assert.deepEqual(report.cases[0].typedEvents.at(-1),{
    sourceLineId:'L5',transport:'SILENCE',cueKind:'SILENCE',basis:'EXPLICIT',
  });
  assert.ok(report.cases[0].typedEvents.every(event=>
    JSON.stringify(Object.keys(event).sort())===JSON.stringify(['basis','cueKind','sourceLineId','transport'])));
  const json=await readFile(join(output,'report.json'),'utf8');
  const markdown=await readFile(join(output,'report.md'),'utf8');
  assert.match(markdown,/L5 \/ SILENCE \/ SILENCE \/ EXPLICIT/);
  assert.doesNotMatch(json+markdown,/PRIVATE|rawResponse|sourceEvidence|soundPrompt|apiKey/);
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


test('persistent Meta budget survives separate runs and rejects concurrent process',async t=>{
  const dir=await tempOutput(t);
  const path=join(dir,'meta-ledger.json');
  const one=await acquireMetaBudgetLedger({file:path,limitUsd:2});
  assert.equal(one.remainingUsd(),2);
  assert.equal(await one.reserve(0.7),true);
  assert.equal(one.remainingUsd(),1.3);
  await assert.rejects(acquireMetaBudgetLedger({file:path,limitUsd:2}),/LEDGER_LOCKED/);
  await one.close();
  const two=await acquireMetaBudgetLedger({file:path,limitUsd:2});
  assert.equal(two.committedReserveUsd(),0.7);
  assert.equal(await two.reserve(1.3),true);
  assert.equal(two.remainingUsd(),0);
  assert.equal(await two.reserve(0.0001),false);
  await two.close();
  const raw=await readFile(path,'utf8');
  assert.doesNotMatch(raw,/api[_-]?key|secret|script|authorization/i);
});

test('live batch stops at cumulative ledger ceiling, without paid network calls',async t=>{
  const dir=await tempOutput(t);
  const ledger=await acquireMetaBudgetLedger({file:join(dir,'budget.json'),limitUsd:0.065});
  let calls=0;
  try{
    const result=await runMetaSeminarEval({
      live:true,ackPaid:true,apiKey:'MOCK',
      budgetUsd:2,maxRequests:13,output:join(dir,'out'),ledger,
      modelCaller:async()=>{calls++;return {details:[],observations:[],
        coverage:{analyzedWindowIds:['S1-W1'],nextWindowStart:null},
        diagnostics:{finishReason:'stop',usage:{promptTokens:100,completionTokens:200}}}},
    });
    assert.equal(result.haltReason,'GLOBAL_BUDGET_REACHED');
    assert.ok(calls<=1);
    assert.ok(ledger.committedReserveUsd()<=0.065);
  }finally{await ledger.close()}
});
