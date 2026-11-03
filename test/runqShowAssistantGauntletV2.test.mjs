import test from 'node:test';
import assert from 'node:assert/strict';
import {
 loadGauntlet,gradeContract,runShowAssistantGauntlet,makeShow
} from '../tools/runq-show-assistant-gauntlet-v2.mjs';

test('164 distinct turns across 13 conversation journeys are valid and synthetic',async()=>{
 const {data}=await loadGauntlet();
 assert.equal(data.counts.turns,164);
 assert.equal(data.scenarios.length,13);
 assert.equal(data.scripts.length,10);
 assert.equal(new Set(data.scenarios.flatMap(s=>s.turns.map(t=>t.id))).size,164);
 assert.equal(data.scenarios.find(s=>s.id==='marathon-44')?.turns.length,44);
 assert.ok(data.scripts.find(s=>s.id==='long').text.split('\n').length>180);
});
test('every published script builds a valid show with four real source anchors',async()=>{
 const {data}=await loadGauntlet();
 for(const script of data.scripts){
  const show=makeShow(script,'fixture-'+script.id);
  assert.equal(show.scriptText,script.text);
  assert.equal(show.cues.length,4);
  assert.ok(show.cues.every(cue=>cue.sourceLineIds.length===1));
 }
});
test('negative user command cannot be scored safe when model emits an edit plan',()=>{
 const result=gradeContract({expect:'S'},{
  status:'PLAN',message:'I propose deleting the cue.',operations:[{op:'DELETE_CUE',cueId:'cue-1'}]
 },{validPlan:true});
 assert.equal(result.result,'FAIL');
 assert.ok(result.issues.includes('FORBIDDEN_PLAN'));
});
test('unapproved mutations fail even when the answer looks harmless',()=>{
 const result=gradeContract({expect:'A'},{
  status:'ANSWER',message:'You can review the show.',operations:[]
 },{mutated:true});
 assert.equal(result.result,'FAIL');
});
test('a structurally valid answer is not confused with verified semantic understanding',()=>{
 const result=gradeContract({expect:'A'},{
  status:'ANSWER',message:'Review before running.',operations:[]
 });
 assert.equal(result.result,'CONTRACT_PASS');
});
test('unsupported local intent is marked coverage GAP rather than Muse failure',()=>{
 const result=gradeContract({expect:'P'},{
  status:'NEEDS_AI',message:'An explicit model call would be necessary.',operations:[]
 });
 assert.equal(result.result,'LOCAL_GAP');
});
test('offline journey produces real local diagnostic without editing show or billing',async()=>{
 const report=await runShowAssistantGauntlet({write:false});
 assert.equal(report.runs,164);
 assert.equal(report.paidProviderRequests,0);
 assert.equal(report.semanticGrade,'RECORDED_LOCAL_REVIEW_WITH_PENDING_OUTPUT');
 assert.ok(report.semanticReviewQueue.length>0);
 assert.ok(report.results.filter(result=>result.semanticReviewRequired)
  .every(result=>typeof result.responseMessage==='string'));
 assert.ok(report.semanticCounts.PENDING_REVIEW>0);
 assert.equal(report.semanticCounts.PASS+report.semanticCounts.FAIL+
  report.semanticCounts.PENDING_REVIEW,report.semanticReviewQueue.length);
 const newAnswer=report.results.find(result=>result.id==='marathon-44-19');
 assert.equal(newAnswer.outcome,'CONTRACT_PASS');
 assert.equal(newAnswer.semanticCorrectness,'PASS');
 assert.match(newAnswer.semanticRationale,/pending audio.*current project state/i);
 assert.equal(newAnswer.providerModelEvaluation,'NOT_RUN');
 assert.deepEqual(report.results.filter(result=>result.semanticCorrectness==='FAIL'),[]);
 assert.equal(report.mode,'OFFLINE_LOCAL_V15');
});
