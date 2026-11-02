# RUNQ repository guide

## Starting point

The working reference is `verified-working-2026-11-02` (`6d1d65d`). The documentation-preparation branch is `docs/hackathon-submission-2026-11-02`. Neither is a merge to `main`.

## Development setup

Requires Node.js 20+ and Chrome or Edge for browser-based testing.

```sh
npm install --no-audit --no-fund
npm run dev
```

The local server normally serves `http://127.0.0.1:5173`; use the address printed by the process if the port changes.

## Offline verification

```sh
npm run qa:codex
```

For product browser tests:

```sh
npm run test:product
```

Do not interpret offline mocks as live model quality evidence.

## Source map

| Area | Location |
| --- | --- |
| Browser interface | `src/ui/` |
| Cue, audio and project logic | `src/core/` |
| Sound generation UI | `src/sfx/` |
| Local HTTP routes and QA tools | `tools/` |
| Offline regression tests | `test/` |
| Technical notes | `docs/` |
| Demo/test fixtures | `fixtures/` |

## Operational boundaries

- AI suggestions are proposals; cue changes require review.
- Local GO/STOP paths must remain deterministic.
- Do not commit credentials, private scripts, provider responses or local ledgers.
- Local monetary budget caps for Meta and Modal were removed by owner instruction; provider billing and service quotas still apply.
- Baseten and Fireworks campaign restrictions remain documented in `AGENTS.md`; do not advertise them as enabled integrations without verification.
- Export full-show ZIP when moving audio between machines; JSON alone does not include media bytes.

## Related documents

- [Hackathon overview](SUBMISSION_OVERVIEW.md)
- [Demo storyboard](DEMO_SCRIPT_3_MIN.md)
- [Submission checklist](RELEASE_CHECKLIST.md)
- [Verified version](VERIFIED_VERSION_2026-11-02.md)
- [Meta/Modal budget change](META_MODAL_UNLIMITED_2026-11-02.md)
