/**
 * Central, local-only campaign reservation ledger (no API integrations).
 * Fixed per-user location outside EVERY git checkout, cross-process lock.
 * Fail closed on stale lock, missing budget authorization, ambiguous charges.
 *
 * This module does NOT create approval files, make HTTP requests, spend money,
 * release a reservation after timeout, or guarantee vendor invoice limits.
 */
import { open, readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const providers=Object.freeze(['meta','baseten','modal','voice']);
const providerSet=new Set(providers);
const dollarsToMicros=n=>{
  if(typeof n!=='number'||!Number.isFinite(n)||n<=0||n>1000)throw new TypeError('INVALID_AMOUNT');
  const result=Math.round(n*1e6);
  if(result<1||Math.abs(result/1e6-n)>1e-9)throw new TypeError('UNSUPPORTED_CURRENCY_PRECISION');
  return result;
};
const microsToDollars=n=>Number((n/1e6).toFixed(6));
const simple=/^[A-Za-z0-9][A-Za-z0-9_-]{3,99}$/;
const isId=id=>typeof id==='string'&&simple.test(id);

export function globalLedgerDefaultPath({ platform=process.platform, localappdata=process.env.LOCALAPPDATA,
  home=homedir() }={}){
  const base=platform==='win32'?(localappdata||join(home,'AppData','Local')):join(home,'.local','state');
  return join(base,'RunQ','Evaluation','global-spend-v1.json');
}

export function checkLedgerAuthorization(state,campaignId){
  if(!state||typeof state!=='object'||Array.isArray(state)||state.schemaVersion!==1||
     state.authorizationStatus!=='LOCAL_OPERATOR_APPROVED'||
     !isId(state.campaignId)||state.campaignId!==campaignId||
     !state.capsUsd||typeof state.capsUsd!=='object'||Array.isArray(state.capsUsd)||
     !Array.isArray(state.reservations)||state.reservations.length>1000){
    throw new TypeError('MISSING_OR_INVALID_LOCAL_AUTHORIZATION');
  }
  if(Object.keys(state.capsUsd).sort().join(',')!==[...providers].sort().join(',')){
    throw new TypeError('INVALID_BUDGET_PROVIDER_LIST');
  }
  const total=dollarsToMicros(state.totalCapUsd);
  let aggregate=0;
  const caps={};
  for(const p of providers){
    caps[p]=dollarsToMicros(state.capsUsd[p]);
    aggregate+=caps[p];
  }
  if(aggregate!==total)throw new TypeError('PROVIDER_CAPS_DO_NOT_SUM_TO_GLOBAL_CAP');
  const existing=new Set(),byProvider=Object.fromEntries(providers.map(p=>[p,0]));
  const counts=Object.fromEntries(providers.map(p=>[p,0]));
  let spent=0;
  for(const entry of state.reservations){
    if(!entry||!isId(entry.requestId)||existing.has(entry.requestId)||
       !providerSet.has(entry.provider)||!isId(entry.runId)||
       !Number.isSafeInteger(entry.amountMicros)||entry.amountMicros<=0||
       !['RESERVED','COMPLETED','UNKNOWN','FAILED_RESERVED'].includes(entry.status)){
      throw new TypeError('CORRUPT_CAMPAIGN_LEDGER');
    }
    existing.add(entry.requestId);
    spent+=entry.amountMicros;byProvider[entry.provider]+=entry.amountMicros;
    counts[entry.provider]++;
  }
  if(spent>total||providers.some(p=>byProvider[p]>caps[p])){
    throw new TypeError('SPEND_RESERVATIONS_OVER_CAP');
  }
  return {totalMicros:total,capsMicros:caps,reservedMicros:spent,
    providerReservedMicros:byProvider,requestCounts:counts,ids:existing};
}

export async function acquireGlobalSpendLedger({file=globalLedgerDefaultPath(),campaignId}={}){
  if(typeof file!=='string'||!file.trim()||!isId(campaignId)){
    throw new TypeError('INVALID_CAMPAIGN_LEDGER_ARGUMENTS');
  }
  await mkdir(dirname(file),{recursive:true,mode:0o700});
  const lockPath=file+'.lock';
  let lock;
  try{lock=await open(lockPath,'wx',0o600);}
  catch {throw new Error('CAMPAIGN_GLOBAL_LOCKED');}
  let closed=false, state;
  try{
    let raw;
    try{raw=await readFile(file,'utf8');}
    catch(e){
      if(e?.code==='ENOENT')throw new Error('NO_APPROVED_LOCAL_BUDGET_FILE');
      throw e;
    }
    if(raw.length>200000)throw new TypeError('CAMPAIGN_LEDGER_TOO_LARGE');
    state=JSON.parse(raw);
    checkLedgerAuthorization(state,campaignId);
    async function reserve({requestId,runId,provider,estimatedMaximumUsd}={}){
      if(closed)throw new Error('LEDGER_ALREADY_CLOSED');
      if(!isId(requestId)||!isId(runId)||!providerSet.has(provider))throw new TypeError('BAD_RESERVATION_ID');
      const amountMicros=dollarsToMicros(estimatedMaximumUsd);
      const before=checkLedgerAuthorization(state,campaignId);
      if(before.ids.has(requestId))return {accepted:false,reason:'DUPLICATE_ID'};
      if(before.reservedMicros+amountMicros>before.totalMicros ||
         before.providerReservedMicros[provider]+amountMicros>before.capsMicros[provider]){
        return {accepted:false,reason:'BUDGET_LIMIT'};
      }
      state.reservations.push({requestId,runId,provider,amountMicros,status:'RESERVED'});
      const temp=file+'.tmp-'+process.pid;
      try{
        await writeFile(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600,flag:'wx'});
        await rename(temp,file);
      }catch(e){
        state.reservations.pop();
        await unlink(temp).catch(()=>{});
        throw e;
      }
      return {accepted:true,reason:'RESERVED',amountUsd:microsToDollars(amountMicros)};
    }
    async function close(){
      if(closed)return;
      closed=true;
      await lock.close();
      await unlink(lockPath); // Failure is visible, never silently removed.
    }
    const status=()=>{
      if(closed)throw new Error('LEDGER_ALREADY_CLOSED');
      const s=checkLedgerAuthorization(state,campaignId);
      return {globalCapUsd:microsToDollars(s.totalMicros),
        reservedUsd:microsToDollars(s.reservedMicros),
        remainingUsd:microsToDollars(s.totalMicros-s.reservedMicros),
        perProvider:Object.fromEntries(providers.map(p=>[p,{
          capUsd:microsToDollars(s.capsMicros[p]),
          reservedUsd:microsToDollars(s.providerReservedMicros[p]),
          requestCount:s.requestCounts[p],
        }]))};
    };
    return {reserve,close,status};
  }catch(e){
    await lock.close().catch(()=>{});
    // Release lock if validation failed; NEVER delete or repair the ledger itself.
    await unlink(lockPath).catch(()=>{});
    throw e;
  }
}
