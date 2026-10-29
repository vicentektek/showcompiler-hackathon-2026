import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {acquireGlobalSpendLedger,checkLedgerAuthorization,globalLedgerDefaultPath}
 from '../src/qa/globalSpendLedger.mjs';

const id='runq-hackathon-v9-mass-eval-20261029';
const approved=()=>({schemaVersion:1,campaignId:id,authorizationStatus:'LOCAL_OPERATOR_APPROVED',
  totalCapUsd:30,capsUsd:{meta:12,baseten:8,modal:8,voice:2},reservations:[]});
const openTest=async()=>{
  const dir=await mkdtemp(join(tmpdir(),'runq-global-ledger-test-'));
  const file=join(dir,'budget.json');
  await writeFile(file,JSON.stringify(approved()),{mode:0o600});
  return {dir,file};
};
const remove=async dir=>rm(dir,{recursive:true,force:true});

test('same canonical path outside all repository clones on Windows',()=>{
  const a=globalLedgerDefaultPath({platform:'win32',localappdata:'C:\\Users\\Tester\\AppData\\Local'});
  assert.match(a,/RunQ/);
  assert.match(a,/global-spend-v1\.json/);
  assert.ok(!a.includes('runq-v8-test')&&!a.includes('runq-v9-test'));
});

test('missing local operator-approved budget fails closed with no file creation',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'runq-ledger-absent-'));
  try{
    await assert.rejects(acquireGlobalSpendLedger({file:join(dir,'absent.json'),campaignId:id}),
      /NO_APPROVED_LOCAL_BUDGET_FILE/);
  }finally{await remove(dir);}
});

test('a committed draft manifest never qualifies as a monetary authorization',()=>{
  const d=approved();
  d.authorizationStatus='PENDING';
  assert.throws(()=>checkLedgerAuthorization(d,id),/MISSING_OR_INVALID_LOCAL_AUTHORIZATION/);
  d.authorizationStatus='LOCAL_OPERATOR_APPROVED';
  assert.doesNotThrow(()=>checkLedgerAuthorization(d,id));
});

test('shared reservation file survives new process-style reopen and prevents duplicate billing IDs',async()=>{
  const {dir,file}=await openTest();
  try{
    const first=await acquireGlobalSpendLedger({file,campaignId:id});
    assert.equal(first.status().reservedUsd,0);
    const res=await first.reserve({requestId:'request_first',runId:'run_first',provider:'meta',estimatedMaximumUsd:0.75});
    assert.equal(res.accepted,true);
    await first.close();
    const second=await acquireGlobalSpendLedger({file,campaignId:id});
    assert.equal(second.status().reservedUsd,0.75);
    assert.deepEqual(await second.reserve({requestId:'request_first',runId:'run_second',provider:'meta',estimatedMaximumUsd:0.75}),
      {accepted:false,reason:'DUPLICATE_ID'});
    assert.equal(second.status().reservedUsd,0.75);
    await second.close();
    const onDisk=JSON.parse(await readFile(file,'utf8'));
    assert.equal(onDisk.reservations.length,1);
  }finally{await remove(dir);}
});

test('simultaneous clients cannot open the same global campaign lock',async()=>{
  const {dir,file}=await openTest();
  try{
    const first=await acquireGlobalSpendLedger({file,campaignId:id});
    await assert.rejects(acquireGlobalSpendLedger({file,campaignId:id}),/CAMPAIGN_GLOBAL_LOCKED/);
    await first.close();
    const next=await acquireGlobalSpendLedger({file,campaignId:id});
    await next.close();
  }finally{await remove(dir);}
});

test('provider reservation cap blocks overspending even if global budget remains',async()=>{
  const {dir,file}=await openTest();
  try{
    const ledger=await acquireGlobalSpendLedger({file,campaignId:id});
    assert.deepEqual(await ledger.reserve({requestId:'request_too_big',runId:'run_first',
      provider:'voice',estimatedMaximumUsd:2.01}),{accepted:false,reason:'BUDGET_LIMIT'});
    assert.equal(ledger.status().reservedUsd,0);
    assert.equal((await ledger.reserve({requestId:'request_voice',runId:'run_first',
      provider:'voice',estimatedMaximumUsd:2})).accepted,true);
    assert.deepEqual(await ledger.reserve({requestId:'request_voice2',runId:'run_first',
      provider:'voice',estimatedMaximumUsd:0.01}),{accepted:false,reason:'BUDGET_LIMIT'});
    await ledger.close();
  }finally{await remove(dir);}
});

test('maximum 30 dollar total can be fully reserved but not exceeded',async()=>{
  const {dir,file}=await openTest();
  try{
    const ledger=await acquireGlobalSpendLedger({file,campaignId:id});
    for(const [provider,n] of [['meta',12],['baseten',8],['modal',8],['voice',2]]){
      const result=await ledger.reserve({requestId:'request_'+provider,runId:'run_first',
        provider,estimatedMaximumUsd:n});
      assert.equal(result.accepted,true,provider);
    }
    assert.equal(ledger.status().remainingUsd,0);
    assert.deepEqual(await ledger.reserve({requestId:'request_extra',runId:'run_first',
      provider:'meta',estimatedMaximumUsd:0.001}),{accepted:false,reason:'BUDGET_LIMIT'});
    await ledger.close();
  }finally{await remove(dir);}
});

test('uncertain charges remain reserved rather than automatically refunded',async()=>{
  const {dir,file}=await openTest();
  try{
    const data=approved();
    data.reservations.push({requestId:'request_uncertain',runId:'run_first',
      provider:'modal',amountMicros:1000000,status:'UNKNOWN'});
    await writeFile(file,JSON.stringify(data));
    const ledger=await acquireGlobalSpendLedger({file,campaignId:id});
    assert.equal(ledger.status().reservedUsd,1);
    assert.equal(ledger.status().perProvider.modal.reservedUsd,1);
    await ledger.close();
  }finally{await remove(dir);}
});

test('corrupted, over-budget or mismatched campaign file is never repaired silently',async()=>{
  const {dir,file}=await openTest();
  try{
    const wrong=approved();wrong.capsUsd.meta=13;
    await writeFile(file,JSON.stringify(wrong));
    await assert.rejects(acquireGlobalSpendLedger({file,campaignId:id}),/PROVIDER_CAPS_DO_NOT_SUM/);
    const good=approved();good.campaignId='different-campaign';
    await writeFile(file,JSON.stringify(good));
    await assert.rejects(acquireGlobalSpendLedger({file,campaignId:id}),/MISSING_OR_INVALID_LOCAL_AUTHORIZATION/);
    const cap=approved();
    cap.reservations.push({requestId:'request_over',runId:'run_first',
      provider:'baseten',amountMicros:99999999,status:'RESERVED'});
    await writeFile(file,JSON.stringify(cap));
    await assert.rejects(acquireGlobalSpendLedger({file,campaignId:id}),/SPEND_RESERVATIONS_OVER_CAP/);
  }finally{await remove(dir);}
});

test('malformed reservation IDs, provider and monetary precision fail without spending',async()=>{
  const {dir,file}=await openTest();
  try{
    const ledger=await acquireGlobalSpendLedger({file,campaignId:id});
    await assert.rejects(ledger.reserve({requestId:'bad',runId:'run_first',provider:'meta',
      estimatedMaximumUsd:1}),/BAD_RESERVATION_ID/);
    await assert.rejects(ledger.reserve({requestId:'request_ok',runId:'run_first',
      provider:'stripe',estimatedMaximumUsd:1}),/BAD_RESERVATION_ID/);
    await assert.rejects(ledger.reserve({requestId:'request_ok',runId:'run_first',
      provider:'meta',estimatedMaximumUsd:Number.POSITIVE_INFINITY}),/INVALID_AMOUNT/);
    assert.equal(ledger.status().reservedUsd,0);
    await ledger.close();
  }finally{await remove(dir);}
});
