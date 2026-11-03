# Voice Follow — integration specification (draft, 2026-10-28)

## Position in existing interface
- **Rehearsal** is the home for Voice Follow. Header status: OFF / LISTENING / MATCH FOUND / NO SIGNAL / ERROR. Input selector and simulation/remote/local provider options; default OFF.
- **Script** gains a passive current-line marker and a small adjacent last-transcript view. Always retain source L#; scrolling manually does not arm any cue.
- **Cue Editor** gains a collapsed *Voice trigger (optional)* section: enabled, source line, exact spoken trigger, preview normalized text, and Test phrase. Editing requires explicit Save; never auto-creates cues.
- **Operation** gets a compact, read-only voice suggestion strip showing source text, L#, match score, and **Prepare** (manual confirmation). The existing GO, STOP ALL and queue remain authoritative.

## Safety and interaction contract
1. OFF by default. Permission to use a microphone is explicit. API keys never enter browser bundles.
2. Replay uses prerecorded transcripts, not the microphone or server. Never call player.go, queue completion or external endpoints.
3. Engine emits `SUGGEST_PREPARE`, not `GO`. A separate explicit operator click may choose **Prepare**, preserving manual queue rules.
4. Transcript must be final, timestamped, recent, and unique within a bounded script window. Ambiguity produces a nonactionable warning.
5. Manual scene corrections reset context but do not automatically rearm previously consumed cues; rearm is explicit.
6. Do not confuse token similarity with ASR confidence. Display “text match score”, not “voice confidence”.
7. Starting/stopping recording must show consent state. Explain off-device processing if remote Muse is selected.
8. Failure or disconnect: keep manual GO/STOP fully functional.
9. Labels must be translated via existing i18n structure. All controls keyboard-accessible and focus-visible.
10. Live auto-GO is explicitly out of scope.

## Roadmap
**Phase A (this branch):** offline matcher, deterministic replay runner, bounded fixture and unit tests. No UI wiring.
**Phase B:** read-only Rehearsal pane with timeline, selection and simulated transcript playback, separate tests.
**Phase C:** Meta Muse adapter with authorization, budget/timeout ceiling, no retry, and measured timings.
**Phase D:** operator-approved Prepare integration, browser end-to-end and regression tests.

## Acceptance scenarios
- Exact phrase => one suggestion; repeated phrase => none without explicit reset.
- Two indistinguishable triggers => ambiguity, no suggestion.
- Late or provisional transcript => ignored.
- Cue outside current window => ignored.
- Network unavailable => manual transport unchanged.
- An actual GO is **never** inferred from the ASR stream.

## Demo script
1. Open the theatre show in Rehearsal and start *Replay demo*.
2. Highlight actor line and show a final transcript with L#.
3. Show C14 as a suggestion; click **Prepare** only when enabled in Phase D.
4. Click the existing GO manually.
5. Replay a repeated phrase and demonstrate no duplicate suggestion.

## Integration notes
Existing UI is vanilla JS in `src/ui/app.mjs` with `availableWorkspaces` containing `rehearsal`, `script`, `cues`, `operation`. Existing `src/core/script.mjs` supplies stable L#.
Do not edit the audio generation flow, the player, or project schema until separately reviewed.

## Implemented UI slice (2026-10-28, draft PR #84)

- Rehearsal renders a compact bilingual panel above the existing two-column script/cue workspace. The current transport remains unchanged.
- **Example scene** loads the checked-in JSON fixture through the local HTTP allowlist and replays final/duplicate/incomplete transcripts.
- **Current show** creates an explicitly synthetic event trace from saved operator `trigger` text and valid source `L#` references. A manual focus transition is simulated when two cues are too far apart.
- Buttons: Play, Pause, Next Event, Restart. Switching workspaces or hiding the tab pauses the simulation; project changes require Restart.
- The panel displays a local script excerpt, transcript, source line, text similarity and a read-only cue suggestion plus recent event log.
- For current-show scenarios only, a read-only DOM bridge highlights the corresponding original line. It never invokes the GO queue or playback.
- A new offline test checks route wiring, safety constraints, scenario building and a fixture replay. Re-run the complete suite on the PR branch.

**Accuracy disclaimer:** Current-show replay is generated from configured trigger text, so its textual match results cannot measure real ASR quality. The UI must not display them as microphone confidence. The simulated operator focus change is also not an automatic model inference.

**Remaining:** Actual microphone provider, ASR partial/final timing, explicit Prepare action, persistent voice trigger schema review, browser acceptance testing and live security/latency measurement.
