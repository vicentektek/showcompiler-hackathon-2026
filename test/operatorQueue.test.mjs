import test from 'node:test';
import assert from 'node:assert/strict';
import { newOperatorQueue, prepareOperatorCue, completePreparedCue, skipPreparedCue, isCuePrepared } from '../src/core/operatorQueue.mjs';

const cues=[{id:'cue-1'},{id:'cue-2'},{id:'cue-3'}];
test('preparing one cue never plays audio or marks it complete', () => {
  const first = newOperatorQueue();
  const prepared = prepareOperatorCue(first,cues,'cue-2');
  assert.equal(first.preparedCueId,null);
  assert.equal(prepared.preparedCueId,'cue-2');
  assert.deepEqual(prepared.completedCueIds,[]);
  assert.equal(isCuePrepared(prepared,'cue-2'),true);
  assert.equal(isCuePrepared(prepared,'cue-1'),false);
});
test('GO completion advances by stable ID to next cue and ends after last', () => {
  let state=prepareOperatorCue(newOperatorQueue(),cues,'cue-1');
  state=completePreparedCue(state,cues,'cue-1');
  assert.equal(state.preparedCueId,'cue-2');
  assert.deepEqual(state.completedCueIds,['cue-1']);
  state=completePreparedCue(state,cues,'cue-2');
  assert.equal(state.preparedCueId,'cue-3');
  state=completePreparedCue(state,cues,'cue-3');
  assert.equal(state.preparedCueId,null);
  assert.deepEqual(state.completedCueIds,['cue-1','cue-2','cue-3']);
});
test('skipping never marks a cue completed and requires preparation', () => {
  assert.throws(()=>skipPreparedCue(newOperatorQueue(),cues),/No prepared/);
  let state=prepareOperatorCue(newOperatorQueue(),cues,'cue-1');
  state=skipPreparedCue(state,cues);
  assert.deepEqual(state.skippedCueIds,['cue-1']);
  assert.deepEqual(state.completedCueIds,[]);
  assert.equal(state.preparedCueId,'cue-2');
  state=prepareOperatorCue(state,cues,'cue-1');
  state=completePreparedCue(state,cues,'cue-1');
  assert.deepEqual(state.skippedCueIds,[]);
  assert.deepEqual(state.completedCueIds,['cue-1']);
});
test('invalid or stale prepared references reject safely', () => {
  const state=newOperatorQueue();
  assert.throws(()=>prepareOperatorCue(state,cues,'nonexistent'),/Unknown cue/);
  assert.throws(()=>completePreparedCue(state,cues,'cue-1'),/not prepared/);
  assert.throws(()=>prepareOperatorCue(state,null,'cue-1'),/Invalid cue sequence/);
});
