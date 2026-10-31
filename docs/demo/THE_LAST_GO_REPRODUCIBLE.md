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

The Last GO browser gate now starts with original TXT import and multiple original WAV import. It uses one explicitly OFFLINE model-shaped response and three individual human approvals, locally reviewed original-dialogue voice feet, Hero preview/apply/undo, graphical 50–1000 ms review, a genuine 950 ms looping region and persisted fades. It verifies four cues/three WAVs through ZIP save/reopen and JSON without audio, then restores missing media through the visible actual file-drop surface, refusing overwrites or drops during playback. Original spoken dialogue matches the proposed terminal feet exactly after speech normalization. Synthetic final turns verify skip/rewind, duplicate suppression, a new repeat after cooldown, independent STOP with the bell still running, panic/disarm and manual Live GO/NEXT/back. No paid requests; fixture provider badges are not live inference evidence.

The dictation browser gate separately uses silent synthetic PCM and controlled offline ASR/AI responses. It verifies transcript-only Hero editing, human apply/undo, and late-result rejection after Stage, STOP ALL, identical project reopen and editor close. It is not microphone/ASR or paid-model quality evidence.

## Brief manual/acoustic acceptance (10–15 minutes)

Use the preserved original show, a safe speaker/headphone output and low initial volume. Record Windows/browser version, chosen input/output, operator, timestamp, observed results and measured latencies externally. Do not mark a step passed merely because a status badge changes.

| Step | Action | Required observation |
|---|---|---|
| 1 | Open original complete show and read L6/L7, L14/L15, L23/L24. | Original text, three ready WAVs, no automatic playback. |
| 2 | Audition `01_atmosphere.wav`, then stop audition. | Real audible output on the **same** bus as GO, not isolated PFL. |
| 3 | Review/apply the Hero instruction above with deliberately selected sound. | L20 and exact sound visible before approval; fourth cue inserted; no playback from applying/undoing. |
| 4 | Edit first cue IN=0.05s, OUT=1s, fade-in=0.1s, LOOP on; save. Set bell fade-out=0.15s. | Waveform/settings retained. Manual GO audibly loops; STOP of the loop leaves an independently started bell running; STOP ALL silences both. |
| 5 | Choose Assist and the actual Setup microphone. Start recognition only through its individually approved configured/budgeted path. Speak original dialogue. | Report whether a **physical** microphone/API was used. Assist only suggests; record final-transcript latency and missed/false matches. If provider/account gates remain unresolved, mark this physical step pending, not simulated PASS. |
| 6 | Explicitly arm Autopilot. Speak opening, L20 Hero, then bell; repeat the same take and a fresh take after >2.5s. | Skip/rewind only the intended cue; duplicate final turn never replays. A new take may repeat after guard. Stop all, then speak again: no automatic restart. Manual GO disarms. |
| 7 | Enter Directo; inspect/search, NEXT/back, then explicit GO and STOP ALL. | Navigation never plays. GO uses prepared item, STOP ALL audibly silences and invalidates delayed work. |
| 8 | Export complete ZIP, reload/reopen. Also save JSON through File menu and reopen it. | ZIP retains original script/cues/audio/edits. JSON shows missing audio and blocks GO. Drop original WAVs into visible Library zone: restores three IDs without changing cues; repeat drop skips loaded sources. |

Report measured microphone-to-final, final-to-audible-start and STOP ALL-to-silence timings with measurement method/sample count. No acoustic accuracy, routing, ASIO or professional certification is inferred from the automated gate. Successful original-library editing is **not** Modal-generated provenance; a real generated take still needs its own authorized job, acceptance and validated bytes before cue creation.

## Windows delivery

The verified [Windows browser-demo package](WINDOWS_BROWSER_PACKAGE.md) bundles this original show and its WAVs with an unsigned EXE launcher and the existing browser runtime. Its separate extracted-package gate verifies actual startup, complete-show export/reload/reopen, GO/STOP ALL and clean server shutdown; it does not certify native audio or physical microphone recognition.
