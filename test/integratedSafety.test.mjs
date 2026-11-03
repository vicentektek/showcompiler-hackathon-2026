import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserAudioEngine } from '../src/core/browserAudio.mjs';
import { updateCueAutomation } from '../src/core/workspace.mjs';
import { exportPortableShow, importPortableShow } from '../src/core/showArchive.mjs';
import { buildDemoPackage } from '../src/core/demoShow.mjs';

function rig() {
  const history = { sources: [], started: [], ended: [] };
  let resume = async () => {};
  const context = {
    currentTime: 1, state: 'running', destination: {},
    resume: () => resume(),
    decodeAudioData: async () => ({ duration: 2, numberOfChannels: 1 }),
    createGain() {
      const gain = { value: 1, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; },
        linearRampToValueAtTime(v) { this.value = v; } };
      return { gain, connect() {}, disconnect() {} };
    },
    createBufferSource() {
      const source = { onended: null, connect() {}, disconnect() {},
        start() { history.started.push(this); }, stop() {},
        end() { this.onended?.(); } };
      history.sources.push(source);
      return source;
    },
  };
  const engine = new BrowserAudioEngine({
    contextFactory: () => context,
    onCueNaturalEnd: id => history.ended.push(id),
  });
  const cue = (id, n = 1) => ({ id, status: 'DRAFT',
    actions: Array.from({ length: n }, () => ({ type: 'PLAY', assetId: 'audio' })) });
  function deferResume() {
    let resolve;
    resume = () => new Promise(done => { resolve = done; });
    return () => resolve();
  }
  return { engine, history, cue, deferResume, file: {
    name: 'audio.wav', size: 48, arrayBuffer: async () => new ArrayBuffer(48),
  } };
}

test('merged pending per-cue STOP blocks a late AudioContext resume', async () => {
  const r = rig();
  await r.engine.loadFile(r.file, 'audio');
  const release = r.deferResume();
  const pending = r.engine.go(r.cue('a'));
  assert.equal(r.engine.stopCue('a'), true);
  release();
  await assert.rejects(pending, /cancelado/i);
  assert.equal(r.history.started.length, 0);
  assert.deepEqual(r.history.ended, []);
});

test('merged STOP ALL invalidates the pending GO across resume', async () => {
  const r = rig();
  await r.engine.loadFile(r.file, 'audio');
  const release = r.deferResume();
  const pending = r.engine.go(r.cue('a'));
  r.engine.stopAll();
  release();
  await assert.rejects(pending, /cancelado/i);
  assert.equal(r.history.started.length, 0);
  assert.deepEqual(r.history.ended, []);
});

test('merged natural-end callback happens only after all voices and only once', async () => {
  const r = rig();
  await r.engine.loadFile(r.file, 'audio');
  await r.engine.go(r.cue('a', 2));
  r.history.sources[0].end();
  assert.deepEqual(r.history.ended, []);
  r.history.sources[1].end();
  r.history.sources[1].end();
  assert.deepEqual(r.history.ended, ['a']);
});

test('STOP with fade cancels natural-end for one cue but not a second sharing its asset', async () => {
  const r = rig();
  await r.engine.loadFile(r.file, 'audio');
  await r.engine.go(r.cue('a'));
  await r.engine.go(r.cue('b'));
  assert.equal(r.engine.stopCue('a', 400), true);
  r.history.sources[0].end();
  assert.deepEqual(r.history.ended, []);
  assert.equal(r.engine.isPlaying('b'), true);
  r.history.sources[1].end();
  assert.deepEqual(r.history.ended, ['b']);
});

test('complete ZIP preserves operator automation while keeping GO manual', async () => {
  const sample = await buildDemoPackage();
  const extracted = await importPortableShow(sample.archive);
  const cueId = extracted.project.cues[0].id;
  const project = updateCueAutomation(extracted.project, cueId,
    { mode: 'AUTO_CONTINUE', delayMs: 750, fadeInMs: 100 });
  const files = new Map(extracted.audioFiles.map(({ assetId, name, bytes }) =>
    [assetId, { name, size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer }]));
  const restored = await importPortableShow(await exportPortableShow(project, files));
  assert.deepEqual(restored.project.cues[0].automation, {
    mode: 'AUTO_CONTINUE', delayMs: 750, fadeInMs: 100,
    fadeOutMs: 0, loop: false, stopCueIds: [],
  });
  assert.equal(restored.audioFiles.length, 3);
  assert.deepEqual(restored.project.cues.map(c => c.sourceLineIds),
    project.cues.map(c => c.sourceLineIds));
});
