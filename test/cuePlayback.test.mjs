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
  const panners = [];
  const ctx = {
    currentTime: 5, state: 'running', destination: {},
    resume: async () => {}, decodeAudioData: async () => ({ duration: 3, numberOfChannels: 1 }),
    createStereoPanner() {
      const panner = { pan: { value:0 }, connect(){}, disconnect(){} };
      panners.push(panner);
      return panner;
    },
    createBufferSource() {
      const source = { buffer:null, loop:false, playbackRate:{value:1}, onended:null,
        connect() {}, disconnect() {},
        start(t, offset=0, duration) { actions.push(['start',t,offset]); source.startTime=t; source.startOffset=offset; source.startDuration=duration; },
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
  return { engine,ctx,actions,sources,gains,panners,ended,file,cue };
}

test('strict settings keep legacy levels and reject dangerous or ambiguous combinations', () => {
  assert.deepEqual(normalizeCuePlayback(),DEFAULT_CUE_PLAYBACK);
  for (const v of [
    { gainDb: 6 }, { gainDb: -61 }, { gainDb: NaN }, { repeatCount:0 },
    { repeatCount:21 }, { loop:true,repeatCount:2 }, { loop:true,fadeOutMs:100 },
    { fadeInMs:10001 }, { fadeOutMs:-1 }, { startDelayMs:1.1 },
    { unauthorized:true }, { __protoKey__:true },
    { startAtMs:600001 }, { playbackRate:3 }, { playbackRate:0.1 },
    { pan:-1.1 }, { pan:1.1 },
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
  assert.ok(x.actions.some(a=>a[0]==='setGain'&&a[1]===0&&Math.abs(a[2]-at)<1e-9));
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

test('manual GO executes trim from file offset, speed and stereo pan with accurate repeat boundary', async () => {
  const x=audioFixture();
  await x.engine.loadFile(x.file,'asset-1');
  await x.engine.go(x.cue({startAtMs:500,playbackRate:2,pan:-0.4,repeatCount:2}));
  assert.equal(x.sources[0].startTime,5.02);
  assert.equal(x.sources[0].startOffset,0.5);
  assert.equal(x.sources[0].playbackRate.value,2);
  assert.equal(x.panners[0].pan.value,-0.4);
  assert.equal(x.sources[0].loopStart,0.5); // Repeated segment starts at IN.
  assert.equal(x.sources[0].stopTime,7.52);
  x.engine.stopAll();
});
test('rejects offset at or beyond decoded file boundary before starting audio', async () => {
  const x=audioFixture();
  await x.engine.loadFile(x.file,'asset-1');
  await assert.rejects(x.engine.go(x.cue({startAtMs:3000})),/dentro de cada archivo/);
  assert.equal(x.sources.length,0);
});

test('OUT trim is optional, strict, and survives save without changing AI evidence', () => {
  assert.equal(normalizeCuePlayback().endAtMs,null);
  for (const settings of [
    {endAtMs:0}, {endAtMs:-1}, {endAtMs:1.5}, {endAtMs:600001},
    {startAtMs:800,endAtMs:800}, {startAtMs:800,endAtMs:700},
  ]) assert.throws(()=>normalizeCuePlayback(settings),/endAtMs/);
  const original=showWithCue();
  const edited=updateCuePlayback(original,'cue-1',{startAtMs:400,endAtMs:1100,fadeOutMs:250});
  assert.equal(edited.cues[0].playback.endAtMs,1100);
  assert.deepEqual(deserializeShowProject(serializeShowProject(edited)),edited);
  assert.deepEqual(edited.proposals,original.proposals);
});

test('real finite OUT trim limits playback duration and fade to the selected region',async()=>{
  const x=audioFixture();
  await x.engine.loadFile(x.file,'asset-1');
  await x.engine.go(x.cue({startAtMs:500,endAtMs:1500,fadeInMs:200,fadeOutMs:300}));
  assert.equal(x.sources[0].startOffset,.5);
  assert.equal(x.sources[0].startDuration,1);
  assert.equal(x.sources[0].loop,false);
  assert.ok(x.actions.some(a=>a[0]==='ramp'&&a[1]===0&&Math.abs(a[2]-6.02)<1e-9));
  x.sources[0].end();
  assert.deepEqual(x.ended,['cue-1']);
});

test('trimmed finite repeats loop only within IN/OUT and stop after the selected count',async()=>{
  const x=audioFixture();
  await x.engine.loadFile(x.file,'asset-1');
  await x.engine.go(x.cue({startAtMs:500,endAtMs:1500,repeatCount:3,playbackRate:2}));
  assert.equal(x.sources[0].loop,true);
  assert.equal(x.sources[0].loopStart,.5);
  assert.equal(x.sources[0].loopEnd,1.5);
  assert.equal(x.sources[0].stopTime,6.52);
  x.sources[0].end();
  await x.engine.go(x.cue({startAtMs:500,endAtMs:1500,loop:true}));
  assert.equal(x.sources[1].loop,true);
  assert.equal(x.sources[1].loopStart,.5);
  assert.equal(x.sources[1].loopEnd,1.5);
  assert.equal(x.sources[1].stopTime,undefined);
  x.engine.stopAll();
  x.sources[1].end();
  assert.deepEqual(x.ended,['cue-1']);
});

test('invalid OUT boundary fails before starting any source',async()=>{
  const x=audioFixture();
  await x.engine.loadFile(x.file,'asset-1');
  await assert.rejects(x.engine.go(x.cue({startAtMs:200,endAtMs:3100})),/puntos IN\/OUT/);
  assert.equal(x.sources.length,0);
});
