# RunQ Sound Lab — isolated UI pilot (28 Oct 2026)

## What is implemented

A standalone, dark-mode Sound Lab located at **/sound-lab**. It shares the local Node development server but does not import src/ui/app.mjs, cue editor code, operator queue, show persistence or live audio engine. It can be used in an entirely offline mode.

- Prompt, SFX/environment, source Lxx, length 1–12 s, deterministic seed.
- Explicit checkbox AND browser confirmation for each potentially billable generation. Submission disabled unless RUNQ_SFX_PILOT_ENABLED=1 and server-side Modal configuration exists.
- Open local journal entry by request ID, poll remote status on demand, cancel request, download generated WAV after completion, approve/reject after human review.
- Load **any local PCM WAV** (up to 8 MB) or the original deterministic synthesized impact demo (NOT AI). No input file leaves the browser.
- Decoded audio waveform rendered from real sample amplitudes; drag a selection or enter IN/OUT in seconds (minimum 10 ms).
- Audition selection via Web Audio at default **15% monitor gain** with explicit STOP. Audition is on the DEFAULT speaker output, not a separate PFL bus.
- Export selected region as new PCM16 WAV. Remote generated audio requires acceptance for **the exact loaded request ID**. Import into the current RunQ show remains manual.
- No GO, cue binding, project modification, auto-download or background inference.

## Running locally

Switch to the branch feature/sfx-standalone-lab-2026-10-28 in a **separate worktree** from the parallel Cue Editor redesign. Never checkout over unrelated uncommitted work.

    npm run dev

Open http://127.0.0.1:5173/sound-lab (or your configured PORT). Click **Load offline impact test sound**, preview the actual waveform, select an interval and export a trimmed WAV. All of that runs without GPU/model/provider credits.

The normal RunQ app stays at /. The Sound Lab is not yet integrated into its navigation and not yet visually aligned to the final design system.

## Safety and reality check

- The preview engine uses the computer's ordinary audio output. Start with speakers at a safe volume.
- AudioContext.decodeAudioData can resample audio to the hardware context rate; trim boundaries are accurate in the decoded buffer, but the export is not guaranteed bit-identical to the source.
- No local audio project asset is auto-created. The exported WAV must be loaded and assigned to a cue by the operator.
- Existing API stores local WAV data in .runq-local/sfx-generation; it is not included in portable show archives until separately imported into the show.
- The Modal model container remains **unbuilt and untested on a GPU**. Enabled status only means server-side values are configured, not that live generation has succeeded.
- Daily three-request cap and local lock do not constitute a financial spend cap. Do not deploy paid generation without reviewing Modal dashboard limits and durable accounting.
- A local disk journal lock after unexpected interruption is intentional; review provider bills and possibly incomplete jobs before manually removing any lock.
- Original demo impact is synthetic signal processing, not a Stable Audio output and not evidence of generative quality.

## Testing

    node --check src/sfx/lab.mjs
    node --check src/sfx/waveform.mjs
    node --test test/sfxSoundLab.test.mjs
    npm run qa:codex

## Integration contract for parallel interface work

The future Cue Editor should call GET /api/sfx/status for capability discovery; all remote actions remain in /api/sfx/jobs. The Sound Lab currently serves as a reference implementation. Copying its CSS is not required, and there should be no changes to GO, STOP, STOP ALL, cue schema or Web Audio transport.

A later bounded PR can add a **Generate for this cue** link passing a line reference and proposal prompt into Sound Lab, followed by **Use this accepted WAV** importing via the existing asset path, but only after review and explicit cue target selection. This is not implemented yet.
