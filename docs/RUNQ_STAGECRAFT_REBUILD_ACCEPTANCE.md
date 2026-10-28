# RunQ Stagecraft — Executable workspace reconstruction

Status: implemented in an isolated preview branch. This is a browser demonstration, not a certified live show controller.

## Why this is not merely a theme

The Stagecraft reconstruction actually moves the **existing, working controls and handlers** into new component frames. It doesn't draw a parallel mock interface or introduce a second operator transport.

- Cue Editor: actual sequence rows in a dedicated scrolling grid, source/replacement actions in the selected inspector, creation controls in a compact tool strip and a persistent lower transport dock.
- Operation: a distinct command-oriented arrangement of the SAME cue queue, prepared cue, GO, STOP and directed stop/fade controls. No fake activity meters.
- Audio: original asset registration, file loading and audition controls beside a genuine, locally decoded waveform. Stereo channels are independently plotted, with source-relative ruler, zoom and horizontal pan.
- Script: original imported text with scene-heading navigation. A click scrolls the original source; it cannot alter NEXT GO.
- AI Creation: real operator proposal form, existing provider/analysis form and live proposal list in separately scrolling panes. Human approval and opt-in boundaries are untouched.
- Rehearsal: script and original manual transport shown together. No microphone tracking or automatic voice GO is claimed.
- Home / Setup: retain only actually available actions, files and capability reporting.

## Safety and state

The existing app.mjs still owns the project, manual cue sequence, selected cue, prepared cue, active sound runtime, AI proposals, local file archive and emergency STOP.

New visual actions are limited to navigation, file waveform preview and source scrolling. The waveform reader requests a real File for a registered asset from the active browser project; it never calls audio GO and never uploads data. The original Web Audio engine is unchanged.

The UI correctly distinguishes SELECTED, NEXT, PLAYING and STOPPING through the existing runtime state. Rehearsal is manual-only. The same-outlet audition warning remains visible; it is not a separate headphone bus.

## Explicit feature boundaries

- Read-only waveforms are genuine. OUT trimming, graphical fades persisted to GO, and loop region recording are NOT wired yet.
- No native audio output patching, ASIO/WASAPI, OSC/MIDI/timecode or speech automation.
- No fabricated recent project database or unsupported VU meters.
- The first pass introduces a new structural stylesheet; older component styles have not yet been removed. Consolidate after the visual/functional acceptance, not in the same risky PR.

## Acceptance gates

1. Local server must return 200 for all Stagecraft CSS, JS and waveform modules. Missing allowlist entries previously caused a silent visual regression.
2. Empty manual show: add, insert, duplicate, move, delete and serialize complete ZIP offline.
3. The cue list, inspector and operator buttons must be the SAME nodes/IDs as the source app. There is exactly one GO and one emergency STOP ALL.
4. Selecting or filtering a row does not prepare or play; prepare belongs to Operation.
5. Script, AI provider settings and manual Rehearsal are still visible and function as before.
6. A local demo WAV produces nonzero PCM-derived pixels on Canvas. Zoom and pan never start sound.
7. 1366x768 and 1093x614 screenshots keep GO and STOP ALL accessible; inspector remains independently scrollable.
8. JSON/ZIP import failure leaves current show and audio intact, including no late source starts.
9. No model API calls in CI. Manual Windows listening must verify sound before live use.
10. Check 200% OS/browser scaling, focus visibility, contrast, no horizontal body scroll and label sizes before merging to a public release.

## Run a safe preview

In PowerShell, from the repository on your PC:

~~~powershell
git fetch origin
git worktree add --detach ..\runq-stagecraft-rebuilt origin/feat/runq-stagecraft-v4-workspace-rebuild-2026-10-28
cd ..\runq-stagecraft-rebuilt
$env:PORT=5181
npm run dev
~~~

Open http://127.0.0.1:5181

This separate worktree does not alter your current branch. Do not use the browser preview for an actual public performance.

## Next integration slices

1. Iterate on real screenshot geometry and typography using dedicated CSS tokens, then remove old stylesheet layers carefully.
2. Connect UI waveform selection and source trim parameters to saved cue actions with tests.
3. Add versioned OUT/loop clip semantics and complete ZIP migration tests.
4. Integrate truthful active voice/state indicators and preflight links.
5. Validate safe Windows audio hardware output and packaging separately.
