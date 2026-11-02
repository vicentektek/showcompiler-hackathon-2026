#!/usr/bin/env node
/**
 * RUNQ AI Battery v1 — real Meta evals, one invocation, no other providers.
 * This intentionally uses the current RUNQ assistant's real payload builder,
 * real schema decoder and existing V3 evaluation corpus. No product mutations.
 * Owner removed local Meta/Modal budget caps on 2026-11-02.
 * Historical reservations remain intact; estimates are informational only.
 * Only synthetic data. No raw replies/prompts/credentials in saved artifacts.
 */
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,open,rename,unlink} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {createAssistantV3Tasks,buildAssistantV3Payload,decodeAndGradeAssistantV3,assistantV3SourceFingerprint,loadAssistantV3Corpus,makeAssistantV3Case} from '../src/qa/assistantV3Evaluation.mjs';
import {buildExpertAgentContext} from '../src/core/agentExpertContext.mjs';
import {buildAgentContext} from '../src/core/agentCore.mjs';
import {retrieveCapabilities} from '../src/core/runqCapabilities.mjs';
import {globalLedgerDefaultPath} from '../src/qa/globalSpendLedger.mjs';

const VERSION='runq-ai-battery-v1-20261102';
const URL='https://api.meta.ai/v1/chat/completions';
const MODEL='muse-spark-1.3';
const EUR_CAP_MICROS=60_000_000;
const MAX_BODY_BYTES=40_000;
const MAX_COMPLETION=2200;
const MAX_RESPONSE_BYTES=160_000;
const USD_INPUT_PER_M=1.25,USD_OUTPUT_PER_M=4.25;
// 1.75 EUR per estimated USD includes conservative FX+tariff headroom.
// Treat as a RESERVATION, not a vendor bill or exchange rate assertion.
const EUR_BUFFER_PER_USD=1.75;
const INPUT_TOKEN_OVERHEAD=4096;
// Historical tariff assumptions: informational estimates, not provider invoices.
const OUTPUT=resolve('artifacts/qa-ai-battery-v1');
const RUN_FILE=join(OUTPUT,'run.json');
const OLD_LEDGER=globalLedgerDefaultPath();
const LEDGER_FILE=join(dirname(OLD_LEDGER),'ai-battery-v1-eur-ledger.json');
const hex=x=>createHash('sha256').update(x).digest('hex');
const js=x=>JSON.stringify(x);
const fixed=(x)=>Number((x/1_000_000).toFixed(6));
const ERR=e=>e?.code&&/^[A-Z_]+$/.test(e.code)?e.code:(e?.message||'ERROR').replace(/[^A-Z0-9_]/g,'').slice(0,60)||'ERROR';
const ensure=(b,code)=>{if(!b)throw new Error(code)};
const pause=ms=>new Promise(r=>setTimeout(r,ms));

function flags(args){
  const out={live:false,count:320,mode:'both',dry:false,showStatus:false};
  for(let i=0;i<args.length;i++){
    const a=args[i];
    if(a==='--live'){out.live=true;continue}
    if(a==='--dry-run'){out.dry=true;continue}
    if(a==='--status'){out.showStatus=true;continue}
    if(['--count','--mode'].includes(a)){
      ensure(i+1<args.length,'BAD_ARGUMENT');
      const value=args[++i];
      if(a==='--count'){out.count=Number(value);continue}
      out.mode=value;continue;
    }
    throw new Error('UNKNOWN_ARGUMENT');
  }
  ensure(Number.isSafeInteger(out.count)&&out.count>=2&&out.count<=800,'INVALID_COUNT');
  ensure(['both','assistant','supplementary'].includes(out.mode),'INVALID_MODE');
  ensure(!out.dry||!out.live,'CONFLICTING_FLAGS');
  return out;
}

async function readJson(file,required=false){
  try{return JSON.parse(await readFile(file,'utf8'))}
  catch(e){if(e.code==='ENOENT'&&!required)return null;throw e}
}
async function writeAtomic(file,obj){
  await mkdir(dirname(file),{recursive:true});
  const tmp=file+'.tmp-'+process.pid;
  const f=await open(tmp,'wx',0o600);
  try{await f.writeFile(js(obj)+'\n');await f.sync()}finally{await f.close()}
  await rename(tmp,file);
}

// Take exactly the same interprocess lock as all previous RunQ campaigns.
// We do not update the old authorization, counters, rows or caps.
async function withLock(fn){
  await mkdir(dirname(OLD_LEDGER),{recursive:true});
  let lock;
  try{lock=await open(OLD_LEDGER+'.lock','wx',0o600)}
  catch(e){if(e.code==='EEXIST')throw new Error('SHARED_LEDGER_BUSY');throw e}
  try{
    const old=await readJson(OLD_LEDGER);
    if(old)ensure(old.schemaVersion===1&&Array.isArray(old.reservations),'LEGACY_LEDGER_INVALID');
    return await fn(old);
  }finally{await lock.close();await unlink(OLD_LEDGER+'.lock')}
}
function validateLedger(s){
  if(!s)return {version:VERSION,capEurMicros:EUR_CAP_MICROS,entries:[]};
  ensure(s.version===VERSION&&s.capEurMicros===EUR_CAP_MICROS&&Array.isArray(s.entries),'LEDGER_INVALID');

  const ids=new Set();let sum=0;
  for(const x of s.entries){
    ensure(x&&/^[a-f0-9]{64}$/.test(x.id)&&!ids.has(x.id),'LEDGER_DUPLICATE_OR_CORRUPT');
    ids.add(x.id);
    ensure(['RESERVED','COMPLETED','UNKNOWN'].includes(x.status)&&
      Number.isSafeInteger(x.eurMicros)&&x.eurMicros>0&&
      /^[a-f0-9]{64}$/.test(x.payloadHash)&&typeof x.at==='string','LEDGER_ROW_INVALID');
    sum+=x.eurMicros;
  }

  return s;
}
async function budgetStatus(){return withLock(async()=>{
  const s=validateLedger(await readJson(LEDGER_FILE));
  const used=s.entries.reduce((a,x)=>a+x.eurMicros,0);
  return {calls:s.entries.length,reservedEUR:fixed(used),budgetLimitsDisabled:true,remainingEUR:null};
})}
async function reserve(id,payload){
  const body=js(payload),bytes=Buffer.byteLength(body);
  ensure(bytes<=MAX_BODY_BYTES,'PAYLOAD_TOO_LARGE');
  ensure(payload.model===MODEL&&payload.max_completion_tokens===MAX_COMPLETION&&
    payload.stream===false&&payload.store===false&&Array.isArray(payload.messages)&&
    !('tools'in payload)&&!('modalities'in payload),'UNAPPROVED_MODEL_REQUEST');
  // Worst-case byte tokenizer (at most one input token per UTF-8 byte), plus
  // a further 4096 token overhead; completion is hard capped in payload.
  const maxInputTokens=bytes+INPUT_TOKEN_OVERHEAD;
  const worstUsd=(maxInputTokens*USD_INPUT_PER_M+MAX_COMPLETION*USD_OUTPUT_PER_M)/1e6;
  const eurMicros=Math.ceil(worstUsd*EUR_BUFFER_PER_USD*1e6);
  return withLock(async()=>{
    const s=validateLedger(await readJson(LEDGER_FILE));
    ensure(!s.entries.some(x=>x.id===id),'ALREADY_ATTEMPTED_NEVER_RETRY');

    const used=s.entries.reduce((a,x)=>a+x.eurMicros,0);

    const record={id,status:'RESERVED',eurMicros,payloadHash:hex(body),at:new Date().toISOString()};
    s.entries.push(record);
    await writeAtomic(LEDGER_FILE,s);
    return record;
  });
}
async function mark(id,status){
  return withLock(async()=>{
    const s=validateLedger(await readJson(LEDGER_FILE,true));
    const e=s.entries.find(x=>x.id===id);
    ensure(e&&e.status==='RESERVED','LEDGER_RESULT_INCONSISTENT');
    ensure(['UNKNOWN','COMPLETED'].includes(status),'INVALID_RESULT_STATUS');
    e.status=status;await writeAtomic(LEDGER_FILE,s);return e;
  });
}
function summary(state){
  const count=(x)=>state.items.filter(i=>i.status===x).length;
  const done=state.items.filter(i=>i.status==='COMPLETED');
  const graded=done.filter(i=>i.grade?.rubricCoverage==='DETERMINISTIC_CONTRACT_ORACLE');
  const full=graded.filter(i=>i.grade?.contractPass===true).length;
  const shape=done.filter(i=>i.grade?.statusAndShapePass).length;
  const cost=done.map(i=>i.costEstimateUsd).filter(Number.isFinite).reduce((a,b)=>a+b,0);
  return {planned:state.items.length,completed:done.length,unknown:count('UNKNOWN'),pending:count('PLANNED'),
    fullOracleCases:graded.length,fullContractPasses:full,shapeMatches:shape,
    semanticQuality:'NOT_RATED',estimatedTokenCostUSD:+cost.toFixed(6),
    byVariant:Object.fromEntries(['A','D'].map(v=>[v,{completed:done.filter(i=>i.variant===v).length,
      fullOracle:graded.filter(i=>i.variant===v).length,
      fullPass:graded.filter(i=>i.variant===v&&i.grade.contractPass).length}])),
  };
}

async function writeReport(state,budget){
  const done=state.items.filter(x=>x.status==='COMPLETED');
  const families=[...new Set(state.items.map(i=>i.family))].sort();
  const rows=families.map(f=>{
    const a=done.filter(x=>x.family===f&&x.variant==='A');
    const d=done.filter(x=>x.family===f&&x.variant==='D');
    const scored=x=>x.filter(t=>t.grade?.rubricCoverage==='DETERMINISTIC_CONTRACT_ORACLE');
    const pass=x=>scored(x).filter(t=>t.grade?.contractPass).length;
    return `| ${f} | ${a.length} | ${d.length} | ${pass(a)}/${scored(a).length} | ${pass(d)}/${scored(d).length} |`;
  });
  const byScenario=new Map();
  for(const r of done){
    const row=byScenario.get(r.scenarioId)??{};row[r.variant]=r;byScenario.set(r.scenarioId,row);
  }
  let expertImproved=0,expertRegressed=0,expertSame=0;
  for(const pair of byScenario.values()){
    const a=pair.A?.grade,d=pair.D?.grade;
    if(a?.rubricCoverage!=='DETERMINISTIC_CONTRACT_ORACLE'||
       d?.rubricCoverage!=='DETERMINISTIC_CONTRACT_ORACLE')continue;
    if(!a.contractPass&&d.contractPass)expertImproved++;
    else if(a.contractPass&&!d.contractPass)expertRegressed++;
    else expertSame++;
  }
  const errors=state.items.filter(x=>x.status==='UNKNOWN'||(x.grade?.rubricCoverage==='DETERMINISTIC_CONTRACT_ORACLE'&&!x.grade?.contractPass))
    .slice(0,25).map(x=>`| ${x.scenarioId} | ${x.variant} | ${x.status} | ${x.error??'CONTRACT_NOT_MET'} |`).join('\n');
  const m=summary(state);
  const body=`# RUNQ AI Battery — evaluación sobre Muse Spark 1.3

- Versión de origen: \`${state.sourceHash}\`
- Fecha: ${new Date().toISOString()}
- Modalidad: 320 solicitudes planificadas, secuenciales; **solo Meta**
- Completadas: ${m.completed}/${m.planned}; resultado incierto: ${m.unknown}; pendientes: ${m.pending}
- Reserva nueva: **${budget.reservedEUR} EUR (sin tope local)** (NO es una factura)
- Tarifa aplicada a tokens conocidos (estimación): **${m.estimatedTokenCostUSD} USD**
- Aciertos en rúbricas completas deterministas: **${m.fullContractPasses}/${m.fullOracleCases}**
- Coincidencia de esquema/estado: ${m.shapeMatches}/${m.completed}
- Calidad creativa, ayuda verdaderamente útil, comprensión semántica: **NOT_RATED** hasta revisión independiente

## Comparación emparejada A (anterior) / D (experto)

| Familia | A completadas | D completadas | A contratos completos | D contratos completos |
|---|---:|---:|---:|---:|
${rows.join('\n')}

Comparaciones con oráculo completo y ambas respuestas: mejoró D ${expertImproved}, empeoró D ${expertRegressed}, igual ${expertSame}. Estos son **contratos**, no puntuaciones humanas de inteligencia.

## Ejemplos para revisar

| Caso | Variante | Estado | Hallazgo |
|---|---|---|---|
${errors||'| — | — | — | Ningún fallo de contrato en los primeros registros |'}

## Limitaciones

Los casos STATUS_AND_SHAPE_ONLY no se cuentan como aciertos semánticos. Las escenas de memoria prueban contexto sintético, **no 50 intercambios reales consecutivos**. No se guardan respuestas literales de Muse ni datos de espectáculos. Ninguna respuesta activa GO/STOP ni modifica proyectos.

La suma de reservas incorpora todas las solicitudes previas de **esta batería**, aunque se hayan quedado con resultado incierto. El ledger histórico anterior es de solo lectura.
`;
  await writeFile(join(OUTPUT,'report.md'),body,'utf8');
}

function sourceID(task,srcHash){return hex(js({v:VERSION,srcHash,case:task.caseSha256,
    input:task.inputSha256,variant:task.variant,model:MODEL}));}
async function independentTasks(){
  const ownFile=resolve('fixtures/qa/runq-ai-independent-v1.json');
  const raw=await readFile(ownFile,'utf8');
  const own=JSON.parse(raw);
  ensure(own.version===1&&own.cases?.length===48,'INDEPENDENT_CASES_INVALID');
  const {data}=await loadAssistantV3Corpus();
  const templates=new Map(data.scenarios.map(x=>[x.id,x]));
  const seen=new Set();const tasks=[];
  for(const def of own.cases){
    ensure(!seen.has(def.id)&&typeof def.prompt==='string'&&def.prompt.length>=18&&
      ['es','en'].includes(def.language)&&templates.has(def.template),'INDEPENDENT_CASE_INVALID');
    seen.add(def.id);
    const base=makeAssistantV3Case(templates.get(def.template),0,Date.parse('2026-11-01T22:00:00Z'));
    const input={...base.input,prompt:def.prompt,language:def.language,conversation:[]};
    const rawMemory=base.contexts.D.expert?.memory??null;
    const contexts={
      A:buildAgentContext(base.project,{maxCues:80,maxScriptLines:120}),
      D:buildExpertAgentContext(base.project,def.prompt,{
        workspace:'ai',capabilities:retrieveCapabilities(def.prompt),
        memory:rawMemory,
      }),
    };
    const data={...base,input,contexts,expected:def.expected,language:def.language,
      memoryProvided:Boolean(rawMemory),source:'runq-ai-independent-v1',
      inputSha256:hex(js({input,defId:def.id}))};
    for(const variant of ['A','D']){
      tasks.push({scenarioId:def.id,variant,caseData:data,
        family:def.family,split:'validation',turn:0,pending:false,
        caseSha256:hex(js({def,variant,source:'independent-v1'})),
        inputSha256:data.inputSha256});
    }
  }
  return {tasks,corpusSha256:hex(raw)};
}
async function makeTaskPlan(opts){
  const [{tasks:known,corpusSha256},own]=await Promise.all([
    createAssistantV3Tasks({split:'all',suite:'pending',variants:['A','D'],limit:800}),
    independentTasks(),
  ]);
  // beginner-01 has already been billed/evaluated six times by PR #131;
  // the new campaign prioritizes the 106 remaining baseline cases.
  const pending=known.filter(x=>x.pending&&x.scenarioId!=='beginner-01');
  const supplementary=known.filter(x=>!x.pending);
  const candidate=opts.mode==='assistant'?[...pending,...own.tasks]:
    opts.mode==='supplementary'?[...own.tasks,...supplementary]:
    [...pending,...own.tasks,...supplementary];
  const filtered=candidate.slice(0,opts.count);
  ensure(filtered.length>0,'NO_CASES');
  const sourceHash=await assistantV3SourceFingerprint();
  const fullCorpusHash=hex(corpusSha256+own.corpusSha256);
  const fingerprint=hex(js({v:VERSION,sourceHash,corpusSha256:fullCorpusHash,
    selected:filtered.map(t=>[t.caseSha256,t.variant])}));
  return {sourceHash,corpusSha256:fullCorpusHash,fingerprint,items:filtered.map(t=>({id:sourceID(t,sourceHash),
    scenarioId:t.scenarioId,variant:t.variant,family:t.family,split:t.split,pending:t.pending,
    status:'PLANNED',grade:null,usage:null,costEstimateUsd:null,error:null,ms:null})),tasks:filtered};
}

function checkState(state,plan){
  ensure(state.version===VERSION&&state.fingerprint===plan.fingerprint&&
    state.sourceHash===plan.sourceHash&&state.items?.length===plan.items.length,
    'SOURCE_OR_SELECTION_CHANGED_RESTART_REVIEW');
  ensure(state.items.every((x,i)=>x.id===plan.items[i].id&&
    ['PLANNED','COMPLETED','UNKNOWN'].includes(x.status)),'RUN_STATE_INVALID');
}
async function loadOrMake(opts){
  const plan=await makeTaskPlan(opts);
  const old=await readJson(RUN_FILE);
  if(old){checkState(old,plan);return {plan,state:old}}
  const state={version:VERSION,createdAt:new Date().toISOString(),sourceHash:plan.sourceHash,
    fingerprint:plan.fingerprint,selection:{mode:opts.mode,count:opts.count},items:plan.items};
  await writeAtomic(RUN_FILE,state);return {plan,state};
}

function cleanFailure(code){
  return /^((?:HTTP|MODEL|JSON|SCHEMA|LEDGER|API|CONTEXT|META|TOO|RESULT|TIMEOUT|UNAPPROVED)[_A-Z0-9]*)$/.test(code)?code:'AI_REQUEST_FAILED';
}
async function liveOne(item,task,srcHash){
  const payload=buildAssistantV3Payload(task.caseData,task.variant);
  const body=js(payload);
  ensure(Buffer.byteLength(body)<=MAX_BODY_BYTES,'PAYLOAD_TOO_LARGE');
  const reservation=await reserve(item.id,payload);
  item.status='UNKNOWN'; // Never reissue on crash after reservation.
  item.reservedEUR=fixed(reservation.eurMicros);
  await writeAtomic(RUN_FILE,currentState);
  const started=Date.now();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),70_000);

  try{
    const res=await fetch(URL,{method:'POST',headers:{'Authorization':`Bearer ${process.env.MODEL_API_KEY}`,
      'Content-Type':'application/json','Accept':'application/json'},body,signal:controller.signal});
    ensure(res.ok,'HTTP_'+res.status);
    const rawText=await res.text();
    ensure(Buffer.byteLength(rawText)<=MAX_RESPONSE_BYTES,'MODEL_REPLY_TOO_LARGE');
    const data=JSON.parse(rawText);
    const reply=decodeAndGradeAssistantV3(task.caseData,task.variant,data);
    const u=data?.usage??{};
    const input=Number.isSafeInteger(u.prompt_tokens)&&u.prompt_tokens>=0?u.prompt_tokens:null;
    const output=Number.isSafeInteger(u.completion_tokens)&&u.completion_tokens>=0?u.completion_tokens:null;
    ensure(input===null||input<=Buffer.byteLength(body)+INPUT_TOKEN_OVERHEAD,'MODEL_INPUT_EXCEEDS_RESERVED');
    ensure(output===null||output<=MAX_COMPLETION,'MODEL_OUTPUT_EXCEEDS_CAP');
    item.grade=reply;
    item.usage={promptTokens:input,completionTokens:output};
    item.costEstimateUsd=input===null||output===null?null:+((input*USD_INPUT_PER_M+output*USD_OUTPUT_PER_M)/1e6).toFixed(6);
    item.ms=Date.now()-started;
    await mark(item.id,'COMPLETED');
    item.status='COMPLETED';
    await writeAtomic(RUN_FILE,currentState);
    return true;
  }catch(e){
    item.error=cleanFailure(ERR(e));item.ms=Date.now()-started;
    // Even when the provider rejected a request, retain the reservation:
    // the outcome is not independently reconciled. No automatic retry.
    try{await mark(item.id,'UNKNOWN')}catch{item.error='LEDGER_RECONCILE_REQUIRED'}
    await writeAtomic(RUN_FILE,currentState);
    return false;
  }finally{clearTimeout(timer)}
}
let currentState;
async function main(){
  const opts=flags(process.argv.slice(2));
  if(opts.showStatus){
    const saved=await readJson(RUN_FILE);const budget=await budgetStatus();
    if(saved)await writeReport(saved,budget);
    console.log(js({budget,progress:saved?summary(saved):null}));return;
  }

  if(opts.live)ensure(typeof process.env.MODEL_API_KEY==='string'&&process.env.MODEL_API_KEY.trim(),'MODEL_API_KEY_NOT_CONFIGURED');
  if(!opts.live){
    const plan=await makeTaskPlan(opts);
    let biggest=0,estimatedWorstEurMicros=0;
    for(const task of plan.tasks){
      const payload=buildAssistantV3Payload(task.caseData,task.variant);
      const bytes=Buffer.byteLength(js(payload));
      ensure(bytes<=MAX_BODY_BYTES,'PREVIEW_PAYLOAD_TOO_LARGE');
      biggest=Math.max(biggest,bytes);
      const usd=((bytes+INPUT_TOKEN_OVERHEAD)*USD_INPUT_PER_M+
        MAX_COMPLETION*USD_OUTPUT_PER_M)/1_000_000;
      estimatedWorstEurMicros+=Math.ceil(usd*EUR_BUFFER_PER_USD*1_000_000);
    }

    console.log(js({mode:'OFFLINE_PREVIEW_NO_REQUESTS',planned:plan.items.length,
      maxPayloadBytes:biggest,totalConservativeReservationEUR:fixed(estimatedWorstEurMicros),
      breakdown:Object.fromEntries([...new Set(plan.items.map(i=>i.family))].map(f=>[f,plan.items.filter(i=>i.family===f).length])),
      sample:plan.items.slice(0,12).map(i=>({case:i.scenarioId,variant:i.variant,split:i.split}))}));
    return;
  }
  const {plan,state}=await loadOrMake(opts);currentState=state;
  const budget=await budgetStatus();
  console.log(`RUNQ AI Battery v1 | ${opts.live?'LIVE META ONLY':'DRY RUN'} | ${plan.items.length} tasks | old campaign unchanged`);
  console.log(`Meta request ceiling: ${MAX_BODY_BYTES} bytes input payload, ${MAX_COMPLETION} output tokens. No local budget cap; estimated reserve so far EUR ${budget.reservedEUR}.`);
  for(let i=0;i<state.items.length;i++){
    const item=state.items[i];if(item.status==='COMPLETED')continue;
    if(item.status==='UNKNOWN'){
      console.log('STOP: unknown previous request; never reissue. See --status.');break;
    }

    const ok=await liveOne(item,plan.tasks[i],plan.sourceHash);
    if((i+1)%10===0||!ok){
      const b=await budgetStatus();await writeReport(state,b);
      console.log(`${i+1}/${state.items.length}: ${js(summary(state))}`);
    }
    if(!ok){console.log('STOP: provider, evaluation or ledger result uncertain; no retry.');break}
    await pause(220);
  }
  const finalBudget=await budgetStatus();await writeReport(state,finalBudget);
  console.log('FINAL '+js({budget:finalBudget,summary:summary(state),report:'artifacts/qa-ai-battery-v1/report.md'}));
}
main().catch(e=>{console.error('RUNQ_AI_BATTERY_STOP '+cleanFailure(ERR(e)));process.exitCode=1});
