import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSfxJobStore} from '../src/core/sfxJobStore.mjs';

test('simple sound creator permits successive explicitly confirmed takes within $0.50 USD budget, not infinite attempts',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'runq-sfx-simple-'));
 try{
  const store=createSfxJobStore({directory,clock:()=>new Date('2026-10-29T17:00:00Z')});
  const request=(n)=>({
    requestId:'test-take-'+n,authorizationId:'test-auth-'+n,
    sourceLineId:null,kind:'SFX',prompt:'One bronze bell strike',durationSeconds:3,
    seed:100+n,modelCandidate:'stabilityai/stable-audio-3-small-sfx',
    modelRevision:'a'.repeat(40),estimatedMaxCostUsdPerRequest:0.05,
    dailyBudgetUsd:0.5,acknowledgedMaxCostUsd:0.05,
  });
  for(let n=1;n<=10;n++){
    const j=await store.reserve(request(n),{confirm:true});
    assert.equal(j.status,'SUBMISSION_UNKNOWN');
    await store.update(j.requestId,'QUEUED',{remoteJobId:'modal-take-'+n});
    await store.update(j.requestId,'FAILED'); // terminal test state, still counts against daily cap
  }
  await assert.rejects(store.reserve(request(11),{confirm:true}),
    error=>error.code==='SFX_DAILY_LIMIT'||error.code==='SFX_DAILY_BUDGET');
  const list=await store.list({limit:50});
  assert.equal(list.jobs.length,10);
 }finally{await rm(directory,{recursive:true,force:true});}
});
