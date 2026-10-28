import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewShow,addAudioReference } from '../src/core/workspace.mjs';
import { insertManualCue } from '../src/core/manualCues.mjs';
import { insertAudioCues,moveAudioCueBefore } from '../src/core/audioCueDrop.mjs';
import { serializeShowProject,deserializeShowProject } from '../src/core/projectPersistence.mjs';

const fixture=()=>{
  let show=createNewShow({name:'Audio drop test'});
  show=addAudioReference(show,'01 Intro.mp3');
  show=addAudioReference(show,'Ambiente bosque.wav');
  show=addAudioReference(show,'Final.ogg');
  return show;
};
test('dragging several loaded audio references creates ordered manual PLAY cues, without script or AI',()=>{
  const show=fixture(),ids=show.assets.map(a=>a.id);
  const result=insertAudioCues(show,ids);
  assert.deepEqual(result.project.cues.map(c=>c.label),['01 Intro','Ambiente bosque','Final']);
  assert.deepEqual(result.project.cues.map(c=>c.number),[1,2,3]);
  assert.deepEqual(result.project.cues.map(c=>c.actions),ids.map(assetId=>[{type:'PLAY',assetId}]));
  assert.ok(result.project.cues.every(c=>c.origin==='MANUAL'&&c.status==='DRAFT'&&c.sourceLineIds.length===0));
  assert.equal(show.cues.length,0);
  assert.deepEqual(deserializeShowProject(serializeShowProject(result.project)).cues,result.project.cues);
});
test('insert before exact cue without modifying preexisting cue identity',()=>{
  let show=fixture(), first=insertManualCue(show,{label:'Already here'});
  show=first.project;
  const id=first.cueId;
  const result=insertAudioCues(show,[show.assets[1].id,show.assets[0].id],{beforeCueId:id});
  assert.deepEqual(result.project.cues.map(c=>c.label),['Ambiente bosque','01 Intro','Already here']);
  assert.equal(result.project.cues[2].id,id);
  assert.deepEqual(result.project.cues.map(c=>c.number),[1,2,3]);
});
test('existing audio reference can be used in multiple different cues',()=>{
  let show=fixture();
  show=insertAudioCues(show,[show.assets[0].id,show.assets[0].id]).project;
  assert.notEqual(show.cues[0].id,show.cues[1].id);
  assert.equal(show.cues[0].actions[0].assetId,show.cues[1].actions[0].assetId);
});
test('dragging cue reorders without changing audio, metadata, or cue identifiers',()=>{
  let show=fixture();
  show=insertAudioCues(show,show.assets.map(a=>a.id)).project;
  const original=show.cues[0];
  const moved=moveAudioCueBefore(show,original.id,null);
  assert.deepEqual(moved.cues.map(c=>c.label),['Ambiente bosque','Final','01 Intro']);
  assert.deepEqual(moved.cues[2],{...original,number:3});
  assert.deepEqual(show.cues.map(c=>c.number),[1,2,3]);
  assert.deepEqual(moveAudioCueBefore(moved,original.id,moved.cues[0].id).cues.map(c=>c.label),
    ['01 Intro','Ambiente bosque','Final']);
});
test('invalid insertion positions and references fail without committing partial batch',()=>{
  const show=fixture();
  assert.throws(()=>insertAudioCues(show,['asset-1','asset-does-not-exist']),/Unknown audio asset/);
  assert.throws(()=>insertAudioCues(show,['asset-1'],{beforeCueId:'unknown'}),/target/);
  assert.throws(()=>insertAudioCues(show,[]),/at least one/);
  assert.throws(()=>moveAudioCueBefore(show,'not-a-cue'),/Cue not found/);
  assert.equal(show.cues.length,0);
});
