# Rehearsal Autopilot — automatic GO by spoken cues

**Mode:** Ensayo / Rehearsal only. **Default:** Assist (NO automatic audio). **Availability:** Experimental, browser audio output. Not intended for unattended live shows.

## Interaction

1. Load a complete show with the actual sound files and assign each spoken cue a **distinct, 3+ word** trigger and a valid script reference `L#`. To jump far from the current line, prefer **4+ distinctive words**.
2. Rehearsal → Muse Voice Follow → choose language ES, EN or mixed → authorize microphone upload → Start listening.
3. Change `Cue follow mode` to `Rehearsal autopilot · automatic GO`. Click **ARM AUTO GO**. Confirm the output warning. This unlocks the browser audio output without generating sound.
4. As actors speak, **only finalized** `speechComplete` events are evaluated. Strong, unambiguous cue triggers can start the cue through the *existing* playback engine. Between cues are **skipped without sound**.
5. Unique earlier triggers can **rewind**, unique later triggers can **jump forward**, and a new turn repeating the same cue after a short guard interval can **retrigger** that cue. A repeated cue stops its previous sound first.
6. **DISARM AUTO GO**, **Stop listening**, **STOP ALL**, leaving the Rehearsal workspace, changing the show, or hiding the browser tab disarms autopilot. Manual GO also disarms. The listening session itself may continue after de-arming, but **cannot trigger audio**.

The visible Rehearsal policy selector shares its value with Setup; changing either persists the same preference and never starts listening or arms playback. While a live session is busy, both selectors are disabled. Once listening is ready, the primary button changes to **ARM AUTOPILOT**; the detailed arming control remains available in session settings.

## Safety and limitations

- No unarmed speech event may call player GO. No auto GO in the Operation workspace.
- Only existing DRAFT cues with **all decoded audio assets loaded** are executable. Missing assets cause a safe failure and disarm.
- Exact speech-turn duplicates, partial transcripts, stale inputs, too-short phrases, ambiguous cues and weak matches **do not GO**.
- Near cue matches require similarity >= 0.88. Discontinuous seeks require >= 0.97 and at least 4 words. A high score is insufficient if a second cue is too similar (margin < 0.14).
- Same cue needs a **different final turn** and a >= 2500 ms gap to restart. This is a false-positive guard, not guaranteed perfect repetition recognition.
- Changes to the show while listening invalidate the snapshot. Operator manually sets the focus and re-arms to resume.
- Audio overlaps remain under each cue's existing entry and stop policies. Backwards navigation does **not** automatically stop unrelated running cues; use STOP ALL or configure STOP PREVIOUS for those cues.
- When the browser closes, audio/mic and volatile state are lost. No background remote controls.
- Outputs share the browser/default output; no ASIO, independent PFL, external timecode or silent hardware test guarantee.

## Verified automated acceptance scenarios

- Pure deterministic ES and EN: first GO, jump ahead without intermediate GO, rewind, repeat, cooldown, ambiguous triggers, duplicate turns, stale/final gating.
- Static wiring: user ARM, Web Audio output unlock, existing guarded GO transport, STOP ALL override.
- Chrome UI with generated rights-clear WAV files and synthetic completed speech turns; **zero paid provider calls**. End-to-end proof requires a green CI run; this is not a live Muse ASR accuracy test.
- Expanded browser coverage checks actual engine-start events for skip/rewind/repeat, duplicate-turn suppression, individual STOP, STOP ALL, manual GO disarming, and NEXT/back navigation without sound.

## Further testing

Real microphone/provider validation with actors on both languages; multiple cues sounding simultaneously, similar dialogue, intentional interjections, long pauses and repeated scenes. Quantify false GO per hour, precision/recall, missed or late cues, provider p95 latency, and repeated cue restart. Mass tests remain in `docs/AUDIO_FEATURES_AND_MASS_TEST_PLAN_2026-10-28.md`.
