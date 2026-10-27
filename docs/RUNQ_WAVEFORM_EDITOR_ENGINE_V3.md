# RunQ V3 — Real waveform editor engineering contract
Status: architecture and pure-model foundation; not yet connected to the UI or playback.
A waveform drawn from a live AudioBuffer is required. Never replace it with a random/fake signal.

## 1. End-to-end data path

User picks actual local sound file -> validation and decode via existing BrowserAudioEngine -> AudioBuffer -> channel-specific PCM peak aggregation -> Canvas view -> source-relative pointer gestures -> validated non-destructive region draft -> explicit Save -> versioned project persistence -> playback engine respects trim/envelopes/loop -> export ZIP -> reopen and verify.

The current engine already decodes mono/stereo audio under its tested size/duration limits. The decoder stores AudioBuffers in memory and supports real local manual playback. It currently has no public, read-only accessor for decoded buffers; a later slice must introduce a safe single-purpose peak extraction method without leaking mutable engine state into the UI.

## 2. Already implemented in THIS foundation branch

- Pure buildWaveformPeaks(AudioBuffer-like, bucketCount): per-channel min/max/RMS from original PCM frames; no image or file mutation.
- Pure pixelToTimeMs/timeMsToPixel for source-relative 0..duration coordinate mapping.
- Pure normalizeAudioRegion, moveAudioRegionEdge, regionToSourceSlice: validated IN, OUT, fade and loop boundaries with immutable return values.
- Offline unit tests with original synthetic buffers, stereo separation, uneven lengths, clipping/invalid samples, drags and limits.

These functions do NOT yet wire into UI, browser playback, persistence or ZIP. No claim of an operational editor can be made until the later stages pass.

## 3. Source semantics

Terminology:
- Asset: original decoded audio resource, reusable across cues without edits to source bytes.
- Track: PLAY specification owned by a cue, references asset and region/playback controls.
- Region: inclusive start in ms and exclusive end in ms, relative to original asset timeline.
- Fade IN/OUT: lengths within region; sum may not exceed selected region length.
- Loop range: optional repeat start/end within region. Loop enabled/disabled is an explicit separate playback flag; do not infer it from a visible range.
- Voice: one volatile running AudioBufferSourceNode instance; STOP targets a run/voice or named cue, never every use of the same filename.
- PlaybackRate: determines wall-clock duration by dividing source seconds by rate.

The existing cue playback schema has startAtMs, fadeInMs, fadeOutMs, repeatCount, loop and playbackRate. It lacks a stored endAtMs and distinct loop start/end; the current playback engine uses the rest of the buffer after startAtMs.

Therefore the V3 editor may first deliver REAL waveform plus working IN and fade handles backed by existing fields. OUT and loop range must remain clearly disabled until persistence and engine execution are implemented and validated.

## 4. Data migration decision — explicit gate

Do NOT silently add unrecognized fields to schema v1. The loader enforces a strict field set; older versions could reject new documents. V3-04 needs a recorded compatibility decision.

Preferred long-term option: schemaVersion 2, independent audio action IDs and source-relative trim/loop metadata. Steps:
1. Pure migrateV1ToV2(project), deterministic and no audio/network side effects.
2. Preserve original text, source references, evidence, cue numbering, cue IDs, assets and approved proposals.
3. Convert the original PLAY and extra tracks into independently identified operator actions; no reinterpreting source from model.
4. Explicit validators and golden tests for v1 JSON + complete ZIP before writing v2.
5. New run/voice identifiers; predictable STOP targeting by action or active run.
6. Validated v2 export and safe v1 rejection or compatible export policy; never overwrite the only older-format copy.

For the hackathon, if this migration cannot pass all gates in time, ship the true waveform and editing of ONLY the fields already executable and persistable, rather than a cosmetic OUT handle.

## 5. Canvas and gestures

Viewport shows current source duration and selected track, not a generated audio image.

Canvas renderer:
- One channel band per decoded channel (mono 1, stereo L/R).
- Plot negative min and positive max independently, centered zero line; optional subtle RMS region for readability.
- Zoom fit/selection and keyboard-accessible zoom buttons; coherent time ruler in seconds and milliseconds.
- Selection overlay with shaded discarded region; vertical IN and OUT handles; separate amber fade ramps and loop markers.
- Playhead is derived from confirmed transport/preview time; never run an arbitrary fake animation.
- On resize, recompute pixel mapping from the current viewport; saved region uses integer milliseconds, not pixels.
- Render large inputs using bounded peak buckets and a lower-level zoom peak cache. Do not calculate all long-file samples synchronously on every pointer move.
- For CPU and memory safety, use a cancellable chunked peak worker/task when decimation exceeds measured interaction limits; avoid uncontrolled copies of 10-minute stereo PCM.

Pointer/keyboard:
- Pointerdown on handle enters an unsaved edit transaction.
- Pointermove previews a constrained in-memory region, no engine playback.
- Pointerup/Enter commits to the editor draft; explicit Save persists to project.
- Escape cancels the gesture and restores the previous values; Undo reverts only when an actual history stack exists.
- Numeric inputs show mm:ss.mmm, accessible labels, keyboard arrows with documented increments, and exact validation errors.
- Dragging IN cannot cross OUT or an existing loop boundary; dragging OUT cannot cross IN or active loop bounds. Never silently delete loop/fades to accept a drag.
- Discard confirmation if leaving a cue with unsaved region edits.

## 6. Playback engine acceptance

For non-looping source-relative regions, schedule audio start at source offsetSeconds and stop after region duration adjusted by playbackRate, using a single monotonic AudioContext clock. Source.start(when, offset, duration) may be used when its semantics are tested with the target browser and rate. Fades are output-time gain envelopes, scheduled relative to the audible region and not the full original asset.

The old browser engine computes duration from AudioBuffer.duration - startAtMs; a new OUT requires updating that calculation. Finite repeats must repeat the selected region, not implicitly the whole original file. A loop range must use true source.loopStart/loopEnd and a documented exit/stop policy; no AUTO_FOLLOW from an infinite loop.

All existing pending-GO, STOP, STOP ALL, project switch and audition cancellation fences must survive. A fault in one track never leaves a half-started multi-track cue running. Do not enable AUTO_CONTINUE or AUTO_FOLLOW as an accidental side effect of the new UI.

## 7. Asset reuse and identity tests

Two cues can both use one WAV with different start/end/fades. Starting the first and stopping it must not change the second cue's editor data or terminate the second voice. Replacing a track's audio retains its cue/source provenance and marks the region for explicit bounds validation against the new file duration.

On file replacement: if a saved OUT exceeds new duration, report a blocker and require a deliberate repair; do not silently clamp and persist a different show. The clip edit should not mutate the file, nor should it generate a new audio asset unless the user explicitly requests a rendered export.

## 8. Required acceptance matrix

| ID | Input/action | Objective proof |
|---|---|---|
| WAV-01 | Known mono PCM with negative samples | Exact sign-preserving min/max buckets |
| WAV-02 | Stereo with different channels | L/R peak arrays independent |
| WAV-03 | Empty or invalid source, NaN PCM | Explicit typed validation errors |
| WAV-04 | 200 px and 10s viewport | 50 px maps to 2500 ms, reverse accurately |
| WAV-05 | Drag IN beyond OUT or loop | Clamped safely; source unchanged |
| WAV-06 | Fade total > region length | Rejected before save |
| WAV-07 | Loop outside region | Rejected before save |
| WAV-08 | Real WAV chosen by user | Canvas waveform follows true AudioBuffer data |
| WAV-09 | IN changed from 0 to 3s | First audible sample begins at the selected offset |
| WAV-10 | OUT changed to 4.5s | No audio outside chosen region |
| WAV-11 | 2s fade-in, 1s fade-out | Audible gain envelope corresponds to selected region |
| WAV-12 | Same file on two independent tracks | Separate regions and stop targeting |
| WAV-13 | Export/import complete show | Same selection, durations, fades and WAV identity |
| WAV-14 | Stop during decode or resumed GO | No stale sound after STOP ALL |
| WAV-15 | Two-channel 10-minute allowed file | Responsive peak generation with bounded memory |
| WAV-16 | Switch project during waveform decoding | Old waveform/region cannot appear in new show |
| WAV-17 | Play preview | Output is accurately labeled as shared system output |
| WAV-18 | Source missing after project restore | Obvious blocked state; cannot GO |
| WAV-19 | Keyboard-only and 200% zoom | Handles controllable; numeric fallback usable |
| WAV-20 | Browser engine failure or unsupported output | Show error, no fabricated sound or readiness |

WAV-01..07 are covered by initial model tests (subject to CI); WAV-08..20 are implementation gates for later slices. Passing WAV-01..07 does NOT imply playable trim.

## 9. Recommended implementation slicing

A) Waveform read-only (real PCM) with Canvas and zoom.
B) In-point and fades through existing playback schema, including real preview and ZIP roundtrip.
C) Versioned OUT-region and loop semantics after migration and engine race tests.
D) Multi-track composite timeline, group envelopes and per-instance targeting.
E) Optional native/offline high-reliability engine only after separate technical feasibility and hardware acceptance.

No bundled commercial waveform image, third-party code, unlicensed audio or external competitor references in public source.
