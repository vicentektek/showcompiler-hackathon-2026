/**
 * Cross-run local budget gate for the Muse Spark stress lab.
 * The ledger records conservative PREPAID RESERVATIONS, not Meta invoices.
 * Lock is exclusive so two VS Code terminals cannot bypass the cap.
 * Never store tokens, API keys, scripts or model outputs.
 */
import { mkdir, open, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const VERSION=1;
const LIMIT_USD=2;
const DEFAULT_LEDGER=resolve('.runq-local/meta-eval-budget.json');
function money(v){return Number(v.toFixed(6));}
function valid(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=LIMIT_USD+0.000001}

export async function acquireMetaBudgetLedger({file=DEFAULT_LEDGER,limitUsd=LIMIT_USD}={}){
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
      if(state.version!==VERSION||!Array.isArray(state.entries)||state.entries.length>1000){
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
      if(reserved()+amount>limitUsd+1e-7)return false;
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
    return {reserve,remainingUsd:()=>money(Math.max(0,limitUsd-reserved())),
      committedReserveUsd:reserved,close};
  }catch(e){
    await lockHandle.close().catch(()=>{});
    await unlink(filename+'.lock').catch(()=>{});
    throw e;
  }
}
