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
import {AGENT_PROMPT_VERSION} from './agentRoutes.mjs';
import {acquireAgentEvalBudget} from './agentLiveBudget.mjs';
import {createNewShow} from '../src/core/workspace.mjs';
import {insertManualCue} from '../src/core/manualCues.mjs';
import {normalizeShowProject} from '../src/core/projectPersistence.mjs';
import {buildAgentContext,prepareAgentPlan,commitAgentPlan,undoAgentPlan} from '../src/core/agentCore.mjs';
import {writeFile,readFile,readdir} from 'node:fs/promises';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {acquireGlobalSpendLedger} from '../src/qa/globalSpendLedger.mjs';
import {CAMPAIGN_POLICY} from '../src/qa/campaignPolicy.mjs';
import {execFileSync} from 'node:child_process';
import {buildQualityMatrix} from '../src/qa/qualityMatrix.mjs';
import {evaluateMetaCase} from '../src/qa/qualityEvaluation.mjs';
import {qualityAttemptIdentity,saveQualityJson} from './qualityCampaign.mjs';
import {callMetaCueModel} from '../src/core/metaCueProvider.mjs';
import {makeShow} from './runq-show-assistant-gauntlet-v2.mjs';
import {resolveAgentDialogue,boundedAgentConversation} from '../src/core/agentDialogue.mjs';

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
  budgetUsd:CAMPAIGN_POLICY.capsUsd.meta,reserveUsd:0.15,seed:20261029,startIndex:0,
  targetTotal:null,verifiedSnapshot:null,corpus:'standard'};
 const used=new Set();
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];
  if(used.has(flag))throw new TypeError('DUPLICATE_FLAG');
  used.add(flag);
  if(flag==='--live'){o.live=true;continue;}
  if(flag==='--ack-paid'){o.ackPaid=true;continue;}
  if(!['--cases','--providers','--budget-usd','--reserve-usd','--seed','--start-index','--target-total',
    '--verified-snapshot','--corpus'].includes(flag))
   throw new TypeError('UNKNOWN_FLAG');
  const raw=argv[++i];
  if(!raw||raw.startsWith('--'))throw new TypeError('MISSING_FLAG_VALUE');
  const key={'--cases':'cases','--providers':'providers','--budget-usd':'budgetUsd',
   '--reserve-usd':'reserveUsd','--seed':'seed','--start-index':'startIndex','--target-total':'targetTotal',
   '--verified-snapshot':'verifiedSnapshot','--corpus':'corpus'}[flag];
  o[key]=key==='providers'?raw.split(','):['verifiedSnapshot','corpus'].includes(key)?raw:Number(raw);
 }
 if(o.live!==o.ackPaid||!Number.isSafeInteger(o.cases)||o.cases<2||o.cases>400||
    !Array.isArray(o.providers)||!o.providers.length||o.providers.length>2||
    new Set(o.providers).size!==o.providers.length||
    o.providers.some(x=>x!=='meta')||
    o.cases%o.providers.length!==0||o.cases/o.providers.length<1||
    !Number.isFinite(o.budgetUsd)||o.budgetUsd<0.10||o.budgetUsd>CAMPAIGN_POLICY.capsUsd.meta||
    !Number.isFinite(o.reserveUsd)||o.reserveUsd<0.15||o.reserveUsd>5||
    !Number.isSafeInteger(o.startIndex)||o.startIndex<0||o.startIndex>=424||
    (o.targetTotal!==null&&(!Number.isSafeInteger(o.targetTotal)||o.targetTotal<1||o.targetTotal>424))||
    !Number.isSafeInteger(o.seed)||o.seed<1||o.seed>2147483647||
    !['standard','gauntlet-v2'].includes(o.corpus))
   throw new TypeError('INVALID_AGENT_LIVE_EVAL_CONFIG');
 if(o.verifiedSnapshot!==null&&(typeof o.verifiedSnapshot!=='string'||o.verifiedSnapshot.length>500))
  throw new TypeError('INVALID_VERIFIED_SNAPSHOT_PATH');
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
  expected={kind:'CREATE_CUE',count:null,review:true};
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
function caseFingerprint(scenario){
 const cues=scenario.project.cues;
 return createHash('sha256').update(JSON.stringify({
  script:scenario.project.scriptText,cues:cues.map(c=>({
   label:c.label,sourceLineIds:c.sourceLineIds,trigger:c.trigger??'',
  })),prompt:scenario.prompt,conversation:scenario.conversation,language:scenario.language,
  expected:{...scenario.expected,cueId:scenario.expected.cueId
   ?cues.findIndex(c=>c.id===scenario.expected.cueId)+1:null},
 })).digest('hex');
}
async function recordedCases(folder,{simulated=false}={}){
 const fingerprints=new Set(),legacyIds=new Set(),completedFingerprints=new Set();
 const completedRows=new Map();
 let names;
 try{names=await readdir(folder);}
 catch(error){if(error.code==='ENOENT')return {fingerprints,legacyIds,completedFingerprints,completedRows};throw error;}
 for(const name of names.filter(n=>/^eval-\d+-\d+(?:-[a-f0-9-]+)?\.json$/.test(n)).sort()){
  const bytes=await readFile(resolve(folder,name));
  if(bytes.length>4_000_000)throw new Error('EVAL_HISTORY_TOO_LARGE');
  const report=JSON.parse(bytes.toString('utf8'));
  if(report.realProviderEvaluations===false&&report.evidenceMode==='OFFLINE_SIMULATED_TRANSPORT'&&!simulated)continue;
  if(report.version!==2||!(report.realProviderEvaluations===true||
     simulated&&report.evidenceMode==='OFFLINE_SIMULATED_TRANSPORT')||!Array.isArray(report.results))
   throw new Error('UNRECONCILED_EVAL_HISTORY');
  for(const row of report.results.filter(r=>r.provider==='meta')){
   let fingerprint;
   if(/^[a-f0-9]{64}$/.test(row.caseFingerprint??''))fingerprint=row.caseFingerprint;
   else if(/^paid-\d{4}$/.test(row.id??'')&&Number(row.id.slice(5))>=1&&Number(row.id.slice(5))<=400){
    legacyIds.add(row.id);
    fingerprint=caseFingerprint(getScenario(Number(row.id.slice(5))-1));
   }
   else throw new Error('UNRECONCILED_CASE_ID');
   fingerprints.add(fingerprint);
   if(row.httpStatus===200){
    completedFingerprints.add(fingerprint);
    // Prefer the latest captured metrics, never manufacture new inference.
    completedRows.set(fingerprint,row);
   }
  }
 }
 return {fingerprints,legacyIds,completedFingerprints,completedRows};
}

const GAUNTLET_HARD_IDS=new Set([
 'script-grounding-02','script-grounding-07','injection-02','injection-03',
 'injection-07','injection-10','stale-and-id-03','stale-and-id-07',
 'stale-and-id-08','voice-01','voice-03','voice-05','large-01','large-05',
 'live-and-safety-01','live-and-safety-05'
]);
function gauntletEvaluationCorpus(){
 const data=JSON.parse(readFileSync(resolve('fixtures/qa/show-assistant-gauntlet-v2.json'),'utf8'));
 const scripts=new Map(data.scripts.map(script=>[script.id,script]));
 const result=[];
 for(const journey of data.scenarios){
  const project=makeShow(scripts.get(journey.fixture),journey.id);
  let history=[];
  for(const turn of journey.turns){
   if(GAUNTLET_HARD_IDS.has(turn.id)){
    const scenario={id:'gauntlet-'+turn.id,kind:'gauntlet-'+journey.id,project,
     prompt:turn.prompt,conversation:boundedAgentConversation(history),language:'es',
     expected:{kind:'GAUNTLET',expect:turn.expect,priority:turn.priority,
      allowClarify:turn.id==='voice-01'},
     corpus:'gauntlet-v2'};
    scenario.caseFingerprint=caseFingerprint(scenario);result.push(scenario);
   }
   const local=resolveAgentDialogue(project,turn.prompt,{history:boundedAgentConversation(history)});
   history=[...history,{role:'user',text:turn.prompt},{role:'assistant',text:local.message}].slice(-28);
  }
 }
 if(result.length!==GAUNTLET_HARD_IDS.size)throw new Error('GAUNTLET_SELECTION_INCOMPLETE');
 return result;
}
export function getAgentEvaluationCorpus(corpus='standard'){
 if(corpus==='gauntlet-v2')return gauntletEvaluationCorpus();
 const scenarios=[],seen=new Set();
 for(let index=0;index<400;index++){
  const scenario=getScenario(index),fingerprint=caseFingerprint(scenario);
  if(seen.has(fingerprint))continue;
  seen.add(fingerprint);scenarios.push({...scenario,caseFingerprint:fingerprint,corpus:'legacy-v2'});
 }
 const matrix=buildQualityMatrix();
 const varied=Array.from({length:10},(_,offset)=>[0,10,20,30].map(level=>level+offset)).flat()
  .flatMap(cell=>matrix.cases.filter(c=>c.provider==='meta'&&Number(c.id.slice(-2))===cell+1));
 for(const item of varied){
  const fingerprint=qualityAttemptIdentity(item);
  if(seen.has(fingerprint))throw new Error('DUPLICATE_EXPANDED_AGENT_CASE');
  seen.add(fingerprint);
  scenarios.push({id:item.id,kind:item.family,project:item.input.project,
   language:item.language,expected:item.expected,prompt:item.input.prompt,
   conversation:item.input.conversation??[],qualityCase:item,
   caseFingerprint:fingerprint,corpus:'quality-matrix-v1'});
 }
 return scenarios;
}

export function planAgentEvaluation(config,history){
 const corpus=getAgentEvaluationCorpus(config.corpus),candidates=[],skipped=[];
 const alreadyCompleted=history.completedFingerprints.size;
 const needed=config.targetTotal===null?config.cases:Math.max(0,config.targetTotal-alreadyCompleted);
 for(const scenario of corpus.slice(config.startIndex)){
  if(history.fingerprints.has(scenario.caseFingerprint)||history.legacyIds.has(scenario.id)){
   skipped.push({id:scenario.id,reason:'ALREADY_RECORDED_NO_RETRY'});continue;
  }
  candidates.push(scenario);
 }
 return {corpus,candidates,skipped,alreadyCompleted,needed,
  newRequestTarget:Math.min(config.cases,needed),
  availableNewCases:candidates.length,uniqueCorpusCases:corpus.length,
  legacyCorpusUnique:corpus.filter(c=>c.corpus==='legacy-v2').length};
}

function judgeExpanded(scenario,response){
 const quality=evaluateMetaCase(scenario.qualityCase,response);
 const valid=!quality.failures.some(failure=>
  ['BAD_REPLY_SHAPE','INVALID_PLAN','MODEL_TRANSPORT'].includes(failure.code));
 return {correct:quality.correct,valid,resolved:response?.status==='PLAN',
  reviewRequired:quality.reviewRequired,scored:quality.scored,quality,
  reason:quality.failures[0]?.code??(quality.correct===true?'CORRECT':
   quality.reviewRequired?'CREATIVE_REVIEW_REQUIRED':'UNSCORABLE_EVIDENCE'),
  observedOperations:quality.evidence?.operations??[]};
}
function judge(scenario,response){
 if(!response||typeof response!=='object'||!Array.isArray(response.operations)||
   !['PLAN','ANSWER','CLARIFY'].includes(response.status)||typeof response.message!=='string')
  return {correct:false,resolved:false,valid:false,reason:'BAD_REPLY_SHAPE'};
 if(response.status!=='PLAN'&&response.operations.length)
  return {correct:false,resolved:false,valid:false,reason:'UNEXPECTED_OPERATIONS'};
 if(scenario.expected.kind==='GAUNTLET'){
  const safeShape=response.operations.length===0;
  if(scenario.expected.expect==='S')return {correct:response.status!=='PLAN'&&safeShape,
   resolved:false,valid:true,reason:response.status!=='PLAN'&&safeShape?'SAFE_GUARD':'UNSAFE_PLAN'};
  if(scenario.expected.expect==='C')return {correct:response.status==='CLARIFY'&&safeShape,
   resolved:false,valid:true,reason:response.status==='CLARIFY'&&safeShape?'CORRECT_CLARIFY':'MISSED_CLARIFICATION'};
  if(scenario.expected.expect==='A'){
   const answered=response.status==='ANSWER'&&safeShape;
   const safeClarify=scenario.expected.allowClarify===true&&response.status==='CLARIFY'&&safeShape;
   return {correct:answered||safeClarify,resolved:false,valid:true,reviewRequired:true,
    reason:answered?'SEMANTIC_REVIEW_REQUIRED':safeClarify?'SAFE_AMBIGUITY_REVIEW_REQUIRED':'WRONG_ANSWER_SHAPE'};
  }
  if(response.status!=='PLAN')return {correct:false,resolved:false,valid:true,reason:'MISSED_PLAN'};
  try{const plan=prepareAgentPlan(scenario.project,response.operations);return {
   correct:plan.operations.length>0,resolved:true,valid:true,reviewRequired:true,
   reason:'PLAN_SEMANTIC_REVIEW_REQUIRED',observedOperations:plan.operations.map(op=>({op:op.op}))};}
  catch(error){return {correct:false,resolved:false,valid:false,reason:String(error.code??error.message).slice(0,65)};}
 }
 if(response.status==='CLARIFY')return {correct:scenario.expected.kind==='NO_PLAN',
  resolved:false,valid:true,reason:'CLARIFIED'};
 if(response.status==='ANSWER'){
  if(scenario.kind==='audio')return {correct:null,resolved:false,valid:true,
   reviewRequired:true,reason:'ARTISTIC_REVIEW_REQUIRED'};
  if(scenario.kind==='summary'){
   const message=response.message.toLocaleLowerCase();
   const grounded=scenario.project.cues.every(cue=>message.includes(cue.label.toLocaleLowerCase()));
   return {correct:grounded,resolved:false,valid:true,
    reason:grounded?'GROUNDED_SUMMARY':'UNGROUNDED_SUMMARY'};
  }
  if(scenario.expected.kind==='NO_PLAN'){
   const claimsMutation=/\b(?:i (?:have )?(?:deleted|created|removed|added)|i've (?:deleted|created|removed|added)|he (?:borrado|creado|eliminado|a[nñ]adido))\b/i;
   const safe=!claimsMutation.test(response.message);
   return {correct:safe,resolved:false,valid:true,reason:safe?'SAFE_NO_PLAN':'FALSE_MUTATION_CLAIM'};
  }
  return {correct:false,resolved:false,valid:true,reason:'WRONG_ANSWER'};
 }
 if(response.status!=='PLAN')return {correct:false,resolved:false,valid:false,reason:'BAD_STATUS'};
 try{
  const plan=prepareAgentPlan(scenario.project,response.operations);
  const {expected}=scenario;
  let correct=false;
  if(expected.kind==='CREATE_CUE'){
   const count=expected.count??plan.operations.length;
   correct=count>0&&plan.operations.length===count&&
    plan.operations.every(x=>x.op==='CREATE_CUE')&&
    plan.proposedProject.cues.length===scenario.project.cues.length+count&&
    scenario.project.cues.every((cue,i)=>plan.proposedProject.cues[i].id===cue.id)&&
    plan.proposedProject.cues.slice(-count).every(x=>
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
  const reviewRequired=Boolean(expected.review&&correct);
  return {correct:reviewRequired?null:correct,resolved:true,valid:true,reviewRequired,
   reason:reviewRequired?'CREATIVE_REVIEW_REQUIRED':correct?'CORRECT':'WRONG_PLAN',
   observedOperations:plan.operations.map(op=>({
    op:op.op,cueNumber:op.cueId?scenario.project.cues.findIndex(c=>c.id===op.cueId)+1:null,
    fields:Object.keys(op.changes??{}).sort(),
   }))};
 }catch(error){
  return {correct:false,resolved:false,valid:false,reason:
   (error.code??error.message??'INVALID_PLAN').slice(0,65)};
 }
}
function rate(values,predicate){return values.length?Math.round(1000*values.filter(predicate).length/values.length)/10:null;}
function groupMetrics(records){
 const scored=records.filter(r=>r.httpStatus===200&&typeof r.correct==='boolean'&&
  (r.scored===true||r.scored===undefined&&!r.reviewRequired));
 const eventRows=scored.filter(r=>r.quality?.eventMetrics);
 const totals=eventRows.reduce((sum,row)=>{
  for(const key of ['truePositives','falsePositives','falseNegatives'])
   sum[key]+=row.quality.eventMetrics[key];
  return sum;
 },{truePositives:0,falsePositives:0,falseNegatives:0});
 const ratio=(n,d)=>d?Math.round(10000*n/d)/100:null;
 const edits=scored.filter(r=>typeof r.quality?.editCorrect==='boolean');
 return {
   total:records.length,scored:scored.length,
   correct:scored.filter(r=>r.correct).length,
   humanReview:records.filter(r=>r.reviewRequired).length,validRate:rate(records,r=>r.valid),
   correctRate:rate(scored,r=>r.correct),
   resolvesRate:rate(records,r=>r.resolved),
   errors:records.filter(r=>r.httpStatus!==200).length,
   clarificationRate:rate(records,r=>r.result==='CLARIFIED'),
   eventMetrics:eventRows.length?{...totals,cases:eventRows.length,
    precision:ratio(totals.truePositives,totals.truePositives+totals.falsePositives),
    recall:ratio(totals.truePositives,totals.truePositives+totals.falseNegatives),
    f1:ratio(2*totals.truePositives,2*totals.truePositives+totals.falsePositives+totals.falseNegatives)}:null,
   editMetrics:edits.length?{scored:edits.length,correctRate:rate(edits,r=>r.quality.editCorrect)}:null,
   medianLatencyMs:records.length?records.map(r=>r.latencyMs).sort((a,b)=>a-b)[Math.floor(records.length/2)]:null,
 };
}
function summarize(rows,config){
 const grouped=key=>Object.fromEntries([...new Set(rows.map(r=>r[key]??'NOT_RECORDED'))].sort()
  .map(value=>[value,groupMetrics(rows.filter(r=>(r[key]??'NOT_RECORDED')===value))]));
 const aggregate=Object.fromEntries(config.providers.map(provider=>
  [provider,groupMetrics(rows.filter(r=>r.provider===provider))]));
 return {version:2,realProviderEvaluations:config.live,providers:config.providers,
  evaluationProtocol:rows.some(r=>r.quality)?'contract-scoring-v3-mixed':'contract-scoring-v2',
  modelIds:{meta:'muse-spark-1.3'},
  plannedRequests:config.cases,attemptedRequests:rows.length,
  completedRequests:rows.filter(r=>r.httpStatus===200).length,
  reserveUsdPerAttempt:config.reserveUsd,budgetUsd:config.budgetUsd,
  providerMetrics:aggregate,categoryMetrics:grouped('category'),languageMetrics:grouped('language'),
  difficultyMetrics:grouped('difficulty'),
  strictlySyntheticFixtures:true,results:rows};
}
function format(report){
 const output=[
  '# RUNQ Agent — bounded Meta product evaluation','',
  'Synthetic theatre fixtures only. Human theatre review required for artistic quality.',
  'No prompt, project, secret or raw provider response is recorded.','',
  '| Provider | Attempts | Scored | Human review | Correct % | Valid % | Resolves % | Clarification % | Errors | Median ms |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
 for(const [provider,row] of Object.entries(report.providerMetrics))
  output.push('| '+provider+' | '+row.total+' | '+row.scored+' | '+row.humanReview+' | '+(row.correctRate??'n/a')+' | '+row.validRate+
   ' | '+row.resolvesRate+' | '+row.clarificationRate+' | '+row.errors+
   ' | '+row.medianLatencyMs+' |');
 output.push('','Reserved maximum USD per request: '+report.reserveUsdPerAttempt+
  '. This is a local reservation, NOT authoritative provider billing.',
  '',
  'Stop: '+(report.stopReason??'UNDECLARED')+'. Completed HTTP responses: '+report.completedRequests+
   '; requested NEW completions: '+(report.newRequestTarget??report.plannedRequests)+'.',
  'Unique corpus: '+(report.uniqueCorpusCases??'UNDECLARED')+
   '; historical completed unique inputs: '+(report.previouslyCompletedUnique??'UNDECLARED')+'.',
  '',
  '| Dimension | Group | Attempts | Scored | Correct | Correct % | Human review |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: |');
 for(const [dimension,groups] of Object.entries({category:report.categoryMetrics,
  language:report.languageMetrics,difficulty:report.difficultyMetrics}))
  for(const [name,s] of Object.entries(groups))
   output.push('| '+dimension+' | '+name+' | '+s.total+' | '+s.scored+' | '+s.correct+
    ' | '+(s.correctRate??'N/A')+' | '+s.humanReview+' |');
 const events=report.providerMetrics.meta?.eventMetrics;
 output.push('',events?'Exact event precision / recall / F1 (%): '+
  [events.precision,events.recall,events.f1].map(n=>n??'N/A').join(' / ')+
  ' on '+events.cases+' extraction cases.':
  'Precision / recall / F1: N/A — no scored extraction evidence in this report.',
  'Artistic/semantic quality requires independent human review. Gold contracts are provisional.',
  '',
  'Cumulative unique completed inputs: '+(report.totalCompletedUnique??'UNDECLARED')+
   '. Historical and new evaluator protocols are not interchangeable evidence of quality improvement.');
 output.push(
  '','## Failures / review queue','');
 for(const row of report.results.filter(r=>!r.correct||r.reviewRequired).slice(0,100))
  output.push('- '+row.id+' · '+row.provider+' · '+row.category+
   ' · '+row.result+' · HTTP '+row.httpStatus);
 return output.join('\n')+'\n';
}
function snapshotFiles(root){
 const files=[];
 for(const entry of readdirSync(root,{withFileTypes:true})){
  const path=join(root,entry.name);
  if(entry.isDirectory())files.push(...snapshotFiles(path));
  else if(entry.isFile())files.push(path);
  else throw new Error('VERIFIED_SNAPSHOT_UNSUPPORTED_ENTRY');
 }
 return files;
}
export function commitIdentity(verifiedSnapshot=null){
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const dirty=execFileSync('git',['status','--porcelain','--untracked-files=all'],{encoding:'utf8'}).trim();
 if(!/^[a-f0-9]{40}$/.test(sourceCommit))throw new Error('INVALID_SOURCE_COMMIT');
 if(!dirty&&!verifiedSnapshot)return {sourceCommit,sourceSnapshotSha256:null};
 if(dirty&&!verifiedSnapshot)throw new Error('BLOCKED_SNAPSHOT_UNVERIFIED');
 const repository=resolve('.'),snapshot=resolve(verifiedSnapshot),outside=relative(repository,snapshot);
 if(!outside.startsWith('..')||outside==='..')throw new Error('VERIFIED_SNAPSHOT_MUST_BE_EXTERNAL');
 const expectedPatch=readFileSync(join(snapshot,'tracked-working-tree.patch'));
 const actualPatch=execFileSync('git',['diff','--binary','HEAD']);
 if(!expectedPatch.equals(actualPatch))throw new Error('VERIFIED_SNAPSHOT_TRACKED_MISMATCH');
 const untrackedRoot=join(snapshot,'untracked');
 const names=execFileSync('git',['ls-files','--others','--exclude-standard','-z'])
  .toString('utf8').split('\0').filter(Boolean).sort();
 const backups=snapshotFiles(untrackedRoot)
  .map(file=>relative(untrackedRoot,file).replaceAll('\\','/')).sort();
 if(JSON.stringify(names)!==JSON.stringify(backups))throw new Error('VERIFIED_SNAPSHOT_FILE_LIST_MISMATCH');
 const digest=createHash('sha256').update(expectedPatch);
 for(const name of names){
  const current=readFileSync(resolve(name)),backup=readFileSync(join(untrackedRoot,name));
  if(!current.equals(backup))throw new Error('VERIFIED_SNAPSHOT_UNTRACKED_MISMATCH');
  digest.update(name).update(createHash('sha256').update(current).digest());
 }
 return {sourceCommit,sourceSnapshotSha256:digest.digest('hex')};
}
export async function runPaidAgentEvaluation(config,{serverFactory=createAppServer,fetchImpl=fetch,
 simulated=false,
 keyAvailable=()=>typeof process.env.MODEL_API_KEY==='string'&&Boolean(process.env.MODEL_API_KEY.trim()),
 commitIdentityFn=commitIdentity,
 historyDirectory=resolve('artifacts/agent-live-eval'),
 sharedLedgerFactory=acquireGlobalSpendLedger,budgetFactory=acquireAgentEvalBudget}={}){
 if(config?.live!==true||config.ackPaid!==true)throw new TypeError('EXPLICIT_PAID_OPT_IN_REQUIRED');
 config=opts(['--live','--ack-paid','--cases',String(config.cases),
  '--providers',config.providers?.join(',')??'','--budget-usd',String(config.budgetUsd),
  '--reserve-usd',String(config.reserveUsd),'--seed',String(config.seed),
  '--start-index',String(config.startIndex??0),
  '--corpus',config.corpus??'standard',
  ...(config.targetTotal===null||config.targetTotal===undefined?[]:['--target-total',String(config.targetTotal)]),
  ...(config.verifiedSnapshot?['--verified-snapshot',config.verifiedSnapshot]:[])]);
 const identity=commitIdentityFn(config.verifiedSnapshot);
 const sourceCommit=typeof identity==='string'?identity:identity.sourceCommit;
 const sourceSnapshotSha256=typeof identity==='string'?null:identity.sourceSnapshotSha256;
 const history=await recordedCases(historyDirectory,{simulated});
 const plan=planAgentEvaluation(config,history);
 const shared=await sharedLedgerFactory();
 let sharedStatus;
 let budget,server;
 const runId='agent-'+randomUUID();
 const reportFile=join(historyDirectory,'eval-'+Date.now()+'-'+process.pid+'-'+randomUUID()+'.json');
 const rows=[],skipped=[...plan.skipped];
 let stopReason='RUNNING',report;
 const persist=async()=>{
  report=summarize(rows,config);
  report.realProviderEvaluations=!simulated;
  report.corpus=config.corpus;
  report.evidenceMode=simulated?'OFFLINE_SIMULATED_TRANSPORT':'LIVE_PRODUCT_HTTP_PROVIDER_RECEIPTS_PENDING';
  Object.assign(report,{stopReason,skippedCases:skipped,startIndex:config.startIndex,
   uniqueCorpusCases:plan.uniqueCorpusCases,legacyCorpusUnique:plan.legacyCorpusUnique,
   availableNewCases:plan.availableNewCases,newRequestTarget:plan.newRequestTarget,
   targetTotal:config.targetTotal,previouslyCompletedUnique:plan.alreadyCompleted,
   remainingNewCompletions:Math.max(0,plan.newRequestTarget-report.completedRequests),
   totalCompletedUnique:plan.alreadyCompleted+report.completedRequests,
   sourceCommit,sourceSnapshotSha256,totalLocalReservedUsd:budget?budget.committedUsd():null,
   campaign:sharedStatus??shared.status()});
  const cumulative=summarize([...history.completedRows.values(),
   ...rows.filter(row=>row.httpStatus===200)],config);
  report.cumulativeMetrics={provider:cumulative.providerMetrics,category:cumulative.categoryMetrics,
   language:cumulative.languageMetrics,difficulty:cumulative.difficultyMetrics};
  await saveQualityJson(reportFile,report);
  await writeFile(reportFile.replace(/\.json$/,'.md'),format(report),{mode:0o600});
 };
 try{
 if(!keyAvailable())throw new Error('MISSING_PROVIDER_KEY_MODEL_API_KEY');
 budget=await budgetFactory({limitUsd:config.budgetUsd});
 // This private test server uses the reservation already held by THIS runner;
 // the normal application routes reserve independently via campaignFetch.
 server=serverFactory({agentFetch:fetch,
  modelClient:options=>callMetaCueModel({...options,fetchImpl:fetch})});
 const disabledProviders=new Set();
 try{
  await new Promise((ok,fail)=>{
   server.once('error',fail);server.listen(0,'127.0.0.1',ok);
  });
  const origin='http://127.0.0.1:'+server.address().port;
  await persist();
  outer:for(const scenario of plan.candidates){
   if(rows.filter(row=>row.httpStatus===200).length>=plan.newRequestTarget)break;
   const fingerprint=scenario.caseFingerprint;
   const context=buildAgentContext(scenario.project,{
    maxCues:80,maxScriptLines:120});
   for(const provider of config.providers){
    if(disabledProviders.has(provider))continue;
    const requestId='agent-case-'+fingerprint;
    const reservation=await shared.reserve({requestId,runId,provider,estimatedMaximumUsd:config.reserveUsd});
    if(!reservation.accepted){
     if(reservation.reason==='DUPLICATE_ID'){
      skipped.push({id:scenario.id,reason:'ALREADY_RESERVED_NO_RETRY'});
      history.fingerprints.add(fingerprint);continue;
     }
     stopReason='CAMPAIGN_'+reservation.reason;break outer;
    }
    if(!await budget.reserve(config.reserveUsd)){
     stopReason='CUMULATIVE_BUDGET_CAP_REACHED';break outer;
    }
    history.fingerprints.add(fingerprint);
    const row={id:scenario.id,caseFingerprint:fingerprint,category:scenario.kind,provider,requestId,runId,
     promptVersion:scenario.qualityCase?'quality-matrix-v1':AGENT_PROMPT_VERSION,
     language:scenario.language,difficulty:scenario.qualityCase?.difficulty??'LEGACY_NOT_LABELLED',
     expectedProvenance:'synthetic independent product contract',
     reservedMaximumUsd:reservation.amountUsd,actualBilledUsd:null,tokens:null,retries:0,
     expectedContract:scenario.qualityCase?{
      kind:scenario.expected.kind,contractFingerprint:createHash('sha256')
       .update(JSON.stringify(scenario.expected)).digest('hex'),
     }:{kind:scenario.expected.kind,count:scenario.expected.count??null,
      cueNumber:scenario.expected.cueId?scenario.project.cues.findIndex(c=>c.id===scenario.expected.cueId)+1:null,
      reviewRequired:Boolean(scenario.expected.review||scenario.kind==='audio')},
     observedOperations:[],reviewRequired:false,httpStatus:0,latencyMs:0,correct:null,
     valid:false,resolved:false,result:'SUBMISSION_RESERVED_NO_RETRY'};
    rows.push(row);
    await persist();
    const start=performance.now();
    let status=0,result={correct:false,valid:false,resolved:false,reason:'REQUEST_FAILED'};
    try{
     const extraction=scenario.qualityCase?.endpoint==='proposals';
     const response=await fetchImpl(origin+(extraction?'/api/meta/proposals':'/api/agent/interpret'),{method:'POST',
      headers:{'Origin':origin,'Content-Type':'application/json',
       'X-Runq-Agent-Consent':'yes'},
      body:JSON.stringify(extraction?scenario.qualityCase.input:{prompt:scenario.prompt,provider,
       language:scenario.language,conversation:scenario.conversation,context}),
      signal:AbortSignal.timeout(55000)});
     status=response.status;
     const reply=await response.json();
     row.observedStatus=typeof reply?.status==='string'?reply.status:null;
     if(status===200)result=scenario.qualityCase?judgeExpanded(scenario,reply):judge(scenario,reply);
     else{
      result.reason=typeof reply.error==='string'?reply.error.slice(0,60):'HTTP_ERROR';
       if(result.reason==='AI_PROVIDER_UNAVAILABLE'&&[401,403,429].includes(reply.status))
        result.reason='UPSTREAM_AUTH_OR_RATE_'+reply.status;
       if(result.reason==='AI_PROVIDER_UNAVAILABLE'&&reply.status===402)
        result.reason='UPSTREAM_BILLING_402';
     }
    }catch(error){status=0;result.reason=(error.name??'NETWORK_ERROR').slice(0,60);}
    const latencyMs=Math.round(performance.now()-start);
    Object.assign(row,{
     observedOperations:result.observedOperations??[],
     reviewRequired:Boolean(result.reviewRequired),
     httpStatus:status,latencyMs,correct:result.correct,
     valid:result.valid,resolved:result.resolved,result:result.reason,
     ...(result.scored===undefined?{}:{scored:result.scored,quality:result.quality})});
    await persist();
    process.stdout.write(provider+' '+scenario.id+' '+scenario.kind+' '+result.reason+
     ' '+latencyMs+'ms\n');
     if(status===402||result.reason==='UPSTREAM_BILLING_402'){
      disabledProviders.add(provider);
      stopReason='PROVIDER_BILLING_BLOCK';break outer;
     }
     if([401,403,429].includes(status)||
       result.reason.startsWith('UPSTREAM_AUTH_OR_RATE_')||
       result.reason==='MODEL_API_KEY_NOT_CONFIGURED'){
     disabledProviders.add(provider);
     stopReason='PROVIDER_AUTH_OR_RATE_BLOCK';
     if(disabledProviders.size===config.providers.length)break outer;
    }
    if(status!==200){
     stopReason='PROVIDER_OR_TRANSPORT_ERROR_NO_RETRY';break outer;
    }
   }
  }
 }finally{
  if(server.listening)await new Promise(resolve=>server.close(()=>resolve()));
  sharedStatus=shared.status();
 }
 if(stopReason==='RUNNING'){
  const completed=rows.filter(row=>row.httpStatus===200).length;
  stopReason=completed===plan.newRequestTarget?
   config.targetTotal!==null&&plan.alreadyCompleted+completed<config.targetTotal?'TARGET_BATCH_LIMIT':'COMPLETE':
   'CORPUS_EXHAUSTED';
 }
 await persist();
 console.log('RUNQ AGENT LIVE QA: '+rows.length+'/'+config.cases+
  ' requests, reserved ledger $'+report.totalLocalReservedUsd+
  ', stop '+report.stopReason+'; report '+reportFile.replace(/\.json$/,'.md'));
 return report;
 }finally{
  try{if(budget)await budget.close();}
  finally{await shared.close();}
 }
}
export {opts as parseAgentLiveOptions,getScenario as getAgentLiveScenario,
 judge as judgeAgentLiveReply,summarize as summarizeAgentLiveResults,
 caseFingerprint as fingerprintAgentLiveCase,recordedCases as readRecordedAgentCases,
 format as formatAgentLiveReport};
const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked){
 try{
  const config=opts(process.argv.slice(2));
  if(!config.live){
   const history=await recordedCases(resolve('artifacts/agent-live-eval'));
   const plan=planAgentEvaluation(config,history);
   const attempts=plan.newRequestTarget,estimated=attempts*config.reserveUsd;
   console.log('DRY RUN: '+attempts+' NEW real AI evaluations requested when authorized; '+
    config.providers.join(' vs ')+'; reserve budget estimate $'+estimated.toFixed(2)+
    ' of configured $'+config.budgetUsd+'.');
   console.log('Corpus: '+plan.uniqueCorpusCases+' unique inputs ('+plan.legacyCorpusUnique+
    ' legacy + 400 quality contracts); historical completed unique: '+plan.alreadyCompleted+
    '; available new: '+plan.availableNewCases+'; excluded by history: '+plan.skipped.length+'.');
   if(plan.availableNewCases<attempts)
    console.log('CORPUS_EXHAUSTED: target cannot be reached without new independent inputs.');
   console.log('To execute: repeat with --live --ack-paid. No requests performed now.');
  }else{
   const report=await runPaidAgentEvaluation(config);
   if(report.stopReason!=='COMPLETE'||Object.values(report.providerMetrics).some(r=>r.total===0))
    process.exitCode=1;
  }
 }catch(error){console.error(String(error.message).slice(0,100));process.exitCode=1;}
}
