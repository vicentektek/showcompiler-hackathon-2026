import test from 'node:test';
import assert from 'node:assert/strict';
import {replayVoiceRehearsal} from '../src/core/voiceRehearsal.mjs';
const cues=[{id:'C1',lineId:'L10',trigger:'Que suene la campana grande'}];
test('replay suggests cue once without executing',()=>{
 const r=replayVoiceRehearsal({cues,initialFocusLine:8,events:[
  {type:'TRANSCRIPT',atMs:1000,endMs:900,final:true,text:'Que suene la campana grande'},
  {type:'TRANSCRIPT',atMs:1100,endMs:900,final:true,text:'Que suene la campana grande'}
 ]});
 assert.equal(r.log[0].type,'SUGGEST_PREPARE');
 assert.equal(r.log[1].type,'NO_MATCH');
 assert.deepEqual(r.consumedIds,['C1']);
 assert.equal(r.log.some(x=>x.type==='GO'),false);
});
test('replay supports manual line correction',()=>{
 const r=replayVoiceRehearsal({cues,initialFocusLine:50,events:[
  {type:'SET_FOCUS',atMs:0,line:8},
  {type:'TRANSCRIPT',atMs:1000,endMs:900,final:true,text:'Que suene la campana grande'}
 ]});
 assert.equal(r.log[0].type,'FOCUS_CHANGED');
 assert.equal(r.log[1].cueId,'C1');
});
test('replay rejects unordered events',()=>{
 assert.throws(()=>replayVoiceRehearsal({cues,events:[{type:'SET_FOCUS',atMs:2,line:1},{type:'SET_FOCUS',atMs:1,line:2}]}));
});
