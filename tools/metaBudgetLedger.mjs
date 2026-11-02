/**
 * Cross-run local budget gate for the Muse Spark stress lab.
 * The ledger records conservative PREPAID RESERVATIONS, not Meta invoices.
 * Lock is exclusive so concurrent terminals preserve every accounting entry.
 * Never store tokens, API keys, scripts or model outputs.
 */
import { mkdir, open, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {randomUUID} from 'node:crypto';
import {CAMPAIGN_POLICY} from '../src/qa/campaignPolicy.mjs';
import {acquireGlobalSpendLedger} from '../src/qa/globalSpendLedger.mjs';

const VERSION=1;
const LIMIT_USD=CAMPAIGN_POLICY.capsUsd.meta;
const DEFAULT_LEDGER=resolve('.runq-local/meta-eval-budget.json');
function money(v){return Number(v.toFixed(6));}
function valid(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=Number.MAX_SAFE_INTEGER/1e6}

/** Keep the old local history AND enforce the cross-checkout campaign ceiling. */
export async function acquireCampaignMetaBudget({localOptions={},sharedOptions={}}={}){
   const shared=await acquireGlobalSpendLedger(sharedOptions);
   let local;
   try{local=await acquireMetaBudgetLedger(localOptions);}
   catch(error){await shared.close();throw error;}
   const runId='seminar-'+randomUUID();
   let sequence=0,closed=false;
   return {
    async reserve(amount){
     if(closed)throw new Error('BUDGET_LEDGER_CLOSED');
     // Any interrupted two-ledger write stays reserved; never refund uncertainty.
     if(!await local.reserve(amount))return false;
     const result=await shared.reserve({
      requestId:runId+'-'+(++sequence),runId,provider:'meta',estimatedMaximumUsd:amount,
     });
     return result.accepted;
    },
    remainingUsd:()=>Math.min(local.remainingUsd(),shared.status().remainingUsd,
     shared.status().perProvider.meta.remainingUsd),
    committedReserveUsd:local.committedReserveUsd,
    async close(){
     if(closed)return;closed=true;
     try{await local.close();}finally{await shared.close();}
    },
   };
}

export async function acquireMetaBudgetLedger({file=DEFAULT_LEDGER,limitUsd=LIMIT_USD,enforceBudget=false}={}){
  if(typeof file!=='string'||file.length<5||file.length>320||!valid(limitUsd)||limitUsd===0){
    throw new TypeError('Invalid persistent Meta evaluation budget');
  }
  const filename=resolve(file);
  await mkdir(dirname(filename),{recursive:true});
  let lockHandle;
  try {lockHandle=await open(filename+'.lock','wx',0o600);}
  catch {throw new Error('EVAL_LEDGER_LOCKED: another paid experiment may be running');}
  let closed=false;
  let entries=[];
  try{
    let raw;
    try{raw=await readFile(filename,'utf8');}catch(e){if(e?.code!=='ENOENT')throw e}
    if(raw){
      const state=JSON.parse(raw);
      if(state.version!==VERSION||!Array.isArray(state.entries)){
        throw new TypeError('Unrecognized Meta evaluation ledger');
      }
      entries=state.entries;
      if(entries.some(e=>!e||!valid(e.reserveUsd)||!Number.isInteger(e.sequence)||e.sequence<1)){
        throw new TypeError('Damaged Meta evaluation ledger');
      }
    }
    const reserved=()=>money(entries.reduce((n,e)=>n+e.reserveUsd,0));
    async function reserve(amount){
      if(closed)throw new Error('BUDGET_LEDGER_CLOSED');
      if(!valid(amount)||amount===0)throw new TypeError('Invalid request reserve');
      if(enforceBudget&&reserved()+amount>limitUsd+1e-7)return false;
      entries.push({sequence:entries.length+1,reserveUsd:money(amount)});
      const temp=filename+'.temp-'+process.pid;
      try{
        await writeFile(temp,JSON.stringify({version:VERSION,entries},null,2)+'\n',{mode:0o600});
        await rename(temp,filename);
      }catch(e){
        entries.pop();
        await unlink(temp).catch(()=>{});
        throw e;
      }
      return true;
    }
    async function close(){
      if(closed)return;
      closed=true;
      await lockHandle.close();
      await unlink(filename+'.lock').catch(()=>{});
    }
    return {reserve,remainingUsd:()=>enforceBudget?money(Math.max(0,limitUsd-reserved())):Infinity,
      committedReserveUsd:reserved,close};
  }catch(e){
    await lockHandle.close().catch(()=>{});
    await unlink(filename+'.lock').catch(()=>{});
    throw e;
  }
}
