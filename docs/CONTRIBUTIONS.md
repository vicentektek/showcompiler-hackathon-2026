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

### Verification evidence
- Branch: `feat/hackathon-script-core`.
- Test command: `npm test` (Node.js 20+; no dependencies).
- Total: 52/52 tests (38 prior + 10 new workspace + 4 browser/server verification) successful in GitHub Actions on Node.js 22; syntax checks passed. Browser UI still awaits manual acceptance.
- GitHub Actions: Core tests succeeded on the branch, [workflow run #40372369548](https://github.com/vicentektek/showcompiler-hackathon-2026/actions/runs/40372369548); the checkout and Node test step completed successfully.
- Pending: manual Chrome/Edge acceptance of the new UI, independent code review, actual Meta API integration, audio engine and desktop installer. Do not claim these are implemented.
- JSON project format does **not** contain actual audio data; it is not a complete portable backup.
- `main` remains unchanged.

### Submission truthfulness
- AI proposals in unit tests are hand-written mock input, **not** Meta model output.
- A local browser **prototype UI** exists and needs manual acceptance. No playback engine, Meta API integration, desktop installer or complete competition demo exists. The UI and terminal flow use manually authored **mock** cue suggestions.
- `operatorConfirmed` is a flag, not human authentication. A real UI must restrict the flag to explicit operator interactions and persist decisions.
- No old application code is imported.
- No third-party assets, secrets or dependencies are committed in these changes.
