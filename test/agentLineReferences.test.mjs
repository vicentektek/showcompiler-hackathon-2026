import test from 'node:test';
import assert from 'node:assert/strict';
import {enforceAgentModelScope} from '../tools/agentRoutes.mjs';

const context = {
  cues: [{id: 'cue-1', sourceLineIds: ['L2']}],
  lines: [{id: 'L2', text: 'ANA: Open the door.'}],
  expert: {missingLineIds: ['L99']},
};
const reply = (message, status = 'ANSWER') => ({status, message, operations: []});

test('rejects nonexistent lowercase references, not just uppercase Lxx', () => {
  for (const ref of ['l9999', 'L9999', 'l3', 'L3']) {
    assert.throws(() => enforceAgentModelScope(reply('See '+ref), context),
      {message: 'MODEL_LINE_NOT_IN_CONTEXT'});
  }
});

test('accepts case-insensitive references to supplied lines', () => {
  for (const ref of ['l2', 'L2']) {
    assert.equal(enforceAgentModelScope(reply('See '+ref), context).message, 'See '+ref);
  }
});

test('missing-line exception applies only to clarification and explicit missing IDs', () => {
  assert.doesNotThrow(() => enforceAgentModelScope(reply('Missing l99', 'CLARIFY'), context));
  assert.throws(() => enforceAgentModelScope(reply('Missing l99', 'ANSWER'), context),
    {message: 'MODEL_LINE_NOT_IN_CONTEXT'});
  assert.throws(() => enforceAgentModelScope(reply('Missing l100', 'CLARIFY'), context),
    {message: 'MODEL_LINE_NOT_IN_CONTEXT'});
});

test('no expert context keeps baseline behavior unchanged', () => {
  const baseline = {cues: context.cues, lines: context.lines};
  assert.doesNotThrow(() => enforceAgentModelScope(reply('See l9999'), baseline));
});
