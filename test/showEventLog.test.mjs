import test from 'node:test';
import assert from 'node:assert/strict';
import {createShowEventLog,SHOW_EVENT_TYPES} from '../src/core/showEventLog.mjs';
test('stores acknowledged events newest first with bounded memory',()=>{
 const observed=[],log=createShowEventLog({limit:2,clock:()=>123,onChange:e=>observed.push(e)});
 log.append('NEXT_PREPARED',{cueId:'cue-1',source:'operator'});
 log.append('CUE_STARTED',{cueId:'cue-1',label:'Inicio',source:'operator'});
 log.append('CUE_FINISHED',{cueId:'cue-1',source:'engine'});
 assert.deepEqual(log.snapshot().map(e=>e.type),['CUE_FINISHED','CUE_STARTED']);
 assert.equal(observed.length,3);
 assert.equal(Object.isFrozen(log.snapshot()[0]),true);
});
test('never permits arbitrary transcripts, oversized strings or event names',()=>{
 const log=createShowEventLog();
 assert.ok(SHOW_EVENT_TYPES.includes('STOP_ALL'));
 assert.throws(()=>log.append('RAW_TRANSCRIPT'),TypeError);
 assert.throws(()=>log.append('CUE_STARTED',{source:'model'}),TypeError);
 assert.throws(()=>log.append('CUE_STARTED',{detail:'A'.repeat(170)}),TypeError);
});
test('a UI observer cannot defeat core stop/GO by throwing',()=>{
 const log=createShowEventLog({onChange:()=>{throw Error('UI disconnected')}});
 assert.equal(log.append('STOP_ALL',{source:'operator'}).type,'STOP_ALL');
 log.clear();assert.deepEqual(log.snapshot(),[]);
});
