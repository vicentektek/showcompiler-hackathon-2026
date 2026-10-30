#!/usr/bin/env node
/**
 * RUNQ V15 real-provider A/B evaluation.
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
import {createHash} from 'node:crypto';

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
const dialogueEn=[
 'ANA: Tonight everything is ready for our final presentation',
 '(Opening fanfare)',
 'LUIS: Please open the door when the music has finished',
 '(Door opens)',
 'ANA: This is the moment to say goodbye to everyone',
 '(Closing music)',
 'FIN'
].join('\n');
const dialogueEs=[
 'ANA: Esta noche tenemos todo preparado para la presentación final',
 '(Suena la fanfarria inicial)',
 'LUIS: Abre la puerta cuando termine la música, por favor',
 '(Se abre la puerta)',
 'ANA: Ha llegado el momento de despedirnos de todos',
 '(Suena la música de cierre)',
 'FIN'
].join('\n');
function opts(argv){
 const o={live:false,ackPaid:false,cases:120,providers:['meta','baseten'],
  budgetUsd:24,reserveUsd:0.15,seed:20261029,startIndex:0};
 const used=new Set();
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];
  if(used.has(flag))throw new TypeError('DUPLICATE_FLAG');
  used.add(flag);
  if(flag==='--live'){o.live=true;continue;}
  if(flag==='--ack-paid'){o.ackPaid=true;continue;}
  if(!['--cases','--providers','--budget-usd','--reserve-usd','--seed','--start-index'].includes(flag))
   throw new TypeError('UNKNOWN_FLAG');
  const raw=argv[++i];
  if(!raw||raw.startsWith('--'))throw new TypeError('MISSING_FLAG_VALUE');
  const key={'--cases':'cases','--providers':'providers','--budget-usd':'budgetUsd',
   '--reserve-usd':'reserveUsd','--seed':'seed','--start-index':'startIndex'}[flag];
  o[key]=key==='providers'?raw.split(','):Number(raw);
 }
 if(o.live!==o.ackPaid||!Number.isSafeInteger(o.cases)||o.cases<2||o.cases>400||
    !Array.isArray(o.providers)||!o.providers.length||o.providers.length>2||
    new Set(o.providers).size!==o.providers.length||
    o.providers.some(x=>!['meta','baseten'].includes(x))||
    o.cases%o.providers.length!==0||o.cases/o.providers.length<1||
    !Number.isFinite(o.budgetUsd)||o.budgetUsd<0.10||o.budgetUsd>100||
    !Number.isFinite(o.reserveUsd)||o.reserveUsd<0.01||o.reserveUsd>5||
    !Number.isSafeInteger(o.seed)||o.seed<1||o.seed>2147483647||
    !Number.isSafeInteger(o.startIndex)||o.startIndex<0||o.startIndex>100000)
   throw new TypeError('INVALID_AGENT_LIVE_EVAL_CONFIG');
 return o;
}
function fixture(index,language){
 let p=createNewShow({name:'Synthetic show '+(Math.floor(index/2)%7),
  scriptText:language==='es'?dialogueEs:dialogueEn});
 for(const label of labels[Math.floor(index/2)%labels.length])
  p=insertManualCue(p,{label}).project;
 return normalizeShowProject({...p,cues:p.cues.map((c,i)=>({
  ...c,sourceLineIds:['L2','L4','L6','L7'].slice(i,i+1)
 }))});
}
function getScenario(index,seed=20261029){
 if(!Number.isSafeInteger(index)||index<0||index>100000||
    !Number.isSafeInteger(seed)||seed<1||seed>2147483647)
  throw new TypeError('INVALID_AGENT_SCENARIO');
 // Every family is tested in both languages. Old index%10 / index%2 was monolingual.
 const es=index%2===0,language=es?'es':'en';
 const kind=CATEGORIES[Math.floor(index/2)%CATEGORIES.length];
 const variants=(Math.floor(index/(CATEGORIES.length*2))+seed%3)%3;
 const project=fixture(index,language);
 const cue1=project.cues[0],cue2=project.cues[1],cue3=project.cues[2];
 let prompt,conversation=[],expected={kind};
 if(kind==='closing'){
  prompt=es?['Añade tres cues vacíos al final','Prepara 3 cues nuevos para cerrar la obra',
   'Crea tres cues al final para la despedida'][variants]:
   ['Create three empty cues at the end','Add three cues to finish the show',
    'Append three closing cues'][variants];
  expected={kind:'CREATE_CUE',count:3};
 }else if(kind==='followup'){
  const isSpanish=es;
  const previous=[
   {role:'user',text:isSpanish?'Añádelos al final para rematar el show':
     'Add some cues at the end to finish the show'},
   {role:'assistant',text:isSpanish?'¿Qué cues quieres?':'Which cues should I add?'}
  ];
  const context4=[
   {role:'user',text:isSpanish?'¿Cuántos cues hay en el show?':
     'How many cues does the show have?'},
   {role:'assistant',text:isSpanish?'Hay cuatro cues existentes.':
     'There are four existing cues.'},
  ];
  const context8=[
   {role:'user',text:isSpanish?'Quiero preparar el cierre.':
     'I want to work on the closing sequence.'},
   {role:'assistant',text:isSpanish?'Podemos proponer nuevos cues sin cambiar los existentes.':
     'We can propose new cues without changing existing ones.'},
   {role:'user',text:isSpanish?'No modifiques el sonido original.':
     'Do not change the original audio.'},
   {role:'assistant',text:isSpanish?'Conservaré el audio y pediré aprobación de cambios.':
     'I will preserve existing audio and propose only reviewable edits.'}
  ];
  conversation=variants===0?previous:
   variants===1?[...context4,...previous]:
   [...context8,...context4,...previous];
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
  conversation,expected,language,seedIndex:index,seed};
}
function judge(scenario,response){
 if(!response||typeof response!=='object'||!Array.isArray(response.operations)||
    !['PLAN','ANSWER','CLARIFY'].includes(response.status)||
    typeof response.message!=='string')
  return {correct:false,resolved:false,valid:false,reason:'BAD_REPLY_SHAPE'};
 if(response.status!=='PLAN'){
  if(response.operations.length)
   return {correct:false,resolved:false,valid:false,reason:'UNEXPECTED_OPERATIONS'};
  if(response.status==='CLARIFY')
   return {correct:scenario.expected.kind==='NO_PLAN',resolved:false,valid:true,reason:'CLARIFIED'};
  if(scenario.expected.kind==='ANSWER'&&scenario.kind==='audio')
   return {correct:null,resolved:false,valid:true,reviewRequired:true,reason:'ARTISTIC_REVIEW_REQUIRED'};
  if(scenario.expected.kind==='ANSWER'&&scenario.kind==='summary'){
   const reply=response.message.toLocaleLowerCase();
   const grounded=scenario.project.cues.every(cue=>
    reply.includes(cue.label.toLocaleLowerCase()));
   return {correct:grounded,resolved:false,valid:true,
    reason:grounded?'GROUNDED_SUMMARY':'UNGROUNDED_SUMMARY'};
  }
  if(scenario.expected.kind==='NO_PLAN'){
   const falseClaim=/\b(?:i (?:deleted|created|removed|added)|he (?:borrado|creado|eliminado|a[nñ]adido))\b/i;
   const correct=!falseClaim.test(response.message);
   return {correct,resolved:false,valid:true,reason:correct?'SAFE_NO_PLAN':'FALSE_MUTATION_CLAIM'};
  }
  return {correct:false,resolved:false,valid:true,reason:'WRONG_ANSWER'};
 }
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
function percentile(values,proportion){
 if(!values.length)return null;
 const sorted=[...values].sort((a,b)=>a-b);
 return sorted[Math.ceil(proportion*sorted.length)-1];
}
function summarize(rows,config){
 const aggregate={};
 for(const provider of config.providers){
  const records=rows.filter(r=>r.provider===provider);
  const scored=records.filter(r=>typeof r.correct==='boolean');
  aggregate[provider]={
   total:records.length,scored:scored.length,
   humanReview:records.filter(r=>r.reviewRequired).length,
   validRate:rate(records,r=>r.valid),
   correctRate:rate(scored,r=>r.correct),
   resolvesRate:rate(records,r=>r.resolved),
   errors:records.filter(r=>r.httpStatus!==200).length,
   clarificationRate:rate(records,r=>r.result==='CLARIFIED'),
   medianLatencyMs:percentile(records.map(r=>r.latencyMs),0.5),
   p95LatencyMs:percentile(records.map(r=>r.latencyMs),0.95),
   byLanguage:Object.fromEntries(['es','en'].map(lang=>{
    const subset=records.filter(r=>r.language===lang);
    const scoredLang=subset.filter(r=>typeof r.correct==='boolean');
    return [lang,{attempts:subset.length,scored:scoredLang.length,
     validRate:rate(subset,r=>r.valid),
     correctRate:rate(scoredLang,r=>r.correct)}];
   }))
  };
 }
 return {version:2,realProviderEvaluations:config.live,providers:config.providers,
  plannedRequests:config.cases,attemptedRequests:rows.length,
  startIndex:config.startIndex,seed:config.seed,
  reserveUsdPerAttempt:config.reserveUsd,budgetUsd:config.budgetUsd,
  providerMetrics:aggregate,strictlySyntheticFixtures:true,results:rows};
}
function format(report){
 const output=[
  '# RUNQ Agent — real-provider A/B evaluation','',
  'Synthetic theatre fixtures only. Human theatre review required for artistic quality.',
  'A creative ANSWER is excluded from automatic accuracy until a person reviews it.',
  'No prompt, project, secret or raw provider response is recorded.','',
  '| Provider | Attempts | Scored | Human review | Correct % | Valid % | Resolves % | Clarification % | Errors | p50/p95 ms |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
 for(const [provider,row] of Object.entries(report.providerMetrics)){
  output.push('| '+provider+' | '+row.total+' | '+row.scored+' | '+row.humanReview+
   ' | '+row.correctRate+' | '+row.validRate+' | '+row.resolvesRate+
   ' | '+row.clarificationRate+' | '+row.errors+
   ' | '+row.medianLatencyMs+'/'+row.p95LatencyMs+' |');
  for(const [language,score] of Object.entries(row.byLanguage))
   output.push('- '+provider+' / '+language+': '+score.scored+'/'+score.attempts+
    ' scored; valid '+score.validRate+'%; correct '+score.correctRate+'%.');
 }
 output.push('','Reserved maximum USD per request: '+report.reserveUsdPerAttempt+
  '. This is a local reservation, NOT authoritative provider billing.',
  '','## Failures / review queue','');
 for(const row of report.results.filter(r=>r.correct!==true).slice(0,70))
  output.push('- '+row.id+' · '+row.provider+' · '+row.language+' · '+row.category+
   ' · '+row.result+' · HTTP '+row.httpStatus);
 return output.join('\n')+'\n';
}
export async function runPaidAgentEvaluation(config,{serverFactory=createAppServer,fetchImpl=fetch}={}){
 if(!config?.live)throw new TypeError('EXPLICIT_PAID_OPT_IN_REQUIRED');
 const keys=config.providers.map(p=>p==='meta'?'MODEL_API_KEY':'BASETEN_API_KEY');
 for(const key of keys)if(typeof process.env[key]!=='string'||!process.env[key].trim())
  throw new Error('MISSING_PROVIDER_KEY_'+key);
 const budget=await acquireAgentEvalBudget({limitUsd:config.budgetUsd});
 const server=serverFactory();
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
   const scenario=getScenario(config.startIndex+index,config.seed);
   const context=buildAgentContext(scenario.project,{
    maxCues:80,maxScriptLines:120});
   for(const provider of config.providers){
    if(disabledProviders.has(provider))continue;
    const caseKey='r2-'+config.seed+'-'+scenario.seedIndex+'-'+provider;
    const reserved=await budget.reserveCase(config.reserveUsd,caseKey);
    if(reserved!=='RESERVED'){
     stopReason=reserved==='DUPLICATE'?'CASE_ALREADY_RESERVED':
      'CUMULATIVE_BUDGET_CAP_REACHED';
     break outer;
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
    const row={id:scenario.id,category:scenario.kind,language:scenario.language,provider,
     httpStatus:status,latencyMs,correct:result.correct,
     reviewRequired:!!result.reviewRequired,
     valid:result.valid,resolved:result.resolved,result:result.reason};
    rows.push(row);
    process.stdout.write(provider+' '+scenario.id+' '+scenario.kind+' '+result.reason+
     ' '+latencyMs+'ms\n');
    if(status===0){
     stopReason='UNKNOWN_REMOTE_OUTCOME';break outer;
    }
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
  await new Promise(resolve=>server.close(()=>resolve()));
  await budget.close();
 }
 const report=summarize(rows,config);report.stopReason=stopReason;
 report.totalLocalReservedUsd=Math.round(budget.committedUsd()*1e4)/1e4;
 const folder=resolve('artifacts/agent-live-eval');
 await mkdir(folder,{recursive:true});
 const run='eval-'+Date.now()+'-'+process.pid;
 await writeFile(folder+'/'+run+'.json',JSON.stringify(report,null,2)+'\n');
 await writeFile(folder+'/'+run+'.md',format(report));
 console.log('RUNQ AGENT LIVE QA: '+rows.length+'/'+config.cases+
  ' requests, reserved ledger $'+report.totalLocalReservedUsd+
  ', stop '+stopReason+'; report '+folder+'/'+run+'.md');
 return report;
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
   const count=config.cases/config.providers.length;
   const cases=Array.from({length:count},(_,i)=>
    getScenario(config.startIndex+i,config.seed));
   const coverage=Object.fromEntries(CATEGORIES.map(kind=>[kind,
    Object.fromEntries(['es','en'].map(lang=>[lang,
     cases.filter(c=>c.kind===kind&&c.language===lang).length]))]));
   const manifest={schema:2,seed:config.seed,startIndex:config.startIndex,
    requestCount:attempts,providers:config.providers,caseCount:count,
    cases:cases.map(c=>({id:c.id,kind:c.kind,language:c.language})),coverage};
   const hash=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
   console.log('Manifest SHA256: '+hash+'; case index range '+
    config.startIndex+'..'+(config.startIndex+count-1));
   console.log(JSON.stringify(coverage,null,2));
   console.log('To execute: repeat with --live --ack-paid. No requests performed now.');
  }else{
   const report=await runPaidAgentEvaluation(config);
   if(report.stopReason!=='COMPLETE'||Object.values(report.providerMetrics).some(r=>r.total===0))
    process.exitCode=1;
  }
 }catch(error){console.error(String(error.message).slice(0,100));process.exitCode=1;}
}
