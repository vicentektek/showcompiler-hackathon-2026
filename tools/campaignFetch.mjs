/**
 * Production design-only transport: one conservative reservation per request,
 * lock released before network I/O. Inject transports/ledgers in offline tests.
 */
import {randomUUID} from 'node:crypto';
import {isCampaignProviderProhibited} from '../src/qa/campaignPolicy.mjs';
import {acquireGlobalSpendLedger} from '../src/qa/globalSpendLedger.mjs';

export function estimateCampaignMetaReserve(options){
 if(options?.method!=='POST'||typeof options.body!=='string')
  throw new TypeError('INVALID_CAMPAIGN_REQUEST');
 const payload=JSON.parse(options.body);
 if(payload.model!=='muse-spark-1.3'||payload.stream!==false||payload.store!==false||
   !Number.isSafeInteger(payload.max_completion_tokens)||
   payload.max_completion_tokens<256||payload.max_completion_tokens>8192||
   Buffer.byteLength(options.body)>80000)throw new TypeError('UNSUPPORTED_CAMPAIGN_REQUEST');
 const inputBound=Buffer.byteLength(options.body)+16384;
 return Math.ceil((inputBound*1.25+payload.max_completion_tokens*4.25))/1e6;
}
export function createCampaignFetch(provider,{fetchImpl=fetch,ledgerFactory=acquireGlobalSpendLedger}={}){
 return async(url,options)=>{
  if(isCampaignProviderProhibited(provider))
   throw new Error('CAMPAIGN_PROVIDER_PROHIBITED');
  if(provider!=='meta'||String(url)!=='https://api.meta.ai/v1/chat/completions')
   throw new TypeError('UNSUPPORTED_CAMPAIGN_ENDPOINT');
  const estimatedMaximumUsd=estimateCampaignMetaReserve(options);
  const runId='design-'+randomUUID();
  const ledger=await ledgerFactory();
  try{
   const result=await ledger.reserve({requestId:runId,runId,provider,estimatedMaximumUsd});
   if(!result.accepted)throw new Error('CAMPAIGN_'+result.reason);
  }finally{await ledger.close();}
  return fetchImpl(url,options);
 };
}
export const campaignMetaFetch=createCampaignFetch('meta');
export const campaignBasetenFetch=createCampaignFetch('baseten');
