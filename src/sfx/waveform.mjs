/**
 * Browser-only PCM16 WAV export and waveform data for a reviewed audition.
 * No transport state, project mutation, network calls or AI inference.
 */
const MAX_EXPORT_BYTES = 8_000_000;
export function waveformPeaks(channels, columns = 320) {
  if (!Array.isArray(channels) || channels.length < 1 || channels.length > 2 ||
      channels.some(c => !(c instanceof Float32Array)) ||
      !Number.isSafeInteger(columns) || columns < 8 || columns > 4096 ||
      channels[0].length < 1 || channels.some(c => c.length !== channels[0].length)) {
    throw new TypeError('Invalid waveform data');
  }
  const frames = channels[0].length;
  const peaks = new Float32Array(columns);
  for (let col = 0; col < columns; col++) {
    const begin = Math.floor((col * frames) / columns);
    const end = Math.max(begin + 1, Math.floor(((col + 1) * frames) / columns));
    let max = 0;
    for (let sample = begin; sample < Math.min(frames,end); sample++) {
      for (const channel of channels) {
        const value = channel[sample];
        if (!Number.isFinite(value)) throw new TypeError('Invalid audio sample');
        max = Math.max(max, Math.abs(value));
      }
    }
    peaks[col] = Math.min(1, max);
  }
  return peaks;
}

export function makeTrimmedPcm16Wav(audio, inSeconds = 0, outSeconds = audio?.duration) {
  const rate = audio?.sampleRate, channels = audio?.numberOfChannels;
  if (!Number.isInteger(rate) || rate < 16000 || rate > 96000 ||
      ![1,2].includes(channels) || typeof audio?.getChannelData !== 'function' ||
      !Number.isFinite(inSeconds) || !Number.isFinite(outSeconds) ||
      inSeconds < 0 || outSeconds > audio.duration + 0.0001 ||
      outSeconds <= inSeconds) {
    throw new TypeError('Invalid WAV trim boundaries');
  }
  const start = Math.floor(inSeconds * rate);
  const end = Math.min(audio.length, Math.ceil(outSeconds * rate));
  const frames = end - start, dataBytes = frames * channels * 2;
  if (frames <= 0 || 44 + dataBytes > MAX_EXPORT_BYTES) {
    throw new RangeError('WAV export outside safe size bounds');
  }
  const data = Array.from({length:channels},(_,c)=>audio.getChannelData(c));
  if (data.some(ch=>!(ch instanceof Float32Array)||ch.length < end)) {
    throw new TypeError('Invalid decoded audio samples');
  }
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const ascii = (at, str) => { for (let i = 0; i < str.length; i++) bytes[at+i]=str.charCodeAt(i); };
  ascii(0,'RIFF'); view.setUint32(4, bytes.length-8, true);
  ascii(8,'WAVE'); ascii(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true);
  view.setUint16(22,channels,true); view.setUint32(24,rate,true);
  view.setUint32(28,rate*channels*2,true);
  view.setUint16(32,channels*2,true); view.setUint16(34,16,true);
  ascii(36,'data'); view.setUint32(40,dataBytes,true);
  let offset = 44;
  for (let frame=start;frame<end;frame++) {
    for (const ch of data) {
      const sample = ch[frame];
      if (!Number.isFinite(sample)) throw new TypeError('Non-finite audio sample');
      const clamped = Math.max(-1,Math.min(1,sample));
      const signed = clamped < 0 ? Math.round(clamped*32768) : Math.round(clamped*32767);
      view.setInt16(offset,signed,true);offset+=2;
    }
  }
  return bytes;
}

export function trimBounds(inSeconds, outSeconds, duration) {
  if (![inSeconds,outSeconds,duration].every(Number.isFinite) || duration<=0)
    throw new TypeError('Invalid trim');
  const lower = Math.max(0,Math.min(duration,inSeconds));
  const upper = Math.max(0,Math.min(duration,outSeconds));
  if (upper-lower<0.01) throw new RangeError('Selection must be at least 10 milliseconds');
  return Object.freeze({ inSeconds:lower,outSeconds:upper });
}
