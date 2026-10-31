#!/usr/bin/env node
/**
 * RUNQ bounded Meta product evaluation.
 *
 * Default is DRY RUN; --live --ack-paid explicitly authorizes billed calls.
 * Same synthetic show and prompt go to each selected provider, sequentially.
 * Results contain ONLY derived metrics and synthetic case IDs, no keys, script,
 * prompts or model output. No retries, no GO/STOP, no writes to shows.
 */
import {createAppServer} from './dev-server.mjs';
import {acquireAgentEvalBudget} from './agentLiveBudget.mjs';
import {createNewShow} from '../src/core/workspace.mjs';
import {insertManualCue} from '../src/core/manualCues.mjs';
import {normalizeShowProject} from '../src/core/projectPersistence.mjs';
import {buildAgentContext,prepareAgentPlan,commitAgentPlan,undoAgentPlan} from '../src/core/agentCore.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {acquireGlobalSpendLedger} from '../src/qa/globalSpendLedger.mjs';
import {CAMPAIGN_POLICY} from '../src/qa/campaignPolicy.mjs';

const CATEGORIES=[
 'closing','followup','delete','reorder','rename','summary',
 'negative','missing','voice','audio'
];
const labels=[
 ['Intro','Door ambience','Musical transition','Final scene'],
 ['Opening bell','Wind effect','Show finale','Curtain call'],
 ['Theatre intro','Thunder','Music sting','Exit sequence'],
 ['Introducción','Puerta','Transición final','Despedida'],
];
const dialogue=[
 'ANA: Tonight everything is ready for our final presentation',
 '(Opening fanfare)',
 'LUIS: Please open the door when the music has finished',
 '(Door opens)',
 'ANA: This is the moment to say goodbye to everyone',
 '(Closing music)',
 'FIN'
].join('\n');
function opts(argv){
 const o={live:false,ackPaid:false,cases:20,providers:['meta'],
  budgetUsd:CAMPAIGN_POLICY.capsUsd.meta,reserveUsd:0.15,seed:20261029};
 const used=new Set();
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];
  if(used.has(flag))throw new TypeError('DUPLICATE_FLAG');
  used.add(flag);
  if(flag==='--live'){o.live=true;continue;}
  if(flag==='--ack-paid'){o.ackPaid=true;continue;}
  if(!['--cases','--providers','--budget-usd','--reserve-usd','--seed'].includes(flag))
   throw new TypeError('UNKNOWN_FLAG');
  const raw=argv[++i];
  if(!raw||raw.startsWith('--'))throw new TypeError('MISSING_FLAG_VALUE');
  const key={'--cases':'cases','--providers':'providers','--budget-usd':'budgetUsd',
   '--reserve-usd':'reserveUsd','--seed':'seed'}[flag];
  o[key]=key==='providers'?raw.split(','):Number(raw);
 }
 if(o.live!==o.ackPaid||!Number.isSafeInteger(o.cases)||o.cases<2||o.cases>400||
    !Array.isArray(o.providers)||!o.providers.length||o.providers.length>2||
    new Set(o.providers).size!==o.providers.length||
    o.providers.some(x=>x!=='meta')||
    o.cases%o.providers.length!==0||o.cases/o.providers.length<1||
    !Number.isFinite(o.budgetUsd)||o.budgetUsd<0.10||o.budgetUsd>CAMPAIGN_POLICY.capsUsd.meta||
    !Number.isFinite(o.reserveUsd)||o.reserveUsd<0.15||o.reserveUsd>5||
    !Number.isSafeInteger(o.seed)||o.seed<1||o.seed>2147483647)
   throw new TypeError('INVALID_AGENT_LIVE_EVAL_CONFIG');
 return o;
}
function fixture(index){
 let p=createNewShow({name:'Synthetic show '+(index%7),scriptText:dialogue});
 for(const label of labels[index%labels.length])
  p=insertManualCue(p,{label}).project;
 return normalizeShowProject({...p,cues:p.cues.map((c,i)=>({
  ...c,sourceLineIds:['L2','L4','L6','L7'].slice(i,i+1)
 }))});
}
function getScenario(index){
 const project=fixture(index),kind=CATEGORIES[index%CATEGORIES.length];
 const cue1=project.cues[0],cue2=project.cues[1],cue3=project.cues[2];
 const variants=index%3;
 const es=(index+Math.floor(index/CATEGORIES.length))%2===0,language=es?'es':'en';
 const count=(index%4)+2;
 let prompt,conversation=[],expected={kind};
 if(kind==='closing'){
  prompt=es?['Añade tres cues vacíos al final','Prepara 3 cues nuevos para cerrar la obra',
   'Crea tres cues al final para la despedida'][variants]:
   ['Create three empty cues at the end','Add three cues to finish the show',
    'Append three closing cues'][variants];
  expected={kind:'CREATE_CUE',count:3};
 }else if(kind==='followup'){
  conversation=[
   {role:'user',text:es?'Añádelos al final para rematar el show':
     'Add some cues at the end to finish the show'},
   {role:'assistant',text:es?'¿Qué cues quieres?':'Which cues should I add?'}
  ];
  prompt=es?'los que te parezcan más apropiados':'you decide what fits best';
  expected={kind:'CREATE_CUE',count:3};
 }else if(kind==='delete'){
  prompt=es?'Elimina el cue 2':'Delete cue 2';
  expected={kind:'DELETE_CUE',cueId:cue2.id,count:1};
 }else if(kind==='reorder'){
  prompt=es?'Mueve el cue 3 antes del cue 1':'Move cue 3 before cue 1';
  expected={kind:'REORDER_CUE',cueId:cue3.id,count:1};
 }else if(kind==='rename'){
  prompt=es?'Renombra el cue 1 como Inicio definitivo':
   'Rename cue 1 to Final opening';
  expected={kind:'UPDATE_CUE',cueId:cue1.id,count:1,
   label:es?'Inicio definitivo':'Final opening'};
 }else if(kind==='summary'){
  prompt=es?'Resume este espectáculo y enumera los cues existentes':
   'Summarize the existing cues in this show';
  expected={kind:'ANSWER'};
 }else if(kind==='negative'){
  prompt=es?'No añadas 3 cues al final':'Do not create three cues at the end';
  expected={kind:'NO_PLAN'};
 }else if(kind==='missing'){
  prompt=es?'Elimina el cue 99':'Delete cue 99';
  expected={kind:'NO_PLAN'};
 }else if(kind==='voice'){
  prompt=es?'Propón pies de voz para el cue 2 según el diálogo anterior':
   'Propose a spoken trigger for cue 2 from previous dialogue';
  expected={kind:'UPDATE_CUE',cueId:cue2.id,count:1,trigger:true};
 }else{
  prompt=es?'¿Cómo mejorarías el sonido de la transición final?':
   'How can the final transition sound better?';
  expected={kind:'ANSWER'};
 }
 return {id:'paid-'+String(index+1).padStart(4,'0'),kind,project,prompt,
  conversation,expected,language,seedIndex:index};
}
function judge(scenario,response){
 if(response.status==='CLARIFY')return {correct:scenario.expected.kind==='NO_PLAN',
  resolved:false,valid:true,reason:'CLARIFIED'};
 if(response.status==='ANSWER')return {correct:['ANSWER','NO_PLAN'].includes(scenario.expected.kind),
  resolved:false,valid:true,reason:'ANSWERED'};
 if(response.status!=='PLAN')return {correct:false,resolved:false,valid:false,reason:'BAD_STATUS'};
 try{
  const plan=prepareAgentPlan(scenario.project,response.operations);
  const {expected}=scenario;
  let correct=false;
  if(expected.kind==='CREATE_CUE'){
   correct=plan.operations.length===expected.count&&
    plan.operations.every(x=>x.op==='CREATE_CUE'&&x.afterCueId===null)&&
    plan.proposedProject.cues.length===scenario.project.cues.length+expected.count&&
    plan.proposedProject.cues.slice(-expected.count).every(x=>
     x.actions.length===1&&x.actions[0].type==='PLAN_AUDIO'&&x.sourceLineIds.length===0);
  }else if(expected.kind==='UPDATE_CUE'){
   const op=plan.operations;
   correct=op.length===expected.count&&op.every(x=>x.op==='UPDATE_CUE'&&x.cueId===expected.cueId);
   if(expected.label)correct&&=plan.proposedProject.cues[0].label===expected.label;
   if(expected.trigger)correct&&=(plan.proposedProject.cues[1].trigger??'').split(' ').length>=3;
  }else if(expected.kind==='DELETE_CUE'){
   correct=plan.operations.length===1&&plan.operations[0].op==='DELETE_CUE'&&
    plan.operations[0].cueId===expected.cueId;
  }else if(expected.kind==='REORDER_CUE'){
   correct=plan.operations.length===1&&plan.operations[0].op==='REORDER_CUE'&&
    plan.operations[0].cueId===expected.cueId&&plan.proposedProject.cues[0].id===expected.cueId;
  }
  const applied=commitAgentPlan(scenario.project,plan,{editable:true});
  if(JSON.stringify(undoAgentPlan(applied.project,applied.undo,{editable:true}))!==
    JSON.stringify(scenario.project))throw new Error('UNDO_MISMATCH');
  return {correct,resolved:true,valid:true,reason:correct?'CORRECT':'WRONG_PLAN'};
 }catch(error){
  return {correct:false,resolved:false,valid:false,reason:
   (error.code??error.message??'INVALID_PLAN').slice(0,65)};
 }
}
function rate(values,predicate){return values.length?Math.round(1000*values.filter(predicate).length/values.length)/10:null;}
function summarize(rows,config){
 const aggregate={};
 for(const provider of config.providers){
  const records=rows.filter(r=>r.provider===provider);
  aggregate[provider]={
   total:records.length,validRate:rate(records,r=>r.valid),
   correctRate:rate(records,r=>r.correct),
   resolvesRate:rate(records,r=>r.resolved),
   errors:records.filter(r=>r.httpStatus!==200).length,
   clarificationRate:rate(records,r=>r.result==='CLARIFIED'),
   medianLatencyMs:records.length?records.map(r=>r.latencyMs).sort((a,b)=>a-b)[Math.floor(records.length/2)]:null,
  };
 }
 return {version:1,realProviderEvaluations:config.live,providers:config.providers,
  plannedRequests:config.cases,attemptedRequests:rows.length,
  reserveUsdPerAttempt:config.reserveUsd,budgetUsd:config.budgetUsd,
  providerMetrics:aggregate,strictlySyntheticFixtures:true,results:rows};
}
function format(report){
 const output=[
  '# RUNQ Agent — real-provider A/B evaluation','',
  'Synthetic theatre fixtures only. Human theatre review required for artistic quality.',
  'No prompt, project, secret or raw provider response is recorded.','',
  '| Provider | Attempts | Correct % | Valid % | Resolves % | Clarification % | Errors | Median ms |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
 for(const [provider,row] of Object.entries(report.providerMetrics))
  output.push('| '+provider+' | '+row.total+' | '+row.correctRate+' | '+row.validRate+
   ' | '+row.resolvesRate+' | '+row.clarificationRate+' | '+row.errors+
   ' | '+row.medianLatencyMs+' |');
 output.push('','Reserved maximum USD per request: '+report.reserveUsdPerAttempt+
  '. This is a local reservation, NOT authoritative provider billing.',
  '','## Failures / review queue','');
 for(const row of report.results.filter(r=>!r.correct).slice(0,70))
  output.push('- '+row.id+' · '+row.provider+' · '+row.category+
   ' · '+row.result+' · HTTP '+row.httpStatus);
 return output.join('\n')+'\n';
}
export async function runPaidAgentEvaluation(config,{serverFactory=createAppServer,fetchImpl=fetch,
 sharedLedgerFactory=acquireGlobalSpendLedger,budgetFactory=acquireAgentEvalBudget}={}){
 if(config?.live!==true||config.ackPaid!==true)throw new TypeError('EXPLICIT_PAID_OPT_IN_REQUIRED');
 config=opts(['--live','--ack-paid','--cases',String(config.cases),
  '--providers',config.providers?.join(',')??'','--budget-usd',String(config.budgetUsd),
  '--reserve-usd',String(config.reserveUsd),'--seed',String(config.seed)]);
 const shared=await sharedLedgerFactory();
 let sharedStatus;
 let budget,server;
 const runId='agent-'+randomUUID();
 const keys=['MODEL_API_KEY'];
 try{
 for(const key of keys)if(typeof process.env[key]!=='string'||!process.env[key].trim())
  throw new Error('MISSING_PROVIDER_KEY_'+key);
 budget=await budgetFactory({limitUsd:config.budgetUsd});
 // This private test server uses the reservation already held by THIS runner;
 // the normal application routes reserve independently via campaignFetch.
 server=serverFactory({agentFetch:fetch});
 const rows=[];
 let stopReason='COMPLETE';
 const disabledProviders=new Set();
 try{
  await new Promise((ok,fail)=>{
   server.once('error',fail);server.listen(0,'127.0.0.1',ok);
  });
  const origin='http://127.0.0.1:'+server.address().port;
  const count=config.cases/config.providers.length;
  outer:for(let index=0;index<count;index++){
   const scenario=getScenario(index);
   const context=buildAgentContext(scenario.project,{
    maxCues:80,maxScriptLines:120});
   for(const provider of config.providers){
    if(disabledProviders.has(provider))continue;
    if(!await budget.reserve(config.reserveUsd)){
     stopReason='CUMULATIVE_BUDGET_CAP_REACHED';break outer;
    }
    const requestId=runId+'-'+scenario.id;
    const reservation=await shared.reserve({requestId,runId,provider,estimatedMaximumUsd:config.reserveUsd});
    if(!reservation.accepted){
     stopReason='CAMPAIGN_'+reservation.reason;break outer;
    }
    const start=performance.now();
    let status=0,result={correct:false,valid:false,resolved:false,reason:'REQUEST_FAILED'};
    try{
     const response=await fetchImpl(origin+'/api/agent/interpret',{method:'POST',
      headers:{'Origin':origin,'Content-Type':'application/json',
       'X-Runq-Agent-Consent':'yes'},
      body:JSON.stringify({prompt:scenario.prompt,provider,
       language:scenario.language,conversation:scenario.conversation,context}),
      signal:AbortSignal.timeout(55000)});
     status=response.status;
     const reply=await response.json();
     if(status===200)result=judge(scenario,reply);
     else{
      result.reason=typeof reply.error==='string'?reply.error.slice(0,60):'HTTP_ERROR';
      if(result.reason==='AI_PROVIDER_UNAVAILABLE'&&[401,403,429].includes(reply.status))
       result.reason='UPSTREAM_AUTH_OR_RATE_'+reply.status;
     }
    }catch(error){result.reason=(error.name??'NETWORK_ERROR').slice(0,60);}
    const latencyMs=Math.round(performance.now()-start);
    const row={id:scenario.id,category:scenario.kind,provider,requestId,runId,
     promptVersion:'agent-design-context-rcv3',language:scenario.language,
     expectedProvenance:'synthetic independent product contract',
     reservedMaximumUsd:reservation.amountUsd,actualBilledUsd:null,
     tokens:null,retries:0,
     httpStatus:status,latencyMs,correct:result.correct,
     valid:result.valid,resolved:result.resolved,result:result.reason};
    rows.push(row);
    process.stdout.write(provider+' '+scenario.id+' '+scenario.kind+' '+result.reason+
     ' '+latencyMs+'ms\n');
    if([401,403,429].includes(status)||
       result.reason.startsWith('UPSTREAM_AUTH_OR_RATE_')||
       result.reason==='MODEL_API_KEY_NOT_CONFIGURED'){
     disabledProviders.add(provider);
     stopReason='PROVIDER_AUTH_OR_RATE_BLOCK';
     if(disabledProviders.size===config.providers.length)break outer;
    }
   }
  }
 }finally{
  if(server.listening)await new Promise(resolve=>server.close(()=>resolve()));
  sharedStatus=shared.status();
 }
 const report=summarize(rows,config);report.stopReason=stopReason;
 report.totalLocalReservedUsd=Math.round(budget.committedUsd()*1e4)/1e4;
 report.campaign=sharedStatus;
 const folder=resolve('artifacts/agent-live-eval');
 await mkdir(folder,{recursive:true});
 const run='eval-'+Date.now()+'-'+process.pid;
 await writeFile(folder+'/'+run+'.json',JSON.stringify(report,null,2)+'\n');
 await writeFile(folder+'/'+run+'.md',format(report));
 console.log('RUNQ AGENT LIVE QA: '+rows.length+'/'+config.cases+
  ' requests, reserved ledger $'+report.totalLocalReservedUsd+
  ', stop '+stopReason+'; report '+folder+'/'+run+'.md');
 return report;
 }finally{
  try{if(budget)await budget.close();}
  finally{await shared.close();}
 }
}
export {opts as parseAgentLiveOptions,getScenario as getAgentLiveScenario,judge as judgeAgentLiveReply};
const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked){
 try{
  const config=opts(process.argv.slice(2));
  if(!config.live){
   const attempts=config.cases,estimated=attempts*config.reserveUsd;
   console.log('DRY RUN: '+attempts+' real AI requests when authorized; '+
    config.providers.join(' vs ')+'; reserve budget estimate $'+estimated.toFixed(2)+
    ' of configured $'+config.budgetUsd+'.');
   console.log('To execute: repeat with --live --ack-paid. No requests performed now.');
  }else{
   const report=await runPaidAgentEvaluation(config);
   if(report.stopReason!=='COMPLETE'||Object.values(report.providerMetrics).some(r=>r.total===0))
    process.exitCode=1;
  }
 }catch(error){console.error(String(error.message).slice(0,100));process.exitCode=1;}
}
