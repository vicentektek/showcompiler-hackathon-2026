# Second-pass technical audit and cost-controlled development decisions
Date: 2026-10-27. RESEARCH / SPECIFICATION ONLY. No product code or test execution is implied by this document.

## 1. Source-verified reality

Codebase for the hackathon is browser ES modules + Node >=20 + Web Audio. It is NOT currently the native desktop application or a React/Vite project. Do not install frameworks or migrate components during an integration task.

The GitHub stack is not one integrated feature:
- PR 14 adds transactional self-contained show ZIP, synthetic PCM WAV generation, and a one-click demonstrator.
- PRs 15–17 add corrected audition expectations, a pure cue automation planner, and a cancellable scheduling coordinator.
- PR 18 adds the natural audio-end callback on a separate branch; it is NOT included in PR 19/20.
- PRs 19/20 add strict persistence and updateCueAutomation data validation; they do NOT add visual controls or apply automation settings to physical playback.
- PR 21 adds documentation and test contracts, not production code.
- Branch main still contains a planning scaffold. One feature branch or passing PR cannot be presented as the actual main application.

CI evidence reviewed:
- PR 14: 225/225 Node tests passed; demo ZIP generated and unzip -t passed.
- PR 18: 221/221 tests passed.
- PR 20: 223/223 tests passed.
These are independent suites. Test/browserPrototype.test.mjs relies substantially on static HTML/JS assertions plus an HTTP server test; not full click-through browser automation, real speaker checks, or automated window interactions.

The first-party model has a recorded human-authorized single successful live contract smoke. Repeating it does not add meaningful evidence without a new quality hypothesis.

## 2. HIGH-RISK difference between branches: actual audio cancellation

In PR 14, src/core/browserAudio.mjs includes cancelledPending and an explicit stopCue(cueId) path that rejects an in-flight asynchronous GO while AudioContext.resume() is pending. PR 18's natural-end branch and PR 20's automation branch lack this branch-local addition.

PR 18 introduces onCueNaturalEnd and checks run.stopping before emitting it. Integration must retain BOTH features: pending GO cancellation and suppression of natural-end callbacks on STOP/fade/STOP ALL. Wire onCueNaturalEnd through the facade in src/core/audioBackend.mjs if later used. A callback existing only in BrowserAudioEngine is not a fully wired feature.

Test the decisive race:
1. Start GO while context.resume is unresolved.
2. Stop that exact cue; resolve resume; ensure no source.start or GO completion.
3. Repeat with STOP ALL and with project replacement.
4. Start one cue with two voices, end one voice and verify no AUTO_FOLLOW, end the second naturally and verify a single event.
5. Fade/STOP that cue and manually dispatch onended; ensure no next cue is scheduled.
6. Check a stopped cue whose asset is reused by another active cue leaves the other unaffected.

## 3. HIGH-RISK architectural gap: authoring settings != audio execution

Current schema v1 cue actions are PLAY(assetId) or PLAN_AUDIO(prompt, resolution); automation is an optional cue-level extension with mode, delayMs, fadeInMs, fadeOutMs, loop, stopCueIds. The current BrowserAudioEngine.go accepts only PLAY and starts every source with a constant initial gain 0.5 and 20 ms lead; it does not yet use automation fadeInMs/fadeOutMs/loop/delay, and no runtime-to-UI integration is shown on PR 20. stopCue provides an operator-controlled fixed 1.5-second fade in UI.

Hence do NOT claim configurable per-PLAY fade, finite repeat, loop playback or STOP/FADE targeting a stable PLAY INSTANCE in this hackathon implementation. stopCueIds currently addresses other cue IDs, not playId ownership. An automatic coordinator must not imply these features are supported.

Recommended scope boundary:
- Hackathon MVP: manual GO/STOP/fixed fade, approved PLAY, cue-level cancellation, safe optional AUTO only after separate tests and explicit enablement.
- Advanced product: per-instance playId, independent fades/gain/pan/offset/repeat, stored actions PLAY/FADE/STOP, audio buses and professional output; specify now, implement later. Do not pretend legacy desktop engine source can be copied to event repo.

## 4. Single transport arbitration is mandatory before AUTO is exposed

The current UI calls player.go/player.stopAll directly and the separate automation runtime expects transport.go/stopAll/stopCue. If both operate independently, STOP ALL may silence the current engine while leaving a scheduled next GO in the automation coordinator.

Acceptance for ANY automated follow feature: create one explicit dispatch boundary whose stopAll cancels coordinator timers FIRST and then silences the audio backend. All GO paths pass through one guard. Use generation/epoch fencing across async resume, scheduled callbacks and project switch. No GO from model output, arbitrary event handlers or DOM selection. When integration is incomplete, automation MUST stay dormant, with a truthful UI and README status.

Differentiate AUTO_CONTINUE measured from successful operator GO from AUTO_FOLLOW measured from actual natural audio completion. Delay 0 is a scheduled asynchronous step, not a reentrant synchronous cascade. Reject follow on an infinite loop. Establish a maximum automatic chain depth or explicit cycle guard, and bounded failure handling.

## 5. Packaging and persistence gates

Full ZIP on PR 14 retains original rights-clear audio files and a manifest with size, CRC32 and SHA-256. Complete import stages archive validation/decoding and commits only after full success; retained unchanged on error is a P0 invariant. Existing JSON saves metadata but no audio bytes; opening JSON must not imply playback ready.

A failed/aborted import during a pending sound load or project switch must never attach files to the wrong show or retain stale audio. Test corrupt archives, size limits, wrong hash, duplicate path, mismatched project IDs, and refusal to swap while transport/audition is active. Use deterministic original WAV as fixture rather than commercial recordings.

## 6. What the AI test suite can and cannot measure

An offline evaluator tests exact line placement, forbidden negative triggers, duplicate cues, phantom source IDs, and schema validity. It does NOT validate live model creativity, accuracy or theatrical judgment. Human-labelled material is needed for that.

Lock a small representative rights-clear benchmark. Provide full source line IDs and ground truth in a manifest. For each model configuration record quality metrics, validation errors, truncation, latency and sanitized token usage. Change one prompt/windowing parameter per experiment. The single prior smoke validates API connectivity, not quality across a complete play.

Prioritize a trustworthy and visually legible proof that the Meta model understood a sound moment, cited its source, and left the operator in control, rather than repeatedly demonstrating the fallback provider or model login.

## 7. UI and jury evidence: the minimum valuable interaction

A user must be able to see what show is open and experience one cohesive journey: import script -> visibly linked suggestion -> manual approval -> attach sound -> prepare -> single GO -> STOP -> complete ZIP -> reopen offline.

The current browser UI is a three-column prototype; the larger desktop workspaces, genuine home/project-library, full modes DESIGN/REHEARSAL/LIVE and option-C layout remain design objectives. Preserve those requirements, but do not claim they are shipped or require implementation before the stable demo.

Test HTML in browser at 1366x768/1920x1080, keyboard focus and modal flow; do not equate regex checking button IDs with UI acceptance. Human listening at a safe output level is a separate gate.

## 8. Rules/provenance and submission discipline

The contest event page lists Indie developer judging by creativity, technical ambition and working software; the Build for Your World theme favors firsthand domain insight. An isolated audio engine alone undersells the model-based script analysis. Deadline listed officially: 2026-11-04 21:00 ET; plan early submission and recheck actual accepted official rules with the organizer before release. The public repository should contain only content suitable for public release.

Originality: maintain accurate dated contributions. Earlier external-domain research can inform design, but do not copy pre-event source or represent pre-event functionality as newly developed. No model secrets, private communications, competitor private studies, personal data or unlicensed recordings in source/commit/CI artifacts.

## 9. Codex task investment boundaries

ChatGPT + GitHub connector: requirements, test matrices, fixture scripts, product reasoning, public-safe docs, PR/CI reading, risk analysis, code review, draft prompts and implementation contracts.

Codex: git integration, actual code edits, deterministic executable regression tests, local CLI commands, browser automation, environment-specific build, debugging and (if separately authorized) bounded real inference.

Each agent run requires one tiny signed-off goal and fixed expected files. Prefer <10 targeted files inspected, no unexplained dependency installs, one final focused test pass + one full offline suite (not many full reruns). Include an abort condition: if integration exposes a larger architecture change, report the blocking decision and stop; do not perform an open-ended redesign. Keep diff small; no merge/release without owner approval.

Success is NOT maximum test count. Success is one reproducible end-to-end path with no unintended sound, safe cancellation, accurate source citations and a real working demonstration.
