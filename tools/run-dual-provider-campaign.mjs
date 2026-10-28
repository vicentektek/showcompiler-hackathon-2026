#!/usr/bin/env node
/** Never invoked by CI, tests, app startup or offline planning. */
import {parseCampaignArgs,runCampaign} from './dualProviderCampaign.mjs';
try{
  const options=parseCampaignArgs(process.argv.slice(2));
  const result=await runCampaign({options});
  if(!options.live){
    console.log('OFFLINE ONLY: '+result.pairs+' pairs / '+result.plannedRequests+' requests.');
    console.log('Meta conservative reserve: $'+result.metaConservativeReserveUsd+'.');
    console.log('Baseten actual billing unknown; $5 is a target, not a hard provider cap.');
  }else{
    console.log('LIVE campaign: '+result.completed+' completed / '+result.attempted+' attempted.');
    console.log('Meta estimated actual $'+result.metaEstimatedActualUsd+'; Baseten actual unknown.');
    console.log('Private reports: artifacts/dual-provider-campaign/summary.{md,json}');
    if(result.remaining)process.exitCode=1;
  }
}catch{
  console.error('Campaign stopped safely. Check local credentials, journal/lock and limits. No automatic retry.');
  process.exitCode=1;
}
