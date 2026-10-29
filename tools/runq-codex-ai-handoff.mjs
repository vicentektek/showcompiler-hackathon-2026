#!/usr/bin/env node
/**
 * RUNQ 30-Oct Codex handoff — deterministic local QA, zero provider calls.
 * Default --plan writes the exact runbook only. --run-offline executes locally.
 * NEVER accepts --live, API keys or paid-request flags.
 */
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const MATRIX=Object.freeze([
 {id:'sfx-prompt',priority:'P0',argv:['--test','test/sfxEnglishPrompt.test.mjs'],
  purpose:'Spanish detection, separate Meta consent, strict English output, no Modal auto-start'},
 {id:'sfx-workflow',priority:'P0',argv:['--test','test/sfxJobRecovery.test.mjs','test/sfxReviewUx.test.mjs','test/sfxSimpleFlow.test.mjs','test/sfxRoutes.test.mjs'],
  purpose:'Pending jobs, budget caps, audition, accept/import, no GO or silent retry'},
 {id:'agent-contract',priority:'P0',argv:['--test','test/agentRoutes.test.mjs','test/cueConversationRoutes.test.mjs'],
  purpose:'Meta interpretation, schema validation, manual review, no transport mutations'},
 {id:'mass-agent',priority:'P0',argv:['tools/runq-agent-mass-eval.mjs','--cases','600','--seed','20261029'],
  purpose:'600 seeded OFFLINE examples, no model quality claims'},
 {id:'systematic-plan',priority:'P0',argv:['tools/runq-systematic-lab.mjs','--cases','hotel-door,gala-rundown','--modes','literal,balanced','--max-requests','4','--budget-usd','0.35'],
  purpose:'Provider evaluation DRY RUN only; never --live or --ack-paid'},
]);
const FLAGS=new Set(['--plan','--run-offline']);
function mainArgs(argv){
 if(argv.some(x=>!FLAGS.has(x))||new Set(argv).size!==argv.length||argv.includes('--plan')&&argv.includes('--run-offline'))
  throw new Error('Only --plan or --run-offline are supported. Live/paid flags are forbidden.');
 return argv.includes('--run-offline')?'OFFLINE':'PLAN_ONLY';
}
export async function runCodexQaHandoff({argv=[],dir=resolve('artifacts/codex-ai-2026-10-30'),runner=spawnSync}={}){
 const mode=mainArgs(argv),startedAt=new Date().toISOString();
 const results=[];
 for(const item of MATRIX){
  let state='PLAN_ONLY',elapsedMs=null,exitCode=null;
  if(mode==='OFFLINE'){
   const t=Date.now();
   const child=runner(process.execPath,item.argv,{cwd:process.cwd(),
     encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024,
     env:{...process.env,RUNQ_PAID_TESTS:'0',RUNQ_NO_PROVIDER_CALLS:'1'}});
   elapsedMs=Date.now()-t;
   exitCode=typeof child.status==='number'?child.status:1;
   state=exitCode===0?'PASS':'FAIL';
   // Only concise tail from test failure, never full source, script or credential data.
   // Raw logs deliberately not persisted.
  }
  results.push({id:item.id,priority:item.priority,purpose:item.purpose,
    command:'node '+item.argv.join(' '),state,elapsedMs,exitCode});
 }
 const report={
  schema:'runq.codex-ai-qa-handoff.v1',mode,startedAt,finishedAt:new Date().toISOString(),
  providerCallsAuthorized:false,providerCallsMadeByHarness:0,
  results,passed:results.filter(x=>x.state==='PASS').length,
  failed:results.filter(x=>x.state==='FAIL').length,
  limitations:[
    'Synthetic tests do not measure live model semantic accuracy or acoustic quality.',
    'No Meta, Baseten, Modal, GPU or microphone requests are made by this harness.',
    'GitHub Actions cannot run the VS Code Codex agent or user hardware tests.',
  ],
 };
 const markdown=[
  '# RUNQ Codex AI QA — 2026-10-30',
  '',
  '**Mode:** '+mode+' · **Paid API calls:** NONE · **Failures:** '+report.failed,
  '',
  '| Priority | Test | Status | Command |','|---|---|---|---|',
  ...results.map(r=>`| ${r.priority} | ${r.id} | ${r.state} | \`${r.command}\` |`),
  '',
  '## Codex work queue — minimize token/context costs',
  '',
  '1. Read ONLY AGENTS.md, this report, docs/CODEX_AI_QA_TOMORROW_2026-10-30.md and files relevant to the FIRST failure.',
  '2. If a test is red, reproduce that precise test, find root cause, add one regression and the smallest fix; do not refactor unrelated modules.',
  '3. If all tests are green: review uncovered risks in the prompt review UX and voice autopilot, and propose the next **offline** regression, without executing cloud requests.',
  '4. Run focused tests after each change; run full npm run qa:codex once after a coherent fix.',
  '5. Record evidence (SHA, commands, outcomes, screenshots if local Chrome available), known risks and next bounded task. Do not merge by default.',
  '',
  '## Provider test gate',
  '',
  'Any actual Muse/Meta or Modal request requires explicit operator approval for count, model, date and maximum spend. Do not infer authorization from this handoff. No retries; no billable CI or cron.',
  '',
 ].join('\n');
 await mkdir(dir,{recursive:true});
 await Promise.all([
  writeFile(join(dir,'summary.json'),JSON.stringify(report,null,2)+'\n'),
  writeFile(join(dir,'codex-next-task.md'),markdown),
 ]);
 return report;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const report=await runCodexQaHandoff({argv:process.argv.slice(2)});
  console.log('RUNQ_CODEX_AI_HANDOFF '+JSON.stringify({mode:report.mode,passed:report.passed,failed:report.failed,
    report:'artifacts/codex-ai-2026-10-30/codex-next-task.md',providerCalls:0}));
  if(report.failed)process.exitCode=1;
 }catch{
  console.error('RUNQ Codex QA handoff rejected flags or failed. No paid calls attempted.');
  process.exitCode=1;
 }
}
