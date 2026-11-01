import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {evaluateStageEventCases} from '../core/stageCueQa.mjs';
import {prepareAgentPlan,commitAgentPlan,undoAgentPlan} from '../core/agentCore.mjs';
import {classifyAudioQuality,compareAudioAlternatives} from './audioQuality.mjs';

export const QUALITY_EVALUATOR_REVISION='quality-contract-v2-append';
const same=isDeepStrictEqual;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const proposals={
 HALLUCINATED_SOURCE:['CRITICAL','Validate exact source IDs and coverage before staging any proposal.'],
 FORBIDDEN_PLAY:['CRITICAL','Add a negative cue regression; distinguish dialogue, practical sound and PREPARE from PLAY.'],
 DUPLICATE_EVENT:['HIGH','Review stable event identity and suppress duplicate proposals, not distinct sound events.'],
 MISSED_EXPECTED_EVENT:['HIGH','Inspect missing source direction and schema/window capacity before changing the prompt.'],
 WRONG_EVENT_TYPE:['HIGH','Compare transport, cue kind and basis separately; keep STOP/CONTINUE non-executable.'],
 UNSUPPORTED_EXPLICIT_CUE:['HIGH','Require literal evidence for EXPLICIT; route creative options to human review.'],
 BAD_REPLY_SHAPE:['HIGH','Inspect structured response validation; never retry uncertain inference automatically.'],
 MISSING_SOURCE_EVIDENCE:['HIGH','Preserve sourceLineId on non-PLAY observations; do not fabricate a reference.'],
 INCOMPLETE_COVERAGE:['HIGH','Resume distinct unanalysed windows; do not score an incomplete scene as complete.'],
 WRONG_EDIT:['HIGH','Compare requested properties and target identity against an independent expected patch.'],
 UNREQUESTED_MUTATION:['CRITICAL','Limit the candidate operation to requested fields; preserve the complete before snapshot.'],
 INVALID_PLAN:['CRITICAL','Keep plan validation atomic; reject invalid operations before human acceptance.'],
 WRONG_CLARIFICATION:['MEDIUM','Resolve the target from conversation; clarify only when essential evidence is unavailable.'],
 MODEL_TRANSPORT:['CRITICAL','Reject transport operations: model output may never execute GO or STOP.'],
};
const issue=code=>({code,severity:proposals[code]?.[0]??'MEDIUM',
 proposal:proposals[code]?.[1]??'Inspect evidence with an operator before changing the stable version.'});
const emptyMetrics={truePositives:0,falsePositives:0,falseNegatives:0};

export function projectMetaEvents(response){
 if(!response||!Array.isArray(response.proposals)||!Array.isArray(response.proposalDetails)||
    response.proposals.length!==response.proposalDetails.length||!Array.isArray(response.observations))
  throw new TypeError('BAD_REPLY_SHAPE');
 return [...response.proposals.map((proposal,i)=>({
  sourceLineId:proposal.lineId,transport:response.proposalDetails[i].transport,
  cueKind:response.proposalDetails[i].cueKind,basis:response.proposalDetails[i].basis,
 })),...response.observations.map(observation=>({
  sourceLineId:observation.sourceLineId,transport:observation.transport,
  cueKind:observation.cueKind,basis:observation.basis,
 }))];
}

export function evaluateMetaCase(item,response){
 const result={caseId:item.id,provider:'meta',family:item.family,language:item.language,
  difficulty:item.difficulty,split:item.split,inputFingerprint:item.inputFingerprint,
  bilingualPair:item.bilingualPair,
  contractFingerprint:hash(item.expected),
  evaluatorRevision:QUALITY_EVALUATOR_REVISION,scored:false,correct:null,
  failures:[],reviewRequired:false,eventMetrics:null,editCorrect:null,evidence:null};
 if(item.expected.kind==='EVENTS'){
  let events;
  try{events=projectMetaEvents(response);}
  catch{result.failures.push(issue('BAD_REPLY_SHAPE'));return result;}
  if(events.some(e=>!e.sourceLineId)){result.failures.push(issue('MISSING_SOURCE_EVIDENCE'));return result;}
  if(response.coverage?.complete!==true){
   result.failures.push(issue('INCOMPLETE_COVERAGE'));return result;
  }
  try{
   const report=evaluateStageEventCases({version:1,provenance:item.goldStatus,cases:[{
    id:item.id,scriptText:item.input.project.scriptText,expected:item.expected.events,
    forbiddenPlayLineIds:item.expected.forbiddenPlayLineIds,
   }]},{version:1,predictionsByCase:{[item.id]:events}});
   result.eventMetrics=report.summary;
   result.scored=true;
   result.correct=report.summary.falsePositives===0&&report.summary.falseNegatives===0;
   result.failures=report.prioritizedCases[0].issues
    .filter(e=>!['CREATIVE_REVIEW_REQUIRED','SEMANTIC_ALTERNATIVE_REVIEW','SEMANTIC_ALTERNATIVE_ACCEPTED'].includes(e.type))
    .map(e=>({...issue(e.type),lineId:e.lineId}));
   result.reviewRequired=report.summary.creativeAwaitingReview>0;
   result.evidence={events,coverageComplete:true};
  }catch{result.failures.push(issue('BAD_REPLY_SHAPE'));}
  return result;
 }
 if(!response||!['PLAN','ANSWER','CLARIFY'].includes(response.status)||
    !Array.isArray(response.operations)){
  result.failures.push(issue('BAD_REPLY_SHAPE'));return result;
 }
 if(response.operations.some(op=>['GO','STOP','STOP_ALL','EXECUTE_AUDIO'].includes(op.op))){
  result.failures.push(issue('MODEL_TRANSPORT'));return result;
 }
 const expected=item.expected,project=item.input.project;
 result.evidence={status:response.status,operations:response.operations.map(op=>({
  op:op.op,cueId:op.cueId??null,targetCueId:op.targetCueId??null,
  position:op.position??null,afterCueId:op.afterCueId??null,
  fields:Object.entries(op.changes??{}).map(([field,value])=>({field,valueHash:hash(value)})),
 }))};
 if(['NO_PLAN','CLARIFY'].includes(expected.kind)){
  result.scored=true;
  result.correct=response.status!=='PLAN'&&response.operations.length===0&&
   (expected.kind!=='CLARIFY'||response.status==='CLARIFY');
  if(!result.correct)result.failures.push(issue('WRONG_CLARIFICATION'));
  return result;
 }
 if(response.status!=='PLAN'){
  result.scored=true;result.correct=false;result.editCorrect=false;
  result.failures.push(issue('WRONG_EDIT'));return result;
 }
 try{
  const before=JSON.stringify(project),plan=prepareAgentPlan(project,response.operations);
  let requestedCorrect=false,preserved=false;
  if(expected.kind==='CREATE'){
   const lastExistingCueId=project.cues.at(-1)?.id??null;
   requestedCorrect=plan.operations.length===expected.count&&plan.operations.every(op=>
    op.op==='CREATE_CUE'&&(op.afterCueId===null||op.afterCueId===lastExistingCueId));
   preserved=same(plan.proposedProject.cues.slice(0,project.cues.length),project.cues);
   result.reviewRequired=true;
  }else{
   const oracle=prepareAgentPlan(project,expected.operations);
   requestedCorrect=same(plan.operations,oracle.operations);
   const allowed=new Map(expected.operations.filter(op=>op.op==='UPDATE_CUE')
    .map(op=>[op.cueId,new Set(Object.keys(op.changes))]));
   preserved=project.cues.every(cue=>{
    const after=plan.proposedProject.cues.find(c=>c.id===cue.id);
    if(!after)return false;
    const left=structuredClone(cue),right=structuredClone(after);
    // Cue numbers may change only for an explicitly requested reorder.
    if(expected.operations.some(op=>op.op==='REORDER_CUE')){delete left.number;delete right.number;}
    for(const field of allowed.get(cue.id)??[]){
     if(['label','notes','trigger'].includes(field)){delete left[field];delete right[field];}
     else {delete left.playback[field];delete right.playback[field];}
    }
    return same(left,right);
   });
  }
  const applied=commitAgentPlan(project,plan,{editable:true});
  const undo=undoAgentPlan(applied.project,applied.undo,{editable:true});
  const unchanged=before===JSON.stringify(project)&&same(undo,project)&&
   same(plan.proposedProject.assets,project.assets)&&plan.proposedProject.scriptText===project.scriptText;
  result.evidence={...result.evidence,requestedCorrect,preserved,undoExact:unchanged,
   execution:'PURE_LOCAL_PLAN_COMMIT_UNDO_NO_AUDIO'};
  result.scored=true;result.correct=requestedCorrect&&preserved&&unchanged;
  result.editCorrect=result.correct;
  if(!requestedCorrect)result.failures.push(issue('WRONG_EDIT'));
  if(!preserved||!unchanged)result.failures.push(issue('UNREQUESTED_MUTATION'));
 }catch{
  result.scored=true;result.correct=false;result.editCorrect=false;
  result.failures.push(issue('INVALID_PLAN'));
 }
 return result;
}

export function evaluateModalCase(item,metrics){
 const assessment=classifyAudioQuality(metrics,{kind:item.input.kind,
  continuous:item.expected.continuous});
 return {caseId:item.id,provider:'modal',family:item.family,language:item.language,
  difficulty:item.difficulty,split:item.split,inputFingerprint:item.inputFingerprint,
  bilingualPair:item.bilingualPair,
  contractFingerprint:hash(item.expected),alternativeGroup:item.alternativeGroup,
  evaluatorRevision:QUALITY_EVALUATOR_REVISION,scored:true,
  correct:assessment.technicalPass,failures:assessment.failures,
  reviewRequired:true,eventMetrics:null,editCorrect:null,evidence:{metrics,assessment}};
}

function summarize(rows){
 const scored=rows.filter(r=>r.scored&&typeof r.correct==='boolean');
 const counts=rows.filter(r=>r.eventMetrics).reduce((total,row)=>{
  for(const key of Object.keys(total))total[key]+=row.eventMetrics[key];
  return total;
 },{...emptyMetrics});
 const eventSamples=rows.filter(r=>r.eventMetrics).length;
 const p=counts.truePositives+counts.falsePositives?
  counts.truePositives/(counts.truePositives+counts.falsePositives):counts.falseNegatives?0:1;
 const r=counts.truePositives+counts.falseNegatives?
  counts.truePositives/(counts.truePositives+counts.falseNegatives):1;
 const edits=rows.filter(row=>typeof row.editCorrect==='boolean');
 const dimensions={};
 for(const name of ['localization','transport','soundClassification','basis']){
  const samples=rows.filter(row=>row.eventMetrics?.dimensions?.[name]);
  if(!samples.length){dimensions[name]=null;continue;}
  const c=samples.reduce((tot,row)=>{
   for(const key of Object.keys(tot))tot[key]+=row.eventMetrics.dimensions[name][key];
   return tot;
  },{...emptyMetrics});
  const precision=c.truePositives+c.falsePositives?c.truePositives/(c.truePositives+c.falsePositives):
   c.falseNegatives?0:1;
  const recall=c.truePositives+c.falseNegatives?c.truePositives/(c.truePositives+c.falseNegatives):1;
  dimensions[name]={...c,precision,recall,f1:precision+recall?2*precision*recall/(precision+recall):0};
 }
 return {cases:rows.length,scored:scored.length,unscored:rows.length-scored.length,
  failures:rows.filter(row=>row.failures.length).length,
  failedScoredCases:scored.filter(row=>!row.correct).length,
  failureRate:scored.length?scored.filter(row=>!row.correct).length/scored.length:null,
  pendingHumanReview:rows.filter(row=>row.reviewRequired).length,
  precision:eventSamples?p:null,recall:eventSamples?r:null,f1:eventSamples&&p+r?2*p*r/(p+r):eventSamples?0:null,
  eventCounts:eventSamples?counts:null,dimensions,editingSamples:edits.length,
  editCorrectness:edits.length?edits.filter(row=>row.editCorrect).length/edits.length:null};
}

export function qualityReport(rows,{version='stable',evidenceMode='OFFLINE_REPLAY',plannedCases=rows.length}={}){
 const by=key=>Object.fromEntries([...new Set(rows.map(row=>row[key]))].sort()
  .map(value=>[value,summarize(rows.filter(row=>row[key]===value))]));
 const failureCounts={};
 for(const row of rows)for(const failure of row.failures)
  failureCounts[failure.code]=(failureCounts[failure.code]??0)+1;
 const bilingualPairs=new Map();
 for(const row of rows.filter(row=>row.bilingualPair&&row.scored)){
  const key=row.provider+'-'+row.bilingualPair;
  if(!bilingualPairs.has(key))bilingualPairs.set(key,[]);
  bilingualPairs.get(key).push(row);
 }
 const pairs=[...bilingualPairs.values()].filter(pair=>pair.length===2&&
  new Set(pair.map(row=>row.language)).size===2);
 const audioAlternatives=[];
 const lastAlternative=new Map();
 for(const row of rows.filter(row=>row.alternativeGroup&&row.evidence?.metrics)){
  const previous=lastAlternative.get(row.alternativeGroup);
  if(previous)audioAlternatives.push({left:previous.caseId,right:row.caseId,
   basis:'SAME_FAMILY_DIFFERENT_PERSPECTIVE_OR_LANGUAGE',
   ...compareAudioAlternatives(previous.evidence.metrics,row.evidence.metrics)});
  lastAlternative.set(row.alternativeGroup,row);
 }
 return {version:1,candidateVersion:version,evaluatorRevision:QUALITY_EVALUATOR_REVISION,evidenceMode,
  plannedCases,evaluatedCases:rows.length,summary:summarize(rows),
  byProvider:by('provider'),byLanguage:by('language'),byDifficulty:by('difficulty'),
  byFamily:by('family'),bySplit:by('split'),failureCounts,
  bilingualConsistency:{evaluatedPairs:pairs.length,
   outcomeAgreement:pairs.length?pairs.filter(pair=>pair[0].correct===pair[1].correct).length/pairs.length:null,
   semanticLanguageEquivalence:'NOT_MEASURED_BY_OUTCOME_AGREEMENT'},
  audioAlternatives,
  notAutomaticallyEvaluable:['ARTISTIC_SEMANTIC_AUDIO_MATCH','THEATRICAL_ARTISTIC_VALUE',
   'REAL_SPEAKER_OUTPUT','REAL_VOICE_FOLLOWING','PROFESSIONAL_LIVE_CERTIFICATION'],
  rows};
}

export function compareQualityVersions(baseline,candidate){
 if(baseline.evaluatorRevision!==candidate.evaluatorRevision||
    baseline.evidenceMode!==candidate.evidenceMode)
  throw new TypeError('INCOMPARABLE_QUALITY_VERSIONS');
 const old=new Map(baseline.rows.map(row=>[row.inputFingerprint,row]));
 const pairs=candidate.rows.filter(row=>old.has(row.inputFingerprint));
 if(pairs.some(row=>row.contractFingerprint!==old.get(row.inputFingerprint).contractFingerprint))
  throw new TypeError('COMPARISON_GOLD_CONTRACT_CHANGED');
 const sameEvidence=pairs.every(row=>same(old.get(row.inputFingerprint).evidence,row.evidence));
 const regressions=pairs.filter(row=>old.get(row.inputFingerprint).correct===true&&row.correct!==true);
 const improvements=pairs.filter(row=>old.get(row.inputFingerprint).correct===false&&row.correct===true);
 const previous=summarize(pairs.map(row=>old.get(row.inputFingerprint))),current=summarize(pairs);
 const delta={};
 for(const metric of ['precision','recall','f1','editCorrectness','failureRate'])
  delta[metric]=previous[metric]===null||current[metric]===null?null:current[metric]-previous[metric];
 const holdout=pairs.filter(row=>row.split==='holdout').length;
 return {pairedCases:pairs.length,independentHoldoutCases:holdout,
  baselinePairedMetrics:previous,candidatePairedMetrics:current,delta,
  improvements:improvements.map(row=>row.caseId),regressions:regressions.map(row=>row.caseId),
  evidenceReused:sameEvidence,approval:'PENDING_OPERATOR_REVIEW',
  stableAutomaticallyModified:false,
  regressionGate:regressions.length?'BLOCKED':!pairs.length?'INSUFFICIENT_PAIRED_EVIDENCE':
   !holdout?'INSUFFICIENT_HOLDOUT_EVIDENCE':'NO_PAIRED_REGRESSIONS'};
}

export function renderQualityReport(report){
 const number=value=>value===null?'N/A':(value*100).toFixed(1)+'%';
 const out=['# RUNQ quality evidence','',
  `Evidence: ${report.evidenceMode}. Evaluator: ${report.evaluatorRevision}. Version: ${report.candidateVersion}.`,
  `Evaluated ${report.evaluatedCases} of ${report.plannedCases}; HTTP success is NOT quality acceptance.`,
  '',
  '| Group | Scored | Fail % | Precision | Recall | F1 | Edit correctness | Human review |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
 for(const [dimension,groups] of Object.entries({provider:report.byProvider,language:report.byLanguage,
  difficulty:report.byDifficulty,split:report.bySplit,family:report.byFamily}))for(const [name,s] of Object.entries(groups))
  out.push(`| ${dimension}:${name} | ${s.scored} | ${number(s.failureRate)} | ${number(s.precision)} | ${number(s.recall)} | ${number(s.f1)} | ${number(s.editCorrectness)} | ${s.pendingHumanReview} |`);
 out.push('','## Failures and correction proposals');
 for(const [code,count] of Object.entries(report.failureCounts))out.push(`- ${code}: ${count}`);
 for(const row of report.rows.filter(row=>row.failures.length))
  out.push(...row.failures.map(f=>`- ${row.caseId}: ${f.severity} ${f.code}. ${f.proposal}`));
 out.push('','## Not automatically evaluable',...report.notAutomaticallyEvaluable.map(value=>'- '+value));
 return out.join('\n')+'\n';
}
