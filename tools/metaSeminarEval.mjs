/**
 * Optional, bounded REAL Muse Spark evaluation. Not called by npm test,
 * qa:codex, GitHub Actions or application startup.
 *
 * Standard Muse Spark pricing verified 2026-10-27:
 * 1.25 USD/1M input, 0.15 USD/1M cached input, 4.25 USD/1M output.
 * Estimates are LOCAL protection, not an account-level provider spend cap.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readSeminarCorpus } from './seminarCorpus.mjs';
import { createNewShow } from '../src/core/workspace.mjs';
import { prepareTheatricalCueAnalysis } from '../src/core/theatreCueAnalysis.mjs';
import { callMetaCueModel } from '../src/core/metaCueProvider.mjs';
import { evaluateStageEventCases, renderStageEventReport } from '../src/core/stageCueQa.mjs';

export const MUSE_STANDARD_PRICING=Object.freeze({inputPerMillion:1.25,cachedInputPerMillion:0.15,outputPerMillion:4.25});
export const MAX_EXPERIMENT_BUDGET_USD=2;
const INPUT_OVERHEAD_TOKENS=16384;
const MAX_REQUEST_BODY_BYTES=80000;
const CAP_REQUESTS=20;

function finitePositive(n,max){return typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=max}
function USD(n){return Number(n.toFixed(6))}
export function estimateMetaRequestReserve(request){
  const body=JSON.stringify(request);
  const bodyBytes=Buffer.byteLength(body,'utf8');
  if(bodyBytes>MAX_REQUEST_BODY_BYTES)throw new RangeError('Too much source/schema for a guarded request');
  if(request.model!=='muse-spark-1.3'||request.stream!==false||request.store!==false||
     request.reasoning_effort!=='low'||!request.response_format?.json_schema?.strict||
     !Number.isSafeInteger(request.max_completion_tokens)||
     request.max_completion_tokens<256||request.max_completion_tokens>8192){
    throw new TypeError('Unsupported paid experiment request contract');
  }
  // Byte count + generous scaffolding allowance conservatively estimates
  // prompt tokens; provider-side billing still owns the actual charge.
  return USD(((bodyBytes+INPUT_OVERHEAD_TOKENS)*MUSE_STANDARD_PRICING.inputPerMillion+
    request.max_completion_tokens*MUSE_STANDARD_PRICING.outputPerMillion)/1e6);
}
export function reportedMetaUSD(usage){
  if(!usage||!Number.isSafeInteger(usage.promptTokens)||!Number.isSafeInteger(usage.completionTokens)||
     usage.promptTokens<0||usage.completionTokens<0)return null;
  const cached=Number.isSafeInteger(usage.cachedPromptTokens)&&usage.cachedPromptTokens>=0?
    Math.min(usage.cachedPromptTokens,usage.promptTokens):0;
  return USD(((usage.promptTokens-cached)*MUSE_STANDARD_PRICING.inputPerMillion+
    cached*MUSE_STANDARD_PRICING.cachedInputPerMillion+
    usage.completionTokens*MUSE_STANDARD_PRICING.outputPerMillion)/1e6);
}
function safeDiagnostic(error){
  const d=error?.diagnostic;
  const safe=d&&typeof d==='object'?d:{};
  const allowed=(x)=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,80}$/.test(x)?x:undefined;
  return {
    status:'FAILED',
    code:allowed(error?.safeReason??error?.safeCode)??'UNEXPECTED_FAILURE',
    phase:allowed(safe.phase),
    finishReason:allowed(safe.finishReason),
    upstreamStatus:Number.isInteger(safe.upstreamStatus)?safe.upstreamStatus:undefined,
    durationMs:Number.isSafeInteger(safe.durationMs)?safe.durationMs:undefined,
    usage:safe.usage&&typeof safe.usage==='object'?{
      promptTokens:safe.usage.promptTokens,
      completionTokens:safe.usage.completionTokens,
      reasoningTokens:safe.usage.reasoningTokens,
      cachedPromptTokens:safe.usage.cachedPromptTokens,
    }:undefined,
  };
}
function makeOpts(caseData,windowStart,mode){
  return {model:'muse-spark-1.3',scriptLanguage:caseData.language??'auto',
    windowStart,designMode:mode,performanceKind:caseData.type,
    documentKind:caseData.documentKind};
}
export function parseLiveOptions(args=[]){
  const opt={live:false,ackPaid:false,budgetUsd:2,maxRequests:13,
    mode:'literal',caseId:null,output:'artifacts/seminar-live'};
  for(let i=0;i<args.length;i++){
    const k=args[i];
    if(k==='--live'){if(opt.live)throw new TypeError('Duplicate --live');opt.live=true;continue}
    if(k==='--ack-paid'){if(opt.ackPaid)throw new TypeError('Duplicate --ack-paid');opt.ackPaid=true;continue}
    if(!['--budget-usd','--max-requests','--mode','--case','--output'].includes(k)||
       !args[i+1]||args[i+1].startsWith('--'))throw new TypeError('Unknown/invalid eval CLI argument');
    const value=args[++i];
    if(k==='--budget-usd')opt.budgetUsd=Number(value);
    if(k==='--max-requests')opt.maxRequests=Number(value);
    if(k==='--mode')opt.mode=value;
    if(k==='--case')opt.caseId=value;
    if(k==='--output')opt.output=value;
  }
  if(!finitePositive(opt.budgetUsd,MAX_EXPERIMENT_BUDGET_USD)||
     !Number.isSafeInteger(opt.maxRequests)||opt.maxRequests<1||opt.maxRequests>CAP_REQUESTS||
     !['literal','balanced','expressive'].includes(opt.mode)||
     (opt.caseId!==null&&!/^[a-z][a-z0-9-]{1,60}$/.test(opt.caseId))||
     typeof opt.output!=='string'||opt.output.length>160){
    throw new TypeError('Unsafe budget, request count, mode or selection');
  }
  if(opt.live!==opt.ackPaid)throw new TypeError('Paid runs need both --live and --ack-paid');
  return opt;
}

/**
 * modelCaller injection is ONLY for unit tests; real CLI always uses adapter.
 * No automatic retry, no parallel requests, and no writes to source projects.
 */
export async function runMetaSeminarEval({
  live=false,ackPaid=false,budgetUsd=2,maxRequests=13,
  mode='literal',caseId=null,output='artifacts/seminar-live',
  apiKey,modelCaller=callMetaCueModel,fetchImpl=globalThis.fetch,
  fixtures=readSeminarCorpus,
}={}){
  if(live!==ackPaid)throw new TypeError('A live test requires an explicit batch billing acknowledgement');
  if(!finitePositive(budgetUsd,2)||!Number.isSafeInteger(maxRequests)||
     maxRequests<1||maxRequests>CAP_REQUESTS||
     !['literal','balanced','expressive'].includes(mode))throw new TypeError('Invalid experiment budget');
  if(live&&(!apiKey||typeof apiKey!=='string'))throw new TypeError('MODEL_API_KEY not set; no calls attempted');
  const corpus=await fixtures();
  const selection=corpus.cases.filter(c=>!caseId||c.id===caseId);
  if(!selection.length)throw new RangeError('Unknown original fixture');
  const cases=[];
  const scored=[];
  const predictionsByCase={};
  let authorizations=0,spentReserveUsd=0,estimatedActualUsd=0,haltReason=null,stopped=false;
  for(const item of selection){
    if(stopped)break;
    const project=createNewShow({name:item.id,scriptText:item.scriptText});
    const allEvents=[];
    const requests=[];
    let windowStart=0,complete=false;
    while(!stopped){
      if(authorizations>=maxRequests){haltReason='MAX_REQUESTS';stopped=true;break}
      const opts=makeOpts(item,windowStart,mode);
      const planned=prepareTheatricalCueAnalysis(project,opts);
      const reserve=estimateMetaRequestReserve(planned.request);
      if(spentReserveUsd+reserve>budgetUsd){
        haltReason='BUDGET_ESTIMATE_REACHED';stopped=true;break;
      }
      const lineInfo={windowId:planned.coverage.analyzedWindowIds[0],
        sourceLines:planned.coverage.analyzedLines,estimatedReserveUsd:reserve};
      if(!live){
        requests.push({...lineInfo,status:'DRY_RUN_NO_API'});
        authorizations++;spentReserveUsd=USD(spentReserveUsd+reserve);
        windowStart=planned.coverage.nextWindowStart;
        if(windowStart===null){complete=true;break}
        continue;
      }
      // Reserve BEFORE making the request. Failed/truncated/unbilled responses
      // keep their full reserve, to discourage repeated blind retries.
      authorizations++;
      spentReserveUsd=USD(spentReserveUsd+reserve);
      try{
        const result=await modelCaller({
          show:project,apiKey,fetchImpl,analysisMode:'THEATRICAL',
          analysisWindowStart:windowStart,scriptLanguage:opts.scriptLanguage,
          designMode:opts.designMode,performanceKind:opts.performanceKind,
          documentKind:opts.documentKind,model:'muse-spark-1.3',
        });
        const usage=result?.diagnostics?.usage;
        const billed=reportedMetaUSD(usage);
        if(billed!==null)estimatedActualUsd=USD(estimatedActualUsd+billed);
        if(!result||!Array.isArray(result.details)||!Array.isArray(result.observations)||
           result.coverage?.analyzedWindowIds?.[0]!==lineInfo.windowId){
          throw new TypeError('Invalid validated model client result');
        }
        for(const event of [...result.details,...result.observations]){
          allEvents.push({sourceLineId:event.sourceLineId,
            transport:event.transport,cueKind:event.cueKind,basis:event.basis});
        }
        requests.push({...lineInfo,status:'COMPLETED',finishReason:result.diagnostics?.finishReason,
          usage:usage??null,estimatedActualUsd:billed,
          recognizedEvents:result.details.length+result.observations.length,
          omittedExplicitPrefixReviewFlags:result.independentReview?.totalUnreviewed??null});
        windowStart=result.coverage.nextWindowStart;
        if(windowStart===null){complete=true;break}
      }catch(err){
        const diagnostic=safeDiagnostic(err);
        const billed=reportedMetaUSD(diagnostic.usage);
        if(billed!==null)estimatedActualUsd=USD(estimatedActualUsd+billed);
        requests.push({...lineInfo,...diagnostic,estimatedActualUsd:billed});
        stopped=true;haltReason=diagnostic.code;
        break;
      }
    }
    const status=complete?'COMPLETE':stopped?'PARTIAL_STOPPED':'PARTIAL';
    cases.push({id:item.id,status,requests,events:allEvents.length,
      expectedEvents:item.expected.length});
    if(complete&&live){
      predictionsByCase[item.id]=allEvents;
      scored.push(item);
    }
  }
  const score=(live&&scored.length)?
    evaluateStageEventCases({version:1,provenance:corpus.provenance,
      cases:scored},{version:1,provenance:'LOCAL_LIVE_META_CAPTURE_NOT_HUMAN_VERIFIED',
        predictionsByCase}):null;
  const report={
    kind:live?'LOCAL_LIVE_META_EXPERIMENT':'OFFLINE_META_REQUEST_PLAN',
    realInferenceExecuted:live&&authorizations>0,
    realModelQualityCertified:false,
    goldHumanReviewed:false,
    model:'muse-spark-1.3',mode,budgetCapUsd:budgetUsd,maxRequests,
    submittedRequests:live?authorizations:0,
    plannedRequests:authorizations,
    conservativeReservedUsd:spentReserveUsd,
    observedUsageEstimatedUsd:live?estimatedActualUsd:null,
    haltReason,corpus:corpus.corpus,
    cases,score:score?score.summary:null,
    scoredCases:scored.length,
    note:'Budget is per-run software preflight only, not a guaranteed provider-side billing cap. Human-review gold before claims about Muse.',
  };
  await mkdir(output,{recursive:true});
  const lines=[
    '# RunQ Muse Spark lab — '+(live?'LOCAL LIVE REQUESTS':'DRY RUN'),
    '',
    '**Not production certified. Gold annotation awaiting operator review.**',
    '',
    'Model: muse-spark-1.3 (standard). Mode: '+mode+'.',
    'Requests: '+report.submittedRequests+' real / '+report.plannedRequests+' planned.',
    'Conservative preflight reserve: $'+spentReserveUsd.toFixed(4)+' / $'+budgetUsd.toFixed(2)+'.',
    'Observed usage-cost estimate: '+(live?'$'+estimatedActualUsd.toFixed(4):'n/a (dry run)')+'.',
    'Stop reason: '+(haltReason??'none')+'.',
    'Cases completed for scoring: '+report.scoredCases+'.',
    '',
    ...(score?[renderStageEventReport(score)]:['No scores: no complete live fixture results.']),
    '',
    '## Request diagnostics (no model response text)',
    ...cases.flatMap(c=>['### '+c.id+' — '+c.status,
      ...c.requests.map(x=>'- '+x.windowId+': '+x.status+
        ' / '+(x.finishReason??x.code??'not applicable')+
        ' / reserve $'+x.estimatedReserveUsd.toFixed(4)+
        ' / completion '+(x.usage?.completionTokens??'n/a')+' tokens')]),
    '',
    'Never let Codex change GO/STOP or retry API calls solely because a fixture score is low.',
  ];
  await Promise.all([
    writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n','utf8'),
    writeFile(join(output,'report.md'),lines.join('\n')+'\n','utf8'),
  ]);
  return report;
}
