# RUNQ assistant V3 architecture

## Frozen product reference

Remote `feat/runq-ai-campaign-100-2026-10-31` was still
`6325e77c98ab4b072e8219028529a877110d545e` on 2026-11-01.
The newer local direct-AI changes are preserved in isolated baseline `726f9c9`.
The original checkout, its preview and historical ledgers are not replaced.
No indiscriminate merge from the divergent long-campaign branch was made.

The baseline developer prompt is byte-for-byte preserved for A:
SHA-256 `54d5ab4c648d13922bef77280af9bce6c758506c9864dedec394e5924eb587b0`.
The original structured operation schema, low reasoning effort and 2,200-token
completion limit are retained for comparisons.

## Implemented intelligence path

1. The assistant reads the current project, generation, selected cue, prepared
   cue, running cue IDs and local asset availability from the existing read-only
   application state event. Reading does not move NEXT or call transport.
2. `retrieveAgentEvidence` ranks exact cue numbers, Lxx references, selected and
   prepared cues, scene boundaries and lexical evidence. It uses the existing
   scene planner; no embedding service or speculative semantic search is added.
   Pagination is deterministic and bounded. Missing line/scene references are
   explicit. Dialogue before requested cue anchors is available for trigger review.
3. `buildExpertAgentContext` combines relevant verified capabilities, current
   counts/diagnostics, a bounded evidence page and confirmed local memory. Total
   serialized context is capped below 14,500 UTF-8 bytes, not just characters. Essential requested lines
   are protected during compaction; impossible packs fail explicitly.
4. The server replaces client capability claims with its verified catalogue.
   Forged/cross-project memory is rejected before inference. The expert
   instructions distinguish selected/prepared/active state, partial retrieval,
   approved preferences, pending plans, applied changes and revoked decisions.
5. Model output still uses the existing validated proposal contract. Expert
   replies cannot cite Lxx lines absent from their actual evidence page. Cue IDs
   and voice-trigger source evidence are validated; a reply never applies edits.

## Memory and privacy

Memory is local to this browser and project identity (ID, name and original
script fingerprint); project revision separately tracks the normalized show.
The project JSON schema remains backward compatible. Reopening the same
project restores confirmed memory; a different name/script with the same
default ID does not inherit it. Local storage is not a portable memory archive.

`Remember that ...` / `Recuerda que ...` explicitly records a confirmed decision
without invoking Meta. `Forget all remembered decisions` /
`Olvida todas las decisiones recordadas` revokes it without editing the show.
An AI edit proposal stores only the bounded user task as PENDING, not the raw
model response as fact. Explicit Apply records an APPLIED batch; Undo and
explicit cancellation record revocation. Outdated references need revalidation.
Maximum: 32 entries, 12 provided to the model, 300 characters per entry,
30-day expiry. Invalid/expired storage fails explicitly and is not reset.

No private scripts, credentials or raw provider responses belong in campaign
logs or committed evidence. Corpus data is original synthetic material.
The memory fingerprint is a deterministic isolation mechanism, not a
cryptographic authentication mechanism. State still originates from the local
operator and must not be treated as a trusted remote database.

## Boundaries

This is retrieval/context/prompt engineering, not model weight training.
It does not implement native ASIO, lighting/video control, acoustic monitoring
or professional show certification. Sound generation and voice/ASR are not
called by this campaign. There is no model-executable GO/STOP, provider fallback,
automatic approval, automatic playback or automatic merge.

The assistant is still restricted to its existing design workspaces. Runtime
facts are read there; this change does not enable conversational editing in Live.
Large scene-wide requests may need several evidence pages and reviewed batches.
Unknown audio availability and omitted evidence remain unknown.
