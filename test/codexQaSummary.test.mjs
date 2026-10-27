import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCodexQaSummary } from '../tools/codex-qa-summary.mjs';
function fixture() {
  return {
    mode:'OFFLINE_HUMAN_GOLD_COMPARISON',modelQualityMeasured:false,
    summary:{cases:1,expectedEvents:2,falseNegatives:1,falsePositives:1,
      forbiddenPlay:1,invalidReferences:0,duplicates:0,creativeAwaitingReview:1,
      semanticAlternativesPending:1,semanticAlternativesApproved:0,
      precision:0.5,recall:0.5,f1:0.5,
      dimensions:{
        localization:{precision:1,recall:1,f1:1},
        transport:{precision:1,recall:1,f1:1},
        soundClassification:{precision:.5,recall:.5,f1:.5},
        basis:{precision:1,recall:1,f1:1},
      }},
    prioritizedCases:[{id:'stage-example',issues:[
      {type:'FORBIDDEN_PLAY',lineId:'L2'},
      {type:'MISSED_EXPECTED_EVENT',lineId:'L3'},
      {type:'SEMANTIC_ALTERNATIVE_REVIEW',lineId:'L3'},
    ]}],
  };
}
test('Codex synthetic results never masquerade as model quality',()=>{
  const {meta,markdown}=buildCodexQaSummary(fixture());
  assert.equal(meta.modelQualityMeasured,false);
  assert.equal(meta.predictionsAreIllustrative,true);
  assert.equal(meta.summary.f1,'50.0%');
  assert.equal(meta.summary.localizationF1,'100.0%');
  assert.equal(meta.summary.transportF1,'100.0%');
  assert.equal(meta.summary.soundClassificationF1,'50.0%');
  assert.equal(meta.summary.basisF1,'100.0%');
  assert.equal(meta.summary.semanticAlternativesPending,1);
  assert.equal(meta.prioritizedIssues[0].type,'FORBIDDEN_PLAY');
  assert.equal(meta.prioritizedIssues[2].type,'SEMANTIC_ALTERNATIVE_REVIEW');
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
test('generated Codex QA diagnostics remain local and gitignored',async()=>{
  const ignore=await readFile('.gitignore','utf8');
  assert.match(ignore,/^artifacts\/codex-qa\/$/m);
});
