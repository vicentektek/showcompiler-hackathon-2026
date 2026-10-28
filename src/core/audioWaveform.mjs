/**
 * Read-only waveform preview derived from locally decoded PCM.
 * No audio is uploaded, persisted or sent to an AI service.
 * Peaks are display-only and must never be used for loudness/safety decisions.
 */
export function summarizeWaveform(buffer, columns = 512) {
  if (!Number.isSafeInteger(columns) || columns < 32 || columns > 1024) {
    throw new RangeError('Waveform resolution must be 32–1024 columns');
  }
  if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0 ||
      !Number.isInteger(buffer.numberOfChannels) || buffer.numberOfChannels < 1 ||
      buffer.numberOfChannels > 2 || typeof buffer.getChannelData !== 'function') return null;
  const channels = [];
  try {
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      if (!data || !Number.isSafeInteger(data.length) || data.length <= 0) return null;
      channels.push(data);
    }
  } catch { return null; }
  const count = Math.min(...channels.map(channel => channel.length));
  const peaks = [];
  for (let column = 0; column < columns; column++) {
    const start = Math.floor(column * count / columns);
    const end = Math.max(start + 1, Math.floor((column + 1) * count / columns));
    let peak = 0;
    for (const data of channels) {
      for (let i = start; i < end && i < count; i++) {
        const sample = Math.abs(data[i]);
        if (Number.isFinite(sample) && sample > peak) peak = sample;
      }
    }
    peaks.push(Math.min(1, peak));
  }
  return Object.freeze({
    durationMs: Math.round(buffer.duration * 1000),
    channels: buffer.numberOfChannels,
    peaks: Object.freeze(peaks),
  });
}
