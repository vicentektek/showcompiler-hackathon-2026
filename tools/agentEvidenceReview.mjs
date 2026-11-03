import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {prepareAgentPlan} from '../src/core/agentCore.mjs';
import {evaluateMetaCase,QUALITY_EVALUATOR_REVISION} from '../src/qa/qualityEvaluation.mjs';

export const AGENT_REPORT_FILE=/^eval-\d+-\d+(?:-[a-f0-9-]+)?\.json$/;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const operationEvidence=operations=>operations.map(op=>({
 op:op.op,cueId:op.cueId??null,targetCueId:op.targetCueId??null,
 position:op.position??null,afterCueId:op.afterCueId??null,
 fields:Object.entries(op.changes??{}).map(([field,value])=>({field,valueHash:hash(value)})),
}));
const canonical=operations=>operations.map(op=>({...op,
 fields:[...(op.fields??[])].sort((a,b)=>a.field.localeCompare(b.field)),
}));

export function reviewRetainedAgentCase(scenario,row){
 const result={originalCorrect:row.correct??null,originalResult:row.result??null,
  retainedContractCorrect:null,evaluatorCorrection:null,eventReplay:null,
  fullResponseReplayed:false,preservationIndependentlyReplayed:false,
  evaluatorRevision:QUALITY_EVALUATOR_REVISION,limitation:'LEGACY_DERIVED_METRICS_ONLY'};
 if(row.httpStatus!==200){result.limitation='NO_COMPLETED_RESPONSE';return result;}
 const item=scenario?.qualityCase,quality=row.quality;
 if(!item||!quality)return result;
 if(row.caseFingerprint!==scenario.caseFingerprint||
    quality.contractFingerprint!==hash(item.expected)){
  result.limitation='INPUT_OR_GOLD_IDENTITY_MISMATCH';return result;
 }
 const evidence=quality.evidence;
 if(!evidence){result.limitation='RESPONSE_EVIDENCE_NOT_RETAINED';return result;}
 if(item.expected.kind==='EVENTS'){
  if(!Array.isArray(evidence.events)){result.limitation='EVENTS_NOT_RETAINED';return result;}
  const plays=evidence.events.filter(e=>e.transport==='PLAY');
  result.eventReplay=evaluateMetaCase(item,{
   proposals:plays.map(e=>({lineId:e.sourceLineId})),proposalDetails:plays,
   observations:evidence.events.filter(e=>e.transport!=='PLAY'),
   coverage:{complete:evidence.coverageComplete===true},
  });
  result.retainedContractCorrect=result.eventReplay.correct;
  result.limitation='TYPED_EVENTS_REPLAYED_NOT_RAW_RESPONSE_OR_ARTISTIC_QUALITY';
  return result;
 }
 if(!Array.isArray(evidence.operations)||!['PLAN','ANSWER','CLARIFY'].includes(evidence.status)){
  result.limitation='OPERATION_EVIDENCE_NOT_RETAINED';return result;
 }
 if(['NO_PLAN','CLARIFY'].includes(item.expected.kind)){
  result.retainedContractCorrect=evidence.status!=='PLAN'&&evidence.operations.length===0&&
   (item.expected.kind!=='CLARIFY'||evidence.status==='CLARIFY');
  result.limitation='STATUS_ONLY_REPLY_TEXT_AND_TRUTHFULNESS_NOT_RETAINED';
  return result;
 }
 let requested=false;
 if(item.expected.kind==='CREATE'){
  const last=item.input.project.cues.at(-1)?.id??null;
  requested=evidence.operations.length===item.expected.count&&evidence.operations.every(op=>
   op.op==='CREATE_CUE'&&(op.afterCueId===null||op.afterCueId===last));
  if(row.correct===false&&row.result==='WRONG_EDIT'&&requested&&
     evidence.preserved===true&&evidence.undoExact===true&&
     evidence.operations.some(op=>last!==null&&op.afterCueId===last))
   result.evaluatorCorrection='APPEND_AFTER_LAST_IS_VALID';
 }else{
  const expected=operationEvidence(prepareAgentPlan(item.input.project,item.expected.operations).operations);
  requested=isDeepStrictEqual(canonical(evidence.operations),canonical(expected));
 }
 result.retainedContractCorrect=evidence.status==='PLAN'&&requested&&
  evidence.preserved===true&&evidence.undoExact===true;
 result.limitation='OPERATION_CONTRACT_REPLAYED_HASHED_VALUES_ONLY_PRESERVATION_FROM_ORIGINAL_EVALUATOR';
 return result;
}

function metrics(rows){
 const scored=rows.filter(r=>r.review.retainedContractCorrect!==null);
 return {cases:rows.length,originalCorrect:rows.filter(r=>r.originalCorrect===true).length,
  originalWrong:rows.filter(r=>r.originalCorrect===false).length,
  originalUnscored:rows.filter(r=>r.originalCorrect===null).length,
  retainedContractsScored:scored.length,
  retainedContractsCorrect:scored.filter(r=>r.review.retainedContractCorrect).length,
  evaluatorCorrections:rows.filter(r=>r.review.evaluatorCorrection).length,
  typedEventReplays:rows.filter(r=>r.review.eventReplay?.scored).length,
  fullResponsesReplayed:0};
}
function group(rows,key){
 return Object.fromEntries([...new Set(rows.map(r=>r[key]))].sort().map(value=>
  [value,metrics(rows.filter(r=>r[key]===value))]));
}
export async function reviewSavedAgentEvidence({directory,corpus}){
 let names;
 try{names=await readdir(directory);}
 catch(error){if(error.code==='ENOENT')names=[];else throw error;}
 const byId=new Map(corpus.map(s=>[s.id,s])),reports=[],rows=[],excluded=[];
 const seen=new Map();
 for(const name of names.filter(n=>AGENT_REPORT_FILE.test(n)).sort()){
  const bytes=await readFile(join(directory,name));
  if(bytes.length>4_000_000)throw new Error('EVAL_HISTORY_TOO_LARGE');
  const report=JSON.parse(bytes.toString('utf8'));
  if(report.realProviderEvaluations===false&&report.evidenceMode==='OFFLINE_SIMULATED_TRANSPORT'){
   excluded.push(name);continue;
  }
  if(report.version!==2||report.realProviderEvaluations!==true||!Array.isArray(report.results))
   throw new Error('UNRECONCILED_EVAL_HISTORY');
  reports.push({file:name,sha256:createHash('sha256').update(bytes).digest('hex'),
   sourceCommit:report.sourceCommit??null,sourceSnapshotSha256:report.sourceSnapshotSha256??null,
   evidenceMode:report.evidenceMode??'LEGACY_REAL_PROVIDER_FLAG_NO_VENDOR_RECEIPT',
   requests:report.results.length,providerReceiptVerified:false});
  for(const row of report.results.filter(r=>r.provider==='meta')){
   const scenario=byId.get(row.id),item=scenario?.qualityCase;
   const identity=row.caseFingerprint??scenario?.caseFingerprint;
   if(!identity)throw new Error('UNRECONCILED_CASE_ID');
   const duplicateOf=seen.get(identity)??null;
   if(!duplicateOf)seen.set(identity,name+':'+row.id);
   const record={file:name,id:row.id,inputFingerprint:identity,duplicateOf,
    newBatch:Boolean(item),category:row.category,language:row.language??scenario?.language??'unknown',
    difficulty:row.difficulty??'LEGACY_NOT_LABELLED',split:item?.split??'legacy-not-labelled',
    questionType:item?.expected.kind??scenario?.expected.kind??'unknown',
    intent:item?.family??scenario?.kind??'unknown',endpoint:item?.endpoint??'agent',
    requestedOperationTypes:(item?.expected.operations??[]).map(op=>op.op),
    requestedFields:(item?.expected.operations??[]).flatMap(op=>Object.keys(op.changes??{})),
    conversationTurns:scenario?.conversation?.length??0,
    scriptLines:scenario?.project?.scriptText.split('\n').length??null,
    originalCorrect:row.correct??null,httpStatus:row.httpStatus,
    latencyMs:row.latencyMs,reviewRequired:row.reviewRequired===true,
    originalEvaluatorRevision:row.quality?.evaluatorRevision??'legacy-v2',
    review:reviewRetainedAgentCase(scenario,row)};
   rows.push(record);
  }
 }
 const fresh=rows.filter(r=>r.newBatch),unique=rows.filter(r=>!r.duplicateOf);
 const sortedLatency=fresh.map(r=>r.latencyMs).filter(Number.isFinite).sort((a,b)=>a-b);
 const quantile=q=>sortedLatency.length?sortedLatency[Math.ceil(q*sortedLatency.length)-1]:null;
 const count=values=>values.reduce((out,value)=>{out[value]=(out[value]??0)+1;return out;},{});
 return {revision:'retained-agent-evidence-v1',reports,rows,
  summary:{reportedRequests:rows.length,uniqueInputs:unique.length,
   duplicateInputs:rows.length-unique.length,simulatedReportsExcluded:excluded.length,
   newProviderRequests:0,providerReceiptsVerified:0,
   newBatch:{...metrics(fresh),completed:fresh.filter(r=>r.httpStatus===200).length,
    minScriptLines:fresh.length?Math.min(...fresh.map(r=>r.scriptLines)):null,
    maxScriptLines:fresh.length?Math.max(...fresh.map(r=>r.scriptLines)):null,
    maxConversationTurns:fresh.length?Math.max(...fresh.map(r=>r.conversationTurns)):0,
    latencyMedianMs:quantile(0.5),latencyP95Ms:quantile(0.95),
    requestedOperationTypes:count(fresh.flatMap(r=>r.requestedOperationTypes)),
    requestedFields:count(fresh.flatMap(r=>r.requestedFields))}},
  strata:{functionality:group(fresh,'category'),language:group(fresh,'language'),
   difficulty:group(fresh,'difficulty'),questionType:group(fresh,'questionType'),
   intent:group(fresh,'intent'),endpoint:group(fresh,'endpoint'),split:group(fresh,'split')},
  limitations:['REAL_PROVIDER_FLAG_AND_LOCAL_HTTP_NOT_INDEPENDENT_VENDOR_BILLING_PROOF',
   'PROVISIONAL_SYNTHETIC_GOLD_NOT_PROFESSIONAL_ACCEPTANCE',
   'NO_RAW_RESPONSES_NO_LABEL_REPLAY_NO_INDEPENDENT_FULL_SNAPSHOT_REPLAY',
   'NO_A_B_MODEL_IMPROVEMENT_CLAIM_AFTER_ORACLE_CHANGE']};
}
