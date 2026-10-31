# The Last GO - reproducible operator demo

This combines the original 31-line English script, three original synthetic WAVs, human-reviewed configured cue creation, the existing rehearsal Autopilot, and manual Live transport. It is a browser prototype, not acoustic/hardware or live model certification.

## Provenance

The script, isolated Hero command and initial generator already existed on `docs/runq-hero-operator-handoff-2026-10-31` (original commits `af4d0a8`, `381aa40`, `cd415c6`, `6352dd4`). Their original authorship/dates are not new sprint contributions. This sprint wires them into the current Agent, preview/apply/undo, portable show and real local audio engine.

## Build and open

```powershell
npm run demo:last-go
npm run dev
```

The generator creates `production/runq-video-kit/RUNQ_THE_LAST_GO_EN.showcompiler.zip` and its three WAVs. It **refuses to overwrite** an existing ZIP or WAV; preserve earlier material and choose a fresh output directory through `writeEnglishVideoDemo({output})` if needed.

Open the complete ZIP in RUNQ, not the TXT importer. Confirm all three sounds are available. Original cue directions are L7/L15/L24; spoken triggers come from L6/L14/L23.

## Hero configured cue - explicit review

1. Open the main RUNQ AI workspace, or the contextual Agent in Studio.
2. Deliberately choose the ready sound `01_atmosphere.wav` in the sound selector. No sound is selected automatically.
3. Enter this supported English instruction:

   > Insert a cue before cue three. Name it Decision Tension. Use the selected sound. Set the voice trigger to line twenty.

4. Choose **Plan locally**. This is deterministic local interpretation, not Muse inference. Preview includes the selected audio, exact L20 source and original spoken dialogue.
5. Apply explicitly. The resulting MANUAL cue is number 3; the former cue 3 becomes 4. Preview never plays audio. Undo restores the entire prior project.
6. Save complete ZIP, reload and reopen. Check that four cues, three audio files, original script and trigger remain present.

Only this narrow configured command is supported. Missing/unready sound, absent cue, nondialogue line, duplicate trigger or conflicting exclusion produces clarification. Source/audio readiness are revalidated at preview and commit. Model-returned operations cannot use this configured-cue tool; it is local/operator-only.

### Optional dictated instruction

Open **Dictate instruction**, explicitly record up to 10 seconds using the Setup-selected microphone, then authorize this individual Meta transcription upload and press **Transcribe recording**. Recording alone never uploads. The transcript only fills the command editor: review it, choose **Plan locally**, inspect the full preview and apply manually as above. Actual transcription requires a correctly configured provider and operator spend approval; the coding/browser gates do not contact it.

**Cancel pending**, closing the editor, STOP ALL, workspace changes and project replacement invalidate capture and late results. Reopening identical project content still changes its generation. Cancellation does not guarantee that an upload already started is free. There are no automatic transcription retries or automatic command submission.

## Rehearsal and Live

Choose the visible Rehearsal policy; listen and arm explicitly through the existing consent path. Speak configured original triggers to advance, jump or rewind. Repetition needs a new final turn after the 2.5-second guard. STOP ALL disarms; manual GO also disarms. Live remains manual.

Real microphone/provider recognition, audible output, room noise, latency and device routing still require operator measurements. Automated tests inject completed speech text and execute genuine decoded WAVs through the existing browser engine; they do not measure ASR.

## Offline gates

```powershell
node --test test/heroCue.test.mjs test/heroIntegration.test.mjs
npm run test:last-go
npm run test:dictation
node tools/rehearsal-auto-browser-e2e.mjs
npm run qa:codex
```

The Last GO browser gate verifies original source, explicit sound choice, preview/apply/undo, ZIP save/reload/reopen, four cues and three WAVs, armed synthetic speech jump/rewind, actual browser audio instances, manual Live GO and STOP ALL. No paid requests.

The dictation browser gate separately uses silent synthetic PCM and controlled offline ASR/AI responses. It verifies transcript-only Hero editing, human apply/undo, and late-result rejection after Stage, STOP ALL, identical project reopen and editor close. It is not microphone/ASR or paid-model quality evidence.
