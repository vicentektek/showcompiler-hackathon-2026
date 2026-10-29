import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {MATRIX,runCodexQaHandoff} from '../tools/runq-codex-ai-handoff.mjs';

test('Codex handoff plan is bounded, costs zero, and rejects all live flags',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'runq-codex-handoff-'));
 try{
  const data=await runCodexQaHandoff({argv:['--plan'],dir});
  assert.equal(data.mode,'PLAN_ONLY');
  assert.equal(data.providerCallsAuthorized,false);
  assert.equal(data.providerCallsMadeByHarness,0);
  assert.equal(data.results.length,MATRIX.length);
  assert.ok(data.results.every(x=>x.state==='PLAN_ONLY'&&!x.command.includes('--live')));
  const markdown=await readFile(join(dir,'codex-next-task.md'),'utf8');
  assert.match(markdown,/No retries/);
  assert.match(markdown,/Do not merge/);
  assert.match(markdown,/Codex work queue/);
  await assert.rejects(runCodexQaHandoff({argv:['--live'],dir}));
  await assert.rejects(runCodexQaHandoff({argv:['--ack-paid'],dir}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('offline execution produces red status for failed step; no retries or provider calls',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'runq-codex-handoff-'));
 let calls=0;
 try{
  const data=await runCodexQaHandoff({argv:['--run-offline'],dir,runner:(_exe,_args,opts)=>{
    calls++;assert.equal(opts.env.RUNQ_NO_PROVIDER_CALLS,'1');
    return {status:calls===2?1:0};
  }});
  assert.equal(calls,MATRIX.length);
  assert.equal(data.failed,1);
  assert.equal(data.providerCallsMadeByHarness,0);
  assert.equal(data.results[1].state,'FAIL');
 }finally{await rm(dir,{recursive:true,force:true});}
});
