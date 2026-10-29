import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSfxHistory,explainSfxError,labelSfxHistory} from '../src/sfx/jobRecovery.mjs';
import {suggestEnglishSfxPrompt} from '../src/sfx/freeTextPrompt.mjs';

const item=(requestId,status,createdAt='2026-10-29T15:00:00.000Z')=>
  ({requestId,status,createdAt,updatedAt:createdAt});
test('local history differentiates unresolved, ready and daily starts without provider requests',()=>{
  const history=inspectSfxHistory({jobs:[
    item('req-a','READY_FOR_REVIEW'),
    item('req-b','QUEUED','2026-10-29T16:00:00.000Z'),
    item('req-c','SUBMISSION_UNKNOWN','2026-10-28T16:00:00.000Z'),
    item('req-d','CANCEL_REQUESTED','2026-10-27T16:00:00.000Z'),
    item('req-e','REJECTED'),
  ]},new Date('2026-10-29T18:00:00Z'));
  assert.equal(history.startedToday,3);
  assert.equal(history.active.length,3);
  assert.equal(history.ready.length,1);
  assert.equal(history.jobs[0].requestId,'req-b');
  assert.match(labelSfxHistory(history.active[0]),/En cola/);
  assert.equal(history.truncated,false);
});
test('all blocked states explain how to recover without resetting cost or retrying',()=>{
  for(const code of ['SFX_ACTIVE_LIMIT','SFX_SUBMISSION_UNKNOWN','SFX_DAILY_LIMIT',
     'SFX_DAILY_BUDGET','SFX_BUSY','SFX_BUDGET_UNKNOWN','SFX_JOURNAL_LOCKED']){
    assert.ok(explainSfxError(code,'es').length>40,code);
    assert.ok(explainSfxError(code,'en').length>40,code);
  }
  assert.match(explainSfxError('SFX_DAILY_LIMIT'),/NO devuelve una solicitud/);
  assert.match(explainSfxError('SFX_SUBMISSION_UNKNOWN'),/No la repitas/);
});
test('offline known Spanish stage direction produces an English suggestion for operator review',()=>{
 const suggestion=suggestEnglishSfxPrompt('Portazo fuerte', 'L12');
 assert.ok(suggestion);
 assert.match(suggestion.prompt,/door/i);
 assert.match(suggestion.prompt,/slam/i);
 assert.equal(suggestion.provenance,'OFFLINE_RULE_BASED_SUGGESTION');
 assert.ok(suggestion.confidence>=0.7);
});
test('offline helper refuses unrecognized arbitrary text or oversized prompts',()=>{
 assert.equal(suggestEnglishSfxPrompt('Quiero que ocurra algo mágico y diferente'),null);
 assert.equal(suggestEnglishSfxPrompt('x'.repeat(401)),null);
 assert.equal(suggestEnglishSfxPrompt(''),null);
});
