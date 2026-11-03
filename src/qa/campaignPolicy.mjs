/** Historical campaign metadata. Runtime spending caps removed by owner 2026-11-02. */
export const CAMPAIGN_POLICY=Object.freeze({
 revision:'runq-meta-modal-100-20261031',
 totalCapUsd:100,
 capsUsd:Object.freeze({meta:65,modal:35,baseten:0,fireworks:0,voice:0}),
 requestCaps:Object.freeze({meta:400,modal:100,baseten:0,fireworks:0,voice:0}),
});

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
