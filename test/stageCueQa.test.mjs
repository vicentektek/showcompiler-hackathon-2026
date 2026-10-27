import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateStageEventCases, renderStageEventReport } from '../src/core/stageCueQa.mjs';
import { parseQaArgs, runCueQa } from '../tools/cue-qa-report.mjs';

const e=(lineId,transport='PLAY',cueKind='FX',basis='EXPLICIT')=>({lineId,transport,cueKind,basis});
const one=(expected, predictions, forbiddenPlayLineIds=[])=>evaluateStageEventCases({
  version:1,cases:[{id:'case-1',scriptText:'ESCENA 1\n(Suena una alarma.)\n(La alarma se detiene.)\nANA: Recuerdo los truenos.',expected,forbiddenPlayLineIds}],
},{version:1,predictionsByCase:{'case-1':predictions}});

test('scores sound intent and STOP as distinct mandatory event matches',()=>{
  const gold=[e('L2'),e('L3','STOP')];
  const perfect=one(gold,[e('L2'),e('L3','STOP')]);
  assert.equal(perfect.summary.truePositives,2);
  assert.equal(perfect.summary.f1,1);
  assert.equal(perfect.summary.falseNegatives,0);

  const wrong=one(gold,[e('L2'),e('L3','PLAY')]);
  assert.equal(wrong.summary.truePositives,1);
  assert.equal(wrong.summary.falsePositives,1);
  assert.equal(wrong.summary.falseNegatives,1);
  assert.equal(wrong.summary.wrongAction,1);
  assert.equal(wrong.prioritizedCases[0].issues.some(x=>x.type==='WRONG_EVENT_TYPE'),true);
});

test('penalizes forbidden and hallucinated PLAY and duplicate proposals',()=>{
  const score=one([e('L2')],[e('L2'),e('L2'),e('L4'),e('L999')],['L4']);
  assert.equal(score.summary.truePositives,1);
  assert.equal(score.summary.falsePositives,3);
  assert.equal(score.summary.forbiddenPlay,1);
  assert.equal(score.summary.invalidReferences,1);
  assert.equal(score.summary.duplicates,1);
  assert.equal(score.summary.precision,.25);
  assert.equal(score.summary.recall,1);
});

test('optional creativity needs human review, and cannot mask an explicit gold mismatch',()=>{
  const scored=one([e('L2')],[
    e('L2','PLAY','AMBIENCE','SUGGESTED'),
    e('L4','PLAY','AMBIENCE','SUGGESTED'),
  ]);
  assert.equal(scored.summary.wrongAction,1);
  assert.equal(scored.summary.falseNegatives,1);
  assert.equal(scored.summary.creativeAwaitingReview,1);
  assert.equal(scored.summary.precision,0);
  assert.equal(scored.summary.recall,0);
});

test('empty guesses against existing cues score zero, not fictitious full precision',()=>{
  const s=one([e('L2')],[]);
  assert.equal(s.summary.precision,0);
  assert.equal(s.summary.recall,0);
  assert.equal(s.summary.f1,0);
  const none=one([],[]);
  assert.equal(none.summary.precision,1);
  assert.equal(none.summary.recall,1);
  assert.equal(none.summary.f1,1);
});

test('invalid gold, source ID, and predictions are rejected without provider calls',()=>{
  assert.throws(()=>one([e('L999')],[]),RangeError);
  assert.throws(()=>one([e('L2'),e('L2')],[]),RangeError);
  assert.throws(()=>one([e('L2')],[],['L2']),RangeError);
  assert.throws(()=>one([], [{lineId:'L0',transport:'PLAY',cueKind:'FX',basis:'EXPLICIT'}]),TypeError);
  assert.throws(()=>one([], [{sourceLineId:'L2',transport:'RUN',cueKind:'FX',basis:'EXPLICIT'}]),TypeError);
  assert.throws(()=>evaluateStageEventCases({version:1,cases:[]},{version:1,predictionsByCase:{}}),TypeError);
  assert.throws(()=>evaluateStageEventCases({version:1,cases:[{id:'x',scriptText:'ok',expected:[]}]},{version:1,predictionsByCase:{unknown:[]}}),TypeError);
});

test('generated report avoids embedding the script and never claims verified model results',()=>{
  const g={version:1,provenance:'ORIGINAL_TEST',cases:[{
    id:'safe-test',scriptText:'ESCENA 1\n(Clave secreta ficticia: ABC_SUPER_PRIVATE_EXAMPLE)',
    expected:[],forbiddenPlayLineIds:[],
  }]};
  const p={version:1,provenance:'REAL_PROVIDER_CAPTURE_REVIEWED',predictionsByCase:{'safe-test':[]}};
  const result=evaluateStageEventCases(g,p);
  assert.equal(result.modelQualityMeasured,false);
  const report=renderStageEventReport(result);
  assert.match(report,/NOT proof of measured model accuracy/);
  assert.doesNotMatch(report,/ABC_SUPER_PRIVATE_EXAMPLE/);
});

test('illustrative rights-clear fixtures generate actionable offline Markdown and JSON',async t=>{
  const parent=await mkdtemp(join(tmpdir(),'runq-offline-qa-'));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const {result,mdPath,jsonPath}=await runCueQa({
    gold:'fixtures/qa/theatre-gold-v1.json',
    predictions:'fixtures/qa/illustrative-predictions-v1.json',
    output:parent,
  });
  assert.equal(result.summary.cases,6);
  assert.equal(result.summary.truePositives,5);
  assert.equal(result.summary.falseNegatives,2);
  assert.equal(result.summary.forbiddenPlay,3);
  assert.equal(result.summary.creativeAwaitingReview,1);
  assert.equal(result.modelQualityMeasured,false);
  const markdown=await readFile(mdPath,'utf8');
  const json=JSON.parse(await readFile(jsonPath,'utf8'));
  assert.match(markdown,/telephone-state/);
  assert.match(markdown,/MISSED_EXPECTED_EVENT/);
  assert.match(markdown,/OFFLINE|offline/);
  assert.equal(json.summary.cases,6);
  assert.equal(json.prioritizedCases.some(c=>c.issues.some(x=>x.type==='FORBIDDEN_PLAY')),true);
});

test('CLI validates arguments and has explicit offline defaults',()=>{
  assert.equal(parseQaArgs([]).output,'artifacts/cue-qa');
  assert.equal(parseQaArgs(['--output','tmp/my-qa']).output,'tmp/my-qa');
  assert.throws(()=>parseQaArgs(['--secrets','.env']),TypeError);
  assert.throws(()=>parseQaArgs(['--output']),TypeError);
});
