# Contributions developed during Meta Global AI Developer Hackathon 2026

Only source and functionality created during the event window (26 October–4 November 2026) may be described as hackathon contributions. This log tracks the new implementation separately from prior research.

| Date | New contribution | Verification | Demonstrable in product? |
|---|---|---|---|
| 2026-10-26 | Hackathon-specific implementation plan and compliance log | GitHub commits in new repository | Documentation only |
| 2026-10-26 | Independent script parser, stable line IDs, accent-insensitive search | 5 Node tests pass in isolated local copy | Library only; no user interface |
| 2026-10-26 | Independent untrusted proposal validator (PLAY only) | 8 Node tests pass in isolated local copy | Library only; no Meta API |
| 2026-10-26 | Explicit proposal review, rejection and conversion to DRAFT cue | 9 additional Node tests pass in isolated local copy | Library only; not wired to UI |
| 2026-10-26 | Integration test, rights-clear original script fixture, and operator-controlled terminal mock demo | 3 additional tests pass; GitHub Actions successful | Terminal simulation only, not a product UI |
| 2026-10-26 | Versioned JSON serialization/deserialization of script, assets metadata, proposals and DRAFT cues | 13 additional Node tests; [GitHub Actions success](https://github.com/vicentektek/showcompiler-hackathon-2026/actions/runs/40374044921) | Library only; no file picker or embedded audio |
| 2026-10-26 | Independent domain workflow and local browser UI with mock-only proposal creation, explicit review, JSON file picker, and restricted loopback server | 14 additional tests; Node syntax + [GitHub Actions success](https://github.com/vicentektek/showcompiler-hackathon-2026/actions/runs/40377108460) | Browser prototype coded; visual/manual browser acceptance pending |
| 2026-10-26 | Local browser Web Audio engine: operator GO, STOP, 1.5s fade, panic STOP, local file decoding; UI wiring and smoke tests | 13 new mock-WebAudio tests, browser/HTTP checks, [GitHub Actions: 65/65 tests passed](https://github.com/vicentektek/showcompiler-hackathon-2026/actions/runs/40381536145) | Actual audio code available; hardware/browser audible acceptance remains pending |
| 2026-10-26 | Desktop-first WASAPI/ASIO architecture ADR and replaceable browser audio backend facade; UI no longer imports Web Audio engine directly | 5 additional tests; [GitHub Actions 70/70](https://github.com/vicentektek/showcompiler-hackathon-2026/actions/runs/40387476270) | Boundary implemented; native backend not implemented |
| 2026-10-26 | Optional official Meta Model API provider, loopback-only server proxy, opt-in UI, strict JSON schema, proposal provenance persisted in JSON | 17 additional tests; [GitHub Actions 87/87](https://github.com/vicentektek/showcompiler-hackathon-2026/actions/runs/40391036859) | Implemented behind key; not yet exercised with a real Meta account, API quota or actual inference |

### Verification evidence
- Branch: `feat/hackathon-script-core`.
- Test command: `npm test` (Node.js 20+; no dependencies).
- Total: **87/87 automated tests passed** in GitHub Actions with Node.js 22; module syntax checks passed. The new Meta API route has only been tested against mocked transport responses. Local speaker/headphone playback has not yet been confirmed manually.
- GitHub Actions: Core tests succeeded on the branch, [workflow run #40372369548](https://github.com/vicentektek/showcompiler-hackathon-2026/actions/runs/40372369548); the checkout and Node test step completed successfully.
- Pending: manual Chrome/Edge acceptance of actual audio GO, STOP, fade and panic; independent code review, actual live Meta API credentials/quota verification, Windows native WASAPI proof, and desktop installer. Web Audio is a local prototype backend, not certified for professional live shows. ASIO is a legally gated future option.
- JSON project format does **not** contain actual audio data; it is not a complete portable backup.
- `main` remains unchanged.

### Submission truthfulness
- AI proposals in unit tests are hand-written mock input, **not** Meta model output.
- A local browser **prototype UI** and actual browser Web Audio playback engine exist, with manual audible acceptance pending. Meta API integration coded but not verified against real credentials; no desktop installer, professional ASIO/routing, or complete competition demo exists. The generated cue suggestions are still manually authored **mock** input.
- `operatorConfirmed` is a flag, not human authentication. A real UI must restrict the flag to explicit operator interactions and persist decisions.
- No old application code is imported.
- No third-party assets, secrets or dependencies are committed in these changes.
