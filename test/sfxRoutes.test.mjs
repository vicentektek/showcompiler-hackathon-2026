import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../tools/dev-server.mjs';
import { createSfxJobStore } from '../src/core/sfxJobStore.mjs';
import { inspectPcm16Wav } from '../src/core/modalSfxPilotClient.mjs';

const TEST_DATE = '2026-10-28T12:00:00.000Z';
const model = 'stabilityai/stable-audio-3-small-sfx';
const modelRevision = '77e0398c26f7d22d801ec1bb036307e8b231f741';
const costPolicy = Object.freeze({
  estimatedMaxCostUsdPerRequest: 0.04,
  dailyBudgetUsd: 0.2,
});
let seq = 0;
const payload = (n=++seq) => ({
  requestId: 'req-' + n, authorizationId: 'auth-' + n,
  sourceLineId: 'L12', kind: 'SFX',
  prompt: 'Distant bell, single strike, short decay',
  durationSeconds: 2, seed: 42, confirmed: true,
  acknowledgedMaxCostUsd: costPolicy.estimatedMaxCostUsdPerRequest,
});
const storeRequest = input => ({
  ...input,
  ...costPolicy,
  acknowledgedMaxCostUsd: costPolicy.estimatedMaxCostUsdPerRequest,
  modelRevision,
});
function wav({seconds=2}={}) {
  const rate = 16000, channels = 1, count = rate * channels * seconds;
  const b = Buffer.alloc(44 + count * 2);
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVE', 8, 'ascii'); b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * channels * 2, 28);
  b.writeUInt16LE(channels * 2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii'); b.writeUInt32LE(count * 2, 40);
  return b;
}
async function fixture(t, overrides={}) {
  const {storeOptions={},...rest}=overrides;
  const directory = await mkdtemp(join(tmpdir(), 'runq-sfx-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const store=createSfxJobStore({
    directory, clock:()=>new Date(TEST_DATE), maxDailyStarts:3, ...storeOptions,
  });
  return {store,directory,...rest};
}
function fakePilot({ output = wav() }={}) {
  const calls = { start:0, status:0, download:0, cancel:0 };
  const pilot = {
    async start(plan, options) {
      calls.start++;
      assert.equal(plan.status,'AUTHORIZED_FOR_ONE_GENERATION');
      assert.equal(plan.phase,'PREPARATION_ONLY');
      assert.equal(options.seed,42);
      return {jobId:'fc-123', status:'QUEUED'};
    },
    async status(jobId) {
      calls.status++;
      assert.equal(jobId,'fc-123');
      return {jobId, status:'COMPLETED', wav:inspectPcm16Wav(output)};
    },
    async download(jobId) {
      calls.download++;
      assert.equal(jobId,'fc-123');
      return {bytes:output, metadata:inspectPcm16Wav(output)};
    },
    async cancel(jobId) {
      calls.cancel++;
      return {jobId, status:'CANCEL_REQUESTED'};
    },
  };
  return {pilot,calls};
}
async function server(t, settings) {
  const s = createAppServer(settings);
  await new Promise((resolve,reject)=>{
    s.once('error',reject); s.listen(0,'127.0.0.1',resolve);
  });
  t.after(()=>new Promise(resolve=>s.close(resolve)));
  return 'http://127.0.0.1:'+s.address().port;
}
function post(base, path, body, options={}) {
  return fetch(base+path, {
    method:'POST',
    headers:{Origin:options.origin||base,
      'Content-Type':options.type||'application/json'},
    body:JSON.stringify(body),
  });
}
const enabled = () => ({ enabled:true, ...costPolicy, modelRevision });

test('feature disabled: read-only capabilities and no external jobs',async t=>{
  const {store} = await fixture(t);
  const {pilot,calls} = fakePilot();
  const base = await server(t,{
    sfxStore:store, sfxPilotClient:pilot,
    sfxConfig:()=>({enabled:false}),
  });
  const status=await(await fetch(base+'/api/sfx/status')).json();
  assert.equal(status.enabled,false);
  assert.equal(status.manualImportOnly,true);
  assert.equal((await post(base,'/api/sfx/jobs',payload())).status,503);
  assert.equal(calls.start,0);
});

test('full simulated lifecycle: request, poll, verify WAV, operator accept; no cue created',async t=>{
  const {store,directory}=await fixture(t);
  const {pilot,calls}=fakePilot();
  const base=await server(t,{
    sfxStore:store, sfxPilotClient:pilot, sfxConfig:enabled,
  });
  const request=payload();
  assert.equal((await(await fetch(base+'/api/sfx/status')).json()).enabled,true);
  const creation=await post(base,'/api/sfx/jobs',request);
  assert.equal(creation.status,202);
  const queued=await creation.json();
  assert.equal(queued.requestId,request.requestId);
  assert.equal(queued.status,'QUEUED');
  assert.equal(queued.sourceLineId,'L12');
  assert.equal(Object.hasOwn(queued,'remoteJobId'),false);
  assert.equal(Object.hasOwn(queued,'authorizationHash'),false);
  assert.equal(calls.start,1);
  const fetched=await(await fetch(base+'/api/sfx/jobs/'+request.requestId)).json();
  assert.equal(fetched.status,'QUEUED');
  assert.equal(calls.status,0); // GET is never remote polling.
  const refreshed=await post(base,'/api/sfx/jobs/'+request.requestId+'/refresh',{});
  assert.equal(refreshed.status,200);
  assert.equal((await refreshed.json()).status,'READY_FOR_REVIEW');
  assert.deepEqual([calls.status,calls.download],[1,1]);
  const bytes=Buffer.from(await(await fetch(base+'/api/sfx/jobs/'+request.requestId+'/audio')).arrayBuffer());
  assert.equal(inspectPcm16Wav(bytes).sha256,inspectPcm16Wav(wav()).sha256);
  const accepted=await post(base,'/api/sfx/jobs/'+request.requestId+'/review',{decision:'ACCEPT'});
  assert.equal(accepted.status,200);
  const record=await accepted.json();
  assert.equal(record.status,'ACCEPTED_FOR_MANUAL_IMPORT');
  assert.equal(Object.hasOwn(record,'assetId'),false);
  assert.equal(Object.hasOwn(record,'cueId'),false);
  assert.equal(Object.hasOwn(record,'go'),false);
  const files=await readdir(directory);
  assert.equal(files.filter(name=>name.endsWith('.wav')).length,1);
  assert.equal((await post(base,'/api/sfx/jobs/'+request.requestId+'/review',{decision:'REJECT'})).status,409);
});

test('reservation survives restart; same request or authorization never gets a second billable attempt',async t=>{
  const {store,directory}=await fixture(t);
  const original=payload();
  const request={
    requestId:original.requestId, authorizationId:original.authorizationId,
    sourceLineId:'L12', kind:'SFX', prompt:'Bell',durationSeconds:1,seed:0,
    modelCandidate:model,
  };
  const saved=await store.reserve(storeRequest(request),{confirm:true});
  assert.equal(saved.status,'SUBMISSION_UNKNOWN');
  const reopened=createSfxJobStore({
    directory,clock:()=>new Date(TEST_DATE),maxDailyStarts:3,
  });
  await assert.rejects(reopened.reserve(storeRequest(request),{confirm:true}),error=>error.code==='SFX_DUPLICATE');
  await assert.rejects(reopened.reserve(storeRequest({
    ...request,requestId:'different-request',
  }),{confirm:true}),error=>error.code==='SFX_DUPLICATE');
  await assert.rejects(reopened.reserve(storeRequest({
    ...request,requestId:'different-id',authorizationId:'auth-new',
  }),{confirm:true}),error=>error.code==='SFX_ACTIVE_LIMIT');
});

test('daily limit applies to completed and rejected jobs; no automatic quota reset',async t=>{
  const {store}=await fixture(t);
  for(let n=0;n<3;n++){
    const id='limit-'+n;
    await store.reserve(storeRequest({
      requestId:id,authorizationId:'auth-'+id,sourceLineId:'L1',
      modelCandidate:model,kind:'SFX',prompt:'Rain',durationSeconds:1,seed:0,
    }),{confirm:true});
    await store.update(id,'QUEUED',{remoteJobId:'fc-'+n});
    await store.update(id,'FAILED');
  }
  await assert.rejects(store.reserve(storeRequest({
    requestId:'fourth',authorizationId:'auth-fourth',
    sourceLineId:'L1',modelCandidate:model,kind:'SFX',prompt:'Rain',durationSeconds:1,seed:0,
  }),{confirm:true}),error=>error.code==='SFX_DAILY_LIMIT');
});

test('remote timeout creates an uncertain, non-retryable reservation',async t=>{
  const {store}=await fixture(t);
  let starts=0;
  const pilot={...fakePilot().pilot,
    async start(){ starts++; throw new Error('PROVIDER_SECRET_UNSAFE'); },
  };
  const base=await server(t,{sfxStore:store,sfxPilotClient:pilot,sfxConfig:enabled});
  const p=payload();
  const result=await post(base,'/api/sfx/jobs',p);
  assert.equal(result.status,502);
  const text=await result.text();
  assert.doesNotMatch(text,/PROVIDER_SECRET_UNSAFE/);
  assert.equal(JSON.parse(text).code,'SFX_SUBMISSION_UNKNOWN');
  assert.equal(starts,1);
  assert.equal((await post(base,'/api/sfx/jobs',p)).status,409);
  assert.equal(starts,1);
});

test('same-origin and JSON checks happen before remote calls or journal modifications',async t=>{
  const {store}=await fixture(t);
  const {pilot,calls}=fakePilot();
  const base=await server(t,{sfxStore:store,sfxPilotClient:pilot,sfxConfig:enabled});
  const p=payload();
  assert.equal((await post(base,'/api/sfx/jobs',p,{origin:'https://wrong.example'})).status,403);
  assert.equal((await post(base,'/api/sfx/jobs',p,{type:'text/plain'})).status,403);
  assert.equal((await fetch(base+'/api/sfx/jobs')).status,200);
  assert.equal((await post(base,'/api/sfx/jobs',{...p,confirmed:false})).status,400);
  assert.equal((await post(base,'/api/sfx/jobs',{...p,durationSeconds:13})).status,400);
  assert.equal(calls.start,0);
  assert.equal((await store.read(p.requestId)),null);
});

test('cancellation is an acknowledgement, never a claim of confirmed stop',async t=>{
  const {store}=await fixture(t);
  const {pilot,calls}=fakePilot();
  const base=await server(t,{sfxStore:store,sfxPilotClient:pilot,sfxConfig:enabled});
  const p=payload();
  assert.equal((await post(base,'/api/sfx/jobs',p)).status,202);
  const result=await post(base,'/api/sfx/jobs/'+p.requestId+'/cancel',{});
  assert.equal(result.status,202);
  const body=await result.json();
  assert.equal(body.status,'CANCEL_REQUESTED');
  assert.equal(calls.cancel,1);
  assert.equal((await post(base,'/api/sfx/jobs/'+p.requestId+'/cancel',{})).status,409);
});

test('corrupted WAV in local library is rejected instead of served to audition',async t=>{
  const {store,directory}=await fixture(t);
  const output=wav();
  const saved=payload();
  await store.reserve(storeRequest({ ...saved,modelCandidate:model }), {confirm:true});
  await store.update(saved.requestId,'QUEUED',{remoteJobId:'fc-123'});
  await store.storeWav(saved.requestId, output, inspectPcm16Wav(output));
  const names=await readdir(directory);
  const wavname=names.find(x=>x.endsWith('.wav'));
  await writeFile(join(directory,wavname),Buffer.from('garbage'));
  await assert.rejects(store.wavBytes(saved.requestId));
});

test('provider WAV metadata mismatch blocks storage and review',async t=>{
  const {store}=await fixture(t);
  const {pilot}=fakePilot();
  pilot.status=async()=>({
    jobId:'fc-123',status:'COMPLETED',wav:{...inspectPcm16Wav(wav()),sha256:'a'.repeat(64)},
  });
  const base=await server(t,{sfxStore:store,sfxPilotClient:pilot,sfxConfig:enabled});
  const p=payload();
  await post(base,'/api/sfx/jobs',p);
  const result=await post(base,'/api/sfx/jobs/'+p.requestId+'/refresh',{});
  assert.notEqual(result.status,200);
  assert.equal((await store.read(p.requestId)).status,'QUEUED');
  assert.equal((await post(base,'/api/sfx/jobs/'+p.requestId+'/review',{decision:'ACCEPT'})).status,409);
});
