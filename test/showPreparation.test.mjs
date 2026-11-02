import test from 'node:test';
import assert from 'node:assert/strict';
import { planShowAudio, runPreparationQueue, cueSoundIdentity, validateAudioBatch, limitAudioBatch, prepareShowOperationTriggers } from '../src/core/showPreparation.mjs';
import { insertManualCue } from '../src/core/manualCues.mjs';
import { makeProjectVoiceScenario } from '../src/core/voiceScenario.mjs';
import { initialRehearsalAutoState, decideRehearsalAutoGo } from '../src/core/rehearsalAutopilot.mjs';
import { createNewShow, addMockProposal, decideProposal, addAudioReference, assignAudioToCue } from '../src/core/workspace.mjs';

function project() {
  let show = createNewShow({ id: 'batch-show', scriptText: '(A bell rings.)\n(Wind blows.)' });
  for (const lineId of ['L1', 'L2']) {
    show = addMockProposal(show, { lineId, label: lineId === 'L1' ? 'Bell' : 'Wind' });
    show = decideProposal(show, show.proposals.at(-1).id, 'APPROVE');
  }
  return show;
}

test('preparation prefers preceding actor speech over the sound direction and supports armed rehearsal matching',()=>{
 let show=createNewShow({scriptText:'ESCENA 1\nANA: Ahora podemos abrir la puerta principal.\n(Suena una campana.)'});
 show=addMockProposal(show,{lineId:'L3',label:'Bell'});
 show=decideProposal(show,show.proposals[0].id,'APPROVE');
 const before=JSON.stringify(show);
 const result=prepareShowOperationTriggers(show);
 assert.equal(result.project.cues[0].trigger,'Ahora podemos abrir la puerta principal');
 assert.equal(result.added[0].evidenceLineId,'L2');
 assert.equal(result.added[0].speaker,'ANA');
 assert.deepEqual(result.project.cues[0].sourceLineIds,['L3']);
 assert.equal(JSON.stringify(show),before);
 const scenario=makeProjectVoiceScenario(result.project,{minimumWords:2});
 const input={cues:scenario.cues,transcript:{text:'Ahora podemos abrir la puerta principal.',final:true,endMs:9960},
  turnId:'actor-turn',atMs:10000,state:initialRehearsalAutoState()};
 assert.equal(decideRehearsalAutoGo(input).action.reason,'NOT_ARMED');
 const action=decideRehearsalAutoGo({...input,armed:true}).action;
 assert.equal(action.type,'FIRE');
 assert.equal(action.cueId,show.cues[0].id);
 assert.equal(action.score,1);
});
test('preparation preserves operator feet and leaves missing dialogue for manual review',()=>{
   let show=project();
   show.cues[0].trigger='My manual foot';
   show=insertManualCue(show,{label:'No source'}).project;
   const before=JSON.stringify(show);
   const result=prepareShowOperationTriggers(show);
   assert.equal(JSON.stringify(show),before);
   assert.equal(result.project.cues[0].trigger,'My manual foot');
   assert.equal(result.project.cues[1].trigger,undefined);
   assert.deepEqual(result.added,[]);
   assert.deepEqual(result.skipped.map(item=>item.reason),['NO_RELIABLE_DIALOGUE','NO_SOURCE_LINE']);
   assert.equal(result.project.cues[2].trigger,undefined);
   assert.equal(result.project.scriptText,show.scriptText);
   assert.deepEqual(result.project.proposals,show.proposals);
   assert.deepEqual(result.project.cues.map(c=>c.sourceLineIds),show.cues.map(c=>c.sourceLineIds));
   assert.deepEqual(prepareShowOperationTriggers(result.project).added,[]);
  });
  test('spoken feet cover more than a voice batch without duplicating phrases across batches',()=>{
   const script=Array.from({length:30},(_,i)=>`ACTOR: We should open entrance number ${i===29?0:i}.\n(A bell rings.)`).join('\n');
   let show=createNewShow({scriptText:script});
   for(let i=0;i<30;i++)show=insertManualCue(show,{label:'Cue '+i}).project;
   show.cues=show.cues.map((cue,i)=>({...cue,sourceLineIds:['L'+(2*i+2)]}));
   const result=prepareShowOperationTriggers(show);
   assert.equal(result.added.length,29);
   assert.equal(result.skipped.length,1);
   assert.ok(!result.skipped.some(item=>item.reason==='BATCH_LIMIT'));
   const tail=result.skipped.find(item=>item.cueId===show.cues.at(-1).id);
   assert.equal(tail.reason,'AMBIGUOUS_TRIGGER');
   assert.equal(tail.conflictsWith,show.cues[0].id);
  });

test('preparation never borrows future dialogue, another scene or an ambiguous repeated foot',()=>{
 for(const script of [
  '(A bell rings.)\nANA: Please open the main door now.',
  'ANA: Please open the main door now.\nSCENE 2\n(A bell rings.)',
  'SFX: Please open the main door now.\n(A bell rings.)',
  'ANA: Go now.\n(A bell rings.)',
 ]){
  let show=createNewShow({scriptText:script});
  show=insertManualCue(show,{label:'Bell'}).project;
  const line=script.split('\n').findIndex(text=>text==='(A bell rings.)')+1;
  show.cues[0].sourceLineIds=['L'+line];
  const result=prepareShowOperationTriggers(show);
  assert.equal(result.added.length,0,script);
  assert.equal(result.project.cues[0].trigger,undefined,script);
  assert.equal(result.skipped[0].reason,'NO_RELIABLE_DIALOGUE');
 }
});
test('bulk audio preserves provenance, excludes linked audio and never creates cues', () => {
  let show = project();
  const before = JSON.stringify(show);
  const plan = planShowAudio(show);
  assert.equal(plan.items.length, 2);
  assert.deepEqual(plan.items.map(i => i.draft.sourceLineId), ['L1', 'L2']);
  assert.equal(JSON.stringify(show), before);
  show = addAudioReference(show, 'bell.wav');
  show = assignAudioToCue(show, show.cues[0].id, show.assets[0].id);
  assert.equal(planShowAudio(show).items.length, 1);
  assert.notEqual(cueSoundIdentity(show.cues[0]), plan.items[0].cueIdentity);
});

test('no-music constraints do not exclude eligible sound effects', () => {
  const show = project();
  show.cues[0].actions[0].prompt = 'A single bell, no music, without dialogue';
  show.cues[1].actions[0].prompt = 'Background music starts';
  const plan = planShowAudio(show);
  assert.deepEqual(plan.items.map(item => item.cueId), [show.cues[0].id]);
  assert.equal(plan.excluded[0].reason, 'UNSUPPORTED_SOUND_KIND');
});

test('one-click batch is bounded without hiding deferred cues or increasing limits', () => {
  const items = planShowAudio(project()).items;
  const policy = { enabled: true, estimatedMaxCostUsdPerRequest: 0.05, dailyBudgetUsd: 0.05, maxDailyStarts: 10 };
  const plan = limitAudioBatch(items, policy);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.deferred, 1);
  assert.equal(policy.dailyBudgetUsd, 0.05);
  assert.throws(() => limitAudioBatch(items, { ...policy, dailyBudgetUsd: 0.01 }), /DAILY_CEILING/);
});

test('queue is serial, stops on failure, never retries and retains completed work', async () => {
  const calls = [], completed = [];
  await assert.rejects(runPreparationQueue([1, 2, 3], {
    assertCurrent() {},
    async execute(item) { calls.push(item); if (item === 2) throw new Error('HTTP_429'); return item; },
    onComplete(item) { completed.push(item); },
  }), /HTTP_429/);
  assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(completed, [1]);
});

test('cancel and project changes block late results and subsequent requests', async () => {
  const abort = new AbortController(), calls = [], completed = [];
  await assert.rejects(runPreparationQueue([1, 2], {
    signal: abort.signal, assertCurrent() {},
    async execute(item) { calls.push(item); abort.abort(); return item; },
    onComplete(item) { completed.push(item); },
  }), /CANCELLED/);
  assert.deepEqual(calls, [1]);
  assert.deepEqual(completed, []);
  let current = true;
  await assert.rejects(runPreparationQueue([1, 2], {
    assertCurrent() { if (!current) throw new Error('SHOW_CHANGED'); },
    async execute() { current = false; return 1; },
    onComplete() { throw new Error('late result applied'); },
  }), /SHOW_CHANGED/);
});

test('batch requires exact review authorization and respects daily, kind and prompt limits', () => {
  const items = planShowAudio(project()).items;
  const policy = { enabled: true, estimatedMaxCostUsdPerRequest: 0.05, dailyBudgetUsd: 0.5, maxDailyStarts: 10 };
  assert.doesNotThrow(() => validateAudioBatch(items, policy, true));
  assert.throws(() => validateAudioBatch(items, policy, false), /AUTHORIZATION/);
  assert.throws(() => validateAudioBatch(items, { ...policy, estimatedMaxCostUsdPerRequest: NaN }, true), /AUTHORIZATION/);
  assert.throws(() => validateAudioBatch(items, { ...policy, dailyBudgetUsd: 0.05 }, true), /DAILY_CEILING/);
  assert.throws(() => validateAudioBatch(items, { ...policy, maxDailyStarts: 1 }, true), /DAILY_CEILING/);
  for (const draft of [{ ...items[0].draft, kind: 'MUSIC' }, { ...items[0].draft, prompt: 'https://provider.test/' },
    { ...items[0].draft, durationSeconds: 13 }])
    assert.throws(() => validateAudioBatch([{ draft }], policy, true), /PROMPT_INVALID/);
});
