import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {buildEnglishVideoDemo,assertEnglishScript,VIDEO_DEMO_TARGETS}
  from '../tools/video/build-the-last-go.mjs';
import {parseArgs,plan,check,ROOT} from '../tools/video/run-demo-director.mjs';
import {importPortableShow} from '../src/core/showArchive.mjs';
import {parseLocalCueChat} from '../src/core/cueConversation.mjs';

test('original English theatre script has fixed L# with 3 distinct spoken feet',async()=>{
  const script=await readFile(resolve(ROOT,'fixtures/demo/runq-the-last-go-en.txt'),'utf8');
  assert.equal(assertEnglishScript(script).length,31);
  assert.deepEqual(VIDEO_DEMO_TARGETS.map(x=>x.line),['L7','L15','L24']);
  assert.deepEqual(VIDEO_DEMO_TARGETS.map(x=>x.spokenLine),['L6','L14','L23']);
  assert.equal(new Set(VIDEO_DEMO_TARGETS.map(x=>x.foot.toLowerCase())).size,3);
  assert.throws(()=>assertEnglishScript(script+'\nEXTRA'),/31 lines/);
});

test('build English ZIP offline: all original synthetic WAVs and manual cue provenance roundtrip',async()=>{
  const {archive,project,audioFiles}=await buildEnglishVideoDemo();
  assert.ok(archive.byteLength>1000);
  assert.equal(project.cues.length,3);
  assert.equal(project.assets.length,3);
  assert.equal(audioFiles.length,3);
  for(const [i,cue] of project.cues.entries()){
    assert.equal(cue.trigger,VIDEO_DEMO_TARGETS[i].foot);
    assert.ok(cue.sourceLineIds.includes(VIDEO_DEMO_TARGETS[i].line));
    assert.equal(cue.status,'DRAFT');
  }
  assert.ok(project.proposals.every(p=>p.source==='MANUAL_MOCK'),
    'Offline demo must never impersonate Meta inference');
  const restored=await importPortableShow(archive);
  assert.deepEqual(restored.project,project);
  assert.equal(restored.audioFiles.length,3);
});

test('selected English voice commands use existing offline parser and contextual correction',()=>{
  assert.deepEqual(parseLocalCueChat('Set the fade in to three seconds.'),
    {fadeInMs:3000});
  assert.deepEqual(parseLocalCueChat('Make it four seconds.',{lastField:'fadeInMs'}),
    {fadeInMs:4000});
  assert.deepEqual(parseLocalCueChat('Set fade out to two seconds.'),
    {fadeOutMs:2000});
  assert.equal(parseLocalCueChat('Go.'),null,'no spoken transport in cue editor');
});

test('director refuses unsolicited API actions, fake voice and unsafe options by default',()=>{
  assert.deepEqual(parseArgs(['--plan']).scene,null);
  assert.equal(parseArgs(['--scene','S05']).micWav,null);
  assert.equal(parseArgs(['--scene','S08','--mic-wav','C:\\fake.wav','--voice-opt-in']).scene,'S08');
  for(const args of [
    [],['--scene','S12'],['--scene','S03','--mic-wav','x.wav'],
    ['--scene','S08','--mic-wav','x.wav'],
    ['--scene','S08','--voice-opt-in'],
    ['--plan','--capture'],['--check','--voice-opt-in'],
    ['--scene','S05','--timeout-seconds','0'],
  ])assert.throws(()=>parseArgs(args));
});

test('11-shot plan is stable, 3:00, and maintains separate actor/operator audio cues',async()=>{
  const p=await plan();
  assert.equal(p.scenes.length,11);
  assert.equal(p.scenes.reduce((sum,s)=>sum+s.seconds,0),180);
  assert.equal(p.scenes.find(s=>s.id==='S08').audio,'actors/linear_or_jump.wav');
  assert.equal(p.scenes.find(s=>s.id==='S05').audio,'operator/hero_01_fade_in.wav');
  assert.equal(p.scenes.find(s=>s.id==='S08').requirement.includes('operator ARM'),true);
  assert.equal((await check()).noPaidCalls,true);
});
