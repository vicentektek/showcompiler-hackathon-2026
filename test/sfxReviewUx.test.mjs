import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCommitReviewedSfx,nextSfxVariationSeed,assessSfxPrompt,
} from '../src/sfx/lab.mjs';

const reviewed=()=>({
  status:'READY_FOR_REVIEW',requestId:'req-1',loadedId:'req-1',
  auditionedId:'req-1',sourceOrigin:'remote',hasBytes:true,hasImporter:true,
});
test('only loaded and played generated WAV may be saved in one operator action',()=>{
  assert.equal(canCommitReviewedSfx(reviewed()),true);
  assert.equal(canCommitReviewedSfx({...reviewed(),status:'ACCEPTED_FOR_MANUAL_IMPORT'}),true);
  for(const status of ['QUEUED','RUNNING','FAILED','REJECTED','SUBMISSION_UNKNOWN']){
    assert.equal(canCommitReviewedSfx({...reviewed(),status}),false,status);
  }
  assert.equal(canCommitReviewedSfx({...reviewed(),auditionedId:null}),false);
  assert.equal(canCommitReviewedSfx({...reviewed(),loadedId:'req-another'}),false);
  assert.equal(canCommitReviewedSfx({...reviewed(),sourceOrigin:'local'}),false);
  assert.equal(canCommitReviewedSfx({...reviewed(),hasBytes:false}),false);
  assert.equal(canCommitReviewedSfx({...reviewed(),hasImporter:false}),false);
  assert.equal(canCommitReviewedSfx({...reviewed(),requestId:''}),false);
});
test('another variation changes valid seed without issuing generation',()=>{
  assert.equal(nextSfxVariationSeed(42),43);
  assert.equal(nextSfxVariationSeed(2147483647),0);
  assert.equal(nextSfxVariationSeed('not-a-seed'),42);
  assert.equal(nextSfxVariationSeed(-1),42);
});
test('SFX prompt advice is non-generative and detects common quality pitfalls',()=>{
  assert.match(assessSfxPrompt('Una campana suena en el teatro',4),/inglés/);
  assert.match(assessSfxPrompt('A bell rings',3),/fuente/);
  assert.match(assessSfxPrompt('A heavy wooden door slams once and then a distant bell rings with a long echo',5),/varios momentos/);
  assert.match(assessSfxPrompt('A single heavy bronze bell strike recorded close, with natural decay and a deep metallic resonance',12),/2–4/);
  assert.match(assessSfxPrompt('A single heavy bronze bell strike recorded close, with natural decay and a deep metallic resonance',3),/semilla/);
});
