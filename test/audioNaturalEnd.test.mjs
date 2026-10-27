import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserAudioEngine } from '../src/core/browserAudio.mjs';

function setup() {
  const ended=[], sources=[];
  const context={
    currentTime:1,state:'running',destination:{},
    resume:async()=>{},decodeAudioData:async()=>({duration:2,numberOfChannels:2}),
    createGain:()=>({gain:{value:1,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(){}},connect(){},disconnect(){}}),
    createBufferSource:()=>{
      const s={connect(){},disconnect(){},start(){},stop(){},onended:null,end(){this.onended?.();}};
      sources.push(s);return s;
    },
  };
  const engine=new BrowserAudioEngine({contextFactory:()=>context,onCueNaturalEnd:id=>ended.push(id)});
  const file={name:'test.wav',size:100,arrayBuffer:async()=>new ArrayBuffer(100)};
  const cue=(id,actionCount=1)=>({id,status:'DRAFT',actions:Array.from({length:actionCount},()=>({type:'PLAY',assetId:'asset'}))});
  return {engine,file,cue,ended,sources};
}
test('natural completion emitted once only after every voice ends',async()=>{
  const x=setup();
  await x.engine.loadFile(x.file,'asset');
  await x.engine.go(x.cue('a',2));
  x.sources[0].end();
  assert.deepEqual(x.ended,[]);
  x.sources[1].end();
  assert.deepEqual(x.ended,['a']);
  x.sources[1].end();
  assert.deepEqual(x.ended,['a']);
});
test('STOP and fade never emit natural completion',async()=>{
  const x=setup();
  await x.engine.loadFile(x.file,'asset');
  await x.engine.go(x.cue('a'));
  x.engine.stopCue('a',1000);
  x.sources[0].end();
  assert.deepEqual(x.ended,[]);
  await x.engine.go(x.cue('b'));
  x.engine.stopAll();
  x.sources[1].end();
  assert.deepEqual(x.ended,[]);
});
test('onCueNaturalEnd callback errors cannot prevent transport cleanup',async()=>{
  const x=setup();
  x.engine.onCueNaturalEnd=()=>{throw Error('bad UI');};
  await x.engine.loadFile(x.file,'asset');
  await x.engine.go(x.cue('a'));
  assert.doesNotThrow(()=>x.sources[0].end());
  assert.equal(x.engine.activeCueCount(),0);
});
