import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildLocalCampaignAuthorization,initializeCampaignBudget,commands}
 from '../tools/campaign-budget-setup.mjs';
import {acquireGlobalSpendLedger,checkLedgerAuthorization}
 from '../src/qa/globalSpendLedger.mjs';
const campaign=JSON.parse(await readFile(new URL('../fixtures/qa/mass-campaign-manifest-v1.json',import.meta.url),'utf8'));

test('local approval caps exactly match agreed 30 dollars and four providers',()=>{
 const c=buildLocalCampaignAuthorization(campaign,{approvedAt:'2026-10-29T10:00:00.000Z'});
 assert.equal(c.totalCapUsd,30);
 assert.deepEqual(c.capsUsd,{meta:12,baseten:8,modal:8,voice:2});
 assert.deepEqual(c.reservations,[]);
 assert.equal(c.authorizationStatus,'LOCAL_OPERATOR_APPROVED');
 assert.doesNotThrow(()=>checkLedgerAuthorization(c,campaign.campaignId));
});

test('committed manifest remains a DRAFT and does not activate costs',()=>{
 assert.equal(campaign.state,'DRAFT_NOT_AUTHORIZED');
 assert.equal(campaign.globalBudget.authorizationStatus,'PENDING');
 assert.equal(campaign.globalBudget.authorizedCapUsd,null);
 assert.deepEqual([...commands],['--initialize-approved-30-usd','--status']);
});

test('local initiation is never allowed for an altered provider cap',()=>{
 const c=JSON.parse(JSON.stringify(campaign));
 c.providers.meta.estimatedBudgetUsd=13;c.globalBudget.proposedCapUsd=31;
 assert.throws(()=>buildLocalCampaignAuthorization(c),/UNRECOGNIZED_CAMPAIGN_APPROVAL/);
});

test('initialize creates one user-private ledger and refuses any overwrite',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'runq-approval-'));
 const file=join(directory,'subdir','budget.json');
 try{
  const status=await initializeCampaignBudget(campaign,{file});
  assert.equal(status.totalCapUsd,30);
  const data=JSON.parse(await readFile(file,'utf8'));
  assert.equal(data.reservations.length,0);
  await assert.rejects(initializeCampaignBudget(campaign,{file}),/LOCAL_BUDGET_ALREADY_EXISTS_DO_NOT_RESET/);
  const ledger=await acquireGlobalSpendLedger({file,campaignId:campaign.campaignId});
  assert.equal(ledger.status().reservedUsd,0);
  await ledger.close();
 } finally{await rm(directory,{recursive:true,force:true});}
});

test('initialization cannot silently clear previous reservations',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'runq-approval-'));
 const file=join(directory,'budget.json');
 try{
  await initializeCampaignBudget(campaign,{file});
  const ledger=await acquireGlobalSpendLedger({file,campaignId:campaign.campaignId});
  assert.equal((await ledger.reserve({requestId:'request_preserved',runId:'run_pilot',
   provider:'meta',estimatedMaximumUsd:0.125})).accepted,true);
  await ledger.close();
  await assert.rejects(initializeCampaignBudget(campaign,{file}));
  const after=JSON.parse(await readFile(file,'utf8'));
  assert.equal(after.reservations.length,1);
 }finally{await rm(directory,{recursive:true,force:true});}
});
