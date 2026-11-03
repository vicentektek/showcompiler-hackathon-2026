# RUNQ — Final hackathon scope and recording plan (2026-11-03)

## Source of truth
Base: `verified-working-2026-11-02` (`6d1d65d` per release documentation). This branch is a planning branch, not an implemented release. Check local uncommitted changes and more recent integrated work before cherry-picking or editing application code.

## Approved scope change
Remove in-app audio generation from the submitted user experience. Preserve local audio import, library, cue assignment, waveform editing, playback, fades, loops, STOP/GO and ZIP portability. Keep AI audio *planning*: suggest sound type, scene intent, timing, duration, texture, ambience, transitions, and a copyable ES/EN prompt for an external generator. Do not claim that RUNQ creates audio files. Do not remove sound-generation code destructively before dependency audit; disable exposure and outbound invocation first.

## Implementation checklist
1. Inventory Modal endpoints, environment variables, requests, buttons, labels, background jobs, AI workflows, demo fixtures, tests and docs with file:line evidence.
2. Separate `soundPromptSuggestion` from `generateAudio` as a clear UI action; return structured suggestion and copyable prompt; do not auto-call an external provider.
3. Replace generate/retry/cancel sound-generation UI with `Suggest sound`, `Copy prompt`, `Import audio`, and `Assign to cue`. Preserve unrelated playback cancellation.
4. Ensure auto-prepare-whole-show cannot call Modal, even through legacy paths. Explicitly test zero external audio-generation requests.
5. Remove dead controls, loading spinners, misleading provider status/cost displays and broken routes; keep the existing visual identity and operational safety.
6. Verify import->assign->edit->GO/STOP->export->reimport and script->Muse proposal->review->cue->voice-follow rehearsal.
7. Check ES/EN copy, empty/error states, 1920x1080 capture, smaller viewport, accessibility, secrets, licenses and final QA on the exact release SHA.
8. Update README, SUBMISSION_OVERVIEW, DEMO_SCRIPT_3_MIN, RELEASE_CHECKLIST, provider setup, architecture and any screenshots claiming in-app audio generation.

## Three-minute demo
- 00:00–00:18: theatre sound preparation problem and RUNQ introduction.
- 00:18–00:45: create/import script; line provenance.
- 00:45–01:21: real Muse Spark cue proposals, review/accept, contextual edits.
- 01:21–01:39: AI suggests sound and external prompt; import licensed/prepared audio and assign it.
- 01:39–02:06: cue editor, fades, NEXT, GO, STOP.
- 02:06–02:48: real voice-following rehearsal, recognized cue phrase, automatic cue execution; demonstrate repetition/skip only if verified.
- 02:48–03:00: RUNQ From Script to Stage and end card.

Use genuine captured interactions, authorized/licensed media, no exposed secrets, and accurate English narration/subtitles. Never imply a prerecorded run is a live provider call.

## Acceptance gates
- No visible nonfunctional buttons in the recorded flows.
- No Modal outbound calls in the submitted user journeys, including auto-prepare and retry.
- Meta Muse integration remains real and review-gated.
- Rehearsal automation is demonstrably armed/disarmed with manual override; no unattended-live safety claim.
- Offline demo works without API keys, with an explicit label where canned data is used.
- All tests and real screenshots recorded against final commit; historic 817 passing tests are not fresh evidence.
- Public repository publication requires rights, secret-history and owner approval; do not alter visibility automatically.

## Current limitations
No local runtime, working-tree state, current integrated feature branch, or fresh test run has been inspected from this documentation branch. Do not infer code-level completion from this document.
