# ShowCompiler — Meta Global AI Developer Hackathon 2026

**Status: new experimental browser prototype with real local audio playback and opt-in Meta Model API cue proposals (live account testing pending).** This repository tracks only work created during the event (26 October–4 November 2026). The intended entry is **Build for Your World**, applying Meta AI to stage and event sound-control workflows.

## Run locally (Node.js 20+)

```sh
npm test
npm run dev
```

Open **http://127.0.0.1:5173** in Chrome or Edge (English default; select **Español** for Spanish), click **Example**, load a WAV/MP3 and approve a mock cue to test **real audio playback**.

Other commands: `npm run check:syntax` checks browser/server modules, and `npm run demo:core` launches the independent terminal walkthrough. No npm dependencies or installation steps are needed.

## Currently implemented

- Local browser interface in **English (default) and Spanish**, with a persistent per-device language selector; import a UTF-8 TXT script and see stable source-line references.
- Load **real local WAV/MP3** files into browser memory; attach them to their asset IDs (audio never leaves the browser).
- Create either a **SIMULATED** cue proposal or, with `MODEL_API_KEY` set on the local Node server, request proposals from the **real Meta Model API**. Each request requires explicit user confirmation; no automatic GO. Provenance (manual vs Meta) is retained in JSON. Script-language auto-detection or a manual BCP47 language hint is **independent of the interface language**; scripts are never translated automatically.
- Execute explicitly approved cues by manual **GO**, **STOP**, **FADE 1.5 s**, and **PARAR TODO** using the browser Web Audio engine.
- UI now uses an explicit [audio backend boundary](src/core/audioBackend.mjs) with truthful capabilities. **Native Rust/WASAPI/ASIO are planned, not implemented.**
- Export and reimport validated versioned JSON project data (**the actual audio is not embedded**).
- Unit and integration tests, plus syntax checks and GitHub Actions verification.
- Local, allowlisted web server bound to 127.0.0.1 only.

**Not implemented or unverified:** Live Meta API access has **not yet been tested with an actual key/quota**; the wired adapter uses the official hosted endpoint but account permissions and actual results require testing. Professional WASAPI/ASIO output routing, persistent audio files, desktop installer, hardware interfaces and full portable projects are not implemented. Browser audio still needs manual audible acceptance. No mock feature is described as real inference.

Read the [EN/ES multilingual design](docs/I18N_ARCHITECTURE.md), [Meta Model API local setup](docs/META_MODEL_API.md), [desktop audio architecture decision](docs/ADR-0001_MOTOR_AUDIO_NATIVO_2026-10-26.md), [real audio GO/STOP walkthrough](docs/LOCAL_AUDIO_MVP.md), [UI walkthrough](docs/UI_PROTOTYPE.md), [implementation plan](docs/IMPLEMENTATION_PLAN.md), [persistence limits](docs/PERSISTENCE.md), and [contribution log](docs/CONTRIBUTIONS.md).

## Planned competition path

TXT script → Meta-model cue proposals → strict validation → explicit operator approval → deterministic audio execution. Only completed, tested features developed during the hackathon will be claimed in the submission.

## Compliance

No source code from the earlier application was imported. Previous research is a design reference, not event-created code. Keep dated commits and accurate feature descriptions. The submitted repository must be public by the deadline; do not commit credentials, private scripts, or unlicensed media.

Development branches and draft PRs remain isolated until reviewed. The bilingual implementation is on `feat/i18n-en-es-2026-10-26`, based on `feat/meta-model-cue-proposals`. The default `main` does not contain these additions yet.
