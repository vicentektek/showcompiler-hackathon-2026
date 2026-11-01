#!/usr/bin/env node
/** Explicit paid opt-in only. Defaults to offline dry run. */
import {parseBasetenEvalOptions,runBasetenSeminarEval} from './basetenSeminarEval.mjs';
import {isCampaignProviderProhibited} from '../src/qa/campaignPolicy.mjs';
try{
  const opts=parseBasetenEvalOptions(process.argv.slice(2));
  if(opts.live&&isCampaignProviderProhibited('baseten')){
    console.error('Baseten is excluded by the current campaign policy. No key read, no request sent.');
    process.exit(2);
  }
  const report=await runBasetenSeminarEval({...opts,
    apiKey:opts.live?process.env.BASETEN_API_KEY:undefined});
  console.log('RunQ '+report.kind);
  console.log('Baseten requests: '+report.submittedRequests+' real / '+report.plannedRequests+' planned');
  console.log('Scored complete cases: '+report.scoredCases+'; halt: '+(report.haltReason??'none'));
  console.log('Usage/cost: inspect Baseten billing dashboard; local monetary estimation is unavailable.');
  console.log('Reports: '+opts.output+'/report.{md,json}');
  if(opts.live&&report.haltReason)process.exitCode=1;
}catch{
  console.error('Baseten evaluation stopped safely. Check flags, credentials and case ID. No automatic retry.');
  process.exitCode=1;
}
