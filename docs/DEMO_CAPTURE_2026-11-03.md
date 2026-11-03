# RUNQ — Final video capture checklist

> Use the **frozen functional commit** `b4e7df724d569c1d5af7682540c206ff3fb97701`. Do not switch to `main`, the docs branch, or a historical V15 build during capture. Keep the application running while documentation is prepared elsewhere.

## Footage priority (capture clean takes in this order)

| Clip | Target capture | On-screen truth to show | Recommended screen time |
| --- | --- | --- | --- |
| A | Home / fresh show | RUNQ identity; script import options TXT/PDF/DOCX | 8–12 s |
| B | Script | Original dialogue/acotaciones, stable L# references | 15–20 s |
| C | AI source-linked proposals | Meta analysis if a genuine request was made; otherwise clearly label offline example | 25–35 s |
| D | Review decisions | Approve/reject/edit, cue created only after human decision | 15–25 s |
| E | Sound design per cue | Actual sound description and gain/fades/loop/overlap panel; save without GO | 25–30 s |
| F | Audio library | Assign a real WAV; show source is loaded/decodable | 15–20 s |
| G | Rehearsal | Mic language, listening and explicit ARM; real trigger/Auto GO only if captured successfully | 20–35 s |
| H | Operation | Prepared NEXT vs selection, manual GO, running sound, stop and STOP ALL | 20–30 s |
| I | Archive | Export media-inclusive show ZIP (optional final proof) | 8–12 s |

This is a shot list, not a mandatory video duration specification. Check the authenticated submission portal for its current restrictions before exporting.

## Recording practices
- 1920x1080 recommended; lock browser zoom; maximize window and hide private tabs and notifications.
- Keep the same show and a readable cue naming scheme in all clips; avoid cutting between conflicting versions.
- Never display API keys, local ledgers, full billing logs, private scripts, account details, or unrelated windows.
- Rehearsal microphone audio can be temperamental. Save a working take; if it fails, show the verified manual fallback and describe the limitation.
- Do not add simulated waveform/meters or edited model outputs as if they were live measurements.
- If speeding up model waiting time, label the edit. Always show the real operator approval and resulting cue.
- Capture a clean paused UI screenshot of home, script/cue review, sound settings and rehearsal/operation for possible portal screenshots.
- Keep raw recordings and exported audio outside Git unless expressly licensed and needed.
- Record final version SHA in the editor notes. Later docs commits must not be confused with the recorded application build.

## Suggested structure
Problem (20 s) → original script and Meta proposal (60 s) → human review and sound design (45 s) → rehearsal (30 s) → operation/export/closing (25 s). Adapt to the portal's actual maximum length.

## Narration
Use [submission copy](SUBMISSION_COPY_2026-11-03.md). Distinguish Meta-powered inference from local deterministic prompt creation, human review and manual GO.
