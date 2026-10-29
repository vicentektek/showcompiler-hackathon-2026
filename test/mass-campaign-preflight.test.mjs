import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  PROVIDERS, TOKEN_RATES, estimateTokenCost, validateMassCampaign,
  assessReadiness, estimateIllustrativeCosts,
} from '../tools/mass-campaign-preflight.mjs';

const original=JSON.parse(await readFile(
  new URL('../fixtures/qa/mass-campaign-manifest-v1.json',import.meta.url),'utf8'));
const gold=JSON.parse(await readFile(
  new URL('../fixtures/qa/seminar/corpus-v1.json',import.meta.url),'utf8'));
const clone=value=>JSON.parse(JSON.stringify(value));

test('mass campaign has exact provider caps and 380 staged requests',()=>{
  assert.deepEqual([...PROVIDERS],['meta','baseten','modal','voice']);
  const result=validateMassCampaign(original);
  assert.equal(result.requestCount,380);
  assert.equal(result.budgetUsd,30);
  assert.deepEqual(result.stages.map(x=>x.targetRequests),[160,100,20,100]);
  assert.deepEqual(result.stages.map(x=>x.estimatedBudgetUsd),[12,8,8,2]);
  assert.ok(result.stages.every(x=>x.ready===false));
});

test('campaign cannot grant spend approval through a committed JSON manifest',()=>{
  const changed=clone(original);
  changed.globalBudget.authorizationStatus='APPROVED';
  changed.globalBudget.authorizedCapUsd=30;
  assert.throws(()=>validateMassCampaign(changed),/planning file/);
  const altered=clone(original);
  altered.state='LIVE';
  assert.throws(()=>validateMassCampaign(altered),/already authorized/);
});

test('budgets must sum to global cap without even fractional overbooking',()=>{
  const bad=clone(original);
  bad.providers.modal.estimatedBudgetUsd+=0.01;
  assert.throws(()=>validateMassCampaign(bad),/allowances differs/);
  const bad2=clone(original);
  bad2.globalBudget.proposedCapUsd=Number.NaN;
  assert.throws(()=>validateMassCampaign(bad2));
});

test('stage counts and task allocation must add up exactly, with no new provider',()=>{
  const bad=clone(original);
  bad.providers.meta.stages[1].requests+=1;
  assert.throws(()=>validateMassCampaign(bad),/totals disagree/);
  const bad2=clone(original);
  bad2.providers.baseten.taskGroups[0].requests=0;
  assert.throws(()=>validateMassCampaign(bad2),/totals disagree/);
  const bad3=clone(original);
  bad3.providers.unknown={targetRequests:1};
  assert.throws(()=>validateMassCampaign(bad3),/allowlist/);
});

test('referenced gold is explicitly provisional and never scored as human reviewed',()=>{
  assert.notEqual(gold.humanReviewStatus,'HUMAN_REVIEWED_APPROVED');
  const result=assessReadiness(original,gold);
  assert.equal(result.readyForPaidExecution,false);
  assert.ok(result.blocking.some(x=>x.code==='GOLD_UNREVIEWED'));
  assert.ok(result.blocking.some(x=>x.code==='HOLDOUT_NOT_READY'));
  assert.ok(result.blocking.some(x=>x.code==='PAID_EXECUTION_DISABLED'));
});

test('existing per-clone ledger and absent cross-clone lock block live plans',()=>{
  const result=assessReadiness(original,gold);
  const codes=result.blocking.map(x=>x.code);
  assert.ok(codes.includes('CENTRAL_LEDGER_MISSING'));
  assert.ok(codes.includes('CROSS_CLONE_LOCK_MISSING'));
  assert.ok(codes.includes('DASHBOARD_NOT_CONFIRMED'));
  for(const p of PROVIDERS)assert.ok(codes.includes(p.toUpperCase()+'_MASS_RUNNER_NOT_IMPLEMENTED'));
});

test('provider secrets presence can be described without reading or printing actual values',()=>{
  const result=assessReadiness(original,gold,{
    keysPresent:{meta:true,baseten:true,modal:true,voice:true},
  });
  assert.equal(result.readyForPaidExecution,false);
  assert.ok(!result.blocking.some(x=>x.code.endsWith('_KEY_NOT_VERIFIED')));
  assert.ok(result.blocking.length>=8);
});

test('Meta standard and Baseten Muse Spark Open pricing use independently reviewed token rates',()=>{
  assert.deepEqual(TOKEN_RATES.meta,TOKEN_RATES.baseten);
  assert.equal(estimateTokenCost({provider:'meta',requests:100,inputTokens:2500,outputTokens:1000}),0.7375);
  assert.equal(estimateTokenCost({provider:'baseten',requests:100,inputTokens:2500,outputTokens:1000}),0.7375);
  assert.equal(estimateTokenCost({provider:'meta',requests:160,inputTokens:2500,outputTokens:1000}),1.18);
  const withCache=estimateTokenCost({provider:'meta',requests:100,inputTokens:2500,outputTokens:1000,cachedTokens:1000});
  assert.ok(withCache<0.7375);
  assert.throws(()=>estimateTokenCost({provider:'modal',requests:1,inputTokens:100,outputTokens:100}));
});

test('illustrative Modal cost deliberately excludes idle time and any guarantee',()=>{
  const scenario=estimateIllustrativeCosts(original);
  assert.equal(scenario.kind,'NON_BINDING_EXAMPLE');
  assert.equal(scenario.exampleMetaUsd,1.18);
  assert.equal(scenario.exampleBasetenUsd,0.7375);
  assert.equal(scenario.exampleVoiceUsdForMax1800Seconds,0.09);
  assert.equal(scenario.exampleModalA10GpuOnlyUsd,0.3672);
  assert.match(scenario.note,/not a billing cap/);
});

test('pricing math rejects invalid counts, cache overdraw and Infinity',()=>{
  for(const c of [
    {provider:'meta',requests:0,inputTokens:100,outputTokens:100},
    {provider:'meta',requests:1,inputTokens:10,outputTokens:1,cachedTokens:11},
    {provider:'meta',requests:1.4,inputTokens:100,outputTokens:1},
    {provider:'meta',requests:1,inputTokens:Infinity,outputTokens:1},
    {provider:'meta',requests:100001,inputTokens:1,outputTokens:1},
  ])assert.throws(()=>estimateTokenCost(c));
});

test('video and manual GO remain explicit campaign safety conditions',()=>{
  assert.equal(original.offlineSuite.requireOperatorStopAllTests,true);
  assert.equal(original.offlineSuite.requireNoNetwork,true);
  assert.equal(original.freezeBuildSha,null);
  assert.ok(original.stoppingRules.includes('any_unarmed_GO'));
  assert.ok(original.stoppingRules.includes('voice_false_GO'));
  assert.ok(original.stoppingRules.includes('duplicate_paid_job'));
  assert.equal(original.evidenceStatus,'NO_PROVIDER_INFERENCES_OR_MEASUREMENTS_EXECUTED');
});
