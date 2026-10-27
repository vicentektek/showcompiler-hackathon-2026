import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileOperatorQueueAfterEdit } from '../src/core/operatorQueue.mjs';

const cues=ids=>ids.map((id,i)=>({id,number:i+1}));
test('insert and reorder preserve NEXT by stable ID, independently from selected cue',()=>{
  const original=cues(['a','b','c']);
  const queue={preparedCueId:'c',completedCueIds:['a'],skippedCueIds:['b']};
  const next=reconcileOperatorQueueAfterEdit(queue,original,cues(['a','new','c','b']));
  assert.equal(next.preparedCueId,'c');
  assert.deepEqual(next.completedCueIds,['a']);
  assert.deepEqual(next.skippedCueIds,['b']);
  assert.equal(queue.preparedCueId,'c');
});
test('removing NEXT selects former successor position safely, with no GO',()=>{
  const queue={preparedCueId:'b',completedCueIds:[],skippedCueIds:[]};
  assert.equal(reconcileOperatorQueueAfterEdit(queue,cues(['a','b','c']),cues(['a','c'])).preparedCueId,'c');
  assert.equal(reconcileOperatorQueueAfterEdit(queue,cues(['a','b']),cues(['a'])).preparedCueId,'a');
});
test('starting from empty, completed and removing all cues are deterministic',()=>{
  const blank={preparedCueId:null,completedCueIds:[],skippedCueIds:[]};
  assert.equal(reconcileOperatorQueueAfterEdit(blank,[],cues(['x'])).preparedCueId,'x');
  assert.equal(reconcileOperatorQueueAfterEdit(blank,cues(['x']),cues(['x','y'])).preparedCueId,null);
  assert.deepEqual(reconcileOperatorQueueAfterEdit({
    preparedCueId:'x',completedCueIds:['x'],skippedCueIds:[],
  },cues(['x']),[]),blank);
});
