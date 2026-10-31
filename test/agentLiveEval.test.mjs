import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {acquireAgentEvalBudget} from '../tools/agentLiveBudget.mjs';
import {parseAgentLiveOptions,getAgentLiveScenario,
 judgeAgentLiveReply,runPaidAgentEvaluation} from '../tools/runq-agent-live-eval.mjs';

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
test('paired evaluation fixtures are independent and score proposed changes without execution',()=>{
 const a=getAgentLiveScenario(0),b=getAgentLiveScenario(0);
 assert.deepEqual(a.project,b.project);
 assert.equal(a.expected.kind,'CREATE_CUE');
 const creative={status:'PLAN',operations:Array.from({length:3},(_,i)=>({
  op:'CREATE_CUE',label:'Artistic closing '+i,afterCueId:null
 }))};
 const r=judgeAgentLiveReply(a,creative);
 assert.equal(r.correct,true);
 assert.equal(r.valid,true);
 assert.equal(a.project.cues.length,4,'Judging must not alter source');
 assert.equal(judgeAgentLiveReply(a,{status:'CLARIFY',operations:[]}).correct,false);
 assert.equal(judgeAgentLiveReply(getAgentLiveScenario(6),
  {status:'CLARIFY',operations:[]}).correct,true);
 const unsafe=judgeAgentLiveReply(a,{status:'PLAN',operations:[{op:'GO'}]});
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
