import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStopFadeOverrides, stageCueStopTransitions } from '../src/core/cueStopFades.mjs';
import { normalizeShowProject, serializeShowProject, deserializeShowProject } from '../src/core/projectPersistence.mjs';
import { createNewShow, addAudioReference, addMockProposal, decideProposal } from '../src/core/workspace.mjs';

function fixture() {
  let show = createNewShow({scriptText:'(Music)\n(Storm)',name:'Fade targets'});
  show = addAudioReference(show,'sample.wav');
  for(const [line,label] of [['L1','Music'],['L2','Storm']]){
    const assetId=show.assets[0].id;
    show=addMockProposal(show,{lineId:line,assetId,label});
    show=decideProposal(show,show.proposals.at(-1).id,'APPROVE');
  }
  return show;
}
test('per-target fade durations are validated and legacy cues retain no override',()=>{
  assert.deepEqual(normalizeStopFadeOverrides({},[]),{});
  assert.deepEqual(normalizeStopFadeOverrides({'cue-1':4000},['cue-1']),{'cue-1':4000});
  for(const [value,targets] of [
    [{'cue-1':-1},['cue-1']], [{'cue-1':10001},['cue-1']],
    [{'cue-1':1.5},['cue-1']], [{'cue-1':4000},[]],
    [[],['cue-1']],
  ]) assert.throws(()=>normalizeStopFadeOverrides(value,targets),/Invalid target stop fade/);
  const show=fixture();
  assert.equal(show.cues[1].stopFadeOverrides,undefined);
});
test('stage transitions and ZIP-compatible JSON preserve explicit 4-second stop target',()=>{
  const show=fixture();
  const staged=stageCueStopTransitions(show,'cue-2',[{targetCueId:'cue-1',fadeMs:4000}]);
  const saved=normalizeShowProject(staged);
  assert.equal(saved.cues[1].stopFadeOverrides['cue-1'],4000);
  assert.deepEqual(saved.cues[1].automation.stopCueIds,['cue-1']);
  assert.deepEqual(deserializeShowProject(serializeShowProject(saved)),saved);
  assert.equal(show.cues[1].stopFadeOverrides,undefined);
  assert.deepEqual(saved.proposals,show.proposals);
  const cleared=normalizeShowProject(stageCueStopTransitions(saved,'cue-2',[]));
  assert.deepEqual(cleared.cues[1].stopFadeOverrides,{});
  assert.deepEqual(cleared.cues[1].automation.stopCueIds,[]);
});
test('unsafe target or invalid duration cannot corrupt a valid show',()=>{
  const show=fixture();
  for(const actions of [
    [{targetCueId:'cue-2',fadeMs:500}],
    [{targetCueId:'absent',fadeMs:500}],
    [{targetCueId:'cue-1',fadeMs:11000}],
    [{targetCueId:'cue-1',fadeMs:-5}],
    [{targetCueId:'cue-1',fadeMs:200},{targetCueId:'cue-1',fadeMs:400}],
  ]) {
    assert.throws(()=>normalizeShowProject(stageCueStopTransitions(show,'cue-2',actions)));
  }
  assert.equal(show.cues[1].automation,undefined);
});
