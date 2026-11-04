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

function fixtureWithOriginalPlays(count){
  let s=createNewShow({id:'test-play-count',name:'Test',scriptText:'(Transition)'});
  for(let i=0;i<12;i++)s=addAudioReference(s,`asset-${i}.wav`);
  s=addMockProposal(s,{lineId:'L1',assetId:'asset-1',label:'Transition'});
  s=decideProposal(s,'proposal-1','APPROVE');
  const actions=Array.from({length:count},(_,i)=>({type:'PLAY',assetId:`asset-${i+1}`}));
  const proposal=s.proposals[0];
  return normalizeShowProject({...s,
    proposals:s.proposals.map(p=>p.id===proposal.id?{...p,actions}:p),
    cues:s.cues.map(c=>c.id==='cue-1'?{...c,actions}:c),
  });
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

test('total PLAY sources count original actions plus operator tracks and round trip',()=>{
  const two=fixtureWithOriginalPlays(2);
  let project=two;
  for(let i=0;i<10;i++)project=stageAddCueTrack(project,'cue-1',`asset-${i+3}`);
  project=normalizeShowProject(project);
  assert.equal(project.cues[0].actions.filter(a=>a.type==='PLAY').length+project.cues[0].audioTracks.length,12);
  assert.deepEqual(deserializeShowProject(serializeShowProject(project)),project);
  assert.throws(()=>stageAddCueTrack(project,'cue-1','asset-12'),/Maximum 12/);
  const three=fixtureWithOriginalPlays(3);
  let capped=three;
  for(let i=0;i<9;i++)capped=stageAddCueTrack(capped,'cue-1',`asset-${i+4}`);
  assert.throws(()=>stageAddCueTrack(capped,'cue-1','asset-1'),/Maximum 12/);
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

test('browser audio engine schedules and stops twelve original PLAY actions',async()=>{
 const starts=[],stops=[];
 const ctx={currentTime:1,state:'running',destination:{},resume:async()=>{},
  decodeAudioData:async()=>({duration:2,numberOfChannels:1}),
  createGain(){return {gain:{value:1,cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}}},
  createBufferSource(){return {buffer:null,loop:false,playbackRate:{value:1},onended:null,connect(){},disconnect(){},start(){starts.push(1)},stop(){stops.push(1)}}}};
 const engine=new BrowserAudioEngine({contextFactory:()=>ctx});
 for(let i=1;i<=12;i++)await engine.loadFile({name:`${i}.wav`,size:100,arrayBuffer:async()=>new ArrayBuffer(100)},`asset-${i}`);
 await engine.go(fixtureWithOriginalPlays(12).cues[0]);
 assert.equal(starts.length,12);
 engine.stopAll();assert.equal(stops.length,12);
});
