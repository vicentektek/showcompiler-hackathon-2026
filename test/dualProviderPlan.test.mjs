import test from 'node:test';
import assert from 'node:assert/strict';
import {readLevel1Corpus} from '../tools/level1Corpus.mjs';
import {buildDualProviderPlan,renderDualProviderPlan} from '../src/core/dualProviderPlan.mjs';
import {parseDualPlanArgs} from '../tools/dual-provider-plan.mjs';

const getCorpus=()=>readLevel1Corpus();

test('default creates matched provider pairs with 20-call ceiling',async()=>{
  const plan=buildDualProviderPlan(await getCorpus());
  assert.equal(plan.pool,'development');
  assert.equal(plan.status,'NOT_EXECUTED_NO_MODEL_EVIDENCE');
  assert.equal(plan.coverage.availableCases,6);
  assert.equal(plan.coverage.availableWindows,9);
  assert.equal(plan.coverage.plannedWindows,9);
  assert.equal(plan.coverage.plannedRequests,18);
  assert.equal(plan.coverage.perProvider.META.plannedRequests,9);
  assert.equal(plan.coverage.perProvider.BASETEN.plannedRequests,9);
  assert.ok(plan.selectedPairs.every(p=>p.providerRequests.map(r=>r.provider).join('|')==='META|BASETEN'));
  assert.ok(plan.assignments.every(r=>r.status==='NOT_EXECUTED'));
  assert.equal(plan.coverage.perProvider.META.actualSpendUsd,null);
});
test('smaller cap maintains complete pairs and defers remaining windows',async()=>{
  const plan=buildDualProviderPlan(await getCorpus(),{maxRequests:4,budgetUsd:2});
  assert.equal(plan.coverage.plannedWindows,2);
  assert.equal(plan.coverage.plannedRequests,4);
  assert.equal(plan.coverage.unplannedWindows,7);
  assert.equal(plan.coverage.perProvider.META.maxBudgetUsd,1);
});
test('qualification unavailable while human gold approval is provisional',async()=>{
  const corpus=await getCorpus();
  assert.throws(()=>buildDualProviderPlan(corpus,{pool:'qualification'}),/Qualification requires/);
  assert.throws(()=>buildDualProviderPlan(corpus,{
    pool:'qualification',allowQualification:true,operatorReviewed:true,
  }),/not human reviewed/);
});
test('development plans never leak qualification case identifiers or script content',async()=>{
  const corpus=await getCorpus();
  const json=JSON.stringify(buildDualProviderPlan(corpus));
  const markdown=renderDualProviderPlan(buildDualProviderPlan(corpus));
  for(const c of corpus.cases.filter(c=>c.pool==='qualification')){
    assert.ok(!json.includes(c.id));
    assert.ok(!markdown.includes(c.id));
  }
  assert.ok(!json.includes('scriptText'));
});
test('strict budget, request and options validation',async()=>{
  const corpus=await getCorpus();
  for(const options of [
    {maxRequests:1},{maxRequests:3},{maxRequests:22},
    {maxRequests:0},{budgetUsd:0},{budgetUsd:21},
    {pool:'both'},{unknown:true},
  ]) assert.throws(()=>buildDualProviderPlan(corpus,options));
});
test('source window accounting is checked rather than fabricated',async()=>{
  const corpus=await getCorpus();
  const clone={...corpus,cases:corpus.cases.map(c=>
    c.id==='marina-house'?{...c,sceneWindowCount:100}:c)};
  assert.throws(()=>buildDualProviderPlan(clone),/Scene-window accounting mismatch/);
});
test('CLI accepts only explicit offline limits; no live or paid flags',()=>{
  assert.deepEqual(parseDualPlanArgs([]),{pool:'development',maxRequests:20,budgetUsd:20});
  assert.deepEqual(parseDualPlanArgs(['--max-requests','6','--budget-usd','2']),
    {pool:'development',maxRequests:6,budgetUsd:2});
  for(const args of [['--live'],['--ack-paid'],['--pool','qualification'],
    ['--max-requests','NaN'],['--budget-usd','-1'],['--max-requests','2','--max-requests','4']]){
    assert.throws(()=>parseDualPlanArgs(args));
  }
});
