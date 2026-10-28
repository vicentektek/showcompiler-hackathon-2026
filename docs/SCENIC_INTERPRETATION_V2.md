# RunQ — Scenic Interpretation V2 (advisory milestone)

This is a **pure, offline, structured-observation classification** module: `src/core/scenicInterpretationV2.mjs`.
It does **not** parse theatrical intent from free-form language, make model calls,
approve AI results, create an executable cue, alter the V1 event scorer or edit playback.
Only the trusted operator/review pipeline can later bind a proposed action to an
audio asset and make it executable. The module never directly calls GO/STOP.

## Versioned contract

`interpretScenicObservations({scriptText, observations})` returns
`{version:2,status:'ADVISORY_ONLY',scriptLineCount,items}`.
Every observation needs a valid source `lineId` and an `intent` from
`PLAY|STOP|CONTINUE|SILENCE|TRANSITION`. Optional structured evidence
includes `sourceCueId`, `playbackState` (`ACTIVE|ENDED|UNKNOWN`),
`playbackMode` (`ONE_SHOT|LOOP|SUSTAINED|UNKNOWN`),
`change` (`NONE|GAIN|FADE|LOOP`), `requestAction` and `targetCueIds`.
Unrecognized fields and invalid line references are rejected.

Outputs distinguish `EXECUTABLE_ACTION`, `SCRIPT_NOTE` and
`OPERATOR_SUGGESTION`. **EXECUTABLE_ACTION means an action-shaped proposal,
not permission to execute**; every item has `approvalStatus:
'PENDING_OPERATOR_REVIEW'` and any `operation` object is inert metadata.

## Operator policy

- One-shot already `ENDED`: a subsequent STOP is informational. The
  existing `pastel-company` *loop* fixture and its STOP remain unchanged.
  A separate one-shot regression lives in the V2 tests.
- An unresolved scene transition produces a suggestion; it never invents
  an explicit STOP, overlap decision or fade. This includes the patinaje
  case. The operator chooses natural end, overlap or crossfade.
- SILENCE without a requested action is a note. With action requested but
  no selected targets it is a suggestion. With targets, it is **only an
  unapproved proposal to stop those playback cues**. There is no master mute.
- CONTINUE without an actual playback parameter change is a note. GAIN,
  FADE or LOOP change is a configurable action-shaped proposal. Missing
  source cue yields an operator suggestion instead of a fabricated target.
- PLAY yields only a proposal placeholder, not a playable audio asset.

## Unchanged interfaces and next steps

V1 scoring, existing 16-case Level 1 corpus and qualification gold,
Meta/Baseten provider prompts, GUI, project schema, operator queue and
emergency STOP are untouched.

Review requirements before connecting this to production: validate the
structured-observation producer and its provenance, bind proposed actions
to known playback cues/assets via existing review controls, choose whether
to extend evaluation gold to a separately versioned V2 format, and manually
approve case annotations. Until then, V2 is **not** a model-quality score.

Offline validation:
`node --test test/scenicInterpretationV2.test.mjs`,
`npm run check:syntax`, `npm test`, `npm run qa:codex`.
No billable provider calls or remote infrastructure are required.
