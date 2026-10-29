import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PILOT_LIMITS,parsePaidPilotOptions,estimateBasetenReserve,
 enforcePilotAllowance,runPaidPilot} from '../tools/runq-paid-pilot.mjs';

const pinnedSha='a'.repeat(40);

function createPilotLedger({initialReservedUsd=0,initialRequestCount=0,
 reservationAccepted=true,closeError=null}={}){
 let reservedUsd=initialReservedUsd,requestCount=initialRequestCount,closed=false,reserveAttempts=0;
 return {
  status:()=>({reservedUsd,perProvider:{
   meta:{requestCount,capUsd:12,reservedUsd},
   baseten:{requestCount:0,capUsd:8,reservedUsd:0},
   modal:{requestCount:0,capUsd:8,reservedUsd:0},
  }}),
  reserve:async({provider,estimatedMaximumUsd})=>{
   reserveAttempts++;
   assert.equal(provider,'meta');
   if(!reservationAccepted)return {accepted:false,reason:'BUDGET_LIMIT'};
   reservedUsd+=estimatedMaximumUsd;requestCount++;
   return {accepted:true};
  },
  close:async()=>{closed=true;if(closeError)throw closeError;},
  wasClosed:()=>closed,
  reserveAttempts:()=>reserveAttempts,
 };
}

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
 assert.throws(()=>parsePaidPilotOptions(['meta','1','hotel-door']),
  /NPM_ARGUMENTS_STRIPPED_USE_DIRECT_NODE/);
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
 await assert.rejects(runPaidPilot({
  provider:'voice',requests:1,mode:'literal',caseId:null,
  live:true,ackPaid:true,dashboardVerified:true,
 }),/INVALID_PAID_PILOT_OPTIONS/);
});

test('hotel-door simulated pilot creates its missing artifacts parent and calls Meta once',async()=>{
 const runtimeRoot=await mkdtemp(join(tmpdir(),'runq-paid-pilot-'));
 const ledger=createPilotLedger();
 let modelCalls=0;
 try{
  const result=await runPaidPilot({
   provider:'meta',requests:1,mode:'literal',caseId:'hotel-door',
   live:true,ackPaid:true,dashboardVerified:true,
  },{
   runtimeRoot,workingDirectory:runtimeRoot,env:{MODEL_API_KEY:'offline-test-key'},
   commitIdentityFn:()=>pinnedSha,
   runIdFactory:()=> 'pilot_missing_artifacts_parent',
   ledgerFactory:async()=>ledger,
   metaRunner:async({ledger:guardedLedger,caseId,maxRequests})=>{
    assert.equal(caseId,'hotel-door');assert.equal(maxRequests,1);
    assert.equal(await guardedLedger.reserve(0.05),true);
    modelCalls++;
    return {haltReason:null};
   },
  });
  assert.equal(modelCalls,1);
  assert.equal(ledger.reserveAttempts(),1);
  assert.equal(result.reservedRequestSlots,1);
  assert.equal(result.outcome,'PILOT_COMPLETED_REQUIRES_DASHBOARD_REVIEW');
  const report=JSON.parse(await readFile(join(runtimeRoot,result.reportPath,'pilot-result.json'),'utf8'));
  assert.equal(report.caseId,'hotel-door');
 }finally{
  assert.equal(ledger.wasClosed(),true);
  await rm(runtimeRoot,{recursive:true,force:true});
 }
});

test('exhausted preflight writes a safe report with zero reserves and zero provider calls',async()=>{
 const runtimeRoot=await mkdtemp(join(tmpdir(),'runq-paid-pilot-'));
 const ledger=createPilotLedger({initialReservedUsd:12});
 let runnerCalls=0;
 try{
  await assert.rejects(runPaidPilot({
   provider:'meta',requests:1,mode:'literal',caseId:'hotel-door',
   live:true,ackPaid:true,dashboardVerified:true,
  },{
   runtimeRoot,workingDirectory:runtimeRoot,env:{MODEL_API_KEY:'offline-test-key'},
   commitIdentityFn:()=>pinnedSha,
   runIdFactory:()=> 'pilot_preflight_rejected',
   ledgerFactory:async()=>ledger,
   metaRunner:async()=>{runnerCalls++;throw new Error('SHOULD_NOT_CALL');},
  }),/PROVIDER_BUDGET_EXHAUSTED/);
  assert.equal(ledger.reserveAttempts(),0);
  assert.equal(runnerCalls,0);
  const path=join(runtimeRoot,'artifacts','pilot-preflight-rejected','pilot-result.json');
  const report=JSON.parse(await readFile(path,'utf8'));
  assert.equal(report.reservedRequestSlots,0);
  assert.deepEqual(report.failure,{
   phase:'PILOT_ALLOWANCE',category:'BUDGET_GUARD',code:'PROVIDER_BUDGET_EXHAUSTED',
   errorClass:'Error',safeDescription:'Local budget or pilot quota guard stopped the run.',
   reservationState:'NO_RESERVATION_RECORDED',
  });
 }finally{
  assert.equal(ledger.wasClosed(),true);
  await rm(runtimeRoot,{recursive:true,force:true});
 }
});

test('a rejected Meta reservation prevents the simulated provider call',async()=>{
 const runtimeRoot=await mkdtemp(join(tmpdir(),'runq-paid-pilot-'));
 const ledger=createPilotLedger({reservationAccepted:false});
 let providerCalls=0;
 try{
  const result=await runPaidPilot({
   provider:'meta',requests:1,mode:'literal',caseId:'hotel-door',
   live:true,ackPaid:true,dashboardVerified:true,
  },{
   runtimeRoot,workingDirectory:runtimeRoot,env:{MODEL_API_KEY:'offline-test-key'},
   commitIdentityFn:()=>pinnedSha,
   runIdFactory:()=> 'pilot_reservation_rejected',ledgerFactory:async()=>ledger,
   metaRunner:async({ledger:guardedLedger})=>{
    if(await guardedLedger.reserve(0.05))providerCalls++;
    return {haltReason:'GLOBAL_BUDGET_REACHED'};
   },
  });
  assert.equal(ledger.reserveAttempts(),1);
  assert.equal(providerCalls,0);
  assert.equal(result.reservedRequestSlots,0);
  assert.equal(result.outcome,'STOPPED_REQUIRES_REVIEW');
 }finally{
  assert.equal(ledger.wasClosed(),true);
  await rm(runtimeRoot,{recursive:true,force:true});
 }
});

test('pilot diagnostics never persist raw error messages, paths or secrets',async()=>{
 const runtimeRoot=await mkdtemp(join(tmpdir(),'runq-paid-pilot-'));
 const ledger=createPilotLedger();
 const privateText='C:\\private\\MODEL_API_KEY=do-not-save';
 try{
  await assert.rejects(runPaidPilot({
   provider:'meta',requests:1,mode:'literal',caseId:'hotel-door',
   live:true,ackPaid:true,dashboardVerified:true,
  },{
   runtimeRoot,workingDirectory:runtimeRoot,env:{MODEL_API_KEY:'offline-test-key'},
   commitIdentityFn:()=>pinnedSha,
   runIdFactory:()=> 'pilot_safe_diagnostic',ledgerFactory:async()=>ledger,
   metaRunner:async()=>{const error=new Error(privateText);error.code='ENOENT';throw error;},
  }));
  const raw=await readFile(join(runtimeRoot,'artifacts','pilot-safe-diagnostic','pilot-result.json'),'utf8');
  assert.doesNotMatch(raw,/do-not-save|MODEL_API_KEY|C:\\\\private/);
  const report=JSON.parse(raw);
  assert.equal(report.failure.phase,'META_EVALUATION');
  assert.equal(report.failure.category,'LOCAL_FILESYSTEM');
  assert.equal(report.failure.code,'ENOENT');
  assert.equal(report.failure.reservationState,'NO_RESERVATION_RECORDED');
 }finally{
  assert.equal(ledger.wasClosed(),true);
  await rm(runtimeRoot,{recursive:true,force:true});
 }
});

test('Git freeze failure is reported before opening or reserving the ledger',async()=>{
 const runtimeRoot=await mkdtemp(join(tmpdir(),'runq-paid-pilot-'));
 let ledgerOpens=0;
 try{
  await assert.rejects(runPaidPilot({
   provider:'meta',requests:1,mode:'literal',caseId:'hotel-door',
   live:true,ackPaid:true,dashboardVerified:true,
  },{
   runtimeRoot,workingDirectory:runtimeRoot,env:{MODEL_API_KEY:'offline-test-key'},
   runIdFactory:()=> 'pilot_git_freeze_failed',
   commitIdentityFn:()=>{throw new Error('TRACKED_FILES_DIRTY_FREEZE_CHECKOUT_BEFORE_PAID_TESTS');},
   ledgerFactory:async()=>{ledgerOpens++;throw new Error('SHOULD_NOT_OPEN');},
  }),/TRACKED_FILES_DIRTY/);
  assert.equal(ledgerOpens,0);
  const report=JSON.parse(await readFile(join(runtimeRoot,'artifacts','pilot-git-freeze-failed',
   'pilot-result.json'),'utf8'));
  assert.equal(report.failure.phase,'GIT_FREEZE');
  assert.equal(report.failure.code,'TRACKED_FILES_DIRTY_FREEZE_CHECKOUT_BEFORE_PAID_TESTS');
  assert.equal(report.reservedRequestSlots,0);
 }finally{await rm(runtimeRoot,{recursive:true,force:true});}
});

test('ledger open failure has a precise phase and never reaches the provider',async()=>{
 const runtimeRoot=await mkdtemp(join(tmpdir(),'runq-paid-pilot-'));
 let providerCalls=0;
 try{
  await assert.rejects(runPaidPilot({
   provider:'meta',requests:1,mode:'literal',caseId:'hotel-door',
   live:true,ackPaid:true,dashboardVerified:true,
  },{
   runtimeRoot,workingDirectory:runtimeRoot,env:{MODEL_API_KEY:'offline-test-key'},
   runIdFactory:()=> 'pilot_ledger_open_failed',commitIdentityFn:()=>pinnedSha,
   ledgerFactory:async()=>{throw new Error('CAMPAIGN_GLOBAL_LOCKED');},
   metaRunner:async()=>{providerCalls++;},
  }),/CAMPAIGN_GLOBAL_LOCKED/);
  assert.equal(providerCalls,0);
  const report=JSON.parse(await readFile(join(runtimeRoot,'artifacts','pilot-ledger-open-failed',
   'pilot-result.json'),'utf8'));
  assert.equal(report.failure.phase,'LEDGER_OPEN');
  assert.equal(report.failure.category,'LEDGER_GUARD');
  assert.equal(report.failure.code,'CAMPAIGN_GLOBAL_LOCKED');
 }finally{await rm(runtimeRoot,{recursive:true,force:true});}
});

test('ledger close failure is preserved without hiding reservation uncertainty or secrets',async()=>{
 const runtimeRoot=await mkdtemp(join(tmpdir(),'runq-paid-pilot-'));
 const closeError=new Error('C:\\private\\ledger-secret');closeError.code='EPERM';
 const ledger=createPilotLedger({closeError});
 try{
  await assert.rejects(runPaidPilot({
   provider:'meta',requests:1,mode:'literal',caseId:'hotel-door',
   live:true,ackPaid:true,dashboardVerified:true,
  },{
   runtimeRoot,workingDirectory:runtimeRoot,env:{MODEL_API_KEY:'offline-test-key'},
   runIdFactory:()=> 'pilot_ledger_close_failed',commitIdentityFn:()=>pinnedSha,
   ledgerFactory:async()=>ledger,
   metaRunner:async({ledger:guardedLedger})=>{
    assert.equal(await guardedLedger.reserve(0.05),true);return {haltReason:null};
   },
  }),/LEDGER_CLOSE_FAILED/);
  const raw=await readFile(join(runtimeRoot,'artifacts','pilot-ledger-close-failed',
   'pilot-result.json'),'utf8');
  assert.doesNotMatch(raw,/ledger-secret|C:\\\\private/);
  const report=JSON.parse(raw);
  assert.equal(report.failure.phase,'LEDGER_CLOSE');
  assert.equal(report.failure.category,'LEDGER_GUARD');
  assert.equal(report.failure.reservationState,'RESERVATION_RECORDED_RECONCILE_REQUIRED');
  assert.equal(report.ledgerCloseFailure.code,'EPERM');
  assert.equal(report.reservedRequestSlots,1);
 }finally{
  assert.equal(ledger.wasClosed(),true);
  await rm(runtimeRoot,{recursive:true,force:true});
 }
});
