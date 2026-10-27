#!/usr/bin/env node
// Sequential Meta lab: baseline/candidate matched cases, capped shared budget,
// typed local diagnostics and prioritized Codex task. No automatic self-editing.
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readSeminarCorpus } from './seminarCorpus.mjs';
import { runMetaSeminarEval } from './metaSeminarEval.mjs';
import { acquireMetaBudgetLedger } from './metaBudgetLedger.mjs';
import { evaluateStageEventCases } from '../src/core/stageCueQa.mjs';

const MODES=['literal','balanced','expressive'];
const ID=/^[a-z][a-z0-9-]{1,60}$/;
function round(n){return Number(n.toFixed(6));}
export function parseExperimentOptions(args=[]){
  const o={live:false,ackPaid:false,modes:['literal','balanced'],cases:null,
    maxRequests:8,budgetUsd:.5,output:'artifacts/systematic-eval'};
  const seen=new Set();
  for(let i=0;i<args.length;i++){
    const k=args[i];
    if(seen.has(k))throw new TypeError('Repeated experiment option');
    seen.add(k);
    if(k==='--live'){o.live=true;continue}
    if(k==='--ack-paid'){o.ackPaid=true;continue}
    if(!['--modes','--cases','--max-requests','--budget-usd','--output'].includes(k)||
      !args[i+1]||args[i+1].startsWith('--'))throw new TypeError('Unexpected option');
    const val=args[++i];
    if(k==='--modes')o.modes=val.split(',');
    if(k==='--cases')o.cases=val.split(',');
    if(k==='--max-requests')o.maxRequests=Number(val);
    if(k==='--budget-usd')o.budgetUsd=Number(val);
    if(k==='--output')o.output=val;
  }
  const unique=a=>new Set(a).size===a.length;
  if(o.live!==o.ackPaid||!o.modes.length||o.modes.length>3||!unique(o.modes)||
    o.modes.some(x=>!MODES.includes(x))||
    (o.cases&&(!o.cases.length||o.cases.length>20||!unique(o.cases)||o.cases.some(x=>!ID.test(x))))||
    !Number.isSafeInteger(o.maxRequests)||o.maxRequests<1||o.maxRequests>20||
    !Number.isFinite(o.budgetUsd)||o.budgetUsd<=0||o.budgetUsd>2||
    typeof o.output!=='string'||!/^artifacts\/[a-z0-9/-]{3,80}$/.test(o.output)||
    o.output.includes('..'))throw new TypeError('Unsafe systematic experiment configuration');
  return o;
}
const typed=e=>({sourceLineId:e.sourceLineId,transport:e.transport,cueKind:e.cueKind,basis:e.basis});
function scoreCase(c,events){
  return evaluateStageEventCases({version:1,cases:[c]},
    {version:1,predictionsByCase:{[c.id]:events}}).summary;
}
export function analyzeExperiment(corpus,attempts){
  const complete=attempts.filter(x=>x.complete&&Array.isArray(x.events));
  const errors=[],comparisons=[];
  for(const run of complete){
    const gold=corpus.cases.find(c=>c.id===run.caseId);
    const report=evaluateStageEventCases({version:1,cases:[gold]},
      {version:1,predictionsByCase:{[gold.id]:run.events}});
    const item=report.prioritizedCases[0];
    for(const i of item.issues){
      // Only typed, non-executable evidence. Missing events have no prediction.
      const observed=i.type==='MISSED_EXPECTED_EVENT'?null:
        run.events.find(e=>e.sourceLineId===i.lineId)??null;
      errors.push({caseId:run.caseId,mode:run.mode,lineId:i.lineId,
        type:i.type,observed,priority:item.priorityScore});
    }
  }
  for(const c of corpus.cases){
    const items=complete.filter(x=>x.caseId===c.id);
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
      const a=scoreCase(c,items[i].events),b=scoreCase(c,items[j].events);
      comparisons.push({caseId:c.id,from:items[i].mode,to:items[j].mode,
        baselineF1:a.f1,candidateF1:b.f1,deltaF1:round(b.f1-a.f1),
        baselineFalsePositives:a.falsePositives,candidateFalsePositives:b.falsePositives,
        baselineMissed:a.falseNegatives,candidateMissed:b.falseNegatives});
    }
  }
  return {provisionalGold:true,realModelQualityCertified:false,
    completed:complete.length,comparisons,
    errors:errors.sort((a,b)=>b.priority-a.priority).slice(0,100),
    incomplete:attempts.filter(x=>!x.complete).map(x=>({
      caseId:x.caseId,mode:x.mode,reason:x.reason,status:x.status,
    }))};
}
export function formatExperimentReport(summary){
  const lines=['# RunQ systematic QA laboratory','',
    'Real provider only when explicitly authorized. Provisional gold; NOT certified model quality.',
    'Raw provider responses, credentials and scripts are NOT saved.','','## Runs','',
    '| Case | Mode | Status | Requests | Reserve USD | F1 |',
    '| --- | --- | --- | ---: | ---: | ---: |'];
  for(const x of summary.runs)lines.push('| '+x.caseId+' | '+x.mode+
    ' | '+x.status+' | '+x.requests+' | '+x.reserveUsd.toFixed(4)+' | '+
    (x.f1===null?'n/a':(x.f1*100).toFixed(1)+'%')+' |');
  lines.push('','## Matched A/B only: same case, complete runs','');
  for(const c of summary.analysis.comparisons)lines.push('- '+c.caseId+': '+
    c.from+' '+(100*c.baselineF1).toFixed(1)+'% vs '+c.to+' '+
    (100*c.candidateF1).toFixed(1)+'%, delta '+(100*c.deltaF1).toFixed(1)+' pp');
  if(!summary.analysis.comparisons.length)lines.push('- No matched pair; do not compare pooled F1.');
  lines.push('','## Prioritized errors and typed observations','');
  for(const e of summary.analysis.errors.slice(0,30))lines.push('- '+e.caseId+
    '/'+e.mode+'/'+e.lineId+': '+e.type+'; '+
    (e.observed?e.observed.transport+'/'+e.observed.cueKind+'/'+e.observed.basis:'missing event'));
  if(!summary.analysis.errors.length)lines.push('- No scored mismatch.');
  lines.push('','## Budget','',
    'Calls '+summary.submittedRequests+'; reserved $'+summary.reservedUsd.toFixed(4)+
    '; observed usage estimate $'+summary.estimatedSpendUsd.toFixed(4)+'.',
    'The existing cross-run ledger limits reservations to $2 in the same checkout only.',
    'Billing platform remains authoritative. Failed calls are not retried.','');
  return lines.join('\n');
}
function codexTask(analysis){
  const issue=analysis.errors[0];
  return ['# RunQ Codex iteration — one reproducible change','',
    'Never make Meta requests or use MODEL_API_KEY. Do not train weights, edit live transport, merge or deploy.',
    issue?'Highest priority: '+issue.caseId+' / '+issue.mode+' / '+issue.lineId+' / '+issue.type+
      ' / '+(issue.observed?JSON.stringify(issue.observed):'omission')+'.':
      'No captured errors: improve evaluation coverage with an offline test.',
    'Read AGENTS.md and docs/CODEX_META_SEMINAR_EVAL_LAB.md.',
    'Review original line and human gold before assigning fault.',
    'Add one failing regression first; change one factor; run npm run qa:codex.',
    'Do not change gold to inflate scores without operator approval.',
    'Propose next authorized A/B case using the same script and distinct output folder.',''].join('\n');
}
export async function runSystematicExperiment(options={},deps={}){
  const opt=parseExperimentOptions([
    ...(options.live?['--live','--ack-paid']:[]),
    '--modes',(options.modes??['literal','balanced']).join(','),
    '--budget-usd',String(options.budgetUsd??.5),
    '--max-requests',String(options.maxRequests??8),
    '--output',options.output??'artifacts/systematic-eval',
    ...(options.cases?['--cases',options.cases.join(',')]:[]),
  ]);
  const corpus=await (deps.readCorpus??readSeminarCorpus)();
  const selected=opt.cases??corpus.cases.map(x=>x.id);
  if(selected.some(id=>!corpus.cases.some(x=>x.id===id)))throw new RangeError('Unknown test case');
  const plan=selected.flatMap(caseId=>opt.modes.map(mode=>({caseId,mode})));
  await mkdir(opt.output,{recursive:true});
  const folder=await mkdtemp(resolve(opt.output,'run-'));
  let ledger=null,calls=0,reservedUsd=0,estimatedSpendUsd=0;
  const runs=[],attempts=[];
  try{
    if(opt.live)ledger=await (deps.acquireLedger??acquireMetaBudgetLedger)();
    for(const {caseId,mode} of plan){
      if(opt.live&&calls>=opt.maxRequests)break;
      const left=round(opt.budgetUsd-reservedUsd);
      if(opt.live&&left<=0)break;
      const report=await (deps.runEval??runMetaSeminarEval)({
        live:opt.live,ackPaid:opt.live,
        budgetUsd:opt.live?left:opt.budgetUsd,
        maxRequests:opt.live?Math.max(1,opt.maxRequests-calls):opt.maxRequests,
        caseId,mode,output:join(folder,caseId+'-'+mode),
        ledger,apiKey:opt.live?(deps.apiKey??process.env.MODEL_API_KEY):undefined,
        ...(deps.modelCaller?{modelCaller:deps.modelCaller}:{}),
      });
      const caseResult=report.cases.find(x=>x.id===caseId);
      const complete=opt.live&&caseResult?.status==='COMPLETE'&&Array.isArray(caseResult.eventTrace);
      const events=complete?caseResult.eventTrace.map(typed):null;
      const gold=corpus.cases.find(x=>x.id===caseId);
      const f1=complete?scoreCase(gold,events).f1:null;
      attempts.push({caseId,mode,complete,events,status:caseResult?.status??'NOT_STARTED',
        reason:report.haltReason});
      runs.push({caseId,mode,status:caseResult?.status??'NOT_STARTED',
        requests:report.submittedRequests,reserveUsd:report.conservativeReservedUsd,f1,
        reason:report.haltReason??null});
      calls+=report.submittedRequests;
      reservedUsd=round(reservedUsd+report.conservativeReservedUsd);
      estimatedSpendUsd=round(estimatedSpendUsd+(report.observedUsageEstimatedUsd??0));
      if(opt.live&&report.haltReason)break;
    }
  }finally{await ledger?.close();}
  const analysis=analyzeExperiment(corpus,attempts);
  const summary={kind:opt.live?'REAL_META_SYSTEMATIC_EVAL':'OFFLINE_EXPERIMENT_PLAN',
    realInferenceExecuted:opt.live&&calls>0,model:'muse-spark-1.3',
    submittedRequests:calls,reservedUsd,estimatedSpendUsd,provisionalGold:true,
    budgetCapUsd:opt.budgetUsd,runs,analysis};
  await Promise.all([
    writeFile(join(folder,'summary.json'),JSON.stringify(summary,null,2)+'\n'),
    writeFile(join(folder,'summary.md'),formatExperimentReport(summary)+'\n'),
    writeFile(join(folder,'codex-next-task.md'),codexTask(analysis)+'\n'),
  ]);
  return {folder,summary};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const opts=parseExperimentOptions(process.argv.slice(2));
    const {folder,summary}=await runSystematicExperiment(opts);
    console.log('RunQ '+summary.kind+'; requests '+summary.submittedRequests+
      ', reserved $'+summary.reservedUsd.toFixed(4)+'.');
    console.log('Reports: '+folder+'/summary.md; codex-next-task.md');
    if(!opts.live)console.log('DRY RUN — no Meta provider calls.');
  }catch(e){
    console.error('Systematic lab stopped: '+(e instanceof TypeError||e instanceof RangeError?
      'INVALID_CONFIGURATION':'EVAL_FAILED')+'. No automatic retry.');
    process.exitCode=1;
  }
}
