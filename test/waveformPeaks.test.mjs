import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWaveformPeaks, pixelToTimeMs, timeMsToPixel } from '../src/core/waveformPeaks.mjs';

const fakeBuffer = (channels, sampleRate = 4) => ({
  length: channels[0].length, numberOfChannels: channels.length,
  sampleRate, getChannelData: index => channels[index],
});

test('mono waveform peak extrema and RMS derive from real frames, including negatives', () => {
  const input = new Float32Array([-0.5, 0.75, -1, 1]);
  const waveform = buildWaveformPeaks(fakeBuffer([input]), { bucketCount: 2 });
  assert.equal(waveform.bucketCount, 2);
  assert.equal(waveform.frameCount, 4);
  assert.equal(waveform.durationMs, 1000);
  assert.deepEqual(waveform.channels[0].min, [-0.5, -1]);
  assert.deepEqual(waveform.channels[0].max, [0.75, 1]);
  assert.ok(Math.abs(waveform.channels[0].rms[0] - Math.sqrt(0.40625)) < 1e-12);
  assert.deepEqual([...input], [-0.5, 0.75, -1, 1], 'Source PCM unchanged');
  assert.equal(Object.isFrozen(waveform), true);
  assert.equal(Object.isFrozen(waveform.channels[0].min), true);
});

test('stereo channel peaks stay independent and include every sample in uneven buckets', () => {
  const source=fakeBuffer([
    new Float32Array([-1,-0.5,0,0.25,0.75]),
    new Float32Array([0.1,0.2,0.3,0.4,0.5]),
  ], 10);
  const wave=buildWaveformPeaks(source,{bucketCount:3});
  assert.equal(wave.durationMs,500);
  assert.equal(wave.channels.length,2);
  assert.deepEqual(wave.channels[0].min,[-1,-0.5,0.25]);
  assert.deepEqual(wave.channels[0].max,[-1,0,0.75]);
  assert.ok(Math.abs(wave.channels[1].max[2]-0.5)<1e-6);
});

test('short source emits no empty buckets', () => {
  const result=buildWaveformPeaks(fakeBuffer([new Float32Array([0.25,-0.25])]),{bucketCount:1024});
  assert.equal(result.bucketCount,2);
  assert.deepEqual(result.channels[0].min,[0.25,-0.25]);
});

test('invalid buffers, non-finite PCM and unbounded bucket requests are rejected', () => {
  assert.throws(()=>buildWaveformPeaks(null),/AudioBuffer-compatible/);
  assert.throws(()=>buildWaveformPeaks({length:0,numberOfChannels:0,sampleRate:4,getChannelData:()=>[]}),/AudioBuffer-compatible/);
  assert.throws(()=>buildWaveformPeaks(fakeBuffer([new Float32Array([0])]),{bucketCount:0}),/bucketCount/);
  assert.throws(()=>buildWaveformPeaks(fakeBuffer([new Float32Array([0])]),{bucketCount:8193}),/bucketCount/);
  assert.throws(()=>buildWaveformPeaks(fakeBuffer([new Float32Array([Number.NaN])])),/non-finite/);
});

test('waveform coordinate mapping uses source duration, clamps and roundtrips', () => {
  const viewport={widthPx:200,durationMs:10000};
  assert.equal(pixelToTimeMs(-25,viewport),0);
  assert.equal(pixelToTimeMs(50,viewport),2500);
  assert.equal(pixelToTimeMs(300,viewport),10000);
  assert.equal(timeMsToPixel(7500,viewport),150);
  assert.equal(timeMsToPixel(-1,viewport),0);
  assert.equal(timeMsToPixel(10001,viewport),200);
  assert.throws(()=>pixelToTimeMs(0,{widthPx:0,durationMs:1000}),/viewport/);
});
