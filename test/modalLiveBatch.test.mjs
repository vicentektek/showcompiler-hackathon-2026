import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MODAL_PILOT_CASES,parseModalBatchOptions,runModalBatch,measurePilotWav}
 from '../tools/runq-modal-live-batch.mjs';
import {createAppServer} from '../tools/dev-server.mjs';
import {createSfxJobStore} from '../src/core/sfxJobStore.mjs';

const config={live:true,ackPaid:true,creditVerified:true,count:2,port:5191};
const model='stabilityai/stable-audio-3-small-sfx',revision='a'.repeat(40);
function wav(seconds=4,value=1000){
 const samples=16000*seconds,bytes=Buffer.alloc(44+samples*2);
 bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVE',8);
 bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);
 bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);
 bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);
 bytes.writeUInt32LE(samples*2,40);
 for(let i=44;i<bytes.length;i+=2)bytes.writeInt16LE(value,i);
 return bytes;
}
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'runq-modal-batch-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const jobs=new Map(),calls={start:0,refresh:0};
 const fake=async(url,options)=>{
  const path=new URL(url).pathname;
  assert.equal(new URL(url).origin,'http://127.0.0.1:5191');
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
  if(path==='/api/sfx/status')return json({enabled:true,model,modelRevision:revision,
   estimatedMaxCostUsdPerRequest:0.05});
  if(path==='/api/sfx/jobs'){
   calls.start++;
   const body=JSON.parse(options.body);
   assert.equal(body.confirmed,true);assert.equal(body.acknowledgedMaxCostUsd,0.05);
   assert.equal(body.authorizationId,'owner-'+body.requestId);
   assert.equal(jobs.has(body.requestId),false);
   const entry={...body,modelRevision:revision,status:'QUEUED'};
   jobs.set(body.requestId,entry);return json(entry,202);
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
 return {directory,jobs,calls,fake,
  deps:{directory,fetchImpl:fake,preflight:async()=>{},wait:async()=>{}}};
}

test('paid batch requires all operator flags before file, network or ledger side effects',async()=>{
 let calls=0;
 for(const name of ['live','ackPaid','creditVerified']){
  await assert.rejects(()=>runModalBatch({...config,[name]:false},{
   fetchImpl:async()=>{calls++;},preflight:async()=>{calls++;},
  }),/OPERATOR_LIVE_ACK/);
 }
 assert.equal(calls,0);
 assert.throws(()=>parseModalBatchOptions(['--live','--ack-paid','--credit-verified','--count','100']));
 assert.throws(()=>parseModalBatchOptions(['--live','--ack-paid','--credit-verified','--providers','baseten']));
});
test('automated pilot validates original WAVs and resumes without submitting a completed case again',async t=>{
 const f=await fixture(t);
 const first=await runModalBatch(config,f.deps);
 assert.equal(first.submittedThisRun,2);assert.equal(first.stopReason,'COMPLETE');
 assert.equal(first.cases.length,2);assert.equal(f.calls.start,2);
 assert.ok(first.cases.every(c=>c.status==='WAV_VERIFIED'&&c.reviewRequired));
 assert.ok(first.cases.every(c=>c.metrics.durationMatches&&c.actualBilledUsd===null));
 const second=await runModalBatch(config,f.deps);
 assert.equal(second.submittedThisRun,0);assert.equal(f.calls.start,2);
 const file=join(f.directory,MODAL_PILOT_CASES[0].id+'.wav');
 await writeFile(file,wav(4,2000));
 await assert.rejects(()=>runModalBatch(config,f.deps),/SAVED_WAV_CHANGED/);
 assert.equal(f.calls.start,2);
});
test('uncertain submission never retries even when the local job is absent',async t=>{
 const f=await fixture(t);
 const transport=async(url,options)=>{
  if(new URL(url).pathname==='/api/sfx/jobs'){f.calls.start++;throw new Error('timeout');}
  return f.fake(url,options);
 };
 const first=await runModalBatch(config,{...f.deps,fetchImpl:transport});
 assert.equal(first.cases[0].status,'SUBMISSION_UNKNOWN');
 assert.equal(first.cases[1].status,'NOT_EXECUTED');
 assert.equal(f.calls.start,1);
 const resumed=await runModalBatch(config,{...f.deps,fetchImpl:transport});
 assert.equal(resumed.stopReason,'UNCERTAIN_SUBMISSION_NO_RESUBMIT');
 assert.equal(f.calls.start,1);
});
test('a bounded poll resumes the original queued ID without resubmission',async t=>{
 const f=await fixture(t);
 const transport=async(url,options)=>{
  if(new URL(url).pathname.endsWith('/refresh')){
   f.calls.refresh++;
   return new Response(JSON.stringify(f.jobs.get(MODAL_PILOT_CASES[0].id)));
  }
  return f.fake(url,options);
 };
 const first=await runModalBatch(config,{...f.deps,fetchImpl:transport,maxPolls:2});
 assert.equal(first.stopReason,'POLL_BOUND_REACHED_NO_RESUBMISSION');
 assert.equal(f.calls.start,1);assert.equal(f.calls.refresh,2);
 const resumed=await runModalBatch(config,f.deps);
 assert.equal(resumed.stopReason,'COMPLETE');
 assert.equal(f.calls.start,2,'Only the previously unexecuted second case is submitted');
 assert.equal(resumed.cases[0].status,'WAV_VERIFIED');
});
test('budget denial and stale batch locks fail closed without generation',async t=>{
 const f=await fixture(t);
 await assert.rejects(()=>runModalBatch(config,{...f.deps,preflight:async()=>{throw new Error('cap');}}),/cap/);
 assert.equal(f.calls.start,0);
 await writeFile(join(f.directory,'batch.lock'),'unknown owner');
 await assert.rejects(()=>runModalBatch(config,f.deps),{code:'EEXIST'});
 assert.equal(await readFile(join(f.directory,'batch.lock'),'utf8'),'unknown owner');
 assert.equal(f.calls.start,0);
});
test('technical audio metrics do not fabricate semantic, artistic or distortion quality',()=>{
 const silence=measurePilotWav(wav(4,0),4),clipping=measurePilotWav(wav(4,32767),4);
 assert.equal(silence.suspectedWholeFileSilence,true);assert.equal(silence.rmsDbfs,null);
 assert.equal(clipping.clippedFraction,1);
 assert.equal(clipping.artisticReview,'PENDING_HUMAN_LISTENING');
 assert.equal(clipping.distortion,'NOT_DETERMINED_BY_PCM_METRICS');
 assert.equal(measurePilotWav(wav(3),4).durationMatches,false);
});
test('nine serial cases use real local routes, distinct approvals and shared journal without changing a show',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'runq-modal-http-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=createSfxJobStore({directory:join(directory,'jobs'),maxDailyStarts:10});
 const outputs=new Map();let starts=0,reserves=0;
 const server=createAppServer({
  sfxStore:store,reserveCampaign:async()=>{reserves++;},
  sfxConfig:()=>({enabled:true,modelRevision:revision,
   estimatedMaxCostUsdPerRequest:0.05,dailyBudgetUsd:0.5}),
  sfxPilotClient:{
   async start(plan,{requestId}){
    starts++;outputs.set(requestId,wav(plan.durationSeconds));
    return {jobId:requestId,status:'QUEUED'};
   },
   async status(id){
    return {jobId:id,status:'COMPLETED',wav:measurePilotWav(outputs.get(id),4)};
   },
   async download(id){
    const bytes=outputs.get(id);return {bytes,metadata:measurePilotWav(bytes,4)};
   },
  },
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const result=await runModalBatch({...config,count:9,port:server.address().port},{
  directory:join(directory,'receipts'),preflight:async()=>{},wait:async()=>{},
 });
 assert.equal(result.stopReason,'COMPLETE');
 assert.equal(result.submittedThisRun,9);assert.equal(starts,9);assert.equal(reserves,9);
 assert.equal((await store.list()).jobs.length,9);
 assert.ok(result.cases.every(c=>c.metrics.durationMatches&&c.status==='WAV_VERIFIED'));
 const repeat=await runModalBatch({...config,count:9,port:server.address().port},{
  directory:join(directory,'receipts'),preflight:async()=>{},wait:async()=>{},
 });
 assert.equal(repeat.submittedThisRun,0);assert.equal(starts,9);
});
