#!/usr/bin/env node
/**
 * RunQ SFX latency laboratory — default is READ ONLY.
 * Uses the SAME local SFX route, journal, daily limits and spending policy as RunQ.
 * Paid runs are sequential, never retried, and require --live --ack-paid.
 * Provider billing is authoritative; estimates are NOT hard cloud cost ceilings.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAppServer, loadLocalSfxEnvironment } from './dev-server.mjs';
import { createSfxJobStore } from '../src/core/sfxJobStore.mjs';

const ACTIVE=new Set(['SUBMISSION_UNKNOWN','QUEUED','RUNNING','CANCEL_REQUESTED']);
const CASES=Object.freeze([
  {name:'cold-start',durationSeconds:4,seed:42,
   prompt:'A heavy wooden door slowly creaks open and then slams shut in an empty room. Realistic short echo. No voices or music.'},
  {name:'warm-reuse',durationSeconds:4,seed:42,
   prompt:'A heavy wooden door slowly creaks open and then slams shut in an empty room. Realistic short echo. No voices or music.'},
  {name:'different-sound',durationSeconds:5,seed:44,
   prompt:'Heavy rain falling against a window with distant low thunder rumble, natural outdoor ambience, no voices or music.'},
]);

export function parseSfxLatencyArgs(args=[]) {
  const opt={live:false,ackPaid:false,maxCalls:2,budgetUsd:0.20,timeoutSeconds:90,output:'.runq-local/sfx-latency-lab'};
  const keys=new Set();
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(keys.has(key))throw new TypeError('Repeated option');
    keys.add(key);
    if(key==='--live'){opt.live=true;continue;}
    if(key==='--ack-paid'){opt.ackPaid=true;continue;}
    if(!['--max-calls','--budget-usd','--timeout-seconds','--output'].includes(key)||
       !args[i+1]||args[i+1].startsWith('--'))throw new TypeError('Unexpected option: '+key);
    const val=args[++i];
    if(key==='--max-calls')opt.maxCalls=Number(val);
    else if(key==='--budget-usd')opt.budgetUsd=Number(val);
    else if(key==='--timeout-seconds')opt.timeoutSeconds=Number(val);
    else if(key==='--output')opt.output=val;
  }
  if(opt.live!==opt.ackPaid||!Number.isSafeInteger(opt.maxCalls)||
     opt.maxCalls<1||opt.maxCalls>3||!Number.isFinite(opt.budgetUsd)||
     opt.budgetUsd<=0||opt.budgetUsd>1||
     !Number.isSafeInteger(opt.timeoutSeconds)||opt.timeoutSeconds<30||
     opt.timeoutSeconds>300||typeof opt.output!=='string'||!opt.output.startsWith('.runq-local/')||
     opt.output.includes('..')||!/^[.a-zA-Z0-9_/-]+$/.test(opt.output)){
    throw new TypeError('Invalid latency test parameters or missing explicit paid authorization');
  }
  return opt;
}

const pause=ms=>new Promise(r=>setTimeout(r,ms));
const round=n=>Number(n.toFixed(3));

export async function runSfxLatencyLab(opt,{serverFactory=()=>createAppServer({
  sfxStore:createSfxJobStore({directory:resolve('.runq-local/sfx-generation'),maxDailyStarts:6}),
}),envLoader=loadLocalSfxEnvironment,
  fetchImpl=globalThis.fetch,now=()=>Date.now(),sleep=pause}={}){
  await envLoader();
  const server=serverFactory();
  await new Promise((ok,fail)=>{
    server.once('error',fail);
    server.listen(0,'127.0.0.1',ok);
  });
  const base='http://127.0.0.1:'+server.address().port;
  const session={kind:opt.live?'AUTHORIZED_MODAL_SFX_LATENCY_TEST':'READ_ONLY_PLAN',
    startedAt:new Date().toISOString(),cases:[],maxRequests:opt.maxCalls,
    operatorBudgetUsd:opt.budgetUsd,providerBilling:'CHECK_MODAL_DASHBOARD',
    warning:'Budget is an estimated local reservation, not a guaranteed Modal billing ceiling'};
  async function api(path,method='GET',body){
    const headers={};
    if(method==='POST'){headers.Origin=base;headers['Content-Type']='application/json';}
    let response;
    try{response=await fetchImpl(base+path,{method,headers,
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
      signal:AbortSignal.timeout(55000)});}
    catch {throw new Error('Local request transport failed. Outcome unknown: never resubmit automatically.');}
    const result=await response.json();
    if(!response.ok) {
      const error=new Error('RunQ returned '+response.status+' / '+(result?.code??'UNKNOWN')+
        '; do not retry automatically');
      error.code=result?.code??'UNKNOWN';
      throw error;
    }
    return result;
  }
  try{
    const config=await api('/api/sfx/status');
    const existing=await api('/api/sfx/jobs');
    const unfinished=existing.jobs.filter(j=>ACTIVE.has(j.status));
    session.preflight={
      configured:config.enabled,model:config.model,
      existingJobs:existing.jobs.length,activeJobs:unfinished.map(j=>({requestId:j.requestId,status:j.status})),
      estimatePerRequestUsd:config.estimatedMaxCostUsdPerRequest,
      dailyBudgetUsd:config.dailyBudgetUsd,
      checkedAt:new Date().toISOString(),
    };
    if(!opt.live){
      session.cases=CASES.slice(0,opt.maxCalls).map(c=>({name:c.name,durationSeconds:c.durationSeconds,paid:false}));
      return session;
    }
    if(!config.enabled)throw new Error('SFX provider is not configured in this checkout. No submissions.');
    if(unfinished.length)throw new Error('Unresolved RunQ SFX jobs: '+unfinished.map(j=>j.requestId+' ('+j.status+')').join(', ')+'. Verify or cancel them in Modal and reconcile the journal first. No submissions.');
    const unit=config.estimatedMaxCostUsdPerRequest;
    if(!Number.isFinite(unit)||unit<=0||unit*opt.maxCalls>opt.budgetUsd+1e-9||
       unit*opt.maxCalls>config.dailyBudgetUsd+1e-9){
      throw new Error('Estimated per-request reservations exceed this laboratory budget. No submissions.');
    }
    for(const c of CASES.slice(0,opt.maxCalls)){
      const requestId='lab-'+randomUUID();
      const authorizationId='lab-'+randomUUID();
      const record={name:c.name,requestId,status:'NOT_SUBMITTED',durationSeconds:c.durationSeconds,
        estimatedReservationUsd:unit};
      session.cases.push(record);
      const first=now();
      // Authorize exactly one request; the existing SFX journal consumes the
      // authorization BEFORE contacting the remote provider.
      let start;
      try{
        start=await api('/api/sfx/jobs','POST',{
          requestId,authorizationId,sourceLineId:null,
          kind:'SFX',prompt:c.prompt,durationSeconds:c.durationSeconds,
          seed:c.seed,confirmed:true,acknowledgedMaxCostUsd:unit
        });
      }catch(error){
        record.status='SUBMISSION_UNKNOWN_OR_REJECTED';
        record.reason=error.code??'UNKNOWN';
        session.stoppedReason='Submission failed or outcome is unknown; inspect Modal before any new paid call.';
        return session;
      }
      record.submitHttpMs=round(now()-first);
      record.status=start.status??'QUEUED';
      record.submittedAt=new Date().toISOString();
      // Provider reports RUNNING while Modal may still be QUEUED; do not claim
      // queue-vs-inference timing without Modal-side call metrics.
      while(true){
        const elapsed=now()-first;
        if(elapsed>=opt.timeoutSeconds*1000){
          record.status='TIMEOUT_CANCEL_REQUESTED';
          record.elapsedMs=round(elapsed);
          try{
            const res=await api('/api/sfx/jobs/'+requestId+'/cancel','POST',{});
            record.status=res.status??'CANCEL_REQUESTED';
          }catch(error){
            record.cancelError=error.code??'UNKNOWN';
          }
          session.stoppedReason='Timeout. Cancellation must be verified on Modal; no more paid jobs.';
          return session;
        }
        await sleep(Math.min(5000,Math.max(1000,opt.timeoutSeconds*1000-elapsed)));
        let result;
        try {result=await api('/api/sfx/jobs/'+requestId+'/refresh','POST',{});}
        catch(error){
          record.status='REFRESH_UNKNOWN';
          record.reason=error.code??'UNKNOWN';
          session.stoppedReason='Poll failed. Check Modal manually; no automatic resubmission.';
          return session;
        }
        record.status=result.status;
        if(result.status==='READY_FOR_REVIEW'){
          record.readyWallMs=round(now()-first);
          record.wav=result.wav?{
            byteLength:result.wav.byteLength,
            durationSeconds:result.wav.durationSeconds,
            sha256:result.wav.sha256
          }:null;
          record.latencies=result.latencies??null;
          record.completedAt=new Date().toISOString();
          break;
        }
        if(['FAILED','CANCELLED','CANCEL_REQUESTED','SUBMISSION_UNKNOWN'].includes(result.status)){
          record.elapsedMs=round(now()-first);
          session.stoppedReason='Non-success terminal/uncertain state. No more paid jobs.';
          return session;
        }
      }
    }
    session.finishedAt=new Date().toISOString();
    return session;
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
}

async function main(){
  const opt=parseSfxLatencyArgs(process.argv.slice(2));
  if(opt.live)console.log('Authorized SFX lab: sequential paid calls, max '+opt.maxCalls+
    ', local estimated reservations $'+opt.budgetUsd.toFixed(2)+
    ', timeout '+opt.timeoutSeconds+'s per job; no automatic retry.');
  const dir=resolve(opt.output);
  let report;
  try{report=await runSfxLatencyLab(opt);}
  catch(error){
    console.error('Lab stopped: '+error.message);
    process.exitCode=1;
    return;
  }
  if(opt.live){
    await mkdir(dir,{recursive:true});
    const path=join(dir,'report-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
    await writeFile(path,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('Report: '+path);
  }
  console.log(JSON.stringify(report,null,2));
  if(!opt.live)console.log('READ ONLY: no paid calls. To execute use --live --ack-paid (and review existing pending jobs).');
  else if(report.stoppedReason)process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{console.error('Lab failed safely: '+e.message);process.exitCode=1;});
}
