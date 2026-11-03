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
const ALTERNATIVE_REVIEW = new Set(['PENDING_HUMAN_REVIEW','HUMAN_APPROVED']);
const LID = /^L[1-9]\d*$/;
const MAX_CASES = 100;
const MAX_EVENTS = 128;
const DIMENSION_KEYS = Object.freeze({
  localization:event=>event.lineId,
  transport:event=>event.lineId+'|'+event.transport,
  soundClassification:event=>event.lineId+'|'+event.cueKind,
  basis:event=>event.lineId+'|'+event.basis,
});

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
function metricFromCounts(truePositives,falsePositives,falseNegatives){
  const precision=truePositives+falsePositives?
    truePositives/(truePositives+falsePositives):falseNegatives?0:1;
  const recall=truePositives+falseNegatives?
    truePositives/(truePositives+falseNegatives):1;
  const f1=precision+recall?2*precision*recall/(precision+recall):0;
  return {truePositives,falsePositives,falseNegatives,precision,recall,f1};
}
function dimensionMetric(expected,predicted,selector){
  const remaining=new Map();
  for(const event of expected){
    const id=selector(event);
    remaining.set(id,(remaining.get(id)??0)+1);
  }
  let truePositives=0,falsePositives=0;
  for(const event of predicted){
    const id=selector(event);
    const available=remaining.get(id)??0;
    if(available){
      truePositives++;
      remaining.set(id,available-1);
    }else falsePositives++;
  }
  return metricFromCounts(truePositives,falsePositives,expected.length-truePositives);
}
function dimensionMetrics(expected,predicted){
  return Object.fromEntries(Object.entries(DIMENSION_KEYS).map(([name,selector])=>
    [name,dimensionMetric(expected,predicted,selector)]));
}
function alternativeAnnotations(sample,expectedKeys,forbiddenSet){
  const annotations=boundedArray(sample.alternativeAnnotations??[],MAX_EVENTS,'alternativeAnnotations');
  const byAlternative=new Map();
  for(const raw of annotations){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||
       Object.keys(raw).some(field=>!['canonical','alternative','rationale','reviewStatus'].includes(field))||
       typeof raw.rationale!=='string'||raw.rationale.trim().length<10||raw.rationale.length>300||
       !ALTERNATIVE_REVIEW.has(raw.reviewStatus)){
      throw new TypeError('Invalid alternative annotation');
    }
    const canonical=validEvent(raw.canonical,'alternative canonical');
    const alternative=validEvent(raw.alternative,'alternative event');
    if(!expectedKeys.has(key(canonical))||canonical.lineId!==alternative.lineId||
       canonical.transport!==alternative.transport||key(canonical)===key(alternative)||
       (alternative.transport==='PLAY'&&forbiddenSet.has(alternative.lineId))||
       byAlternative.has(key(alternative))){
      throw new RangeError('Inconsistent alternative annotation');
    }
    byAlternative.set(key(alternative),{canonical,reviewStatus:raw.reviewStatus});
  }
  return byAlternative;
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
    semanticAlternativesPending:0,semanticAlternativesApproved:0,
  };
  const dimensionTotals=Object.fromEntries(Object.keys(DIMENSION_KEYS).map(name=>
    [name,{truePositives:0,falsePositives:0,falseNegatives:0}]));
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
    const alternatives=alternativeAnnotations(sample,expectedKeys,forbiddenSet);

    const seen = new Set();
    const matched = new Set();
    const issues = [];
    const scoredEvents=[];
    let fp=0, invalidReferences=0, forbiddenPlay=0, duplicate=0, creative=0, wrongAction=0;
    let semanticAlternativesPending=0,semanticAlternativesApproved=0;
    let scoredPredictions=0;
    for (const event of predicted) {
      const id = key(event);
      let scored=true;
      if (!lines.has(event.lineId)) {
        invalidReferences++; fp++;
        issues.push({type:'HALLUCINATED_SOURCE',lineId:event.lineId});
      } else if (event.transport==='PLAY' && forbiddenSet.has(event.lineId)) {
        forbiddenPlay++; fp++;
        issues.push({type:'FORBIDDEN_PLAY',lineId:event.lineId});
      } else if (seen.has(id)) {
        duplicate++; fp++;
        issues.push({type:'DUPLICATE_EVENT',lineId:event.lineId});
      } else if (expectedKeys.has(id)) {
        matched.add(id);
      } else if (alternatives.has(id)) {
        fp++;
        const alternative=alternatives.get(id);
        if(alternative.reviewStatus==='HUMAN_APPROVED'){
          semanticAlternativesApproved++;
          issues.push({type:'SEMANTIC_ALTERNATIVE_ACCEPTED',lineId:event.lineId});
        }else{
          semanticAlternativesPending++;
          issues.push({type:'SEMANTIC_ALTERNATIVE_REVIEW',lineId:event.lineId});
        }
      } else if (event.basis==='SUGGESTED' && expected.some(x=>x.lineId===event.lineId)) {
        // An explicit required action cannot be hidden from QA by relabeling
        // the prediction as an optional creative treatment.
        fp++; wrongAction++;
        issues.push({type:'WRONG_EVENT_TYPE',lineId:event.lineId});
      } else if (event.basis==='SUGGESTED') {
        creative++;
        scored=false;
        issues.push({type:'CREATIVE_REVIEW_REQUIRED',lineId:event.lineId});
      } else {
        fp++;
        const isAtGoldLine=expected.some(x=>x.lineId===event.lineId);
        if(isAtGoldLine)wrongAction++;
        issues.push({type:isAtGoldLine?'WRONG_EVENT_TYPE':'UNSUPPORTED_EXPLICIT_CUE',lineId:event.lineId});
      }
      if(scored){scoredPredictions++;scoredEvents.push(event)}
      seen.add(id);
    }
    for (const event of expected) {
      if (!matched.has(key(event))) issues.push({type:'MISSED_EXPECTED_EVENT',lineId:event.lineId,transport:event.transport});
    }
    const tp=matched.size;
    const fn=expected.length-tp;
    const dimensions=dimensionMetrics(expected,scoredEvents);
    const severity=invalidReferences*4+forbiddenPlay*3+wrongAction*3+fn*2+fp+duplicate+
      semanticAlternativesPending;
    const result={
      id:sample.id,
      showType:sample.type ?? 'other',
      documentKind:sample.documentKind ?? 'other',
      expectedEvents:expected.length,
      predictions:predicted.length,
      truePositives:tp,falsePositives:fp,falseNegatives:fn,
      invalidReferences,forbiddenPlay,duplicates:duplicate,wrongAction,
      creativeAwaitingReview:creative,
      semanticAlternativesPending,semanticAlternativesApproved,
      dimensions,priorityScore:severity,
      issues,
    };
    cases.push(result);
    totals.expectedEvents+=expected.length;
    totals.evaluatedPredictions+=scoredPredictions;
    for (const k of ['truePositives','falsePositives','falseNegatives','invalidReferences','forbiddenPlay','duplicates','wrongAction','creativeAwaitingReview','semanticAlternativesPending','semanticAlternativesApproved']){
      totals[k]+=result[k];
    }
    for(const [name,metric] of Object.entries(dimensions)){
      for(const key of ['truePositives','falsePositives','falseNegatives']){
        dimensionTotals[name][key]+=metric[key];
      }
    }
  }

  const precision=totals.evaluatedPredictions ? totals.truePositives/totals.evaluatedPredictions : totals.expectedEvents===0 ? 1 : 0;
  const recall=totals.expectedEvents ? totals.truePositives/totals.expectedEvents : 1;
  const f1=precision+recall?2*precision*recall/(precision+recall):0;
  const dimensions=Object.fromEntries(Object.entries(dimensionTotals).map(([name,counts])=>
    [name,metricFromCounts(counts.truePositives,counts.falsePositives,counts.falseNegatives)]));
  const warnings=[];
  if(totals.falseNegatives)warnings.push('MISSED_EXPLICIT_OR_DIRECTED_EVENTS');
  if(totals.forbiddenPlay)warnings.push('SCRIPT_MENTIONS_OR_PRACTICAL_SOUNDS_AS_PLAY');
  if(totals.wrongAction)warnings.push('TRANSPORT_KIND_OR_BASIS_MISMATCH');
  if(totals.invalidReferences)warnings.push('SOURCE_REFERENCE_VALIDATION_FAILURE');
  if(totals.duplicates)warnings.push('DUPLICATE_EVENT_SUPPRESSION');
  if(totals.creativeAwaitingReview)warnings.push('CREATIVE_SUGGESTIONS_REQUIRE_OPERATOR_RATING');
  if(totals.semanticAlternativesPending)warnings.push('SEMANTIC_ALTERNATIVES_REQUIRE_HUMAN_REVIEW');
  if(totals.semanticAlternativesApproved)warnings.push('HUMAN_APPROVED_ALTERNATIVES_PRESERVE_STRICT_SCORE');
  return {
    mode:'OFFLINE_HUMAN_GOLD_COMPARISON',
    goldProvenance:gold.provenance ?? 'UNDECLARED_GOLD_PROVENANCE',
    predictionProvenance:predictions.provenance ?? 'UNDECLARED_PREDICTION_PROVENANCE',
    // Provenance is user-declared; offline tooling never verifies Meta quality.
    modelQualityMeasured:false,
    summary:{...totals,precision,recall,f1,dimensions},
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
    '| Localization P / R / F1 | '+percent(s.dimensions.localization.precision)+' / '+percent(s.dimensions.localization.recall)+' / '+percent(s.dimensions.localization.f1)+' |',
    '| Transport P / R / F1 | '+percent(s.dimensions.transport.precision)+' / '+percent(s.dimensions.transport.recall)+' / '+percent(s.dimensions.transport.f1)+' |',
    '| Sound classification P / R / F1 | '+percent(s.dimensions.soundClassification.precision)+' / '+percent(s.dimensions.soundClassification.recall)+' / '+percent(s.dimensions.soundClassification.f1)+' |',
    '| Explicit/suggested basis P / R / F1 | '+percent(s.dimensions.basis.precision)+' / '+percent(s.dimensions.basis.recall)+' / '+percent(s.dimensions.basis.f1)+' |',
    '| Missed events | '+s.falseNegatives+' |',
    '| Forbidden PLAY | '+s.forbiddenPlay+' |',
    '| Hallucinated references | '+s.invalidReferences+' |',
    '| Duplicates | '+s.duplicates+' |',
    '| Creative ideas requiring human review | '+s.creativeAwaitingReview+' |',
    '| Semantic alternatives awaiting human review | '+s.semanticAlternativesPending+' |',
    '| Human-approved semantic alternatives | '+s.semanticAlternativesApproved+' |',
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
