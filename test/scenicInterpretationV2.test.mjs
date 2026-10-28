import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretScenicObservations as evaluate, SCENIC_DISPOSITIONS as D } from '../src/core/scenicInterpretationV2.mjs';

const scriptText = [
  'SCENE 1 — sound check',
  'SOUND 1: play a short recorded boing once.',
  'The boing has ended naturally.',
  'SOUND 1: stop the recorded boing.',
  'SOUND 2: maintain the recorded music under dialogue.',
  'SOUND 2: fade the music to a lower level.',
  'SCENE 2 — enter the wind.',
  'Bring in the wind; previous music exit unspecified.',
  'All sound is silent for the knife act.',
  'Operator may stop selected playback cues.',
].join('\n');
const run = (...observations) => evaluate({scriptText,observations}).items;

test('finished one-shot STOP is a note, not transport', () => {
  const [item] = run({lineId:'L4',intent:'STOP',sourceCueId:'boing',playbackMode:'ONE_SHOT',playbackState:'ENDED'});
  assert.equal(item.disposition,D.NOTE);
  assert.equal(item.operation,null);
});
test('ongoing loop STOP remains selective and unapproved', () => {
  const [item] = run({lineId:'L4',intent:'STOP',sourceCueId:'loop',playbackMode:'LOOP',playbackState:'ACTIVE'});
  assert.equal(item.disposition,D.ACTION);
  assert.deepEqual(item.operation.targetCueIds,['loop']);
  assert.equal(item.approvalStatus,'PENDING_OPERATOR_REVIEW');
});
test('CONTINUE with unchanged state is informational', () => {
  const [item] = run({lineId:'L5',intent:'CONTINUE',sourceCueId:'music',change:'NONE'});
  assert.equal(item.disposition,D.NOTE);
  assert.equal(item.operation,null);
});
test('CONTINUE with fade is a configurable action, not auto fade', () => {
  const [item] = run({lineId:'L6',intent:'CONTINUE',sourceCueId:'music',change:'FADE'});
  assert.equal(item.disposition,D.ACTION);
  assert.deepEqual(item.operation,{type:'CONFIGURE_PLAYBACK',sourceCueId:'music',change:'FADE'});
});
test('unresolved CONTINUE is a suggestion, not a fabricated source', () => {
  const [item] = run({lineId:'L5',intent:'CONTINUE'});
  assert.equal(item.disposition,D.SUGGESTION);
});
test('new scene with unresolved existing playback proposes transition without STOP', () => {
  const [item] = run({lineId:'L8',intent:'TRANSITION',sourceCueId:'drum'});
  assert.equal(item.disposition,D.SUGGESTION);
  assert.equal(item.operation,null);
});
test('SILENCE as condition does not mute anything', () => {
  const [item] = run({lineId:'L9',intent:'SILENCE',cueKind:'SILENCE'});
  assert.equal(item.disposition,D.NOTE);
  assert.equal(item.operation,null);
});
test('SILENCE with action request but no targets requires operator clarification', () => {
  const [item] = run({lineId:'L9',intent:'SILENCE',requestAction:true});
  assert.equal(item.disposition,D.SUGGESTION);
  assert.equal(item.operation,null);
});
test('SILENCE with explicit targets is only an unapproved selective proposal', () => {
  const [item] = run({lineId:'L10',intent:'SILENCE',requestAction:true,targetCueIds:['a-1','a-2']});
  assert.equal(item.disposition,D.ACTION);
  assert.deepEqual(item.operation.targetCueIds,['a-1','a-2']);
  assert.equal(item.approvalStatus,'PENDING_OPERATOR_REVIEW');
  assert.notEqual(item.operation.type,'STOP_ALL');
});
test('PLAY observation does not manufacture a playable asset', () => {
  const [item] = run({lineId:'L2',intent:'PLAY',cueKind:'FX'});
  assert.equal(item.disposition,D.ACTION);
  assert.deepEqual(item.operation,{type:'PLAY_PROPOSAL',sourceCueId:null});
});
test('rejects fabricated Lxx references and unsafe field combinations', () => {
  assert.throws(()=>run({lineId:'L99',intent:'PLAY'}),/Unknown scenic source/);
  assert.throws(()=>run({lineId:'L5',intent:'CONTINUE',targetCueIds:['a']}),/Targets only/);
  assert.throws(()=>run({lineId:'L9',intent:'SILENCE',requestAction:true,targetCueIds:['a','a']}),/Invalid target/);
  assert.throws(()=>run({lineId:'L9',intent:'SILENCE',requestAction:true,targetCueIds:['MASTER']} , {lineId:'L8',intent:'PLAY',unexpected:'field'}),/Invalid scenic observation/);
});
test('empty list remains advisory with stable script references', () => {
  const result=evaluate({scriptText,observations:[]});
  assert.equal(result.status,'ADVISORY_ONLY');
  assert.equal(result.scriptLineCount,10);
  assert.deepEqual(result.items,[]);
});
