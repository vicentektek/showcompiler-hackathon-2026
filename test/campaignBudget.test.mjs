import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {CAMPAIGN_POLICY} from '../src/qa/campaignPolicy.mjs';
import {acquireGlobalSpendLedger,checkLedgerAuthorization,upgradeCampaignBudget} from '../src/qa/globalSpendLedger.mjs';
import {campaignBudgetCommand} from '../tools/campaign-budget.mjs';
import {acquireCampaignMetaBudget} from '../tools/metaBudgetLedger.mjs';
import {createCampaignFetch,estimateCampaignMetaReserve} from '../tools/campaignFetch.mjs';

const legacy=()=>({
 schemaVersion:1,campaignId:'runq-hackathon-v9-mass-eval-20261029',
 authorizationStatus:'LOCAL_OPERATOR_APPROVED',approvedAt:'2026-10-30T00:00:00Z',
 totalCapUsd:30,capsUsd:{meta:12,baseten:8,modal:8,voice:2},note:'Original authorization',
 reservations:[
  {requestId:'meta-old',runId:'run-old',provider:'meta',amountMicros:273635,status:'RESERVED'},
  {requestId:'baseten-old',runId:'run-old',provider:'baseten',amountMicros:318545,status:'RESERVED'},
  {requestId:'modal-old',runId:'run-old',provider:'modal',amountMicros:100000,status:'UNKNOWN'},
 ],
});
const updated=()=>upgradeCampaignBudget(legacy(),{authorizedAt:'2026-10-31T13:56:56Z'});
test('new caps retain historical uncertainty and disabled-provider spend against global total',()=>{
 const old=legacy(),next=upgradeCampaignBudget(old,{authorizedAt:'2026-10-31T13:56:56Z'});
 assert.deepEqual(next.reservations,old.reservations);
 assert.equal(old.totalCapUsd,30);
 assert.equal(next.totalCapUsd,100);
 assert.deepEqual(next.capsUsd,{meta:65,modal:35,baseten:0,fireworks:0,voice:0});
 const status=checkLedgerAuthorization(next);
 assert.equal(status.reservedMicros,692180);
 assert.equal(status.totalMicros-status.reservedMicros,99307820);
 assert.deepEqual(next.budgetHistory[0].capsUsd,old.capsUsd);
 assert.equal(next.approvedAt,old.approvedAt,'Preserve original approval chronology');
 assert.deepEqual(upgradeCampaignBudget(next,{authorizedAt:'2026-10-31T13:56:56Z'}),next,'Idempotent upgrade');
});
test('budget authorization cannot fake dashboard credit verification or tolerate corruption',()=>{
 const s=updated();
 assert.equal(s.accountVerification,undefined);
 for(const mutate of [
  x=>{x.capsUsd.meta=66;},x=>{x.reservations[0].amountMicros=-1;},
  x=>{x.reservations.push({...x.reservations[0]});},
  x=>{x.reservations[0].status='REFUNDED';},
  x=>{x.reservations[0].provider='unregistered';},
 ]){
  const bad=structuredClone(s);mutate(bad);assert.throws(()=>checkLedgerAuthorization(bad));
 }
 assert.throws(()=>upgradeCampaignBudget(legacy(),{authorizedAt:'invalid'}));
 assert.equal(CAMPAIGN_POLICY.totalCapUsd,100);
});
test('failed reservation preserves pre-existing temporary evidence and does not charge the ledger',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'runq-campaign-temp-'));
 const file=join(dir,'global.json'),temp=file+'.tmp-'+process.pid;
 let ledger;
 try{
  await writeFile(file,JSON.stringify(updated()));
  const original=await readFile(file),evidence='preserved uncertain write';
  await writeFile(temp,evidence);
  ledger=await acquireGlobalSpendLedger({file});
  const before=ledger.status();
  await assert.rejects(()=>ledger.reserve({
   requestId:'temp-conflict',runId:'run-test',provider:'meta',estimatedMaximumUsd:0.15,
  }),{code:'EEXIST'});
  assert.equal(await readFile(temp,'utf8'),evidence);
  assert.deepEqual(await readFile(file),original);
  assert.deepEqual(ledger.status(),before);
 }finally{
  if(ledger)await ledger.close();
  await rm(dir,{recursive:true,force:true});
 }
});
test('shared ledger rejects forbidden providers, duplicates, cap overflow and overlapping processes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'runq-campaign-'));
 const file=join(dir,'global.json');
 try{
  await writeFile(file,JSON.stringify(updated()));
  const ledger=await acquireGlobalSpendLedger({file});
  const reserve=(provider,usd,id)=>ledger.reserve({
   requestId:id,runId:'run-test',provider,estimatedMaximumUsd:usd,
  });
  assert.deepEqual(await reserve('baseten',0.01,'forbidden-one'),{accepted:false,reason:'PROVIDER_PROHIBITED'});
  assert.deepEqual(await reserve('fireworks',0.01,'forbidden-two'),{accepted:false,reason:'PROVIDER_PROHIBITED'});
  assert.deepEqual(await reserve('voice',0.01,'forbidden-three'),{accepted:false,reason:'PROVIDER_PROHIBITED'});
  assert.equal((await reserve('meta',64.726365,'meta-cap')).accepted,true);
  assert.equal((await reserve('meta',0.000001,'meta-over')).reason,'BUDGET_LIMIT');
  assert.equal((await reserve('meta',0.01,'meta-old')).reason,'DUPLICATE_ID');
  assert.equal((await reserve('modal',34.9,'modal-global-over')).reason,'BUDGET_LIMIT',
   'Historical prohibited-provider reserve still counts against the global ceiling');
  assert.equal((await reserve('modal',34.581455,'modal-cap')).accepted,true);
  assert.equal((await reserve('modal',0.000001,'modal-over')).reason,'BUDGET_LIMIT');
  assert.equal(ledger.status().reservedUsd,100);
  await assert.rejects(()=>acquireGlobalSpendLedger({file}),/CAMPAIGN_GLOBAL_LOCKED/);
  await ledger.close();
  const reopened=await acquireGlobalSpendLedger({file});
  assert.equal(reopened.status().reservedUsd,100);
  assert.equal((await reopened.reserve({provider:'meta',estimatedMaximumUsd:0.01,
   requestId:'after-reopen',runId:'run-test'})).reason,'BUDGET_LIMIT');
  await reopened.close();
  const raw=JSON.parse(await readFile(file,'utf8'));
  assert.deepEqual(raw.reservations.slice(0,3),legacy().reservations);
 }finally{await rm(dir,{recursive:true,force:true});}
});
  test('historical imports count once, preserve originals, retain prohibited spend and fail on changed evidence',()=>{
   const carry={requestId:'legacy-test-1',runId:'legacy-test',provider:'baseten',
    amountMicros:150000,status:'UNKNOWN',evidenceSha256:'a'.repeat(64)};
   const options={authorizedAt:'2026-10-31T13:56:56Z',legacyReservations:[carry]};
   const first=upgradeCampaignBudget(legacy(),options);
   assert.deepEqual(first.reservations,legacy().reservations);
   assert.equal(checkLedgerAuthorization(first).reservedMicros,842180);
   assert.deepEqual(upgradeCampaignBudget(first,options),first);
   assert.throws(()=>upgradeCampaignBudget(first,{...options,
    legacyReservations:[{...carry,amountMicros:1}]}),/RECONCILE_REQUIRED/);
  });
  test('dry budget planning has zero ledger writes and verified backup precedes authorized upgrade',async()=>{
   const dir=await mkdtemp(join(tmpdir(),'runq-upgrade-'));
   const file=join(dir,'ledger.json'),backup=join(dir,'external','backup.json');
   try{
    await writeFile(file,JSON.stringify(legacy()));
    const original=await readFile(file);
    const plan=await campaignBudgetCommand(['--ledger',file]);
    assert.equal(plan.providerRequests,0);assert.equal(plan.creditVerified,false);
    assert.deepEqual(await readFile(file),original);
    await assert.rejects(()=>campaignBudgetCommand(['--ledger',file,'--apply-authorized-upgrade']),
     /BACKUP_REQUIRED/);
    const result=await campaignBudgetCommand(['--ledger',file,'--apply-authorized-upgrade',
     '--authorized-at','2026-10-31T13:56:56Z','--backup',backup]);
    assert.equal(result.status.globalCapUsd,100);
    assert.equal(result.backupSha256.length,64);
    assert.deepEqual(await readFile(backup),original);
    assert.deepEqual(JSON.parse(await readFile(file)).reservations,legacy().reservations);
   }finally{await rm(dir,{recursive:true,force:true});}
  });
  test('Meta persistent history can pass old $2 boundary without bypassing shared provider/global ceilings',async()=>{
   const dir=await mkdtemp(join(tmpdir(),'runq-meta-shared-'));
   const file=join(dir,'global.json'),local=join(dir,'meta.json');
   try{
    await writeFile(file,JSON.stringify(updated()));
    await writeFile(local,JSON.stringify({version:1,entries:[{sequence:1,reserveUsd:2}]}));
    const budget=await acquireCampaignMetaBudget({sharedOptions:{file},localOptions:{file:local}});
    assert.equal(await budget.reserve(0.1),true);
    assert.equal(budget.committedReserveUsd(),2.1);
    await budget.close();
    const shared=await acquireGlobalSpendLedger({file});
    assert.equal(shared.status().reservedUsd,0.79218);
    await shared.close();
   }finally{await rm(dir,{recursive:true,force:true});}
  });
  test('production Meta design transport reserves exact conservative maximum before network and never retries',async()=>{
   const request={method:'POST',body:JSON.stringify({
    model:'muse-spark-1.3',stream:false,store:false,max_completion_tokens:2200,messages:[],
   })};
   const events=[];
   let accepted=false,amount;
   const transport=createCampaignFetch('meta',{
    ledgerFactory:async()=>({reserve:async input=>{
     events.push('reserve');amount=input.estimatedMaximumUsd;return {accepted,reason:'BUDGET_LIMIT'};
    },close:async()=>events.push('close')}),
    fetchImpl:async()=>{events.push('fetch');throw new Error('timeout');},
   });
   await assert.rejects(()=>transport('https://api.meta.ai/v1/chat/completions',request),/BUDGET_LIMIT/);
   assert.deepEqual(events,['reserve','close']);
   events.length=0;accepted=true;
   await assert.rejects(()=>transport('https://api.meta.ai/v1/chat/completions',request),/timeout/);
   assert.deepEqual(events,['reserve','close','fetch']);
   assert.equal(amount,estimateCampaignMetaReserve(request));
   const forbidden=createCampaignFetch('baseten',{ledgerFactory:async()=>{throw new Error('must not open');}});
   await assert.rejects(()=>forbidden('https://example.invalid',request),/PROVIDER_PROHIBITED/);
  });
