#!/usr/bin/env node
/**
 * Bounded offline QA summary for Codex. Never reads project scripts,
 * credentials, model bodies, or private audio. Synthetic QA is not model quality.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const VALID_ISSUES = new Set([
  'HALLUCINATED_SOURCE', 'FORBIDDEN_PLAY', 'DUPLICATE_EVENT',
  'WRONG_EVENT_TYPE', 'CREATIVE_REVIEW_REQUIRED',
  'UNSUPPORTED_EXPLICIT_CUE', 'MISSED_EXPECTED_EVENT',
  'SEMANTIC_ALTERNATIVE_REVIEW', 'SEMANTIC_ALTERNATIVE_ACCEPTED',
]);
const HINTS = {
  HALLUCINATED_SOURCE: 'Audit immutable source references.',
  FORBIDDEN_PLAY: 'Check dialogue mentions and practical stage effects.',
  WRONG_EVENT_TYPE: 'Check STOP/CONTINUE/SILENCE, cue kind and explicit basis.',
  MISSED_EXPECTED_EVENT: 'Check coverage and gold labels, then add a regression.',
  UNSUPPORTED_EXPLICIT_CUE: 'Review evidence with an operator.',
  DUPLICATE_EVENT: 'Check repeated cues and continuing ambience.',
  CREATIVE_REVIEW_REQUIRED: 'Human artistic assessment required.',
  SEMANTIC_ALTERNATIVE_REVIEW: 'Review the justified sound-classification alternative with an operator.',
  SEMANTIC_ALTERNATIVE_ACCEPTED: 'Keep the strict score visible and record the human-approved semantic alternative.',
};
function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Invalid QA counter');
  return value;
}
function percent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError('Invalid QA ratio');
  }
  return (value * 100).toFixed(1) + '%';
}
function dimensionSummary(metric,prefix){
  if(!metric||typeof metric!=='object')throw new TypeError('Missing QA dimension');
  return {
    [prefix+'Precision']:percent(metric.precision),
    [prefix+'Recall']:percent(metric.recall),
    [prefix+'F1']:percent(metric.f1),
  };
}
export function buildCodexQaSummary(report) {
  if (!report || report.mode !== 'OFFLINE_HUMAN_GOLD_COMPARISON' ||
      report.modelQualityMeasured !== false || !report.summary ||
      !Array.isArray(report.prioritizedCases) || report.prioritizedCases.length > 100) {
    throw new TypeError('Expected an offline non-model QA report');
  }
  const s = report.summary;
  const dimensions=s.dimensions;
  const summary = {
    cases: count(s.cases),
    expectedEvents: count(s.expectedEvents),
    falseNegatives: count(s.falseNegatives),
    falsePositives: count(s.falsePositives),
    forbiddenPlay: count(s.forbiddenPlay),
    invalidReferences: count(s.invalidReferences),
    duplicates: count(s.duplicates),
    creativeAwaitingReview: count(s.creativeAwaitingReview),
    semanticAlternativesPending: count(s.semanticAlternativesPending??0),
    semanticAlternativesApproved: count(s.semanticAlternativesApproved??0),
    precision: percent(s.precision),
    recall: percent(s.recall),
    f1: percent(s.f1),
    ...dimensionSummary(dimensions?.localization,'localization'),
    ...dimensionSummary(dimensions?.transport,'transport'),
    ...dimensionSummary(dimensions?.soundClassification,'soundClassification'),
    ...dimensionSummary(dimensions?.basis,'basis'),
  };
  const findings = [];
  for (const entry of report.prioritizedCases) {
    if (!entry || typeof entry.id !== 'string' ||
        !/^[a-z0-9][a-z0-9-]{0,80}$/.test(entry.id) ||
        !Array.isArray(entry.issues) || entry.issues.length > 128) {
      throw new TypeError('Invalid QA case');
    }
    for (const issue of entry.issues) {
      if (!issue || !VALID_ISSUES.has(issue.type) ||
          typeof issue.lineId !== 'string' || !/^L[1-9]\d*$/.test(issue.lineId)) {
        throw new TypeError('Invalid QA issue');
      }
      findings.push({caseId:entry.id,lineId:issue.lineId,type:issue.type});
    }
  }
  const prioritizedIssues = findings.slice(0,20).map(item=>({
    ...item, nextTest: HINTS[item.type],
  }));
  const meta = {
    kind:'CODEX_OFFLINE_QA',
    status:'SYNTHETIC_QA_PIPELINE_ONLY',
    modelQualityMeasured:false,
    predictionsAreIllustrative:true,
    runnableWithoutSecrets:true,
    summary,
    prioritizedIssues,
    remainingIssues:findings.length-prioritizedIssues.length,
  };
  const lines = [
    '# RunQ — Codex automated QA report',
    '',
    'WARNING: Hand-authored synthetic predictions only; not a measurement of Muse or Meta quality.',
    '',
    '| Fixture metric | Value |',
    '| --- | ---: |',
  ];
  for (const [key,value] of Object.entries(summary)) {
    lines.push('| '+key+' | '+value+' |');
  }
  lines.push('', '## Synthetic QA leads (not model failures)', '');
  for (const item of prioritizedIssues) {
    lines.push('- '+item.caseId+' / '+item.lineId+' : '+item.type+' — '+item.nextTest);
  }
  if (!prioritizedIssues.length) lines.push('- No synthetic issues.');
  lines.push('', '## Codex work contract', '',
    '1. Reproduce one technical problem with a failing offline regression test.',
    '2. Change one variable only; preserve human review and deterministic GO/STOP.',
    '3. Run npm run qa:codex and inspect artifacts/cue-qa/report.md.',
    '4. Require Chrome smoke and human acceptance before integration.',
    '5. Never spend provider credits, inspect credentials, publish private scripts or merge automatically.', '');
  return {meta,markdown:lines.join('\n')};
}
function summarizeHumanArtisticFeedback(feedback){
  if(!feedback||feedback.schema!=='runq-human-artistic-feedback-v1'||
     typeof feedback.sourceBatteryId!=='string'||
     typeof feedback.reviewedAt!=='string'||!Number.isFinite(Date.parse(feedback.reviewedAt))||
     typeof feedback.provenance!=='string'||typeof feedback.sourceCapture!=='string'||
     typeof feedback.sourceReport!=='string'||!Array.isArray(feedback.feedback)||
     feedback.feedback.length<1||feedback.feedback.length>100||
     !Array.isArray(feedback.findings)||!feedback.evidenceReconciliation||
     !feedback.promptComparison)throw new TypeError('Invalid human artistic feedback');
  const allowedDecisions=new Set(['accept','modify','reject']);
  const seen=new Set();
  for(const entry of feedback.feedback){
    if(!entry||typeof entry.equivalentToHistoricalCase!=='string'||
       !/^paid-\d{4}$/.test(entry.equivalentToHistoricalCase)||
       typeof entry.caseFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(entry.caseFingerprint)||
       typeof entry.requestId!=='string'||!entry.requestId||
       !['en','es'].includes(entry.language)||
       !Number.isInteger(entry.rating)||entry.rating<1||entry.rating>5||
       !allowedDecisions.has(entry.decision)||typeof entry.comments!=='string'||
       seen.has(entry.equivalentToHistoricalCase))throw new TypeError('Invalid human artistic rating');
    seen.add(entry.equivalentToHistoricalCase);
  }
  const counts={
    reviewCount:feedback.feedback.length,
    meanRating:Number((feedback.feedback.reduce((sum,item)=>sum+item.rating,0)/
      feedback.feedback.length).toFixed(2)),
    accepted:feedback.feedback.filter(item=>item.decision==='accept').length,
    modify:feedback.feedback.filter(item=>item.decision==='modify').length,
    rejected:feedback.feedback.filter(item=>item.decision==='reject').length,
  };
  for(const [key,value] of Object.entries(counts)){
    if(feedback.aggregate?.[key]!==value)throw new TypeError('Human artistic aggregate mismatch');
  }
  if(typeof feedback.evidenceReconciliation.status!=='string'||
     !/^[A-Z0-9_]+$/.test(feedback.evidenceReconciliation.status)||
     typeof feedback.evidenceReconciliation.conclusion!=='string'||
     typeof feedback.promptComparison.previousVersion!=='string'||
     typeof feedback.promptComparison.currentVersion!=='string'||
     typeof feedback.promptComparison.liveOutputComparison!=='string'||
     feedback.findings.some(item=>!item||typeof item.caseId!=='string'||
       typeof item.line!=='string'||typeof item.type!=='string'))
    throw new TypeError('Invalid human artistic evidence');
  return {
    kind:'HUMAN_ARTISTIC_REVIEW',
    sourceBatteryId:feedback.sourceBatteryId,
    reviewedAt:feedback.reviewedAt,
    provenance:feedback.provenance,
    sourceCapture:feedback.sourceCapture,
    sourceReport:feedback.sourceReport,
    ...counts,
    evaluations:feedback.feedback.map(item=>({
      caseId:item.equivalentToHistoricalCase,
      caseFingerprint:item.caseFingerprint,
      requestId:item.requestId,
      category:item.category,
      language:item.language,
      rating:item.rating,
      decision:item.decision,
      comments:item.comments,
    })),
    findings:feedback.findings.map(item=>({
      caseId:item.caseId,lineId:item.line,status:feedback.evidenceReconciliation.status,
    })),
    promptComparison:feedback.promptComparison,
  };
}
export function buildCodexQaSummaryWithHumanFeedback(report,feedback){
  const result=buildCodexQaSummary(report);
  const human=summarizeHumanArtisticFeedback(feedback);
  result.meta.humanArtisticFeedback=human;
  const lines=result.markdown.split('\n');
  const insertAt=lines.indexOf('## Codex work contract');
  if(insertAt<0)throw new TypeError('Missing Codex QA report section');
  lines.splice(insertAt,0,
    '## Human artistic feedback (separate from automatic QA)','',
    '- Source battery: '+human.sourceBatteryId+'; reviewed '+human.reviewedAt+'.',
    '- '+human.reviewCount+' human ratings; mean '+human.meanRating+'/5 ('+
      human.accepted+' accepted, '+human.modify+' modify, '+human.rejected+' rejected).',
    '- Human ratings are not model-accuracy measurements and are not included in automatic fixture metrics.',
    '',
    '| Human case | Language | Rating | Decision | Review request |',
    '| --- | --- | ---: | --- | --- |',
    ...human.evaluations.map(item=>'| '+item.caseId+' | '+item.language+' | '+
      item.rating+'/5 | '+item.decision+' | '+item.requestId+' |'),
    '',
    '- Evidence reconciliation: '+human.findings.map(item=>
      item.caseId+' / '+item.lineId+' — '+item.status).join('; '),
    '- Prompt comparison: '+human.promptComparison.previousVersion+' → '+
      human.promptComparison.currentVersion+'; live output comparison: '+
      human.promptComparison.liveOutputComparison+' (no new paid requests).',
    '- '+feedback.evidenceReconciliation.conclusion,
    '- Provenance: '+feedback.provenance,
    '- Source capture: '+feedback.sourceCapture+'.',
    '- Source report: '+feedback.sourceReport+'.',
    '');
  result.markdown=lines.join('\n');
  return result;
}
export async function generateCodexQaSummary(root=process.cwd()) {
  const raw=await readFile(join(root,'artifacts','cue-qa','report.json'),'utf8');
  if (raw.length>1024*1024) throw new RangeError('QA report too large');
  const feedbackRaw=await readFile(join(root,'fixtures','qa','artistic-feedback-2026-10-31.json'),'utf8');
  if(feedbackRaw.length>256*1024)throw new RangeError('Human artistic feedback too large');
  const result=buildCodexQaSummaryWithHumanFeedback(JSON.parse(raw),JSON.parse(feedbackRaw));
  const dir=join(root,'artifacts','codex-qa');
  await mkdir(dir,{recursive:true});
  await Promise.all([
    writeFile(join(dir,'summary.json'),JSON.stringify(result.meta,null,2)+'\n','utf8'),
    writeFile(join(dir,'summary.md'),result.markdown,'utf8'),
  ]);
  return result;
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const output=await generateCodexQaSummary();
    console.log('Codex offline synthetic QA: '+output.meta.summary.cases+' fixture cases.');
    console.log('artifacts/codex-qa/summary.md and summary.json. No provider calls.');
  } catch(error) {
    console.error('Codex QA summary failed: '+(error instanceof Error?error.message:'unknown'));
    process.exitCode=1;
  }
}
