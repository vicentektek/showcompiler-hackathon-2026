# Real PCM waveform and IN/OUT trim — 28 October 2026

Scope: local Web Audio prototype, manual operator GO only. No AI request, cloud upload, hardware routing, or automatic follow is enabled by these changes.

## Operator workflow

1. Open **Cue Editor**, select a cue with a PLAY asset, and load its local WAV/MP3/other supported file.
2. Open the **Audio** tab. A waveform is calculated directly from the locally decoded mono/stereo PCM and displayed. Peaks are visual guides, not calibrated loudness or a safety meter.
3. Drag the **amber IN** or **red OUT** marker. Pointer input selects the nearest marker. With canvas focused, arrow keys move IN by 10 ms; Shift + arrows move OUT.
4. The numeric `startAtMs` and `endAtMs` fields stay synchronized with the canvas. Clear OUT to play through the file's actual end.
5. Set gain, fade-in/out, start delay, pan, playback rate and repeat/loop settings. **Save** to persist. Changing markers does not fire GO or modify AI source evidence.
6. In operation, perform an explicit manual GO. A one-shot with OUT ends there. Finite repeats and infinite loops repeat the selected IN-to-OUT region, not audio before IN. Fades use the selected region's playback duration.
7. Additional PLAY tracks offer the same waveform/trim editor within their per-track properties. If audio bytes are missing, the GUI shows a missing-waveform message and numeric editing remains possible.

## Invariants

- `endAtMs: null` is backward-compatible and means play to the decoded end. Legacy show JSON continues to load.
- OUT must be later than IN and inside the actual decoded file. The engine rejects an invalid bound before starting any track.
- No raw PCM leaves the backend; the UI receives a frozen, bounded envelope of at most 512 columns per decoded asset.
- No remote model calls, auto-follow, independent preview bus, sample-accurate hardware sync, multichannel/ASIO routing or professional audio certification.
- STOP, fade STOP, STOP ALL and GO cancellation remain operator controlled. Waveform editing has no transport authority.

## Acceptance

Run `npm run check:syntax` and `npm test`, then test locally with headphones at a conservative level. Use a rights-clear short sample with a distinctive transient at the desired OUT, a trimmed repeated loop, a long fade, and two overlapping cues. Verify exact audible cut and STOP ALL. Browser automated tests do not substitute for listening and checking real output device behavior.

Source: `src/core/audioWaveform.mjs`, `src/core/browserAudio.mjs`, `src/ui/app.mjs`. Tests: `test/audioWaveform.test.mjs`, `test/cuePlayback.test.mjs`, `test/browserAudio.test.mjs`, `test/audioBackend.test.mjs`.
