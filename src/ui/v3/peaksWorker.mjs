/**
 * Dedicated offline waveform decimation worker. Receives decoded Float32 PCM
 * arrays directly from this browser; no network or provider access.
 */
import { buildWaveformPeaks } from '../../core/waveformPeaks.mjs';
self.onmessage = event => {
  const { requestId, channels, sampleRate } = event.data ?? {};
  try {
    if (!Number.isSafeInteger(requestId) || !Array.isArray(channels) ||
        channels.length<1 || channels.length>2 ||
        channels.some(c=>!(c instanceof Float32Array)) ||
        channels.some(c=>c.length!==channels[0].length)) {
      throw new TypeError('Invalid waveform worker payload');
    }
    const peaks=buildWaveformPeaks({
      length:channels[0].length,
      numberOfChannels:channels.length,
      sampleRate,
      getChannelData:channel=>channels[channel],
    },{bucketCount:1200});
    self.postMessage({requestId,peaks});
  } catch {
    self.postMessage({requestId,error:'UNSUPPORTED_WAVEFORM'});
  }
};
