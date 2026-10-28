# AI Studio — Decision-first UX review and acceptance contract V2

Status: **design only**. Published 28 October 2026. This is an addendum to RUNQ_AI_STUDIO_STAGECRAFT_UX_2026-10-28.md. No interface, provider call, cost, GO/STOP or show document changed by this specification.

## Diagnosis

The previous concept is useful visually but overfits a successful, linear journey. It lacks explicit **Defer / Dismiss / Undo / Alternative interpretation / New sound take / Keep old take / Compare / Apply to library / Replace a specific track**. Its A/B/C cards and illustrative waveform are mock data and MUST NOT be mistaken for model results.

Separate five decisions: (1) is the proposed cue useful? (2) is the interpretation correct? (3) is a candidate WAV usable? (4) should the verified WAV enter the show library? (5) which exact cue and track, if any, receives that resource? None of these prepares NEXT or initiates GO.

## User-facing verbs

| Task | Recommended action label | Semantics |
|---|---|---|
| Make cue | Create cue | Move approved/editable suggestion into manual show authoring |
| Repair suggestion | Edit proposal | Update name/type/trigger before creating |
| Ask for another textual direction | Propose another interpretation | New proposed interpretation, not a generated WAV |
| Set aside without deleting | Defer | Recoverable operator queue |
| Dismiss irrelevant idea | Dismiss | Non-destructive suppression, with Undo or filtered history when supported |
| Pick alternate WAV | Compare existing takes | No new model call or cost |
| Refine acoustic brief | Edit sound description | Local draft, no sound generated |
| Request new file | Generate one new take | New remote request, explicit spend/authorization; preserve previous takes |
| Mark WAV good enough | Accept this sound | Human-reviewed job result, NOT library import |
| Retain as alternate | Keep for later | Unassign local choice; no backend REJECT |
| Permanently reject WAV | Reject generated take | Terminal backend decision, show clear consequence |
| Store in show | Add to library | Hash-verified binary import, no cue assignment implied |
| Use in cue | Add as track / Replace track | Explicit show cue and action ID; never infer from NEXT |
| Test locally | Preview | Shares default system output at low level; never GO |

Keep advanced seed, job ID, provider information and technical sound format behind a real disclosure; for novice users show the task, context, sound and next action.

## Proposal state machine

PENDING -> CREATED | DEFERRED | DISMISSED. DEFERRED -> PENDING. DISMISSED -> PENDING only when operator review data supports restoration. CREATED -> cue editing via existing show authoring, not reverse conversion to nonexistent proposal.

- Source Lxx and quoted evidence always visible; label explicit stage direction vs creative inference.
- Detect duplicates and offer merge/use existing cue, not silent double-create.
- Never rely on fabricated confidence percentages.
- After action, preserve the selected row in view long enough for review, with a next-pending link and an accessible status change. Do not silently jump cue contexts while the user is editing.
- Manual creation and asset selection remain alternatives even when AI is unavailable.

## Sound state machine and immutable takes

Draft prompt -> explicit authorization -> SUBMISSION_UNKNOWN/QUEUED/RUNNING -> READY_FOR_REVIEW -> ACCEPTED_FOR_MANUAL_IMPORT or REJECTED. Cancellation goes through CANCEL_REQUESTED; only confirmed CANCELLED is final. A failure does not delete the operator's prompt.

- Every remote request ID corresponds to at most one generated WAV. Never render three synthetic results as three actual AI candidates.
- Regenerate means **new request + new authorization + potential cost**. Preserve all old request IDs, prompt versions and verifiable WAVs.
- Show actual provider state, not fabricated progress percent or ETA.
- If one job is active or uncertain, disable new generation and offer **Check status, don't resubmit**.
- The initial implementation permits one active/uncertain job, up to three starts a day, SFX/environment 1–12 seconds only. A three-request quota is NOT a financial budget cap.
- The API currently exposes job-by-ID retrieval, NOT a durable global listing endpoint. Build a listing/known-ID adapter before promising a full history view.
- ACCEPTED_FOR_MANUAL_IMPORT and REJECTED are terminal under the current journal; do not promise a backend-level Undo. «Not using this accepted file in this cue» is a different, local choice.
- The SFX API requires an Lxx. Sound creation from a library without a script needs a defined MANUAL source contract or must be disabled with an explanation; never invent an L1.

## Workspace composition

### Script Review
Original script and numbered evidence left, actionable proposals in the middle, editable one-cue inspector right. Default actions for a pending item: **Create cue**, **Edit**, **Defer**; other interpretation and Dismiss in a contextual menu. Review counts and filters derived from real state (Pending / Created / Deferred / Dismissed / All).

### Sound Design
Show preserved cueId+actionId+Lxx in header. Audio waveform + audition central ONLY after verified file data exists; otherwise an informative empty state with **Choose library WAV / Import local / Generate one take / Work without audio**.

The acoustic description is human-editable and may show fields such as material, attack, distance, acoustic space and tail as **prompt assistance**, not necessarily model-supported independent knobs. Current provider allows duration 1–12s; seed is an advanced option. Compare takes only if actual saved WAVs exist and identify each version's origin. Use low-gain audition and a clear STOP.

For a disappointing take, show **Edit description**, **New variation (costs another request)**, **Keep as alternate**, **Do not use**, **Trim locally**, **Choose existing**. Avoid a single ambiguous Regenerate action.

### Review / Apply
Show separate approvals for cue and WAV. After a verified accepted WAV:
1. Add to show library only
2. Add as track to explicit cue
3. Replace explicit existing track (disabled if none exists)

Present the target cue's label/ID and action. On success, say exactly what was stored and that NEXT GO did not change. Never attach to a newly selected cue if the user switched project or cue while generation ran.

## Important recovery cases

- No suggestions, uncertain source line, AI omission, false stage direction, duplicated cue, edited source script or unavailable provider.
- Good take with a bad section (trim locally), unusable take, repeated request, one job already in progress, provider timeout, crash-restarted uncertain job, cancellation still pending, quota exhausted, missing cost data.
- User changes cue/project or deletes target; prompt has unsaved edits; old accepted take exists; WAV is invalid or hash doesn't match; sound is too loud/silent or contains unwanted voices.
- Reopen ZIP before import (sound not included) vs after confirmed import (binary included).
- Multiple cues reuse a single WAV but maintain independent playback properties.
- 1093x614, 200% zoom, screen reader status, keyboard focus, EN/ES and Space reserved for operator GO.

## Novice and expert acceptance tasks

**Novice** without help should find Analyze selected scene, discard a wrong cue safely, create a cue, choose import when SFX is offline, listen to a file and assign it without changing NEXT GO.

**Expert** should review at least 25 proposals efficiently, detect duplicates, edit cues before approval, compare genuine sound versions, preserve a good older take while regenerating, assign to the correct track, reopen export and verify cue/audio identity.

**Non-negotiable automated assertions:** no side effect from selection/navigation; no duplicate billed requests; no misleading A/B/C; no import without accepted hash-valid WAV and explicit target; no automatic paid request on page load/GO; no handling of remote uncertainty as confirmation of cancellation; no direct sound mutations while a cue is live.

## Delivery scope

P0: proposal creation/edit/defer/dismiss, contextual SFX prompt, one authorized job with correct status, genuine WAV preview, human review, existing show asset import and explicit target assignment, manual fallback.

P1: real durable take history, prompt versions, actual A/B compare, scoped corrections, batch proposal review with preview, optional rejection reasons.

P2: specialized acoustic comparison, larger-scale sound library workflows and provider capabilities beyond the verified SFX pilot.

**This is the target UX contract, not a claim of implementation or validated user-study results.**
