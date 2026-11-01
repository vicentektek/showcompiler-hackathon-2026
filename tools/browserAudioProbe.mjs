/** Test-only output tap. Native decoding, clocks, nodes and onended stay intact. */
export function installNativeAudioProbe() {
  const connect = AudioNode.prototype.connect;
  const start = AudioBufferSourceNode.prototype.start;
  const stop = AudioBufferSourceNode.prototype.stop;
  const taps = new Map();
  let recording = false;
  window.__rqStarts = 0;
  window.__rqStops = 0;
  AudioBufferSourceNode.prototype.start = function (...args) {
    const result = start.apply(this, args);
    window.__rqStarts += 1;
    return result;
  };
  AudioBufferSourceNode.prototype.stop = function (...args) {
    const result = stop.apply(this, args);
    window.__rqStops += 1;
    return result;
  };
  AudioNode.prototype.connect = function (destination, ...args) {
    const result = connect.call(this, destination, ...args);
    if (destination === this.context.destination) {
      const context = this.context;
      if (!taps.has(context)) {
        // A silent side branch records the actual signal reaching the destination.
        const node = context.createScriptProcessor(1024, 2, 2);
        const tap = { node, chunks: [], frames: 0 };
        node.onaudioprocess = event => {
          if (!recording || tap.frames >= context.sampleRate * 15) return;
          tap.chunks.push([0, 1].map(c => Array.from(event.inputBuffer.getChannelData(c))));
          tap.frames += event.inputBuffer.length;
        };
        connect.call(node, destination);
        taps.set(context, tap);
      }
      connect.call(this, taps.get(context).node, args[0] ?? 0);
    }
    return result;
  };
  window.__rqAudioProbe = {
    begin() {
      for (const tap of taps.values()) { tap.chunks = []; tap.frames = 0; }
      recording = true;
    },
    end() {
      recording = false;
      return [...taps].map(([context, tap]) => ({
        sampleRate: context.sampleRate, state: context.state,
        channels: [0, 1].map(c => tap.chunks.flatMap(chunk => chunk[c])),
      }));
    },
  };
}

export function signalMetrics(capture, frequencies = []) {
  const { channels, sampleRate } = capture;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !channels?.[0]?.length ||
      channels.some(c => c.length !== channels[0].length || c.some(v => !Number.isFinite(v))))
    throw new Error('AUDIO_CAPTURE_INVALID');
  const rms = values => Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
  const mono = channels[0].map((_, i) => channels.reduce((s, c) => s + c[i], 0) / channels.length);
  const size = Math.round(sampleRate * 0.05);
  const windows = [];
  for (let i = 0; i + size <= mono.length; i += size) windows.push(rms(mono.slice(i, i + size)));
  const amplitudes = frequencies.map(hz => {
    let sin = 0, cos = 0;
    for (let i = 0; i < mono.length; i++) {
      sin += mono[i] * Math.sin(2 * Math.PI * hz * i / sampleRate);
      cos += mono[i] * Math.cos(2 * Math.PI * hz * i / sampleRate);
    }
    return 2 * Math.hypot(sin, cos) / mono.length;
  });
  return { frames: mono.length, sampleRate, seconds: mono.length / sampleRate,
    rms: rms(mono), peak: mono.reduce((m, v) => Math.max(m, Math.abs(v)), 0), windows, amplitudes };
}

export function captureWav({ channels, sampleRate }) {
  signalMetrics({ channels, sampleRate });
  const frames = channels[0].length, count = channels.length;
  const dataSize = frames * count * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF'); wav.writeUInt32LE(36 + dataSize, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(count, 22); wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * count * 2, 28); wav.writeUInt16LE(count * 2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < frames; i++) for (let c = 0; c < count; c++)
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[c][i])) * 32767), 44 + (i * count + c) * 2);
  return wav;
}
