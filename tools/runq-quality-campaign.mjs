import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {globalLedgerDefaultPath} from '../src/qa/globalSpendLedger.mjs';
import {buildQualityMatrix} from '../src/qa/qualityMatrix.mjs';
import {measurePilotWav} from './runq-modal-live-batch.mjs';
import {evaluateModalCase,qualityReport,renderQualityReport,compareQualityVersions} from '../src/qa/qualityEvaluation.mjs';
import {compareAudioAlternatives} from '../src/qa/audioQuality.mjs';
import {qualityPhases,runQualityCampaign,readQualityJson,saveQualityJson,
 STABLE_QUALITY_CANDIDATE,validateQualityCandidate} from './qualityCampaign.mjs';
import {AGENT_REPORT_FILE,reviewSavedAgentEvidence} from './agentEvidenceReview.mjs';
import {getAgentEvaluationCorpus} from './runq-agent-live-eval.mjs';

export function parseQualityOptions(argv){
 const options={id:'runq-quality-v1',origin:'http://127.0.0.1:5191'};
 const seen=new Set();
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];
  if(seen.has(flag))throw new Error('DUPLICATE_QUALITY_OPTION');seen.add(flag);
  const boolean={'--live':'live','--ack-paid':'ackPaid',
   '--resume':'resume','--continuous':'continuous','--evaluate-history':'evaluateHistory','--status':'status'};
  if(boolean[flag]){options[boolean[flag]]=true;continue;}
  const string={'--id':'id','--origin':'origin','--phase':'phase','--candidate':'candidateFile',
   '--baseline-report':'baselineFile','--candidate-report':'candidateReportFile',
   '--new-candidate':'newCandidate','--design-mode':'designMode','--agent-suffix':'agentSuffix'};
  if(!string[flag]||!argv[i+1]||argv[i+1].startsWith('--'))throw new Error('INVALID_QUALITY_OPTION');
  options[string[flag]]=argv[++i];
 }
 if((options.live===true)!==(options.ackPaid===true)||
    options.evaluateHistory&&options.live||options.status&&options.live||options.newCandidate&&options.live)
  throw new Error('OPERATOR_PAID_AND_OWNER_ATTESTATION_REQUIRED');
 return options;
}

async function optionalDirectory(path){
 try{return await readdir(path,{withFileTypes:true});}
 catch(error){if(error.code==='ENOENT')return [];throw error;}
}

export async function evaluateSavedQualityHistory({
 jobDirectory=join(dirname(globalLedgerDefaultPath()),'shared-modal-jobs-v1'),
 agentDirectory=resolve('artifacts','agent-live-eval'),
 systematicDirectory=resolve('artifacts','systematic-eval'),
 outputDirectory=resolve('.runq-local','quality-campaign'),
}={}){
 const rows=[],oldFailures=[],integrityErrors=[],technicalFacts=[],duplicateWavs=[];
 const seenWavs=new Map();
 const jobs=(await optionalDirectory(jobDirectory)).filter(f=>/^job-[a-f0-9]{64}\.json$/.test(f.name));
 for(const file of jobs){
  const path=join(jobDirectory,file.name),bytes=await readFile(path);
  const job=JSON.parse(bytes.toString('utf8'));
  if(!['READY_FOR_REVIEW','ACCEPTED_FOR_MANUAL_IMPORT','REJECTED'].includes(job.status))continue;
  const digest=createHash('sha256').update(job.requestId).digest('hex');
  try{
   const wav=await readFile(join(jobDirectory,'wav-'+digest+'.wav'));
   const metrics=measurePilotWav(wav,job.durationSeconds);
   if(metrics.sha256!==job.wav?.sha256)throw new Error('SAVED_AUDIO_HASH_MISMATCH');
   if(seenWavs.has(metrics.sha256)){
    duplicateWavs.push({caseId:job.requestId,duplicateOf:seenWavs.get(metrics.sha256),wavSha256:metrics.sha256});
    continue;
   }
   seenWavs.set(metrics.sha256,job.requestId);
   const item={id:job.requestId,inputFingerprint:metrics.sha256,provider:'modal',
    family:job.kind==='ENVIRONMENT'?'environment':'one-shot',
    language:/\b(?:una|un|sin|ambiente|trueno)\b/i.test(job.prompt)?'es':'en',
    difficulty:'HISTORICAL_NOT_LABELLED',split:job.requestId.startsWith('qa-campaign-')?'diagnostic':'independent-historical',
    input:{kind:job.kind},expected:{continuous:job.kind==='ENVIRONMENT'}};
   rows.push(evaluateModalCase(item,metrics));
   // Reconstruct the existing pilot silence/length checks, NOT an HTTP-only baseline.
   const legacyFailed=metrics.suspectedWholeFileSilence||!metrics.durationMatches;
   if(legacyFailed)oldFailures.push(job.requestId);
   technicalFacts.push({caseId:job.requestId,requestCreatedAt:job.createdAt,status:job.status,
    journalSha256:createHash('sha256').update(bytes).digest('hex'),wavSha256:metrics.sha256,
    baselineFlagged:legacyFailed,candidateFlagged:rows.at(-1).failures.length>0});
  }catch(error){
   integrityErrors.push({caseId:job.requestId,code:error.message==='SAVED_AUDIO_HASH_MISMATCH'?
    error.message:'SAVED_AUDIO_UNAVAILABLE_OR_INVALID'});
  }
 }
 const realAgentReports=[];
 for(const file of (await optionalDirectory(agentDirectory)).filter(f=>AGENT_REPORT_FILE.test(f.name))){
  const bytes=await readFile(join(agentDirectory,file.name)),report=JSON.parse(bytes.toString('utf8'));
  if(report.realProviderEvaluations!==true)continue;
  const typedEventsReevaluable=report.results?.some(row=>Array.isArray(row.quality?.evidence?.events))??false;
  realAgentReports.push({file:file.name,evidenceSha256:createHash('sha256').update(bytes).digest('hex'),
   reportedProviderMetrics:report.providerMetrics,attemptedRequests:report.attemptedRequests,
   retainedOperationValues:false,sourceReferencesReevaluable:typedEventsReevaluable,unrequestedPropertyPreservationReevaluable:false,
   limitation:typedEventsReevaluable?'PARTIAL_TYPED_EVENT_AND_HASHED_OPERATION_REPLAY':
    'DERIVED_LEGACY_METRICS_ONLY_NO_NEW_INFERENCES_OR_RESCORING'});
 }
 const agentReplay=await reviewSavedAgentEvidence({directory:agentDirectory,corpus:getAgentEvaluationCorpus()});
 let dryRunReports=0,realEventReports=0;
 for(const folder of (await optionalDirectory(systematicDirectory)).filter(f=>f.isDirectory())){
  for(const child of (await optionalDirectory(join(systematicDirectory,folder.name))).filter(f=>f.isDirectory())){
   const report=await readQualityJson(join(systematicDirectory,folder.name,child.name,'report.json'));
   if(!report)continue;
   if(report.realInferenceExecuted===true)realEventReports++;else dryRunReports++;
  }
 }
 const report=qualityReport(rows,{version:'pcm-quality-v2',evidenceMode:'SAVED_REAL_MODAL_WAV_REPLAY',plannedCases:100});
 report.historicalEvidence={realAgentReports,agentReplay,realEventReports,dryRunReportsExcluded:dryRunReports,
  integrityErrors,technicalFacts,duplicateWavs,recordedJournalJobs:jobs.length,
  distinctWavsScored:rows.length,
  improvement:{baseline:'EXISTING_PILOT_SILENCE_AND_DURATION_FLAGS',
   baselineFlagged:oldFailures.length,candidateFlagged:rows.filter(r=>r.failures.length).length,
   additionalDetectedCases:rows.filter(r=>r.failures.length&&!oldFailures.includes(r.caseId)).map(r=>r.caseId),
   measurement:'QUALITY_CONTROL_DETECTION_COVERAGE_NOT_MODEL_ACCURACY_GAIN',
   independentAdditionalDetectedCases:rows.filter(r=>r.split==='independent-historical'&&
    r.failures.length&&!oldFailures.includes(r.caseId)).map(r=>r.caseId),
   originalWavsModified:false,newProviderRequests:0}};
 report.alternatives=[];
 const groups=new Map();
 for(const row of rows){
  if(!groups.has(row.family))groups.set(row.family,[]);
  groups.get(row.family).push(row);
 }
 for(const group of groups.values())for(let i=1;i<group.length;i++)
  report.alternatives.push({left:group[i-1].caseId,right:group[i].caseId,
   comparableBriefs:false,note:'HISTORICAL_DIFFERENT_BRIEFS_TECHNICAL_COMPARISON_ONLY',
   ...compareAudioAlternatives(group[i-1].evidence.metrics,group[i].evidence.metrics)});
 await mkdir(outputDirectory,{recursive:true,mode:0o700});
 await saveQualityJson(join(outputDirectory,'historical-quality.json'),report);
 const detail=JSON.stringify(report.historicalEvidence.improvement,null,2);
 await writeFile(join(outputDirectory,'historical-quality.md'),
  renderQualityReport(report)+'\n## Measured detection change (same original WAVs)\n\n'+detail+
  '\n\nLegacy agent evidence: '+realAgentReports.length+' real report(s). '+
  dryRunReports+' systematic dry-run reports excluded from real provider counts.\n',{mode:0o600});
 return report;
}

export async function qualityCli(argv){
 const options=parseQualityOptions(argv);
 const output=resolve('.runq-local','quality-campaign');
 if(options.newCandidate){
  const candidate=validateQualityCandidate({
   ...STABLE_QUALITY_CANDIDATE,id:options.newCandidate,
   designMode:options.designMode??'literal',agentSuffix:options.agentSuffix??'',
  });
  const file=join(output,'candidate-'+candidate.id+'.json');
  await saveQualityJson(file,candidate,{exclusive:true});
  return {candidateFile:file,approval:'PENDING_OPERATOR_REVIEW',stableAutomaticallyModified:false};
 }
 if(options.evaluateHistory){
  const report=await evaluateSavedQualityHistory();
  return {evidence:report.evidenceMode,summary:report.summary,
   improvement:report.historicalEvidence.improvement,
   history:report.historicalEvidence.realAgentReports,
   dryRunReportsExcluded:report.historicalEvidence.dryRunReportsExcluded};
 }
 if(options.baselineFile||options.candidateReportFile){
  if(!options.baselineFile||!options.candidateReportFile)throw new Error('BOTH_PAIRED_REPORTS_REQUIRED');
  const comparison=compareQualityVersions(
   await readQualityJson(options.baselineFile),await readQualityJson(options.candidateReportFile));
  await saveQualityJson(join(output,'version-comparison.json'),comparison);
  return comparison;
 }
 let candidate=STABLE_QUALITY_CANDIDATE;
 if(options.candidateFile)candidate=validateQualityCandidate(await readQualityJson(options.candidateFile));
 const matrix=buildQualityMatrix();
 if(options.status){
  const file=join(dirname(globalLedgerDefaultPath()),'quality-history-v1',options.id+'-'+candidate.id+'.json');
  const state=await readQualityJson(file);
  if(!state)throw new Error('NO_QUALITY_CAMPAIGN_STATE');
  return {id:state.id,scored:state.results.length,stopReason:state.stopReason,completedPhases:state.completedPhases};
 }
 if(!options.live){
  const phases=qualityPhases(matrix).map(phase=>({
   id:phase.id,cases:phase.cases.length,providers:[...new Set(phase.cases.map(c=>c.provider))]}));
  await saveQualityJson(join(output,'matrix.json'),matrix);
  await saveQualityJson(join(output,'plan.json'),{
   version:1,corpusHash:matrix.corpusHash,counts:matrix.counts,phases,
   candidate,providerRequests:0,
   liveGate:'OWNER_ATTESTATION_WITH_SHARED_LEDGER_AND_CLEAN_COMMIT_CONTROLS'});
  return {mode:'DRY_RUN_NO_PROVIDER_REQUESTS',counts:matrix.counts,phases,
   estimatedConservativeMaximumUsd:{meta:60,modal:5},
   note:'Existing historical reservations still reduce provider/global balances.'};
 }
 const state=await runQualityCampaign(options,{candidate});
 return {id:state.id,scored:state.results.length,stopReason:state.stopReason,
  completedPhases:state.completedPhases,artisticReview:'PENDING_HUMAN_REVIEW'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await qualityCli(process.argv.slice(2)),null,2));}
 catch(error){
  const code=/^[A-Z][A-Z0-9_]{1,100}$/.test(error.message??'')?error.message:'QUALITY_LOCAL_IO_OR_VALIDATION_FAILURE';
  console.error(code+'; no automatic retry or stable modification.');process.exitCode=1;
 }
}
