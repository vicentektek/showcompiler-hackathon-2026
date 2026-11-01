import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveStudioEditShortcut} from '../src/core/studioShortcuts.mjs';

const shortcut=(code,overrides={})=>({
  code,key:code.startsWith('Arrow')?code:code.slice(3),keyCode:0,
  altKey:true,shiftKey:true,ctrlKey:false,metaKey:false,
  repeat:false,isComposing:false,defaultPrevented:false,target:{closest:()=>null},
  ...overrides,
});

test('Studio edit shortcuts map to existing cue controls only in Cue Editor',()=>{
  assert.equal(resolveStudioEditShortcut(shortcut('KeyA'),'cues'),'cueAddBtn');
  assert.equal(resolveStudioEditShortcut(shortcut('KeyI'),'cues'),'cueInsertBtn');
  assert.equal(resolveStudioEditShortcut(shortcut('KeyD'),'cues'),'cueDuplicateBtn');
  assert.equal(resolveStudioEditShortcut(shortcut('ArrowUp'),'cues'),'cueMoveUpBtn');
  assert.equal(resolveStudioEditShortcut(shortcut('ArrowDown'),'cues'),'cueMoveDownBtn');
  assert.equal(resolveStudioEditShortcut(shortcut('KeyA'),'script'),null);
  assert.equal(resolveStudioEditShortcut(shortcut('KeyA'),'operation'),null);
});

test('Studio edit shortcuts ignore text fields, buttons, modifiers, repeats and handled events',()=>{
  assert.equal(resolveStudioEditShortcut(shortcut('KeyA',{target:{closest:()=>({})}}),'cues'),null);
  for(const override of [
    {altKey:false},{shiftKey:false},{ctrlKey:true},{metaKey:true},{repeat:true},
    {isComposing:true},{keyCode:229},{defaultPrevented:true},
  ])assert.equal(resolveStudioEditShortcut(shortcut('KeyA',override),'cues'),null);
  assert.equal(resolveStudioEditShortcut(shortcut('KeyX'),'cues'),null);
});
