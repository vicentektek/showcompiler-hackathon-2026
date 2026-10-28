import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserAudioEngine } from '../src/core/browserAudio.mjs';

function fixture({deferredResume=false}={}) {
  const starts=[], stops=[], sources=[], gains=[], ended=[];
  let unlock;
  const ctx={
    currentTime:2,state:'running',destination:{},
    async resume(){if(deferredResume)await new Promise(resolve=>{unlock=resolve;});},
    decodeAudioData:async()=>({duration:4,numberOfChannels:1,
      getChannelData:()=>new Float32Array([0,.6,-.5,0])}),
    createGain(){
      const param={value:1,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},
        linearRampToValueAtTime(){}};
      const gain={gain:param,connect(){},disconnect(){}};
      gains.push(gain);return gain;
    },
    createStereoPanner:()=>({pan:{value:0},connect(){},disconnect(){}}),
    createBufferSource(){
      const source={buffer:null,loop:false,onended:null,playbackRate:{value:1},
        connect(){},disconnect(){},
        start(...args){starts.push(args);},
        stop(at){stops.push(at);},
        end(){this.onended?.();}};
      sources.push(source);return source;
    },
  };
  const engine=new BrowserAudioEngine({contextFactory:()=>ctx,onCueNaturalEnd:id=>ended.push(id)});
  const file=id=>({name:id+'.wav',size:99,arrayBuffer:async()=>new ArrayBuffer(99)});
  const cue=()=>({
    id:'cue-1',status:'DRAFT',actions:[{type:'PLAY',assetId:'asset-1'}],
    playback:{startAtMs:500,endAtMs:1500,fadeInMs:100,fadeOutMs:200,gainDb:-6},
    audioTracks:[{id:'track-1',assetId:'asset-2',
      playback:{startAtMs:100,endAtMs:2100,gainDb:-12}}],
  });
  const load=async()=>{
    await engine.loadFile(file('main'),'asset-1');
    await engine.loadFile(file('extra'),'asset-2');
  };
  return {ctx,engine,cue,load,starts,stops,sources,gains,ended,
    release:()=>unlock?.()};
}

test('cue audition plays two actual PCM sources without GO or show queue state',async()=>{
  const x=fixture();await x.load();
  await x.engine.previewCue(x.cue());
  assert.equal(x.starts.length,2);
  assert.equal(x.engine.activeCueCount(),0);
  assert.equal(x.engine.isPlaying('cue-1'),false);
  assert.equal(x.engine.isAuditioning(),true);
  const state=x.engine.getPreviewStatus();
  assert.equal(state.cueId,'cue-1');
  assert.equal(state.trackId,null);
  assert.ok(x.gains[0].gain.value<.25);
  assert.deepEqual(x.ended,[]);
  x.sources[0].end();assert.equal(x.engine.isAuditioning(),true);
  x.sources[1].end();assert.equal(x.engine.isAuditioning(),false);
  assert.equal(x.engine.getPreviewStatus(),null);
  assert.deepEqual(x.ended,[]);
});

test('solo track audition uses staged trim and from-cursor position without touching saved cue',async()=>{
  const x=fixture();await x.load();
  const cue=x.cue();
  await x.engine.previewCue(cue,{trackId:'primary',fromMs:750});
  assert.equal(x.starts.length,1);
  assert.equal(x.starts[0][1],.75);
  assert.equal(x.starts[0][2],.75);
  assert.equal(x.engine.getPreviewStatus().trackId,'primary');
  assert.equal(x.engine.getPreviewStatus().positionMs,750);
  x.ctx.currentTime=2.27;
  assert.ok(x.engine.getPreviewStatus().positionMs>750);
  x.engine.stopAudition();
  assert.equal(x.stops.length,1);
  assert.equal(cue.playback.startAtMs,500);
  assert.equal(x.engine.activeCueCount(),0);
});

test('preview of one extra stem excludes main and preserves fade and trimmed region',async()=>{
  const x=fixture();await x.load();
  await x.engine.previewCue(x.cue(),{trackId:'track-1'});
  assert.equal(x.starts.length,1);
  assert.equal(x.starts[0][1],.1);
  assert.equal(x.starts[0][2],2);
  assert.equal(x.engine.getPreviewStatus().trackId,'track-1');
  assert.deepEqual(x.ended,[]);
  x.engine.stopAll();
  assert.equal(x.gains[0].gain.value,0);
  assert.equal(x.engine.isAuditioning(),false);
});

test('preview cannot overlap GO, is invalidated by STOP ALL, and leaves GO ready',async()=>{
  const x=fixture();await x.load();
  await x.engine.go(x.cue());
  await assert.rejects(x.engine.previewCue(x.cue()),/Detén el transporte/);
  x.engine.stopAll();
  await x.engine.previewCue(x.cue());
  await assert.rejects(x.engine.go(x.cue()),/preescucha/);
  x.engine.stopAudition();
  await x.engine.go(x.cue());
  assert.equal(x.engine.isPlaying('cue-1'),true);
});

test('STOP during pending context resume prevents any preview sound',async()=>{
  const x=fixture({deferredResume:true});await x.load();
  const pending=x.engine.previewCue(x.cue());
  await Promise.resolve();
  assert.equal(x.engine.isAuditioning(),true);
  x.engine.stopAudition();
  x.release();
  await assert.rejects(pending,/cancelada/);
  assert.equal(x.starts.length,0);
  assert.equal(x.engine.getPreviewStatus(),null);
});

test('preview rejects missing, invalid, or out-of-selection cursor without starting audio',async()=>{
  const x=fixture();await x.load();
  await assert.rejects(x.engine.previewCue({...x.cue(),status:'PENDING'}),/DRAFT/);
  await assert.rejects(x.engine.previewCue(x.cue(),{trackId:'unknown'}),/missing/);
  await assert.rejects(x.engine.previewCue(x.cue(),{trackId:'primary',fromMs:1600}),/inside/);
  await assert.rejects(x.engine.previewCue({...x.cue(),playback:{endAtMs:5000}}),/outside/);
  assert.equal(x.starts.length,0);
  assert.equal(x.engine.isAuditioning(),false);
});
