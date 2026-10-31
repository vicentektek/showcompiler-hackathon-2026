/**
 * REAL paid agent evaluation harness (Meta vs Baseten) for original scenes.
 * Default = DRY RUN (no network). Paid run needs: --live --ack-paid, a valid
 * cases.lock.json, provider keys in the environment, and per-provider ledgers.
 * Coding agents / CI must not launch --live on their own.
 * Cost note: ledgers hold a conservative per-call RESERVATION, not Meta/Baseten billing.
 */
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createAppServer} from './dev-server.mjs';
import {acquireAgentEvalBudget} from './agentLiveBudget.mjs';
import {buildCases,buildSceneProject,judgeCase,judgeProject} from './theatreEvalCases.mjs';
import {SCENES} from '../fixtures/qa/theatre-real/scenes.mjs';
import {buildAgentContext,fitAgentContext,prepareAgentPlan,commitAgentPlan} from '../src/core/agentCore.mjs';

const LOCK='fixtures/qa/theatre-real/cases.lock.json';
export const LIMITS={meta:13,baseten:13};
export const RESERVE_USD=0.02; // pilot measured ~2k tokens/call (~0.005 USD at listed Baseten prices)
const PILOT_FNS=['delete-number','delete-description','move','update-gain','update-fade','rename','create-named',
 'create-multiple','voice-trigger','notes-actor','query','negation','transport'];

const sha=async f=>createHash('sha256').update(await readFile(resolve(f))).digest('hex');
export async function currentHashes(){
 return {cases:createHash('sha256').update(JSON.stringify(buildCases())).digest('hex'),
  judge:await sha('tools/theatreEvalCases.mjs'),scenes:await sha('fixtures/qa/theatre-real/scenes.mjs')};
}
export function selectCases(set){
 const all=buildCases();
 if(set==='holdout')return all.filter(c=>c.split==='holdout');
 if(set==='dev')return all.filter(c=>c.split==='dev');
 if(set==='spec-dev')return all.filter(c=>c.split==='dev'&&/-0[78]$/.test(c.scene));
 if(set==='all')return all;
 const dev=all.filter(c=>c.split==='dev'),pilot=[];
 PILOT_FNS.forEach((fn,i)=>{
  const scenes=SCENES.filter(s=>s.split==='dev'&&(i%2===0?s.lang==='es':s.lang==='en'));
  pilot.push(dev.find(c=>c.fn===fn&&c.scene===scenes[i%scenes.length].id));
 });
 pilot.push(dev.find(c=>c.id==='ES-02-ambiguity'),dev.find(c=>c.id==='EN-02-ambiguity'));
 return pilot.filter(Boolean);
}

function usageOf(text){
 try{const u=JSON.parse(text).usage;return u?{prompt:u.prompt_tokens??null,completion:u.completion_tokens??null,total:u.total_tokens??null}:null;}
 catch{return null;}
}

export async function runEvaluation({set='pilot',providers=['meta','baseten'],live=false,ackPaid=false,outDir='artifacts/theatre50-real-eval',
 ledgerDir='.runq-local',tag=set,ids=null}={}){
 const cases=selectCases(set).filter(c=>!ids||ids.includes(c.id));
 const plan={set,tag,cases:cases.length,providers,requests:cases.length*providers.length,
  reservedUsdEstimate:+(cases.length*providers.length*RESERVE_USD).toFixed(2),limits:LIMITS};
 if(!live)return {dryRun:true,plan};
 if(!ackPaid)throw new TypeError('EXPLICIT_PAID_OPT_IN_REQUIRED');
 if(process.env.CI==='true')throw new TypeError('PAID_TESTS_DISABLED_IN_CI');
 const lock=JSON.parse(await readFile(resolve(LOCK),'utf8')),now=await currentHashes();
 if(JSON.stringify(lock.hashes)!==JSON.stringify(now))throw new TypeError('CRITERIA_CHANGED_AFTER_LOCK');
 const dir=resolve(outDir);await mkdir(dir,{recursive:true});
 const rawFile=resolve(dir,`raw-${tag}.jsonl`);
 const captures=[];
 const realFetch=fetch;
 const wrapped=async(url,init)=>{
  const started=performance.now(),response=await realFetch(url,init),text=await response.clone().text();
  captures.push({url:String(url).replace(/\?.*/,''),status:response.status,latencyMs:Math.round(performance.now()-started),
   request:JSON.parse(init.body),response:text.slice(0,60000)});
  return response;
 };
 const server=createAppServer({agentFetch:wrapped});
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
 const origin='http://127.0.0.1:'+server.address().port;
 const rows=[];
 const ledgers={};
 try{
  for(const p of providers)ledgers[p]=await acquireAgentEvalBudget({file:`${ledgerDir}/theatre-real-${p}.json`,limitUsd:LIMITS[p]});
  const stopped=new Set(),streak={};
  for(const c of cases){
   for(const provider of providers){
    if(stopped.has(provider))continue;
    const key=`${tag.replace(/[^a-zA-Z0-9]/g,'')}.${provider}.${c.id}`;
    const reserved=await ledgers[provider].reserveCase(RESERVE_USD,key);
    if(reserved==='BUDGET_CAP'){stopped.add(provider);rows.push({id:c.id,provider,skipped:'BUDGET_CAP'});continue;}
    if(reserved==='DUPLICATE'){rows.push({id:c.id,provider,skipped:'DUPLICATE'});continue;}
    const project=buildSceneProject(SCENES.find(s=>s.id===c.scene));
    const focus=null;
    const context=fitAgentContext(buildAgentContext(project,{focusLineId:focus,assetAvailable:()=>true}));
    const body={prompt:c.prompt,language:c.language,context,provider,conversation:c.conversation};
    captures.length=0;
    const started=performance.now();
    let httpStatus=0,payload={};
    try{
     const r=await realFetch(origin+'/api/agent/interpret',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Runq-Agent-Consent':'yes'},body:JSON.stringify(body)});
     httpStatus=r.status;payload=await r.json().catch(()=>({}));
    }catch(error){payload={error:'NETWORK_'+(error?.name??'ERR')};}
    const latencyMs=Math.round(performance.now()-started);
    const response={httpStatus,...payload};
    let final=project,applyError='';
    if(httpStatus===200&&payload.status==='PLAN'&&payload.operations?.length){
     try{final=commitAgentPlan(project,prepareAgentPlan(project,payload.operations),{editable:true}).project;}
     catch(error){applyError=error?.code??error?.message??'APPLY_FAILED';}
    }
    const metrics=judgeCase(c,project,response);
    let projectFailure=null;
    if(httpStatus===200){projectFailure=applyError?'PLAN_REJECTED_BY_VALIDATOR:'+applyError:judgeProject(project,final,c.expect);}
    metrics.modification=httpStatus!==200?false:projectFailure===null?true:projectFailure==='PENDING_HUMAN_REVIEW'?null:false;
    if(c.expect.kind==='ART')metrics.art='PENDING_HUMAN_REVIEW';
    metrics.failure=metrics.failure||(projectFailure&&projectFailure!=='PENDING_HUMAN_REVIEW'?projectFailure:'');
    const cap=captures[0];
    const row={id:c.id,provider,scene:c.scene,split:c.split,fn:c.fn,language:c.language,prompt:c.prompt,conversation:c.conversation,
     expect:c.expect,httpStatus,status:payload.status??'',message:payload.message??'',operations:payload.operations??[],
     errorCode:payload.error??'',errorReason:payload.reason??'',applyError,metrics,latencyMs,
     providerLatencyMs:cap?.latencyMs??null,usage:cap?usageOf(cap.response):null,reservedUsd:RESERVE_USD,contextChars:JSON.stringify(context).length,
     goldStatus:'AUTHOR_PREREGISTERED_NOT_HUMAN_VALIDATED',simulated:false};
    rows.push(row);
    await appendFile(rawFile,JSON.stringify({row,capture:cap,context,projectBefore:project,projectAfter:final})+'\n');
    const bad=httpStatus!==200&&!(httpStatus===502&&['MODEL_TIMEOUT','BAD_MODEL_REPLY'].includes(payload.reason));
    streak[provider]=bad||httpStatus===0?(streak[provider]??0)+1:0;
    if(streak[provider]>=3)stopped.add(provider);
   }
  }
 }finally{
  await new Promise(done=>server.close(done));
  for(const l of Object.values(ledgers))await l.close();
 }
 return {dryRun:false,plan,rows};
}

export function summarize(rows){
 const by=(key)=>{const m=new Map();
  for(const r of rows.filter(x=>!x.skipped)){const k=r[key];const e=m.get(k)??{n:0,interp:0,sel:0,selN:0,mod:0,modN:0,unauth:0,httpFail:0,lat:[]};
   e.n++;if(r.metrics.interpretation)e.interp++;if(r.metrics.selection!==null){e.selN++;if(r.metrics.selection)e.sel++;}
   if(r.metrics.modification!==null){e.modN++;if(r.metrics.modification)e.mod++;}
   if(r.metrics.unauthorized)e.unauth++;if(r.httpStatus!==200)e.httpFail++;e.lat.push(r.latencyMs);m.set(k,e);}
  return Object.fromEntries([...m].map(([k,e])=>[k,{requests:e.n,interpretation:e.interp,selection:`${e.sel}/${e.selN}`,
   modification:`${e.mod}/${e.modN}`,unauthorizedOps:e.unauth,httpFailures:e.httpFail,
   medianMs:e.lat.sort((a,b)=>a-b)[Math.floor(e.lat.length/2)]}]));
 };
 return {byProvider:by('provider'),byFunction:by('fn')};
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked){
 const arg=name=>{const i=process.argv.indexOf(name);return i>0?process.argv[i+1]:undefined;};
 if(process.argv.includes('--write-lock')){
  await writeFile(resolve(LOCK),JSON.stringify({lockedAt:new Date().toISOString(),note:'Criteria frozen before any paid call.',hashes:await currentHashes()},null,1));
  console.log('lock written');
 }else{
  const result=await runEvaluation({set:arg('--set')??'pilot',providers:(arg('--providers')??'meta,baseten').split(','),
   ids:arg('--ids')?arg('--ids').split(','):null,live:process.argv.includes('--live'),ackPaid:process.argv.includes('--ack-paid'),tag:arg('--tag')});
  if(result.dryRun)console.log(JSON.stringify(result.plan,null,1));
  else{
   await writeFile(resolve('artifacts/theatre50-real-eval',`summary-${result.plan.tag}.json`),JSON.stringify(summarize(result.rows),null,1));
   console.log(JSON.stringify(summarize(result.rows),null,1));
  }
 }
}
