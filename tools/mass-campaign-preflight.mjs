#!/usr/bin/env node
/**
 * Read-only campaign preparation + spend safety assessment for RunQ.
 * No network imports, no provider clients, no paid execution path.
 *
 * This is deliberately NOT a live runner: existing provider scripts currently
 * cannot enforce a single shared budget and synchronized lock across clones.
 */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifestPath=join(repoRoot,'fixtures/qa/mass-campaign-manifest-v1.json');
const goldPath=join(repoRoot,'fixtures/qa/seminar/corpus-v1.json');
const outRoot=join(repoRoot,'artifacts/mass-campaign-prep');

export const PROVIDERS=Object.freeze(['meta','baseten','modal','voice']);
export const TOKEN_RATES=Object.freeze({
  meta: Object.freeze({ inputPerMillion:1.25, cachedInputPerMillion:0.15, outputPerMillion:4.25 }),
  baseten: Object.freeze({ inputPerMillion:1.25, cachedInputPerMillion:0.15, outputPerMillion:4.25 }),
});
const REQ_COUNT=/^[1-9]\d*$/;
const pinnedSha=/^[a-f0-9]{40}$/;

function money(n){return Math.round((n+Number.EPSILON)*1e6)/1e6;}
function safeNum(n){return typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=10000;}

export function estimateTokenCost({provider,requests,inputTokens,outputTokens,cachedTokens=0}){
  const p=TOKEN_RATES[provider];
  if(!p || !Number.isSafeInteger(requests)||requests<1||requests>100000 ||
     !Number.isSafeInteger(inputTokens)||inputTokens<0 ||
     !Number.isSafeInteger(outputTokens)||outputTokens<0||
     !Number.isSafeInteger(cachedTokens)||cachedTokens<0||cachedTokens>inputTokens){
    throw new TypeError('Invalid token cost scenario');
  }
  return money(requests*(((inputTokens-cachedTokens)*p.inputPerMillion+
    cachedTokens*p.cachedInputPerMillion+outputTokens*p.outputPerMillion)/1e6));
}

export function validateMassCampaign(campaign){
  if(!campaign||typeof campaign!=='object'||Array.isArray(campaign)||campaign.schemaVersion!==1){
    throw new TypeError('Unsupported mass campaign manifest');
  }
  if(!/^[a-z0-9-]{5,90}$/.test(campaign.campaignId??'')||
     !pinnedSha.test(campaign.referenceSha??'')||
     campaign.state!=='DRAFT_NOT_AUTHORIZED'||
     campaign.referenceBranch!=='feat/runq-v9-dark-cue-workflow-2026-10-29'||
     campaign.goldCorpus!=='fixtures/qa/seminar/corpus-v1.json'||
     !campaign.globalBudget||campaign.globalBudget.currency!=='USD'||
     !safeNum(campaign.globalBudget.proposedCapUsd)){
    throw new TypeError('Invalid or already authorized campaign manifest');
  }
  if(campaign.globalBudget.authorizedCapUsd!==null||
     campaign.globalBudget.authorizationStatus!=='PENDING'){
    throw new TypeError('Never treat a committed planning file as payment authorization');
  }
  if(Object.keys(campaign.providers??{}).sort().join(',')!==[...PROVIDERS].sort().join(',')){
    throw new TypeError('Provider list differs from reviewed allowlist');
  }
  const list=[];let totalCost=0,totalRequests=0;
  for(const provider of PROVIDERS){
    const p=campaign.providers[provider];
    if(!p||!safeNum(p.estimatedBudgetUsd)||
       !Number.isSafeInteger(p.targetRequests)||p.targetRequests<1||p.targetRequests>300 ||
       p.currentRunnerReadyForMass!==false||
       !Array.isArray(p.taskGroups)||!Array.isArray(p.stages)||
       p.stages.length!==3 || p.stages.map(s=>s.id).join(',')!=='pilot,calibration,bulk'){
      throw new TypeError('Invalid stage declaration: '+provider);
    }
    const stageRequests=p.stages.reduce((acc,s)=>{
      if(!REQ_COUNT.test(String(s.requests))||s.requests>300)return Number.NaN;
      return acc+s.requests;
    },0);
    const groupRequests=p.taskGroups.reduce((acc,g)=>{
      if(!/^[a-z_]{5,65}$/.test(g.task??'')||!REQ_COUNT.test(String(g.requests)))return Number.NaN;
      return acc+g.requests;
    },0);
    if(stageRequests!==p.targetRequests||groupRequests!==p.targetRequests){
      throw new TypeError('Campaign stage/task totals disagree: '+provider);
    }
    totalCost+=p.estimatedBudgetUsd;
    totalRequests+=p.targetRequests;
    list.push({provider,targetRequests:p.targetRequests,estimatedBudgetUsd:p.estimatedBudgetUsd,
      stages:p.stages.map(x=>({id:x.id,requests:x.requests})),
      tasks:p.taskGroups.map(x=>({task:x.task,requests:x.requests})),ready:false});
  }
  if(Math.abs(totalCost-campaign.globalBudget.proposedCapUsd)>1e-6){
    throw new TypeError('Sum of provider allowances differs from global budget');
  }
  if(totalRequests!==380)throw new TypeError('Unreviewed total request count');
  if(campaign.offlineSuite?.targetFullJourneyRepeats!==20||
    campaign.offlineSuite?.localConversationalCommandCases!==40||
    campaign.offlineSuite?.requireNoNetwork!==true||
    campaign.offlineSuite?.requireOperatorStopAllTests!==true){
    throw new TypeError('Unexpected offline lab contract');
  }
  if(!Array.isArray(campaign.stoppingRules)||!campaign.stoppingRules.includes('any_unarmed_GO')||
     !campaign.stoppingRules.includes('global_budget_reserved_exceeded')||
     !campaign.stoppingRules.includes('duplicate_paid_job')){
    throw new TypeError('Missing critical stop conditions');
  }
  return Object.freeze({requestCount:totalRequests,budgetUsd:money(totalCost),
    stages:list,modelAndVoiceCalls:380,
    disclaimer:'Targets and software reservations are not invoice guarantees'});
}

export function assessReadiness(campaign,gold,{keysPresent={}}={}){
  const structure=validateMassCampaign(campaign);
  const reasons=[];
  const fail=(code,reason)=>reasons.push({code,reason});
  if(!pinnedSha.test(campaign.freezeBuildSha??'')){
    fail('BUILD_NOT_FROZEN','Commit to be tested is not pinned');
  }
  if(campaign.requiresHumanReviewedGold!==true || gold?.humanReviewStatus!=='HUMAN_REVIEWED_APPROVED'){
    fail('GOLD_UNREVIEWED','Gold annotations remain provisional');
  }
  if(campaign.holdoutReady!==true)fail('HOLDOUT_NOT_READY','Holdout not independently locked and reviewed');
  if(campaign.globalBudget.authorizationStatus!=='APPROVED' ||
     !safeNum(campaign.globalBudget.authorizedCapUsd)){
    fail('BUDGET_NOT_APPROVED','Exact dollar authorization missing; draft manifest never authorizes spend');
  }
  if(campaign.globalBudget.centralSharedLedgerReady!==true){
    fail('CENTRAL_LEDGER_MISSING','Meta ledger currently per checkout; Baseten has no shared monetary ledger');
  }
  if(campaign.globalBudget.allCloneLockReady!==true){
    fail('CROSS_CLONE_LOCK_MISSING','Multiple repository checkouts could spend concurrently');
  }
  if(campaign.globalBudget.providerDashboardLimitsConfirmed!==true){
    fail('DASHBOARD_NOT_CONFIRMED','Meta, Baseten and Modal billing controls not verified');
  }
  for(const {provider,ready} of structure.stages){
    if(!ready) fail(provider.toUpperCase()+'_MASS_RUNNER_NOT_IMPLEMENTED',
      'Existing runner cannot yet safely execute this full campaign');
  }
  const keys={meta:'MODEL_API_KEY',baseten:'BASETEN_API_KEY',
    modal:'MODAL_PROXY_TOKEN_ID_AND_SECRET',voice:'MODEL_API_KEY'};
  for(const [provider,name] of Object.entries(keys)){
    if(keysPresent[provider]!==true) fail(provider.toUpperCase()+'_KEY_NOT_VERIFIED',
      'Provider credential presence or access not verified: '+name);
  }
  fail('PAID_EXECUTION_DISABLED','This read-only tool cannot spend or launch live requests');
  return {readyForPaidExecution:false,blocking:reasons,
    reviewedRequestCount:structure.requestCount,proposedCapUsd:structure.budgetUsd};
}

export function estimateIllustrativeCosts(campaign){
  const v=validateMassCampaign(campaign);
  // EXAMPLES ONLY, not expected provider invoices.
  const tokenMix={inputTokens:2500,outputTokens:1000,cachedTokens:0};
  const meta=estimateTokenCost({provider:'meta',requests:160,...tokenMix});
  const baseten=estimateTokenCost({provider:'baseten',requests:100,...tokenMix});
  const voice=money(1800/3600*0.18);
  const modalGpuOnly=money(20*60*0.000306); // A10, 60 seconds/job; excludes idle CPU/RAM/egress and overhead
  return {kind:'NON_BINDING_EXAMPLE',sampleTokensPerRequest:tokenMix,
    exampleMetaUsd:meta,exampleBasetenUsd:baseten,
    exampleVoiceUsdForMax1800Seconds:voice,
    exampleModalA10GpuOnlyUsd:modalGpuOnly,
    note:'Actual tokens, reasoning, cold/warm time, GPU, CPU, memory, active time, concurrency, grants and provider invoices differ. Proposed $'+v.budgetUsd+' is a request for approval, not a billing cap.'};
}

export async function prepareMassCampaign(campaign,gold,{keysPresent={}}={}){
  const validated=validateMassCampaign(campaign);
  const original=await readFile(manifestPath);
  const goldBytes=await readFile(goldPath);
  const sha=x=>createHash('sha256').update(x).digest('hex');
  const assessment=assessReadiness(campaign,gold,{keysPresent});
  const cost=estimateIllustrativeCosts(campaign);
  return {generatedAt:new Date().toISOString(),
    kind:'PREPARATION_ONLY_NO_API_CALLS',campaignId:campaign.campaignId,
    manifests:{campaignSha256:sha(original),goldSha256:sha(goldBytes)},
    sourceCommit:campaingSafeSha(campaign.referenceSha),
    plan:validated,exampleCost:cost,assessment,
    actualSpendUsd:null,actuallyExecutedRequests:0,
    warning:'Read-only. No credentials, requests, deployments or paid jobs were launched.'};
}
function campaingSafeSha(sha){return pinnedSha.test(sha)?sha:'UNPINNED';}

function renderMarkdown(doc){
  const l=['# RunQ massive evaluation — READ ONLY PREPARATION', '',
    'Campaign: '+doc.campaignId,'', '**PAID EXECUTION BLOCKED BY DESIGN.**','',
    'Proposed operator allowance: $'+doc.plan.budgetUsd.toFixed(2)+' USD; this is NOT an invoicing hard ceiling.','',
    '| Provider | Requested calls | Planned maximum USD | Pilot / calibration / bulk |',
    '|---|---:|---:|---|'];
  for(const p of doc.plan.stages){
    l.push('| '+p.provider+' | '+p.targetRequests+' | $'+p.estimatedBudgetUsd.toFixed(2)+
      ' | '+p.stages.map(s=>s.requests).join(' / ')+' |');
  }
  l.push('','### Guardrails still missing','',
    ...doc.assessment.blocking.map(x=>'- '+x.code+': '+x.reason),'',
    '### Non-binding request cost example','',
    '160 Meta requests: $'+doc.exampleCost.exampleMetaUsd,
    '100 Baseten requests: $'+doc.exampleCost.exampleBasetenUsd,
    'Meta Voice Transcribe 1800 seconds: $'+doc.exampleCost.exampleVoiceUsdForMax1800Seconds,
    'Modal A10 GPU 20 × 60 seconds (GPU-only): $'+doc.exampleCost.exampleModalA10GpuOnlyUsd,
    '',
    'These examples do not include all provider charges, latency, special billing or included credits.',
    'The provider dashboards are authoritative. Do not manually run 380 requests from this plan.','');
  return l.join('\n');
}

export async function main(argv=[]){
  if(argv.length>1||argv.some(a=>a!=='--check')) throw new TypeError('Only optional --check is allowed. No live flags.');
  const campaign=JSON.parse(await readFile(manifestPath,'utf8'));
  const gold=JSON.parse(await readFile(goldPath,'utf8'));
  const keysPresent={
    meta:typeof process.env.MODEL_API_KEY==='string'&&Boolean(process.env.MODEL_API_KEY.trim()),
    baseten:typeof process.env.BASETEN_API_KEY==='string'&&Boolean(process.env.BASETEN_API_KEY.trim()),
    modal:Boolean(process.env.MODAL_PROXY_TOKEN_ID?.trim())&&Boolean(process.env.MODAL_PROXY_TOKEN_SECRET?.trim()),
    voice:typeof process.env.MODEL_API_KEY==='string'&&Boolean(process.env.MODEL_API_KEY.trim()),
  };
  const doc=await prepareMassCampaign(campaign,gold,{keysPresent});
  await mkdir(outRoot,{recursive:true});
  await Promise.all([
    writeFile(join(outRoot,'preflight.json'),JSON.stringify(doc,null,2)+'\n'),
    writeFile(join(outRoot,'preflight.md'),renderMarkdown(doc)),
  ]);
  console.log('MASS_CAMPAIGN_PREP_ONLY: '+doc.plan.requestCount+' planned provider calls / $'+doc.plan.budgetUsd.toFixed(2)+' proposed cap.');
  console.log('PAID_BLOCKED: '+doc.assessment.blocking.length+' conditions; 0 provider calls; no spend.');
  console.log('Reports: artifacts/mass-campaign-prep/preflight.{md,json}');
  if(argv.includes('--check'))process.exitCode=2; // deliberately not live-ready
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(e=>{
    console.error('MASS_CAMPAIGN_PREP_FAILED: '+e.message);
    process.exitCode=1;
  });
}
