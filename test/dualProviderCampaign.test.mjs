import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCampaignArgs,validateCampaignJournal,runCampaign} from '../tools/dualProviderCampaign.mjs';

test('default campaign is offline, 18 requests and $5 target',()=>{
  assert.deepEqual(parseCampaignArgs([]),{live:false,ackPaid:false,budgetUsd:5,maxRequests:18});
});
test('paid campaign requires two explicit flags',()=>{
  assert.throws(()=>parseCampaignArgs(['--live']));
  assert.throws(()=>parseCampaignArgs(['--ack-paid']));
  assert.deepEqual(parseCampaignArgs(['--live','--ack-paid']),{
    live:true,ackPaid:true,budgetUsd:5,maxRequests:18});
});
test('no expanded budgets, odd requests, unknown flags or duplicated flags',()=>{
  for(const args of [['--budget-usd','6'],['--budget-usd','4'],['--max-requests','19'],
    ['--max-requests','3'],['--live','--live'],['--qualification'],['--max-requests','abc']]){
    assert.throws(()=>parseCampaignArgs(args),args.join(' '));
  }
});
test('journal blocks replay, unexpected requests and mismatched plans',()=>{
  const j={version:1,planHash:'abc',attempts:[{
    key:'META:case/S1-W1',provider:'META',pairId:'case/S1-W1'}],results:[]};
  assert.equal(validateCampaignJournal(j,'abc',['META:case/S1-W1']).size,1);
  assert.throws(()=>validateCampaignJournal(j,'def',['META:case/S1-W1']));
  assert.throws(()=>validateCampaignJournal(j,'abc',[]));
  assert.throws(()=>validateCampaignJournal({...j,attempts:[...j.attempts,...j.attempts]},'abc',['META:case/S1-W1']));
});
test('offline preflight does not require credentials or send model requests',async()=>{
  const result=await runCampaign({metaCaller:()=>{throw new Error('No calls allowed')},
    basetenCaller:()=>{throw new Error('No calls allowed')}});
  assert.equal(result.kind,'OFFLINE_CAMPAIGN_PREFLIGHT');
  assert.equal(result.plannedRequests,18);
  assert.equal(result.pairs,9);
  assert.ok(result.metaConservativeReserveUsd>0);
  assert.equal(result.basetenActualUsd,null);
});
