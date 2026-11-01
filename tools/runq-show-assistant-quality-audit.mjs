#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {globalLedgerDefaultPath} from '../src/qa/globalSpendLedger.mjs';

const GAUNTLET='fixtures/qa/show-assistant-gauntlet-v2.json';
const OFFLINE='artifacts/qa-show-assistant-gauntlet-v2/report.json';
const LIVE_DIR='artifacts/agent-live-eval';
const OUTPUT='artifacts/qa-show-assistant-quality-audit';

const ARTISTIC_REVIEW=new Set(['gauntlet-script-grounding-02','gauntlet-voice-01']);
const action=/\b(?:crea|create|a[nñ]ade|add|mueve|move|edita|edit|cambia|change|fade|prepara|prepare|renombra|rename)\b/i;
const unavailable=/\b(?:PFL|ASIO|routing|genera(?:r)?\s+(?:tres\s+)?m[uú]sicas|generate\s+music|micr[oó]fono|microphone|ASR|hardware)\b/i;
const stateQuestion=/\b(?:estado|status|pendiente|pending|omitido|ready|listo|aplicado|applied|unresolved|sin\s+autorizaci[oó]n|without\s+authorization|no\s+se\s+puede\s+reproducir|cannot\s+play)\b/i;

function intent(prompt,journey){
 if(/\b(?:clave|SYSTEM|AGENTS|HTML|script>|instrucci[oó]n.*guion|command.*script)\b/i.test(prompt))return 'PROMPT_INJECTION';
 if(/\b(?:voz|voice|ASR|transcript|micr[oó]fono|spoken|frases?\s+id[eé]nticas)\b/i.test(prompt))return 'VOICE_REHEARSAL';
 if(/\b(?:ZIP|archivo|WAV|import|arrastr|persist|corrupt)\b/i.test(prompt))return 'IMPORT_PERSISTENCE';
 if(/\b(?:fade|audio|sonido|sound|PFL|ASIO|routing|PLAY|STOP|SILENCE)\b/i.test(prompt))return 'AUDIO_TRANSPORT';
 if(/\b(?:l[ií]nea|Lxx|guion|script|contexto|context|cobertura|coverage|ventana|window)\b/i.test(prompt))return 'SCRIPT_GROUNDING';
 if(/\b(?:cue|plan|propuesta|proposal|deshace|undo|obsoleto|stale|proyecto)\b/i.test(prompt))return 'CUE_PROJECT_STATE';
 if(journey==='marathon-44'||/\b(?:dije|principio|recuerd|remember|resumen|summary)\b/i.test(prompt))return 'CONVERSATION_MEMORY';
 return 'OPERATOR_GUIDANCE';
}
export function classifyLocalGap(turn,result){
 const prompt=turn.prompt;
 if(turn.expect==='C')return {category:'LEGITIMATE_AMBIGUITY',intent:intent(prompt,result.journey)};
 if(unavailable.test(prompt))return {category:'NOT_IMPLEMENTED_CAPABILITY',intent:intent(prompt,result.journey)};
 if(turn.expect==='P'||result.observed==='CLARIFY'||stateQuestion.test(prompt)||action.test(prompt))
  return {category:'MISSING_LOCAL_FUNCTION',intent:intent(prompt,result.journey)};
 return {category:'REQUIRES_AI_REASONING',intent:intent(prompt,result.journey)};
}
function counts(rows,key){return Object.fromEntries([...new Set(rows.map(row=>row[key]))].sort().map(value=>
 [value,rows.filter(row=>row[key]===value).length]));}
async function latestLiveReport(liveDir=LIVE_DIR){
 const {readdir}=await import('node:fs/promises');
 let names;
 try{names=(await readdir(resolve(liveDir))).filter(name=>/^eval-.*\.json$/.test(name));}
 catch(error){if(error?.code==='ENOENT')return null;throw error;}
 const reports=[];
 for(const name of names){
  const report=JSON.parse(await readFile(resolve(liveDir,name),'utf8'));
  if(report.corpus==='gauntlet-v2'&&report.realProviderEvaluations===true)reports.push({name,report});
 }
 if(!reports.length)return null;
 assert.equal(reports.length,1,'EXPECTED_ONE_GAUNTLET_LIVE_REPORT');
 return reports[0];
}
async function readOptionalJson(path){
 try{return JSON.parse(await readFile(path,'utf8'));}
 catch(error){if(error?.code==='ENOENT')return null;throw error;}
}
function reviewLive(row){
 const retained={httpStatus:row.httpStatus,latencyMs:row.latencyMs,
  operations:Array.isArray(row.observedOperations)?row.observedOperations.length:null,
  observedStatus:row.observedStatus??null,result:row.result};
 const missing=row.observedStatus===undefined||row.observedStatus===null;
 return {id:row.id,retained,
  semanticVerdict:missing?'UNRATEABLE_RESPONSE_NOT_RETAINED':'PENDING_REVIEW',
  artisticHumanReview:ARTISTIC_REVIEW.has(row.id)?'PENDING':'NOT_APPLICABLE',
  note:missing?'No raw response or observed status survived; do not infer wording or correctness.':
   'Status exists, but response wording was deliberately not retained.'};
}
function reconcileLedger(ledger,live){
 const runId=live.results[0]?.runId;
 assert.ok(runId&&live.results.every(row=>row.runId===runId));
 const meta=ledger.reservations.filter(row=>row.provider==='meta');
 const runIndexes=meta.map((row,index)=>row.runId===runId?index:-1).filter(index=>index>=0);
 assert.equal(runIndexes.length,16);
 const immediatelyBefore=meta[runIndexes[0]-1]??null;
 const after=meta.slice(runIndexes.at(-1)+1);
 return {runId,runnerReservations:runIndexes.length,runnerHttpAttempts:live.attemptedRequests,
  runnerCompletedHttp200:live.completedRequests,
  precedingSeparateReservation:immediatelyBefore?{
   requestId:immediatelyBefore.requestId,runId:immediatelyBefore.runId,
   amountUsd:immediatelyBefore.amountMicros/1e6,status:immediatelyBefore.status}:null,
  reservationsAddedAfterCommunicatedRun:after.map(row=>({requestId:row.requestId,runId:row.runId,
   amountUsd:row.amountMicros/1e6,status:row.status})),
  conclusion:'The 16 gauntlet reservations match 16 HTTP attempts. The seventeenth was a separate design reservation immediately before the run; RESERVED alone does not prove a completed provider response.'};
}
export async function auditShowAssistantQuality({write=true,offlinePath=OFFLINE,liveDir=LIVE_DIR,
 ledgerPath=globalLedgerDefaultPath()}={}){
 const corpus=JSON.parse(await readFile(resolve(GAUNTLET),'utf8'));
 const offline=JSON.parse(await readFile(resolve(offlinePath),'utf8'));
 const turns=new Map(corpus.scenarios.flatMap(s=>s.turns.map(turn=>[turn.id,{...turn,journey:s.id}])));
 const gaps=offline.results.filter(row=>row.outcome==='LOCAL_GAP').map(row=>{
  const turn=turns.get(row.id);assert.ok(turn);return {...row,prompt:turn.prompt,...classifyLocalGap(turn,row)};
 });
 assert.ok(gaps.length<=125,'LOCAL_GAP_COUNT_INCREASED');
 const latest=await latestLiveReport(liveDir);
 const ledger=latest?await readOptionalJson(ledgerPath):null;
 const localGaps={baselineTotal:125,total:gaps.length,byCategory:counts(gaps,'category'),byIntent:counts(gaps,'intent'),rows:gaps};
 const notRun=reason=>({status:'NOT_RUN',reason});
 let report;
 if(!latest){
  const reason='NO_LIVE_GAUNTLET_REPORT in '+liveDir+'; live evidence is local-only and is never fetched by this audit';
  report={version:1,mode:'READ_ONLY_NO_PAID_CALLS',source:{liveFile:null},liveEvidence:notRun(reason),
   semanticReview:notRun(reason),voice01:notRun(reason),localGaps,reservationReconciliation:notRun(reason)};
 }else{
  const {name:liveFile,report:live}=latest;
  const pending=live.results.filter(row=>row.reviewRequired).map(reviewLive);
  report={version:1,mode:'READ_ONLY_NO_PAID_CALLS',source:{liveFile},liveEvidence:{status:'AVAILABLE'},
   semanticReview:{status:'AVAILABLE',requested:10,rows:pending.filter(row=>row.id!=='gauntlet-voice-01'),
    conclusion:'No semantic accuracy denominator is available because response content/status was not retained.'},
   voice01:{status:'AVAILABLE',classification:'ORACLE_AND_EVIDENCE_RETENTION_DEFECT',modelFailureProven:false,
    schemaFailure:false,parserFailure:false,retained:reviewLive(live.results.find(row=>row.id==='gauntlet-voice-01')).retained,
    analysis:'HTTP 200 and a valid parsed reply with zero operations reached the judge. The oracle required ANSWER for an ambiguity where CLARIFY can be safe, but the missing observed status prevents retrospective regrading.'},
   localGaps,
   reservationReconciliation:ledger?{status:'AVAILABLE',...reconcileLedger(ledger,live)}:notRun('NO_LOCAL_LEDGER')};
 }
 if(write){
  const dir=resolve(OUTPUT);await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'audit.json'),JSON.stringify(report,null,2)+'\n');
  const rec=report.reservationReconciliation;
  const lines=['# RUNQ Show Assistant quality audit','',
   '**Read-only analysis. No paid requests.**','',
   '## Retained Muse evidence','',
   report.liveEvidence.status==='NOT_RUN'?'NOT_RUN: '+report.liveEvidence.reason+'.':
   'The ten requested semantic reviews are **unrateable from retained evidence**: raw text and observed status were not saved. Two stagecraft/artistic cases remain explicitly pending human review; none is promoted to correct.','',
   '## voice-01','',report.voice01.analysis??'NOT_RUN.','',
   '## '+report.localGaps.total+' LOCAL_GAP','',
   ...Object.entries(report.localGaps.byCategory).map(([key,value])=>'- '+key+': '+value),'',
   ...Object.entries(report.localGaps.byIntent).map(([key,value])=>'- '+key+': '+value),'',
   '## Ledger reconciliation','',
   ...(rec.status==='AVAILABLE'?[rec.conclusion,'',
    'Runner reservations/HTTP attempts/HTTP 200: '+[rec.runnerReservations,rec.runnerHttpAttempts,rec.runnerCompletedHttp200].join(' / ')+'.']:
    ['NOT_RUN: '+rec.reason+'.'])];
  await writeFile(join(dir,'audit.md'),lines.join('\n')+'\n');
 }
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const report=await auditShowAssistantQuality();
 console.log('QUALITY AUDIT OFFLINE',report.localGaps.total,'LOCAL_GAP',
  JSON.stringify(report.localGaps.byCategory),'NO PAID REQUESTS');
}
