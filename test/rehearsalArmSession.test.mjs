import test from 'node:test';
import assert from 'node:assert/strict';
import {rehearsalArmState,armRehearsalVoice,disarmRehearsalVoice,
 authorizeRehearsalVoice} from '../src/core/rehearsalArmSession.mjs';

const conditions={workspace:'rehearsal',live:true,visible:true,fingerprint:'project1'};

test('automatic GO is disarmed by default, with no implicit grant from a UI label',()=>{
 disarmRehearsalVoice('test');
 assert.equal(rehearsalArmState().armed,false);
 assert.equal(authorizeRehearsalVoice(conditions),false);
 assert.equal(armRehearsalVoice({...conditions,workspace:'voice'}),false);
 assert.equal(armRehearsalVoice({...conditions,workspace:'operation'}),false);
 assert.equal(armRehearsalVoice({...conditions,live:false}),false);
 assert.equal(armRehearsalVoice({...conditions,visible:false}),false);
 assert.equal(armRehearsalVoice({...conditions,fingerprint:''}),false);
 assert.equal(rehearsalArmState().armed,false);
});
test('arm is scoped to live, visible Rehearsal and exact show fingerprint',()=>{
 assert.equal(armRehearsalVoice(conditions),true);
 const epoch=rehearsalArmState().epoch;
 assert.equal(authorizeRehearsalVoice({...conditions,epoch}),true);
 assert.equal(authorizeRehearsalVoice({...conditions,workspace:'voice',epoch}),false);
 assert.equal(authorizeRehearsalVoice({...conditions,workspace:'operation',epoch}),false);
 assert.equal(authorizeRehearsalVoice({...conditions,live:false,epoch}),false);
 assert.equal(authorizeRehearsalVoice({...conditions,visible:false,epoch}),false);
 assert.equal(authorizeRehearsalVoice({...conditions,fingerprint:'different',epoch}),false);
 disarmRehearsalVoice('stop_all');
 assert.equal(authorizeRehearsalVoice({...conditions,epoch}),false);
 assert.equal(rehearsalArmState().reason,'stop_all');
});
test('a stale delayed GO cannot use an old authorization epoch',()=>{
 assert.equal(armRehearsalVoice(conditions),true);
 const stale=rehearsalArmState().epoch;
 disarmRehearsalVoice('left_rehearsal');
 assert.equal(armRehearsalVoice(conditions),true);
 assert.equal(authorizeRehearsalVoice({...conditions,epoch:stale}),false);
 assert.equal(authorizeRehearsalVoice({...conditions,epoch:rehearsalArmState().epoch}),true);
 disarmRehearsalVoice('done');
});
