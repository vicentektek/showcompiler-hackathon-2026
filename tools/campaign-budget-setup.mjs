#!/usr/bin/env node
/**
 * Initializes ONLY the local authorization/budget file for the specific
 * operator-approved $30 campaign. Never sends provider requests.
 *
 * Authorization comes from a local operator command; committed plans remain
 * DRAFT. Refuse to overwrite/reinitialize/reset a prior budget.
 */
import {open, mkdir, readFile} from 'node:fs/promises';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {
  acquireGlobalSpendLedger, checkLedgerAuthorization, globalLedgerDefaultPath,
} from '../src/qa/globalSpendLedger.mjs';
import {validateMassCampaign} from './mass-campaign-preflight.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifestFile=join(root,'fixtures/qa/mass-campaign-manifest-v1.json');
export const commands=Object.freeze(['--initialize-approved-30-usd','--status']);

export function buildLocalCampaignAuthorization(manifest,{approvedAt=new Date().toISOString()}={}){
  const plan=validateMassCampaign(manifest);
  if(plan.budgetUsd!==30||manifest.campaignId!=='runq-hackathon-v9-mass-eval-20261029') {
    throw new TypeError('UNRECOGNIZED_CAMPAIGN_APPROVAL');
  }
  const state={
    schemaVersion:1,campaignId:manifest.campaignId,
    authorizationStatus:'LOCAL_OPERATOR_APPROVED',
    approvedAt,totalCapUsd:30,
    capsUsd:Object.fromEntries(plan.stages.map(p=>[p.provider,p.estimatedBudgetUsd])),
    reservations:[],
    note:'Operator-approved maximum planning reserve. Does not guarantee provider billing cap. No API requests here.',
  };
  checkLedgerAuthorization(state,manifest.campaignId);
  return state;
}

export async function initializeCampaignBudget(manifest,{file=globalLedgerDefaultPath()}={}){
  const state=buildLocalCampaignAuthorization(manifest);
  await mkdir(dirname(file),{recursive:true,mode:0o700});
  let handle;
  try {handle=await open(file,'wx',0o600);}
  catch(e){
    if(e.code==='EEXIST')throw new Error('LOCAL_BUDGET_ALREADY_EXISTS_DO_NOT_RESET');
    throw e;
  }
  try{
    await handle.writeFile(JSON.stringify(state,null,2)+'\n','utf8');
    await handle.sync();
  }finally{await handle.close();}
  return {file,campaignId:state.campaignId,capsUsd:state.capsUsd,totalCapUsd:state.totalCapUsd};
}

async function main(args=process.argv.slice(2)){
  if(args.length!==1||!commands.includes(args[0])){
    throw new TypeError('Specify --initialize-approved-30-usd or --status. No paid execution available.');
  }
  const manifest=JSON.parse(await readFile(manifestFile,'utf8'));
  validateMassCampaign(manifest);
  if(args[0]==='--initialize-approved-30-usd'){
    const result=await initializeCampaignBudget(manifest);
    console.log('LOCAL_BUDGET_INITIALIZED_NO_REQUESTS: USD 30 total; Meta 12 / Baseten 8 / Modal 8 / Voice 2.');
    console.log('Private authorization file: '+result.file);
    console.log('No services contacted. Existing ledgers are NEVER overwritten.');
    return;
  }
  const ledger=await acquireGlobalSpendLedger({campaignId:manifest.campaignId});
  try{
    const result=ledger.status();
    console.log('LOCAL_BUDGET_STATUS_NO_REQUESTS: '+JSON.stringify(result));
  }finally{await ledger.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{console.error('BUDGET_SETUP_BLOCKED: '+e.message);process.exitCode=1;});
}
