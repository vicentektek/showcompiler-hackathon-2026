import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewShow,addAudioReference,addMockProposal,decideProposal } from '../src/core/workspace.mjs';
import { stageAddCueTrack,stageChangeCueTrack,stageRemoveCueTrack } from '../src/core/cueTracks.mjs';
import { normalizeShowProject,serializeShowProject,deserializeShowProject } from '../src/core/projectPersistence.mjs';
import { inspectShowReadiness } from '../src/core/showPreflight.mjs';
import { BrowserAudioEngine } from '../src/core/browserAudio.mjs';

function fixture() {
  let s=createNewShow({id:'test-multi',name:'Test',scriptText:'(Transition)'});
  s=addAudioReference(s,'one.wav');
  s=addAudioReference(s,'two.wav');
  s=addMockProposal(s,{lineId:'L1',assetId:'asset-1',label:'Transition'});
  return decideProposal(s,'proposal-1','APPROVE');
}

test('multi-track is operator-only, keeps approved AI evidence and survives ZIP JSON',()=>{
  const original=fixture();
  const staged=stageAddCueTrack(original,'cue-1','asset-2');
  const project=normalizeShowProject(staged);
  assert.equal(project.cues[0].audioTracks.length,1);
  assert.deepEqual(project.proposals,original.proposals);
  assert.deepEqual(project.cues[0].actions,original.cues[0].actions);
  const updated=normalizeShowProject(stageChangeCueTrack(project,'cue-1','track-1',{
    playback:{...project.cues[0].audioTracks[0].playback,gainDb:-12,startDelayMs:1250,loop:true}
  }));
  assert.equal(updated.cues[0].audioTracks[0].playback.startDelayMs,1250);
  assert.equal(updated.cues[0].audioTracks[0].playback.loop,true);
  assert.deepEqual(deserializeShowProject(serializeShowProject(updated)),updated);
  const removed=normalizeShowProject(stageRemoveCueTrack(updated,'cue-1','track-1'));
  assert.equal(removed.cues[0].audioTracks.length,0);
  assert.equal(original.cues[0].audioTracks,undefined);
});

test('unknown assets, duplicate track ids and invalid playback are rejected',()=>{
  const s=fixture();
  assert.throws(()=>stageAddCueTrack(s,'cue-1','missing'),/Unknown audio/);
  const one=normalizeShowProject(stageAddCueTrack(s,'cue-1','asset-2'));
  assert.throws(()=>stageChangeCueTrack(one,'cue-1','missing',{assetId:'asset-1'}));
  assert.throws(()=>normalizeShowProject(stageChangeCueTrack(one,'cue-1','track-1',{assetId:'missing'})));
  assert.throws(()=>normalizeShowProject(stageChangeCueTrack(one,'cue-1','track-1',{playback:{loop:true,repeatCount:3}})));
  assert.throws(()=>normalizeShowProject({...one,cues:[{...one.cues[0],audioTracks:[one.cues[0].audioTracks[0],one.cues[0].audioTracks[0]]}]}));
});

test('preflight reports missing secondary track independently of the primary',()=>{
  const s=normalizeShowProject(stageAddCueTrack(fixture(),'cue-1','asset-2'));
  const missing=inspectShowReadiness(s,id=>id==='asset-1');
  assert.equal(missing.ready,false);
  assert.equal(missing.issues[0].assetId,'asset-2');
  assert.equal(inspectShowReadiness(s,()=>true).ready,true);
});

test('one GO schedules two independent tracks, stop-all cancels both',async()=>{
  const starts=[],stops=[],gains=[],ended=[];
  const ctx={currentTime:5,state:'running',destination:{},resume:async()=>{},
    decodeAudioData:async()=>({duration:3,numberOfChannels:1}),
    createGain(){
      const gain={value:1,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},
        linearRampToValueAtTime(v){this.value=v;}};
      gains.push(gain);
      return {gain,connect(){},disconnect(){}};
    },
    createBufferSource(){
      const src={buffer:null,loop:false,playbackRate:{value:1},onended:null,
        connect(){},disconnect(){},start(t,o){starts.push([t,o]);},
        stop(t){stops.push(t);}};
      return src;
    },
  };
  const engine=new BrowserAudioEngine({contextFactory:()=>ctx,onCueNaturalEnd:id=>ended.push(id)});
  for(const id of ['asset-1','asset-2']){
    await engine.loadFile({name:id+'.wav',size:100,arrayBuffer:async()=>new ArrayBuffer(100)},id);
  }
  const original=fixture();
  const s=normalizeShowProject(stageChangeCueTrack(
    normalizeShowProject(stageAddCueTrack(original,'cue-1','asset-2')),
    'cue-1','track-1',{playback:{gainDb:-12,startDelayMs:1250,loop:true}}));
  await engine.go(s.cues[0]);
  assert.deepEqual(starts,[[5.02,0],[6.27,0]]);
  assert.ok(Math.abs(gains[1].value-0.5)<1e-9);
  assert.ok(Math.abs(gains[2].value-0.5*10**(-12/20))<1e-9);
  assert.equal(engine.isPlaying('cue-1'),true);
  engine.stopAll();
  assert.equal(stops.length,2);
  assert.equal(engine.isPlaying('cue-1'),false);
  assert.deepEqual(ended,[]);
});
