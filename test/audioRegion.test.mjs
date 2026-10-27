import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAudioRegion, moveAudioRegionEdge, regionToSourceSlice } from '../src/core/audioRegion.mjs';

const source={durationMs:60000};

test('default region spans the real source and is immutable',()=>{
  const region=normalizeAudioRegion({},source);
  assert.deepEqual(region,{
    startMs:0,endMs:60000,fadeInMs:0,fadeOutMs:0,loopRange:null,
  });
  assert.equal(Object.isFrozen(region),true);
  assert.deepEqual(regionToSourceSlice(region,source),{offsetSeconds:0,durationSeconds:60});
});

test('trim, fade and loop region use source-relative times and preserve original input',()=>{
  const input={startMs:14000,endMs:40000,fadeInMs:2000,fadeOutMs:3000,
    loopRange:{startMs:16000,endMs:38000}};
  const saved=structuredClone(input);
  const region=normalizeAudioRegion(input,source);
  assert.deepEqual(input,saved);
  assert.deepEqual(regionToSourceSlice(region,source),{offsetSeconds:14,durationSeconds:26});
  assert.equal(Object.isFrozen(region.loopRange),true);
});

test('dragging region boundaries clamps without crossing fades or loop',()=>{
  const region=normalizeAudioRegion({
    startMs:1000,endMs:9000,fadeInMs:1500,fadeOutMs:2500,
    loopRange:{startMs:2000,endMs:8000},
  },{durationMs:10000});
  const trimmed=moveAudioRegionEdge(region,'start',8700,{durationMs:10000});
  assert.equal(trimmed.startMs,2000);
  assert.equal(trimmed.loopRange.startMs,2000);
  const extended=moveAudioRegionEdge(region,'end',3000,{durationMs:10000});
  assert.equal(extended.endMs,8000);
  assert.equal(region.startMs,1000,'Drag does not mutate source region');
});

test('drag respects fade-length guard even without a loop',()=>{
  const source={durationMs:1000};
  const region=normalizeAudioRegion({startMs:100,endMs:900,fadeInMs:200,fadeOutMs:200},source);
  assert.equal(moveAudioRegionEdge(region,'start',850,source).startMs,500);
  assert.equal(moveAudioRegionEdge(region,'end',150,source).endMs,500);
  assert.equal(moveAudioRegionEdge(region,'end',5000,source).endMs,1000);
});

test('rejects invalid region coordinates, fade collisions and unknown fields',()=>{
  assert.throws(()=>normalizeAudioRegion({},{}),/durationMs/);
  assert.throws(()=>normalizeAudioRegion({}, {durationMs:0}),/positive/);
  assert.throws(()=>normalizeAudioRegion({startMs:500,endMs:500},{durationMs:1000}),/Region/);
  assert.throws(()=>normalizeAudioRegion({startMs:200,endMs:1200},{durationMs:1000}),/Region/);
  assert.throws(()=>normalizeAudioRegion({startMs:100,endMs:300,fadeInMs:120,fadeOutMs:100},{durationMs:1000}),/fades/);
  assert.throws(()=>normalizeAudioRegion({loopRange:{startMs:300,endMs:900},startMs:400},{durationMs:1000}),/Loop/);
  assert.throws(()=>normalizeAudioRegion({endMs:250,deleteAsset:true},{durationMs:1000}),/fields/);
  assert.throws(()=>moveAudioRegionEdge(normalizeAudioRegion({},source),'volume',100,source),/edge/);
});
