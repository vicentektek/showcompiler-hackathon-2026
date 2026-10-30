import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureOfflineSteps,AI_PREFLIGHT_STEPS} from '../tools/runq-ai-preflight.mjs';
import {parseAiCampaignOptions,buildAiManifest,analyzeAiPaidReports,
 formatAiCampaignReport,runAiCampaign} from '../tools/runq-ai-campaign.mjs';

const options=(more=[])=>parseAiCampaignOptions(more);
const row=(id,provider,{language='es',category='closing',status=200,
 correct=true,valid=true,reviewRequired=false,reason='CORRECT'}={})=>({
 id,provider,language,category,httpStatus:status,latencyMs:120,
 correct,valid,resolved:true,result:reason,reviewRequired});
const report=(rows,{seed=20261031,stopReason='COMPLETE'}={})=>({
 version:2,realProviderEvaluations:true,strictlySyntheticFixtures:true,
 seed,startIndex:0,stopReason,results:rows});
const corpus=(num=100)=>Array.from({length:num},(_,i)=>row('paid-'+String(i+1).padStart(4,'0'),
 'meta',{language:i%2?'en':'es',category:[
 'closing','followup','delete','reorder','rename','summary',
 'negative','missing','voice','audio'][Math.floor(i/2)%10]}));

test('paid options require both authorization flags and a full bilingual matrix',()=>{
 assert.equal(options([]).live,false);
 assert.equal(options([]).cases,40);
 assert.equal(options(['--report-only']).reportOnly,true);
 assert.throws(()=>options(['--live']),/PAID_AUTHORIZATION_MISMATCH/);
 assert.throws(()=>options(['--ack-paid']),/PAID_AUTHORIZATION_MISMATCH/);
 assert.throws(()=>options(['--report-only','--live','--ack-paid']));
 assert.throws(()=>options(['--cases','30','--live','--ack-paid']),
  /PAID_MATRIX_REQUIRES_COMPLETE_BILINGUAL_CYCLES/);
 assert.throws(()=>options(['--cases','40','--budget-usd','120']),
  /INVALID_AGENT_LIVE_EVAL_CONFIG/);
 assert.equal(options(['--cases','80','--live','--ack-paid']).live,true);
});
test('manifest uses 10 categories across ES/EN with source-stable hash and no text',()=>{
 const first=buildAiManifest(options([]));
 const again=buildAiManifest(options([]));
 assert.equal(first.hash,again.hash);
 assert.equal(first.completeMatrix,true);
 assert.equal(first.manifest.requests,40);
 assert.equal(first.manifest.cases.length,20);
 assert.equal(new Set(first.manifest.cases.map(x=>x.id)).size,20);
 assert.ok(!JSON.stringify(first.manifest).includes('Esta noche'));
 assert.ok(!JSON.stringify(first.manifest).includes('Tonight'));
 const other=buildAiManifest(options(['--start-index','20']));
 assert.notEqual(first.hash,other.hash);
 assert.equal(first.manifest.cases.filter(x=>x.historyTurns>0).length,2);
});

test('preflight refuses disguised paid scripts without --live, not just paid flags',()=>{
 assert.equal(ensureOfflineSteps(AI_PREFLIGHT_STEPS).length,8);
 const forged=AI_PREFLIGHT_STEPS.map(x=>({...x}));
 forged[0].command='qa:meta:live';
 assert.throws(()=>ensureOfflineSteps(forged),/PREFLIGHT_CONTAINS_PAID_ACTION/);
 const corrupt=AI_PREFLIGHT_STEPS.map(x=>({...x}));
 corrupt[3].args=['--','--live','--ack-paid'];
 assert.throws(()=>ensureOfflineSteps(corrupt),/PREFLIGHT_CONTAINS_PAID_ACTION/);
});

test('analyzer separates HTTP failures from scored quality and flags human review',()=>{
 const a=row('paid-0001','meta');
 const b=row('paid-0002','meta',{status:429,correct:false,valid:false,
  reason:'UPSTREAM_AUTH_OR_RATE_429'});
 const c=row('paid-0003','meta',{correct:null,reviewRequired:true,reason:'ARTISTIC_REVIEW_REQUIRED'});
 const result=analyzeAiPaidReports({reports:[{filename:'eval-1-1.json',
  report:report([a,b,c])}],warnings:[]},{preflightPassed:true,providers:['meta']});
 assert.equal(result.byProvider.meta.attempts,3);
 assert.equal(result.byProvider.meta.successfulHttp,2);
 assert.equal(result.byProvider.meta.scored,1);
 assert.equal(result.byProvider.meta.correctRate,100);
 assert.equal(result.byProvider.meta.reviewRequired,1);
 assert.equal(result.status,'NEEDS_EVIDENCE');
 assert.match(formatAiCampaignReport(result),/revisión humana/i);
});

test('analyzer compares matching pairs only and never counts duplicated paid evidence',()=>{
 const caseA=row('paid-0001','meta');
 const caseB=row('paid-0001','baseten',{correct:false,reason:'WRONG_PLAN'});
 const result=analyzeAiPaidReports({reports:[
  {filename:'eval-1-1.json',report:report([caseA,caseB])},
  {filename:'eval-2-1.json',report:report([caseA])}
 ],warnings:[]},{preflightPassed:true});
 assert.equal(result.matchedPairs,1);
 assert.equal(result.disagreements.length,1);
 assert.equal(result.duplicates.length,1);
 assert.equal(result.status,'BLOCKED');
});

test('analyzer refuses to pool different experiment seeds or remote unknown outcomes',()=>{
 const base=report([row('paid-0001','meta')]);
 const unrelated=report([row('paid-0001','meta')],{seed:123});
 const unknown=report([row('paid-0002','baseten',{
  status:0,correct:false,valid:false,reason:'AbortError'})],
  {stopReason:'UNKNOWN_REMOTE_OUTCOME'});
 const result=analyzeAiPaidReports({reports:[
  {filename:'eval-1-1.json',report:base},
  {filename:'eval-2-1.json',report:unrelated},
  {filename:'eval-3-1.json',report:unknown}
 ],warnings:[]},{preflightPassed:true});
 assert.equal(result.attempted,2);
 assert.equal(result.status,'BLOCKED');
 assert.ok(result.nextActions.some(x=>x.includes('resultado remoto incierto')));
});

test('sufficient paired reports can reach automated gates, never full professional certification',()=>{
 const meta=corpus();
 const baseten=meta.map(x=>({...x,provider:'baseten'}));
 const analyzed=analyzeAiPaidReports({reports:[
  {filename:'eval-1-1.json',report:report([...meta,...baseten])}
 ],warnings:[]},{preflightPassed:true});
 assert.equal(analyzed.status,'AUTOMATED_GATES_PASS');
 assert.equal(analyzed.automaticQualitySufficient,true);
 assert.equal(analyzed.manualAcceptanceRequired,true);
 assert.equal(analyzed.matchedPairs,100);
 assert.equal(analyzed.byProvider.meta.scored,100);
});

test('default campaign performs preflight, writes review queue and never runs paid provider',async()=>{
 const tmp=await mkdtemp(join(tmpdir(),'runq-ai-campaign-'));
 let paid=0,offline=0;
 try{
  const result=await runAiCampaign(options([]),{
   preflight:async()=>{offline++;return {passed:true};},
   paidRunner:async()=>{paid++;throw new Error('NO_PAID_ALLOWED');},
   reportsReader:async()=>({reports:[],warnings:[]}),
   outputDir:tmp
  });
  assert.equal(offline,1);
  assert.equal(paid,0);
  assert.equal(result.summary.paidExecutionAuthorized,false);
  assert.equal(result.summary.stage,'READY_FOR_OPERATOR_REVIEW');
  assert.equal(result.summary.status,'NEEDS_EVIDENCE');
  const markdown=await readFile(join(result.directory,'summary.md'),'utf8');
  assert.ok(markdown.includes('Autopiloto'));
  assert.ok(markdown.includes('Modal'));
  const csv=await readFile(join(result.directory,'review-queue.csv'),'utf8');
  assert.ok(csv.startsWith('caseId,provider,language'));
 }finally{await rm(tmp,{recursive:true,force:true});}
});

test('offline failure blocks paid campaign despite both live authorization flags',async()=>{
 const tmp=await mkdtemp(join(tmpdir(),'runq-ai-paid-stop-'));
 let paid=0;
 try{
  const result=await runAiCampaign(options(['--live','--ack-paid']),{
   preflight:async()=>({passed:false}),
   paidRunner:async()=>{paid++;return {stopReason:'COMPLETE',attemptedRequests:40};},
   reportsReader:async()=>({reports:[],warnings:[]}),outputDir:tmp
  });
  assert.equal(paid,0);
  assert.equal(result.summary.status,'BLOCKED');
  assert.equal(result.summary.stage,'OFFLINE_GATE_FAILED');
 }finally{await rm(tmp,{recursive:true,force:true});}
});

test('report-only mode never calls preflight or providers',async()=>{
 const tmp=await mkdtemp(join(tmpdir(),'runq-ai-report-only-'));
 try{
  const result=await runAiCampaign(options(['--report-only']),{
   preflight:async()=>{throw new Error('OFFLINE_NOT_REQUESTED');},
   paidRunner:async()=>{throw new Error('PAID_NOT_REQUESTED');},
   reportsReader:async()=>({reports:[],warnings:[]}),outputDir:tmp
  });
  assert.equal(result.summary.stage,'DRY_RUN');
 }finally{await rm(tmp,{recursive:true,force:true});}
});
