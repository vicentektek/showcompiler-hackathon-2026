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

test('negative ambience, STOP, SILENCE, physical action and dialogue mentions remain distinct',()=>{
  const gold={version:1,cases:[{
    id:'negative-sound-language',
    scriptText:[
      'ESCENA 1',
      '(No hay música ni murmullo de pasillo.)',
      '[La lluvia grabada se corta.]',
      '(Silencio total.)',
      '(Mara golpea físicamente la puerta.)',
      'MARA: Aún recuerdo aquel timbre.',
    ].join('\n'),
    expected:[e('L3','STOP','AMBIENCE'),e('L4','SILENCE','SILENCE')],
    forbiddenPlayLineIds:['L2','L5','L6'],
  }]};
  const safe=evaluateStageEventCases(gold,{version:1,predictionsByCase:{
    'negative-sound-language':[
      {sourceLineId:'L3',transport:'STOP',cueKind:'AMBIENCE',basis:'EXPLICIT'},
      {sourceLineId:'L4',transport:'SILENCE',cueKind:'SILENCE',basis:'EXPLICIT'},
    ],
  }});
  assert.equal(safe.summary.precision,1);
  assert.equal(safe.summary.recall,1);
  assert.equal(safe.summary.forbiddenPlay,0);

  const unsafe=evaluateStageEventCases(gold,{version:1,predictionsByCase:{
    'negative-sound-language':[
      {sourceLineId:'L2',transport:'PLAY',cueKind:'AMBIENCE',basis:'SUGGESTED'},
      {sourceLineId:'L3',transport:'PLAY',cueKind:'AMBIENCE',basis:'EXPLICIT'},
      {sourceLineId:'L4',transport:'PLAY',cueKind:'FX',basis:'EXPLICIT'},
      {sourceLineId:'L5',transport:'PLAY',cueKind:'FX',basis:'EXPLICIT'},
      {sourceLineId:'L6',transport:'PLAY',cueKind:'FX',basis:'EXPLICIT'},
    ],
  }});
  assert.equal(unsafe.summary.forbiddenPlay,3);
  assert.equal(unsafe.summary.wrongAction,2);
  assert.equal(unsafe.summary.falseNegatives,2);
  const issues=unsafe.prioritizedCases[0].issues;
  assert.deepEqual(issues.filter(x=>x.type==='FORBIDDEN_PLAY').map(x=>x.lineId),['L2','L5','L6']);
  assert.deepEqual(issues.filter(x=>x.type==='WRONG_EVENT_TYPE').map(x=>x.lineId),['L3','L4']);
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

test('semantic alternatives require rationale and cannot redefine location or transport',()=>{
  const sample={id:'alternatives',scriptText:'ESCENA\n(Suena ambiente.)',
    expected:[e('L2','PLAY','AMBIENCE')],forbiddenPlayLineIds:[]};
  const prediction={version:1,predictionsByCase:{alternatives:[]}};
  const annotation={canonical:e('L2','PLAY','AMBIENCE'),
    alternative:e('L2','PLAY','MUSIC'),
    rationale:'Instrumental texture crosses the ambience/music boundary.',
    reviewStatus:'PENDING_HUMAN_REVIEW'};
  assert.doesNotThrow(()=>evaluateStageEventCases({version:1,cases:[{
    ...sample,alternativeAnnotations:[annotation],
  }]},prediction));
  assert.throws(()=>evaluateStageEventCases({version:1,cases:[{
    ...sample,alternativeAnnotations:[{...annotation,rationale:''}],
  }]},prediction),TypeError);
  assert.throws(()=>evaluateStageEventCases({version:1,cases:[{
    ...sample,alternativeAnnotations:[{...annotation,
      alternative:e('L2','STOP','MUSIC')}],
  }]},prediction),RangeError);
  assert.throws(()=>evaluateStageEventCases({version:1,cases:[{
    ...sample,alternativeAnnotations:[{...annotation,reviewStatus:'AUTO_APPROVED'}],
  }]},prediction),TypeError);
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
