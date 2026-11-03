import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCueAutomation, validateCueAutomationPlan, planCueGo } from '../src/core/cueAutomation.mjs';

test('manual automation is safe and has no implicit follow', () => {
  const a = normalizeCueAutomation();
  assert.deepEqual(a, { mode:'MANUAL', delayMs:0, fadeInMs:0, fadeOutMs:0, loop:false, stopCueIds:[] });
  assert.ok(Object.isFrozen(a));
  assert.ok(Object.isFrozen(a.stopCueIds));
});
test('GO planning stops named cues before starting and delays AUTO_CONTINUE from GO', () => {
  const plan = validateCueAutomationPlan([
    { id:'intro', automation:{} },
    { id:'music', automation:{ mode:'AUTO_CONTINUE', delayMs:1500, fadeInMs:800, loop:true, stopCueIds:['intro'] } },
    { id:'effect', automation:{} },
  ]);
  assert.deepEqual(planCueGo(plan, 'music'), {
    cueId:'music', stopFirst:['intro'], fadeInMs:800, fadeOutMs:0, loop:true,
    nextCueId:'effect', trigger:'AFTER_GO', delayMs:1500,
  });
});
test('AUTO_FOLLOW waits for natural completion and applies delay afterward', () => {
  const plan = validateCueAutomationPlan([
    { id:'one', automation:{ mode:'AUTO_FOLLOW', delayMs:250, fadeOutMs:300 } },
    { id:'two', automation:{} },
  ]);
  const command = planCueGo(plan, 'one');
  assert.equal(command.trigger, 'ON_NATURAL_END');
  assert.equal(command.delayMs, 250);
  assert.equal(command.nextCueId, 'two');
  assert.equal(command.fadeOutMs, 300);
});
test('refuses unsafe references, self stop, duplicates and missing next cue', () => {
  assert.throws(() => validateCueAutomationPlan([{id:'a',automation:{stopCueIds:['a']}}]), /itself/);
  assert.throws(() => validateCueAutomationPlan([{id:'a',automation:{stopCueIds:['missing']}}]), /not in show/);
  assert.throws(() => validateCueAutomationPlan([{id:'a'}, {id:'a'}]), /duplicate/);
  assert.throws(() => validateCueAutomationPlan([{id:'last',automation:{mode:'AUTO_CONTINUE'}}]), /no next/);
});
test('refuses looped AUTO_FOLLOW and invalid time and unrecognized actions', () => {
  assert.throws(() => validateCueAutomationPlan([{id:'a',automation:{mode:'AUTO_FOLLOW',loop:true}}, {id:'b'}]), /loop/);
  assert.throws(() => normalizeCueAutomation({mode:'MANUAL',delayMs:100}), /MANUAL/);
  assert.throws(() => normalizeCueAutomation({fadeInMs:-1}), /fadeInMs/);
  assert.throws(() => normalizeCueAutomation({fadeOutMs:60001}), /fadeOutMs/);
  assert.throws(() => normalizeCueAutomation({loop:1}), /boolean/);
  assert.throws(() => normalizeCueAutomation({stopCueIds:['a','a']}), /duplicate/);
  assert.throws(() => normalizeCueAutomation({autoGo:true}), /unknown field/);
  assert.throws(() => planCueGo([], 'missing'), /missing/);
});
test('pure planner does not mutate cue inputs or perform playback', () => {
  const cues=[{id:'a',automation:{mode:'AUTO_CONTINUE',delayMs:0}}, {id:'b'}];
  const before=JSON.stringify(cues);
  const plan=validateCueAutomationPlan(cues);
  assert.equal(JSON.stringify(cues),before);
  assert.equal(planCueGo(plan,'a').trigger,'AFTER_GO');
});
