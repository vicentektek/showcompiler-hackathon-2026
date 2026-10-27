import test from 'node:test';
import assert from 'node:assert/strict';
import { waveformVisibleRange,drawWaveform } from '../src/ui/v3/waveformCanvas.mjs';

test('waveform zoom and pan use real source milliseconds',()=>{
  assert.deepEqual(waveformVisibleRange(10000,2,0),{
    startMs:0,endMs:5000,durationMs:5000,
  });
  assert.deepEqual(waveformVisibleRange(10000,2,1),{
    startMs:5000,endMs:10000,durationMs:5000,
  });
  assert.deepEqual(waveformVisibleRange(10000,4,.5),{
    startMs:3750,endMs:6250,durationMs:2500,
  });
  assert.throws(()=>waveformVisibleRange(10000,9,0),RangeError);
  assert.throws(()=>waveformVisibleRange(10000,2,1.2),RangeError);
});
test('real stereo extrema draw independent signed PCM channels',()=>{
  const fills=[];
  const canvas={width:32,height:100,getContext:()=>({
    clearRect(){},set fillStyle(v){this.color=v;},
    fillRect(x,y,w,h){fills.push({x,y,w,h});},
  })};
  const peaks={durationMs:1000,bucketCount:4,channels:[
    {min:[-1,0,-.3,-.4],max:[.8,.6,0,.4]},
    {min:[-.5,-.2,0,-.1],max:[.5,.8,.1,.2]},
  ]};
  const copy=JSON.stringify(peaks);
  assert.deepEqual(drawWaveform(canvas,peaks,{zoom:2,pan:1}),{
    startMs:500,endMs:1000,durationMs:500,
  });
  assert.ok(fills.length>=60);
  assert.ok(fills.some(rect=>rect.y<20 && rect.h>20));
  assert.ok(fills.some(rect=>rect.y>50 && rect.h>1));
  assert.equal(JSON.stringify(peaks),copy);
});
