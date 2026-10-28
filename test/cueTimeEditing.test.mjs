import test from 'node:test';
import assert from 'node:assert/strict';
import {formatCueTime,parseCueTime,clampCueFade} from '../src/core/cueTimeEditing.mjs';
import {BrowserAudioEngine} from '../src/core/browserAudio.mjs';

test('clock display is accurate to 1 ms, also for long cues',()=>{
  assert.equal(formatCueTime(0),'00:00.000');
  assert.equal(formatCueTime(65089),'01:05.089');
  assert.equal(formatCueTime(600000),'10:00.000');
  for(const ms of [0,12,999,1500,10050,65089,595999,600000])
    assert.equal(parseCueTime(formatCueTime(ms)),ms);
});
test('operator timecode accepts seconds, comma decimal and hours; refuses malformed times',()=>{
  assert.equal(parseCueTime('2.5'),2500);
  assert.equal(parseCueTime('01:02,350'),62350);
  assert.equal(parseCueTime('0:01:02.1'),62100);
  for(const entry of ['','1:99','-1','12:','1.1234','5:10:70','0:60:00','foo','601.0']){
    assert.throws(()=>parseCueTime(entry),/Expected|Invalid|under|beyond/);
  }
});
test('fade drag is clamped to 0–10 sec, per-clip rate, other fade, and loop state',()=>{
  assert.equal(clampCueFade({handle:'fadeIn',positionMs:1000,inMs:200,outMs:2200}),800);
  assert.equal(clampCueFade({handle:'fadeOut',positionMs:1700,inMs:200,outMs:2200}),500);
  assert.equal(clampCueFade({handle:'fadeIn',positionMs:2000,inMs:200,outMs:2200,otherFadeMs:500}),1500);
  assert.equal(clampCueFade({handle:'fadeOut',positionMs:2000,inMs:200,outMs:2200,loop:true}),0);
  assert.equal(clampCueFade({handle:'fadeIn',positionMs:1200,inMs:200,outMs:2200,rate:2}),500);
  assert.equal(clampCueFade({handle:'fadeIn',positionMs:999999,inMs:0,outMs:60000}),10000);
  assert.throws(()=>clampCueFade({handle:'out',positionMs:200,inMs:0,outMs:1000}),/Unknown/);
});
function fakeEngine(){
  const starts=[],stops=[],sources=[];
  const context={currentTime:10,state:'running',destination:{},
    async resume(){},
    async decodeAudioData(){return {duration:8,numberOfChannels:1}},
    createGain(){return {
      gain:{value:1,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}},
      connect(){},disconnect(){},
    }},
    createBufferSource(){
      const src={buffer:null,loop:false,onended:null,playbackRate:{value:1},
        connect(){},disconnect(){},
        start(at,offset){starts.push([at,offset])},
        stop(at){stops.push(at)},
        end(){this.onended?.()}};
      sources.push(src);return src;
    },
  };
  const engine=new BrowserAudioEngine({contextFactory:()=>context});
  const file={name:'orig.wav',size:50,arrayBuffer:async()=>new ArrayBuffer(50)};
  const cue=(id,playback={})=>({id,status:'DRAFT',
    actions:[{type:'PLAY',assetId:'asset-1'}],playback});
  return {engine,context,starts,stops,sources,file,cue};
}
test('running cues snapshot uses actual audio clock and onended; no fake VU',async()=>{
  const f=fakeEngine();await f.engine.loadFile(f.file,'asset-1');
  await f.engine.go(f.cue('one',{startAtMs:1000,endAtMs:5000}));
  assert.deepEqual(f.engine.getActiveCues().map(x=>x.cueId),['one']);
  assert.equal(f.engine.getActiveCues()[0].durationSeconds,4);
  assert.equal(f.engine.getActiveCues()[0].progress,0);
  f.context.currentTime=11.02;
  assert.ok(f.engine.getActiveCues()[0].elapsedSeconds>=1);
  assert.ok(f.engine.getActiveCues()[0].remainingSeconds>2);
  await f.engine.go(f.cue('two',{loop:true}));
  assert.deepEqual(f.engine.getActiveCues().map(x=>x.cueId),['one','two']);
  assert.equal(f.engine.getActiveCues()[1].remainingSeconds,null);
  assert.equal(f.engine.getActiveCues()[1].progress,null);
  assert.equal(f.engine.stopCue('one',500),true);
  assert.equal(f.engine.getActiveCues()[0].stopping,true);
  assert.ok(f.engine.getActiveCues()[0].remainingSeconds<=.5);
  assert.ok(Object.isFrozen(f.engine.getActiveCues()));
  f.sources[0].end();
  assert.deepEqual(f.engine.getActiveCues().map(x=>x.cueId),['two']);
  f.engine.stopAll();
  assert.equal(f.engine.getActiveCues().length,0);
});
test('a pending or prematurely stopped cue never appears as running audio',async()=>{
  const f=fakeEngine();await f.engine.loadFile(f.file,'asset-1');
  await f.engine.go(f.cue('one'));
  f.engine.stopCue('one');
  assert.deepEqual(f.engine.getActiveCues(),[]);
});
