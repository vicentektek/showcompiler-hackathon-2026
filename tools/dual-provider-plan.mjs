#!/usr/bin/env node
/** Offline dual-provider plan. No network, provider client, credentials or billable requests. */
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readLevel1Corpus} from './level1Corpus.mjs';
import {buildDualProviderPlan,renderDualProviderPlan} from '../src/core/dualProviderPlan.mjs';

export function parseDualPlanArgs(args=[]){
  const result={pool:'development',maxRequests:20,budgetUsd:20};
  const seen=new Set();
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(!['--max-requests','--budget-usd'].includes(key)||seen.has(key)||!args[i+1]) {
      throw new TypeError('Only --max-requests N and --budget-usd N are supported');
    }
    seen.add(key);
    const val=args[++i];
    if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(val))throw new TypeError('Invalid numeric argument');
    if(key==='--max-requests')result.maxRequests=Number(val);
    else result.budgetUsd=Number(val);
  }
  return result;
}

export async function runDualProviderOfflinePlan({rootDir=process.cwd(),options={}}={}){
  const corpus=await readLevel1Corpus({rootDir});
  const plan=buildDualProviderPlan(corpus,options);
  if(plan.pool!=='development') throw new Error('This CLI never exposes qualification cases');
  const dir=join(rootDir,'artifacts','dual-provider-plan');
  await mkdir(dir,{recursive:true});
  await Promise.all([
    writeFile(join(dir,'plan.json'),JSON.stringify(plan,null,2)+'\n','utf8'),
    writeFile(join(dir,'plan.md'),renderDualProviderPlan(plan)+'\n','utf8'),
  ]);
  return plan;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const options=parseDualPlanArgs(process.argv.slice(2));
    const plan=await runDualProviderOfflinePlan({options});
    console.log('OFFLINE ONLY / NO MODEL REQUESTS: '+plan.coverage.plannedWindows+
      ' matched pairs, '+plan.coverage.plannedRequests+' planned requests, '+
      plan.coverage.unplannedWindows+' deferred windows.');
    console.log('Private plan: artifacts/dual-provider-plan/plan.{json,md}');
  }catch(error){
    console.error(error.message);
    process.exitCode=1;
  }
}
