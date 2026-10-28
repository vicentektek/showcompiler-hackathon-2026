import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewShow, addAudioReference, addMockProposal, decideProposal } from '../src/core/workspace.mjs';
import { serializeShowProject, deserializeShowProject } from '../src/core/projectPersistence.mjs';
import { normalizeCueEntryPolicy, setCueEntryPolicy, planEntryStops } from '../src/core/cueEntryPolicy.mjs';
import { normalizeCuePlayback } from '../src/core/cuePlayback.mjs';

function fixture(){
  let show=createNewShow({name:'Scene',scriptText:'(A begins)\n(B begins)\n(C begins)'});
  show=addAudioReference(show,'one.wav');
  for(let i=1;i<=3;i++){
    show=addMockProposal(show,{lineId:'L'+i,assetId:'asset-1',label:'Cue '+i});
    show=decideProposal(show,'proposal-'+i,'APPROVE');
  }
  return show;
}
test('cue overlap policy defaults to coexist, without touching legacy cues',()=>{
  const a=fixture();
  assert.deepEqual(normalizeCueEntryPolicy(),{mode:'OVERLAP',fadeOutMs:0});
  assert.deepEqual(planEntryStops(a.cues,'cue-2',undefined),[]);
});
test('cue STOP_PREVIOUS selects only OTHER cues, preserves fade and round-trips JSON',()=>{
  const a=fixture();
  const b=setCueEntryPolicy(a,'cue-2',{mode:'STOP_PREVIOUS',fadeOutMs:850});
  assert.equal(a.cues[1].entryPolicy,undefined);
  assert.deepEqual(planEntryStops(b.cues,'cue-2',b.cues[1].entryPolicy),[
    {cueId:'cue-1',fadeMs:850},{cueId:'cue-3',fadeMs:850},
  ]);
  const restored=deserializeShowProject(serializeShowProject(b));
  assert.deepEqual(restored,b);
  assert.equal(restored.cues[0].entryPolicy,undefined);
  assert.deepEqual(restored.proposals,a.proposals);
});
test('invalid or unrecognized overlap modes cannot be loaded or saved',()=>{
  const a=fixture();
  for(const mode of ['STOP_ALL','AUTO','stop_previous','']) {
    assert.throws(()=>setCueEntryPolicy(a,'cue-1',{mode}),/Invalid/);
  }
  assert.throws(()=>setCueEntryPolicy(a,'cue-9',{mode:'OVERLAP'}),/not found/);
  assert.throws(()=>setCueEntryPolicy(a,'cue-1',{mode:'STOP_PREVIOUS',fadeOutMs:10001}),/Invalid/);
  assert.throws(()=>deserializeShowProject(
    JSON.stringify({...a,cues:a.cues.map((c,i)=>i===0?{...c,entryPolicy:{mode:'INVALID'}}:c)})),/Invalid/);
});
test('same asset can be trimmed/faded independently per cue without altering library audio',()=>{
  const a=fixture();
  const b={...a,cues:a.cues.map((c,i)=>i===0?{
    ...c,playback:normalizeCuePlayback({startAtMs:250,endAtMs:1750,fadeInMs:350,fadeOutMs:450})
  }:c)};
  const p=deserializeShowProject(serializeShowProject(b));
  assert.equal(p.cues[0].playback.startAtMs,250);
  assert.equal(p.cues[0].playback.endAtMs,1750);
  assert.equal(p.cues[0].playback.fadeOutMs,450);
  assert.equal(p.cues[1].playback,undefined);
  assert.deepEqual(p.assets,a.assets);
});
