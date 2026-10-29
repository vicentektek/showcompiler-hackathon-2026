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
import {createGuardedBasetenCaller,createGuardedModalLocalFetch} from '../src/qa/pilotReservationGuards.mjs';
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
 if(args.length&&typeof args[0]==='string'&&!args[0].startsWith('--')){
  throw new TypeError('NPM_ARGUMENTS_STRIPPED_USE_DIRECT_NODE');
 }
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

function validatePaidPilotExecution(options){
 if(options?.live!==true||options?.ackPaid!==true||options?.dashboardVerified!==true){
  throw new Error('EXPLICIT_LIVE_ACK_AND_DASHBOARD_CHECK_REQUIRED');
 }
 const provider=options.provider;
 if(!Object.hasOwn(PILOT_LIMITS,provider)||
    !Number.isSafeInteger(options.requests)||options.requests<1||options.requests>PILOT_LIMITS[provider]||
    !allowedModes.has(options.mode)||(options.caseId!==null&&!casePattern.test(options.caseId))||
    (provider==='modal'&&(options.caseId!==null||options.mode!=='literal'))){
  throw new TypeError('INVALID_PAID_PILOT_OPTIONS');
 }
}

const filesystemCodes=new Set(['EACCES','EEXIST','EIO','ENOENT','ENOSPC','EPERM','EROFS']);
const reportPhases=new Set(['REPORT_SETUP','JOURNAL_WRITE','RESULT_WRITE']);
const providerPhases=new Set(['META_EVALUATION','BASETEN_EVALUATION','MODAL_EVALUATION']);
const safeToken=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(value)?value:null;

export function safePilotFailure(error,phase,reservedRequestSlots=0){
 const nodeCode=filesystemCodes.has(error?.code)?error.code:null;
 const localMessageCode=providerPhases.has(phase)?null:safeToken(error?.message);
 const code=safeToken(error?.safeReason)??safeToken(error?.safeCode)??
  nodeCode??localMessageCode??'UNEXPECTED_FAILURE';
 let category='LOCAL_PREFLIGHT';
 if(phase==='LEDGER_OPEN'||phase==='LEDGER_CLOSE'||/LEDGER/.test(code))category='LEDGER_GUARD';
 else if(/BUDGET|QUOTA|RESERVATION/.test(code))category='BUDGET_GUARD';
 else if(filesystemCodes.has(code)||reportPhases.has(phase))category='LOCAL_FILESYSTEM';
 else if(providerPhases.has(phase))category='PROVIDER_OR_INTEGRATION';
 const descriptions={
  LEDGER_GUARD:'Shared spend ledger safety stopped the run.',
  BUDGET_GUARD:'Local budget or pilot quota guard stopped the run.',
  LOCAL_FILESYSTEM:'Local report storage failed; paths and raw messages were redacted.',
  PROVIDER_OR_INTEGRATION:'Provider integration stopped with a redacted diagnostic.',
  LOCAL_PREFLIGHT:'Local validation stopped the pilot before completion.',
 };
 const errorClass=['Error','TypeError','RangeError','SyntaxError','AggregateError'].includes(error?.name)?
  error.name:'Error';
 return Object.freeze({
  phase,category,code,errorClass,safeDescription:descriptions[category],
  reservationState:reservedRequestSlots===0?'NO_RESERVATION_RECORDED':
   'RESERVATION_RECORDED_RECONCILE_REQUIRED',
 });
}

export async function runPaidPilot(options,{
 fetchImpl=globalThis.fetch,runtimeRoot=root,workingDirectory=process.cwd(),env=process.env,
 ledgerFactory=acquireGlobalSpendLedger,commitIdentityFn=commitIdentity,
 runIdFactory=createRunId,metaRunner=runMetaSeminarEval,
 basetenRunner=runBasetenSeminarEval,modalRunner=runSfxLatencyLab,
}={}){
 validatePaidPilotExecution(options);
 const runId=runIdFactory();
 if(!/^pilot_[a-z0-9_]{4,54}$/.test(runId))throw new TypeError('INVALID_PILOT_RUN_ID');
 const reportPath=safeOutput(runId);
 const logFolder=join(runtimeRoot,reportPath);
 const provider=options.provider;
 let submitted=0,ledger=null,ledgerCloseAttempted=false,originalSha=null;
 const record={
  kind:'AUTHORIZED_PILOT_DIAGNOSTIC_GOLD_PROVISIONAL',provider,runId,
  startedAt:new Date().toISOString(),gitCommit:null,
  plannedRequests:options.requests,reservedRequestSlots:0,
  modelMode:options.mode,caseId:options.caseId,
  outcome:'STARTED_NOT_SETTLED',reportPath,
  reservedBillingNotGuaranteed:true,rawProviderOutputSaved:false,
 };
 let phase='WORKING_DIRECTORY';
 const closeLedger=async()=>{
  if(!ledger||ledgerCloseAttempted)return null;
  ledgerCloseAttempted=true;
  try{await ledger.close();return null}
  catch(error){return safePilotFailure(error,'LEDGER_CLOSE',submitted)}
 };
 try{
  if(resolve(workingDirectory)!==resolve(runtimeRoot)){
   throw new Error('RUN_PILOT_FROM_REPOSITORY_ROOT');
  }
  phase='MANIFEST_READ';
  const manifest=JSON.parse(await readFile(campaignPath,'utf8'));
  phase='MANIFEST_VALIDATE';
  validateMassCampaign(manifest);
  phase='GIT_FREEZE';
  originalSha=commitIdentityFn();
  record.gitCommit=originalSha;
  phase='CREDENTIAL_PREFLIGHT';
  if(provider==='meta'&&!env.MODEL_API_KEY?.trim())throw new Error('MODEL_API_KEY_MISSING');
  if(provider==='baseten'&&!env.BASETEN_API_KEY?.trim())throw new Error('BASETEN_API_KEY_MISSING');
  phase='LEDGER_OPEN';
  ledger=await ledgerFactory({campaignId:manifest.campaignId});
  phase='PILOT_ALLOWANCE';
  enforcePilotAllowance(options,ledger.status());
  phase='REPORT_SETUP';
  await mkdir(dirname(logFolder),{recursive:true});
  await mkdir(logFolder,{recursive:false});
  phase='JOURNAL_WRITE';
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
   phase='META_EVALUATION';
   const guardedLedger={reserve:amount=>reserve(amount,'meta')};
   providerReport=await metaRunner({
    live:true,ackPaid:true,mode:options.mode,caseId:options.caseId,
    maxRequests:options.requests,budgetUsd:2,apiKey:env.MODEL_API_KEY,
    ledger:guardedLedger,output:reportPath,fetchImpl,
   });
  } else if(provider==='baseten'){
   phase='BASETEN_EVALUATION';
   const guardedCaller=createGuardedBasetenCaller({
    reserve,estimate:estimateBasetenReserve,call:callBasetenTheatre,
   });
   providerReport=await basetenRunner({
    live:true,ackPaid:true,mode:options.mode,caseId:options.caseId,
    maxRequests:options.requests,apiKey:env.BASETEN_API_KEY,
    caller:guardedCaller,output:reportPath,fetchImpl,
   });
  } else {
   phase='MODAL_EVALUATION';
   const guardedFetch=createGuardedModalLocalFetch({reserve,fetchImpl});
   providerReport=await modalRunner({
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
  phase='FINAL_GIT_CHECK';
  record.currentGitCommit=commitIdentityFn();
  if(record.currentGitCommit!==originalSha)throw new Error('CODE_CHANGED_DURING_PILOT');
  phase='LEDGER_CLOSE';
  const closeFailure=await closeLedger();
  if(closeFailure){
   const error=new Error('LEDGER_CLOSE_FAILED');
   error.safeCode='LEDGER_CLOSE_FAILED';
   error.ledgerCloseDiagnostic=closeFailure;
   throw error;
  }
  phase='RESULT_WRITE';
  await writeFile(join(logFolder,'pilot-result.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
  return record;
 }catch(e){
  let localReservedUsd=null;
  if(ledger){try{localReservedUsd=ledger.status().reservedUsd}catch{}}
  const closeFailure=e?.ledgerCloseDiagnostic??await closeLedger();
  record.outcome='FAILED_OR_BILLING_UNCERTAIN_STOP';
  record.finishedAt=new Date().toISOString();
  record.reservedRequestSlots=submitted;
  record.localReservedUsd=localReservedUsd;
  const diagnostic=safePilotFailure(e,phase,submitted);
  record.errorType=diagnostic.code;
  record.failure=diagnostic;
  if(closeFailure)record.ledgerCloseFailure=closeFailure;
  if(record.reportPath){
   await mkdir(logFolder,{recursive:true}).then(()=>
    writeFile(join(logFolder,'pilot-result.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'})).catch(()=>{});
  }
  if(e&&typeof e==='object'){
   try{Object.defineProperty(e,'pilotDiagnostic',{value:diagnostic,enumerable:false})}catch{}
  }
  throw e;
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
  const diagnostic=e?.pilotDiagnostic??safePilotFailure(e,'CLI_OPTIONS',0);
  console.error('PILOT_STOPPED_SAFELY: '+diagnostic.code+' ['+diagnostic.phase+'/'+
   diagnostic.category+']. '+diagnostic.safeDescription+' Never auto-retry a paid or uncertain run.');
  process.exitCode=1;
 });
}
