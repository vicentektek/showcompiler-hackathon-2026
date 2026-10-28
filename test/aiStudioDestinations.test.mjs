import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewShow, addAudioReference, addMockProposal } from '../src/core/workspace.mjs';
import { insertManualCue } from '../src/core/manualCues.mjs';
import { applyAiStudioDestination } from '../src/core/aiStudioDestinations.mjs';

function sample(){
  let show=createNewShow({name:'Review scene',scriptText:'SCENE I\n(A large metal door slams shut.)'});
  show=addAudioReference(show,'door.wav');
  return {show,assetId:show.assets[0].id};
}

test('sound first, then independent manual cue uses real asset and reviewed source interval',()=>{
  const {show,assetId}=sample();
  const before=JSON.stringify(show);
  const result=applyAiStudioDestination(show,{mode:'NEW_CUE',assetId,cueLabel:'Door impact',reviewedRegion:{inMs:400,outMs:1800}});
  assert.equal(show.cues.length,0);
  assert.equal(JSON.stringify(show),before,'pure operation does not modify current show');
  assert.equal(result.project.cues.length,1);
  assert.equal(result.project.cues[0].label,'Door impact');
  assert.deepEqual(result.project.cues[0].actions,[{type:'PLAY',assetId}]);
  assert.equal(result.project.cues[0].playback.startAtMs,400);
  assert.equal(result.project.cues[0].playback.endAtMs,1800);
});
test('script-first sound-first flow creates approved proposal cue with exact script provenance',()=>{
  let {show,assetId}=sample();
  show=addMockProposal(show,{lineId:'L2',label:'Iron slam'});
  const pid=show.proposals[0].id;
  const result=applyAiStudioDestination(show,{mode:'NEW_CUE',assetId,proposalId:pid,cueLabel:'Edited by operator'});
  assert.equal(show.proposals[0].status,'PENDING');
  assert.equal(result.project.proposals[0].status,'APPROVED');
  assert.equal(result.project.cues[0].sourceProposalId,pid);
  assert.deepEqual(result.project.cues[0].sourceLineIds,['L2']);
  assert.equal(result.project.cues[0].label,'Edited by operator');
  assert.equal(result.project.cues[0].actions[0].assetId,assetId);
});
test('library-only choice does not change show document or make a cue',()=>{
  const {show,assetId}=sample();
  const result=applyAiStudioDestination(show,{mode:'LIBRARY',assetId});
  assert.equal(result.cueId,null);
  assert.deepEqual(result.project,show);
});
test('existing unbound cue is resolved, repeated action creates extra track',()=>{
  let {show,assetId}=sample();
  const first=insertManualCue(show,{label:'Scene effect'});show=first.project;
  const resolved=applyAiStudioDestination(show,{mode:'EXISTING_CUE',assetId,targetCueId:first.cueId});
  assert.equal(resolved.project.cues[0].actions[0].assetId,assetId);
  const next=applyAiStudioDestination(resolved.project,{
    mode:'EXISTING_CUE',assetId,targetCueId:first.cueId,
    trackAction:'ADD',reviewedRegion:{inMs:120,outMs:650}
  });
  assert.equal(next.project.cues[0].audioTracks.length,1);
  assert.equal(next.project.cues[0].audioTracks[0].id,next.trackId);
  assert.equal(next.project.cues[0].audioTracks[0].playback.startAtMs,120);
  assert.equal(next.project.cues[0].audioTracks[0].playback.endAtMs,650);
});
test('replace original or a named extra track, not a different cue',()=>{
  let {show,assetId}=sample();
  show=addAudioReference(show,'alternate.wav');
  const alternate=show.assets[1].id;
  const first=insertManualCue(show,{label:'A'});show=first.project;
  const second=insertManualCue(show,{label:'B'});show=second.project;
  show=applyAiStudioDestination(show,{mode:'EXISTING_CUE',targetCueId:first.cueId,assetId}).project;
  show=applyAiStudioDestination(show,{mode:'EXISTING_CUE',targetCueId:second.cueId,assetId}).project;
  show=applyAiStudioDestination(show,{mode:'EXISTING_CUE',targetCueId:first.cueId,assetId,trackAction:'ADD'}).project;
  const track=show.cues[0].audioTracks[0].id;
  const result=applyAiStudioDestination(show,{
    mode:'EXISTING_CUE',targetCueId:first.cueId,targetTrackId:track,trackAction:'REPLACE',assetId:alternate
  });
  assert.equal(result.project.cues[0].audioTracks[0].assetId,alternate);
  assert.equal(result.project.cues[0].actions[0].assetId,assetId);
  assert.equal(result.project.cues[1].actions[0].assetId,assetId);
});
test('invalid targets, implicit proposal approval and corrupt regions fail without mutations',()=>{
  const {show,assetId}=sample();
  const unchanged=JSON.stringify(show);
  assert.throws(()=>applyAiStudioDestination(show,{mode:'EXISTING_CUE',assetId,targetCueId:'cue-missing'}),/existing cue/);
  assert.throws(()=>applyAiStudioDestination(show,{mode:'NEW_CUE',assetId,cueLabel:'  '}),/Cue name/);
  assert.throws(()=>applyAiStudioDestination(show,{mode:'NEW_CUE',assetId,cueLabel:'A',reviewedRegion:{inMs:1000,outMs:500}}),/region/);
  assert.throws(()=>applyAiStudioDestination(show,{mode:'EXISTING_CUE',assetId,targetCueId:'cue-1',trackAction:'REPLACE'}),/existing cue/);
  assert.equal(JSON.stringify(show),unchanged);
});
