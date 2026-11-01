import test from 'node:test';
import assert from 'node:assert/strict';
import { signalMetrics, captureWav } from '../tools/browserAudioProbe.mjs';

test('audio evidence measures silence, signal, clipping and recorded PCM, not playback flags', () => {
  const sampleRate = 16000;
  const silence = { sampleRate, channels: [Array(sampleRate).fill(0)] };
  assert.equal(signalMetrics(silence).rms, 0);
  const tone = { sampleRate, channels: [Array.from({ length: sampleRate },
    (_, i) => 0.25 * Math.sin(2 * Math.PI * 440 * i / sampleRate))] };
  const metrics = signalMetrics(tone);
  assert.ok(Math.abs(metrics.rms - Math.sqrt(0.5) * 0.25) < 1e-6);
  assert.equal(metrics.windows.length, 20);
  assert.equal(metrics.seconds, 1);
  const wav = captureWav(tone);
  assert.equal(wav.readUInt32LE(40), sampleRate * 2);
  assert.equal(wav.readUInt32LE(24), sampleRate);
  assert.equal(wav.readInt16LE(44 + 18), Math.round(tone.channels[0][9] * 32767));
  assert.throws(() => signalMetrics({ sampleRate, channels: [[]] }), /INVALID/);
  assert.throws(() => signalMetrics({ sampleRate, channels: [[NaN]] }), /INVALID/);
});
