import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCueAutomationPlan } from '../src/core/cueAutomation.mjs';
import { createCueAutomationRuntime } from '../src/core/cueAutomationRuntime.mjs';

function fixture(cues) {
  const calls = [], timers = new Map();
  let next = 0;
  const transport = {
    async go(id) { calls.push('GO ' + id); },
    stopCue(id) { calls.push('STOP ' + id); return true; },
    stopAll() { calls.push('STOP ALL'); },
  };
  const runtime = createCueAutomationRuntime({
    plan: validateCueAutomationPlan(cues), transport,
    schedule(fn, delay) { const token = ++next; timers.set(token, { fn, delay }); return token; },
    cancel(token) { timers.delete(token); },
  });
  async function tick() {
    const tasks = [...timers.values()];
    timers.clear();
    for (const task of tasks) task.fn();
    await new Promise(resolve => setImmediate(resolve));
  }
  return { runtime, calls, timers, tick };
}
test('manual GO does not advance automatically', async () => {
  const f = fixture([{id:'a'}, {id:'b'}]);
  await f.runtime.go('a');
  f.runtime.endedNaturally('a');
  await f.tick();
  assert.deepEqual(f.calls, ['GO a']);
});
test('AUTO_CONTINUE schedules next after successful GO', async () => {
  const f = fixture([{id:'a',automation:{mode:'AUTO_CONTINUE',delayMs:400}}, {id:'b'}]);
  await f.runtime.go('a');
  assert.equal([...f.timers.values()][0].delay,400);
  await f.tick();
  assert.deepEqual(f.calls, ['GO a','GO b']);
});
test('AUTO_FOLLOW waits for natural end, not STOP', async () => {
  const cues=[{id:'a',automation:{mode:'AUTO_FOLLOW',delayMs:200}}, {id:'b'}];
  const f=fixture(cues);
  await f.runtime.go('a');
  assert.equal(f.timers.size,0);
  f.runtime.stopCue('a');
  assert.equal(f.runtime.endedNaturally('a'),false);
  await f.tick();
  assert.deepEqual(f.calls,['GO a','STOP a']);
  await f.runtime.go('a');
  assert.equal(f.runtime.endedNaturally('a'),true);
  assert.equal([...f.timers.values()][0].delay,200);
  await f.tick();
  assert.deepEqual(f.calls,['GO a','STOP a','GO a','GO b']);
});
test('STOP ALL cancels scheduled follows and silences transport', async () => {
  const f=fixture([{id:'a',automation:{mode:'AUTO_CONTINUE'}}, {id:'b'}]);
  await f.runtime.go('a');
  f.runtime.cancelAll();
  await f.tick();
  assert.deepEqual(f.calls,['GO a','STOP ALL']);
  assert.deepEqual(f.runtime.getStatus().pendingFollowCueIds,[]);
});
test('stop-other cancels a pending automatic follow from stopped cue', async () => {
  const f=fixture([
    {id:'a',automation:{mode:'AUTO_CONTINUE',delayMs:100}},
    {id:'b',automation:{stopCueIds:['a']}},
    {id:'c'},
  ]);
  await f.runtime.go('a');
  await f.runtime.go('b');
  await f.tick();
  assert.deepEqual(f.calls,['GO a','STOP a','GO b']);
});
test('dispose prevents subsequent GO and timers', async () => {
  const f=fixture([{id:'a',automation:{mode:'AUTO_CONTINUE'}},{id:'b'}]);
  await f.runtime.go('a');
  f.runtime.dispose();
  await f.tick();
  assert.deepEqual(f.calls,['GO a','STOP ALL']);
  await assert.rejects(f.runtime.go('b'),/disposed/);
});
test('failed transport GO never schedules follow', async () => {
  const plan=validateCueAutomationPlan([{id:'a',automation:{mode:'AUTO_CONTINUE'}},{id:'b'}]);
  let schedules=0;
  const runtime=createCueAutomationRuntime({
    plan, transport:{go:async()=>{throw Error('device error');},stopCue:()=>true,stopAll:()=>{}},
    schedule:()=>{schedules++;return 1;},cancel:()=>{},
  });
  await assert.rejects(runtime.go('a'),/device error/);
  assert.equal(schedules,0);
  assert.deepEqual(runtime.getStatus().activeCueIds,[]);
});
