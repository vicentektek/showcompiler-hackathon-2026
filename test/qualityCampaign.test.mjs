import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildQualityMatrix} from '../src/qa/qualityMatrix.mjs';
import {runQualityCampaign,qualityPhases,qualityLivePreflight,
 qualityAttemptIdentity,validateQualityCandidate,STABLE_QUALITY_CANDIDATE} from '../tools/qualityCampaign.mjs';
import {parseQualityOptions,evaluateSavedQualityHistory} from '../tools/runq-quality-campaign.mjs';
import {measurePilotWav} from '../tools/runq-modal-live-batch.mjs';
import {CAMPAIGN_POLICY} from '../src/qa/campaignPolicy.mjs';

const matrix=buildQualityMatrix();
const options={id:'quality-test-run',origin:'http://127.0.0.1:5191',
 live:true,ackPaid:true,creditVerified:true};
const commit='a'.repeat(40);
function wav(seconds){
 const frames=16000*seconds,bytes=Buffer.alloc(44+frames*2);
 bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVE',8);
 bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);
 bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);
 bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);
 bytes.writeUInt32LE(frames*2,40);
 for(let i=44;i<bytes.length;i+=2)bytes.writeInt16LE(1000,i);
 return bytes;
}
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'runq-quality-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const deps={historyDirectory:join(directory,'history'),outputDirectory:join(directory,'out'),
  preflight:async()=>({commit}),simulated:true,wait:async()=>{}};
 const calls={meta:0,modal:0,refresh:0},jobs=new Map();
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
 deps.fetchImpl=async(url,request)=>{
  const path=new URL(url).pathname;
  assert.equal(new URL(url).origin,options.origin);
  if(path.startsWith('/api/meta/')||path==='/api/agent/interpret'){
   calls.meta++;
   const body=JSON.parse(request.body);
   const id=(body.project?.id??body.context.projectId).slice(3);
   const item=matrix.cases.find(c=>c.id===id);
   if(item.expected.kind==='EVENTS'){
    const events=item.expected.events;
    return json({proposals:events.filter(e=>e.transport==='PLAY').map(e=>({lineId:e.lineId})),
     proposalDetails:events.filter(e=>e.transport==='PLAY'),
     observations:events.filter(e=>e.transport!=='PLAY').map(e=>({...e,sourceLineId:e.lineId})),
     coverage:{complete:true}});
   }
   const expected=item.expected;
   if(['NO_PLAN','CLARIFY'].includes(expected.kind))return json({
    status:expected.kind==='CLARIFY'?'CLARIFY':'ANSWER',operations:[]});
   const operations=expected.kind==='CREATE'?Array.from({length:expected.count},(_,i)=>({
    op:'CREATE_CUE',afterCueId:null,label:'Placeholder '+i,
   })):expected.operations;
   return json({status:'PLAN',operations});
  }
  if(path==='/api/sfx/jobs'){
   calls.modal++;
   assert.equal([...jobs.values()].some(job=>['QUEUED','RUNNING'].includes(job.status)),false);
   const body=JSON.parse(request.body);
   assert.equal(body.confirmed,true);
   assert.equal(body.authorizationId,'owner-'+body.requestId);
   assert.equal(jobs.has(body.requestId),false);
   const job={...body,status:'QUEUED'};jobs.set(body.requestId,job);return json(job,202);
  }
  const parts=path.split('/'),id=parts[4],operation=parts[5],job=jobs.get(id);
  if(!job)return json({},404);
  if(operation==='refresh'){
   calls.refresh++;job.status='READY_FOR_REVIEW';
   job.wav=measurePilotWav(wav(job.durationSeconds),job.durationSeconds);
   return json(job);
  }
  if(operation==='audio')return new Response(wav(job.durationSeconds));
  return json(job);
 };
 return {directory,deps,calls,jobs};
}

test('phase layout is exactly 400/100; first 30 vary functions, languages and difficulty',()=>{
 const phases=qualityPhases(matrix);
 assert.equal(phases.reduce((total,p)=>total+p.cases.length,0),500);
 assert.equal(new Set(phases.flatMap(p=>p.cases.map(c=>c.id))).size,500);
 assert.ok(phases.slice(0,3).every(p=>p.cases.every(c=>c.split==='development')));
 assert.ok(phases[3].cases.every(c=>c.split==='holdout'));
});
test('paid/credit gates fail before transport, ledger or filesystem and disallow other providers',async()=>{
 let effects=0;
 await assert.rejects(()=>runQualityCampaign({...options,ackPaid:false},{
  fetchImpl:async()=>{effects++;},
 }),/OPERATOR_PAID_AND_CREDIT_ACK/);
 assert.equal(effects,0);
 assert.throws(()=>parseQualityOptions(['--live']),/OPERATOR_PAID/);
 assert.throws(()=>parseQualityOptions(['--providers','baseten']),/INVALID_QUALITY/);
 assert.throws(()=>parseQualityOptions(['--providers','fireworks']),/INVALID_QUALITY/);
});
test('preflight preserves authorized caps and requires genuine owner-provided current credit evidence',async()=>{
 let closed=0;
 const deps={commitIdentity:()=>commit,now:()=>new Date('2026-10-31T16:00:00Z'),
  ledgerFactory:async()=>({status:()=>({perProvider:{
   meta:{remainingUsd:1},modal:{remainingUsd:1}}}),close:async()=>{closed++;}})};
 await assert.rejects(()=>qualityLivePreflight(options,deps),/CURRENT_OPERATOR_CREDIT/);
 const creditRecord={policyRevision:CAMPAIGN_POLICY.revision,sourceCommit:commit,
  method:'AUTHENTICATED_PROVIDER_DASHBOARD',verifiedAt:'2026-10-31T15:00:00Z',
  providers:{meta:{currency:'USD',availableUsd:1},modal:{currency:'USD',availableUsd:1}}};
 const approved=await qualityLivePreflight({...options,creditRecord},deps);
 assert.equal(approved.commit,commit);assert.equal(closed,1);
 await assert.rejects(()=>qualityLivePreflight({...options,creditRecord:{
  ...creditRecord,verifiedAt:'2026-10-29T15:00:00Z'}},deps),/CURRENT_OPERATOR_CREDIT/);
});
test('30 simulated requests score contracts, resume and a new campaign never duplicate submissions',async t=>{
 const f=await fixture(t);
 const first=await runQualityCampaign(options,f.deps);
 assert.equal(first.results.length,30);assert.equal(f.calls.meta,30);
 assert.equal(first.stopReason,'PHASE_COMPLETE');
 assert.ok(first.results.every(r=>r.correct));
 const report=JSON.parse(await readFile(join(f.directory,'out',options.id+'-stable.json'),'utf8'));
 assert.equal(report.evidenceMode,'OFFLINE_SIMULATED_TRANSPORT');
 const again=await runQualityCampaign({...options,resume:true,phase:'meta-first-30'},f.deps);
 assert.equal(again.results.length,30);assert.equal(f.calls.meta,30);
 const another=await runQualityCampaign({...options,id:'quality-other-run'},f.deps);
 assert.equal(another.results.length,30);assert.equal(f.calls.meta,30);
 assert.equal(another.execution.newLocalSubmissionAttempts,0);
 assert.equal(another.execution.reusedResultCases,30);
 assert.equal((await readdir(join(f.directory,'history','attempts'))).length,30);
 const next=await runQualityCampaign({...options,resume:true},f.deps);
 assert.equal(next.results.length,100,'Plain resume selects the next incomplete phase');
 assert.equal(f.calls.meta,100);
});
test('uncertain Meta submission is persisted before POST and never replayed after timeout',async t=>{
 const f=await fixture(t);
 f.deps.fetchImpl=async()=>{
  f.calls.meta++;
  const paths=await readdir(join(f.directory,'history','attempts'));
  assert.equal(paths.length,1);
  const receipt=JSON.parse(await readFile(join(f.directory,'history','attempts',paths[0]),'utf8'));
  assert.equal(receipt.status,'SUBMISSION_UNKNOWN');
  throw new Error('PRIVATE_UPSTREAM_MATERIAL');
 };
 const first=await runQualityCampaign(options,f.deps);
 assert.equal(first.stopReason,'LOCAL_OR_TRANSPORT_UNCERTAIN');assert.equal(f.calls.meta,1);
 const resumed=await runQualityCampaign({...options,resume:true},f.deps);
 assert.equal(resumed.stopReason,'UNCERTAIN_META_NO_RESUBMISSION');assert.equal(f.calls.meta,1);
 const saved=await readFile(join(f.directory,'out',options.id+'-stable.json'),'utf8');
 assert.doesNotMatch(saved,/PRIVATE_UPSTREAM/);
});
test('all phases serialize Modal jobs, refresh to completion and preserve unique approvals',async t=>{
 const f=await fixture(t);
 const state=await runQualityCampaign({...options,continuous:true},f.deps);
 assert.equal(f.calls.meta,400);assert.equal(f.calls.modal,100);assert.equal(f.calls.refresh,100);
 assert.equal(state.results.length,500);
 assert.equal(state.stopReason,'CAMPAIGN_COMPLETE_PENDING_HUMAN_REVIEW');
 assert.equal(new Set([...f.jobs.values()].map(j=>j.authorizationId)).size,100);
 assert.equal(state.results.filter(r=>r.provider==='modal'&&r.reviewRequired).length,100);
 const resumed=await runQualityCampaign({...options,resume:true},f.deps);
 assert.equal(resumed.results.length,500);
 assert.equal(f.calls.meta,400);assert.equal(f.calls.modal,100);
});
test('candidate execution identity depends on actual instructions, not candidate ID, seed or random project ID',()=>{
 const item=matrix.cases.find(c=>c.endpoint==='agent');
 const baseline=qualityAttemptIdentity(item);
 const candidate={...STABLE_QUALITY_CANDIDATE,id:'candidate-001'};
 assert.equal(qualityAttemptIdentity(item,candidate),baseline);
 candidate.agentSuffix='Preserve unrequested cue properties.';
 assert.notEqual(qualityAttemptIdentity(item,candidate),baseline);
 const clone=structuredClone(item);clone.input.project.id='random-project';
 assert.equal(qualityAttemptIdentity(clone),baseline);
 assert.throws(()=>validateQualityCandidate({...candidate,autoMerge:true}),/INVALID_QUALITY_CANDIDATE/);
});
test('offline history explicitly excludes dry-run plans and does not claim unverifiable legacy accuracy',async t=>{
 const f=await fixture(t);
 const report=await evaluateSavedQualityHistory({jobDirectory:join(f.directory,'absent'),
  agentDirectory:join(f.directory,'absent'),systematicDirectory:join(f.directory,'absent'),
  outputDirectory:join(f.directory,'history-report')});
 assert.equal(report.summary.scored,0);assert.equal(report.summary.f1,null);
 assert.equal(report.historicalEvidence.improvement.newProviderRequests,0);
 assert.equal(report.historicalEvidence.improvement.originalWavsModified,false);
});
test('stale shared campaign lock fails closed without removing evidence or making a request',async t=>{
 const f=await fixture(t);
 await mkdir(f.deps.historyDirectory,{recursive:true});
 const path=join(f.deps.historyDirectory,'campaign.lock');
 await writeFile(path,'unresolved-owner');
 await assert.rejects(()=>runQualityCampaign(options,f.deps),{code:'EEXIST'});
 assert.equal(await readFile(path,'utf8'),'unresolved-owner');
 assert.deepEqual(f.calls,{meta:0,modal:0,refresh:0});
});
