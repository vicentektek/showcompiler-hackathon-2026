import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseExperimentOptions, analyzeExperiment,
  runSystematicExperiment } from '../tools/runq-systematic-lab.mjs';
import { readSeminarCorpus } from '../tools/seminarCorpus.mjs';
import { acquireMetaBudgetLedger } from '../tools/metaBudgetLedger.mjs';
import { runMetaSeminarEval } from '../tools/metaSeminarEval.mjs';

const temp=async t=>{const p=await mkdtemp(join(tmpdir(),'runq-systematic-'));
  t.after(()=>rm(p,{recursive:true,force:true}));return p;};

test('systematic CLI is free by default and rejects unsafe paid, options and paths',()=>{
  assert.equal(parseExperimentOptions([]).live,false);
  assert.deepEqual(parseExperimentOptions(['--modes','literal,balanced']).modes,['literal','balanced']);
  for(const args of [
    ['--live'],['--ack-paid'],['--live','--ack-paid','--budget-usd','2.01'],
    ['--max-requests','21'],['--modes','literal,literal'],['--modes','bad'],
    ['--cases','../private'],['--output','../../private'],['--api-key','unsafe'],
    ['--live','--ack-paid','--live'],
  ])assert.throws(()=>parseExperimentOptions(args),TypeError);
});
test('full dry-run grid makes no provider requests, creates only synthetic reports',async t=>{
  const parent=await temp(t);
  const output=join(parent,'runs');
  // CLI restricts output to artifacts/ by design. Set CWD to fixture root
  // and use an ignored artifacts directory under repository for integration.
  let calls=0;
  const {summary,folder}=await runSystematicExperiment({
    modes:['literal','balanced'],cases:['hotel-door','gala-rundown'],
    output:'artifacts/systematic-eval',maxRequests:8,
  },{runEval:async o=>{
    assert.equal(o.live,false);
    return runMetaSeminarEval({...o,modelCaller:async()=>{calls++;throw Error('NO');}});
  }});
  assert.equal(calls,0);
  assert.equal(summary.submittedRequests,0);
  assert.equal(summary.runs.length,4);
  assert.equal(summary.analysis.completed,0);
  assert.equal(summary.analysis.comparisons.length,0);
  assert.ok(summary.measurements.requests>0);
  assert.equal(summary.measurements.tokens.prompt,0);
  const report=await readFile(join(folder,'summary.md'),'utf8');
  assert.match(report,/No matched pair/);
  assert.match(await readFile(join(folder,'codex-next-task.md'),'utf8'),/Never make Meta requests/);
});
test('typed event trace keeps only source reference and transport, not full model response',async t=>{
  const dir=await temp(t);
  const corpus=await readSeminarCorpus();
  const sample=corpus.cases.find(c=>c.id==='hotel-door');
  const report=await runMetaSeminarEval({
    live:true,ackPaid:true,apiKey:'MOCK',caseId:'hotel-door',
    maxRequests:1,budgetUsd:.15,output:join(dir,'sample'),
    modelCaller:async()=>({
      details:sample.expected.filter(e=>e.transport==='PLAY').map(e=>({
        sourceLineId:e.lineId,transport:e.transport,cueKind:e.cueKind,basis:e.basis,
        label:'HIDDEN model label',reason:'private response data',soundPrompt:'PRIVATE_AUDIO_PROMPT',
      })),
      observations:[...sample.expected.filter(e=>e.transport!=='PLAY').map(e=>({
        sourceLineId:e.lineId,transport:e.transport,cueKind:e.cueKind,basis:e.basis,
      })),{
        sourceLineId:'L5',transport:'SILENCE',cueKind:'SILENCE',basis:'EXPLICIT',
      }],
      coverage:{analyzedWindowIds:['S1-W1'],nextWindowStart:null},
      diagnostics:{finishReason:'stop',durationMs:321,
        usage:{promptTokens:1000,completionTokens:2000,reasoningTokens:400,cachedPromptTokens:100}},
    }),
  });
  assert.equal(report.cases[0].eventTrace.length,4);
  assert.equal(report.measurements.latencyMs.total,321);
  assert.deepEqual(report.measurements.tokens,{requestsWithUsage:1,prompt:1000,
    completion:2000,reasoning:400,cachedPrompt:100});
  assert.deepEqual(report.cases[0].eventTrace.find(x=>x.sourceLineId==='L5'),
    {sourceLineId:'L5',transport:'SILENCE',cueKind:'SILENCE',basis:'EXPLICIT'});
  const written=await readFile(join(dir,'sample','report.json'),'utf8');
  assert.doesNotMatch(written,/PRIVATE_AUDIO_PROMPT|private response data|HIDDEN model label|MOCK/);
});
test('matched case A/B computes score changes only for complete runs',async()=>{
  const corpus=await readSeminarCorpus();
  const gold=corpus.cases.find(c=>c.id==='hotel-door');
  const ideal=gold.expected.map(e=>({
    sourceLineId:e.lineId,transport:e.transport,cueKind:e.cueKind,basis:e.basis,
  }));
  const bad=[...ideal,{sourceLineId:'L5',transport:'SILENCE',
    cueKind:'SILENCE',basis:'EXPLICIT'}];
  const analysis=analyzeExperiment(corpus,[
    {caseId:'hotel-door',mode:'literal',complete:true,events:bad},
    {caseId:'hotel-door',mode:'balanced',complete:true,events:ideal},
    {caseId:'gala-rundown',mode:'literal',complete:false,reason:'TRUNCATED'},
  ]);
  assert.equal(analysis.completed,2);
  assert.equal(analysis.comparisons.length,1);
  assert.equal(analysis.comparisons[0].baselineF1,.8571428571428571);
  assert.equal(analysis.comparisons[0].candidateF1,1);
  assert.equal(analysis.errors[0].lineId,'L5');
  assert.equal(analysis.errors[0].observed.transport,'SILENCE');
  assert.equal(analysis.incomplete.length,1);
});
test('live experiment requires ledger and does not bypass previously reserved spend',async t=>{
  const dir=await temp(t);
  const ledger=await acquireMetaBudgetLedger({file:join(dir,'budget.json'),limitUsd:0.01});
  let called=0;
  const {summary}=await runSystematicExperiment({
    live:true,ackPaid:true,budgetUsd:.2,maxRequests:2,
    cases:['hotel-door'],modes:['literal'],output:'artifacts/systematic-eval',
  },{apiKey:'FAKE',acquireLedger:async()=>ledger,
    modelCaller:async()=>{called++;throw Error('MUST_NOT_CALL')}});
  assert.equal(called,0);
  assert.equal(summary.submittedRequests,0);
  assert.equal(summary.analysis.completed,0);
  assert.equal(summary.runs[0].reason,'GLOBAL_BUDGET_REACHED');
});

test('programmatic live execution requires ack even if caller bypasses CLI',async()=>{
  await assert.rejects(runSystematicExperiment({live:true,ackPaid:false,cases:['hotel-door']}),TypeError);
});
