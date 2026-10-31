import test from 'node:test';
import assert from 'node:assert/strict';
import { BROWSER_AUDIO_CAPABILITIES, createBrowserAudioBackend, validateAudioBackend } from '../src/core/audioBackend.mjs';

test('backend advertises truthfully unsupported native features', () => {
  assert.equal(BROWSER_AUDIO_CAPABILITIES.realAudio, true);
  assert.equal(BROWSER_AUDIO_CAPABILITIES.hasMultichannelRouting, false);
  assert.equal(BROWSER_AUDIO_CAPABILITIES.supportsAsio, false);
  assert.equal(BROWSER_AUDIO_CAPABILITIES.hasIndependentPreviewBus, false);
  assert.equal(BROWSER_AUDIO_CAPABILITIES.hasSameOutputAudition, true);
  assert.equal(BROWSER_AUDIO_CAPABILITIES.professionallyCertified, false);
  assert.ok(Object.isFrozen(BROWSER_AUDIO_CAPABILITIES));
});

test('factory exposes only application-facing transport methods', () => {
  const backend = createBrowserAudioBackend();
  assert.strictEqual(validateAudioBackend(backend), backend);
  assert.ok(Object.isFrozen(backend));
  assert.equal(backend.context, undefined);
  assert.equal(backend.pending, undefined);
  assert.equal(backend.capabilities.id, 'browser-webaudio');
  assert.deepEqual(backend.getStatus(), {
    activeCueCount: 0, pendingGoCount: 0, auditionActive: false, auditionPending: false,
    audio: {
      contextState: 'not-created', selectedOutputDeviceId: '', actualOutputDeviceId: '',
      outputSelectionSupported: false, masterVolume: 1, activeCueCount: 0,
      pendingGoCount: 0, auditionActive: false, outputError: null,
    },
  });
});

test('invalid or incomplete future backend fails fast before UI usage', () => {
  assert.throws(() => validateAudioBackend(null), TypeError);
  assert.throws(() => validateAudioBackend({ capabilities: { id: 'native-wasapi' } }), /missing method/);
});

test('backend facade passes through manual GO, STOP and panic', async () => {
  const events = [];
  const ctx = {
    currentTime: 4, state: 'running', destination: {},
    decodeAudioData: async () => ({ duration: 2, numberOfChannels: 2 }),
    resume: async () => {},
    createGain: () => ({
      gain: { value: 1, cancelScheduledValues: () => {}, setValueAtTime(value) { this.value = value; }, linearRampToValueAtTime: () => {} },
      connect: () => {}, disconnect: () => {},
    }),
    createBufferSource: () => ({
      connect: () => {}, disconnect: () => {},
      start: () => events.push('go'),
      stop: () => events.push('stop'),
    }),
  };
  const backend = createBrowserAudioBackend({ contextFactory: () => ctx });
  await backend.loadFile({ name: 'cue.wav', size: 16, arrayBuffer: async () => new ArrayBuffer(16) }, 'asset-1');
  const cue = { id: 'cue-1', status: 'DRAFT', actions: [{ type: 'PLAY', assetId: 'asset-1' }] };
  await backend.go(cue);
  assert.deepEqual(backend.getStatus(), {
    activeCueCount: 1, pendingGoCount: 0, auditionActive: false, auditionPending: false,
    audio: {
      contextState: 'running', selectedOutputDeviceId: '', actualOutputDeviceId: '',
      outputSelectionSupported: false, masterVolume: 1, activeCueCount: 1,
      pendingGoCount: 0, auditionActive: false, outputError: null,
    },
  });
  assert.equal(backend.stopCue('cue-1'), true);
  backend.stopAll();
  assert.deepEqual(events, ['go', 'stop']);
  assert.equal(backend.getStatus().activeCueCount, 0);
  backend.reset();
  assert.equal(backend.hasAsset('asset-1'), false);
});
