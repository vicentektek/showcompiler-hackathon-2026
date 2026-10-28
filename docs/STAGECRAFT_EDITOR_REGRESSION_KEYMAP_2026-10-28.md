# Stagecraft V4 — Cue Editor regression audit and keyboard mapping (28 Oct 2026)

Target: Stagecraft V4 UI PR #76 head `4103df05eedd302c5b47b00983634bab47752682`. This change is a STACKED PR, not merged to main.

## Confirmed regressions and fixes

| Finding | Cause | Correction |
| --- | --- | --- |
| Prepare NEXT / STOP / FADE absent from Cue Editor | `runq-stagecraft-rebuild.css` explicitly hid `.cue-operation-actions` for workspace=cues although original event handlers existed | Restore buttons for selected/focused cue. Clicking a row **never** prepares or plays; an explicit Set next button repositions queue. |
| Source/reference and replace-file tools disappear after select cue A, then B, then A | `syncSelectedTools` moved original action DOM nodes from row to inspector but discarded them during the next selection | Move original nodes back to previous row before rehosting newly selected controls; never clone live handlers. |
| No keyboard GO in Cue Editor / Operation | No global keyboard GO listener or settings model in this Stagecraft branch | Restore via one bounded event policy and click the original disabled-state-guarded GO button. |
| Keyboard shortcut preferences absent | No key map UI in Setup | Add local settings panel; defaults Space for GO in cues/operation, STOP ALL unassigned; configurable and persistent only on this browser. |

## Features still present on the Stagecraft branch

Original code still provides manual Add/Insert/Duplicate/Move/Delete, inspector tabs, cue audio assignment and replacement, extra tracks, gain, pan, playback rate, repeat, loop, fades, offset/delay, target STOP/fade overrides, source Lxx, operator GO/STOP ALL and preflight. Verify each in the browser after CSS changes; **code presence alone is not evidence of usable visibility**.

## Another missing capability — NOT folded into this fix

Audio PR #70 and advanced audition/trim PR #73 were based on a different feature branch lineage. Stagecraft V4 displays a read-only PCM waveform and does not bring in the validated source IN/OUT playback trim and cue-local audition UX from those PRs. These require a separate, conflict-aware merge and QA of playback data + project ZIP, not a CSS or keymap patch. Do not claim that trimming is restored here.

## Keyboard operator safety contract

- Default: GO = Space in editor AND operation; STOP ALL shortcut = None, operator may assign Escape/F-key as desired.
- Keyboard can be disabled globally or for either workspace independently.
- Focused cue row accepts Space as GO; Enter selects the row normally. Space always executes **prepared NEXT** even if a different row is selected.
- Keyboard events in inputs, inspector forms, selects, buttons other than cue row, contenteditable, menus and modal dialogs never execute GO. Modifiers, key repeat, IME and duplicate held keys are ignored.
- The mapping checks the real GO button disabled state (not an independent copy of transport readiness), and dispatches its established click handler. Emergency mapping uses existing STOP ALL handler.
- Different GO/STOP keys required; all values validated; preferences do NOT enter project JSON or ZIP.
- Native OS-level keyboard hooks, MIDI mappings, foot switches, ASIO and actual live-show certification remain out of scope.

## Automated checks

`test/operatorKeymap.test.mjs` checks policy and guards offline. The Chrome acceptance script `tools/stagecraft-keymap-browser-e2e.mjs` verifies UI visibility, A-B-A selection, focused-row Space, one action per keypress, no action when typing, remap G, configurable emergency stop, saved preferences. Original `tools/browser-e2e.mjs` was updated to expect the restored explicit Set next control rather than its previous hidden state.

Physical Windows key behavior, actual audio routing, focus under native dialogs and 200% display scaling remain operator acceptance items before public use.
