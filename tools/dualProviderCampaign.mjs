/**
 * Opt-in, local-only Level 1 paired campaign. No automatic retries.
 * Each attempted request is journaled BEFORE network I/O; failures are terminal.
 * The Baseten budget is a planning allowance, NOT a verified monetary limit.
 */
import {mkdir,readFile,writeFile,open} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readLevel1Corpus} from './level1Corpus.mjs';
import {buildDualProviderPlan} from '../src/core/dualProviderPlan.mjs';
import {createNewShow} from '../src/core/workspace.mjs';
import {prepareTheatricalCueAnalysis} from '../src/core/theatreCueAnalysis.mjs';
import {callMetaCueModel} from '../src/core/metaCueProvider.mjs';
import {callBasetenTheatre,makeBasetenTheatreRequest} from './basetenSeminarEval.mjs';
import {estimateMetaRequestReserve,reportedMetaUSD} from './metaSeminarEval.mjs';
import {acquireMetaBudgetLedger} from './metaBudgetLedger.mjs';

const ROOT='artifacts/dual-provider-campaign';
const MONEY=5;
const EVENTS=new Set(['PLAY','STOP','CONTINUE','SILENCE']);
const KINDS=new Set(['FX','AMBIENCE','MUSIC','VOICE','SILENCE','TRANSITION']);
const BASES=new Set(['EXPLICIT','SUGGESTED']);
const round=x=>Number(x.toFixed(6));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const event=e=>{
  if(!e||!/^L[1-9]\d*$/.test(e.sourceLineId)||!EVENTS.has(e.transport)||
      !KINDS.has(e.cueKind)||!BASES.has(e.basis))throw new TypeError('Invalid classified event');
  return {sourceLineId:e.sourceLineId,transport:e.transport,cueKind:e.cueKind,basis:e.basis};
};
export function parseCampaignArgs(args=[]){
  const result={live:false,ackPaid:false,budgetUsd:MONEY,maxRequests:18};
  const seen=new Set();
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(!['--live','--ack-paid','--budget-usd','--max-requests'].includes(key)||seen.has(key))
      throw new TypeError('Unknown or duplicate campaign option');
    seen.add(key);
    if(key==='--live'||key==='--ack-paid'){result[key==='--live'?'live':'ackPaid']=true;continue}
    const value=args[++i];
    if(!value||!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))
      throw new TypeError('Invalid numeric campaign option');
    result[key==='--budget-usd'?'budgetUsd':'maxRequests']=Number(value);
  }
  if(result.live!==result.ackPaid||result.budgetUsd!==MONEY||
      !Number.isSafeInteger(result.maxRequests)||result.maxRequests<2||
      result.maxRequests>18||result.maxRequests%2!==0)throw new TypeError('Campaign limits/consent invalid');
  return result;
}
export function validateCampaignJournal(journal,planHash,requestKeys){
  if(!journal||journal.version!==1||journal.planHash!==planHash||
      !Array.isArray(journal.attempts)||!Array.isArray(journal.results))throw new Error('Journal/plan mismatch');
  const allowed=new Set(requestKeys),seen=new Set();
  for(const item of journal.attempts){
    if(!allowed.has(item.key)||seen.has(item.key)||!['META','BASETEN'].includes(item.provider)||
        item.key!==item.provider+':'+item.pairId)throw new Error('Invalid/duplicate attempt journal');
    seen.add(item.key);
  }
  for(const item of journal.results)if(!seen.has(item.key))throw new Error('Result without attempt');
  return seen;
}
function outputSummary(plan,journal){
  const completed=new Set(journal.results.filter(r=>r.status==='COMPLETED').map(r=>r.key));
  const rows=plan.selectedPairs.map(pair=>{
    const get=p=>{
      const key=p+':'+pair.pairId;
      const result=journal.results.find(r=>r.key===key);
      return result?.status??(journal.attempts.some(a=>a.key===key)?'UNKNOWN_AFTER_ATTEMPT':'NOT_EXECUTED');
    };
    return {pairId:pair.pairId,META:get('META'),BASETEN:get('BASETEN')};
  });
  return {kind:'RUNQ_LEVEL1_LIVE_CAMPAIGN',goldHumanReviewed:false,
    provisionalGold:true,attempted:journal.attempts.length,completed:completed.size,
    remaining:plan.assignments.length-journal.attempts.length,
    metaEstimatedActualUsd:round(journal.results.reduce((sum,r)=>sum+(r.provider==='META'?(r.estimatedActualUsd??0):0),0)),
    basetenActualUsd:null,combinedActualUsd:null,
    note:'Baseten actual billing is unknown; $5 is an operator target, not a hard provider billing cap. Do not claim measured accuracy without human-reviewed gold.',
    rows};
}
export async function runCampaign({rootDir=process.cwd(),options={},metaCaller=callMetaCueModel,
    basetenCaller=callBasetenTheatre,ledgerFactory=acquireMetaBudgetLedger}={}){
  const opt={...parseCampaignArgs([]),...options};
  parseCampaignArgs([...(opt.live?['--live']:[]),...(opt.ackPaid?['--ack-paid']:[]),
    '--budget-usd',String(opt.budgetUsd),'--max-requests',String(opt.maxRequests)]);
  const corpus=await readLevel1Corpus({rootDir});
  const plan=buildDualProviderPlan(corpus,{pool:'development',maxRequests:opt.maxRequests,budgetUsd:MONEY});
  const cases=new Map(corpus.cases.filter(c=>c.pool==='development').map(c=>[c.id,c]));
  const inputs=plan.selectedPairs.map(pair=>{
    const c=cases.get(pair.caseId);
    const project=createNewShow({name:c.id,scriptText:c.scriptText});
    const windowStart=c.windows.findIndex(w=>w.id===pair.windowId);
    if(windowStart<0)throw new Error('Missing planned window');
    const prepared=prepareTheatricalCueAnalysis(project,{model:'muse-spark-1.3',windowStart,
      designMode:'literal',scriptLanguage:c.language,performanceKind:c.type,documentKind:c.documentKind});
    if(prepared.coverage.analyzedWindowIds.length!==1||
        prepared.coverage.analyzedWindowIds[0]!==pair.windowId||
        prepared.coverage.analyzedLineIds[0]!==pair.startLineId||
        prepared.coverage.analyzedLineIds.at(-1)!==pair.endLineId)throw new Error('Window mismatch');
    const metaReserve=estimateMetaRequestReserve(prepared.request);
    makeBasetenTheatreRequest(prepared);
    return {pair,c,project,windowStart,prepared,metaReserve};
  });
  const planHash=sha({plan,inputs:inputs.map(x=>({pair:x.pair.pairId,
    scriptHash:sha(x.c.scriptText),metaRequestHash:sha(x.prepared.request)}))});
  const dir=join(rootDir,ROOT);
  if(!opt.live)return {kind:'OFFLINE_CAMPAIGN_PREFLIGHT',plannedRequests:plan.assignments.length,
    pairs:plan.selectedPairs.length,metaConservativeReserveUsd:round(inputs.reduce((s,x)=>s+x.metaReserve,0)),
    basetenActualUsd:null,budgetTargetUsd:MONEY,planHash};
  if(!process.env.MODEL_API_KEY||!process.env.BASETEN_API_KEY)throw new Error('Missing local provider credentials');
  await mkdir(dir,{recursive:true});
  // Exclusive create: a second process cannot silently reuse a paid campaign.
  const lock=await open(join(dir,'campaign.lock'),'wx').catch(()=>{throw new Error('Campaign already started or locked; do not retry automatically')});
  let metaLedger=null;
  try{
    const journalPath=join(dir,'journal.json');
    let journal;
    try{journal=JSON.parse(await readFile(journalPath,'utf8'))}
    catch(e){if(e.code!=='ENOENT')throw e;journal={version:1,planHash,attempts:[],results:[]}}
    const keys=plan.assignments.map(a=>a.provider+':'+a.caseId+'/'+a.windowId);
    const seen=validateCampaignJournal(journal,planHash,keys);
    // An interrupted or failed request is NEVER resent on resume.
    const persist=()=>writeFile(journalPath,JSON.stringify(journal,null,2)+'\n','utf8');
    await persist();
    metaLedger=await ledgerFactory();
    let halted=false;
    for(const x of inputs){
      if(halted)break;
      for(const provider of ['META','BASETEN']){
        const key=provider+':'+x.pair.pairId;
        if(seen.has(key))continue;
        // Baseten pricing not verified: strict request cap, but no monetary guarantee.
        if(provider==='META'){
          const spent=journal.attempts.filter(a=>a.provider==='META').reduce((s,a)=>s+a.reserveUsd,0);
          if(spent+x.metaReserve>MONEY/2){halted=true;break}
          if(!await metaLedger.reserve(x.metaReserve)){halted=true;break}
        }
        journal.attempts.push({key,pairId:x.pair.pairId,provider,
          reserveUsd:provider==='META'?x.metaReserve:null,status:'ATTEMPTED_NO_RETRY'});
        seen.add(key);
        await persist(); // persist before paid call
        let record={key,provider,status:'FAILED',estimatedActualUsd:null};
        try{
          let result;
          if(provider==='META'){
            result=await metaCaller({show:x.project,apiKey:process.env.MODEL_API_KEY,
              analysisMode:'THEATRICAL',analysisWindowStart:x.windowStart,
              scriptLanguage:x.c.language,designMode:'literal',performanceKind:x.c.type,
              documentKind:x.c.documentKind,model:'muse-spark-1.3'});
            if(result.coverage?.analyzedWindowIds?.[0]!==x.pair.windowId)throw new Error('Unexpected model coverage');
            record={...record,status:'COMPLETED',
              events:[...result.details,...result.observations].map(event),
              durationMs:result.diagnostics?.durationMs??null,
              usage:result.diagnostics?.usage??null,
              estimatedActualUsd:reportedMetaUSD(result.diagnostics?.usage)};
          }else{
            result=await basetenCaller({prepared:x.prepared,apiKey:process.env.BASETEN_API_KEY});
            if(result.status!=='COMPLETED')throw new Error('Incomplete model response');
            record={...record,status:'COMPLETED',
              events:[...result.classified.details,...result.classified.observations].map(event),
              durationMs:result.diagnostics?.durationMs??null,
              usage:result.diagnostics?.usage??null};
          }
        }catch{
          record.status='FAILED_NO_RETRY';
          halted=true;
        }
        journal.results.push(record);
        await persist();
        if(halted)break;
      }
    }
    const summary=outputSummary(plan,journal);
    await writeFile(join(dir,'summary.json'),JSON.stringify(summary,null,2)+'\n','utf8');
    await writeFile(join(dir,'summary.md'),[
      '# RunQ Level 1 paid campaign', '',
      'Provisional gold only; not production-certified.',
      'Attempts: '+summary.attempted+' / '+plan.assignments.length+'. Completed: '+summary.completed+'.',
      'Meta estimated usage: $'+summary.metaEstimatedActualUsd+'. Baseten: unknown.',
      'Combined actual spend: unknown. $5 target is NOT a guaranteed cap.',
      '', '| Pair | Meta | Baseten |','|---|---|---|',
      ...summary.rows.map(r=>'| '+r.pairId+' | '+r.META+' | '+r.BASETEN+' |'),'',
    ].join('\n'));
    return summary;
  }finally{await metaLedger?.close();await lock.close()}
}
