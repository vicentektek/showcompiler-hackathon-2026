#!/usr/bin/env node
/**
 * No paid provider calls. Run the local acceptance readiness gates from one
 * command before requesting authorization for Meta/Baseten/Modal evaluation.
 * Run with a clean worktree and Node >=20.
 */
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const AI_PREFLIGHT_STEPS=Object.freeze([
 {id:'syntax',command:'check:syntax',critical:true},
 {id:'regressions',command:'test',critical:true},
 {id:'codex',command:'qa:codex',critical:true},
 {id:'agent-mass',command:'qa:agent:mass',args:['--','--cases','2400','--seed','20261031'],critical:true},
 {id:'agent-live-plan',command:'qa:agent:live:plan',critical:true},
 {id:'meta-plan',command:'qa:meta:plan',critical:true},
 {id:'baseten-plan',command:'qa:baseten:plan',critical:true},
 {id:'systematic-plan',command:'qa:systematic',critical:true},
]);
// Explicit allowlist: a script named qa:meta:live can bill even without CLI flags.
// Never trust a caller-supplied list of arbitrary npm scripts for this preflight.
const SAFE=Object.freeze({
 'check:syntax':null,
 test:null,
 'qa:codex':null,
 'qa:agent:mass':['--','--cases','2400','--seed','20261031'],
 'qa:agent:live:plan':null,
 'qa:meta:plan':null,
 'qa:baseten:plan':null,
 'qa:systematic':null
});
export function ensureOfflineSteps(steps=AI_PREFLIGHT_STEPS){
 if(!Array.isArray(steps)||steps.length!==AI_PREFLIGHT_STEPS.length)
  throw new TypeError('PREFLIGHT_CONTAINS_PAID_ACTION');
 const seen=new Set();
 for(const step of steps){
  const expected=Object.hasOwn(SAFE,step?.command)?SAFE[step.command]:undefined;
  if(expected===undefined||seen.has(step.command)||
     !step.id||!step.critical||
     JSON.stringify(step.args??null)!==JSON.stringify(expected))
   throw new TypeError('PREFLIGHT_CONTAINS_PAID_ACTION');
  seen.add(step.command);
 }
 return steps;
}
export async function runAiPreflight({execute=(step,env)=>{
 const program=process.platform==='win32'?'npm.cmd':'npm';
 return spawnSync(program,['run',step.command,...(step.args??[])],{
  cwd:process.cwd(),env,stdio:'inherit',timeout:12*60*1000,
  shell:process.platform==='win32',
 });
}}={}){
 const results=[];
 // Even an accidental provider-client regression cannot use inherited API keys.
 // Never print, upload or persist secrets; this suite is strictly offline.
 const env={...process.env,MODEL_API_KEY:'',BASETEN_API_KEY:'',
  MODAL_PROXY_TOKEN_ID:'',MODAL_PROXY_TOKEN_SECRET:'',
  RUNQ_SFX_PILOT_ENABLED:'0',CI:'true'};
 const started=new Date().toISOString();
 for(const step of ensureOfflineSteps()){
  process.stdout.write('\nRUNQ AI PREFLIGHT · '+step.id+' (OFFLINE)\n');
  const before=performance.now();
  const result=execute(step,env);
  const passed=result?.status===0&&!result?.error&&!result?.signal;
  results.push({id:step.id,passed,critical:step.critical,
   durationMs:Math.round(performance.now()-before),
   exitCode:Number.isInteger(result?.status)?result.status:null,
   issue:result?.error?'PROCESS_ERROR':result?.signal?'INTERRUPTED':null});
 }
 const passed=results.every(r=>r.passed);
 const report={version:1,kind:'OFFLINE_AI_PREFLIGHT',startedAt:started,
  finishedAt:new Date().toISOString(),paidRequests:0,passed,results};
 const folder=resolve('artifacts/ai-preflight');
 await mkdir(folder,{recursive:true});
 await writeFile(folder+'/summary.json',JSON.stringify(report,null,2)+'\n');
 process.stdout.write('RUNQ AI PREFLIGHT: '+results.filter(r=>r.passed).length+
  '/'+results.length+' gates PASS; paid requests 0; artifacts/ai-preflight/summary.json\n');
 return report;
}
const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked){
 if(process.argv.length!==2)throw new TypeError('NO_EXTRA_ARGUMENTS_ALLOWED');
 const result=await runAiPreflight();
 if(!result.passed)process.exitCode=1;
}
