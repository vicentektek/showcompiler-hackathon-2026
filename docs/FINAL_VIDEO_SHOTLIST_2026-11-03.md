# RUNQ — Final video capture and edit sheet

**Duration:** 03:00 maximum. **Format:** 1920×1080, 16:9, English voiceover and subtitles. Capture actual application footage on the final verified commit; no invented model outputs or voice detection.

| Time | Visual shot | Operator action | Voiceover (draft) | Evidence / fallback |
|---|---|---|---|---|
| 00:00–00:18 | Theatre script + RUNQ identity | Show original script, then app home | "In theatre, every sound has a cue. Preparing them takes time. Rehearsals change everything." | Use original/licensed assets |
| 00:18–00:45 | Create project and Script | Import short TXT; show line numbers and linked cue navigation | "RUNQ connects the script to the technical show, keeping every cue traceable to its source." | Show real line IDs |
| 00:45–01:21 | Muse assistant and cue proposals | Submit one authorized Muse request or show clearly labeled recorded prior result; accept one cue, reject another | "Meta Muse Spark analyzes dramatic context and suggests cues. The operator decides what enters the show." | Record request/response and model name; do not fake live inference |
| 01:21–01:39 | Sound suggestion, prompt, library | Generate a textual sound brief; copy prompt; import licensed audio; assign cue | "For each cue, RUNQ describes the sound needed and prepares a prompt for external audio tools. Existing audio can be imported and assigned." | No Modal call; if feature pending, record only after implementation |
| 01:39–02:06 | Cue editor then Live | Show waveform, fade; set NEXT, GO and STOP | "Precise playback controls make the result usable on stage." | Verify output and no accidental GO |
| 02:06–02:48 | Rehearsal with speech | Arm voice-follow; speak exact scripted cue phrase; show recognition and auto GO; optionally repeat | "During rehearsal, RUNQ follows dialogue and can trigger the next sound automatically, while manual control remains available." | One continuous genuine recording; repetition/skip only if verified |
| 02:48–03:00 | Final wide shot and title | Show RunQ branding and closing line | "RUNQ. From Script to Stage." | No unsupported claims |

## Recording preparation
- Record git SHA, branch, OS/browser and RUNQ version.
- Use a 60–90 second original mini-play with 3–5 cues: door knock, corridor ambience, footsteps, short transition. Sound assets must be licensed or original.
- Keep audio from browser/system output and voice input on separate tracks if possible.
- Turn off notifications; hide browser bookmarks, API keys, cost details, user data and personal files.
- Use an offline show ZIP for repeatable rehearsal footage; label preprepared results as such.
- For Meta call, log authorization, model, input, output and elapsed time without exposing secrets.
- Capture clean plates of each screen and a backup run for every critical shot.
- Record the voice-follow sequence in a continuous take; do not manufacture cue detection with edits.
- Verify subtitles, readable UI, narration intelligibility, media rights, no accidental sound clipping.
- Export H.264 MP4 1080p with reasonable bitrate; check exact contest limits separately.

## Critical blockers
1. Final application branch and actual integrated commit unknown.
2. Audio-prompt-only UI not yet verified implemented.
3. No fresh voice-follow live capture or final QA.
4. Public repo/rights/secret-history clearance not completed.

## Edit rules
Prefer genuine screen capture over fabricated visuals. Motion graphics can illustrate the problem, but label illustrative footage. Do not describe a precomputed result as a live call. Do not present rehearsal autopilot as a certified unattended live-show system.
