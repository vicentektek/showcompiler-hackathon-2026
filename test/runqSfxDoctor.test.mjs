import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  inspectSfxConfiguration, inspectLocalSfxConfiguration, inspectSfxJournal,
} from '../tools/runq-sfx-doctor.mjs';
import { createSfxJobStore } from '../src/core/sfxJobStore.mjs';

const ready=()=>({
 RUNQ_SFX_PILOT_ENABLED:'1',
 MODAL_SFX_ENDPOINT:'https://runq-example.modal.run',
 MODAL_PROXY_TOKEN_ID:'wk-PRIVATE_ID',
 MODAL_PROXY_TOKEN_SECRET:'ws-PRIVATE_SECRET',
 RUNQ_SFX_ESTIMATED_MAX_COST_USD:'0.04',
 RUNQ_SFX_DAILY_BUDGET_USD:'0.20',
 RUNQ_SFX_MODEL_REVISION:'a'.repeat(40),
});
test('SFX diagnostic fails closed on unset or invalid costs',()=>{
 const e=ready();
 delete e.RUNQ_SFX_ESTIMATED_MAX_COST_USD;
 const result=inspectSfxConfiguration(e);
 assert.equal(result.readyForOneAuthorizedRequest,false);
 assert.equal(result.configurationChecks.costPolicyValid,false);
 assert.match(result.issues.join(' '),/Cost policy invalid/);
 const above=inspectSfxConfiguration({...ready(),RUNQ_SFX_DAILY_BUDGET_USD:'0.02'});
 assert.equal(above.configurationChecks.costPolicyValid,false);
});
test('SFX diagnostic accepts valid local setup without exposing credentials',()=>{
 const cfg=ready(),result=inspectSfxConfiguration(cfg);
 assert.equal(result.readyForOneAuthorizedRequest,true);
 assert.equal(result.costLimits.dailyBudgetUsd,0.2);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_ID|PRIVATE_SECRET|runq-example/);
});
test('SFX diagnostic detects malformed endpoint, missing proxy secret and revision',()=>{
 const cfg={...ready(),MODAL_SFX_ENDPOINT:'http://localhost:9999',MODAL_PROXY_TOKEN_SECRET:'',
   RUNQ_SFX_MODEL_REVISION:'unvalidated'};
 const r=inspectSfxConfiguration(cfg);
 assert.equal(r.readyForOneAuthorizedRequest,false);
 assert.equal(r.configurationChecks.endpointConfigured,false);
 assert.equal(r.configurationChecks.proxyTokenSecretConfigured,false);
 assert.equal(r.configurationChecks.modelRevisionValid,false);
});
test('SFX doctor reports only aggregate journal state without provider calls', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'runq-sfx-doctor-journal-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createSfxJobStore({ directory: dir, maxDailyStarts: 3 });
  const base = {
    authorizationId: 'auth-doctor', sourceLineId: 'L1', kind: 'SFX',
    modelCandidate: 'stabilityai/stable-audio-3-small-sfx',
    modelRevision: 'a'.repeat(40), prompt: 'Bell', durationSeconds: 1, seed: 0,
    estimatedMaxCostUsdPerRequest: 0.04, dailyBudgetUsd: 0.2,
    acknowledgedMaxCostUsd: 0.04,
  };
  await store.reserve({ ...base, requestId: 'doctor-1' }, { confirm: true });
  const summary = await inspectSfxJournal({ directory: dir });
  assert.equal(summary.exists, true);
  assert.equal(summary.total, 1);
  assert.equal(summary.active, 1);
  assert.equal(summary.counts.SUBMISSION_UNKNOWN, 1);
  assert.doesNotMatch(JSON.stringify(summary), /doctor-1|auth-doctor|Bell/);
  const missing = await inspectSfxJournal({ directory: join(dir, 'missing') });
  assert.deepEqual(
    { exists: missing.exists, total: missing.total, active: missing.active },
    { exists: false, total: 0, active: 0 });
});
test('SFX doctor respects existing nonempty process environment while reading local .env',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'runq-sfx-doctor-'));
 try{
  const path=join(dir,'.env');
  await writeFile(path,Object.entries(ready()).map(([k,v])=>k+'='+v).join('\n'));
  const r=await inspectLocalSfxConfiguration({filePath:path,baseEnv:{
   RUNQ_SFX_ESTIMATED_MAX_COST_USD:'0.05',
  }});
  assert.equal(r.readyForOneAuthorizedRequest,true);
  assert.equal(r.costLimits.estimatedMaxCostUsdPerRequest,0.05);
 }finally{await rm(dir,{recursive:true,force:true});}
});
