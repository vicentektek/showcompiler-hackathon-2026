/**
 * Offline, paired Meta/Baseten planning for the Level 1 curriculum.
 * Absolutely no inference, credentials, network, billing, or gold approval.
 * The two providers receive the same source windows in the same order.
 */
import {planScriptAnalysis} from './sceneAnalysis.mjs';

export const DUAL_PROVIDERS=Object.freeze(['META','BASETEN']);
const CASE_ID=/^[a-z][a-z0-9-]{1,60}$/;
const MODES=new Set(['development','qualification']);
const MAX_PAID_REQUESTS=20;
const MAX_BUDGET_USD=20;

function assertOptions(options){
  if(!options||typeof options!=='object'||Array.isArray(options)||
      Object.keys(options).some(k=>!['pool','maxRequests','budgetUsd','allowQualification','operatorReviewed'].includes(k))) {
    throw new TypeError('Invalid paired evaluation options');
  }
  const pool=options.pool??'development';
  const maxRequests=options.maxRequests??20;
  const budgetUsd=options.budgetUsd??20;
  if(!MODES.has(pool)||!Number.isSafeInteger(maxRequests)||maxRequests<2||
      maxRequests>MAX_PAID_REQUESTS||maxRequests%2!==0||
      !Number.isFinite(budgetUsd)||budgetUsd<=0||budgetUsd>MAX_BUDGET_USD) {
    throw new RangeError('Invalid paired request/budget limit');
  }
  // Locked scenarios are not visible in any default development preview.
  // A qualification planner must be a separate, explicit, reviewed operator workflow.
  if(pool==='qualification'&&
    (options.allowQualification!==true||options.operatorReviewed!==true)) {
    throw new Error('Qualification requires independent operator review and explicit release');
  }
  return {pool,maxRequests,budgetUsd};
}

export function buildDualProviderPlan(corpus,options={}){
  const opt=assertOptions(options);
  if(corpus?.corpus!=='RUNQ_LEVEL1_EVAL_CORPUS'||!Array.isArray(corpus.cases)){
    throw new TypeError('Invalid Level 1 corpus');
  }
  if(opt.pool==='qualification'&&
     (corpus.humanReviewStatus!=='HUMAN_REVIEWED'||
      corpus.cases.some(c=>c.pool==='qualification'&&c.reviewStatus!=='HUMAN_REVIEWED'))) {
    throw new Error('Qualification gold is not human reviewed');
  }
  const included=corpus.cases.filter(c=>c.pool===opt.pool);
  if(!included.length||included.some(c=>!CASE_ID.test(c.id)||typeof c.scriptText!=='string'||
      !Number.isSafeInteger(c.sceneWindowCount)||c.sceneWindowCount<1)) {
    throw new TypeError('Invalid pool cases');
  }
  const pairs=[];
  for(const c of included){
    const plan=planScriptAnalysis(c.scriptText);
    if(plan.coverage.coveragePercent!==100||plan.coverage.windowCount!==c.sceneWindowCount){
      throw new Error('Scene-window accounting mismatch: '+c.id);
    }
    for(const w of plan.windows){
      const lineIds=w.coreLines.map(l=>l.id);
      pairs.push({pairId:c.id+'/'+w.id,caseId:c.id,windowId:w.id,
        startLineId:w.startLineId,endLineId:w.endLineId,
        coreLineCount:lineIds.length,providerRequests:DUAL_PROVIDERS.map(provider=>({
          provider,caseId:c.id,windowId:w.id,status:'NOT_EXECUTED',
        }))});
    }
  }
  // Never make partial provider pairs, and never infer that the plan is evidence.
  const selected=pairs.slice(0,opt.maxRequests/DUAL_PROVIDERS.length);
  const assignments=selected.flatMap(pair=>pair.providerRequests.map(request=>({...request})));
  const byProvider=Object.fromEntries(DUAL_PROVIDERS.map(provider=>[
    provider,{plannedRequests:assignments.filter(a=>a.provider===provider).length,
      maxBudgetUsd:Number((opt.budgetUsd/2).toFixed(4)),
      actualSpendUsd:null},
  ]));
  return {
    version:1,kind:'RUNQ_OFFLINE_DUAL_PROVIDER_PLAN',
    status:'NOT_EXECUTED_NO_MODEL_EVIDENCE',pool:opt.pool,
    goldReviewStatus:corpus.humanReviewStatus,
    humanReviewRequired:true,
    providers:[...DUAL_PROVIDERS],
    policy:{maxRequests:opt.maxRequests,budgetUsd:opt.budgetUsd,
      qualificationLocked:opt.pool!=='qualification',
      noAutomaticRetries:true,noAutomaticPaidCalls:true,
      noAutomaticPromptTuning:true},
    coverage:{availableCases:included.length,
      availableWindows:pairs.length,
      plannedWindows:selected.length,plannedRequests:assignments.length,
      unplannedWindows:pairs.length-selected.length,
      perProvider:byProvider},
    selectedPairs:selected,assignments,
    limitations:[
      'A planned request does not imply a provider request was executed.',
      'No measured accuracy, cost, billing or latency is available.',
      'Model input must preserve exact Lxx source references and paired window contents.',
      'Qualification gold and scripts cannot be used for prompt optimization.',
      'Paid calls require a separate explicit operator-approved execution tool.',
    ],
  };
}

export function renderDualProviderPlan(plan){
  if(plan?.kind!=='RUNQ_OFFLINE_DUAL_PROVIDER_PLAN')throw new TypeError('Invalid dual provider plan');
  const c=plan.coverage;
  return [
    '# RunQ — Paired Meta/Baseten evaluation plan (OFFLINE)',
    '',
    '**NOT EXECUTED. ZERO REAL PROVIDER REQUESTS. NO ACCURACY MEASURED.**',
    '',
    'Pool: '+plan.pool+'. Gold status: '+plan.goldReviewStatus+'.',
    'Paired policy: same cases/windows, one META and one BASETEN request per selected pair.',
    'Budget ceiling (not a charge): $'+plan.policy.budgetUsd+'. Request cap: '+plan.policy.maxRequests+'.',
    'Candidate windows: '+c.availableWindows+'; planned: '+c.plannedWindows+
      '; deferred: '+c.unplannedWindows+'.',
    'Planned calls: '+c.plannedRequests+' (META '+c.perProvider.META.plannedRequests+
      ', BASETEN '+c.perProvider.BASETEN.plannedRequests+').',
    '',
    '| Pair | Case | Window | Source lines | META | BASETEN |',
    '|---|---|---|---|---|---|',
    ...plan.selectedPairs.map(p=>'| '+[p.pairId,p.caseId,p.windowId,
      p.startLineId+'–'+p.endLineId,'NOT_EXECUTED','NOT_EXECUTED'].join(' | ')+' |'),
    '',
    '## Guardrails','',
    ...plan.limitations.map(x=>'- '+x),
    '',
  ].join('\n');
}
