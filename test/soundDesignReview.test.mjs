import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCuePlayback} from '../src/core/cuePlayback.mjs';
import {normalizeCueEntryPolicy} from '../src/core/cueEntryPolicy.mjs';

test('reviewed sound design settings normalize into real cue playback properties',()=>{
  const playback=normalizeCuePlayback({
    gainDb:-8,fadeInMs:200,fadeOutMs:1500,loop:false,
  });
  const entry=normalizeCueEntryPolicy({mode:'STOP_PREVIOUS',fadeOutMs:2000});
  assert.equal(playback.gainDb,-8);
  assert.equal(playback.fadeInMs,200);
  assert.equal(playback.fadeOutMs,1500);
  assert.equal(playback.loop,false);
  assert.equal(entry.mode,'STOP_PREVIOUS');
  assert.equal(entry.fadeOutMs,2000);
});

test('loop must not silently carry an end fade and invalid gain is rejected',()=>{
  assert.throws(()=>normalizeCuePlayback({loop:true,fadeOutMs:2000}),/looping playback/);
  assert.throws(()=>normalizeCuePlayback({gainDb:3}),/gainDb/);
  assert.throws(()=>normalizeCueEntryPolicy({mode:'UNKNOWN',fadeOutMs:0}),/Invalid cue/);
});

test('overlap remains the conservative entry policy until explicitly reviewed',()=>{
  const entry=normalizeCueEntryPolicy();
  assert.equal(entry.mode,'OVERLAP');
  assert.equal(entry.fadeOutMs,0);
});
