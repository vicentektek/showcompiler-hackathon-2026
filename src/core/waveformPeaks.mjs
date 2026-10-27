/**
 * Audio-file waveform peaks for the RunQ editor (pure, no playback side effects).
 *
 * Accepts a decoded AudioBuffer-compatible value. Every source frame is visited
 * once; channels are kept separate, negative minima are never rectified, and
 * no PCM samples are written to or retained. The output is a lightweight,
 * read-only view model for a waveform renderer, NOT a processed audio asset.
 *
 * This synchronous reference algorithm is intended for short files/tests.
 * Production UI must run large decimation jobs off the interaction thread.
 */

function validBuffer(buffer) {
  if (!buffer || !Number.isSafeInteger(buffer.length) || buffer.length < 1 ||
      !Number.isInteger(buffer.numberOfChannels) ||
      buffer.numberOfChannels < 1 || buffer.numberOfChannels > 2 ||
      !Number.isFinite(buffer.sampleRate) || buffer.sampleRate <= 0 ||
      typeof buffer.getChannelData !== 'function') {
    throw new TypeError('Expected a decoded mono/stereo AudioBuffer-compatible source');
  }
  return buffer;
}

export function buildWaveformPeaks(audioBuffer, { bucketCount = 1024 } = {}) {
  const buffer = validBuffer(audioBuffer);
  if (!Number.isSafeInteger(bucketCount) || bucketCount < 1 || bucketCount > 8192) {
    throw new RangeError('bucketCount must be an integer from 1 to 8192');
  }

  const { length: frameCount, numberOfChannels, sampleRate } = buffer;
  const count = Math.min(bucketCount, frameCount);
  const channels = [];

  for (let channel = 0; channel < numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    if (!samples || samples.length !== frameCount) {
      throw new TypeError('AudioBuffer channel data length mismatch');
    }
    const min = new Array(count);
    const max = new Array(count);
    const rms = new Array(count);

    for (let bucket = 0; bucket < count; bucket++) {
      const from = Math.floor((bucket * frameCount) / count);
      const to = Math.floor(((bucket + 1) * frameCount) / count);
      let low = Infinity;
      let high = -Infinity;
      let sumSq = 0;

      for (let i = from; i < to; i++) {
        const value = samples[i];
        if (!Number.isFinite(value)) throw new TypeError('Audio contains a non-finite sample');
        if (value < low) low = value;
        if (value > high) high = value;
        sumSq += value * value;
      }
      min[bucket] = low;
      max[bucket] = high;
      rms[bucket] = Math.sqrt(sumSq / (to - from));
    }
    channels.push(Object.freeze({
      min: Object.freeze(min),
      max: Object.freeze(max),
      rms: Object.freeze(rms),
    }));
  }

  return Object.freeze({
    frameCount,
    sampleRate,
    durationMs: (frameCount / sampleRate) * 1000,
    bucketCount: count,
    channels: Object.freeze(channels),
  });
}

/**
 * Timeline helpers are total for a nonzero viewport, and clamp input so mouse
 * position can never create a negative time or a time after source duration.
 * Use normalized integer milliseconds at the persistence boundary.
 */
export function pixelToTimeMs(pixelX, { widthPx, durationMs }) {
  if (!Number.isFinite(pixelX) || !Number.isFinite(widthPx) || widthPx <= 0 ||
      !Number.isFinite(durationMs) || durationMs <= 0) {
    throw new TypeError('Invalid waveform viewport');
  }
  const ratio = Math.max(0, Math.min(1, pixelX / widthPx));
  return Math.round(durationMs * ratio);
}

export function timeMsToPixel(timeMs, { widthPx, durationMs }) {
  if (!Number.isFinite(timeMs) || !Number.isFinite(widthPx) || widthPx <= 0 ||
      !Number.isFinite(durationMs) || durationMs <= 0) {
    throw new TypeError('Invalid waveform viewport');
  }
  const ratio = Math.max(0, Math.min(1, timeMs / durationMs));
  return ratio * widthPx;
}
