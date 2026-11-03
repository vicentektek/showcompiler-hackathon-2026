import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../tools/dev-server.mjs';
import { createSfxJobStore } from '../src/core/sfxJobStore.mjs';
import { parseSfxLatencyArgs, runSfxLatencyLab } from '../tools/sfx-latency-lab.mjs';

test('SFX latency lab is read-only by default and strictly bounded', () => {
  assert.deepEqual(parseSfxLatencyArgs().live,false);
  assert.deepEqual(parseSfxLatencyArgs().maxCalls,2);
  assert.throws(()=>parseSfxLatencyArgs(['--live']), /authorization/i);
  assert.throws(()=>parseSfxLatencyArgs(['--ack-paid']), /authorization/i);
  assert.throws(()=>parseSfxLatencyArgs(['--live','--ack-paid','--max-calls','4']));
  assert.equal(parseSfxLatencyArgs(['--live','--ack-paid','--budget-usd','1.1']).budgetUsd,1.1);
  assert.throws(()=>parseSfxLatencyArgs(['--live','--ack-paid','--timeout-seconds','5']));
  assert.throws(()=>parseSfxLatencyArgs(['--live','--ack-paid','--output','../secrets']));
});

test('offline preview does not contact generation provider', async () => {
  const dir=await mkdtemp(join(tmpdir(),'runq-sfx-lab-'));
  try {
    let starts=0;
    const result=await runSfxLatencyLab(parseSfxLatencyArgs(),{
      envLoader:async()=>{},
      serverFactory:()=>createAppServer({
        reserveCampaign:async()=>{},
        sfxStore:createSfxJobStore({directory:dir}),
        sfxConfig:()=>({enabled:false,estimatedMaxCostUsdPerRequest:0.05,dailyBudgetUsd:0.5}),
        sfxPilotClient:{start:async()=>{starts++;throw new Error('unexpected paid call');}},
      }),
    });
    assert.equal(result.kind,'READ_ONLY_PLAN');
    assert.equal(starts,0);
    assert.equal(result.cases.length,2);
    assert.equal(result.preflight.activeJobs.length,0);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('paid lab cancels stalled first job and never sends second', async () => {
  const dir=await mkdtemp(join(tmpdir(),'runq-sfx-lab-'));
  try {
    let starts=0,cancels=0,tick=0;
    const cfg={enabled:true,endpointUrl:'https://dummy.modal.run',proxyTokenId:'wk-dummy',
      proxyTokenSecret:'ws-dummy',estimatedMaxCostUsdPerRequest:0.05,dailyBudgetUsd:0.5,
      modelRevision:'a'.repeat(40)};
    const client={
      start:async()=>{starts++;return {jobId:'fc-safetest',status:'QUEUED'};},
      status:async()=>({jobId:'fc-safetest',status:'RUNNING'}),
      cancel:async()=>{cancels++;return {jobId:'fc-safetest',status:'CANCEL_REQUESTED'};},
    };
    const result=await runSfxLatencyLab(parseSfxLatencyArgs(
      ['--live','--ack-paid','--timeout-seconds','30']),{
        envLoader:async()=>{},
        now:()=>tick,
        sleep:async ms=>{tick+=ms;},
        serverFactory:()=>createAppServer({
          reserveCampaign:async()=>{},
          sfxStore:createSfxJobStore({directory:dir,maxDailyStarts:3}),
          sfxConfig:()=>cfg,sfxPilotClient:client,
        }),
      });
    assert.equal(starts,1);
    assert.equal(cancels,1);
    assert.equal(result.cases.length,1);
    assert.equal(result.cases[0].status,'CANCEL_REQUESTED');
    assert.match(result.stoppedReason,/Cancellation/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
