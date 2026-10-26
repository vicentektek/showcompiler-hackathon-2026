# Browser UI — hackathon prototype

The frontend is a local, dependency-free rehearsal prototype. It has real browser audio playback and opt-in model adapters, but it is not production show-control software. Live Meta and Baseten inference remain unverified with real accounts.

## Start on Windows

From the repository root in PowerShell:

```powershell
npm test
npm run check:syntax
npm run dev
```

Open `http://127.0.0.1:5173` in Chrome or Edge. Stop with **Ctrl+C**. The server binds only to `127.0.0.1`. If port 5173 is busy:

```powershell
$env:PORT = 5174
npm run dev
```

## Manual workflow

1. Select **Example** or import a UTF-8 `.txt` script. The source keeps exact text and stable `L#` references.
2. Optionally load a supported local audio file. It is decoded into browser memory and never uploaded.
3. Create a simulated proposal, or choose a configured provider. Meta is the primary path; Baseten Muse Spark Open is the fallback.
4. For Meta, inspect the scene-window scope and confirmation. One click authorizes one potentially billable request (maximum two windows); later coverage needs another click.
5. Inspect visible line/window coverage and transient cue-kind/basis/transport details. Continuing ambience, stop, and silence are observations rather than executable PLAY proposals.
6. Approve or reject each pending proposal. Approval creates a `DRAFT`; no audio starts.
7. For an unbound sound choose **Library**, **Decide later**, or **Prepare AI generation**. The last choice records intent only and never contacts an audio generator.
8. GO is enabled only for an approved `PLAY` cue whose local file is loaded. Use **STOP**, **FADE 1.5 s**, and **STOP ALL** as operator actions.
9. Download project JSON and reopen it. Script, review state, cues, and sound-resolution intent persist; audio files and transient analysis metadata do not.

## Model boundary

- No model call occurs on page load, script import, proposal approval, project open, sound-resolution change, or GO.
- Every external analysis requires a confirmation.
- The browser calls only the same-origin loopback server; API keys remain in Node.
- The server sends bounded script windows and audio names/IDs, never WAV/MP3 bytes.
- Requests have zero automatic retries.
- Safe error categories are localized; raw upstream bodies/messages, full scripts, secrets, and stack traces are not shown.
- The guarded CLI smoke has not been run, so the UI must not imply that live inference is proven.

## Playback boundary

The UI uses the audio-backend facade rather than accessing Web Audio directly. The engine validates each cue again and rejects `PLAN_AUDIO`, unknown assets, unloaded buffers, duplicate GO, and unsupported actions. Model/network code is absent from the playback path, so loaded GO/STOP/fade/panic remains deterministic when offline.

## Persistence boundary

Project schema v1 includes `PLAY` and `PLAN_AUDIO`, but not:

- audio data;
- UI locale or model-language hint;
- scene coverage/next-window state;
- `CueSuggestionV2` details or non-PLAY observations;
- provider diagnostics or usage;
- live transport state.

Refreshing without exporting loses in-memory changes. JSON is not a portable media backup.

## Manual acceptance checklist

- Switch EN/ES without losing the current show or interrupting audio.
- Import multilingual text and verify exact characters/line IDs survive UI switching and JSON roundtrip.
- Verify the Meta confirmation describes exactly one request and the current batch size.
- Complete more than one scene batch and confirm coverage advances only after successful responses.
- Test explicit sound, suggested atmosphere, remembered sound, continuing ambience, silence, and stop cases.
- Confirm every proposal requires approve/reject and approval never starts playback.
- Approve an unbound cue; verify all three resolution choices and blocked GO.
- Assign/load audio and audibly test GO, STOP, fade, and STOP ALL at a safe level.
- Disconnect the network and repeat local transport operations.
- Exercise invalid JSON, missing files, stale responses, provider timeout, refusal, schema error, and project changes during analysis.
- Inspect responsive layout, keyboard focus, screen-reader status regions, and confirmation dialogs in Chrome and Edge.

## Known limits

- Only the first 300 script lines are rendered in the preview; manual source selection is capped at 1,000 even though analysis planning and the parser can cover more.
- Only EN/ES UI catalogs exist; model-language hints do not guarantee quality in every language.
- Browser audio lacks professional device routing, independent preview bus, multichannel output, native WASAPI/ASIO, packaging, and certification.
- No paid sound generation, desktop installer, collaborative server, or portable show bundle exists.

Record manual evidence before merging or making demo claims. Automated Node tests do not replace audible, visual, accessibility, or real-provider acceptance.
