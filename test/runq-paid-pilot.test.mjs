import test from 'node:test';
import assert from 'node:assert/strict';
import {PILOT_LIMITS,parsePaidPilotOptions,estimateBasetenReserve,
 enforcePilotAllowance,runPaidPilot} from '../tools/runq-paid-pilot.mjs';

const minimalPrepared=()=>({
 request:{
  model:'muse-spark-1.3',stream:false,store:false,
  reasoning_effort:'low',max_completion_tokens:2048,
  messages:[{role:'system',content:'Only sound cues'},{role:'user',content:'L1 A door slams'}],
  response_format:{json_schema:{strict:true,schema:{
   properties:{proposals:{items:{properties:{
    sourceLineId:{type:'string'},transport:{type:'string'},
   }}}}
  }}},
 }
});

test('pilot caps are 8 Meta, 5 Baseten, 2 Modal; voice never silently included',()=>{
 assert.deepEqual(PILOT_LIMITS,{meta:8,baseten:5,modal:2});
 assert.throws(()=>parsePaidPilotOptions(['--provider','voice']));
});

test('without paid flags, the pilot CLI only plans and never authorizes spending',()=>{
 const plan=parsePaidPilotOptions(['--provider','meta','--requests','8']);
 assert.equal(plan.live,false);
 assert.equal(plan.dashboardVerified,false);
 assert.equal(plan.requests,8);
});

test('paid mode requires both live flags and provider dashboard verification',()=>{
 for(const args of [
  ['--live'],
  ['--ack-paid'],
  ['--live','--ack-paid'],
  ['--live','--dashboard-verified'],
 ]){
  assert.throws(()=>parsePaidPilotOptions(['--provider','meta',...args]));
 }
 const accepted=parsePaidPilotOptions([
  '--provider','baseten','--requests','5',
  '--live','--ack-paid','--dashboard-verified',
 ]);
 assert.equal(accepted.live,true);
 assert.equal(accepted.dashboardVerified,true);
});

test('unknown flags, repeated flags and large batches fail before provider access',()=>{
 for(const args of [
  ['--provider','meta','--requests','9'],
  ['--provider','baseten','--requests','6'],
  ['--provider','modal','--requests','3'],
  ['--provider','meta','--requests','0'],
  ['--provider','meta','--requests','-2'],
  ['--provider','meta','--requests','1.1'],
  ['--provider','meta','--requests','NaN'],
  ['--provider','meta','--requests','Infinity'],
  ['--provider','meta','--budget-usd','40'],
  ['--provider','meta','--provider','baseten'],
 ]){
  assert.throws(()=>parsePaidPilotOptions(args),args.join(' '));
 }
});

test('Modal pilot accepts only fixed SFX prompts, without arbitrary source cases or AI mode',()=>{
 assert.equal(parsePaidPilotOptions(['--provider','modal']).provider,'modal');
 assert.throws(()=>parsePaidPilotOptions(['--provider','modal','--mode','expressive']));
 assert.throws(()=>parsePaidPilotOptions(['--provider','modal','--case','hotel-door']));
});

test('Baseten preflight reserve is positive and bounded for a valid prepared request',()=>{
 const value=estimateBasetenReserve(minimalPrepared());
 assert.ok(value>0.03&&value<0.2);
});

test('pilot quota cannot be evaded by running multiple separate processes',()=>{
 const opts=parsePaidPilotOptions(['--provider','meta','--requests','2']);
 const status={perProvider:{meta:{requestCount:7,capUsd:12,reservedUsd:1}}};
 assert.throws(()=>enforcePilotAllowance(opts,status),/PILOT_CALL_QUOTA_EXHAUSTED/);
 opts.requests=1;
 assert.equal(enforcePilotAllowance(opts,status),1);
});

test('provider exhaustion blocks further requests even if pilot quota remains',()=>{
 const opts=parsePaidPilotOptions(['--provider','baseten','--requests','1']);
 assert.throws(()=>enforcePilotAllowance(opts,{
  perProvider:{baseten:{requestCount:0,capUsd:8,reservedUsd:8}}
 }),/PROVIDER_BUDGET_EXHAUSTED/);
});

test('paid pilot function denies calls without the explicit operator flags',async()=>{
 await assert.rejects(
  runPaidPilot({provider:'meta',requests:1,live:false,ackPaid:false,dashboardVerified:false}),
  /EXPLICIT_LIVE_ACK_AND_DASHBOARD_CHECK_REQUIRED/
 );
});
