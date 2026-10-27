import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCuePlayback, DEFAULT_CUE_PLAYBACK } from '../src/core/cuePlayback.mjs';
import { BrowserAudioEngine } from '../src/core/browserAudio.mjs';
import { createNewShow, addAudioReference, addMockProposal, decideProposal, updateCuePlayback } from '../src/core/workspace.mjs';
import { serializeShowProject, deserializeShowProject } from '../src/core/projectPersistence.mjs';

function showWithCue() {
  let project = createNewShow({ id: 'playback-show', name: 'Sound design', scriptText: '(Music starts)\nEnd' });
  project = addAudioReference(project, 'sound.wav');
  project = addMockProposal(project, { lineId:'L1', assetId:'asset-1', label:'Intro music' });
  return decideProposal(project, 'proposal-1', 'APPROVE');
}

function audioFixture() {
  const actions = [];
  const sources = [];
  const gains = [];
  const ctx = {
    currentTime: 5, state: 'running', destination: {},
    resume: async () => {}, decodeAudioData: async () => ({ duration: 3, numberOfChannels: 1 }),
    createBufferSource() {
      const source = { buffer:null, loop:false, onended:null,
        connect() {}, disconnect() {},
        start(t) { actions.push(['start',t]); source.startTime=t; },
        stop(t) { actions.push(['stop',t]); source.stopTime=t; },
        end() { source.onended?.(); },
      };
      sources.push(source);
      return source;
    },
    createGain() {
      const param = { value:1, cancelScheduledValues(t){actions.push(['cancel',t]);},
        setValueAtTime(v,t){this.value=v;actions.push(['setGain',v,t]);},
        linearRampToValueAtTime(v,t){actions.push(['ramp',v,t]);} };
      const gain = { gain:param,connect(){},disconnect(){} };
      gains.push(gain);
      return gain;
    },
  };
  const ended = [];
  const engine = new BrowserAudioEngine({contextFactory:()=>ctx,onCueNaturalEnd:id=>ended.push(id)});
  const file = { name:'sound.wav',size:1000,arrayBuffer:async()=>new ArrayBuffer(1000) };
  const cue = (settings)=>({id:'cue-1',status:'DRAFT',actions:[{type:'PLAY',assetId:'asset-1'}],
    ...(settings===undefined?{}:{playback:settings})});
  return { engine,ctx,actions,sources,gains,ended,file,cue };
}

test('strict settings keep legacy levels and reject dangerous or ambiguous combinations', () => {
  assert.deepEqual(normalizeCuePlayback(),DEFAULT_CUE_PLAYBACK);
  for (const v of [
    { gainDb: 6 }, { gainDb: -61 }, { gainDb: NaN }, { repeatCount:0 },
    { repeatCount:21 }, { loop:true,repeatCount:2 }, { loop:true,fadeOutMs:100 },
    { fadeInMs:10001 }, { fadeOutMs:-1 }, { startDelayMs:1.1 },
    { unauthorized:true }, { __protoKey__:true },
  ]) assert.throws(()=>normalizeCuePlayback(v),/Invalid cue playback/);
});

test('operator playback survives JSON without modifying AI evidence or existing legacy shows', () => {
  const start=showWithCue();
  const before=serializeShowProject(start);
  const changed=updateCuePlayback(start,'cue-1',{
    gainDb:-9,fadeInMs:800,fadeOutMs:600,startDelayMs:450,repeatCount:3,
  });
  assert.deepEqual(changed.proposals,start.proposals);
  assert.equal(changed.cues[0].playback.repeatCount,3);
  assert.equal(start.cues[0].playback,undefined);
  assert.deepEqual(deserializeShowProject(serializeShowProject(changed)),changed);
  assert.deepEqual(deserializeShowProject(before),start);
  assert.throws(()=>updateCuePlayback(changed,'missing',{loop:true}),/playable audio/);
  assert.throws(()=>updateCuePlayback(changed,'cue-1',{gainDb:20}),/Invalid cue playback/);
  assert.throws(()=>updateCuePlayback(changed,'cue-1',{loop:true}),/Invalid cue playback/);
});

test('manual GO executes trim, delayed start and real fade-in and end fade-out', async () => {
  const x=audioFixture();
  await x.engine.loadFile(x.file,'asset-1');
  await x.engine.go(x.cue({gainDb:-6,fadeInMs:500,fadeOutMs:900,startDelayMs:1200}));
  const at=6.22;
  assert.equal(x.sources[0].startTime,at);
  assert.ok(Math.abs(x.gains[0].gain.value-0)<1e-9);
  assert.ok(x.actions.some(a=>a[0]==='ramp'&&Math.abs(a[1]-0.5*10**(-6/20))<1e-9&&Math.abs(a[2]-(at+0.5))<1e-9));
  assert.ok(x.actions.some(a=>a[0]==='ramp'&&a[1]===0&&Math.abs(a[2]-(at+3))<1e-9));
  x.sources[0].end();
  assert.deepEqual(x.ended,['cue-1']);
});

test('finite repeats stop exactly at last natural duration and loop runs until manual stop', async () => {
  const x=audioFixture();
  await x.engine.loadFile(x.file,'asset-1');
  await x.engine.go(x.cue({repeatCount:3}));
  assert.equal(x.sources[0].loop,true);
  assert.equal(x.sources[0].stopTime,14.02);
  x.sources[0].end();
  assert.deepEqual(x.ended,['cue-1']);
  await x.engine.go(x.cue({loop:true}));
  assert.equal(x.sources[1].loop,true);
  assert.equal(x.sources[1].stopTime,undefined);
  x.engine.stopAll();
  assert.equal(x.sources[1].stopTime,5);
  x.sources[1].end();
  assert.deepEqual(x.ended,['cue-1']); // Emergency is never natural completion.
});

test('legacy GO retains old -6 dB level and rejects invalid playback before starting', async () => {
  const x=audioFixture();
  await x.engine.loadFile(x.file,'asset-1');
  await x.engine.go(x.cue());
  assert.equal(x.gains[0].gain.value,0.5);
  x.engine.stopAll();
  await assert.rejects(x.engine.go(x.cue({loop:true,repeatCount:4})),/Invalid cue playback/);
  assert.equal(x.sources.length,1);
});

test('emergency stop silences a scheduled delayed cue before its future start', async () => {
  const x=audioFixture();
  await x.engine.loadFile(x.file,'asset-1');
  await x.engine.go(x.cue({startDelayMs:5000,loop:true}));
  assert.equal(x.sources[0].startTime,10.02);
  x.engine.stopAll();
  assert.equal(x.gains[0].gain.value,0);
  assert.equal(x.sources[0].stopTime,5);
  x.sources[0].end();
  assert.deepEqual(x.ended,[]);
});
