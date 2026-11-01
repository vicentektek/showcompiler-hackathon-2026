import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AGENT_PROMPT_VERSION} from '../tools/agentRoutes.mjs';
import {buildCodexQaSummaryWithHumanFeedback} from '../tools/codex-qa-summary.mjs';

const feedback=JSON.parse(await readFile(
 new URL('../fixtures/qa/artistic-feedback-2026-10-31.json',import.meta.url),'utf8'));
const report={
 mode:'OFFLINE_HUMAN_GOLD_COMPARISON',modelQualityMeasured:false,
 summary:{cases:1,expectedEvents:1,falseNegatives:0,falsePositives:0,
  forbiddenPlay:0,invalidReferences:0,duplicates:0,creativeAwaitingReview:0,
  precision:1,recall:1,f1:1,dimensions:{
   localization:{precision:1,recall:1,f1:1},transport:{precision:1,recall:1,f1:1},
   soundClassification:{precision:1,recall:1,f1:1},basis:{precision:1,recall:1,f1:1},
  }},
 prioritizedCases:[],
};

test('four artistic ratings retain human provenance and remain separate from automatic QA',()=>{
 const {meta,markdown}=buildCodexQaSummaryWithHumanFeedback(report,feedback);
 assert.equal(meta.summary.f1,'100.0%');
 assert.equal(meta.modelQualityMeasured,false);
 assert.deepEqual(meta.humanArtisticFeedback,{
  kind:'HUMAN_ARTISTIC_REVIEW',
  sourceBatteryId:feedback.sourceBatteryId,
  reviewedAt:feedback.reviewedAt,
  provenance:feedback.provenance,
  sourceCapture:feedback.sourceCapture,
  sourceReport:feedback.sourceReport,
  reviewCount:4,
  meanRating:4.25,
  accepted:3,
  modify:1,
  rejected:0,
  evaluations:feedback.feedback.map(item=>({
   caseId:item.equivalentToHistoricalCase,caseFingerprint:item.caseFingerprint,
   requestId:item.requestId,category:item.category,language:item.language,
   rating:item.rating,decision:item.decision,comments:item.comments,
  })),
  findings:[{
   caseId:'paid-0022',lineId:'L4',status:'UNCONFIRMED_CAPTURE_CONTEXT_CONFLICT',
  }],
  promptComparison:feedback.promptComparison,
 });
 assert.match(markdown,/Human artistic feedback \(separate from automatic QA\)/);
 assert.match(markdown,/4 human ratings; mean 4\.25\/5/);
 assert.match(markdown,/paid-0032 \| es \| 5\/5 \| accept/);
 assert.match(markdown,/UNCONFIRMED_CAPTURE_CONTEXT_CONFLICT/);
 assert.match(markdown,/no new paid requests/i);
});

test('human feedback keeps the reported comment and all four capture identities unchanged',()=>{
 assert.equal(feedback.feedback.length,4);
 assert.equal(feedback.reviewedAt,'2026-10-31T17:14:22.068Z');
 assert.deepEqual(feedback.feedback.map(item=>item.equivalentToHistoricalCase),
  ['paid-0022','paid-0032','paid-0030','paid-0040']);
 assert.equal(feedback.feedback[0].comments,
  'el l4 pone especificamente que se abre una puerta, y ha puesto un sonido de viento, en lugar de uno abriendo la puerta');
 assert.equal(feedback.feedback[0].requestId,
  'artistic-review-9d0abfab1b9954873a19b6d2288df1625cca72cb48440e00');
 assert.equal(feedback.feedback[0].rating,3);
 assert.equal(feedback.feedback[0].decision,'modify');
 assert.match(feedback.provenance,/NEW live Muse Spark captures/);
 assert.match(feedback.policy,/historical responses/);
});

test('paid-0022 is not promoted to a confirmed model error without matching captured output',()=>{
 assert.equal(feedback.evidenceReconciliation.status,'UNCONFIRMED_CAPTURE_CONTEXT_CONFLICT');
 assert.match(feedback.evidenceReconciliation.observedInput,/Wind effect.*L4/);
 assert.match(feedback.evidenceReconciliation.observedResponse,/closing cues/);
 assert.match(feedback.evidenceReconciliation.conclusion,/do not score.*confirmed model omission/);
 assert.equal(feedback.promptComparison.previousVersion,'agent-design-context-rcv3');
 assert.equal(feedback.promptComparison.previousBehavior,
  'No dedicated instruction distinguished explicit acoustic actions from optional ambience.');
 assert.equal(feedback.promptComparison.currentVersion,'agent-design-context-rcv4');
 assert.equal(feedback.promptComparison.currentVersion,AGENT_PROMPT_VERSION);
 assert.equal(feedback.promptComparison.liveOutputComparison,'NOT_RUN_NO_NEW_PAID_REQUESTS');
});
