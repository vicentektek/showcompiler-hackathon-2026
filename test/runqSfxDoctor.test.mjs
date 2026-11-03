import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectSfxConfiguration, inspectLocalSfxConfiguration } from '../tools/runq-sfx-doctor.mjs';

const ready=()=>({
 RUNQ_SFX_PILOT_ENABLED:'1',
 MODAL_SFX_ENDPOINT:'https://runq-example.modal.run',
 MODAL_PROXY_TOKEN_ID:'wk-PRIVATE_ID',
 MODAL_PROXY_TOKEN_SECRET:'ws-PRIVATE_SECRET',
 RUNQ_SFX_ESTIMATED_MAX_COST_USD:'0.04',
 RUNQ_SFX_DAILY_BUDGET_USD:'0.20',
 RUNQ_SFX_MODEL_REVISION:'a'.repeat(40),
});
test('SFX diagnostic does not require spending limits',()=>{
 const e=ready();
 delete e.RUNQ_SFX_ESTIMATED_MAX_COST_USD;
 const result=inspectSfxConfiguration(e);
 assert.equal(result.readyForOneAuthorizedRequest,true);
 assert.equal(result.configurationChecks.costPolicyValid,true);
 assert.deepEqual(result.issues,[]);
 const above=inspectSfxConfiguration({...ready(),RUNQ_SFX_DAILY_BUDGET_USD:'0.02'});
 assert.equal(above.configurationChecks.costPolicyValid,true);
});
test('SFX diagnostic accepts valid local setup without exposing credentials',()=>{
 const cfg=ready(),result=inspectSfxConfiguration(cfg);
 assert.equal(result.readyForOneAuthorizedRequest,true);
 assert.equal(result.costLimits.dailyBudgetUsd,null);
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
