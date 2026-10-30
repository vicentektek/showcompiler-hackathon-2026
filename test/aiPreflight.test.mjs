import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_PREFLIGHT_STEPS,ensureOfflineSteps,runAiPreflight}
 from '../tools/runq-ai-preflight.mjs';

test('AI preflight lists only zero-cost planning, QA and local test commands',()=>{
 const steps=ensureOfflineSteps();
 assert.equal(steps.length,8);
 assert.ok(steps.some(x=>x.id==='agent-mass'));
 assert.ok(steps.some(x=>x.id==='agent-live-plan'));
 assert.ok(steps.every(x=>!['qa:agent:live','qa:meta:live'].includes(x.command)));
 assert.throws(()=>ensureOfflineSteps([{id:'unsafe',command:'qa:agent:live',
  args:['--','--live','--ack-paid']}]),/PREFLIGHT_CONTAINS_PAID_ACTION/);
});
test('AI preflight injects no paid API keys and yields a summary without running network',async()=>{
 let executed=0;
 const result=await runAiPreflight({execute:(step,env)=>{
  executed++;
  assert.ok(step.id);
  assert.equal(env.MODEL_API_KEY,'');
  assert.equal(env.BASETEN_API_KEY,'');
  assert.equal(env.RUNQ_SFX_PILOT_ENABLED,'0');
  return {status:0};
 }});
 assert.equal(executed,AI_PREFLIGHT_STEPS.length);
 assert.equal(result.paidRequests,0);
 assert.equal(result.passed,true);
 assert.ok(result.results.every(x=>x.passed));
});
