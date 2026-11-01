/** Operator-authorized campaign ceilings, not provider credit or invoices. */
export const CAMPAIGN_POLICY=Object.freeze({
 revision:'runq-meta-modal-100-20261031',
 totalCapUsd:100,
 capsUsd:Object.freeze({meta:65,modal:35,baseten:0,fireworks:0,voice:0}),
 requestCaps:Object.freeze({meta:400,modal:100,baseten:0,fireworks:0,voice:0}),
});

/** Unknown providers and zero-cap providers are prohibited (fail closed). */
export function isCampaignProviderProhibited(provider){
 return typeof provider!=='string'||!Object.hasOwn(CAMPAIGN_POLICY.capsUsd,provider)||
  CAMPAIGN_POLICY.capsUsd[provider]===0||CAMPAIGN_POLICY.requestCaps[provider]===0;
}

/**
 * Owner declaration recorded for this campaign. This is authorization to use
 * the bounded local budget, not a provider balance check or billing promise.
 */
export const CAMPAIGN_CREDIT_AUTHORIZATION=Object.freeze({
 ownerAttestedCredit:true,
 creditBasis:'owner_attestation',
 providerBalanceVerified:false,
 attestedOn:'2026-11-01',
});
