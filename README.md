# ShowCompiler — Meta Global AI Developer Hackathon 2026

**Status: independent, early-stage domain prototype.** This repository is for new work created during the event (26 October–4 November 2026). The intended entry is **Build for Your World**, applying Meta models to stage and event sound-control workflows.

## Implemented so far
- Read text scripts and preserve source-line references.
- Validate untrusted proposed PLAY cues against actual script lines and an asset-ID index.
- Require an operator decision to approve or reject a suggestion.
- On approval, create a `DRAFT` cue without launching audio.
- Run an interactive **mock** walkthrough in the terminal, with Node.js built-ins only.
- Automated tests and GitHub Actions verification.

## Try the current core (Node.js 20+)

```sh
npm test
node tools/review-demo.mjs
```

The example is intentionally labeled **MOCK**: it has **no real AI inference, no real audio asset or playback, no GUI, and no desktop installer**. `APROBAR` means the human is approving a draft cue object, not triggering GO.

See [the demo guide](docs/CORE_DEMO.md), [implementation plan](docs/IMPLEMENTATION_PLAN.md), and [contribution log](docs/CONTRIBUTIONS.md).

## Planned competition path
TXT script → Meta-model cue proposals → strict validation → explicit human approval → deterministic audio execution. Only implemented and tested functionality will be shown as complete in the final submission.

## Compliance and provenance
No pre-event application source was imported into this new implementation. Earlier research is design reference, not a claim of event-created code. Keep the feature commit history and contribution log; mark mock data clearly. Make the submission repository public before submitting; do not commit credentials, private scripts or media without rights.

Development is isolated on branch `feat/hackathon-script-core` until reviewed. The default `main` may not yet include these changes.
