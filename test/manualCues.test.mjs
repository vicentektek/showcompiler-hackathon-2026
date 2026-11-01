import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewShow,addAudioReference,assignAudioToCue,replaceCueAudioAsset,addMockProposal,decideProposal,updateCueAutomation} from '../src/core/workspace.mjs';
import {insertManualCue,insertManualCueFromScriptLines,insertManualAudioCue,deleteOperatorCue,duplicateOperatorCue,moveOperatorCue,reorderOperatorCue,trailingFollowReleased} from '../src/core/manualCues.mjs';
import {serializeShowProject,deserializeShowProject} from '../src/core/projectPersistence.mjs';

test('dropped audio appends independently editable PLAY cues without script or AI provenance',()=>{
  let show=createNewShow({scriptText:'Original source text'});
  const first=insertManualCue(show,{label:'Existing cue'});
  show=first.project;
  for(let index=0;index<20;index++){
    show=addAudioReference(show,`Track ${index+1}.wav`);
    const asset=show.assets.at(-1);
    show=insertManualAudioCue(show,asset.id).project;
  }
  assert.equal(show.cues.length,21);
  assert.equal(show.cues[0].id,first.cueId);
  assert.equal(show.scriptText,'Original source text');
  assert.deepEqual(show.proposals,[]);
  show.cues.slice(1).forEach((cue,index)=>{
    assert.equal(cue.number,index+2);
    assert.equal(cue.label,`Track ${index+1}.wav`);
    assert.equal(cue.origin,'MANUAL');
    assert.equal(cue.status,'DRAFT');
    assert.deepEqual(cue.sourceLineIds,[]);
    assert.deepEqual(cue.actions,[{type:'PLAY',assetId:show.assets[index].id}]);
    assert.equal(cue.automation,undefined);
  });
  assert.deepEqual(deserializeShowProject(serializeShowProject(show)),show);
  assert.throws(()=>insertManualAudioCue(show,'missing'),/Unknown audio asset/);
});

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
test('manual cue from selected script lines preserves exact source references without AI provenance',()=>{
 const show=createNewShow({id:'selected-lines',scriptText:'SCENE 1\n(The old door opens.)\nMARA: I heard it.'});
 const result=insertManualCueFromScriptLines(show,['L3','L2']);
 const cue=result.project.cues.find(item=>item.id===result.cueId);
 assert.equal(cue.label,'(The old door opens.)');
 assert.deepEqual(cue.sourceLineIds,['L2','L3']);
 assert.equal(cue.origin,'MANUAL');
 assert.equal(cue.status,'DRAFT');
 assert.equal(result.project.scriptText,show.scriptText);
 assert.deepEqual(result.project.proposals,[]);
 assert.equal(deserializeShowProject(serializeShowProject(result.project)).cues[0].sourceLineIds.join(','),'L2,L3');
 assert.throws(()=>insertManualCueFromScriptLines(show,[]),/1 and 20/);
 assert.throws(()=>insertManualCueFromScriptLines(show,['L1','L1']),/unique/);
 assert.throws(()=>insertManualCueFromScriptLines(show,['L4']),/unavailable/);
 assert.throws(()=>insertManualCueFromScriptLines(createNewShow(),['L1']),/source script/);
 assert.throws(()=>insertManualCueFromScriptLines(show,Array.from({length:21},(_,index)=>'L'+(index+1))),/1 and 20/);
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

test('duplicate copies operator cue without creating synthetic AI approval; move up/down preserves identity',()=>{
  let show=createNewShow({id:'manual-sequence'});
  const first=insertManualCue(show,{label:'Ambient'});show=first.project;
  const second=insertManualCue(show,{label:'Door'});show=second.project;
  const duplicate=duplicateOperatorCue(show,first.cueId);show=duplicate.project;
  assert.deepEqual(show.cues.map(c=>c.label),['Ambient','Ambient copy','Door']);
  assert.equal(show.cues[1].origin,'MANUAL');
  assert.equal(show.proposals.length,0);
  show=moveOperatorCue(show,second.cueId,-1);
  assert.deepEqual(show.cues.map(c=>c.label),['Ambient','Door','Ambient copy']);
  assert.deepEqual(show.cues.map(c=>c.number),[1,2,3]);
  assert.deepEqual(deserializeShowProject(serializeShowProject(show)),show);
  assert.deepEqual(moveOperatorCue(show,first.cueId,-1),show);
  assert.throws(()=>moveOperatorCue(show,first.cueId,5),/move direction/);
});


test('drag reorder moves cue before/after target without changing IDs or settings',()=>{
  let show=createNewShow({id:'drag-reorder'});
  const one=insertManualCue(show,{label:'First'});show=one.project;
  const two=insertManualCue(show,{label:'Second'});show=two.project;
  const three=insertManualCue(show,{label:'Third'});show=three.project;
  const before=show.cues.map(c=>({id:c.id,label:c.label,actions:c.actions}));
  show=reorderOperatorCue(show,one.cueId,three.cueId,'after');
  assert.deepEqual(show.cues.map(c=>c.label),['Second','Third','First']);
  assert.deepEqual(show.cues.map(c=>c.number),[1,2,3]);
  assert.deepEqual(show.cues.map(c=>({id:c.id,label:c.label,actions:c.actions})),
    [before[1],before[2],before[0]]);
  show=reorderOperatorCue(show,one.cueId,two.cueId,'before');
  assert.deepEqual(show.cues.map(c=>c.label),['First','Second','Third']);
  assert.deepEqual(reorderOperatorCue(show,one.cueId,one.cueId),show);
  assert.throws(()=>reorderOperatorCue(show,'bad',two.cueId),/not found/);
  assert.throws(()=>reorderOperatorCue(show,one.cueId,two.cueId,'middle'),/position/);
});
test('structural edits that leave a follow cue last make it MANUAL instead of blocking',()=>{
  let show=createNewShow({scriptText:'A\nB'});
  for(const label of ['One','Two','Three'])show=insertManualCue(show,{label}).project;
  show=updateCueAutomation(show,'cue-2',{mode:'AUTO_CONTINUE',delayMs:1500});
  const deleted=deleteOperatorCue(show,'cue-3');
  assert.deepEqual(deleted.cues.map(c=>c.id),['cue-1','cue-2']);
  assert.equal(deleted.cues[1].automation.mode,'MANUAL');
  assert.equal(deleted.cues[1].automation.delayMs,0);
  assert.equal(trailingFollowReleased(show,deleted),'cue-2');
  const moved=moveOperatorCue(show,'cue-2',1);
  assert.deepEqual(moved.cues.map(c=>c.id),['cue-1','cue-3','cue-2']);
  assert.equal(moved.cues[2].automation.mode,'MANUAL');
  const dropped=reorderOperatorCue(show,'cue-2','cue-3','after');
  assert.equal(dropped.cues.at(-1).automation.mode,'MANUAL');
  const untouched=deleteOperatorCue(show,'cue-1');
  assert.equal(untouched.cues[0].automation.mode,'AUTO_CONTINUE','a follow that still has a next cue is preserved');
  assert.equal(untouched.cues[0].automation.delayMs,1500);
  assert.equal(trailingFollowReleased(show,untouched),null);
});
