import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewShow,addAudioReference,assignAudioToCue,replaceCueAudioAsset,addMockProposal,decideProposal} from '../src/core/workspace.mjs';
import {insertManualCue,deleteOperatorCue} from '../src/core/manualCues.mjs';
import {serializeShowProject,deserializeShowProject} from '../src/core/projectPersistence.mjs';

test('new show allows manual cues without script, proposals or Meta permission',()=>{
  const blank=createNewShow({id:'blank',name:'Hand-built'});
  let {project,cueId}=insertManualCue(blank);
  assert.equal(project.proposals.length,0);
  assert.equal(project.scriptText,'');
  assert.equal(project.cues[0].origin,'MANUAL');
  assert.deepEqual(project.cues[0].sourceLineIds,[]);
  assert.equal(project.cues[0].actions[0].type,'PLAN_AUDIO');
  const audio=addAudioReference(project,'music.wav');
  project=assignAudioToCue(audio,cueId,audio.assets[0].id);
  assert.equal(project.cues[0].actions[0].type,'PLAY');
  assert.equal(project.proposals.length,0);
  const more=addAudioReference(project,'bell.wav');
  project=replaceCueAudioAsset(more,cueId,more.assets[1].id);
  assert.equal(project.cues[0].actions[0].assetId,more.assets[1].id);
  assert.deepEqual(deserializeShowProject(serializeShowProject(project)),project);
});
test('operator inserts and removes cues, preserving sequence and AI evidence',()=>{
  let show=createNewShow({scriptText:'(Thunder)',name:'Mixed show'});
  show=addAudioReference(show,'thunder.wav');
  show=addMockProposal(show,{lineId:'L1',assetId:show.assets[0].id,label:'Thunder'});
  show=decideProposal(show,show.proposals[0].id,'APPROVE');
  const originalProposal=show.proposals[0];
  const one=insertManualCue(show,{afterCueId:show.cues[0].id,label:'Door'});
  const two=insertManualCue(one.project,{afterCueId:show.cues[0].id,label:'Wind'});
  assert.deepEqual(two.project.cues.map(c=>c.label),['Thunder','Wind','Door']);
  assert.deepEqual(two.project.cues.map(c=>c.number),[1,2,3]);
  const removed=deleteOperatorCue(two.project,two.cueId);
  assert.deepEqual(removed.cues.map(c=>c.number),[1,2]);
  assert.deepEqual(removed.proposals[0],originalProposal);
  const noAI=deleteOperatorCue(removed,'cue-1');
  assert.equal(noAI.cues.length,1);
  assert.equal(noAI.proposals[0].status,'APPROVED');
});
test('invalid cue positions and missing delete IDs are rejected',()=>{
  const show=createNewShow();
  assert.throws(()=>insertManualCue(show,{afterCueId:'bad'}),/position/);
  assert.throws(()=>deleteOperatorCue(show,'missing'),/not found/);
});
