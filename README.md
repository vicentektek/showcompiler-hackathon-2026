# ShowCompiler — Meta Global AI Developer Hackathon 2026

**Status: new experimental browser prototype with real local audio playback and opt-in Meta Model API or Baseten-hosted Muse Spark Open proposals (live inference testing pending).** This repository tracks only work created during the event (26 October–4 November 2026). The intended entry is **Build for Your World**, applying Meta AI to stage and event sound-control workflows.

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
- **Analyze scripts with no audio library:** approve sound-design cues as **AUDIO PENDING**; choose an existing local sound, defer assignment, or prepare a future AI sound-generation request (preparation only; no generator integration or credits used).
- Create either a **SIMULATED** cue proposal or select **Meta Model API** (MODEL_API_KEY) or **Baseten-hosted Meta Muse Spark Open** (BASETEN_API_KEY). The original Meta adapter is unchanged. Every external inference request requires operator confirmation; no automatic GO. JSON records exact provenance (manual, Meta or Baseten), and script-language hints remain independent of the UI.
- Execute explicitly approved cues by manual **GO**, **STOP**, **FADE 1.5 s**, and **PARAR TODO** using the browser Web Audio engine.
- UI now uses an explicit [audio backend boundary](src/core/audioBackend.mjs) with truthful capabilities. **Native Rust/WASAPI/ASIO are planned, not implemented.**
- Export and reimport validated versioned JSON project data (**the actual audio is not embedded**).
- Unit and integration tests, plus syntax checks and GitHub Actions verification.
- Local, allowlisted web server bound to 127.0.0.1 only.

**Not implemented or unverified:** Neither live first-party Meta API access nor the Baseten-hosted Muse Spark Open inference have yet been tested with an actual account key/quota. Baseten Muse Spark Open does not provide structured JSON mode; its output must pass strict validation. Professional WASAPI/ASIO output routing, persistent audio files, desktop installer, hardware interfaces and full portable projects are not implemented. Browser audio still needs manual audible acceptance. No mock feature is described as real inference.

Read the [sound-first workflow ADR](docs/ADR-0002_SOUND_PLANNING_GENERATION_FLOW.md), [Baseten-hosted Muse Spark Open fallback](docs/BASETEN_MUSE_OPEN_FALLBACK.md), [EN/ES multilingual design](docs/I18N_ARCHITECTURE.md), [Meta Model API local setup](docs/META_MODEL_API.md), [desktop audio architecture decision](docs/ADR-0001_MOTOR_AUDIO_NATIVO_2026-10-26.md), [real audio GO/STOP walkthrough](docs/LOCAL_AUDIO_MVP.md), [UI walkthrough](docs/UI_PROTOTYPE.md), [implementation plan](docs/IMPLEMENTATION_PLAN.md), [persistence limits](docs/PERSISTENCE.md), and [contribution log](docs/CONTRIBUTIONS.md).

## Planned competition path

TXT script → Meta-model cue proposals → strict validation → explicit operator approval → deterministic audio execution. Only completed, tested features developed during the hackathon will be claimed in the submission.

## Compliance

No source code from the earlier application was imported. Previous research is a design reference, not event-created code. Keep dated commits and accurate feature descriptions. The submitted repository must be public by the deadline; do not commit credentials, private scripts, or unlicensed media.

Development branches and draft PRs remain isolated until reviewed. The sound-planning experimental branch is `feat/audio-planning-unbound-cues`, based on `feat/baseten-muse-open-fallback`. The fallback branch is unchanged. , based on `feat/i18n-en-es-2026-10-26`. The default `main` does not contain these additions yet.
