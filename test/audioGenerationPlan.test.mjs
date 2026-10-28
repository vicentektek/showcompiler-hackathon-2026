import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareAudioGenerationPlan,authorizeAudioGenerationPlan,recordGeneratedWav,
} from '../src/core/audioGenerationPlan.mjs';

test('sound generation remains a preparation-only plan requiring one explicit authorization',()=>{
  const plan=prepareAudioGenerationPlan({
    sourceLineId:'L12',kind:'SFX',prompt:'A short distant thunder crack',
    modelCandidate:'stabilityai/stable-audio-3-small-sfx',durationSeconds:4,
  });
  assert.equal(plan.status,'AWAITING_OPERATOR_AUTHORIZATION');
  assert.equal(plan.phase,'PREPARATION_ONLY');
  assert.equal(plan.automaticSubmission,false);
  assert.equal(Object.hasOwn(plan,'action'),false);
  assert.equal(Object.hasOwn(plan,'assetId'),false);
  assert.throws(()=>authorizeAudioGenerationPlan(plan,{confirmed:false,authorizationId:'auth-1'}));
  const authorized=authorizeAudioGenerationPlan(plan,{confirmed:true,authorizationId:'auth-1'});
  assert.equal(authorized.status,'AUTHORIZED_FOR_ONE_GENERATION');
  assert.equal(plan.status,'AWAITING_OPERATOR_AUTHORIZATION');
  assert.throws(()=>authorizeAudioGenerationPlan(authorized,{confirmed:true,authorizationId:'auth-2'}));
});

test('voiceover plan preserves editable text, voice and language before WAV import',()=>{
  const draft=prepareAudioGenerationPlan({
    sourceLineId:'L7',kind:'VOICEOVER',text:'Se cierran las puertas.',
    voice:'operator-selected-es-voice',language:'es-ES',
    modelCandidate:'ResembleAI/Chatterbox-Multilingual-es-es',
  });
  assert.deepEqual(draft.voiceover,{
    text:'Se cierran las puertas.',voice:'operator-selected-es-voice',language:'es-ES',
  });
  assert.throws(()=>recordGeneratedWav(draft,{fileName:'voice.wav',sha256:'a'.repeat(64),
    durationSeconds:2,sampleRateHz:48000,channels:1}));
  const authorized=authorizeAudioGenerationPlan(draft,{confirmed:true,authorizationId:'auth-voice'});
  const completed=recordGeneratedWav(authorized,{fileName:'voice.wav',sha256:'a'.repeat(64),
    durationSeconds:2,sampleRateHz:48000,channels:1});
  assert.equal(completed.status,'AWAITING_OPERATOR_IMPORT');
  assert.equal(completed.generatedWav.fileName,'voice.wav');
  assert.equal(Object.hasOwn(completed,'assetId'),false);
  assert.equal(Object.hasOwn(completed,'go'),false);
});

test('generation plans reject executable transport, remote URLs and unreviewed model IDs',()=>{
  assert.throws(()=>prepareAudioGenerationPlan({sourceLineId:'L1',kind:'PLAY',prompt:'x',
    modelCandidate:'stabilityai/stable-audio-3-small-sfx'}));
  assert.throws(()=>prepareAudioGenerationPlan({sourceLineId:'L1',kind:'SFX',prompt:'https://example.test/a.wav',
    modelCandidate:'stabilityai/stable-audio-3-small-sfx'}));
  assert.throws(()=>prepareAudioGenerationPlan({sourceLineId:'L1',kind:'SFX',prompt:'x',
    modelCandidate:'unknown/model'}));
});
