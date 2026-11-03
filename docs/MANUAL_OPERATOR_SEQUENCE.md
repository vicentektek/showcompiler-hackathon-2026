# Manual operator sequence — SHOWCOMPILER

## Prepared cue and playback are different states

The operator transport is deliberately separate from the AI review process. Approving a proposal creates a DRAFT cue; it does not load media, prepare GO or play audio. In the cue list:

1. Choose **Prepare** on an approved cue. The prepared cue is highlighted; no sound plays.
2. Press **GO PREPARED** to play that cue's locally decoded audio. The button stays disabled for unresolved or unloaded audio and while that cue is already active.
3. After a successful manual GO, the sequence prepares the following cue by stable cue identity. Playing the sound does not wait for or trigger AI.
4. Press **SKIP** to advance past a prepared cue without starting its audio.
5. **Reset position** clears the operator's prepared/completed/skipped runtime sequence without stopping currently playing audio.
6. **STOP ALL**, in the top bar, remains the emergency audio stop. It silences active playback and cancels pending GO work independently of sequence navigation.

The cue card retains direct **GO / STOP / FADE** controls for explicit per-cue actions. Clicking **View in script**, searching, editing details or loading audio does not implicitly prepare a cue.

## Persistence and safety

The prepared position and completed/skipped history exist only in browser runtime memory. They reset when creating or opening a show and are not written to the JSON project. A saved cue's metadata and audio references continue to use project JSON; actual audio binaries still must be reloaded after reopening.

This is a manual operator UI, not certified professional show control. There is no autonomous follow, chase, microphone-triggered playback, hardware DMX/OSC/MIDI output or timecode execution in this sequence. Stage use would require independent evaluation of routing, failure recovery, clock stability and operator safety.

## Acceptance

- Prepare a cue and confirm the loudspeakers are silent.
- Prepare a different cue while inspecting the first source line; only **Prepare** changes the queued target.
- GO a loaded cue and confirm the next cue becomes prepared. If the cue has no local audio, GO must stay disabled and must not advance.
- SKIP a cue and confirm it remains silent.
- STOP ALL while audio is playing and verify silence, then prepare manually again.
- Save and reopen JSON; confirm operator queue is reset while approved cue and source data remain intact.
- Try keyboard and narrow viewport navigation. Automated tests do not substitute for audible acceptance.

No model calls or billable credits are required to use the manual queue.
