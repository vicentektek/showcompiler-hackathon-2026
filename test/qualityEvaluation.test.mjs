import test from 'node:test';
import assert from 'node:assert/strict';
import {buildQualityMatrix,initialMetaPhase,caseInputFingerprint} from '../src/qa/qualityMatrix.mjs';
import {evaluateMetaCase,evaluateModalCase,qualityReport,compareQualityVersions} from '../src/qa/qualityEvaluation.mjs';
import {measurePilotWav} from '../tools/runq-modal-live-batch.mjs';
import {classifyAudioQuality,compareAudioAlternatives} from '../src/qa/audioQuality.mjs';

function wav({seconds=2,channels=1,sample=(frame,channel)=>1000}={}){
 const rate=16000,frames=seconds*rate,bytes=Buffer.alloc(44+frames*channels*2);
 bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVE',8);
 bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);
 bytes.writeUInt16LE(channels,22);bytes.writeUInt32LE(rate,24);
 bytes.writeUInt32LE(rate*channels*2,28);bytes.writeUInt16LE(channels*2,32);
 bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(bytes.length-44,40);
 for(let frame=0;frame<frames;frame++)for(let channel=0;channel<channels;channel++)
  bytes.writeInt16LE(sample(frame,channel),44+(frame*channels+channel)*2);
 return bytes;
}
const matrix=buildQualityMatrix();
const agentItem=matrix.cases.find(c=>c.family==='preservation');
const reply=operations=>({status:'PLAN',message:'Pending review',operations});

test('matrix has 400/100 unique real-request contracts, fixed coverage and independent holdout',()=>{
 assert.deepEqual(matrix.counts,{meta:400,modal:100});
 assert.equal(matrix.cases.length,500);
 assert.equal(new Set(matrix.cases.map(c=>c.id)).size,500);
 assert.equal(new Set(matrix.cases.map(c=>c.inputFingerprint)).size,500);
 for(const provider of ['meta','modal']){
  const rows=matrix.cases.filter(c=>c.provider===provider);
  assert.equal(rows.filter(c=>c.language==='es').length,rows.length/2);
  assert.equal(rows.filter(c=>c.split==='holdout').length,rows.length*0.4);
  assert.ok(rows.every(c=>c.criteria.length&&c.invariants.length&&c.expected&&c.failureSeverity));
 }
 const phase=initialMetaPhase(matrix);
 assert.equal(phase.length,30);assert.equal(new Set(phase.map(c=>c.id)).size,30);
 assert.equal(new Set(phase.map(c=>c.family)).size,10);
 assert.equal(new Set(phase.map(c=>c.difficulty)).size,4);
 assert.equal(phase.filter(c=>c.language==='es').length,15);
 assert.ok(phase.every(c=>c.split==='development'));
 assert.equal(buildQualityMatrix().corpusHash,matrix.corpusHash);
 const modal=matrix.cases.find(c=>c.provider==='modal');
 assert.equal(caseInputFingerprint({...modal,input:{...modal.input,seed:991}}),modal.inputFingerprint);
});

test('independent edit oracle rejects correct requested value plus collateral changes',()=>{
 const expected=agentItem.expected.operations;
 const good=evaluateMetaCase(agentItem,reply(expected));
 assert.equal(good.correct,true);assert.equal(good.editCorrect,true);
 const collateral=structuredClone(expected);collateral[0].changes.fadeOutMs=999;
 const bad=evaluateMetaCase(agentItem,reply(collateral));
 assert.equal(bad.correct,false);
 assert.ok(bad.failures.some(f=>f.code==='UNREQUESTED_MUTATION'));
 assert.equal(bad.evidence.undoExact,true,'Undo alone is not edit correctness');
});

test('workflow oracle accepts an empty cue appended after the last existing cue',()=>{
 const item=matrix.cases.find(c=>c.id==='quality-meta-workflow-01');
 const lastCueId=item.input.project.cues.at(-1).id;
 const result=evaluateMetaCase(item,reply([{
  op:'CREATE_CUE',afterCueId:lastCueId,label:'Bell placeholder',
 }]));
 assert.equal(result.correct,true);
 assert.equal(result.editCorrect,true);
 assert.equal(result.evidence.requestedCorrect,true);
 assert.equal(result.evidence.preserved,true);
});

test('exact source, FP, omission, duplicate and transport metrics are independently scored',()=>{
 const item=matrix.cases.find(c=>c.family==='transport');
 const projectResponse=events=>({
  proposals:events.filter(e=>e.transport==='PLAY').map(e=>({lineId:e.lineId})),
  proposalDetails:events.filter(e=>e.transport==='PLAY'),
  observations:events.filter(e=>e.transport!=='PLAY').map(e=>({...e,sourceLineId:e.lineId})),
  coverage:{complete:true},
 });
 const good=evaluateMetaCase(item,projectResponse(item.expected.events));
 assert.equal(good.eventMetrics.f1,1);
 const bad=evaluateMetaCase(item,projectResponse([
  ...item.expected.events.filter(e=>e.transport!=='STOP'),
  {lineId:'L99',transport:'PLAY',cueKind:'FX',basis:'EXPLICIT'},
  item.expected.events[0],
 ]));
 assert.equal(bad.eventMetrics.truePositives,3);
 assert.equal(bad.eventMetrics.falsePositives,2);
 assert.equal(bad.eventMetrics.falseNegatives,1);
 assert.ok(bad.failures.some(f=>f.code==='HALLUCINATED_SOURCE'));
 assert.ok(bad.failures.some(f=>f.code==='DUPLICATE_EVENT'));
 const incomplete=evaluateMetaCase(item,{...projectResponse(item.expected.events),coverage:{complete:false}});
 assert.equal(incomplete.scored,false);assert.equal(incomplete.eventMetrics,null);
 const lost=projectResponse(item.expected.events);delete lost.observations[0].sourceLineId;
 assert.equal(evaluateMetaCase(item,lost).failures[0].code,'MISSING_SOURCE_EVIDENCE');
});

test('silence, low RMS, clipping, exact duration and internal environment gaps are actionable',()=>{
 const silence=measurePilotWav(wav({sample:()=>0}),2);
 assert.equal(silence.effectiveDurationSeconds,0);
 assert.equal(classifyAudioQuality(silence).failures[0].code,'AUDIO_SILENCE');
 const low=measurePilotWav(wav({sample:()=>80}),2);
 assert.ok(classifyAudioQuality(low).failures.some(f=>f.code==='AUDIO_LOW_LEVEL'));
 const clipped=measurePilotWav(wav({sample:()=>32767}),2);
 assert.equal(classifyAudioQuality(clipped).failures[0].severity,'HIGH');
 const gaps=measurePilotWav(wav({sample:frame=>frame>=8000&&frame<24000?0:1000}),2);
 assert.equal(gaps.activeDurationSeconds.toFixed(2),'1.00');
 assert.equal(gaps.silenceRuns[0].durationSeconds,1);
 assert.equal(classifyAudioQuality(gaps,{kind:'ENVIRONMENT',continuous:true}).failures[0].code,'ENVIRONMENT_DROPOUT');
 assert.equal(classifyAudioQuality(gaps).failures.length,0,'One-shot decay is not an ambience dropout');
 assert.equal(classifyAudioQuality(measurePilotWav(wav(),3)).failures[0].code,'AUDIO_DURATION');
});

test('stereo opposite phase does not cancel to false silence; alternatives never select artistic winner',()=>{
 const stereo=measurePilotWav(wav({channels:2,sample:(_,channel)=>channel?-1000:1000}),2);
 assert.equal(stereo.suspectedWholeFileSilence,false);
 const other=measurePilotWav(wav({sample:()=>2000}),2);
 const comparison=compareAudioAlternatives(stereo,other);
 assert.equal(comparison.winner,null);assert.equal(comparison.semanticPreference,'PENDING_HUMAN_LISTENING');
});

test('reports exclude unscored/missing evidence from quality denominators and never auto-promote',()=>{
 const good=evaluateMetaCase(agentItem,reply(agentItem.expected.operations));
 const absent={...good,caseId:'absent',inputFingerprint:'absent',scored:false,correct:null,
  editCorrect:null,failures:[{code:'UNKNOWN',severity:'HIGH'}]};
 const report=qualityReport([good,absent]);
 assert.equal(report.summary.scored,1);assert.equal(report.summary.editCorrectness,1);
 assert.equal(report.summary.precision,null);
 const regression={...good,correct:false};
 const comparison=compareQualityVersions(qualityReport([good]),qualityReport([regression]));
 assert.equal(comparison.regressionGate,'BLOCKED');
 assert.equal(comparison.stableAutomaticallyModified,false);
 const unchanged=compareQualityVersions(qualityReport([good]),qualityReport([good]));
 assert.equal(unchanged.regressionGate,'INSUFFICIENT_HOLDOUT_EVIDENCE');
 assert.equal(unchanged.delta.editCorrectness,0);
 assert.throws(()=>compareQualityVersions(qualityReport([good]),
  qualityReport([{...good,contractFingerprint:'altered-gold'}])),/COMPARISON_GOLD_CONTRACT_CHANGED/);
 const item=matrix.cases.find(c=>c.provider==='modal');
 const sound=evaluateModalCase(item,measurePilotWav(wav({seconds:item.input.durationSeconds}),item.input.durationSeconds));
 assert.equal(sound.reviewRequired,true);
 assert.equal(sound.evidence.assessment.semanticCoherence,'NOT_AUTOMATICALLY_EVALUABLE');
});
