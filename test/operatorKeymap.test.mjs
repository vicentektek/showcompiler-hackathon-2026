import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATOR_KEY_CHOICES, DEFAULT_OPERATOR_KEYMAP,
  normalizeOperatorKeymap, decideOperatorShortcut,
} from '../src/core/operatorKeymap.mjs';

const mock=(code,overrides={})=>({
  code,key:code==='Space'?' ':code,
  repeat:false,isComposing:false,altKey:false,ctrlKey:false,metaKey:false,
  shiftKey:false,defaultPrevented:false,keyCode:0,
  target:{closest:()=>null,isContentEditable:false},
  ...overrides,
});
test('default: Space GO in Cue Editor and Operation, not elsewhere',()=>{
  const p=DEFAULT_OPERATOR_KEYMAP;
  assert.equal(p.go,'Space');assert.equal(p.stopAll,'None');
  for(const scope of ['cues','operation'])
    assert.equal(decideOperatorShortcut(mock('Space'),p,scope),'GO');
  for(const scope of ['home','audio','setup','script','ai','rehearsal'])
    assert.equal(decideOperatorShortcut(mock('Space'),p,scope),null);
});
test('keyboard input/editor/menu, modifiers, repeat, IME, modal and handled events cannot fire GO',()=>{
  const p=DEFAULT_OPERATOR_KEYMAP;
  for(const override of [
    {repeat:true},{isComposing:true},{keyCode:229},
    {altKey:true},{ctrlKey:true},{metaKey:true},{shiftKey:true},
    {defaultPrevented:true},{inModal:true},
    {target:{closest:selector=>selector==='[data-cue-select]'?null:{tagName:'INPUT'}}},
    {target:{closest:selector=>selector==='[data-cue-select]'?null:{tagName:'BUTTON'}}},
    {target:{closest:selector=>selector==='[data-cue-select]'?null:{tagName:'SELECT'}}},
    {target:{closest:()=>null,isContentEditable:true}},
  ]){
    assert.equal(decideOperatorShortcut(mock('Space',override),p,'cues'),null);
  }
});
test('focused cue row is an intentional Space GO surface; ordinary focused buttons are not',()=>{
  const row={closest:selector=>selector==='[data-cue-select]'?{}:selector.startsWith('input')?{}:null};
  assert.equal(decideOperatorShortcut(mock('Space',{target:row}),
    DEFAULT_OPERATOR_KEYMAP,'cues'),'GO');
  const input={closest:selector=>selector.startsWith('input')?{}:null};
  assert.equal(decideOperatorShortcut(mock('Space',{target:input}),
    DEFAULT_OPERATOR_KEYMAP,'cues'),null);
});
test('Enter always selects a focused cue row and cannot trigger mapped GO',()=>{
  const row={closest:selector=>selector==='[data-cue-select]'?{}:null};
  const map={...DEFAULT_OPERATOR_KEYMAP,go:'Enter'};
  assert.equal(decideOperatorShortcut(mock('Enter',{target:row}),map,'cues'),null);
  assert.equal(decideOperatorShortcut(mock('Enter'),map,'cues'),'GO');
  assert.equal(decideOperatorShortcut(mock('Space',{target:row}),{...map,go:'Space'},'cues'),'GO');
});
test('settings can disable one/both contexts and GO mapping without changing show',()=>{
  const p={...DEFAULT_OPERATOR_KEYMAP,inEditor:false};
  assert.equal(decideOperatorShortcut(mock('Space'),p,'cues'),null);
  assert.equal(decideOperatorShortcut(mock('Space'),p,'operation'),'GO');
  assert.equal(decideOperatorShortcut(mock('Space'),{...p,enabled:false},'operation'),null);
  assert.equal(decideOperatorShortcut(mock('KeyG'),{...p,go:'KeyG'},'operation'),'GO');
  assert.equal(decideOperatorShortcut(mock('Space'),{...p,go:'KeyG'},'operation'),null);
  assert.equal(decideOperatorShortcut(mock('Space'),{...p,go:'None'},'operation'),null);
});
test('emergency STOP ALL only with explicit separate assignment and active workspace',()=>{
  const p={...DEFAULT_OPERATOR_KEYMAP,stopAll:'Escape'};
  assert.equal(decideOperatorShortcut(mock('Escape'),p,'operation'),'STOP_ALL');
  assert.equal(decideOperatorShortcut(mock('Escape'),p,'cues'),'STOP_ALL');
  assert.equal(decideOperatorShortcut(mock('Escape'),p,'setup'),null);
  assert.equal(decideOperatorShortcut(mock('Escape',{target:{closest:selector=>selector==='[data-cue-select]'?null:{}}}),p,'operation'),null);
});
test('storage normalization refuses unsupported codes, null, conflicts and invalid version',()=>{
  assert.equal(OPERATOR_KEY_CHOICES.includes('Space'),true);
  assert.deepEqual(normalizeOperatorKeymap(null),{...DEFAULT_OPERATOR_KEYMAP});
  assert.deepEqual(normalizeOperatorKeymap({version:99,go:'Escape'}),{...DEFAULT_OPERATOR_KEYMAP});
  assert.equal(normalizeOperatorKeymap({version:1,go:'Ctrl+Alt+Delete'}).go,'Space');
  assert.equal(normalizeOperatorKeymap({version:1,go:'F8',stopAll:'F8'}).stopAll,'None');
  assert.equal(normalizeOperatorKeymap({version:1,enabled:false,inEditor:false}).enabled,false);
});
