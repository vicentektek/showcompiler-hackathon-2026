import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildQualityMatrix} from '../src/qa/qualityMatrix.mjs';
import {qualityAttemptIdentity} from '../tools/qualityCampaign.mjs';
import {evaluateMetaCase} from '../src/qa/qualityEvaluation.mjs';
import {reviewRetainedAgentCase,reviewSavedAgentEvidence} from '../tools/agentEvidenceReview.mjs';

const item=buildQualityMatrix().cases.find(c=>c.id==='quality-meta-workflow-01');
const scenario={id:item.id,qualityCase:item,caseFingerprint:qualityAttemptIdentity(item)};
function savedRow(){
 const quality=evaluateMetaCase(item,{status:'PLAN',operations:[{
  op:'CREATE_CUE',afterCueId:'qa-cue-3',label:'Original placeholder',
 }]});
 return {id:item.id,provider:'meta',caseFingerprint:scenario.caseFingerprint,
  httpStatus:200,correct:false,result:'WRONG_EDIT',quality:{
   ...quality,correct:false,evaluatorRevision:'quality-contract-v1',
   evidence:{...quality.evidence,requestedCorrect:false},
  }};
}
test('replay diagnoses the append oracle without reconstructing discarded labels or claiming a full response',()=>{
 const row=savedRow(),before=JSON.stringify(row);
 const result=reviewRetainedAgentCase(scenario,row);
 assert.equal(result.retainedContractCorrect,true);
 assert.equal(result.evaluatorCorrection,'APPEND_AFTER_LAST_IS_VALID');
 assert.equal(result.fullResponseReplayed,false);
 assert.equal(result.preservationIndependentlyReplayed,false);
 assert.equal(JSON.stringify(row),before);
 const wrong=savedRow();wrong.quality.evidence.operations[0].afterCueId='qa-cue-1';
 assert.equal(reviewRetainedAgentCase(scenario,wrong).retainedContractCorrect,false);
 const altered=savedRow();altered.quality.contractFingerprint='0'.repeat(64);
 assert.equal(reviewRetainedAgentCase(scenario,altered).retainedContractCorrect,null);
});
test('history includes UUID report names, excludes simulations, deduplicates inputs and preserves files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'runq-evidence-review-'));
 try{
  const row=savedRow(),report={version:2,realProviderEvaluations:true,
   evidenceMode:'LIVE_PRODUCT_HTTP_PROVIDER_RECEIPTS_PENDING',results:[row]};
  const file=join(dir,'eval-123-456-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.json');
  await writeFile(file,JSON.stringify(report));
  await writeFile(join(dir,'eval-124-457.json'),JSON.stringify(report));
  await writeFile(join(dir,'eval-125-458.json'),JSON.stringify({
   ...report,realProviderEvaluations:false,evidenceMode:'OFFLINE_SIMULATED_TRANSPORT',
  }));
  const before=await readFile(file);
  const result=await reviewSavedAgentEvidence({directory:dir,corpus:[scenario]});
  assert.equal(result.summary.reportedRequests,2);
  assert.equal(result.summary.uniqueInputs,1);
  assert.equal(result.summary.duplicateInputs,1);
  assert.equal(result.summary.simulatedReportsExcluded,1);
  assert.equal(result.summary.newProviderRequests,0);
  assert.deepEqual(await readFile(file),before);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('events can be fully reprojected; incomplete coverage and missing evidence remain unscored',()=>{
 const eventItem=buildQualityMatrix().cases.find(c=>c.family==='transport');
 const response={
  proposals:eventItem.expected.events.filter(e=>e.transport==='PLAY').map(e=>({lineId:e.lineId})),
  proposalDetails:eventItem.expected.events.filter(e=>e.transport==='PLAY'),
  observations:eventItem.expected.events.filter(e=>e.transport!=='PLAY').map(e=>({...e,sourceLineId:e.lineId})),
  coverage:{complete:true},
 };
 const quality=evaluateMetaCase(eventItem,response);
 const s={qualityCase:eventItem,caseFingerprint:qualityAttemptIdentity(eventItem)};
 const row={id:eventItem.id,caseFingerprint:s.caseFingerprint,httpStatus:200,correct:true,quality};
 assert.equal(reviewRetainedAgentCase(s,row).eventReplay.correct,true);
 const incomplete=structuredClone(row);incomplete.quality.evidence.coverageComplete=false;
 assert.equal(reviewRetainedAgentCase(s,incomplete).eventReplay.scored,false);
 const missing=structuredClone(row);delete missing.quality.evidence;
 assert.equal(reviewRetainedAgentCase(s,missing).retainedContractCorrect,null);
});
