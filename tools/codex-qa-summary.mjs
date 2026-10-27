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
]);
const HINTS = {
  HALLUCINATED_SOURCE: 'Audit immutable source references.',
  FORBIDDEN_PLAY: 'Check dialogue mentions and practical stage effects.',
  WRONG_EVENT_TYPE: 'Check STOP/CONTINUE/SILENCE, cue kind and explicit basis.',
  MISSED_EXPECTED_EVENT: 'Check coverage and gold labels, then add a regression.',
  UNSUPPORTED_EXPLICIT_CUE: 'Review evidence with an operator.',
  DUPLICATE_EVENT: 'Check repeated cues and continuing ambience.',
  CREATIVE_REVIEW_REQUIRED: 'Human artistic assessment required.',
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

/**
 * Attach real deterministic scenario-coverage measurements without reading
 * scripts or attributing synthetic proposals to Meta. This summarizes the
 * independent reviewer and current schema capacity, not model quality.
 */
export function summarizeOriginalStageCorpus(data) {
  if (!data || data.mode!=='SYNTHETIC_CONTRACT_REPLAY_NOT_META_INFERENCE' ||
      data.modelQualityMeasured!==false || !data.totals ||
      !Array.isArray(data.checks) || data.checks.length>30 ||
      !Array.isArray(data.failures)) {
    throw new TypeError('Invalid original-stage QA report');
  }
  const raw=data.totals;
  const metrics={
    scenarios:count(data.sourceFiles),
    sourceLines:count(raw.lines),
    goldEvents:count(raw.expectedEvents),
    reviewDetected:count(raw.verifierDetected),
    reviewMissed:count(raw.verifierMissed),
    reviewerFalseFlags:count(raw.verifierFalseFlags),
    schemaOverflow:count(raw.capacityExcess),
  };
  if (metrics.reviewDetected+metrics.reviewMissed!==metrics.goldEvents ||
      metrics.scenarios!==data.checks.length) {
    throw new TypeError('Inconsistent original-stage QA totals');
  }
  const leads=[];
  for(const item of data.checks){
    if(!item || typeof item.id!=='string' ||
      !/^[a-z0-9][a-z0-9-]{1,80}$/.test(item.id) ||
      !Array.isArray(item.windows) || item.windows.length>100) {
      throw new TypeError('Invalid original stage scenario');
    }
    for(const w of item.windows){
      if(!w || typeof w.id!=='string' ||
        !/^S[1-9]\d*-W[1-9]\d*$/.test(w.id)) {
        throw new TypeError('Invalid original stage window ID');
      }
      for(const k of ['verifierMissing','verifierFalseFlags','capacityExcess']){
        count(w[k]);
      }
      if(w.verifierMissing>0)leads.push({
        scenario:item.id,window:w.id,type:'HEURISTIC_MISSED_GOLD',
        count:w.verifierMissing,priority:10*w.verifierMissing,
      });
      if(w.verifierFalseFlags>0)leads.push({
        scenario:item.id,window:w.id,type:'HEURISTIC_FALSE_FLAG',
        count:w.verifierFalseFlags,priority:8*w.verifierFalseFlags,
      });
      if(w.capacityExcess>0)leads.push({
        scenario:item.id,window:w.id,type:'SCHEMA_CAPACITY_OVERFLOW',
        count:w.capacityExcess,priority:7*w.capacityExcess,
      });
    }
  }
  leads.sort((a,b)=>b.priority-a.priority||a.scenario.localeCompare(b.scenario)||a.window.localeCompare(b.window));
  return {kind:'ORIGINAL_STAGE_DETERMINISTIC_QA',modelQualityMeasured:false,metrics,
    prioritizedLeads:leads.slice(0,15),moreLeads:Math.max(0,leads.length-15)};
}

export function buildCodexQaSummary(report, stageReport = undefined) {
  if (!report || report.mode !== 'OFFLINE_HUMAN_GOLD_COMPARISON' ||
      report.modelQualityMeasured !== false || !report.summary ||
      !Array.isArray(report.prioritizedCases) || report.prioritizedCases.length > 100) {
    throw new TypeError('Expected an offline non-model QA report');
  }
  const s = report.summary;
  const summary = {
    cases: count(s.cases),
    expectedEvents: count(s.expectedEvents),
    falseNegatives: count(s.falseNegatives),
    falsePositives: count(s.falsePositives),
    forbiddenPlay: count(s.forbiddenPlay),
    invalidReferences: count(s.invalidReferences),
    duplicates: count(s.duplicates),
    creativeAwaitingReview: count(s.creativeAwaitingReview),
    precision: percent(s.precision),
    recall: percent(s.recall),
    f1: percent(s.f1),
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
  const originalStage = stageReport === undefined ? undefined : summarizeOriginalStageCorpus(stageReport);
  const meta = {
    kind:'CODEX_OFFLINE_QA',
    status:'SYNTHETIC_QA_PIPELINE_ONLY',
    modelQualityMeasured:false,
    predictionsAreIllustrative:true,
    runnableWithoutSecrets:true,
    summary,
    prioritizedIssues,
    remainingIssues:findings.length-prioritizedIssues.length,
    ...(originalStage===undefined?{}:{originalStage}),
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
  if (originalStage){
    const m=originalStage.metrics;
    lines.push('', '## Original stage scripts — deterministic measurements (NOT Meta accuracy)', '',
      '- Original test scripts: '+m.scenarios+'; source lines: '+m.sourceLines+'; mandatory gold events: '+m.goldEvents+'.',
      '- Independent acoustic reviewer: '+m.reviewDetected+' detected, '+m.reviewMissed+' missed gold instructions, '+m.reviewerFalseFlags+' flags outside mandatory gold.',
      '- Strict 8-event schema ceiling: '+m.schemaOverflow+' required events not representable in a single response.',
      '', '### Highest-impact measured follow-ups', '');
    for(const item of originalStage.prioritizedLeads){
      lines.push('- '+item.scenario+' / '+item.window+' : '+item.type+' (count '+item.count+').');
    }
    if(originalStage.moreLeads)lines.push('- '+originalStage.moreLeads+' additional measured leads in original script report.');
  }
  lines.push('', '## Codex work contract', '',
    '1. Reproduce one technical problem with a failing offline regression test.',
    '2. Review the original-stage measured heuristic misses before touching model prompts. Change one variable only; preserve human review and deterministic GO/STOP.',
    '3. Run npm run qa:codex and inspect artifacts/cue-qa/report.md.',
    '4. Require Chrome smoke and human acceptance before integration.',
    '5. Never spend provider credits, inspect credentials, publish private scripts or merge automatically.', '');
  return {meta,markdown:lines.join('\n')};
}
export async function generateCodexQaSummary(root=process.cwd()) {
  const raw=await readFile(join(root,'artifacts','cue-qa','report.json'),'utf8');
  if (raw.length>1024*1024) throw new RangeError('QA report too large');
  const originalRaw=await readFile(join(root,'artifacts','stage-script-qa','report.json'),'utf8');
  if(originalRaw.length>2*1024*1024)throw new RangeError('Original stage report too large');
  const result=buildCodexQaSummary(JSON.parse(raw),JSON.parse(originalRaw));
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
