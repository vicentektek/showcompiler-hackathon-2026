import {mkdir,open,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {globalLedgerDefaultPath,acquireGlobalSpendLedger} from '../src/qa/globalSpendLedger.mjs';
import {CAMPAIGN_CREDIT_AUTHORIZATION} from '../src/qa/campaignPolicy.mjs';
import {buildAgentContext} from '../src/core/agentCore.mjs';
import {buildQualityMatrix,initialMetaPhase} from '../src/qa/qualityMatrix.mjs';
import {evaluateMetaCase,evaluateModalCase,qualityReport,renderQualityReport} from '../src/qa/qualityEvaluation.mjs';
import {measurePilotWav} from './runq-modal-live-batch.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ID=/^[a-z][a-z0-9-]{5,64}$/;
export const STABLE_QUALITY_CANDIDATE=Object.freeze({
 version:1,id:'stable',designMode:'literal',agentSuffix:'',
 stableAutomaticallyModified:false,
});
export function validateQualityCandidate(candidate){
 if(!candidate||candidate.version!==1||!ID.test(candidate.id)||
    !['literal','balanced','expressive'].includes(candidate.designMode)||
    typeof candidate.agentSuffix!=='string'||candidate.agentSuffix.length>300||
    Object.keys(candidate).some(k=>!['version','id','designMode','agentSuffix','stableAutomaticallyModified'].includes(k)))
  throw new TypeError('INVALID_QUALITY_CANDIDATE');
 return {...candidate,stableAutomaticallyModified:false};
}
// The public stable descriptor has a reserved short ID.
const checkedCandidate=c=>c===STABLE_QUALITY_CANDIDATE||c?.id==='stable'&&
 hash(c)===hash(STABLE_QUALITY_CANDIDATE)?STABLE_QUALITY_CANDIDATE:validateQualityCandidate(c);

export function qualityPhases(matrix){
 const first=initialMetaPhase(matrix),firstIds=new Set(first.map(c=>c.id));
 const development=matrix.cases.filter(c=>c.provider==='meta'&&c.split==='development'&&!firstIds.has(c.id));
 const holdout=matrix.cases.filter(c=>c.provider==='meta'&&c.split==='holdout');
 const modal=matrix.cases.filter(c=>c.provider==='modal'&&c.split==='development');
 return [
  {id:'meta-first-30',cases:first},
  {id:'meta-development-100',cases:development.slice(0,70)},
  {id:'meta-development-240',cases:development.slice(70)},
  {id:'meta-holdout-400',cases:holdout},
  {id:'modal-first-10',cases:modal.slice(0,10)},
  {id:'modal-development-60',cases:modal.slice(10)},
  {id:'modal-holdout-100',cases:matrix.cases.filter(c=>c.provider==='modal'&&c.split==='holdout')},
 ];
}

export async function readQualityJson(file){
 try{
  const bytes=await readFile(file);
  if(bytes.length>12_000_000)throw new Error('QUALITY_EVIDENCE_TOO_LARGE');
  return JSON.parse(bytes.toString('utf8'));
 }catch(error){if(error.code==='ENOENT')return null;throw error;}
}
export async function saveQualityJson(file,value,{exclusive=false}={}){
 await mkdir(dirname(file),{recursive:true,mode:0o700});
 if(exclusive){await writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});return;}
 const temp=file+'.tmp-'+randomUUID();
 await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
 try{await rename(temp,file);}
 finally{try{await unlink(temp);}catch(error){if(error.code!=='ENOENT')throw error;}}
}

export function cleanQualityCommit(){
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const dirty=execFileSync('git',['status','--porcelain','--untracked-files=all'],{encoding:'utf8'}).trim();
 if(!/^[a-f0-9]{40}$/.test(head)||dirty)throw new Error('PIN_CLEAN_VALIDATED_COMMIT_BEFORE_PAID_EVALUATION');
 return head;
}
export async function qualityLivePreflight(options,{ledgerFactory=acquireGlobalSpendLedger,
 commitIdentity=cleanQualityCommit}={}){
 if(options.live!==true||options.ackPaid!==true||
    CAMPAIGN_CREDIT_AUTHORIZATION.ownerAttestedCredit!==true)
  throw new Error('OPERATOR_PAID_AND_OWNER_ATTESTATION_REQUIRED');
 const commit=commitIdentity();
 const ledger=await ledgerFactory();
 try{
  const balance=ledger.status();
  for(const provider of ['meta','modal']){
   const minimum=provider==='meta'?0.15:0.05;
   if(balance.perProvider[provider].remainingUsd<minimum)
    throw new Error('CAMPAIGN_BALANCE_TOO_SMALL');
  }
  return {commit,balance,...CAMPAIGN_CREDIT_AUTHORIZATION};
 }finally{await ledger.close();}
}

function requestFor(item,candidate){
 if(item.provider==='modal')return item.input;
 if(item.endpoint==='proposals')return {...item.input,designMode:candidate.designMode};
 const prompt=item.input.prompt+(candidate.agentSuffix?' '+candidate.agentSuffix:'');
 if(prompt.length>1600)throw new Error('CANDIDATE_PROMPT_TOO_LARGE');
 return {provider:'meta',prompt,language:item.language,conversation:item.input.conversation,
  context:buildAgentContext(item.input.project)};
}
export function qualityAttemptIdentity(item,candidate=STABLE_QUALITY_CANDIDATE){
 const body=structuredClone(requestFor(item,checkedCandidate(candidate)));
 if(body.project){body.project.id='CANONICAL_PROJECT';body.project.name='CANONICAL_NAME';}
 if(body.context){body.context.projectId='CANONICAL_PROJECT';body.context.projectName='CANONICAL_NAME';}
 delete body.seed;
 return hash({provider:item.provider,endpoint:item.endpoint??'generation',body});
}

export async function runQualityCampaign(options,{
 fetchImpl=fetch,preflight=qualityLivePreflight,wait=ms=>new Promise(r=>setTimeout(r,ms)),
 historyDirectory=join(dirname(globalLedgerDefaultPath()),'quality-history-v1'),
 outputDirectory=join('.runq-local','quality-campaign'),
 matrix=buildQualityMatrix(),candidate=STABLE_QUALITY_CANDIDATE,
 simulated=false,maxPolls=30,pollIntervalMs=5000,
}={}){
 if(!options||!ID.test(options.id)||!/^http:\/\/127\.0\.0\.1:(?:[1-9]\d{3,4})$/.test(options.origin)||
    Number(new URL(options.origin).port)>65535||!Number.isInteger(maxPolls)||maxPolls<1||maxPolls>60||
    !Number.isInteger(pollIntervalMs)||pollIntervalMs<0||pollIntervalMs>30000)
  throw new TypeError('INVALID_QUALITY_RUN_OPTIONS');
 candidate=checkedCandidate(candidate);
 const approval=await preflight(options);
 const phases=qualityPhases(matrix);
 if(options.phase&&!phases.some(p=>p.id===options.phase))throw new TypeError('UNKNOWN_QUALITY_PHASE');
 await mkdir(historyDirectory,{recursive:true,mode:0o700});
 const lockPath=join(historyDirectory,'campaign.lock'),lock=await open(lockPath,'wx',0o600);
 const stateFile=join(historyDirectory,options.id+'-'+candidate.id+'.json');
 const reportFile=join(outputDirectory,options.id+'-'+candidate.id+'.json');
 const mode=simulated?'OFFLINE_SIMULATED_TRANSPORT':'REAL_LOCAL_PRODUCT_PROVIDER_FLOW';
 let state;
 async function persist(){
  await saveQualityJson(stateFile,state);
  const report=qualityReport(state.results,{version:candidate.id,evidenceMode:mode,plannedCases:500});
  report.campaign={id:options.id,stopReason:state.stopReason,completedPhases:state.completedPhases,
   sourceCommit:approval.commit,corpusHash:matrix.corpusHash,candidateHash:hash(candidate),
   execution:state.execution,realProviderRequests:simulated?0:'REQUIRES_PROVIDER_RECEIPT_CORRELATION'};
  await saveQualityJson(reportFile,report);
  await writeFile(reportFile.replace(/\.json$/,'.md'),renderQualityReport(report),{mode:0o600});
 }
 async function local(path,body){
  return fetchImpl(options.origin+path,{
   method:body===undefined?'GET':'POST',headers:{
    Origin:options.origin,'Content-Type':'application/json','X-Runq-Agent-Consent':'yes'},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000),
  });
 }
 try{
  state=await readQualityJson(stateFile);
  if(state){
   if(options.resume!==true)throw new Error('EXISTING_QUALITY_CAMPAIGN_REQUIRES_RESUME');
   if(state.corpusHash!==matrix.corpusHash||state.candidateHash!==hash(candidate)||
      state.sourceCommit!==approval.commit||state.evidenceMode!==mode||state.origin!==options.origin)
    throw new Error('QUALITY_CAMPAIGN_IDENTITY_CHANGED');
   if(!state.execution||!Number.isSafeInteger(state.execution.newLocalSubmissionAttempts))
    throw new Error('UNRECONCILED_QUALITY_EXECUTION_HISTORY');
  }else{
   if(options.resume===true)throw new Error('NO_QUALITY_CAMPAIGN_TO_RESUME');
   state={version:1,id:options.id,origin:options.origin,corpusHash:matrix.corpusHash,
    candidateHash:hash(candidate),sourceCommit:approval.commit,evidenceMode:mode,
    results:[],completedPhases:[],stopReason:'RUNNING'};
   state.execution={newLocalSubmissionAttempts:0,reusedResultCases:0,resumedModalJobs:0};
   await persist();
  }
  const wanted=options.phase??phases.find(p=>!state.completedPhases.includes(p.id))?.id;
  if(!wanted)return state;
  const phaseIndex=phases.findIndex(p=>p.id===wanted);
  if(phases.slice(0,phaseIndex).some(p=>!state.completedPhases.includes(p.id)))
   throw new Error('QUALITY_PHASE_PREREQUISITE_NOT_MET');
  for(const phase of phases.slice(phaseIndex)){
   if(state.completedPhases.includes(phase.id)){if(!options.continuous)break;continue;}
   for(const item of phase.cases){
    if(state.results.some(row=>row.caseId===item.id))continue;
    const fingerprint=qualityAttemptIdentity(item,candidate);
    const file=join(historyDirectory,'attempts',fingerprint+'.json');
    const contractHash=hash(item.expected);
    let attempt=await readQualityJson(file);
    if(attempt&&(attempt.contractHash!==contractHash||attempt.evidenceMode!==mode))
     throw new Error('HISTORICAL_CONTRACT_OR_PROVENANCE_CHANGED');
    if(attempt?.result&&attempt.sourceCommit!==approval.commit)
     throw new Error('HISTORICAL_CODE_CHANGED_REPLAY_REQUIRED');
    if(attempt?.result){
     state.execution.reusedResultCases++;
     state.results.push(attempt.result);await persist();continue;
    }
    if(item.provider==='meta'&&attempt){
     state.stopReason='UNCERTAIN_META_NO_RESUBMISSION';await persist();return state;
    }
    const requestId='quality-modal-'+fingerprint.slice(0,48);
    let job=null;
    if(item.provider==='modal'){
     const response=await local('/api/sfx/jobs/'+requestId);
     if(response.status===200){
      job=await response.json();
      if(job.prompt!==item.input.prompt||job.durationSeconds!==item.input.durationSeconds||
         job.requestId!==requestId)throw new Error('HISTORICAL_MODAL_INPUT_CHANGED');
      state.execution.resumedModalJobs++;
     }else if(response.status!==404)throw new Error('LOCAL_MODAL_READ_FAILED');
     if(attempt&&!job){state.stopReason='UNCERTAIN_MODAL_NO_RESUBMISSION';await persist();return state;}
    }
    if(!attempt){
     attempt={version:1,fingerprint,contractHash,evidenceMode:mode,provider:item.provider,
      requestId:item.provider==='modal'?requestId:null,sourceCommit:approval.commit,
      status:'SUBMISSION_UNKNOWN',startedAt:new Date().toISOString(),result:null};
     await saveQualityJson(file,attempt,{exclusive:true});
    }
    try{
     if(item.provider==='meta'){
      const path=item.endpoint==='agent'?'/api/agent/interpret':'/api/meta/proposals';
      state.execution.newLocalSubmissionAttempts++;await persist();
      const response=await local(path,requestFor(item,candidate));
      attempt.http=response.status;
      if(!response.ok){attempt.status='HTTP_REJECTED_NO_RETRY';await saveQualityJson(file,attempt);
       state.stopReason=attempt.status;await persist();return state;}
      const data=await response.json();
      attempt.result=evaluateMetaCase(item,data);
      attempt.providerRequestId=data.diagnostic?.requestId??null;
     }else{
      if(!job){
       state.execution.newLocalSubmissionAttempts++;await persist();
       const response=await local('/api/sfx/jobs',{
        ...item.input,requestId,authorizationId:'owner-'+requestId,
        confirmed:true,acknowledgedMaxCostUsd:0.05,
       });
       attempt.http=response.status;
       if(response.status!==202){attempt.status='HTTP_REJECTED_NO_RETRY';await saveQualityJson(file,attempt);
        state.stopReason=attempt.status;await persist();return state;}
       job=await response.json();
      }
      for(let poll=0;poll<maxPolls&&['QUEUED','RUNNING','CANCEL_REQUESTED'].includes(job.status);poll++){
       if(poll)await wait(pollIntervalMs);
       const response=await local('/api/sfx/jobs/'+requestId+'/refresh',{});
       if(!response.ok)throw new Error('MODAL_REFRESH_FAILED');
       job=await response.json();
       if(job.requestId!==requestId)throw new Error('MODAL_REFRESH_ID_CHANGED');
      }
      if(!['READY_FOR_REVIEW','ACCEPTED_FOR_MANUAL_IMPORT'].includes(job.status)){
       attempt.status=job.status;await saveQualityJson(file,attempt);
       state.stopReason=['QUEUED','RUNNING','CANCEL_REQUESTED'].includes(job.status)?
        'POLL_BOUND_RESUME_ORIGINAL_JOB':'MODAL_UNRESOLVED_OR_FAILED';
       await persist();return state;
      }
      const response=await local('/api/sfx/jobs/'+requestId+'/audio');
      if(!response.ok)throw new Error('MODAL_AUDIO_FAILED');
      const bytes=Buffer.from(await response.arrayBuffer());
      const metrics=measurePilotWav(bytes,item.input.durationSeconds);
      if(metrics.sha256!==job.wav?.sha256)throw new Error('MODAL_WAV_HASH_CHANGED');
      const audioFile=join(outputDirectory,requestId+'.wav');
      try{await writeFile(audioFile,bytes,{flag:'wx',mode:0o600});}
      catch(error){
       if(error.code!=='EEXIST')throw error;
       const previous=await readFile(audioFile);
       if(createHash('sha256').update(previous).digest('hex')!==metrics.sha256)
        throw new Error('MODAL_SAVED_WAV_CHANGED');
      }
      attempt.result=evaluateModalCase(item,metrics);
     }
     attempt.status='COMPLETE';attempt.completedAt=new Date().toISOString();
     await saveQualityJson(file,attempt);
     state.results.push(attempt.result);
     await persist();
    }catch(error){
     // Persist an enumerated failure, never exception text containing provider material.
     attempt.result=null;
     attempt.status='UNKNOWN_NO_RETRY';
     attempt.failureCode=/^(MODAL_[A-Z_]+)$/.test(error.message??'')?error.message:'LOCAL_OR_TRANSPORT_UNCERTAIN';
     await saveQualityJson(file,attempt);state.stopReason=attempt.failureCode;await persist();return state;
    }
   }
   const report=qualityReport(state.results.filter(row=>phase.cases.some(c=>c.id===row.caseId)));
   if(report.summary.unscored||report.rows.some(row=>row.failures.some(f=>f.severity==='CRITICAL'))||
      report.summary.failureRate>0.2){
    state.stopReason='QUALITY_GATE_REQUIRES_CANDIDATE_OR_OPERATOR_REVIEW';await persist();return state;
   }
   state.completedPhases.push(phase.id);
   state.stopReason=options.continuous?'RUNNING':'PHASE_COMPLETE';
   await persist();
   if(!options.continuous)return state;
  }
  state.stopReason='CAMPAIGN_COMPLETE_PENDING_HUMAN_REVIEW';await persist();return state;
 }finally{await lock.close();await unlink(lockPath);}
}
