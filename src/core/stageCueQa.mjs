/**
 * Offline cue event evaluator for original/human-reviewed fixtures.
 * Exact (lineId, transport, cueKind, basis) comparisons.
 * Suggestions not in gold require human artistic review rather than being
 * incorrectly scored as mandatory script requirements.
 *
 * No provider, no keys, no audio transport, and no project mutations.
 */
import { parseScript } from './script.mjs';

const TRANSPORT = new Set(['PLAY','STOP','CONTINUE','SILENCE']);
const KINDS = new Set(['FX','AMBIENCE','MUSIC','VOICE','SILENCE','TRANSITION']);
const BASES = new Set(['EXPLICIT','SUGGESTED']);
const LID = /^L[1-9]\d*$/;
const MAX_CASES = 100;
const MAX_EVENTS = 128;

function validEvent(raw, field) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Invalid ' + field);
  const lineId = raw.sourceLineId ?? raw.lineId;
  const { transport, cueKind, basis } = raw;
  if (typeof lineId !== 'string' || !LID.test(lineId) ||
      !TRANSPORT.has(transport) || !KINDS.has(cueKind) || !BASES.has(basis) ||
      (transport === 'SILENCE') !== (cueKind === 'SILENCE')) {
    throw new TypeError('Invalid ' + field);
  }
  return { lineId, transport, cueKind, basis };
}
function key(e) { return [e.lineId,e.transport,e.cueKind,e.basis].join('|'); }
function boundedArray(a, max, name) {
  if (!Array.isArray(a) || a.length > max) throw new TypeError('Invalid ' + name);
  return a;
}

export function evaluateStageEventCases(gold, predictions) {
  if (!gold || gold.version !== 1 || !Array.isArray(gold.cases) ||
      gold.cases.length < 1 || gold.cases.length > MAX_CASES ||
      !predictions || predictions.version !== 1 ||
      !predictions.predictionsByCase || typeof predictions.predictionsByCase !== 'object' ||
      Array.isArray(predictions.predictionsByCase)) {
    throw new TypeError('Invalid event benchmark format');
  }
  const known = new Set();
  for (const item of gold.cases) {
    if (!item || typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(item.id) ||
        known.has(item.id) || typeof item.scriptText !== 'string' ||
        item.scriptText.length > 100_000) {
      throw new TypeError('Invalid gold case metadata');
    }
    known.add(item.id);
  }
  if (Object.keys(predictions.predictionsByCase).some(id => !known.has(id))) {
    throw new TypeError('Prediction references unknown case');
  }

  const cases = [];
  const totals = {
    cases:gold.cases.length,expectedEvents:0,evaluatedPredictions:0,
    truePositives:0,falsePositives:0,falseNegatives:0,
    forbiddenPlay:0,invalidReferences:0,duplicates:0,
    creativeAwaitingReview:0,wrongAction:0,
  };
  for (const sample of gold.cases) {
    const lines = new Set(parseScript(sample.scriptText).map(line => line.id));
    const expected = boundedArray(sample.expected,MAX_EVENTS,'expected').map(e=>validEvent(e,'expected'));
    const predicted = boundedArray(predictions.predictionsByCase[sample.id] ?? [],MAX_EVENTS,'predictions').map(e=>validEvent(e,'prediction'));
    const forbidden = boundedArray(sample.forbiddenPlayLineIds ?? [],MAX_EVENTS,'forbiddenPlayLineIds');
    if (forbidden.some(line => typeof line !== 'string' || !lines.has(line))) {
      throw new RangeError('Forbidden cue line outside gold script');
    }
    const forbiddenSet = new Set(forbidden);
    const expectedKeys = new Set(expected.map(key));
    if (expected.some(e=>!lines.has(e.lineId)) || expectedKeys.size!==expected.length ||
        expected.some(e=>e.transport==='PLAY' && forbiddenSet.has(e.lineId))) {
      throw new RangeError('Inconsistent human-reviewed gold events');
    }

    const seen = new Set();
    const matched = new Set();
    const issues = [];
    let fp=0, invalidReferences=0, forbiddenPlay=0, duplicate=0, creative=0, wrongAction=0;
    let scoredPredictions=0;
    for (const event of predicted) {
      const id = key(event);
      if (!lines.has(event.lineId)) {
        invalidReferences++; fp++; scoredPredictions++;
        issues.push({type:'HALLUCINATED_SOURCE',lineId:event.lineId});
      } else if (event.transport==='PLAY' && forbiddenSet.has(event.lineId)) {
        forbiddenPlay++; fp++; scoredPredictions++;
        issues.push({type:'FORBIDDEN_PLAY',lineId:event.lineId});
      } else if (seen.has(id)) {
        duplicate++; fp++; scoredPredictions++;
        issues.push({type:'DUPLICATE_EVENT',lineId:event.lineId});
      } else if (expectedKeys.has(id)) {
        matched.add(id);
        scoredPredictions++;
      } else if (event.basis==='SUGGESTED' && expected.some(x=>x.lineId===event.lineId)) {
        // An explicit required action cannot be hidden from QA by relabeling
        // the prediction as an optional creative treatment.
        fp++; scoredPredictions++; wrongAction++;
        issues.push({type:'WRONG_EVENT_TYPE',lineId:event.lineId});
      } else if (event.basis==='SUGGESTED') {
        creative++;
        issues.push({type:'CREATIVE_REVIEW_REQUIRED',lineId:event.lineId});
      } else {
        fp++; scoredPredictions++;
        const isAtGoldLine=expected.some(x=>x.lineId===event.lineId);
        if(isAtGoldLine)wrongAction++;
        issues.push({type:isAtGoldLine?'WRONG_EVENT_TYPE':'UNSUPPORTED_EXPLICIT_CUE',lineId:event.lineId});
      }
      seen.add(id);
    }
    for (const event of expected) {
      if (!matched.has(key(event))) issues.push({type:'MISSED_EXPECTED_EVENT',lineId:event.lineId,transport:event.transport});
    }
    const tp=matched.size;
    const fn=expected.length-tp;
    const severity=invalidReferences*4+forbiddenPlay*3+wrongAction*3+fn*2+fp+duplicate;
    const result={
      id:sample.id,
      showType:sample.type ?? 'other',
      documentKind:sample.documentKind ?? 'other',
      expectedEvents:expected.length,
      predictions:predicted.length,
      truePositives:tp,falsePositives:fp,falseNegatives:fn,
      invalidReferences,forbiddenPlay,duplicates:duplicate,wrongAction,
      creativeAwaitingReview:creative,priorityScore:severity,
      issues,
    };
    cases.push(result);
    totals.expectedEvents+=expected.length;
    totals.evaluatedPredictions+=scoredPredictions;
    for (const k of ['truePositives','falsePositives','falseNegatives','invalidReferences','forbiddenPlay','duplicates','wrongAction','creativeAwaitingReview']){
      totals[k]+=result[k];
    }
  }

  const precision=totals.evaluatedPredictions ? totals.truePositives/totals.evaluatedPredictions : totals.expectedEvents===0 ? 1 : 0;
  const recall=scoreSafe(totals.truePositives,totals.expectedEvents);
  const f1=precision+recall?2*precision*recall/(precision+recall):0;
  const warnings=[];
  if(totals.falseNegatives)warnings.push('MISSED_EXPLICIT_OR_DIRECTED_EVENTS');
  if(totals.forbiddenPlay)warnings.push('SCRIPT_MENTIONS_OR_PRACTICAL_SOUNDS_AS_PLAY');
  if(totals.wrongAction)warnings.push('TRANSPORT_KIND_OR_BASIS_MISMATCH');
  if(totals.invalidReferences)warnings.push('SOURCE_REFERENCE_VALIDATION_FAILURE');
  if(totals.duplicates)warnings.push('DUPLICATE_EVENT_SUPPRESSION');
  if(totals.creativeAwaitingReview)warnings.push('CREATIVE_SUGGESTIONS_REQUIRE_OPERATOR_RATING');
  return {
    mode:'OFFLINE_HUMAN_GOLD_COMPARISON',
    goldProvenance:gold.provenance ?? 'UNDECLARED_GOLD_PROVENANCE',
    predictionProvenance:predictions.provenance ?? 'UNDECLARED_PREDICTION_PROVENANCE',
    // Provenance is user-declared; offline tooling never verifies Meta quality.
    modelQualityMeasured:false,
    summary:{...totals,precision,recall,f1},
    prioritizedCases:cases.sort((a,b)=>b.priorityScore-a.priorityScore||a.id.localeCompare(b.id)),
    warnings,
  };
}

/** Concise, non-sensitive report: only case IDs, line IDs, and aggregate stats. */
export function renderStageEventReport(report) {
  const s=report.summary;
  const percent=n=>(n*100).toFixed(1)+'%';
  const rows=[
    '# RunQ — Cue QA Report',
    '',
    '**Assessment:** offline case comparison only. Prediction provenance is user-declared and is NOT proof of measured model accuracy.',
    '**Gold source:** '+report.goldProvenance,
    '**Prediction source:** '+report.predictionProvenance,
    '',
    '## Summary',
    '',
    '| Metric | Result |','| --- | ---: |',
    '| Reviewed expected events | '+s.expectedEvents+' |',
    '| Scored predictions | '+s.evaluatedPredictions+' |',
    '| Exact event precision | '+percent(s.precision)+' |',
    '| Exact event recall | '+percent(s.recall)+' |',
    '| Exact event F1 | '+percent(s.f1)+' |',
    '| Missed events | '+s.falseNegatives+' |',
    '| Forbidden PLAY | '+s.forbiddenPlay+' |',
    '| Hallucinated references | '+s.invalidReferences+' |',
    '| Duplicates | '+s.duplicates+' |',
    '| Creative ideas requiring human review | '+s.creativeAwaitingReview+' |',
    '',
    '## Prioritized cases',
    '',
  ];
  for(const entry of report.prioritizedCases){
    rows.push('### '+entry.id+' (severity '+entry.priorityScore+')');
    rows.push('Document: '+entry.documentKind+'. TP='+entry.truePositives+', FP='+entry.falsePositives+', FN='+entry.falseNegatives+'.');
    rows.push(...(entry.issues.length?entry.issues.map(x=>'- '+x.type+' — '+x.lineId+(x.transport?' ('+x.transport+')':'')):['- No discrepancies']));
    rows.push('');
  }
  rows.push('## Suggested next bounded actions','','Do not change multiple model settings simultaneously. For top failures, add a focused regression test, change one factor, rerun QA, inspect diff and request human approval. Never run provider tests or merge automatically.','','Warnings: '+(report.warnings.join(', ')||'none')+'.');
  return rows.join('\n')+'\n';
}
