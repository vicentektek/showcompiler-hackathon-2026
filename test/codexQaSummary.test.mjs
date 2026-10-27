import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodexQaSummary, summarizeOriginalStageCorpus } from '../tools/codex-qa-summary.mjs';
function fixture() {
  return {
    mode:'OFFLINE_HUMAN_GOLD_COMPARISON',modelQualityMeasured:false,
    summary:{cases:1,expectedEvents:2,falseNegatives:1,falsePositives:1,
      forbiddenPlay:1,invalidReferences:0,duplicates:0,creativeAwaitingReview:1,
      precision:0.5,recall:0.5,f1:0.5},
    prioritizedCases:[{id:'stage-example',issues:[
      {type:'FORBIDDEN_PLAY',lineId:'L2'},
      {type:'MISSED_EXPECTED_EVENT',lineId:'L3'},
    ]}],
  };
}
test('Codex synthetic results never masquerade as model quality',()=>{
  const {meta,markdown}=buildCodexQaSummary(fixture());
  assert.equal(meta.modelQualityMeasured,false);
  assert.equal(meta.predictionsAreIllustrative,true);
  assert.equal(meta.summary.f1,'50.0%');
  assert.equal(meta.prioritizedIssues[0].type,'FORBIDDEN_PLAY');
  assert.match(markdown,/synthetic predictions only/i);
});
test('reports claiming live provider quality are rejected',()=>{
  const data=fixture();data.modelQualityMeasured=true;
  assert.throws(()=>buildCodexQaSummary(data),TypeError);
});
test('unknown issue classes and invalid source references are rejected',()=>{
  const a=fixture();a.prioritizedCases[0].issues[0].lineId='../../secret';
  assert.throws(()=>buildCodexQaSummary(a),TypeError);
  const b=fixture();b.prioritizedCases[0].issues[0].type='PROVIDER_VALIDATED';
  assert.throws(()=>buildCodexQaSummary(b),TypeError);
  const c=fixture();c.summary.recall=1.5;
  assert.throws(()=>buildCodexQaSummary(c),TypeError);
});


test('Codex prioritizes measured heuristic misses and capacity while labeling Meta as unmeasured',()=>{
  const stage={
    mode:'SYNTHETIC_CONTRACT_REPLAY_NOT_META_INFERENCE',modelQualityMeasured:false,
    sourceFiles:1,
    totals:{lines:18,expectedEvents:12,verifierDetected:7,verifierMissed:5,
      verifierFalseFlags:1,capacityExcess:4},
    checks:[{
      id:'sample-1',
      windows:[{id:'S1-W1',verifierMissing:5,verifierFalseFlags:1,capacityExcess:4}],
    }],
    failures:[],
  };
  const report=buildCodexQaSummary(fixture(),stage);
  assert.equal(report.meta.modelQualityMeasured,false);
  assert.equal(report.meta.originalStage.metrics.reviewMissed,5);
  assert.equal(report.meta.originalStage.metrics.schemaOverflow,4);
  assert.equal(report.meta.originalStage.prioritizedLeads[0].type,'HEURISTIC_MISSED_GOLD');
  assert.match(report.markdown,/NOT Meta accuracy/);
  assert.match(report.markdown,/Independent acoustic reviewer: 7 detected, 5 missed/);
  assert.match(report.markdown,/SCHEMA_CAPACITY_OVERFLOW/);
  const direct=summarizeOriginalStageCorpus(stage);
  assert.equal(direct.modelQualityMeasured,false);
  const bad=structuredClone(stage);
  bad.totals.verifierMissed=6;
  assert.throws(()=>summarizeOriginalStageCorpus(bad),TypeError);
  const malicious=structuredClone(stage);
  malicious.checks[0].id='../.env';
  assert.throws(()=>summarizeOriginalStageCorpus(malicious),TypeError);
});
