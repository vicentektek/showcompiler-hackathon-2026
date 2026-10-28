import test from 'node:test';
import assert from 'node:assert/strict';
import {readSeminarCorpus} from '../tools/seminarCorpus.mjs';
import {QUALITY_CASE_IDS,buildQualityEvidence,renderQualityEvidence} from '../tools/threeCaseQualityLab.mjs';

const metaModel='muse-spark-1.3';
const basetenModel='meta-models/muse-spark-open';
const makeReport=(c,model)=>({
  model,realInferenceExecuted:true,
  cases:[{id:c.id,status:'COMPLETE',
    typedEvents:c.expected.map(e=>({sourceLineId:e.lineId,transport:e.transport,cueKind:e.cueKind,basis:e.basis})),
    requests:[{status:'COMPLETED',durationMs:25,usage:{promptTokens:20,completionTokens:40}}]}],
});

test('three original cases export deterministic, source-free evidence and paired scores',async()=>{
  const corpus=await readSeminarCorpus();
  const selected=QUALITY_CASE_IDS.map(id=>corpus.cases.find(c=>c.id===id));
  assert.equal(selected.length,3);
  assert.ok(selected.every(Boolean));
  const result=buildQualityEvidence(corpus,selected.map(c=>makeReport(c,metaModel)),
    selected.map(c=>makeReport(c,basetenModel)));
  assert.equal(result.paired.casesCompared,3);
  assert.equal(result.reviews.length,3);
  assert.ok(result.reviews.every(r=>r.meta.missed.length===0&&r.baseten.extra.length===0));
  assert.equal(result.humanReviewed,false);
  assert.doesNotMatch(JSON.stringify(result),/scriptText|Bearer |apiKey|sourceEvidence/);
  assert.match(renderQualityEvidence(result),/Complete matched live cases/);
});

test('review refuses offline, partial, mismatched, and missing results',async()=>{
  const corpus=await readSeminarCorpus();
  const selected=QUALITY_CASE_IDS.map(id=>corpus.cases.find(c=>c.id===id));
  const meta=selected.map(c=>makeReport(c,metaModel));
  const baseten=selected.map(c=>makeReport(c,basetenModel));
  const testRejection=()=>assert.throws(()=>buildQualityEvidence(corpus,meta,baseten),/Incomplete|offline|mismatched|invalid|required/);
  baseten[0].realInferenceExecuted=false;testRejection();
  baseten[0].realInferenceExecuted=true;
  baseten[0].cases[0].status='PARTIAL';testRejection();
  baseten[0].cases[0].status='COMPLETE';
  baseten[0].cases[0].requests=[{status:'DRY_RUN_NO_API'}];testRejection();
  baseten[0].cases[0].requests=[{status:'COMPLETED'}];
  baseten[0].cases[0].typedEvents=[{sourceLineId:'L999',transport:'BAD'}];testRejection();
  assert.throws(()=>buildQualityEvidence(corpus,meta,baseten.slice(1)),/required/);
});
