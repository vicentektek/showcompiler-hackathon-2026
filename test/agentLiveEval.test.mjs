import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {acquireAgentEvalBudget} from '../tools/agentLiveBudget.mjs';
import {parseAgentLiveOptions,getAgentLiveScenario,
 judgeAgentLiveReply,runPaidAgentEvaluation,summarizeAgentLiveResults} from '../tools/runq-agent-live-eval.mjs';

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
