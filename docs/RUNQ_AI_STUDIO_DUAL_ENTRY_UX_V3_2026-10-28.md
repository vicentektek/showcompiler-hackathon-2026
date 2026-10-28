# RunQ AI Studio — UX V3: script-first AND sound-first
Date: 28 October 2026. Status: public-safe product specification only; no runtime changes.

## Decision
Remove the mandatory standalone incorporation page. The same Script Review or Sound Design workspace that produced the content must allow completing its use. Cue creation is OPTIONAL until the operator chooses to do it. Never imply that an AI proposal is already a cue, that a sound take is already in the library, or that an attached asset is the prepared NEXT GO.

## Three complete journeys

### A. Script -> cue -> sound
Review original Lxx. Create cue with empty/missing audio. Open Sound Design with cueId and Lxx preserved. Audition one REAL WAV. Use this sound… suggests "Add track to Q014"; Replace named track and Library-only remain available. Confirm, retaining manual transport state.

### B. Script -> sound -> cue
Review original Lxx and choose "Design sound first". Persist an independent draft with proposal ID, source lines, prompt and takes; no Q identifier is assigned yet. After verifying and listening to a WAV choose "Use this sound… -> Create cue and add sound" in the SAME Sound Design inspector. Alternatively return to Script Review, where a previously selected sound appears as "Create cue and add sound" without a separate import screen. Cue receives its real ID only on creation and retains original Lxx.

### C. Sound -> library or cue, without script
Choose "Create independent sound". Do not force a fictitious script Lxx, cue or approval step. Once a real WAV exists "Use this sound…" defaults to "Save only to library", with other clear options "Create cue and add sound" and "Use in existing cue".

IMPORTANT CURRENT API LIMIT: standalone remote SFX requires Lxx. The backend needs a first-class MANUAL source contract before sound-only remote generation can be enabled. Until then, allow importing an audio file and choosing a library asset, and disable unsupported remote generation with an explanation. Never synthesize L1.

## Destination action matrix

| Source context | Suggested destination | Alternatives |
|---|---|---|
| Script proposal, no cue | Create cue + first audio track | Existing cue, library only |
| Script proposal, cue exists | Add to named cue | Replace explicit track, new cue, library |
| Sound independent | Library only | Create cue, existing cue |
| Existing cue with >=1 track | Add track | Replace selected track, library |
| No decoded, verified WAV | No "Use" button | Authorized generate, local import, existing library |

"Use this sound…" opens a contextual inline choice panel, not a new workspace. CTA labels state precise consequences, including target cue and track. Closing it returns to listening with no lost take or prompt. A one-button final confirmation can perform multiple underlying safe steps only if its label and confirmation describe those steps.

## Draft/state contract

One persistent draft can contain:
- creationDraftId
- sourceKind SCRIPT or MANUAL
- optional immutable scriptRef with document and Lxx
- optional proposalId
- optional cueId (may be created AFTER selecting audio)
- promptDraft and promptVersion
- soundJobIds and selectedTakeId
- optional verifiedAssetId
- destinationIntent NEW_CUE | EXISTING_CUE | LIBRARY_ONLY
- explicit targetCueId and targetTrackId only when chosen

Cue ID, sound request ID and audio asset ID must never be conflated. Selection or navigation does NOT prepare or execute a cue.

## Backend safety and failure behavior

A reviewed AI WAV still requires terminal job approval, valid bytes/hash and explicit import. "Create cue and add sound" is one understandable UI action, but in the backend it must validate the project and take, import/deduplicate bytes, create/validate cue, attach the exact track, and record the result. If attachment fails after successful import, preserve the verified file in the library with "Retry assignment". Never retry or re-bill the generation. Do not redirect to a different selected cue when the user changed projects or tabs.

One remote request corresponds to at most one true WAV candidate. Multiple displayed takes must come from real files/jobs. A new generation requires explicit authorization and possible cost; reusing a take or editing existing audio does not. Show truthful QUEUED/RUNNING/SUBMISSION_UNKNOWN/CANCEL_REQUESTED/READY statuses with no fabricated progress or ETA.

## Novice and professional user experience

Novice: "Create cue now", "Design sound first", "Listen", "Use this sound…" with outcome-oriented names. Conceal seed, request IDs and model parameters in Advanced. No fake waveforms, forced wizard or confusing multiple Accept buttons.

Professional: stable context while switching workflows; cue+track targeting, library reuse, honest multiple real takes, an actual WAV editor, keyboard and EN/ES; no hidden destructive replacement.

## Acceptance tests

1. Script -> cue -> WAV -> add named track, no cue duplicated.
2. Script -> WAV -> create cue and add in one contextual action; Lxx preserved.
3. Return to Script with a reviewed WAV -> "Create cue and add sound" works inline.
4. Independent WAV -> library only, then optional cue creation.
5. With 2 possible cue targets, toggling Add/Replace never resets the user-selected target.
6. Several takes remain associated with their original proposal/draft, not the newly selected cue.
7. Provider offline/unknown status cannot cause repeat paid job.
8. Corrupt WAV, wrong target and mid-import failures preserve show and sound for recovery.
9. No navigation/preview/approval automatically changes NEXT GO or fires GO.
10. Interface operates at 1366x768, 1093x614, 200% zoom and keyboard only.

## Supporting research
NN/g Progressive Disclosure: https://www.nngroup.com/articles/progressive-disclosure/
Microsoft Human-AI Interaction Guidelines: https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/

This document intentionally contains no competitor or earlier-repository names.
