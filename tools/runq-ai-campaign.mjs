#!/usr/bin/env node
/**
 * RUNQ AI Acceptance Campaign coordinator (2026-10-30).
 * Offline by default. The ONLY paid stage is the existing, individually
 * opt-in agent evaluator; no retries, model-controlled GO or sound output.
 * No script, raw model output, credentials, WAVs or private prompt is stored.
 */
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {runAiPreflight} from './runq-ai-preflight.mjs';
import {parseAgentLiveOptions,getAgentLiveScenario,
 runPaidAgentEvaluation} from './runq-agent-live-eval.mjs';

const CATEGORIES=['closing','followup','delete','reorder','rename',
 'summary','negative','missing','voice','audio'];
const PROVIDERS=['meta','baseten'];
const VALID_STOPS=new Set(['COMPLETE','CUMULATIVE_BUDGET_CAP_REACHED',
 'CASE_ALREADY_RESERVED','UNKNOWN_REMOTE_OUTCOME','PROVIDER_AUTH_OR_RATE_BLOCK']);
const IDENTIFIER=/^[a-zA-Z0-9._:-]{1,100}$/;

function fail(message){throw new TypeError(message);}
export function parseAiCampaignOptions(argv=[]){
 const options={live:false,ackPaid:false,reportOnly:false,cases:40,
  providers:['meta','baseten'],startIndex:0,seed:20261031,
  budgetUsd:30,reserveUsd:0.15};
 const used=new Set();
 for(let i=0;i<argv.length;i++){
  const name=argv[i];
  if(used.has(name))fail('DUPLICATE_CAMPAIGN_OPTION');
  used.add(name);
  if(name==='--live'||name==='--ack-paid'||name==='--report-only'){
   options[name.slice(2).replace(/-([a-z])/g,(_,char)=>char.toUpperCase())]=true;
   continue;
  }
  if(!['--cases','--providers','--start-index','--seed','--budget-usd','--reserve-usd'].includes(name))
   fail('INVALID_CAMPAIGN_FLAG');
  const value=argv[++i];
  if(!value||value.startsWith('--'))fail('INVALID_CAMPAIGN_VALUE');
  const key={'--cases':'cases','--providers':'providers','--start-index':'startIndex',
   '--seed':'seed','--budget-usd':'budgetUsd','--reserve-usd':'reserveUsd'}[name];
  options[key]=key==='providers'?value.split(','):Number(value);
 }
 if(options.live!==options.ackPaid||(options.reportOnly&&(options.live||options.ackPaid)))
  fail('PAID_AUTHORIZATION_MISMATCH');
 // The existing paid runner remains the sole source of numeric spend bounds.
 const paidArgs=['--cases',String(options.cases),'--providers',options.providers.join(','),
  '--start-index',String(options.startIndex),'--seed',String(options.seed),
  '--budget-usd',String(options.budgetUsd),'--reserve-usd',String(options.reserveUsd),
  ...(options.live?['--live','--ack-paid']:[])];
 const checked=parseAgentLiveOptions(paidArgs);
 if(options.live){
  const minimum=20*options.providers.length;
  if(options.cases<minimum||options.cases%(20*options.providers.length)!==0)
   fail('PAID_MATRIX_REQUIRES_COMPLETE_BILINGUAL_CYCLES');
  if(process.env.CI==='true')fail('PAID_TESTS_DISABLED_IN_CI');
 }
 return {...checked,reportOnly:options.reportOnly};
}

export function buildAiManifest(options){
 const count=options.cases/options.providers.length;
 const cases=Array.from({length:count},(_,i)=>{
  const c=getAgentLiveScenario(options.startIndex+i,options.seed);
  return {id:c.id,category:c.kind,language:c.language,
   historyTurns:c.conversation.length,index:c.seedIndex};
 });
 const coverage=Object.fromEntries(CATEGORIES.map(category=>[category,
  Object.fromEntries(['es','en'].map(language=>[language,
   cases.filter(c=>c.category===category&&c.language===language).length]))]));
 const manifest={schema:1,seed:options.seed,startIndex:options.startIndex,
  providers:[...options.providers],requests:options.cases,
  cases,coverage};
 const hash=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
 return {manifest,hash,completeMatrix:Object.values(coverage).every(x=>x.es>0&&x.en>0)};
}
const pct=(num,den)=>den?Math.round(num/den*1000)/10:null;
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.ceil(p*values.length)-1]:null;
const saneRow=r=>r&&typeof r==='object'&&IDENTIFIER.test(r.id)&&
 IDENTIFIER.test(r.category)&&['es','en'].includes(r.language)&&
 PROVIDERS.includes(r.provider)&&Number.isInteger(r.httpStatus)&&r.httpStatus>=0&&
 r.httpStatus<=599&&Number.isFinite(r.latencyMs)&&r.latencyMs>=0&&
 typeof r.result==='string'&&r.result.length<=100&&
 (r.correct===true||r.correct===false||r.correct===null)&&
 typeof r.valid==='boolean'&&typeof r.resolved==='boolean';

export async function readAiPaidReports(directory=resolve('artifacts/agent-live-eval')){
 let files=[];
 try{files=(await readdir(directory)).filter(x=>/^eval-[0-9]+-[0-9]+\.json$/.test(x));}
 catch(error){if(error.code!=='ENOENT')throw error;}
 const reports=[],warnings=[];
 for(const file of files.sort()){
  try{
   const path=join(directory,file),raw=await readFile(path,'utf8');
   if(raw.length>4_000_000)throw new Error('OVERSIZED');
   const r=JSON.parse(raw);
   if(r.version!==2||r.realProviderEvaluations!==true||
      r.strictlySyntheticFixtures!==true||!Array.isArray(r.results)||
      !Number.isSafeInteger(r.seed)||!Number.isSafeInteger(r.startIndex)||
      !VALID_STOPS.has(r.stopReason))throw new Error('UNVERIFIED_REPORT_SCHEMA');
   if(r.results.length>400||r.results.some(x=>!saneRow(x)))
    throw new Error('BAD_RESULT_ROWS');
   reports.push({filename:file,report:r});
  }catch{warnings.push({filename:file,reason:'UNREADABLE_OR_UNVERIFIED_REPORT'});}
 }
 return {reports,warnings};
}

function metricGroup(rows){
 const completed=rows.filter(x=>x.httpStatus===200);
 const scored=completed.filter(x=>typeof x.correct==='boolean');
 const positive=scored.filter(x=>x.correct===true);
 return {attempts:rows.length,successfulHttp:completed.length,scored:scored.length,
  correct:positive.length,correctRate:pct(positive.length,scored.length),
  contractValid:completed.filter(x=>x.valid).length,
  contractValidRate:pct(completed.filter(x=>x.valid).length,completed.length),
  reviewRequired:completed.filter(x=>x.reviewRequired===true||x.correct===null).length,
  p50Ms:percentile(rows.map(x=>x.latencyMs),0.5),
  p95Ms:percentile(rows.map(x=>x.latencyMs),0.95)};
}
export function analyzeAiPaidReports(input,{preflightPassed=null,
 providers=PROVIDERS,seed=20261031}={}){
 if(!input||!Array.isArray(input.reports)||!Array.isArray(input.warnings))
  fail('INVALID_CAMPAIGN_REPORTS');
 const warnings=[...input.warnings];
 const rows=[],seen=new Set(),duplicates=[];
 const stopped=[];
 for(const item of input.reports){
  const report=item.report;
  if(report.seed!==seed)continue; // Different experiment is never silently pooled.
  if(report.stopReason!=='COMPLETE')stopped.push({file:item.filename,
   reason:report.stopReason});
  for(const row of report.results){
   if(!saneRow(row)){warnings.push({filename:item.filename,reason:'BAD_ROW'});continue;}
   const key=[seed,row.id,row.provider,row.category,row.language].join('|');
   if(seen.has(key)){duplicates.push({id:row.id,provider:row.provider});continue;}
   seen.add(key);rows.push({...row});
  }
 }
 const byProvider=Object.fromEntries(providers.map(provider=>{
  const scoped=rows.filter(x=>x.provider===provider);
  return [provider,{...metricGroup(scoped),byLanguage:Object.fromEntries(['es','en'].map(lang=>
   [lang,metricGroup(scoped.filter(x=>x.language===lang))])),
   byCategory:Object.fromEntries(CATEGORIES.map(cat=>
    [cat,metricGroup(scoped.filter(x=>x.category===cat))]))}];
 }));
 const groups=new Map();
 for(const row of rows){
  const key=[row.id,row.category,row.language].join('|');
  if(!groups.has(key))groups.set(key,{caseId:row.id,category:row.category,
   language:row.language,results:{}});
  groups.get(key).results[row.provider]=row;
 }
 const paired=[...groups.values()].filter(group=>
  providers.length===2&&providers.every(p=>group.results[p]));
 const disagreements=paired.filter(pair=>{
  const a=pair.results[providers[0]],b=pair.results[providers[1]];
  return a.correct!==b.correct||a.valid!==b.valid||a.httpStatus!==b.httpStatus;
 }).map(x=>({caseId:x.caseId,category:x.category,language:x.language,
  providers:Object.fromEntries(providers.map(p=>[p,{
   correct:x.results[p].correct,valid:x.results[p].valid,
   httpStatus:x.results[p].httpStatus,reason:x.results[p].result}]))}));
 const failures=rows.filter(x=>x.correct!==true||x.valid!==true||
   x.httpStatus!==200).map(x=>({caseId:x.id,provider:x.provider,
   category:x.category,language:x.language,reason:x.result,
   httpStatus:x.httpStatus,reviewRequired:!!x.reviewRequired}))
  .sort((a,b)=>
   Number(b.httpStatus===0)-Number(a.httpStatus===0)||
   Number(a.reviewRequired)-Number(b.reviewRequired)||
   a.category.localeCompare(b.category));
 const blocking=duplicates.length>0||stopped.some(x=>x.reason==='UNKNOWN_REMOTE_OUTCOME')||
  preflightPassed===false;
 const enough=providers.every(p=>{
  const m=byProvider[p];
  return m.scored>=60&&m.byLanguage.es.scored>=25&&m.byLanguage.en.scored>=25&&
   CATEGORIES.every(category=>m.byCategory[category].attempts>=4);
 });
 const qualityPass=enough&&providers.every(p=>
  byProvider[p].correctRate>=95&&byProvider[p].contractValidRate>=99);
 let status='NEEDS_EVIDENCE';
 if(blocking)status='BLOCKED';
 else if(enough)status=qualityPass?'AUTOMATED_GATES_PASS':'QUALITY_GATES_FAIL';
 const action=[];
 if(preflightPassed===false)action.push('P0: reparar la batería offline antes de gastar.');
 if(duplicates.length)action.push('P0: investigar informes de solicitudes duplicadas; no repetir estos IDs.');
 for(const s of stopped)
  if(s.reason==='UNKNOWN_REMOTE_OUTCOME')
   action.push('P0: comprobar proveedor/factura antes de otros envíos; resultado remoto incierto.');
 const problem=failures.filter(x=>x.httpStatus!==200);
 if(problem.length)action.push('Separar errores de red/autorización ('+
  problem.length+') de problemas de calidad del modelo.');
 for(const p of providers){
  const rows=Object.entries(byProvider[p].byCategory)
   .filter(([,m])=>m.scored>=2&&m.correctRate!==null&&m.correctRate<95)
   .sort((a,b)=>a[1].correctRate-b[1].correctRate);
  if(rows.length)action.push(p+': corregir primero '+rows[0][0]+
   ' ('+rows[0][1].correctRate+'% de acierto en casos evaluados).');
 }
 if(!enough)action.push('Ampliar corpus equilibrado ES/EN por familia, sin reutilizar casos.');
 if(rows.some(x=>x.reviewRequired))action.push(
  'Evaluación humana pendiente de consejos creativos; no contarlos como PASS.');
 action.push('Comparar costes reales en las consolas de Meta, Baseten y Modal.');
 action.push('Registrar voz real, Autopiloto armado y escucha SFX antes de certificar el flujo completo.');
 return {schema:1,status,seed,preflightPassed,
  attempted:rows.length,duplicates,warnings,stopped,byProvider,
  matchedPairs:paired.length,disagreements,failures,
  manualAcceptanceRequired:true,automaticQualitySufficient:qualityPass&&!blocking,
  nextActions:[...new Set(action)]};
}

export function formatAiCampaignReport(report,{manifestHash=null}={}){
 const lines=['# RUNQ — Diagnóstico integral de las IA','',
  '**Estado automatizado:** '+report.status,'',
  'La evaluación no certifica por sí sola ensayo real, calidad creativa ni sonido audible.',
  'Las peticiones se limitan al agente; Meta teatral, voz y Modal SFX requieren su propia aceptación.',
  '','## Resumen','',
  '- Preflight offline: '+(report.preflightPassed===null?'NO EJECUTADO':
   report.preflightPassed?'PASS':'FAIL'),
  '- Solicitudes registradas: '+report.attempted,
  '- Pares comparables: '+report.matchedPairs,
  '- Duplicados detectados: '+report.duplicates.length,
  '- Campañas detenidas: '+report.stopped.length,
  '- Revisión humana sigue siendo necesaria: SÍ'];
 if(manifestHash)lines.push('- SHA256 manifiesto previsto: '+manifestHash);
 lines.push('','## Calidad por proveedor','',
  '| Proveedor | Intentos | HTTP 200 | Evaluados | Exactitud | Contrato válido | Revisión humana | p50/p95 ms |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
 for(const [name,metric] of Object.entries(report.byProvider))
  lines.push('| '+name+' | '+metric.attempts+' | '+metric.successfulHttp+
   ' | '+metric.scored+' | '+(metric.correctRate??'n/a')+
   '% | '+(metric.contractValidRate??'n/a')+'% | '+metric.reviewRequired+
   ' | '+(metric.p50Ms??'n/a')+'/'+(metric.p95Ms??'n/a')+' |');
 lines.push('','## Idiomas','');
 for(const [name,metric] of Object.entries(report.byProvider))
  for(const [lang,sub] of Object.entries(metric.byLanguage))
   lines.push('- '+name+'/'+lang+': '+sub.scored+'/'+sub.attempts+
    ' evaluados; exactitud '+(sub.correctRate??'n/a')+'%.');
 lines.push('','## Fallos y revisión (máximo 40)','');
 for(const x of report.failures.slice(0,40))
  lines.push('- '+x.caseId+' | '+x.provider+' | '+x.language+' | '+x.category+
   ' | HTTP '+x.httpStatus+' | '+x.reason+
   (x.reviewRequired?' [REQUIERE REVISIÓN HUMANA]':''));
 if(!report.failures.length)lines.push('- No hay fallos registrados; esto no prueba ausencia de fallos no ensayados.');
 lines.push('','## Desacuerdos A/B (máximo 20)','');
 for(const x of report.disagreements.slice(0,20))
  lines.push('- '+x.caseId+' '+x.language+' '+x.category+': '+
   Object.entries(x.providers).map(([p,v])=>p+'='+v.reason).join(' / '));
 if(!report.disagreements.length)lines.push('- Sin discrepancias emparejadas registradas.');
 lines.push('','## Acciones prioritarias','');
 for(const x of report.nextActions)lines.push('- '+x);
 lines.push('','## Puertas de aceptación por sistema','',
  '| Sistema | Estado | Evidencia exigida |',
  '| --- | --- | --- |',
  '| Agente principal | '+report.status+' | API real, semántica, seguridad, Studio E2E y revisión humana |',
  '| Análisis de guion Meta/Baseten | NEEDS_EVIDENCE | Gold teatral con tipos y L# |',
  '| Edición conversacional aplicada | NEEDS_HUMAN | UI, diff, aceptar/rechazar, undo y ZIP |',
  '| Reconocimiento de voz | NEEDS_HUMAN | WER/CER, micrófonos ES/EN, latencias |',
  '| Autopiloto de Ensayo | NEEDS_HUMAN | Saltos, repeticiones, 0 falsos GO y STOP ALL |',
  '| Sound Lab Modal | NEEDS_HUMAN | WAV real, escucha, importación, factura y ZIP |',
  '','**Costes:** las reservas locales NO representan facturación real.');
 return lines.join('\n')+'\n';
}

export async function runAiCampaign(config,{preflight=runAiPreflight,
 paidRunner=runPaidAgentEvaluation,reportsReader=readAiPaidReports,
 outputDir=resolve('artifacts/ai-campaign')}={}){
 if(config.live&&!config.ackPaid)fail('EXPLICIT_PAID_OPT_IN_REQUIRED');
 if(config.live&&config.reportOnly)fail('INVALID_LIVE_REPORT_ONLY');
 const manifest=buildAiManifest(config);
 if(config.live&&!manifest.completeMatrix)fail('INCOMPLETE_PAID_LANGUAGE_MATRIX');
 let preflightPassed=null,paidResult=null,stage='DRY_RUN';
 if(!config.reportOnly){
  const report=await preflight();
  preflightPassed=report.passed===true;
  if(!preflightPassed)stage='OFFLINE_GATE_FAILED';
  else if(config.live){
   // The only path that may reach a provider: explicit CLI opt-in and green offline gate.
   // The paid runner owns the durable ledger and refuses duplicated billing identities.
   paidResult=await paidRunner(config);
   stage=paidResult.stopReason==='COMPLETE'?'PAID_BATCH_COMPLETE':'PAID_BATCH_STOPPED';
  }else stage='READY_FOR_OPERATOR_REVIEW';
 }
 const evidence=await reportsReader();
 const result=analyzeAiPaidReports(evidence,{preflightPassed,
  providers:config.providers,seed:config.seed});
 const summary={...result,stage,paidExecutionAuthorized:config.live,
  manifestHash:manifest.hash,manifest:manifest.manifest,
  executedPaidBatch:paidResult?{
   requested:config.cases,attempted:paidResult.attemptedRequests,
   stopReason:paidResult.stopReason,localReservedUsd:paidResult.totalLocalReservedUsd}:null};
 const dir=join(outputDir,'run-'+new Date().toISOString().replace(/[:.]/g,'-')+
  '-'+process.pid);
 await mkdir(dir,{recursive:true});
 await writeFile(join(dir,'summary.json'),JSON.stringify(summary,null,2)+'\n');
 await writeFile(join(dir,'summary.md'),formatAiCampaignReport(summary,
  {manifestHash:manifest.hash}));
 const csv=['caseId,provider,language,category,httpStatus,reason,reviewRequired',
  ...summary.failures.map(x=>[x.caseId,x.provider,x.language,x.category,
   x.httpStatus,x.reason.replace(/,/g,'_'),x.reviewRequired].join(','))];
 await writeFile(join(dir,'review-queue.csv'),csv.join('\n')+'\n');
 process.stdout.write('RUNQ AI CAMPAIGN: '+stage+' / '+summary.status+
  '; agent records '+summary.attempted+'; comparable pairs '+summary.matchedPairs+
  '; paid requests by this orchestration '+(paidResult?.attemptedRequests??0)+
  '; report '+dir+'/summary.md\n');
 return {summary,directory:dir};
}
const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked){
 try{
  const config=parseAiCampaignOptions(process.argv.slice(2));
  const head=spawnSync('git',['rev-parse','--short','HEAD'],{
   encoding:'utf8',timeout:4000});
  console.log('RUNQ AI QA · source commit '+(head.status===0?head.stdout.trim():'unknown'));
  console.log('Plan '+config.cases+' agent requests, '+config.providers.join(' vs ')+
   ' · mode '+(config.reportOnly?'REPORT ONLY':config.live?'PAID':'OFFLINE'));
  const result=await runAiCampaign(config);
  if(result.summary.stage==='OFFLINE_GATE_FAILED'||
     result.summary.stage==='PAID_BATCH_STOPPED'||
     result.summary.status==='BLOCKED')
   process.exitCode=1;
 }catch(error){
  // Never echo prompt, key, raw response or an accidental provider error body.
  console.error('RUNQ AI campaign blocked: '+
   (error instanceof TypeError?error.message:'SAFE_ERROR; CHECK LOCAL LOGS'));
  process.exitCode=1;
 }
}
