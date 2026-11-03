export const DEFAULT_OPERATOR_PREFERENCES = Object.freeze({
  version: 1,
  outputDeviceId: '',
  masterVolume: 1,
  microphoneDeviceId: '',
  voiceLanguage: 'en',
  voiceMode: 'auto',
});

export function normalizeOperatorPreferences(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.freeze({
    version: 1,
    outputDeviceId: typeof input.outputDeviceId === 'string' && input.outputDeviceId.length <= 512
      ? input.outputDeviceId : '',
    masterVolume: typeof input.masterVolume === 'number' && Number.isFinite(input.masterVolume)
      ? Math.min(1, Math.max(0, input.masterVolume)) : DEFAULT_OPERATOR_PREFERENCES.masterVolume,
    microphoneDeviceId: typeof input.microphoneDeviceId === 'string' && input.microphoneDeviceId.length <= 512
      ? input.microphoneDeviceId : '',
    voiceLanguage: ['es', 'en', 'mixed'].includes(input.voiceLanguage)
      ? input.voiceLanguage : DEFAULT_OPERATOR_PREFERENCES.voiceLanguage,
    voiceMode: ['assist', 'auto'].includes(input.voiceMode)
      ? input.voiceMode : DEFAULT_OPERATOR_PREFERENCES.voiceMode,
  });
}

export function readOperatorPreferences(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    const raw = target?.getItem('runq.operator.preferences.v1');
    return normalizeOperatorPreferences(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_OPERATOR_PREFERENCES;
  }
}

export function saveOperatorPreferences(storage, value) {
  if (!storage || typeof storage.setItem !== 'function') {
    throw new Error('Local browser storage is unavailable.');
  }
  const preferences = normalizeOperatorPreferences(value);
  storage.setItem('runq.operator.preferences.v1', JSON.stringify(preferences));
  return preferences;
}
