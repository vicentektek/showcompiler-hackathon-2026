/**
 * Durable cross-run budget reservations for explicitly authorized agent AI QA.
 * Account charges may differ. Separate from the existing $2 seminar budget.
 * Never holds API credentials, scripts, prompts or provider responses.
 */
import {mkdir,open,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';

const FILE=resolve('.runq-local/agent-live-eval-budget.json');
const MAX_LIMIT=100;
const cents=n=>Math.round((n+Number.EPSILON)*1e6)/1e6;
const amount=n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=MAX_LIMIT;
const validCaseKey=key=>typeof key==='string'&&/^[a-zA-Z0-9._:-]{8,120}$/.test(key);
export async function acquireAgentEvalBudget({file=FILE,limitUsd=30}={}){
 if(!amount(limitUsd)||typeof file!=='string'||file.length<8||file.length>400)
  throw new TypeError('INVALID_PAID_BUDGET');
 const filename=resolve(file);
 await mkdir(dirname(filename),{recursive:true});
 let lock;
 try{lock=await open(filename+'.lock','wx',0o600);}
 catch{throw new Error('AGENT_EVAL_BUDGET_LOCKED');}
 let records=[],closed=false;
 try{
  let raw;
  try{raw=await readFile(filename,'utf8');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(raw){
   const state=JSON.parse(raw);
   if(state.version!==1||!Array.isArray(state.records)||state.records.length>20000)
    throw new TypeError('AGENT_EVAL_LEDGER_INVALID');
   records=state.records;
   if(records.some(x=>!x||!amount(x.reserveUsd)||!Number.isSafeInteger(x.sequence)||
    (x.caseKey!==undefined&&!validCaseKey(x.caseKey)))||
    new Set(records.filter(x=>x.caseKey!==undefined).map(x=>x.caseKey)).size!==
      records.filter(x=>x.caseKey!==undefined).length)
    throw new TypeError('AGENT_EVAL_LEDGER_DAMAGED');
  }
  const spent=()=>cents(records.reduce((sum,x)=>sum+x.reserveUsd,0));
  // A durable reservation is consumed before the HTTP request. Even a crash or
  // ambiguous timeout is NOT permission to resend that same paid scenario.
  async function reserveInternal(usd,caseKey=null){
   if(closed||!amount(usd))throw new TypeError('INVALID_BUDGET_RESERVATION');
   if(caseKey!==null&&!validCaseKey(caseKey))
    throw new TypeError('INVALID_CASE_KEY');
   if(caseKey!==null&&records.some(x=>x.caseKey===caseKey))return 'DUPLICATE';
   if(spent()+usd>limitUsd+0.0000001)return 'BUDGET_CAP';
   records.push({sequence:records.length+1,reserveUsd:cents(usd),
    ...(caseKey===null?{}:{caseKey})});
   const tmp=filename+'.tmp-'+process.pid;
   try{
    await writeFile(tmp,JSON.stringify({version:1,records},null,2)+'\n',{mode:0o600});
    await rename(tmp,filename);
   }catch(error){records.pop();await unlink(tmp).catch(()=>{});throw error;}
   return 'RESERVED';
  }
  // Backward compatible with existing consumers and offline unit tests.
  async function reserve(usd){return (await reserveInternal(usd))==='RESERVED';}
  async function reserveCase(usd,caseKey){return reserveInternal(usd,caseKey);}
  async function close(){
   if(closed)return;closed=true;
   await lock.close();await unlink(filename+'.lock').catch(()=>{});
  }
  return {reserve,reserveCase,committedUsd:spent,remainingUsd:()=>cents(Math.max(0,limitUsd-spent())),close};
 }catch(error){
  await lock.close().catch(()=>{});await unlink(filename+'.lock').catch(()=>{});
  throw error;
 }
}
