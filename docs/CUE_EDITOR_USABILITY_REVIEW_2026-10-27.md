# Cue Editor usability — interaction review and implementation decisions

Date: 2026-10-27. This document records original product decisions for the hackathon implementation. It is not a claim that a user study or a professional show trial has already been conducted.

## The observed problem

The earlier prototype rendered each cue as a tall card containing inspection, source jump, detail edit, sound-replacement, next-position and transport commands. Scanning a large show became difficult. The inspector displayed metadata, playback, target actions and warnings at once. Selecting by pressing a small "Inspect" control caused a full page render. Search also rebuilt the inspector, potentially discarding unsaved form input. Two independent scroll regions were present but did not behave as a focused master/detail workstation.

## Tasks that must be fast

1. Find cue 27 by its number, label, source line or audio filename without executing it.
2. Single-click cue 27 anywhere in its summary and immediately inspect/edit it.
3. Move between consecutive cues using arrows, Home or End; keep the audio/property tab where possible.
4. Change fade-in on several cues without navigating back through a massive card or losing position.
5. Review a cue's script evidence and targeted STOP actions without seeing audio fields not relevant to that task.
6. Inspect an earlier cue while a different cue remains NEXT GO, without altering the operator's transport state.
7. Catch a modified but unsaved form before changing cues/tabs/shows.
8. Return to the operator workspace; there, and only there, adjust the next GO position.
9. On a smaller laptop display, scroll the cue list independently of the inspector without horizontal document overflow.

## Interaction model

- **Selected cue**: a pointer to the cue being edited; clicking its main row or keyboard navigation changes this ID.
- **NEXT GO**: the distinct transport position. A marker appears in the list, but selection cannot modify it.
- **Playing cues**: state from the real audio backend, never derived from the selected cue.
- **Cue row**: compact number, title, source/audio summary, optional spoken/stage trigger, actual audio readiness. Full-width native button affords mouse and keyboard activation; additional transport buttons live separately in Operation. No implicit playback or preparation on row click.
- **Keyboard**: a single tab entry to the row-selector group; ArrowUp/ArrowDown and Home/End move focus and selection; Enter/Space are native button selection only. Avoid global unmodified character shortcuts or Space-to-GO while editor controls have focus.
- **Search**: filters only the cue list, not underlying sequence or prepared ID. Preserve unrelated inspector input and keyboard focus. If selection is outside the filter, the inspector still shows the selected cue by stable ID.
- **Inspector**: three task-scoped tabs—Basics (title, trigger, notes and source), Audio (real gain/delay/fades/loops/rate/pan), Actions (asset assignment and target STOP/FADE). Tabs have arrow-key navigation and labeled panels.
- **Pending form input**: selecting another cue or switching tabs requires confirmation if the current inspector form has unsaved edits. Persisted updates and target edits only occur after explicit Save. Newly loaded shows clear the stale editor state.
- **Scrolling**: preserve list scroll on ordinary re-render, reset it for a new search, and preserve inspector position during same-tab edits; tab changes begin at its top.

## Visual hierarchy and responsive behavior

The Cue Editor workspace has one primary task: finding/adjusting cue definitions. Hide the large GO transport and per-row STOP/FADE buttons **in the Editor only**. The Operation workspace keeps its existing prominent GO and adjacent emergency STOP. Editor's left pane is the dense cue sequence; right pane is a contextual inspector. Use actual textual markers for selected and NEXT GO; never depend only on border colors. Focus rings must remain visible. Keep controls readable instead of reducing all font sizes to cram content.

At widths ~1366 px, target a wider list plus a 330+ px inspector; at narrow widths, stack list and inspector. Avoid asserting professional suitability from viewport-only synthetic tests.

## Implementation included in this branch

- A native clickable row selector, roving focus, arrow/Home/End, filtered independent inspection.
- Distinct selected/next/active concepts preserved with no GO side effects.
- Shorter, scannable row presentations and action-free editor list.
- Separate Basics/Audio/Actions tabs and original functional editing controls.
- Targeted STOP/FADE configuration moved to Actions without changing the automation runtime.
- Dedicated tests for click, keyboard focus, still-prepared cue, persistence, and ZIP roundtrip.
- Unsaved-input confirmation on selection/tabs/show replacement.

## Remaining improvements (not advertised as implemented)

P1: test live with theatre technicians using 8, 84 and 500 cue shows and a 1093×614 viewport. Measure time to find/edit cue and mistaken GO/reposition attempts. Run screen reader acceptance (NVDA/Chrome) and 200% zoom, especially inspector tabs and scrolling.

P1: adapt list virtualization only if large-show measurements justify it; ensure focus and search still work. Add visible per-cue type icon/transport state and better warnings without inventing audio duration/status.

P1: operator-level undo/redo, reorder/insert/copy cue, dedicated independent action model, grouped actions and fade-target editor. These require model and test work, not merely CSS.

P2: waveform trim preview, scrub, envelopes and per-asset metadata, after accurate audio clocks and legal sample sources exist. No simulated waveform in the production editor.

## Verification policy

Passing unit and headless Chrome tests proves interactions execute, not that the interface is ergonomic for real technicians or that physical audio is safe. Maintain explicit GO, STOP and ZIP compatibility gates. Use an opt-in technician walkthrough after CI and before any merge.
