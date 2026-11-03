/**
 * Offline extensible voiceover provider catalog for the future Baseten TTS stage.
 * Preparation-only: this module never performs network calls, never generates
 * audio and never touches GO/STOP transport. Voice cloning is intentionally
 * unsupported until an operator documents a consented reference voice.
 */
const SAFE_TEXT = /^[\s\S]{1,2000}$/;
const LANGUAGE_CODES = new Set(['es', 'en', 'es-es', 'es-mx', 'es-419']);
const SAFE_VOICE_PAT = /^[A-Za-z0-9][\w .,-]{0,99}$/;

export const VOICE_PROVIDERS = Object.freeze({
  QWEN3_TTS: Object.freeze({
    id: 'QWEN3_TTS',
    hostTargets: Object.freeze(['BASETEN', 'MODAL']),
    license: 'Apache-2.0',
    models: Object.freeze({
      PREDSET_SMALL: Object.freeze({
        modelId: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
        languages: Object.freeze(['en', 'es', 'zh', 'ja', 'ko', 'de', 'fr', 'ru', 'pt', 'it']),
        minGpu: 'L4',
        notes: 'Preset voices and VoiceDesign; cloning exists upstream but RunQ plans keep it OFF.',
      }),
    }),
    primary: true,
  }),
  CHATTERBOX_ES: Object.freeze({
    id: 'CHATTERBOX_ES',
    hostTargets: Object.freeze(['BASETEN', 'MODAL']),
    license: 'MIT',
    models: Object.freeze({
      ES_SPAIN: Object.freeze({
        modelId: 'ResembleAI/Chatterbox-Multilingual-es-es',
        languages: Object.freeze(['es-es', 'es']),
        minGpu: 'L4',
        notes: 'Dedicated es-ES finetune; generation style needs a reference sample, so preset voices are NOT supported.',
      }),
    }),
    primary: false,
  }),
  ORPHEUS: Object.freeze({
    id: 'ORPHEUS',
    hostTargets: Object.freeze(['BASETEN']),
    license: 'unknown',
    models: Object.freeze({
      V1: Object.freeze({
        modelId: 'canopylabs/orpheus-v1-baseten',
        languages: Object.freeze(['en', 'es', 'fr', 'de', 'hi', 'it', 'ja', 'ko', 'pt', 'ru']),
        minGpu: 'H100MIG',
        notes: 'Baseten native TRT-LLM truss with preset voices and inline delivery tags; license not confirmed.',
      }),
    }),
    primary: false,
  }),
});

export const DEFAULT_VOICE_PROVIDER = 'QWEN3_TTS';

export function voiceProviderCatalogSnapshot() {
  return JSON.parse(JSON.stringify(VOICE_PROVIDERS));
}

/**
 * Validates one voiceover preparation against one provider entry. Pure check;
 * callers must never pass model output straight into transport or import.
 */
export function prepareVoiceGenerationPlan(input = {}) {
  const provider = VOICE_PROVIDERS[input.provider];
  if (!provider) throw new TypeError('Unknown voiceover provider');
  const entry = Object.values(provider.models)
    .find(model => input.modelCandidate === model.modelId);
  if (!entry) throw new TypeError('Model candidate is not registered for this provider');
  if (!entry.languages.includes(input.language)) {
    throw new TypeError('Language is not supported by the selected model');
  }
  if (!SAFE_TEXT.test(input.text)) throw new TypeError('Voiceover text is empty or too long');
  if (!SAFE_VOICE_PAT.test(input.voicePreset ?? '')) {
    throw new TypeError('Voice preset is missing or unsafe');
  }
  if ({ ...(input.referenceAudio ?? {}) }.audioBytes !== undefined) {
    throw new TypeError('Voice cloning with reference audio is not supported yet');
  }
  return Object.freeze({
    contractVersion: 1,
    phase: 'PREPARATION_ONLY',
    status: 'AWAITING_OPERATOR_AUTHORIZATION',
    automaticSubmission: false,
    provider: provider.id,
    hostTarget: null,
    voiceover: Object.freeze({
      text: input.text, voicePreset: input.voicePreset,
      language: input.language, modelId: entry.modelId,
      license: provider.license, cloningSupported: false,
    }),
  });
}

/**
 * Baseten GPU-minute cost reference used for operator cost hints only;
 * per-request inference still requires explicit authorization elsewhere.
 */
export const BASETEN_GPU_MINUTE_USD = Object.freeze({
  T4: 0.01052, L4: 0.01414, A10G: 0.02012,
  H100MIG: 0.0625, H100: 0.10833,
});

export function estimateHintUsd({ gpu = 'L4', startSeconds = 60 } = {}) {
  const rate = BASETEN_GPU_MINUTE_USD[gpu];
  if (!rate) throw new TypeError('Unknown GPU tier');
  const totalUsd = (startSeconds / 60) * rate;
  return Number(totalUsd.toFixed(5));
}
