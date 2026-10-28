# RunQ audio development and verification — 2026-10-28

## Scope and safety contract

RunQ's operator GO is the sole way to fire show cues. Muse Voice Follow NEVER starts playback and never mutates the prepared cue automatically. A final, high-confidence transcript can **suggest** a cue. Only a separate manual click on `Set as NEXT / Preparar como NEXT` prepares it. `Ignore / Ignorar` discards the displayed suggestion. Unstable partial transcripts never affect cues.

Cloud actions are opt-in. Single-shot Muse upload requires one-time consent. Realtime listening requires explicit consent *per session* and stops automatically after at most 180 seconds. No cost-incurring provider calls happen in CI, no automatic reconnect or paid retry. Node is the only holder of `MODEL_API_KEY`.

## Features now wired

| Area | What exists | Notes |
| --- | --- | --- |
| Single-shot transcribe | 10-second microphone WAV, local playback, ES/EN remote Muse, latency and cue suggestion | User verified fast, accurate Spanish transcription on their PC |
| Realtime Voice Follow | Server-side Muse WebSocket, PCM16 16 kHz, partial and final transcript, speech boundaries, ES/EN/mixed, microphone picker, manual script focus | Awaiting first live mic/provider acceptance; test in rehearsal, not public show |
| Cue suggestion | Stable final `speechComplete` only, similarity >= 0.8, next 25 script lines, ambiguity rejection, consumed cues | No automatic GO, explicit operator `Set as NEXT` |
| Audio acquisition | Existing library batch import, ZIP/RAR/7z reader, show archive, audio decoding, audition | Keep original media and data provenance |
| Sound Lab | Existing Modal SFX generation with budget/authorization and reviewed import | No silent paid retries; explicitly accept/reject a take |
| Sound Lab edit | New IN/OUT waveform drag + fade IN/OUT sliders and drag, non-destructive preview envelopes | No exported destructive WAV conversion |
| Accepted sound to cue | New separate `Import + create cue` with explicit confirmation, original WAV registered first, playback region and fades | Manual editable cue, original untouched; GO remains manual |
| Cue editor | Existing gain, pan, speed, start/end, fade, loop, repeat, extra audio tracks, stop/fade transitions | Use current core, do not fork a new player |

## What is *not* yet validated / not promised

- Actual **realtime** Meta WebSocket against user's microphone: provider behavior, latency and packet pacing must be measured.
- Multiple simultaneous speakers, mixed Spanish+English in the same line, accents, pauses, repeated lines, scene skips, background music bleed, long sessions and Chrome permission interruption.
- True PFL/isolation to a separate hardware output, ASIO integration, multichannel external soundcard or live timecode binding.
- Audio *generation* models remain separate from Muse speech transcription. Do not claim TTS/voice cloning is integrated.
- Voice engine does not control GO/STOP/NEXT by spoken commands; voice suggestions are advisory.
- Cue Editor waveform view is not universally a draggable waveform editor yet; Sound Lab review region is editable.

## Mass verification protocol (deferred until requested)

1. **Offline deterministic**: 1,000+ randomized source/script/cue scenario evaluations per language, wrong/no script, phrase noise, repetitive lines, false trigger/duplicate suppression. Zero provider calls. Compare against golden expected cue IDs and required no-match outcomes.
2. **Provider transcription**: >=50 consented clips per language; varied actors, accents and microphone levels. Compute WER and CER against independently annotated references, and median/p90/p95 latency (recording end to final transcript); label English, Spanish, mixed separately.
3. **Rehearsal streaming**: at least 30 multi-minute sessions with captions, speechComplete event integrity, loss/backpressure and reconnect manual; measure partial-to-final revisions, false accepts per hour, cue suggestion precision/recall, missed/late cue warnings.
4. **Sound Lab**: generation -> await -> load -> audition -> reject/accept -> import to library -> create cue -> trim/fade -> preview -> show ZIP save/reopen -> operator GO. Use mocked providers for hundreds of runs; only a small explicitly authorized paid sample set.
5. **Regression safety**: randomized GO/STOP, loops, overlapping fades, repeats, playback start/end, 2+ tracks, import audio archive bombs, partially missing files, and stale project snapshots; assert voice never fires transport.
6. **Usability and device QA**: Chrome Windows 1920/1366/1024, native USB audio interface, browser mic revoke/restore, keyboard transport; manual confirmation controls remain obvious in Spanish and English.

**Hard acceptance gates before demo**: zero automatic GO from speech; 0 secret exposures; 0 surprise provider requests; no regressions in existing Node+Chrome CI; reproducible, counted false positives/negatives; spoken ES/EN both work; concise operator status and recovery.

## User setup

1. `git pull --ff-only` from `feat/voice-follow-synced-2026-10-28`.
2. Reuse Windows user environment `MODEL_API_KEY` in server session, then `npm run dev` (PORT=5190).
3. Rehearsal: choose spoken language (not dependent on interface language), select microphone, check consent and click `Start listening`. Stop on demand. For cues, provide spoken triggers and valid script line references in Cue Editor. No GO is dispatched by Voice Follow.
4. Sound Lab: create and accept audio, review region/fades, use `Import + create cue` when desired.

No provider costs are incurred by the repository test suite.
