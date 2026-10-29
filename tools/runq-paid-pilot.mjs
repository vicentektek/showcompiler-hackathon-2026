#!/usr/bin/env node
/**
 * RunQ paid PILOT coordinator. No full campaign mode.
 *
 * Never calls APIs without: --live AND --ack-paid, a local USD 30 approved
 * budget ledger, a clean pinned Git checkout, and remaining pilot call quota.
 * All paid providers are serialized under a cross-checkout ledger lock.
 *
 * Meta/Baseten = real model APIs, using existing validated RunQ evaluators.
 * Modal = existing guarded SFX HTTP workflow and local job journal.
 * Voice needs a rights-clear, operator-reviewed audio gold fixture and is
 * deliberately unavailable until one exists.
 *
 * No auto retry, no CI use, no direct WebAudio or speaker transport.
 */
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {acquireGlobalSpendLedger,globalLedgerDefaultPath} from '../src/qa/globalSpendLedger.mjs';
import {createAppServer} from './dev-server.mjs';
import {createSfxJobStore} from '../src/core/sfxJobStore.mjs';
import {validateMassCampaign} from './mass-campaign-preflight.mjs';
import {runMetaSeminarEval} from './metaSeminarEval.mjs';
import {
 runBasetenSeminarEval,callBasetenTheatre,makeBasetenTheatreRequest,
} from './basetenSeminarEval.mjs';
import {runSfxLatencyLab} from './sfx-latency-lab.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const campaignPath=join(root,'fixtures/qa/mass-campaign-manifest-v1.json');
export const PILOT_LIMITS=Object.freeze({meta:8,baseten:5,modal:2});
const allowedModes=new Set(['literal','balanced','expressive']);
const casePattern=/^[a-z][a-z0-9-]{1,60}$/;

export function parsePaidPilotOptions(args=[]){
 const options={live:false,ackPaid:false,provider:null,requests:1,mode:'literal',caseId:null,dashboardVerified:false};
 const seen=new Set();
 for(let i=0;i<args.length;i++){
  const flag=args[i];
  if(seen.has(flag))throw new TypeError('REPEATED_PILOT_FLAG');
  seen.add(flag);
  if(flag==='--live'){options.live=true;continue;}
  if(flag==='--ack-paid'){options.ackPaid=true;continue;}
  if(flag==='--dashboard-verified'){options.dashboardVerified=true;continue;}
  if(!['--provider','--requests','--mode','--case'].includes(flag)||!args[i+1]||args[i+1].startsWith('--')){
   throw new TypeError('INVALID_PILOT_FLAG');
  }
  const value=args[++i];
  if(flag==='--provider')options.provider=value;
  if(flag==='--requests')options.requests=Number(value);
  if(flag==='--mode')options.mode=value;
  if(flag==='--case')options.caseId=value;
 }
 if(!Object.hasOwn(PILOT_LIMITS,options.provider)){
  throw new TypeError('ONLY_META_BASETEN_MODAL_PILOT_SUPPORTED');
 }
 if(!Number.isSafeInteger(options.requests)||options.requests<1||options.requests>PILOT_LIMITS[options.provider]){
  throw new TypeError('PILOT_CALL_COUNT_OUT_OF_RANGE');
 }
 if(!allowedModes.has(options.mode)||
    (options.caseId!==null&&!casePattern.test(options.caseId))||
    (options.provider==='modal'&&(options.caseId!==null||options.mode!=='literal'))){
  throw new TypeError('INVALID_PILOT_CASE_OR_MODE');
 }
 if(options.live!==options.ackPaid){
  throw new TypeError('PAID_PILOT_REQUIRES_BOTH_FLAGS');
 }
 if(options.live&&!options.dashboardVerified){
  throw new TypeError('PAID_PILOT_REQUIRES_DASHBOARD_BILLING_CHECK');
 }
 return options;
}

export function estimateBasetenReserve(prepared){
 const body=makeBasetenTheatreRequest(prepared);
 const bytes=Buffer.byteLength(JSON.stringify(body),'utf8');
 const maximum=body.max_tokens;
 if(!Number.isSafeInteger(maximum)||maximum<=0||maximum>8192||bytes>100000){
  throw new TypeError('BASE TEN REQUEST LIMIT EXCEEDED');
 }
 // Conservative UTF-8 input byte upper bound plus model scaffolding.
 // Adds a small buffer; not a provider-side billing guarantee.
 const estimate=((bytes+16384)*1.25+maximum*4.25)/1e6+0.01;
 return Number(estimate.toFixed(6));
}

export function enforcePilotAllowance(options,status){
 const current=status?.perProvider?.[options.provider];
 const count=current?.requestCount;
 if(!Number.isSafeInteger(count)||count<0)throw new TypeError('MISSING_GLOBAL_PILOT_COUNTS');
 const remaining=PILOT_LIMITS[options.provider]-count;
 if(remaining<=0||options.requests>remaining){
  throw new Error('PILOT_CALL_QUOTA_EXHAUSTED: '+options.provider+' has '+Math.max(0,remaining)+' requests left.');
 }
 if(!Number.isFinite(current.capUsd)||!Number.isFinite(current.reservedUsd)||
    current.capUsd<=current.reservedUsd){
  throw new Error('PROVIDER_BUDGET_EXHAUSTED');
 }
 return remaining;
}

function commitIdentity(){
 const options={cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']};
 const sha=execFileSync('git',['rev-parse','HEAD'],options).trim();
 if(!/^[0-9a-f]{40}$/.test(sha))throw new Error('UNPINNED_GIT_COMMIT');
 const changes=execFileSync('git',['status','--porcelain','--untracked-files=no'],options).trim();
 if(changes)throw new Error('TRACKED_FILES_DIRTY_FREEZE_CHECKOUT_BEFORE_PAID_TESTS');
 return sha;
}

function createRunId(){
 return 'pilot_'+randomUUID().replaceAll('-','');
}
function safeOutput(runId){
 // Baseten report output must match /^artifacts\/[a-z0-9-]{1,60}$/.
 return 'artifacts/'+runId.replaceAll('_','-');
}

export async function runPaidPilot(options,{fetchImpl=globalThis.fetch}={}){
 if(!options.live||!options.ackPaid||!options.dashboardVerified){
  throw new Error('EXPLICIT_LIVE_ACK_AND_DASHBOARD_CHECK_REQUIRED');
 }
 const manifest=JSON.parse(await readFile(campaignPath,'utf8'));
 validateMassCampaign(manifest);
 const originalSha=commitIdentity();
 const runId=createRunId();
 const reportPath=safeOutput(runId);
 const logFolder=join(root,reportPath);
 const provider=options.provider;
 if(provider==='meta'&&!process.env.MODEL_API_KEY?.trim())throw new Error('MODEL_API_KEY_MISSING');
 if(provider==='baseten'&&!process.env.BASETEN_API_KEY?.trim())throw new Error('BASETEN_API_KEY_MISSING');
 const ledger=await acquireGlobalSpendLedger({campaignId:manifest.campaignId});
 let submitted=0;
 const record={
  kind:'AUTHORIZED_PILOT_DIAGNOSTIC_GOLD_PROVISIONAL',provider,runId,
  startedAt:new Date().toISOString(),gitCommit:originalSha,
  plannedRequests:options.requests,reservedRequestSlots:0,
  modelMode:options.mode,caseId:options.caseId,
  outcome:'STARTED_NOT_SETTLED',reportPath,
  reservedBillingNotGuaranteed:true,rawProviderOutputSaved:false,
 };
 try{
  enforcePilotAllowance(options,ledger.status());
  await mkdir(logFolder,{recursive:false});
  await writeFile(join(logFolder,'pilot-journal.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
  const reserve=async (amount,forProvider=provider)=>{
   // Pilot quota is checked before EVERY provider submission, not just once.
   if(ledger.status().perProvider[forProvider].requestCount>=PILOT_LIMITS[forProvider])return false;
   const r=await ledger.reserve({
    requestId:'request_'+randomUUID().replaceAll('-',''),
    runId,provider:forProvider,estimatedMaximumUsd:amount,
   });
   if(r.accepted)submitted++;
   return r.accepted;
  };
  let providerReport;
  if(provider==='meta'){
   const guardedLedger={reserve:amount=>reserve(amount,'meta')};
   providerReport=await runMetaSeminarEval({
    live:true,ackPaid:true,mode:options.mode,caseId:options.caseId,
    maxRequests:options.requests,budgetUsd:2,apiKey:process.env.MODEL_API_KEY,
    ledger:guardedLedger,output:reportPath,fetchImpl,
   });
  } else if(provider==='baseten'){
   const guardedCaller=async({prepared,apiKey,fetchImpl:innerFetch})=>{
    const estimated=estimateBasetenReserve(prepared);
    const accepted=await reserve(estimated,'baseten');
    if(!accepted){
     const error=new Error('Paid global budget or pilot quota refused.');
     error.safeReason='GLOBAL_PILOT_BUDGET_REACHED';
     throw error;
    }
    return callBasetenTheatre({prepared,apiKey,fetchImpl:innerFetch});
   };
   providerReport=await runBasetenSeminarEval({
    live:true,ackPaid:true,mode:options.mode,caseId:options.caseId,
    maxRequests:options.requests,apiKey:process.env.BASETEN_API_KEY,
    caller:guardedCaller,output:reportPath,fetchImpl,
   });
  } else {
   let remoteUnitCost=null;
   const guardedFetch=async(url,opts={})=>{
    const u=new URL(url);
    if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'){
     throw new Error('SFX_PILOT_LOCAL_ONLY');
    }
    const method=opts.method??'GET';
    if(method==='GET'&&u.pathname==='/api/sfx/status'){
     const response=await fetchImpl(url,opts);
     if(response.ok){
      const config=await response.clone().json();
      const n=config.estimatedMaxCostUsdPerRequest;
      if(typeof n!=='number'||!Number.isFinite(n)||n<=0||n>1){
       throw new Error('MODAL_UNIT_RESERVATION_UNSAFE');
      }
      remoteUnitCost=n;
     }
     return response;
    }
    if(method==='POST'&&u.pathname==='/api/sfx/jobs'){
     if(remoteUnitCost===null)throw new Error('MODAL_COST_STATUS_NOT_VALIDATED');
     if(!await reserve(remoteUnitCost,'modal'))throw new Error('GLOBAL_PILOT_BUDGET_REACHED');
    }
    return fetchImpl(url,opts);
   };
   providerReport=await runSfxLatencyLab({
    live:true,ackPaid:true,maxCalls:options.requests,budgetUsd:1,
    timeoutSeconds:90,
   },{fetchImpl:guardedFetch,
    serverFactory:()=>createAppServer({
     sfxStore:createSfxJobStore({
      directory:join(dirname(globalLedgerDefaultPath()),'shared-modal-jobs-v1'),
      maxDailyStarts:6,
     }),
    }),
   });
   await writeFile(join(logFolder,'modal-sfx-report.json'),JSON.stringify(providerReport,null,2)+'\n',{flag:'wx'});
  }
  record.finishedAt=new Date().toISOString();
  record.reservedRequestSlots=submitted;
  record.outcome=providerReport?.haltReason||providerReport?.stoppedReason?
   'STOPPED_REQUIRES_REVIEW':'PILOT_COMPLETED_REQUIRES_DASHBOARD_REVIEW';
  record.reportedStopReason=providerReport?.haltReason??providerReport?.stoppedReason??null;
  record.localReservedUsd=ledger.status().reservedUsd;
  record.scoreNotCertified=true;
  record.currentGitCommit=commitIdentity();
  if(record.currentGitCommit!==originalSha)throw new Error('CODE_CHANGED_DURING_PILOT');
  await writeFile(join(logFolder,'pilot-result.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
  return record;
 }catch(e){
  record.outcome='FAILED_OR_BILLING_UNCERTAIN_STOP';
  record.finishedAt=new Date().toISOString();
  record.reservedRequestSlots=submitted;
  record.localReservedUsd=ledger.status().reservedUsd;
  record.errorType=/^[A-Z_]{4,80}$/.test(e.message)?e.message:'PILOT_FAILED_CHECK_LOCAL_REPORTS';
  if(record.reportPath){
   await mkdir(logFolder,{recursive:true});
   await writeFile(join(logFolder,'pilot-result.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'}).catch(()=>{});
  }
  throw e;
 }finally{
  await ledger.close();
 }
}

export async function main(args=[]){
 const opts=parsePaidPilotOptions(args);
 if(!opts.live){
  console.log('PILOT_PLAN_ONLY: '+opts.provider+' '+opts.requests+' requests. No API calls, no charges.');
  console.log('To run, require --live --ack-paid --dashboard-verified and local approved budget file.');
  return;
 }
 const result=await runPaidPilot(opts);
 console.log('PILOT_'+result.outcome+': '+result.reservedRequestSlots+' centrally reserved request slots (not necessarily provider submissions).');
 console.log('Local report (no raw provider output): '+result.reportPath+'/pilot-result.json');
 if(result.outcome!=='PILOT_COMPLETED_REQUIRES_DASHBOARD_REVIEW')process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main(process.argv.slice(2)).catch(e=>{
  console.error('PILOT_STOPPED_SAFELY: '+(e?.message?.startsWith('PILOT_')?e.message:'Check local pilot report, ledger and provider dashboard; never auto-retry.'));
  process.exitCode=1;
 });
}
