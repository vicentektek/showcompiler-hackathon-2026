import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewShow} from '../src/core/workspace.mjs';
import {insertManualCue} from '../src/core/manualCues.mjs';
import {buildAgentContext} from '../src/core/agentCore.mjs';
import {buildExpertAgentContext, retrieveAgentEvidence} from '../src/core/agentExpertContext.mjs';
import {createAgentTaskMemory, recordAgentTaskMemory, agentMemoryContext,
  explicitAgentMemoryInstruction,forgetAllAgentDecisions,revokeAgentDecisions} from '../src/core/agentTaskMemory.mjs';

function largeShow() {
  const lines = Array.from({length: 3000}, (_, i) => `Scene marker ${i + 1}`);
  lines[2799] = '(The obsidian bell rings.)';
  let p = createNewShow({name: 'Original synthetic context', scriptText: lines.join('\n')});
  for (let i = 0; i < 95; i++) p = insertManualCue(p, {label: `Marker ${i + 1}`}).project;
  return {...p, cues: p.cues.map((c, i) => i === 94 ? {...c, label: 'Obsidian bell', sourceLineIds: ['L2800']} : c)};
}
test('target beyond 80 cues and 120 lines is retrieved without assuming NEXT is selected', () => {
  const p = largeShow(), target = p.cues[94], baseline = buildAgentContext(p);
  assert.equal(baseline.cues.some(c => c.id === target.id), false);
  assert.equal(baseline.lines.some(l => l.id === 'L2800'), false);
  const context = buildExpertAgentContext(p, 'Explain cue 95 and L2800, obsidian bell', {
    selectedCueId: p.cues[0].id, preparedCueId: target.id, activeCueIds: []});
  assert.ok(context.cues.some(c => c.id === target.id));
  assert.ok(context.lines.some(l => l.id === 'L2800' && /obsidian/.test(l.text)));
  assert.notEqual(context.expert.runtime.selectedCueId, context.expert.runtime.preparedCueId);
  assert.ok(JSON.stringify(context).length <= 14500);
});
test('missing evidence is explicit and retrieval pages have bounded size', () => {
  const p = largeShow(), result = retrieveAgentEvidence(p, 'L9999', {offset: 80, limit: 10});
  assert.deepEqual(result.missingLineIds, ['L9999']);
  assert.equal(result.cues.length, 10);
  assert.equal(result.page.hasMore, true);
  assert.throws(() => retrieveAgentEvidence(p, '', {limit: 500}), /INVALID_RETRIEVAL_PAGE/);
});
test('scene metadata retrieves the final scene rather than silently using the first page', () => {
  let p = largeShow();
  const lines = p.scriptText.split('\n');
  lines[0] = 'SCENE 1';
  lines[1000] = 'SCENE 2';
  lines[2000] = 'SCENE 3';
  p = {...p, scriptText: lines.join('\n')};
  for (const prompt of ['Explain scene 3', 'Explica la última escena']) {
    const result = retrieveAgentEvidence(p, prompt);
    assert.equal(result.scenes[0].id, 'S3');
    assert.ok(result.cues.some(c => c.number === 95));
    assert.ok(result.lines.some(l => l.id === 'L2001'));
  }
  assert.deepEqual(retrieveAgentEvidence(p, 'Explain scene 99').missingSceneNumbers, [99]);
});
test('UTF-8 context budget preserves a requested non-ASCII source line', () => {
  const original = largeShow();
  const p = {...original, scriptText: original.scriptText.split('\n').map((line, i) =>
    i === 2799 ? '音'.repeat(220) : '🎭'.repeat(80)).join('\n')};
  const context = buildExpertAgentContext(p, 'Explain cue 95 at L2800');
  assert.ok(new TextEncoder().encode(JSON.stringify(context)).length <= 14500);
  assert.ok(context.lines.some(line => line.id === 'L2800' && line.text === '音'.repeat(220)));
});
test('confirmed memory survives 50 turns/reopen but never crosses project or revision', () => {
  const p = largeShow(), now = Date.now();
  let memory = createAgentTaskMemory(p, now);
  memory = recordAgentTaskMemory(memory, p, {id: 'decision-bell', kind: 'DECISION',
    text: 'Use the obsidian bell, not a gong.', status: 'APPROVED', cueIds: [p.cues[94].id]}, now);
  for (let i = 0; i < 50; i++) assert.equal(agentMemoryContext(memory, p, now).entries[0].text,
    'Use the obsidian bell, not a gong.');
  assert.equal(agentMemoryContext(JSON.parse(JSON.stringify(memory)), p, now).entries[0].status, 'APPROVED');
  assert.throws(() => agentMemoryContext(memory, {...p, name: 'Different show'}, now), /INVALID_PROJECT_TASK_MEMORY/);
  const changed = {...p, cues: p.cues.slice(0, -1)};
  assert.equal(agentMemoryContext(memory, changed, now).entries[0].current, false);
  assert.equal(agentMemoryContext(memory, changed, now).entries[0].usableAsFact, false);
  memory = recordAgentTaskMemory(memory, p, {...memory.entries[0], status: 'REVOKED'}, now);
  assert.equal(agentMemoryContext(memory, p, now).entries[0].usableAsFact, false);
  assert.equal(forgetAllAgentDecisions('Forget all remembered decisions'), true);
  assert.equal(forgetAllAgentDecisions('Maybe forget something'), false);
  assert.equal(revokeAgentDecisions(memory, p, now).entries[0].status, 'REVOKED');
});
test('AI proposals are pending, not approved decisions; secrets never enter task memory', () => {
  const p = largeShow(), now = Date.now();
  const memory = recordAgentTaskMemory(createAgentTaskMemory(p, now), p, {
    id: 'pending', kind: 'TASK', text: 'Review a bell alternative', status: 'PENDING'}, now);
  assert.equal(agentMemoryContext(memory, p, now).entries[0].usableAsFact, false);
  assert.equal(explicitAgentMemoryInstruction('Remember that no gong is wanted'), 'no gong is wanted');
  assert.equal(explicitAgentMemoryInstruction('AI suggests a gong'), null);
  assert.throws(() => explicitAgentMemoryInstruction('Remember api_key=private'), /UNSAFE_TASK_MEMORY/);
});
