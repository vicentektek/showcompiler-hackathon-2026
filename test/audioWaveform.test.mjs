import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeWaveform } from '../src/core/audioWaveform.mjs';

test('extracts actual mono PCM peaks into bounded immutable display columns',()=>{
  const channel=new Float32Array([0,.25,-.5,0,.9,-.1,0,0]);
  const summary=summarizeWaveform({
    duration:2,numberOfChannels:1,getChannelData:()=>channel,
  },32);
  assert.equal(summary.durationMs,2000);
  assert.equal(summary.channels,1);
  assert.equal(summary.peaks.length,32);
  assert.ok(summary.peaks.some(value=>Math.abs(value-.9)<.0001));
  assert.ok(summary.peaks.some(value=>Math.abs(value-.5)<.0001));
  assert.ok(Object.isFrozen(summary.peaks));
  assert.ok(Object.isFrozen(summary));
});
test('stereo waveform represents peaks from both channels without leaking PCM',()=>{
  const left=new Float32Array([0,.1,0,0]);
  const right=new Float32Array([0,0,-.8,0]);
  const summary=summarizeWaveform({
    duration:1,numberOfChannels:2,getChannelData:index=>index?right:left,
  },32);
  assert.ok(summary.peaks.some(value=>Math.abs(value-.8)<.0001));
  assert.deepEqual(Object.keys(summary).sort(),['channels','durationMs','peaks']);
});
test('unavailable PCM and invalid resolutions fail closed without generated peaks',()=>{
  assert.equal(summarizeWaveform({duration:2,numberOfChannels:1}),null);
  assert.equal(summarizeWaveform({duration:2,numberOfChannels:1,getChannelData:()=>{throw Error('unavailable');}}),null);
  assert.throws(()=>summarizeWaveform({},0),RangeError);
  assert.throws(()=>summarizeWaveform({},2048),RangeError);
});
