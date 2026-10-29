import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseLocalCueChat,validateCueChatChanges,validateCueChatModelReply}
 from '../src/core/cueConversation.mjs';

const fixture=JSON.parse(await readFile(
  new URL('./fixtures/eval-conversational-cue-local-v1.json',import.meta.url),'utf8'));

test('all cue-chat fixture cases are original, bounded, stable and clearly offline',()=>{
  assert.equal(fixture.schemaVersion,1);
  assert.equal(fixture.source,'HAND_AUTHORED_SYNTHETIC_COMMANDS_NOT_META_OUTPUT');
  assert.ok(fixture.cases.length>=15);
  const ids=new Set();
  for(const c of fixture.cases){
    assert.ok(!ids.has(c.id));ids.add(c.id);
    assert.ok(['es','en'].includes(c.language));
    assert.ok(typeof c.input==='string'&&c.input.length>0);
    assert.ok(c.expected===null||typeof c.expected==='object');
  }
});

test('bilingual local parser matches hand-authored exact command expectations',()=>{
  for(const scenario of fixture.cases){
    const actual=parseLocalCueChat(scenario.input,{lastField:scenario.lastField});
    assert.deepEqual(actual,scenario.expected,scenario.id+' parsed unexpectedly');
  }
});

test('remote replies cannot smuggle GO or unreviewed transport action fields',()=>{
  assert.throws(()=>validateCueChatChanges({GO:true}));
  assert.throws(()=>validateCueChatChanges({executeAudio:true}));
  assert.throws(()=>validateCueChatChanges({fadeInMs:-5}));
  assert.throws(()=>validateCueChatChanges({loop:'yes'}));
  assert.throws(()=>validateCueChatChanges({}));
  assert.throws(()=>validateCueChatModelReply({
    status:'PATCH',message:'I fired the cue',changes:{GO:true},
  }));
});

test('remote ambiguity must have no executable or partial patch',()=>{
  const r=validateCueChatModelReply({status:'CLARIFY',message:'Which cue?',changes:null});
  assert.equal(r.changes,null);
  assert.throws(()=>validateCueChatModelReply({
    status:'CLARIFY',message:'Which cue?',changes:{gainDb:-6},
  }));
});

test('a valid natural-language edit is only a staged change, not an audio GO',()=>{
  const suggestion=validateCueChatModelReply({
    status:'PATCH',message:'Reduce gain',changes:{gainDb:-6,fadeInMs:750},
  });
  assert.equal(suggestion.status,'PATCH');
  assert.deepEqual(suggestion.changes,{gainDb:-6,fadeInMs:750});
  assert.equal('GO' in suggestion,false);
});
