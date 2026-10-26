# SHOWCOMPILER — Hackathon 2026 implementation plan

## Rules and scope
All demonstrated code and features must be built during 26 October–4 November 2026. Earlier research and example code can inform design, but pre-event functionality cannot be presented as new. Maintain verifiable commits and clearly label simulated integrations. The final repository must be public.

## Target
Build for Your World: theatrical script -> Meta AI cue suggestions -> operator approval -> deterministic audio playback.

## Architecture
- React + TypeScript + Vite for the UI.
- Domain objects: ScriptLine, AudioAsset, CueProposal, Cue, CueAction, ShowProject.
- ScriptLine = { id, lineNumber, text }; all citations reference imported lines.
- CueProposal = { id, sourceLineIds, label, actions }; reject nonexistent lines and assets.
- Actions: PLAY(assetId), STOP(playbackId), FADE(playbackId, targetGain, durationMs).
- Meta API adapter on a backend, with keys only in server environment. Separate explicit mock mode.
- Validation and human approval before turning proposals into cues.
- Web Audio transport for MVP; no generative model on the live execution path.
- Versioned project persistence and export/import.

## Order of work
P0 scaffold + test runner + script and licensed sample audio.
P1 importer + numbered script + tests.
P2 AI adapter + schema validation + mock/live distinction.
P3 approval UI + cue editor.
P4 PLAY/STOP/FADE deterministic transport + panic stop.
P5 save/load + working demo + three-minute video.

## Exclusions
No autonomous GO in live mode; no untested MagicQ/timecode hardware integration; no ASIO or professional certification claims.

## Acceptance
A reviewer can import a script, see cited AI suggestions, approve them, run and stop a sound cue, reload the project, and distinguish completed features from roadmap.
