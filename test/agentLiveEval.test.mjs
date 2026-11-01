import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,readdir,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {acquireAgentEvalBudget} from '../tools/agentLiveBudget.mjs';
import {parseAgentLiveOptions,getAgentLiveScenario,
 judgeAgentLiveReply,runPaidAgentEvaluation,summarizeAgentLiveResults,
 fingerprintAgentLiveCase,readRecordedAgentCases,getAgentEvaluationCorpus,
 planAgentEvaluation,commitIdentity} from '../tools/runq-agent-live-eval.mjs';

test('paid experiment is off by default and requires BOTH explicit flags',()=>{
 const dry=parseAgentLiveOptions(['--cases','20','--providers','meta']);
 assert.equal(dry.live,false);
 assert.equal(dry.cases,20);
 assert.equal(dry.budgetUsd,65);
 assert.deepEqual(parseAgentLiveOptions([]).providers,['meta']);
 assert.throws(()=>parseAgentLiveOptions(['--providers','meta,baseten']));
 assert.throws(()=>parseAgentLiveOptions(['--providers','fireworks']));
 assert.throws(()=>parseAgentLiveOptions(['--budget-usd','65.000001']));
 assert.throws(()=>parseAgentLiveOptions(['--live','--cases','200']));
 assert.throws(()=>parseAgentLiveOptions(['--ack-paid']));
 assert.throws(()=>parseAgentLiveOptions(['--live','--ack-paid','--budget-usd','1000']));
 assert.throws(()=>parseAgentLiveOptions(['--live','--ack-paid','--cases','401']));
 assert.throws(()=>parseAgentLiveOptions(['--live','--ack-paid','--providers','meta,meta']));
 assert.equal(parseAgentLiveOptions(['--verified-snapshot','C:\\safe-snapshot']).verifiedSnapshot,
  'C:\\safe-snapshot');
});
test('verified snapshot mode rejects a changed tracked patch before any paid entrypoint',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'runq-bad-snapshot-'));
 try{
  await writeFile(join(directory,'tracked-working-tree.patch'),'not the current diff');
  await mkdir(join(directory,'untracked'));
  assert.throws(()=>commitIdentity(directory),/VERIFIED_SNAPSHOT_TRACKED_MISMATCH/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('programmatic paid entrypoint rejects prohibited or unacknowledged requests before side effects',async()=>{
 let ledgerCalls=0,networkCalls=0;
 const dependencies={sharedLedgerFactory:()=>{ledgerCalls++;throw new Error('unexpected');},
  fetchImpl:()=>{networkCalls++;throw new Error('unexpected');}};
 const config=parseAgentLiveOptions(['--live','--ack-paid']);
 await assert.rejects(()=>runPaidAgentEvaluation({...config,providers:['baseten']},dependencies),
  /INVALID_AGENT_LIVE_EVAL_CONFIG/);
 await assert.rejects(()=>runPaidAgentEvaluation({...config,ackPaid:false},dependencies),
  /EXPLICIT_PAID_OPT_IN_REQUIRED/);
 assert.equal(ledgerCalls,0);assert.equal(networkCalls,0);
});
test('20-case product plan includes both languages for every scenario category',()=>{
 for(let index=0;index<10;index++){
  assert.notEqual(getAgentLiveScenario(index).language,getAgentLiveScenario(index+10).language);
 }
});
test('case identity ignores random project IDs but changes with actual input, not the run seed',()=>{
 const first=getAgentLiveScenario(0),second=getAgentLiveScenario(0);
 assert.equal(fingerprintAgentLiveCase(first),fingerprintAgentLiveCase(second));
 assert.notEqual(fingerprintAgentLiveCase(first),fingerprintAgentLiveCase({...second,prompt:'Different task'}));
 const config=parseAgentLiveOptions(['--cases','20','--start-index','20']);
 assert.equal(config.startIndex,20);
 assert.throws(()=>parseAgentLiveOptions(['--cases','20','--start-index','424']));
});
test('completed and uncertain recorded cases remain excluded; older rows block by case ID',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'runq-recorded-cases-'));
 try{
  const fingerprint=fingerprintAgentLiveCase(getAgentLiveScenario(0));
  await writeFile(join(dir,'eval-123-456.json'),JSON.stringify({
   version:2,realProviderEvaluations:true,results:[
    {id:'paid-0001',provider:'meta',caseFingerprint:fingerprint,httpStatus:0},
    {id:'paid-0002',provider:'meta',httpStatus:200},
   ],
  }));
  const history=await readRecordedAgentCases(dir);
  assert.equal(history.fingerprints.has(fingerprint),true);
  assert.equal(history.legacyIds.has('paid-0002'),true);
  assert.equal(history.fingerprints.has(fingerprintAgentLiveCase(getAgentLiveScenario(1))),true,
   'An older case without a fingerprint must block its identical-content aliases');
  await writeFile(join(dir,'eval-124-457.json'),'{}');
  await assert.rejects(()=>readRecordedAgentCases(dir),/UNRECONCILED_EVAL_HISTORY/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('campaign judge rejects fabricated summaries, false mutation claims and non-plan operations',()=>{
 const summary=getAgentLiveScenario(5);
 assert.equal(judgeAgentLiveReply(summary,{status:'ANSWER',
  message:'The show has a laser cue, an explosion and a symphonic finale',operations:[]}).correct,false);
 assert.equal(judgeAgentLiveReply(summary,{status:'ANSWER',
  message:summary.project.cues.map(c=>c.label).join(', '),operations:[]}).correct,true);
 const negative=getAgentLiveScenario(6);
 assert.equal(judgeAgentLiveReply(negative,{status:'ANSWER',message:'I created the cues',operations:[]}).correct,false);
 assert.equal(judgeAgentLiveReply(negative,{status:'ANSWER',message:'No changes proposed.',operations:[]}).correct,true);
 assert.equal(judgeAgentLiveReply(negative,{status:'ANSWER',message:'No changes.',
  operations:[{op:'GO'}]}).valid,false);
});
test('artistic advice and unspecified creative counts require human review, not invented accuracy',()=>{
 const advice=judgeAgentLiveReply(getAgentLiveScenario(9),{
  status:'ANSWER',message:'Try a quieter transition.',operations:[],
 });
 assert.equal(advice.correct,null);assert.equal(advice.reviewRequired,true);
 const followup=judgeAgentLiveReply(getAgentLiveScenario(1),{
  status:'PLAN',message:'Two possible closing cues.',
  operations:Array.from({length:2},(_,i)=>({op:'CREATE_CUE',label:'Closing '+i,afterCueId:null})),
 });
 assert.equal(followup.correct,null);assert.equal(followup.reviewRequired,true);
});
test('gauntlet voice ambiguity accepts a safe clarification without calling it a model failure',()=>{
 const scenario=getAgentEvaluationCorpus('gauntlet-v2').find(item=>item.id==='gauntlet-voice-01');
 assert.equal(scenario.expected.allowClarify,true);
 const safe=judgeAgentLiveReply(scenario,{status:'CLARIFY',message:'Identical phrases need stable scene context.',operations:[]});
 assert.equal(safe.correct,true);assert.equal(safe.reason,'SAFE_AMBIGUITY_REVIEW_REQUIRED');
 const unsafe=judgeAgentLiveReply(scenario,{status:'PLAN',message:'Done.',operations:[]});
 assert.equal(unsafe.correct,false);
});
test('correct appended empty cues are judged by final placement, not a single implementation spelling',()=>{
 const scenario=getAgentLiveScenario(0);
 const reply={status:'PLAN',message:'Three closing cues.',
  operations:Array.from({length:3},(_,i)=>({
   op:'CREATE_CUE',label:'Closing '+i,afterCueId:scenario.project.cues.at(-1).id,
  }))};
 assert.equal(judgeAgentLiveReply(scenario,reply).correct,true);
});
test('campaign accuracy excludes provider errors and human-only artistic review, with explicit denominators',()=>{
 const rows=[
  {provider:'meta',httpStatus:502,correct:false,valid:false,latencyMs:10},
  {provider:'meta',httpStatus:200,correct:null,reviewRequired:true,valid:true,latencyMs:20},
  {provider:'meta',httpStatus:200,correct:true,valid:true,latencyMs:30},
  {provider:'meta',httpStatus:200,correct:false,valid:true,latencyMs:40},
 ];
 const report=summarizeAgentLiveResults(rows,parseAgentLiveOptions([]));
 assert.equal(report.providerMetrics.meta.scored,2);
 assert.equal(report.providerMetrics.meta.humanReview,1);
 assert.equal(report.providerMetrics.meta.correctRate,50);
 assert.equal(report.providerMetrics.meta.errors,1);
 assert.equal(summarizeAgentLiveResults(rows.slice(0,2),
  parseAgentLiveOptions([])).providerMetrics.meta.correctRate,null);
});
test('paired evaluation fixtures are independent and score proposed changes without execution',()=>{
 const a=getAgentLiveScenario(0),b=getAgentLiveScenario(0);
 assert.deepEqual(a.project,b.project);
 assert.equal(a.expected.kind,'CREATE_CUE');
 const creative={status:'PLAN',message:'Closing ideas',operations:Array.from({length:3},(_,i)=>({
  op:'CREATE_CUE',label:'Artistic closing '+i,afterCueId:null
 }))};
 const r=judgeAgentLiveReply(a,creative);
 assert.equal(r.correct,true);
 assert.equal(r.valid,true);
 assert.equal(a.project.cues.length,4,'Judging must not alter source');
 assert.equal(judgeAgentLiveReply(a,{status:'CLARIFY',message:'Please clarify.',operations:[]}).correct,false);
 assert.equal(judgeAgentLiveReply(getAgentLiveScenario(6),
  {status:'CLARIFY',message:'No changes.',operations:[]}).correct,true);
 const unsafe=judgeAgentLiveReply(a,{status:'PLAN',message:'Unsafe',operations:[{op:'GO'}]});
 assert.equal(unsafe.valid,false);
});
test('paid ledger records cumulative reservations, rejects overlapping runs and survives reopening',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'runq-agent-live-'));
 const file=join(directory,'budget.json');
 try{
  const ledger=await acquireAgentEvalBudget({file,limitUsd:0.55});
  assert.equal(await ledger.reserve(0.2),true);
  assert.equal(await ledger.reserve(0.2),true);
  assert.equal(await ledger.reserve(0.2),false);
  await assert.rejects(()=>acquireAgentEvalBudget({file,limitUsd:0.55}),
   /AGENT_EVAL_BUDGET_LOCKED/);
  await ledger.close();
  const next=await acquireAgentEvalBudget({file,limitUsd:0.55});
  assert.equal(next.committedUsd(),0.4);
  assert.equal(await next.reserve(0.1),true);
  await next.close();
  const check=await acquireAgentEvalBudget({file,limitUsd:0.55});
  assert.equal(check.committedUsd(),0.5);
  await check.close();
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('expanded corpus preserves all 24 legacy inputs and adds 400 distinct meaningful contracts',()=>{
 const corpus=getAgentEvaluationCorpus();
 assert.equal(corpus.length,424);
 assert.equal(new Set(corpus.map(c=>c.caseFingerprint)).size,424);
 const legacy=new Set(Array.from({length:400},(_,i)=>fingerprintAgentLiveCase(getAgentLiveScenario(i))));
 assert.equal(legacy.size,24);
 assert.deepEqual(new Set(corpus.slice(0,24).map(c=>c.caseFingerprint)),legacy);
 const first76=corpus.slice(24,100);
 assert.equal(new Set(first76.map(c=>c.kind)).size,10);
 assert.equal(new Set(first76.map(c=>c.qualityCase.difficulty)).size,4);
 assert.equal(first76.filter(c=>c.language==='es').length,38);
 assert.equal(first76.filter(c=>c.language==='en').length,38);
 assert.ok(first76.some(c=>c.qualityCase.endpoint==='proposals'));
 assert.ok(first76.some(c=>c.kind==='conversation'));
 assert.ok(first76.some(c=>c.kind==='preservation'));
});

test('total target requests exactly the missing unique completions and excludes uncertain history',()=>{
 const corpus=getAgentEvaluationCorpus(),completed=new Set(corpus.slice(0,24).map(c=>c.caseFingerprint));
 const history={fingerprints:new Set([...completed,corpus[24].caseFingerprint]),
  legacyIds:new Set(),completedFingerprints:completed};
 const config=parseAgentLiveOptions(['--cases','100','--target-total','100']);
 const plan=planAgentEvaluation(config,history);
 assert.equal(plan.alreadyCompleted,24);
 assert.equal(plan.newRequestTarget,76);
 assert.equal(plan.skipped.length,25);
 assert.equal(plan.availableNewCases,399);
 assert.equal(plan.candidates[0].id,corpus[25].id);
 assert.equal(planAgentEvaluation({...config,targetTotal:24},history).newRequestTarget,0);
 assert.equal(planAgentEvaluation({...config,targetTotal:null},history).newRequestTarget,100);
});

async function simulatedAgentRun(t,{blocked=24,duplicate=0,error=false,startIndex=0}={}){
 const directory=await mkdtemp(join(tmpdir(),'runq-agent-count-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const corpus=getAgentEvaluationCorpus(),historyDirectory=join(directory,'history');
 // The historical records are synthetic test data, not copied paid evidence.
 const {mkdir}=await import('node:fs/promises');
 await mkdir(historyDirectory);
 await writeFile(join(historyDirectory,'eval-1-1.json'),JSON.stringify({version:2,
  realProviderEvaluations:false,evidenceMode:'OFFLINE_SIMULATED_TRANSPORT',
  results:corpus.slice(0,blocked).map(c=>({id:c.id,provider:'meta',
   caseFingerprint:c.caseFingerprint,httpStatus:200,correct:true,valid:true,latencyMs:1}))}));
 const calls=[],reservations=new Set(),budgetFile=join(directory,'budget.json');
 const deps={historyDirectory,simulated:true,keyAvailable:()=>true,
  commitIdentityFn:()=> 'a'.repeat(40),
  budgetFactory:options=>acquireAgentEvalBudget({...options,file:budgetFile}),
  serverFactory:()=>createServer(),
  sharedLedgerFactory:async()=>({status:()=>({testOnly:true}),
   close:async()=>{},reserve:async({requestId,estimatedMaximumUsd})=>{
    if(reservations.has(requestId)||duplicate-->0)return {accepted:false,reason:'DUPLICATE_ID'};
    reservations.add(requestId);return {accepted:true,amountUsd:estimatedMaximumUsd};
   }}),
  fetchImpl:async(url,request)=>{
   const body=JSON.parse(request.body);
   const id=(body.project?.id??body.context.projectId).slice(3);
   const scenario=corpus.find(c=>c.id===id);
   assert.ok(scenario);
   const pending=await readdir(historyDirectory);
   const latest=JSON.parse(await readFile(join(historyDirectory,pending.find(n=>n.endsWith('.json')&&n!=='eval-1-1.json')),'utf8'));
   assert.equal(latest.results.at(-1).result,'SUBMISSION_RESERVED_NO_RETRY');
   calls.push(scenario.id);
   if(error)throw new Error('Synthetic timeout, not a real provider call');
   const expected=scenario.expected;
   if(expected.kind==='EVENTS'){
    assert.equal(new URL(url).pathname,'/api/meta/proposals');
    const events=expected.events;
    return new Response(JSON.stringify({
     proposals:events.filter(e=>e.transport==='PLAY').map(e=>({lineId:e.lineId})),
     proposalDetails:events.filter(e=>e.transport==='PLAY'),
     observations:events.filter(e=>e.transport!=='PLAY').map(e=>({...e,sourceLineId:e.lineId})),
     coverage:{complete:true}}));
   }
   assert.equal(new URL(url).pathname,'/api/agent/interpret');
   return new Response(JSON.stringify({
    status:expected.kind==='CLARIFY'?'CLARIFY':expected.kind==='NO_PLAN'?'ANSWER':'PLAN',
    message:'Synthetic test oracle, not model output',
    operations:expected.kind==='CREATE'?Array.from({length:expected.count},(_,i)=>
     ({op:'CREATE_CUE',afterCueId:null,label:'Placeholder '+i})):expected.operations??[],
   }));
  }};
 const config=parseAgentLiveOptions(['--live','--ack-paid','--cases','100','--target-total','100',
  '--start-index',String(startIndex)]);
 return {config,deps,calls,historyDirectory,run:()=>runPaidAgentEvaluation(config,deps)};
}

test('24 saved inputs plus 76 new varied simulated completions reach 100; rerun submits none',async t=>{
 const f=await simulatedAgentRun(t);
 const report=await f.run();
 assert.equal(report.stopReason,'COMPLETE');
 assert.equal(report.completedRequests,76);
 assert.equal(report.totalCompletedUnique,100);
 assert.equal(report.realProviderEvaluations,false);
 assert.equal(report.evidenceMode,'OFFLINE_SIMULATED_TRANSPORT');
 assert.equal(f.calls.length,76);
 assert.ok(report.results.every(row=>row.quality.correct));
 assert.equal(report.providerMetrics.meta.eventMetrics.precision,100);
 assert.equal(report.providerMetrics.meta.eventMetrics.recall,100);
 assert.equal(report.providerMetrics.meta.eventMetrics.f1,100);
 assert.equal(report.providerMetrics.meta.editMetrics.correctRate,100);
 assert.equal(report.languageMetrics.es.total,38);
 assert.equal(report.languageMetrics.en.total,38);
 assert.equal(Object.keys(report.difficultyMetrics).length,4);
 assert.equal(report.cumulativeMetrics.provider.meta.total,100);
 const repeat=await f.run();
 assert.equal(repeat.stopReason,'COMPLETE');
 assert.equal(repeat.completedRequests,0);
 assert.equal(repeat.totalCompletedUnique,100);
 assert.equal(f.calls.length,76);
 const productionHistory=await readRecordedAgentCases(f.historyDirectory);
 assert.equal(productionHistory.fingerprints.size,0,'Simulation may never count as real inference');
});

test('reserved duplicate is replaced with a genuinely new case, not counted as a completion',async t=>{
 const f=await simulatedAgentRun(t,{duplicate:1});
 const report=await f.run();
 assert.equal(report.stopReason,'COMPLETE');
 assert.equal(report.completedRequests,76);
 assert.equal(report.skippedCases.filter(c=>c.reason==='ALREADY_RESERVED_NO_RETRY').length,1);
 assert.equal(new Set(f.calls).size,76);
});

test('underfilled corpus never reports COMPLETE and timeout is persisted without retry',async t=>{
 const exhausted=await simulatedAgentRun(t,{blocked:424});
 const report=await exhausted.run();
 assert.equal(report.stopReason,'COMPLETE','A total target already achieved needs no request');
 const partial=await runPaidAgentEvaluation({...exhausted.config,targetTotal:null},exhausted.deps);
 assert.equal(partial.stopReason,'CORPUS_EXHAUSTED');
 assert.equal(partial.completedRequests,0);
 assert.equal(partial.remainingNewCompletions,100);
 const uncertain=await simulatedAgentRun(t,{error:true});
 const failure=await uncertain.run();
 assert.equal(failure.stopReason,'PROVIDER_OR_TRANSPORT_ERROR_NO_RETRY');
 assert.equal(failure.completedRequests,0);
 assert.equal(failure.results.length,1);
 assert.equal(failure.results[0].httpStatus,0);
 const history=await readRecordedAgentCases(uncertain.historyDirectory,{simulated:true});
 assert.ok(history.fingerprints.has(failure.results[0].caseFingerprint));
 assert.equal(history.completedFingerprints.size,24);
 const plan=planAgentEvaluation(uncertain.config,history);
 assert.ok(!plan.candidates.some(c=>c.caseFingerprint===failure.results[0].caseFingerprint));
});

test('malformed and transport replies remain explicit evaluation failures, never valid success',async t=>{
 const f=await simulatedAgentRun(t);
 let calls=0;
 f.deps.fetchImpl=async()=>new Response(JSON.stringify(calls++===0?null:{
  status:'PLAN',message:'Unsafe synthetic oracle',operations:[{op:'GO'}],
 }));
 const report=await runPaidAgentEvaluation({...f.config,cases:2,targetTotal:null,startIndex:28},f.deps);
 assert.equal(calls,2);
 assert.deepEqual(report.results.map(r=>r.result),['BAD_REPLY_SHAPE','MODEL_TRANSPORT']);
 assert.ok(report.results.every(r=>!r.valid&&!r.scored&&r.correct===null));
 assert.equal(report.providerMetrics.meta.validRate,0);
 assert.equal(report.providerMetrics.meta.correctRate,null);
 assert.equal(report.completedRequests,2,'A completed evaluation is not a correct or executable cue');
});

test('an upstream 402 stops the Meta provider with no retry and keeps the reservation',async t=>{
 const f=await simulatedAgentRun(t);
 let calls=0;
 f.deps.fetchImpl=async()=>{
  calls++;
  return new Response(JSON.stringify({error:'AI_PROVIDER_UNAVAILABLE',status:402}),{status:502});
 };
 const report=await runPaidAgentEvaluation({...f.config,cases:2,targetTotal:null},f.deps);
 assert.equal(calls,1);
 assert.equal(report.stopReason,'PROVIDER_BILLING_BLOCK');
 assert.equal(report.results[0].result,'UPSTREAM_BILLING_402');
 assert.equal(report.results[0].reservedMaximumUsd,0.15);
});
