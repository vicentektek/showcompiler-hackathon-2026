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
