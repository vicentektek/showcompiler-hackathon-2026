import test from 'node:test';
import assert from 'node:assert/strict';
import { stageCueStopTransitions, normalizeStopFadeOverrides } from '../src/core/cueStopFades.mjs';
import { createNewShow, addAudioReference, addMockProposal, decideProposal, replaceCueAudioAsset } from '../src/core/workspace.mjs';
import { normalizeShowProject, serializeShowProject, deserializeShowProject } from '../src/core/projectPersistence.mjs';

function twoCues() {
  let show=createNewShow({id:'target-show',name:'Test',scriptText:'(Ambiente)\n(Cambio)'});
  show=addAudioReference(show,'rain.wav');
  show=addAudioReference(show,'bell.wav');
  show=addMockProposal(show,{lineId:'L1',assetId:'asset-1',label:'Atmosphere'});
  show=addMockProposal(show,{lineId:'L2',assetId:'asset-2',label:'Transition'});
  show=decideProposal(show,'proposal-1','APPROVE');
  return decideProposal(show,'proposal-2','APPROVE');
}

test('save a cue-specific 4s fade independent of target cue fade, round trip JSON/ZIP project', () => {
  const show=twoCues();
  const changed=normalizeShowProject(stageCueStopTransitions(show,'cue-2',[
    {targetCueId:'cue-1',fadeMs:4000}
  ]));
  assert.equal(changed.cues[1].stopFadeOverrides['cue-1'],4000);
  assert.deepEqual(changed.cues[1].automation.stopCueIds,['cue-1']);
  assert.deepEqual(changed.proposals,show.proposals);
  assert.equal(show.cues[1].stopFadeOverrides,undefined);
  assert.deepEqual(deserializeShowProject(serializeShowProject(changed)),changed);
  const cleared=normalizeShowProject(stageCueStopTransitions(changed,'cue-2',[]));
  assert.deepEqual(cleared.cues[1].automation.stopCueIds,[]);
  assert.deepEqual(cleared.cues[1].stopFadeOverrides,{});
});

test('reject invalid fades, missing or self targets, duplicates and stale cue IDs', () => {
  const show=twoCues();
  for (const transitions of [
    [{targetCueId:'cue-1',fadeMs:-1}],
    [{targetCueId:'cue-1',fadeMs:10001}],
    [{targetCueId:'cue-1',fadeMs:250.5}],
    [{targetCueId:'cue-1',fadeMs:NaN}],
    [{targetCueId:'cue-1',fadeMs:1000},{targetCueId:'cue-1',fadeMs:2000}],
    [{targetCueId:'cue-2',fadeMs:1000}],
    [{targetCueId:'cue-404',fadeMs:2000}],
  ]) assert.throws(()=>normalizeShowProject(stageCueStopTransitions(show,'cue-2',transitions)));
  assert.throws(()=>normalizeStopFadeOverrides({'cue-1':2000},[]));
  assert.throws(()=>normalizeShowProject({...show,cues:show.cues.map(c=>c.id==='cue-2'
    ?{...c,stopFadeOverrides:{'cue-1':1000}}:c)}));
});

test('legacy cues and old target stop behavior deserialize without new required fields',()=>{
  const show=twoCues();
  assert.deepEqual(deserializeShowProject(serializeShowProject(show)),show);
  const old=normalizeShowProject({...show,cues:show.cues.map(c=>c.id==='cue-2'
    ?{...c,automation:{mode:'MANUAL',delayMs:0,fadeInMs:0,fadeOutMs:0,loop:false,stopCueIds:['cue-1']}}:c)});
  assert.equal(old.cues[1].stopFadeOverrides,undefined);
});

test('single PLAY asset replacement from library preserves IDs and the cue playback settings',()=>{
  const show=twoCues();
  const before=show.cues[0];
  const replaced=replaceCueAudioAsset(show,'cue-1','asset-2');
  assert.equal(replaced.cues[0].actions[0].assetId,'asset-2');
  assert.equal(replaced.cues[0].id,before.id);
  assert.deepEqual(replaced.cues[0].sourceLineIds,before.sourceLineIds);
  assert.equal(show.cues[0].actions[0].assetId,'asset-1');
});
