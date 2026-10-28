# Stagecraft V4 · ON AIR dock + direct cue waveform handles

Date: 28 October 2026 · Draft PR #79, stacked on PR #78.

## Operator view — ON AIR

A persistent dark Stagecraft dock (visible only in **Operation**) lists running cue IDs from the REAL Web Audio transport. Each running row shows number, cue title, a real transport elapsed/remaining clock, a non-VU timeline, STOP and FADE. LOOP displays an indefinite state rather than a fabricated countdown. STOP/FADING disables duplicate stop requests. Empty state explains NEXT GO remains above the panel.

Action buttons reuse the same audio backend \`stopCue(id, 0)\` and \`stopCue(id, cue.playback?.fadeOutMs || 1500)\` already used in row controls. The audio engine's new immutable \`getActiveCues()\` snapshots expose no raw PCM and no direct gain manipulation. Running entries are removed only on engine completion or explicit immediate stop. A real fade continues to appear as STOPPING while active voices finish.

The dock is mounted above the sequence scroll area, preserves GO / STOP ALL visibility, and is height-bounded so that many overlapping sounds don't crowd out the cue list. This is **not a loudness/VU meter** or PFL.

## Cue waveform — working gestures

- IN and OUT retain source-relative independent per-cue/track positions, with 10ms precision on drag. Original audio files are never rewritten.
- FADE IN and FADE OUT show **circle drag handles on the upper waveform**. The lower waveform click/drag retains IN/OUT. The endpoint handle positions are constrained by clip duration, playback rate, the other fade and 0–10s engine limits. Looping cues cannot acquire an automatic fade-out.
- Four large \`MM:SS.mmm\` text fields replace the hard-to-scan millisecond fields in the main inspector: IN, OUT, FADE IN, FADE OUT. Users can enter \`2.5\` (seconds), \`01:02.350\` or comma decimals.
- The original exact millisecond number inputs are preserved under a collapsed **Advanced precision (milliseconds)** details control. They are the actual property model that gets serialized into JSON/ZIP.
- A scrub slider represents the audition cursor, with numeric position, "IN ← cursor", "OUT ← cursor" commands. Existing Play Cue / Play Track / From Cursor / Stop Preview and zoom/pan remain.
- Drag or numeric changes are STAGED. The explicit Save button persists them on the selected cue/track only, and the original file remains unchanged. Changing NEXT GO and sound audition are separate commands.

## Live-operational constraints

- Prelisten uses the same default computer output as GO; it is not a private headphone output.
- The ON AIR panel has real cue STARTED/STOPPING states; it doesn't support pausing, seeking currently LIVE cues or changing level during performance.
- Current Chrome QA uses a deterministic mocked AudioContext: audible Windows hardware, long loops and headsets require a manual sign-off.
- The UI is built as stacked changes: PR #76 Stagecraft -> #77 keyboard -> #78 cue-specific PCM edits -> #79 this sprint. Do not merge into main while other design branches are being reconciled.

## Professional reference

The official QLab 5 [workspace](https://qlab.app/docs/v5/fundamentals/workspace/) has a separate Active Cues sidebar with current playback/time and dedicated controls. QLab [audio cues](https://qlab.app/docs/v5/audio/audio-cues/) shows direct graphical start/end and integrated fade envelopes. RunQ provides bounded **linear IN/OUT fades**; not arbitrary automation points, waveform editing, DAW mixing, or a certified live audio engine.

## Local test on Windows (no API calls)

~~~powershell
git fetch origin
git worktree add --detach "$HOME\runq-onair-review" origin/feat/stagecraft-running-cues-wave-handles-2026-10-28
cd "$HOME\runq-onair-review"
$env:PORT = "5185"
npm run dev
~~~
Open http://127.0.0.1:5185 and select "Try original audio demo", Cue Editor -> select cue -> Audio; then Operation. Audio listening and mouse placement should be verified before a public performance.
