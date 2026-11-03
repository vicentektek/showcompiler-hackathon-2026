import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_OPERATOR_PREFERENCES,
  normalizeOperatorPreferences,
  readOperatorPreferences,
  saveOperatorPreferences,
} from '../src/core/operatorPreferences.mjs';

function storage(initial = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
  };
}

test('operator preferences validate local device and rehearsal choices', () => {
  const actual = normalizeOperatorPreferences({
    outputDeviceId: 'speaker-1', masterVolume: 0.4,
    microphoneDeviceId: 'mic-1', voiceLanguage: 'mixed', voiceMode: 'assist',
  });
  assert.deepEqual(actual, {
    version: 1, outputDeviceId: 'speaker-1', masterVolume: 0.4,
    microphoneDeviceId: 'mic-1', voiceLanguage: 'mixed', voiceMode: 'assist',
  });
});

test('invalid preferences safely normalize without accepting unknown modes or gain', () => {
  const actual = normalizeOperatorPreferences({
    outputDeviceId: 7, masterVolume: 4, microphoneDeviceId: 'x'.repeat(513),
    voiceLanguage: 'fr', voiceMode: 'armed',
  });
  assert.equal(actual.outputDeviceId, '');
  assert.equal(actual.masterVolume, 1);
  assert.equal(actual.microphoneDeviceId, '');
  assert.equal(actual.voiceLanguage, 'en');
  assert.equal(actual.voiceMode, 'auto');
  assert.equal(normalizeOperatorPreferences({ masterVolume: -1 }).masterVolume, 0);
});

test('English is the default spoken language for new rehearsal preferences', () => {
  assert.equal(DEFAULT_OPERATOR_PREFERENCES.voiceLanguage, 'en');
  assert.equal(normalizeOperatorPreferences({}).voiceLanguage, 'en');
  assert.equal(readOperatorPreferences(null).voiceLanguage, 'en');
});

test('operator preferences persist only through the supplied local storage', () => {
  const local = storage();
  const saved = saveOperatorPreferences(local, { masterVolume: 0.7, microphoneDeviceId: 'mic-1' });
  assert.equal(saved.masterVolume, 0.7);
  assert.equal(readOperatorPreferences(local).microphoneDeviceId, 'mic-1');
  assert.equal(readOperatorPreferences(null).masterVolume, DEFAULT_OPERATOR_PREFERENCES.masterVolume);
  assert.throws(() => saveOperatorPreferences(null, {}), /storage is unavailable/);
});
