# RunQ V3 — Bounded Codex execution backlog
Status: implementation sequence, not completed features.
Read AGENTS.md and the V3 master plan. Work in a new branch per package, never merge unrequested work, and never invoke a paid model request.

## Before each coding session

1. Confirm working branch and baseline SHA. Do not assume main is the unified candidate.
2. Inspect the precise current files affected; do not bulk-refactor existing controllers or schema.
3. Run current focused tests and a full offline check before altering code.
4. Write/update a failing deterministic test for the desired user behavior.
5. Implement the smallest vertical slice and perform a real browser check of that slice.
6. Record feature switches, unchanged limitations, screenshots and remaining acceptance gaps.

Definition: **code exists** is not **user can operate feature**. Only report implemented after UI, persistence (where applicable), runtime and tests agree.

## W00 — Freeze integrated baseline and safety surface (P0)

Scope: choose the highest-coverage integration candidate, preserve legacy JSON+ZIP fixtures, record current CI and browser screens. Confirm all operator actions, approval gates and per-track audio survive.

Avoid: merging unrelated experiments into a new UI branch, silently changing schema, modifying GO when only visual controls are requested.

Acceptance:
- One chosen SHA and a read-only feature matrix with verified/pending status.
- Offline syntax, Node suite, ZIP and Chrome smoke green.
- Explicit state list: selected, prepared, active, pending, audition, dirty.
- Saved baseline screenshots at 1366x768 and 1093x614.

## W01 — AppShell and state adapter (P0)

Files proposed: src/ui/v3/appShell.mjs, showAdapter.mjs, workspaceStore.mjs, designTokens.css.
Scope: pull DOM layout away from current app.mjs, expose read-only UI selectors and explicit dispatch commands. Preserve existing project object and single transport owner.

Acceptance:
- File/View navigation works from every workspace; back/context route restores selected cue.
- Menu and keyboard focus never dispatch GO or mutate prepared queue.
- Switching language never alters imported source text.
- 8/84 cue navigation remains stable; no re-render loses dirty inspector draft.

## W02 — Professional CueSequence + Inspector (P0)

Files proposed: cueSequence.mjs, cueInspector.mjs, inspector tabs; reuse existing cue edit functions.
Scope: full-width row selection, columns, multi-track action table, Add/Insert/Duplicate/Move/Delete, selection context, real save/discard and current playback editors.

Acceptance:
- Create three manual cues from blank show with no script or AI.
- Inspect one cue while another remains NEXT GO.
- All current per-track gain, fade, pan, delay, loop, repeat and targeted stop controls remain functional and persist.
- Screen 1366x768 and compact 1093x614 do not clip GO/STOP ALL.
- 84 rows searchable using arrows/Home/End; focus and scroll stable.

## W03 — Real waveform renderer, read-only (P0)

Starting source: src/core/waveformPeaks.mjs and its unit tests (already added in a foundation branch).
Files proposed: src/ui/v3/waveformCanvas.mjs, src/core/peaksTask.mjs, decoder-safe read interface.
Scope: decode/derive actual extrema, draw L/R min/max with correct time ruler and source duration, zoom and scroll. Selection handles may be visually annotated but cannot claim effective trim yet.

Acceptance:
- A sample WAV with known pulses shows correct channel peaks and duration.
- Zoom/pan preserve source time positions; rendering doesn't edit PCM or start sound.
- 10-minute max supported file decimation does not block UI beyond measured budget.
- Stale decoding canceled when switching shows; no made-up waveforms.
- README and UI explicitly label read-only playback status until W04.

## W04 — IN trim and actual fade editing (P0 conditional)

Starting source: src/core/audioRegion.mjs and unit tests.
Scope: select a track, drag IN marker and fade curve, update existing supported startAtMs/fadeInMs/fadeOutMs fields through one transactional save flow. No OUT region yet. Track source duration and reject invalid starts.

Acceptance:
- Visible edits correspond exactly to persisted playback fields; reopen JSON and ZIP retains values.
- GO genuinely starts at chosen offset; fade envelopes audible at safe gain (physical Windows operator check).
- Undo/cancel draft doesn't affect running sound or unsaved project.
- Wrong file length or failed replacement blocks commit without mutating stored show.

## W05 — OUT, loop IN/OUT, source-region playback (P1)

Scope: explicit versioned document migration or approved backward-compatibility mechanism. Implement actual sample-relative cut and loop start/end in the browser engine; respect playbackRate and fade durations. Do not turn W05 on through CSS alone.

Acceptance:
- Source 60s with selection 8..26s sounds ONLY that region. Region fades obey selected length.
- Finite N repeats repeat the selected region, not the untrimmed original source.
- Reuse same asset in two cues: independent regions and voices; STOP one doesn't affect other.
- Original v1 JSON/ZIP opens without loss. Full ZIP roundtrip retains all new region settings.
- Infinite loop and AUTO_FOLLOW are blocked with clear error.

## W06 — Script + AI Creation production workflow (P0)

Scope: script scenes/characters index, bidirectional L# jump, bounded analysis configuration, visually distinct review list, authoring a cue from suggestion after approval. Retain original source and human governance.

Acceptance:
- AI disabled/offline: completely manual show remains usable.
- AI proposal can't edit a cue until human approves; approval cannot start sound.
- Source line evidence exact, no fabricated L#.
- Unsupported provider errors and model cost remain honest and sanitized.
- Accessible keyboard flow through queue and review.

## W07 — Operator console and single transport guard (P0/P1)

Scope: active run inventory and GO/pending/STOP states derived from actual engine. Preflight links to blocked cues. Preserve current manual GO while isolating commands behind a single authoritative boundary. Do not enable automatic follow until race tests pass.

Acceptance:
- Single GO intent; double-click/held keyboard doesn't double-play.
- STOP ALL cancels pending resume/start, fades, audition and future timers.
- Preview/file replacement cannot modify active run.
- GO and STOP ALL reachable at 1093x614; focus ring visible and warnings textual.
- Real sound verifies target-only STOP/FADE and panic on Windows.

## W08 — Rehearsal, Settings and polished delivery (P1)

Scope: rehearsal script-following UI with operator-confirmed suggestions, device capability/settings reporting, presets and workflow continuity. Defer voice-driven auto GO and hardware routing without separate engine contract.

Acceptance:
- Manual rehearsal without mic or provider works offline.
- Known unsupported capabilities are disabled, not falsely green.
- Project/asset/AI results remain intact through navigation and export.
- English-first and Spanish translation; no source translation.
- Clear operator documentation and usable demo on laptop.

## Shared regression checks for every PR

Use existing offline commands, plus targeted new file tests and browser E2E. Build ZIP and verify integrity only on a safe branch. Keep CI entirely offline; never access MODEL_API_KEY or automatically retry inference.

Risk tests to preserve:
- pending audio GO + emergency stop => no late start;
- two cues reuse one WAV => distinct stop targets;
- edit/selection/search while sound playing => prepared remains unchanged;
- malformed/old ZIP import => rollback without changing current show;
- AI pending proposal => no sound; human review required;
- no implicit prelisten routing claim; actual shared output warning.

## PR handoff format

PR description MUST include: source baseline SHA, exact code files changed, the implemented user workflow, known missing capabilities, test commands/results, browser screenshot path, any schema changes with migration tests, and explicit pending Windows listening test. Never label a mocked Chrome run as a real hardware test.

### Recommended milestones

Milestone A (demo foundation): W00, W01, W02, W03, W06 and essential W07.
Milestone B (audio editing): W04 then W05 only after time/risk gate.
Milestone C (post-event professional): W08 and native backend, output routing, independent PFL, timecode, MIDI/OSC and full automation after separate approval.
