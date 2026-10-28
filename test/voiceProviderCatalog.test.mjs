import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VOICE_PROVIDERS, DEFAULT_VOICE_PROVIDER, prepareVoiceGenerationPlan,
  estimateHintUsd, BASETEN_GPU_MINUTE_USD,
} from '../src/core/voiceProviderCatalog.mjs';

test('catalog exposes reviewed providers with licenses and no network behaviour', () => {
  const ids = Object.keys(VOICE_PROVIDERS).sort();
  assert.deepEqual(ids, ['CHATTERBOX_ES', 'ORPHEUS', 'QWEN3_TTS']);
  assert.equal(VOICE_PROVIDERS.QWEN3_TTS.license, 'Apache-2.0');
  assert.equal(VOICE_PROVIDERS.CHATTERBOX_ES.license, 'MIT');
  assert.equal(VOICE_PROVIDERS.QWEN3_TTS.primary, true);
  assert.equal(VOICE_PROVIDERS.ORPHEUS.primary, false);
  assert.equal(DEFAULT_VOICE_PROVIDER, 'QWEN3_TTS');
});

test('plan preparation requires registered model, language and preset voice', () => {
  const plan = prepareVoiceGenerationPlan({
    provider: 'QWEN3_TTS',
    modelCandidate: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
    language: 'es', text: 'Bienvenidos. Suena la campana.', voicePreset: 'Aiden',
  });
  assert.equal(plan.phase, 'PREPARATION_ONLY');
  assert.equal(plan.automaticSubmission, false);
  assert.equal(plan.voiceover.license, 'Apache-2.0');
  assert.equal(plan.voiceover.cloningSupported, false);
  assert.throws(() => prepareVoiceGenerationPlan({ provider: 'NOPE' }), /Unknown voiceover provider/);
  assert.throws(() => prepareVoiceGenerationPlan({
    provider: 'QWEN3_TTS', modelCandidate: 'unknown-model',
    language: 'es', text: 'hola', voicePreset: 'Aiden',
  }), /not registered/);
  assert.throws(() => prepareVoiceGenerationPlan({
    provider: 'QWEN3_TTS', modelCandidate: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
    language: 'ca', text: 'hola', voicePreset: 'Aiden',
  }), /Language is not supported/);
  assert.throws(() => prepareVoiceGenerationPlan({
    provider: 'QWEN3_TTS', modelCandidate: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
    language: 'es', text: '', voicePreset: 'Aiden',
  }), /text/);
  assert.throws(() => prepareVoiceGenerationPlan({
    provider: 'QWEN3_TTS', modelCandidate: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
    language: 'es', text: 'hola', voicePreset: ';rm -rf',
  }), /preset/);
  assert.throws(() => prepareVoiceGenerationPlan({
    provider: 'QWEN3_TTS', modelCandidate: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
    language: 'es', text: 'hola', voicePreset: 'Aiden', referenceAudio: { audioBytes: [] },
  }), /reference audio/);
});

test('cost hints use the Baseten per-minute reference and stay conservative', () => {
  assert.equal(BASETEN_GPU_MINUTE_USD.L4, 0.01414);
  assert.equal(estimateHintUsd({ gpu: 'L4', startSeconds: 60 }), 0.01414);
  assert.equal(estimateHintUsd({ gpu: 'H100MIG', startSeconds: 120 }), 0.125);
  assert.throws(() => estimateHintUsd({ gpu: 'NOPE' }), /Unknown GPU tier/);
});
