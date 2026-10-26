# ShowCompiler — Meta Global AI Developer Hackathon 2026

**Status: new, experimental browser prototype.** This repository tracks only work created during the event (26 October–4 November 2026). The intended entry is **Build for Your World**, applying Meta AI to stage and event sound-control workflows.

## Run locally (Node.js 20+)

```sh
npm test
npm run dev
```

Open **http://127.0.0.1:5173** in Chrome or Edge and click **Ejemplo**.

Other commands: `npm run check:syntax` checks browser/server modules, and `npm run demo:core` launches the independent terminal walkthrough. No npm dependencies or installation steps are needed.

## Currently implemented

- Local browser interface: import an UTF-8 TXT script and see stable line references.
- Register **audio metadata only** (file name/ID; no audio files are imported).
- Create a **SIMULATED** cue proposal, review it explicitly, then approve it as `DRAFT` or reject it.
- Export and reimport validated versioned JSON project data.
- Unit and integration tests, plus syntax checks and GitHub Actions verification.
- Local, allowlisted web server bound to 127.0.0.1 only.

**Not implemented:** real Meta-model calls, generative cue analysis, audio playback, STOP/FADE engine, desktop installer, hardware interfaces, or complete portable project export with audio assets. No mock feature should be described as AI integration. Browser behavior still needs hands-on acceptance testing.

Read the [UI walkthrough](docs/UI_PROTOTYPE.md), [implementation plan](docs/IMPLEMENTATION_PLAN.md), [persistence limits](docs/PERSISTENCE.md), and [contribution log](docs/CONTRIBUTIONS.md).

## Planned competition path

TXT script → Meta-model cue proposals → strict validation → explicit operator approval → deterministic audio execution. Only completed, tested features developed during the hackathon will be claimed in the submission.

## Compliance

No source code from the earlier application was imported. Previous research is a design reference, not event-created code. Keep dated commits and accurate feature descriptions. The submitted repository must be public by the deadline; do not commit credentials, private scripts, or unlicensed media.

Development remains isolated on `feat/hackathon-script-core` until reviewed. The default `main` may not contain this code yet.
