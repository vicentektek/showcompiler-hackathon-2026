import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewShow, addMockProposal, decideProposal, updateCueOperatorDetails } from '../src/core/workspace.mjs';
import { normalizeShowProject, serializeShowProject, deserializeShowProject } from '../src/core/projectPersistence.mjs';

function fixture() {
  let project=createNewShow({ name:'Test show', scriptText:'SCENE 1\n(A bell rings.)\nALEX: Begin.' });
  project=addMockProposal(project,{lineId:'L2',label:'Bell'});
  project=decideProposal(project,project.proposals[0].id,'APPROVE');
  return project;
}
test('operator label, trigger and notes persist in JSON without modifying AI proposal provenance', () => {
  const project=fixture();
  const beforeProposal=project.proposals[0];
  const originalCue=project.cues[0];
  const edited=updateCueOperatorDetails(project,originalCue.id,{
    label:'Bell sound Q1',
    trigger:'ALEX finishes “Begin”',
    notes:'Playback device: main stereo\nWait for the stage manager.',
  });
  const cue=edited.cues[0];
  assert.equal(cue.label,'Bell sound Q1');
  assert.equal(cue.trigger,'ALEX finishes “Begin”');
  assert.match(cue.notes,/main stereo/);
  assert.equal(cue.number,originalCue.number);
  assert.deepEqual(cue.actions,originalCue.actions);
  assert.deepEqual(cue.sourceLineIds,originalCue.sourceLineIds);
  assert.deepEqual(edited.proposals[0],beforeProposal);
  assert.equal(project.cues[0].trigger,undefined);
  assert.deepEqual(deserializeShowProject(serializeShowProject(edited)),edited);
});
test('metadata can be cleared and earlier JSON documents remain unchanged', () => {
  let project=fixture();
  const id=project.cues[0].id;
  const oldJson=serializeShowProject(project);
  assert.deepEqual(deserializeShowProject(oldJson),project);
  project=updateCueOperatorDetails(project,id,{label:'Bell',trigger:'Door closes',notes:'Open wings'});
  const cleared=updateCueOperatorDetails(project,id,{label:'Bell',trigger:'  ',notes:''});
  assert.equal(cleared.cues[0].trigger,undefined);
  assert.equal(cleared.cues[0].notes,undefined);
  assert.deepEqual(normalizeShowProject(cleared),cleared);
});
test('cue metadata rejects invalid fields, nonexistent cues and injected project keys', () => {
  const project=fixture();
  const id=project.cues[0].id;
  assert.throws(()=>updateCueOperatorDetails(project,'cue-does-not-exist',{label:'Test'}));
  assert.throws(()=>updateCueOperatorDetails(project,id,{label:'  '}));
  assert.throws(()=>updateCueOperatorDetails(project,id,{label:'A',notes:'x'.repeat(1501)}));
  assert.throws(()=>updateCueOperatorDetails(project,id,{label:'A',trigger:'x'.repeat(301)}));
  assert.throws(()=>normalizeShowProject({
    ...project,cues:project.cues.map(cue=>({...cue,notes:'\u0000'})),
  }));
});
