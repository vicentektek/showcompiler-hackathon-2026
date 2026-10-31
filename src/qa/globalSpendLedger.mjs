/**
 * Shared per-user ledger, compatible with the earlier V9 reservation schema.
 * Every historical reservation stays charged conservatively, regardless of
 * outcome. No credentials, raw provider output, automatic refunds or retries.
 */
import {open,readFile,mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {CAMPAIGN_POLICY} from './campaignPolicy.mjs';

const LEGACY_PROVIDERS=['meta','baseten','modal','voice'];
const PROVIDERS=Object.keys(CAMPAIGN_POLICY.capsUsd);
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{3,127}$/;
const isId=id=>typeof id==='string'&&ID.test(id);
const usd=n=>n/1e6;
function micros(n,{zero=false}={}){
 if(typeof n!=='number'||!Number.isFinite(n)||n<0||(!zero&&n===0)||n>1000)
  throw new TypeError('INVALID_AMOUNT');
 const value=Math.round(n*1e6);
 if(!Number.isSafeInteger(value)||Math.abs(value/1e6-n)>1e-9)
  throw new TypeError('UNSUPPORTED_CURRENCY_PRECISION');
 return value;
}
export function globalLedgerDefaultPath(){
 const base=process.platform==='win32'
  ?process.env.LOCALAPPDATA||join(homedir(),'AppData','Local')
  :join(homedir(),'.local','state');
 return join(base,'RunQ','Evaluation','global-spend-v1.json');
}
export function checkLedgerAuthorization(state,{requireCurrent=true}={}){
 if(!state||state.schemaVersion!==1||state.authorizationStatus!=='LOCAL_OPERATOR_APPROVED'||
   !isId(state.campaignId)||!Array.isArray(state.reservations)||state.reservations.length>20000||
   !state.capsUsd||typeof state.capsUsd!=='object'||Array.isArray(state.capsUsd))
  throw new TypeError('MISSING_OR_INVALID_LOCAL_AUTHORIZATION');
 const current=state.policyRevision===CAMPAIGN_POLICY.revision;
 if(requireCurrent&&!current)throw new Error('CAMPAIGN_POLICY_UPGRADE_REQUIRED');
 const providers=current?PROVIDERS:LEGACY_PROVIDERS;
 if(Object.keys(state.capsUsd).sort().join(',')!==[...providers].sort().join(','))
  throw new TypeError('INVALID_BUDGET_PROVIDER_LIST');
 const total=micros(state.totalCapUsd),caps={},reserved={},counts={},ids=new Set();
 for(const provider of providers){
  caps[provider]=micros(state.capsUsd[provider],{zero:current});
  reserved[provider]=0;counts[provider]=0;
 }
 if(Object.values(caps).reduce((n,v)=>n+v,0)!==total)
  throw new TypeError('PROVIDER_CAPS_DO_NOT_SUM_TO_GLOBAL_CAP');
 if(current&&(total!==micros(CAMPAIGN_POLICY.totalCapUsd)||
   providers.some(p=>caps[p]!==micros(CAMPAIGN_POLICY.capsUsd[p],{zero:true}))))
  throw new TypeError('CAMPAIGN_CAPS_DO_NOT_MATCH_AUTHORIZATION');
 let spent=0;
 const carryovers=state.historicalCarryovers??[];
 if(!Array.isArray(carryovers)||carryovers.length>20000)
  throw new TypeError('CORRUPT_LEGACY_CARRYOVERS');
 for(const entry of [...state.reservations,...carryovers]){
  if(!entry||!isId(entry.requestId)||ids.has(entry.requestId)||!isId(entry.runId)||
    !providers.includes(entry.provider)||!Number.isSafeInteger(entry.amountMicros)||entry.amountMicros<=0||
    !['RESERVED','COMPLETED','UNKNOWN','FAILED_RESERVED'].includes(entry.status))
   throw new TypeError('CORRUPT_CAMPAIGN_LEDGER');
  ids.add(entry.requestId);spent+=entry.amountMicros;reserved[entry.provider]+=entry.amountMicros;
  counts[entry.provider]++;
  if(!Number.isSafeInteger(spent))throw new TypeError('CORRUPT_CAMPAIGN_LEDGER');
 }
 // Forbidden legacy spend still reduces the global balance, but a zero NEW
 // allocation must not invalidate the preserved Baseten/voice history.
 if(spent>total||providers.some(p=>caps[p]>0&&reserved[p]>caps[p]))
  throw new TypeError('SPEND_RESERVATIONS_OVER_CAP');
 return {totalMicros:total,capsMicros:caps,reservedMicros:spent,
  providerReservedMicros:reserved,requestCounts:counts,ids};
}
export function upgradeCampaignBudget(state,{authorizedAt,legacyReservations=[]}={}){
 if(typeof authorizedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(authorizedAt)||
   !Number.isFinite(Date.parse(authorizedAt)))throw new TypeError('INVALID_AUTHORIZATION_TIMESTAMP');
 checkLedgerAuthorization(state,{requireCurrent:false});
 if(!Array.isArray(legacyReservations))throw new TypeError('INVALID_LEGACY_RESERVATIONS');
 const next=structuredClone(state);
 if(state.policyRevision!==CAMPAIGN_POLICY.revision){
  next.budgetHistory=[...(next.budgetHistory??[]),{
   totalCapUsd:state.totalCapUsd,capsUsd:structuredClone(state.capsUsd),
   authorizedAt,previousApprovalAt:state.approvedAt??null,
  }];
  next.budgetAuthorizationAt=authorizedAt;
 }
 next.totalCapUsd=CAMPAIGN_POLICY.totalCapUsd;
 next.capsUsd={...CAMPAIGN_POLICY.capsUsd};
 next.policyRevision=CAMPAIGN_POLICY.revision;
 if(legacyReservations.length){
  next.historicalCarryovers??=[];
  for(const entry of legacyReservations){
   const existing=next.historicalCarryovers.find(r=>r.requestId===entry.requestId);
   if(existing){
    if(JSON.stringify(existing)!==JSON.stringify(entry))
     throw new Error('LEGACY_RESERVATION_CHANGED_RECONCILE_REQUIRED');
   }else next.historicalCarryovers.push(structuredClone(entry));
  }
 }
 checkLedgerAuthorization(next);
 return next;
}
async function readState(file){
 let bytes;
 try{bytes=await readFile(file);}
 catch(error){if(error.code==='ENOENT')throw new Error('NO_APPROVED_LOCAL_BUDGET_FILE');throw error;}
 if(bytes.length>2_000_000)throw new TypeError('CAMPAIGN_LEDGER_TOO_LARGE');
 return {bytes,state:JSON.parse(bytes.toString('utf8'))};
}
async function writeState(file,state){
 const temp=file+'.tmp-'+process.pid;
 try{
  await writeFile(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600,flag:'wx'});
  await rename(temp,file);
 }catch(error){
  try{await unlink(temp);}catch(cleanup){if(cleanup.code!=='ENOENT')throw new AggregateError([error,cleanup],'CAMPAIGN_WRITE_CLEANUP_FAILED');}
  throw error;
 }
}
export async function acquireGlobalSpendLedger({file=globalLedgerDefaultPath(),allowUpgrade=false}={}){
 const filename=resolve(file);
 await mkdir(dirname(filename),{recursive:true,mode:0o700});
 let lock;
 try{lock=await open(filename+'.lock','wx',0o600);}
 catch(error){if(error.code==='EEXIST')throw new Error('CAMPAIGN_GLOBAL_LOCKED');throw error;}
 let closed=false,state;
 const close=async()=>{
  if(closed)return;closed=true;await lock.close();await unlink(filename+'.lock');
 };
 try{
  state=(await readState(filename)).state;
  checkLedgerAuthorization(state,{requireCurrent:!allowUpgrade});
  const status=()=>{
   if(closed)throw new Error('LEDGER_ALREADY_CLOSED');
   const s=checkLedgerAuthorization(state,{requireCurrent:!allowUpgrade});
   return {globalCapUsd:usd(s.totalMicros),reservedUsd:usd(s.reservedMicros),
    remainingUsd:usd(s.totalMicros-s.reservedMicros),
    policyRevision:state.policyRevision??'legacy',
    perProvider:Object.fromEntries(Object.keys(s.capsMicros).map(p=>[p,{
     capUsd:usd(s.capsMicros[p]),reservedUsd:usd(s.providerReservedMicros[p]),
     remainingUsd:usd(Math.max(0,s.capsMicros[p]-s.providerReservedMicros[p])),
     requestCount:s.requestCounts[p],
    }]))};
  };
  async function upgrade({authorizedAt,backupFile,legacyReservations=[]}){
   if(closed)throw new Error('LEDGER_ALREADY_CLOSED');
   const next=upgradeCampaignBudget(state,{authorizedAt,legacyReservations});
   if(JSON.stringify(state)===JSON.stringify(next))return {changed:false,status:status()};
   if(typeof backupFile!=='string'||resolve(backupFile)===filename)
    throw new TypeError('EXTERNAL_LEDGER_BACKUP_REQUIRED');
   const {bytes}=await readState(filename);
   await mkdir(dirname(resolve(backupFile)),{recursive:true,mode:0o700});
   await writeFile(backupFile,bytes,{flag:'wx',mode:0o600});
   const hash=b=>createHash('sha256').update(b).digest('hex');
   if(hash(await readFile(backupFile))!==hash(bytes))throw new Error('CAMPAIGN_BACKUP_MISMATCH');
   await writeState(filename,next);
   state=next;
   return {changed:true,backupSha256:hash(bytes),status:status()};
  }
  async function reserve({requestId,runId,provider,estimatedMaximumUsd}={}){
   if(closed)throw new Error('LEDGER_ALREADY_CLOSED');
   if(!isId(requestId)||!isId(runId)||!PROVIDERS.includes(provider))throw new TypeError('BAD_RESERVATION_ID');
   const amount=micros(estimatedMaximumUsd),s=checkLedgerAuthorization(state);
   if(s.capsMicros[provider]===0)return {accepted:false,reason:'PROVIDER_PROHIBITED'};
   if(s.ids.has(requestId))return {accepted:false,reason:'DUPLICATE_ID'};
   if(s.reservedMicros+amount>s.totalMicros||s.providerReservedMicros[provider]+amount>s.capsMicros[provider])
    return {accepted:false,reason:'BUDGET_LIMIT'};
   state.reservations.push({requestId,runId,provider,amountMicros:amount,status:'RESERVED'});
   try{await writeState(filename,state);}catch(error){state.reservations.pop();throw error;}
   return {accepted:true,reason:'RESERVED',amountUsd:usd(amount)};
  }
  return {status,reserve,upgrade,close};
 }catch(error){
  try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'CAMPAIGN_LOCK_CLEANUP_FAILED');}
  throw error;
 }
}
