import test from 'node:test';
import assert from 'node:assert/strict';
import {createSfxResultWatcher} from '../src/sfx/lab.mjs';

function fixture(check) {
  const timers = [], stops = [];
  let time = 0;
  const watcher = createSfxResultWatcher({check,
    onStop: (...args) => stops.push(args),
    now: () => time,
    schedule: (fn, delay) => {const timer = {fn, at: time + delay}; timers.push(timer); return timer;},
    unschedule: timer => {const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1);},
  });
  return {watcher, timers, stops,
    async next() {timers.sort((a,b) => a.at-b.at); const timer = timers.shift(); time = timer.at; await timer.fn();}};
}
test('result tracking is opt-in, completes without overlapping or repeating starts', async () => {
  let checks = 0;
  const f = fixture(async () => ++checks === 2);
  assert.equal(checks, 0);
  f.watcher.start(); f.watcher.start();
  await Promise.resolve(); await f.next();
  assert.equal(checks, 2);
  assert.equal(f.watcher.active, false);
  assert.equal(f.stops[0][0], 'complete');
  assert.equal(f.timers.length, 0);
});
test('tracking stops at 24 checks and two minutes', async () => {
  let checks = 0;
  const f = fixture(async () => {checks++; return false;});
  f.watcher.start(); await Promise.resolve();
  while (f.timers.length) await f.next();
  assert.equal(checks, 24);
  assert.equal(f.stops[0][0], 'limit');
});
test('tracking errors stop explicitly without retries', async () => {
  const error = new Error('Unavailable');
  const f = fixture(async () => {throw error;});
  f.watcher.start(); await Promise.resolve();
  assert.deepEqual(f.stops, [['error', error]]);
  assert.equal(f.timers.length, 0);
});
test('cancellation aborts pending checks and fences late results', async () => {
  let finish, signal;
  const f = fixture(s => {signal = s; return new Promise(resolve => {finish = resolve;});});
  f.watcher.start(); f.watcher.stop('stop_all');
  assert.equal(signal.aborted, true);
  finish(true); await Promise.resolve();
  assert.equal(f.stops.length, 1);
  assert.equal(f.timers.length, 0);
});
test('two-minute deadline aborts a hung check rather than waiting indefinitely', async () => {
  let finish, signal;
  const f = fixture(s => {signal = s; return new Promise(resolve => {finish = resolve;});});
  f.watcher.start(); await f.next();
  assert.equal(signal.aborted, true);
  assert.equal(f.watcher.active, false);
  assert.equal(f.stops[0][0], 'limit');
  finish(false); await Promise.resolve();
  assert.equal(f.timers.length, 0);
});
