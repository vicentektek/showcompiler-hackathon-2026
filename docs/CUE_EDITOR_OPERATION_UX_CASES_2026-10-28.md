# RunQ — Cue Editor / Operation: live-operator usability analysis
Date: 28 October 2026 · Stagecraft V4 · independent draft PR #78

## Benchmark: QLab 5 (official behavior, not an endorsement)

QLab distinguishes selected cues, the GO playhead and active playback; Space is a default GO. QLab Audio cues expose a waveform with independent start/end boundaries, play counts, slices and integrated fade envelopes **per cue**. Its Preview runs without moving the GO playhead. QLab STOP/Fade cues target audio cues. Official QLab instructions do **not** establish double-click on any cue row as standard GO behavior: RunQ's quick double-click is our optional operator-specific interaction.

References:
- https://qlab.app/docs/v5/audio/audio-cues/
- https://qlab.app/docs/v5/fundamentals/cues/
- https://qlab.app/docs/v5/fundamentals/cue-sequences/
- https://qlab.app/docs/v5/general/keyboard-shortcuts/

## State and task model (non-negotiable)

Four different states: **INSPECTED**, **PREPARED NEXT**, **PLAYING/STOPS IN PROGRESS**, **AUDITIONING**. All buttons and highlights must represent exactly these states; clicking to inspect must not move NEXT or start sound.

### Cue Editor — preparation / sound design

| Scenario | Expected UX | Verification |
| --- | --- | --- |
| Reuse same audio in cue A and cue B | Distinct IN/OUT, fade in/out, loop, repetitions, gain, pan, start delay per cue; asset bytes unmodified | JSON/ZIP roundtrip + actual audible Windows |
| Multiple audio tracks in one cue | Each track's individual offset/end/fades; cue preview plays staged multitrack mix | Node preview tests; manual stereo check |
| Select wave region | Direct IN/OUT handle drag or numeric field, with zoom/pan; highlighted duration and fade slope | Chrome canvas and input tests |
| Audition unsaved change | PREVIEW selected cue or solo stem; no GO, no queue move, no remote model call | Browser mock acceptance |
| Preview output | Clearly says same hardware output as GO; not a private PFL. STOP prelisten always accessible | Manual Windows check |
| Selected cue plays while editing | Prevent destructive asset/sequence edits during active transport; running sound does not change mid-flight | Engine state contract |
| Cue with missing/unresolved asset | Missing WAV displayed and GO remains disabled, no silent fallback | Preflight, browser |
| Source line L# | Preserve source evidence and original script; AI cannot directly set automatic stopping | Project model |
| Two scenes use same WAV | Cue A edited while cue B unchanged | JSON test |
| No sound assigned / manual cue | Explicit resolution and replacement actions; do not show fabricated waveform | Browser |
| Dense cue list | Quickly add/insert/duplicate/move/delete, inspect without scrolling toolbars away | Stagecraft visual QA |
| Modify fades | Ramp is *actual Web Audio automation* for this cue/track; displayed envelope is illustrative linear representation | Unit tests + listening |

### Operation — live-show / improvisation / recovery

| Scenario | Required behavior | Implemented in PR #78? |
| --- | --- | --- |
| Single-click off-sequence cue | Inspects only; NEXT remains unchanged | Yes |
| Press Space | Runs prepared NEXT once; repeated held key cannot execute another cue | Yes (PR #77) |
| Double-click off-sequence cue | **Opt-in, operation only**: Set NEXT + GO immediately, then advance queue; no confirmation in live mode | Yes |
| Double-click during editing | Never GO, even if operation setting is active | Yes |
| Double-click missing / already-running cue | No execution or queue jump | Yes |
| Long ambience followed by short bell | Default OVERLAP keeps ambience sounding | Yes |
| Start new scene, end old sounds | STOP_PREVIOUS stops all earlier playing cue IDs before new GO; configurable 0–10 s fade crossfade | Yes |
| Keep ambience but stop music track | Existing explicit stopCueIds with per-target fade; works alongside overlap policy | Yes |
| One prior cue still fading | Its STOPPING state remains visible and new cue may play | Underlying engine; inspect in Windows |
| Panic | Large immediate STOP ALL; independent of selected cue or hotkeys | Yes |
| Current cue already playing | No second GO for same cue, including double-click | Yes |
| Audio prelisten active | GO blocked; STOP preview before operation | Yes |
| Project replacement while audio pending | Cancels old sources and late results; queue reset safely | Existing engine |
| Network outage / AI rate limit | GO/STOP are entirely local. Do not query provider at runtime | Yes |
| Press while scrolling/clicking toolbars | Never trigger unrelated hotkeys, preserve focused input | Yes (PR #77) |

## Exact per-cue audio semantics

- `cue.playback.startAtMs` and `cue.playback.endAtMs` are positions in the **source file**; they do not remove samples from the original WAV.
- Fade in/out duration applies to the **cue's clip** and its playback rate, not the shared asset.
- An additional track has its own `audioTracks[].playback` settings.
- `cue.entryPolicy`: optional `{mode:'OVERLAP'|'STOP_PREVIOUS',fadeOutMs:0..10000}`. Legacy cues omit it and default to OVERLAP.
- Existing `automation.stopCueIds` / `stopFadeOverrides` remain independent. A targeted stop still works when entryPolicy is OVERLAP.
- STOP_PREVIOUS stops all other cue IDs at the moment of GO (never the incoming cue); its fade may overlap the new cue, i.e. a crossfade. It is **not** the emergency STOP ALL command, which is immediate.
- ON SCREEN, NEXT GO must summarize its stop policy to reduce surprise.
- DO NOT describe the current preview path as headphone PFL, native ASIO, or safety-certified.

## Double-click decision

Double-click is optimized for improvised interventions but creates the risk of accidental starts from repeated clicks, trackpad gestures, or aiming at the wrong row. For that reason:
1. Disabled by default and explicitly enabled in Setup for this browser only.
2. Only Operation rows, primary mouse button, no modifiers. Never cue editor, audio tools or other controls.
3. Verifies target has loaded playable audio, not already playing, and no pending GO or audition; otherwise leaves NEXT unchanged.
4. Uses the existing `operatorGoBtn` handler. After GO advances the queue normally; the action is not a separate 'solo play'.
5. Standard manual Space GO and the accessible Set NEXT buttons remain usable for safer workflows.

## Remaining professional gaps (next separate tasks)

1. Current waveform supports IN/OUT handles with source wave peaks and visual fade-in/out slopes, but NOT arbitrarily many editable envelope control points or separate loop slice markers. Do not market it as a full DAW/QLab integrated envelope.
2. Missing truly separate PFL/headphone output. Independent hardware output routing and a native audio engine are future product work; current sound will be audible on the default computer output.
3. Need a truly **persisted** test of clip playback, stop fades and current active voice visualization on Windows hardware, ideally with an external second monitoring bus.
4. Operation should gain a persistent compact **Running Cues** list with independent STOP / FADE, an error status per cue, a clear selected vs NEXT split, and optional SHOW SAFE confirm mode. Existing row controls are useful but scrolling can hide a long-running ambience.
5. Add a dedicated rehearsals/live recovery suite: accidental double-click, silent/missing sources, timing races, manual interjection, rapid successive GO, STOP ALL during pending starts and ZIP reopen.

## QA gates before integration

Offline `npm run qa:codex`, current Stagecraft Chrome checks, and dedicated `tools/stagecraft-cue-safety-e2e.mjs` are the minimum. All mocks use original synthetic PCM, without Meta/Modal/Baseten requests. Do not merge unreviewed PR #78 over another active UI redesign.
