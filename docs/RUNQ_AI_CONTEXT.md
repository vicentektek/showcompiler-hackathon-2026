# RUNQ AI context and operating boundaries

Status: implementation-oriented guide for the checked-out browser prototype. This describes the current code, not a promise that every future RUNQ design is implemented.

## Project and show data

- The runtime is a Node local server plus browser ES modules and Web Audio. It is not a React, TypeScript, or native desktop application.
- A show uses project JSON schema v1 (`src/core/projectPersistence.mjs`). Its original `scriptText` is preserved; `src/core/script.mjs` derives stable `L1`, `L2`, … identifiers from the original lines. Scene headings are text, not first-class scene records.
- Cues are human-reviewed `DRAFT` objects with stable cue IDs, presentation-only numbers, source line IDs, operator label/trigger/notes, actions and optional playback settings. `PLAY` actions link to asset IDs; unresolved `PLAN_AUDIO` actions remain unplayable.
- Project JSON stores asset metadata and references, not audio bytes. The browser holds decoded/local `File` objects separately. Portable show ZIP import/export carries audio bytes and validates the package before replacing the active show.
- Cue/scene selection, prepared GO, active playback, audition, and pending automatic work are separate states. Browsing, reading, and editing do not advance prepared GO.

## AI surfaces and request context

### Conversational Cue Editor — one selected cue

`src/core/cueConversation.mjs`, `src/ui/cue-conversation-ui.mjs`, and `tools/cueConversationRoutes.mjs` implement a single-cue proposal path. The current cue, show, active Cue Editor workspace, language and safe edit state are read from the active browser show; a stale selection or changed project invalidates the response.

For deterministic local requests, no provider is contacted. If the instruction needs model interpretation, the operator must authorize one Meta request. The bounded context contains:

- show name, workspace `cues`, and mode `design-manual`;
- the nearest preceding heading matching the supported scene/act-heading patterns, if any;
- at most five exact cue source lines (up to 500 characters each), with the total and omitted count;
- at most two lines adjacent to the first cue source line, marked as context rather than source evidence;
- whether the cue audio is linked, unresolved, or absent, plus up to five linked audio titles; the consent disclosure also states that audio files are not sent;
- the selected cue's editable fields, the instruction, pending edits and the last edited field.

The remainder of the script, unrelated cues, the full media library, audio bytes, and credentials are not sent by this route. Context is capped and validated server-side. Script text, titles and user instructions are untrusted reference data. The provider can return only allowlisted edit proposals; the operator previews, applies, discards or undoes them. This path cannot issue GO or alter source references.

### RUNQ Agent — bounded show planning

`src/core/agentCore.mjs` builds the broader context used by `src/ui/runq-agent-ui.mjs` and `tools/agentRoutes.mjs`. It carries the active design workspace, `design-manual` mode, selected cue ID, show identity/counts, up to 80 cues, up to 120 original script lines around a focus line (each clipped to 350 characters), and registered audio asset IDs/names/readiness. If the selected cue would otherwise fall outside the 80-cue excerpt, the builder keeps that cue in the excerpt while preserving the original cue order. The browser still refuses to send any request when the cue list is truncated. Recent conversation is bounded to eight turns of at most 400 characters each.

The Studio agent is not shown in Rehearsal or Direct. Its optional AI action requires one explicit consent; the disclosure states the context categories and that no audio files are sent. The server validates any supplied workspace/mode/selected-cue metadata against design-mode allowlists and cue IDs before provider access. Local deterministic commands do not call a provider. Model output is a strict `PLAN`, `ANSWER`, or `CLARIFY`; operations are revalidated, previewed, explicitly selected/applied, and undoable. Provider responses never mutate the show or execute transport.

### Script proposals, sound and voice

- Theatre analysis proposes source-linked suggestions for human review; approval is a separate action and does not play audio (`src/core/theatreCueAnalysis.mjs`, `src/core/workspace.mjs`).
- Audio library files remain local. The sound-generation workflow has its own explicit provider/cost consent and is not part of GO/STOP.
- Voice Follow and rehearsal matching are separate from AI cue editing. `src/core/voiceFollow.mjs` returns candidates/suggestions, not GO commands. `src/core/rehearsalAutopilot.mjs` is a guarded rehearsal decision state machine; synthetic transcript replay is not acoustic recognition proof.
- The integrated Hero command now proposes one configured MANUAL cue from an explicitly selected ready sound and exact original dialogue. Preview, apply and undo use the shared Agent transaction engine. The Last GO browser gate exercises ZIP persistence and the real WAV engine using injected completed speech turns; live recognition, dictated Hero editing and acoustic output are not yet certified. See `docs/demo/THE_LAST_GO_REPRODUCIBLE.md`.

## Safety and provenance invariants

- Original script text and stable `L#` references are not rewritten or translated.
- AI output is untrusted and cannot become an approved or running cue without operator action.
- GO, STOP, FADE and STOP ALL stay local and deterministic. No network or AI calls are added to their paths.
- Missing, undecoded, or unresolved audio is blocked from playback. Audition uses the same output as GO; it is not isolated PFL.
- Project replacement, STOP ALL, dispose, explicit cancel and cue interruption invalidate applicable pending work. Errors do not restart playback automatically.
- No auto-GO, live-show certification, native Windows installer, reliable multichannel routing, ASIO, or hardware integration is implied by these browser tests.
- Current offline tests use fixtures and stubbed provider responses. A passing test does not measure Meta quality or prove an audible signal.

## Useful offline verification

```powershell
npm run check:syntax
npm test
npm run qa:codex
npm run test:interface
node tools/runq-agent-browser-e2e.mjs
```

These commands must not call a paid provider. Do not run live inference from tests or an unattended coding session.
