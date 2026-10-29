import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSpeechText,editDistance,scoreTranscription,scoreVoiceCueDecisions}
 from '../src/qa/speechEvaluation.mjs';

test('speech normalization ignores punctuation/case but preserves words',()=>{
  assert.equal(normalizeSpeechText('¡Hola,  MUNDO!...  ¿Qué tal?'),'hola mundo qué tal');
  assert.equal(normalizeSpeechText("I said 'GO'!"),'i said go');
  assert.equal(normalizeSpeechText('  '),'');
});

test('WER is zero only for equal normalized spoken sequences',()=>{
  const r=scoreTranscription({language:'es',reference:'¡Hola mundo!',hypothesis:'hola, MUNDO.'});
  assert.equal(r.wer,0);
  assert.equal(r.cer,0);
  assert.equal(r.exact,true);
});

test('one substituted word in three is exactly one third WER',()=>{
  const r=scoreTranscription({reference:'uno dos tres',hypothesis:'uno cinco tres'});
  assert.equal(r.wordErrors,1);
  assert.equal(r.wer,1/3);
});

test('extra or missing words count as errors and WER can exceed 100 percent',()=>{
  const r=scoreTranscription({reference:'go',hypothesis:'go go go'});
  assert.equal(r.wer,2);
  assert.equal(scoreTranscription({reference:'uno dos',hypothesis:'uno'}).wer,0.5);
});

test('Spanish accents can be evaluated with separate accent-sensitive and insensitive variants',()=>{
  const exact=scoreTranscription({reference:'canción',hypothesis:'cancion'});
  assert.ok(exact.wer>0);
  assert.ok(exact.cer>0);
  const relaxed=scoreTranscription({reference:'canción',hypothesis:'cancion',stripDiacritics:true});
  assert.equal(relaxed.wer,0);
  assert.equal(relaxed.cer,0);
});

test('empty reference is NOT misreported as perfect ASR accuracy',()=>{
  const r=scoreTranscription({reference:'',hypothesis:'go'});
  assert.equal(r.wer,null);
  assert.equal(r.cer,null);
  assert.equal(r.exact,false);
  const empty=scoreTranscription({reference:'',hypothesis:''});
  assert.equal(empty.wer,null);
  assert.equal(empty.cer,null);
});

test('invalid language, oversized text and invalid token arrays fail closed',()=>{
  assert.throws(()=>scoreTranscription({language:'fr',reference:'oui',hypothesis:'oui'}));
  assert.throws(()=>scoreTranscription({reference:'a'.repeat(2049),hypothesis:'a'}));
  assert.throws(()=>normalizeSpeechText(null));
  assert.throws(()=>editDistance('not-array',[]));
});

test('perfect rehearsal cue decisions have 100 percent precision and recall',()=>{
  const e=[
    {id:'event_1',armed:true,expectedCueId:'cue-1',actualGo:true,actualCueId:'cue-1'},
    {id:'event_2',armed:true,expectedCueId:'cue-2',actualGo:true,actualCueId:'cue-2'},
    {id:'event_3',armed:false,expectedCueId:null,actualGo:false,actualCueId:null},
  ];
  const r=scoreVoiceCueDecisions(e);
  assert.equal(r.correct,2);
  assert.equal(r.falseGo,0);
  assert.equal(r.precision,1);
  assert.equal(r.recall,1);
  assert.equal(r.safetyPassed,true);
});

test('false GO on an ambiguous or disarmed phrase fails rehearsal safety gate',()=>{
  const e=[
    {id:'event_1',armed:false,expectedCueId:null,actualGo:true,actualCueId:'cue-1'},
    {id:'event_2',armed:true,expectedCueId:'cue-2',actualGo:false,actualCueId:null},
  ];
  const r=scoreVoiceCueDecisions(e);
  assert.equal(r.falseGo,1);
  assert.equal(r.missed,1);
  assert.equal(r.safetyPassed,false);
});

test('wrong-target or duplicate GO is visible and never counted as a correct cue',()=>{
  const e=[{id:'event_wrong',armed:true,expectedCueId:'cue-2',actualGo:true,
    actualCueId:'cue-3',duplicateGo:true}];
  const r=scoreVoiceCueDecisions(e);
  assert.equal(r.correct,0);
  assert.equal(r.falseGo,1);
  assert.equal(r.duplicateGo,1);
  assert.equal(r.safetyPassed,false);
});

test('duplicate event IDs or invalid input are rejected',()=>{
  const x={id:'event_dup',armed:true,expectedCueId:null,actualGo:false,actualCueId:null};
  assert.throws(()=>scoreVoiceCueDecisions([x,x]));
  assert.throws(()=>scoreVoiceCueDecisions([null]));
  assert.throws(()=>scoreVoiceCueDecisions('bad'));
});
