import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuardedBasetenCaller,createGuardedModalLocalFetch}
 from '../src/qa/pilotReservationGuards.mjs';

const root='http://127.0.0.1:5180';
const status=()=>new Response(JSON.stringify({estimatedMaxCostUsdPerRequest:0.08}),{
 status:200,headers:{'content-type':'application/json'},
});
const ok=()=>new Response('{}',{status:200,headers:{'content-type':'application/json'}});

test('Baseten denied budget NEVER invokes the real caller',async()=>{
 let calls=0,reservations=0;
 const guarded=createGuardedBasetenCaller({
  reserve:async()=>{reservations++;return false;},
  estimate:()=>0.15,
  call:async()=>{calls++;return 'ILLEGAL';},
 });
 await assert.rejects(guarded({prepared:{}}),/GLOBAL_PILOT_BUDGET_REACHED/);
 assert.equal(reservations,1);
 assert.equal(calls,0);
});

test('Baseten successfully reserves before making exactly one provider request',async()=>{
 const actions=[];
 const guarded=createGuardedBasetenCaller({
  reserve:async(amount,provider)=>{actions.push('reserve:'+provider+':'+amount);return true;},
  estimate:()=>0.08,
  call:async()=>{actions.push('provider');return {status:'COMPLETED'};},
 });
 assert.deepEqual(await guarded({prepared:{}}),{status:'COMPLETED'});
 assert.deepEqual(actions,['reserve:baseten:0.08','provider']);
});

test('Baseten upstream timeout cannot trigger an automatic retry',async()=>{
 let calls=0;
 const guarded=createGuardedBasetenCaller({
  reserve:async()=>true,estimate:()=>0.1,
  call:async()=>{calls++;throw new Error('UPSTREAM_UNKNOWN');},
 });
 await assert.rejects(guarded({prepared:{}}),/UPSTREAM_UNKNOWN/);
 assert.equal(calls,1);
});

test('Modal job creation without cost status never reserves or calls endpoint',async()=>{
 let requests=0,reserved=0;
 const guarded=createGuardedModalLocalFetch({
  reserve:async()=>{reserved++;return true;},
  fetchImpl:async()=>{requests++;return ok();},
 });
 await assert.rejects(guarded(root+'/api/sfx/jobs',{method:'POST'}),/MODAL_COST_STATUS_NOT_VALIDATED/);
 assert.equal(requests,0);
 assert.equal(reserved,0);
});

test('Modal denied reserve blocks actual /api/sfx/jobs POST',async()=>{
 const actions=[];
 const guarded=createGuardedModalLocalFetch({
  reserve:async()=>{actions.push('reserve-denied');return false;},
  fetchImpl:async(url)=>{
   actions.push(new URL(url).pathname);
   return new URL(url).pathname==='/api/sfx/status'?status():ok();
  },
 });
 await guarded(root+'/api/sfx/status');
 await assert.rejects(guarded(root+'/api/sfx/jobs',{method:'POST'}),/GLOBAL_PILOT_BUDGET_REACHED/);
 assert.deepEqual(actions,['/api/sfx/status','reserve-denied']);
});

test('Modal reserve-before-POST applies once for an accepted new job',async()=>{
 const actions=[];
 const guarded=createGuardedModalLocalFetch({
  reserve:async(amount,provider)=>{actions.push('reserve:'+provider+':'+amount);return true;},
  fetchImpl:async(url)=>{
   const path=new URL(url).pathname;actions.push('http:'+path);
   return path==='/api/sfx/status'?status():ok();
  },
 });
 await guarded(root+'/api/sfx/status');
 await guarded(root+'/api/sfx/jobs',{method:'POST',body:'{}'});
 assert.deepEqual(actions,['http:/api/sfx/status','reserve:modal:0.08','http:/api/sfx/jobs']);
});

test('Modal rejects remote network destinations even if a valid local status was read',async()=>{
 let requests=0;
 const guarded=createGuardedModalLocalFetch({
  reserve:async()=>true,
  fetchImpl:async()=>{requests++;return status();},
 });
 await assert.rejects(guarded('https://api.example.net/api/sfx/jobs',{method:'POST'}),/SFX_PILOT_LOCAL_ONLY/);
 assert.equal(requests,0);
});

test('Modal refuses unknown or excessive price instead of starting a job',async()=>{
 const guarded=createGuardedModalLocalFetch({
  reserve:async()=>true,
  fetchImpl:async()=>new Response(JSON.stringify({estimatedMaxCostUsdPerRequest:2}),{status:200}),
 });
 await assert.rejects(guarded(root+'/api/sfx/status'),/MODAL_UNIT_RESERVATION_UNSAFE/);
});

test('invalid guard dependencies are rejected before any operation',()=>{
 assert.throws(()=>createGuardedBasetenCaller({reserve:async()=>true}));
 assert.throws(()=>createGuardedModalLocalFetch({reserve:async()=>true,fetchImpl:null}));
});
