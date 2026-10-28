import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeV1EventsToScenicV2 as bridge} from '../src/core/scenicV1Bridge.mjs';

const scriptText = [
  'Scene one', 'SOUND: play recording', 'SOUND: continue bed',
  'SOUND: stop recording', 'Enter silent sequence', 'New scene: wind starts',
].join('\n');
const event=(lineId,transport,cueKind='MUSIC')=>({lineId,transport,cueKind,basis:'EXPLICIT'});

test('V1 PLAY produces an unapproved placeholder, never an executable cue',()=>{
  const report=bridge({scriptText,events:[event('L2','PLAY')]});
  assert.equal(report.status,'ADVISORY_ONLY');
  assert.equal(report.items[0].disposition,'EXECUTABLE_ACTION');
  assert.equal(report.items[0].operation.type,'PLAY_PROPOSAL');
  assert.equal(report.items[0].approvalStatus,'PENDING_OPERATOR_REVIEW');
});
test('V1 CONTINUE without operator binding cannot invent cue identity',()=>{
  const [item]=bridge({scriptText,events:[event('L3','CONTINUE')]}).items;
  assert.equal(item.disposition,'OPERATOR_SUGGESTION');
  assert.equal(item.sourceCueId,null);
  assert.equal(item.operation,null);
});
test('operator-bound unchanged CONTINUE becomes information only',()=>{
  const [item]=bridge({scriptText,events:[event('L3','CONTINUE')],
    operatorBindings:{L3:{sourceCueId:'music-1',change:'NONE'}}}).items;
  assert.equal(item.disposition,'SCRIPT_NOTE');
  assert.equal(item.operation,null);
});
test('operator-bound fade CONTINUE remains inert action metadata',()=>{
  const [item]=bridge({scriptText,events:[event('L3','CONTINUE')],
    operatorBindings:{L3:{sourceCueId:'music-1',change:'FADE'}}}).items;
  assert.equal(item.operation.type,'CONFIGURE_PLAYBACK');
  assert.equal(item.approvalStatus,'PENDING_OPERATOR_REVIEW');
});
test('V1 STOP with no cue identity is suggestion, not STOP ALL',()=>{
  const [item]=bridge({scriptText,events:[event('L4','STOP')]}).items;
  assert.equal(item.disposition,'OPERATOR_SUGGESTION');
  assert.equal(item.operation,null);
});
test('STOP with a named cue but unknown playback state still needs review',()=>{
  const [item]=bridge({scriptText,events:[event('L4','STOP')],
    operatorBindings:{L4:{sourceCueId:'loop-1'}}}).items;
  assert.equal(item.disposition,'OPERATOR_SUGGESTION');
  assert.equal(item.operation,null);
});
test('operator-verified ended one-shot creates no STOP action',()=>{
  const [item]=bridge({scriptText,events:[event('L4','STOP')],
    operatorBindings:{L4:{sourceCueId:'boing',playbackMode:'ONE_SHOT',playbackState:'ENDED'}}}).items;
  assert.equal(item.disposition,'SCRIPT_NOTE');
  assert.equal(item.operation,null);
});
test('SILENCE is non-executing unless operator selects explicit playback targets',()=>{
  const e=event('L5','SILENCE','SILENCE');
  assert.equal(bridge({scriptText,events:[e]}).items[0].disposition,'SCRIPT_NOTE');
  const [selected]=bridge({scriptText,events:[e],
    operatorBindings:{L5:{requestAction:true,targetCueIds:['track-1']}}}).items;
  assert.deepEqual(selected.operation.targetCueIds,['track-1']);
  assert.notEqual(selected.operation.type,'STOP_ALL');
  assert.equal(selected.approvalStatus,'PENDING_OPERATOR_REVIEW');
});
test('strict line, kind, basis and field validation rejects untrusted provider extras',()=>{
  for(const e of [
    {...event('L2','PLAY'),sourceLineId:'L3'},
    event('L99','PLAY'),
    {...event('L2','PLAY'),basis:'HUMAN_APPROVED'},
    {...event('L2','PLAY'),unexpected:'STOP_ALL'},
    event('L5','SILENCE','FX'),
  ]) assert.throws(()=>bridge({scriptText,events:[e]}));
});
test('operator bindings cannot introduce invalid or unknown references',()=>{
  assert.throws(()=>bridge({scriptText,events:[],operatorBindings:{L99:{sourceCueId:'foo'}}}));
  assert.throws(()=>bridge({scriptText,events:[event('L4','STOP')],operatorBindings:{L4:{targetCueIds:['a']}}}));
});
test('V1 sourceLineId alias preserves line and SUGGESTED basis without approval',()=>{
  const [item]=bridge({scriptText,events:[{sourceLineId:'L2',transport:'PLAY',cueKind:'FX',basis:'SUGGESTED'}]}).items;
  assert.equal(item.lineId,'L2');
  assert.equal(item.basis,'SUGGESTED');
  assert.equal(item.approvalStatus,'PENDING_OPERATOR_REVIEW');
});
test('empty events are safe and no inferred transitions are manufactured',()=>{
  const result=bridge({scriptText,events:[]});
  assert.deepEqual(result.items,[]);
  assert.equal(result.requiresOperatorReview,true);
});
