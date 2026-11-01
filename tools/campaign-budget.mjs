#!/usr/bin/env node
/** Read-only by default. Explicit policy upgrade never makes provider calls. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {acquireGlobalSpendLedger,globalLedgerDefaultPath} from '../src/qa/globalSpendLedger.mjs';
import {CAMPAIGN_POLICY,CAMPAIGN_CREDIT_AUTHORIZATION} from '../src/qa/campaignPolicy.mjs';

export async function campaignBudgetCommand(argv){
 const options={apply:false,file:globalLedgerDefaultPath(),legacyFiles:[]};
 const seen=new Set();
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];
  if(['--legacy-meta-ledger','--legacy-agent-ledger','--legacy-modal-job'].includes(flag)){
   if(!argv[i+1]||argv[i+1].startsWith('--'))throw new TypeError('INVALID_BUDGET_OPTION');
   options.legacyFiles.push({file:argv[++i],kind:flag});continue;
  }
  if(seen.has(flag))throw new TypeError('DUPLICATE_FLAG');seen.add(flag);
  if(flag==='--apply-authorized-upgrade'){options.apply=true;continue;}
  const key={'--ledger':'file','--authorized-at':'authorizedAt','--backup':'backupFile'}[flag];
  if(!key||!argv[i+1]||argv[i+1].startsWith('--'))throw new TypeError('INVALID_BUDGET_OPTION');
  options[key]=argv[++i];
 }
 if(options.apply&&(!options.authorizedAt||!options.backupFile))
  throw new TypeError('AUTHORIZATION_TIMESTAMP_AND_EXTERNAL_BACKUP_REQUIRED');
 const legacyReservations=[];
 for(const source of options.legacyFiles){
  const raw=await readFile(source.file);
  if(raw.length>2_000_000)throw new TypeError('LEGACY_LEDGER_TOO_LARGE');
  const data=JSON.parse(raw.toString('utf8'));
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const sourcePath=resolve(source.file);
  const sourceId=hash(process.platform==='win32'?sourcePath.toLowerCase():sourcePath).slice(0,24);
  const entries=source.kind==='--legacy-modal-job'
   ?[{sequence:1,reserveUsd:data.cost?.estimatedMaxCostUsd}]
   :source.kind==='--legacy-meta-ledger'?data.entries:data.records;
  if(data.version!==1||!Array.isArray(entries)||entries.length>20000)
   throw new TypeError('INVALID_LEGACY_LEDGER');
  for(const entry of entries){
   let provider=source.kind==='--legacy-modal-job'?'modal':'meta';
   if(source.kind==='--legacy-agent-ledger'){
    const match=/-(meta|baseten)$/.exec(entry.caseKey??'');
    if(!match)throw new Error('LEGACY_PROVIDER_UNATTRIBUTED_RECONCILE_REQUIRED');
    provider=match[1];
   }
   if(!Number.isSafeInteger(entry.sequence)||entry.sequence<1||
     typeof entry.reserveUsd!=='number'||!Number.isFinite(entry.reserveUsd)||entry.reserveUsd<=0||
     Math.abs(Math.round(entry.reserveUsd*1e6)/1e6-entry.reserveUsd)>1e-9)
    throw new TypeError('INVALID_LEGACY_RESERVATION');
   legacyReservations.push({
    requestId:'legacy-'+sourceId+'-'+entry.sequence,runId:'legacy-'+sourceId,
    provider,amountMicros:Math.round(entry.reserveUsd*1e6),status:'UNKNOWN',
    evidenceSha256:hash(JSON.stringify(entry)),
   });
  }
 }
 options.legacyReservations=legacyReservations;
 const ledger=await acquireGlobalSpendLedger({file:options.file,allowUpgrade:true});
 try{
  if(options.apply)return await ledger.upgrade(options);
  return {current:ledger.status(),authorizedPolicy:CAMPAIGN_POLICY,
   proposedLegacyReservations:legacyReservations.length,
   proposedLegacyReserveUsd:legacyReservations.reduce((n,r)=>n+r.amountMicros,0)/1e6,
   providerRequests:0,...CAMPAIGN_CREDIT_AUTHORIZATION,
   note:'Owner-attested credit is not a provider balance check. Unknown historical reservations are not retryable.'};
 }finally{await ledger.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await campaignBudgetCommand(process.argv.slice(2)),null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
