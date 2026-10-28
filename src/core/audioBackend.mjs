/**
 * Audio backend boundary — new hackathon implementation.
 * The browser adapter is a temporary engine. No WASAPI/ASIO backend exists yet.
 *
 * Future native backend must implement the same user-facing semantics while
 * evolving the transport toward playId/trackId, device routing and a sample clock.
 */
import { BrowserAudioEngine } from './browserAudio.mjs';

export const BROWSER_AUDIO_CAPABILITIES = Object.freeze({
  id: 'browser-webaudio',
  label: 'Web Audio · prueba local',
  realAudio: true,
  manualGo: true,
  stopCue: true,
  fadeCue: true,
  panic: true,
  hasPhysicalDeviceSelection: false,
  hasIndependentPreviewBus: false,
  hasMultichannelRouting: false,
  supportsAsio: false,
  hasPersistentAudioFiles: false,
  hasSameOutputAudition: true,
  professionallyCertified: false,
});

const REQUIRED_METHODS = Object.freeze([
  'loadFile', 'go', 'stopCue', 'stopAll', 'reset', 'dispose', 'hasAsset',
  'auditionAsset', 'stopAudition', 'isAuditioning',
  'isPlaying', 'isStopping', 'getStatus', 'getWaveform',
]);

export function validateAudioBackend(backend) {
  if (!backend || typeof backend !== 'object' ||
      !backend.capabilities || typeof backend.capabilities.id !== 'string') {
    throw new TypeError('Audio backend must declare capabilities');
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof backend[method] !== 'function') {
      throw new TypeError('Audio backend is missing method: ' + method);
    }
  }
  return backend;
}

/** No raw AudioContext/voices exposed to frontend. */
export function createBrowserAudioBackend(options = {}) {
  const engine = new BrowserAudioEngine(options);
  return validateAudioBackend(Object.freeze({
    capabilities: BROWSER_AUDIO_CAPABILITIES,
    loadFile: (file, assetId) => engine.loadFile(file, assetId),
    go: cue => engine.go(cue),
    auditionAsset: assetId => engine.auditionAsset(assetId),
    stopAudition: () => engine.stopAudition(),
    isAuditioning: () => engine.isAuditioning(),
    stopCue: (cueId, fadeMs = 0) => engine.stopCue(cueId, fadeMs),
    stopAll: () => engine.stopAll(),
    reset: () => engine.reset(),
    dispose: () => engine.dispose(),
    hasAsset: assetId => engine.hasAsset(assetId),
    getWaveform: assetId => engine.getWaveform(assetId),
    isPlaying: cueId => engine.isPlaying(cueId),
    isStopping: cueId => engine.isStopping(cueId),
    getStatus: () => Object.freeze({
      activeCueCount: engine.activeCueCount(),
      pendingGoCount: engine.pending.size,
      auditionActive: engine.auditionVoice !== null,
      auditionPending: engine.auditionPending,
    }),
  }));
}
