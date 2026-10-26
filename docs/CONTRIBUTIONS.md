# Hackathon contribution log

Only work created in this repository during the Meta Global AI Developer Hackathon window (26 October–4 November 2026) is counted. No source was copied from the earlier SHOWCOMPILER repository.

## 26 October 2026

| Contribution | Verification | Honest product status |
|---|---|---|
| Independent script parser, stable line IDs, search, untrusted proposal validation, and explicit approve/reject transition to `DRAFT` | Pure Node unit tests | New domain core; no automatic execution |
| Rights-clear terminal review demonstration and GitHub Actions test workflow | Integration and CLI tests | Simulation only |
| Strict schema-v1 JSON codec for script, asset metadata, proposals, and cues | Roundtrip, limits, malformed-input, reference, and pollution tests | Browser save/open exists; audio bytes are excluded |
| Local browser UI and loopback allowlisted server | DOM/static and HTTP tests | Manual visual/accessibility acceptance pending |
| Browser Web Audio backend with manual GO, STOP, fade, STOP ALL, decoding, and reset protection | Mock-WebAudio tests | Real local playback code; audible hardware/browser acceptance pending |
| Replaceable audio-backend boundary and desktop WASAPI/ASIO architecture ADR | Interface/capability tests | Native backend not implemented |
| Optional first-party Meta Model API adapter with server-only key, explicit consent, strict structured output, and source provenance | Mocked-transport unit/HTTP tests | Live credentials/quota/inference unverified |
| English-default and Spanish UI, device-local locale, independent source-language hint | Catalog parity, safe interpolation, persistence, and request tests | Manual EN/ES browser acceptance pending |
| Baseten-hosted Muse Spark Open fallback with fail-closed plain-JSON parsing | Mocked transport and route tests | Live partner inference unverified |
| Asset-free planning with `PLAN_AUDIO`; library, DEFER, and GENERATE-intent paths | Workflow, persistence, and audio safety tests | No sound generator; unresolved GO is blocked |
| Theatre prompt specialization and exact-line gold evaluator | Synthetic rubric tests | Offline baseline, not observed model quality |
| Official Meta contract hardening: exact strict schema parity, required `soundPrompt`, safe phased diagnostics, timeout/transport/envelope/refusal handling, zero retry | Deterministic provider and integration matrix, including HTTP 400/401/402/403/404/429/5xx/504 | No live request performed |
| Explicit one-request Meta smoke CLI using a three-line zero-asset synthetic script | Tests prove no authorization/key means zero calls and authorized path calls injected transport once | Implemented but **not run live** |
| Deterministic multilingual scene/window planner and visible coverage model | Exact coverage, context, stable-ID, nonmutation, and UI tests | Transient only; no project-format change |
| Strict transient `CueSuggestionV2`, theatrical transport distinctions, semantic evidence checks, and deterministic deduplication | DTO/schema/semantic/dedupe tests | Only PLAY becomes a pending project proposal |
| Extended evaluation for hallucinated references, duplicates, forbidden triggers, precision, recall, and F1 | Rights-clear multilingual aggregate fixtures | Reproducible offline measurement |

## Current verification

- Working branch: `feat/meta-muse-reliable-cues`, based on `feat/meta-theatrical-prompt-evals`.
- Verified locally: `npm test` reports **180/180 passing**, `npm run check:syntax` passes, and `git diff --check` is clean.
- Meta and Baseten provider paths are tested using injected/mock transports only.
- The guarded `npm run smoke:meta -- --authorize-one-billable-meta-request` command is deliberately excluded from CI and has **not** been executed.
- `main` is not modified or merged automatically. Delivery is through a draft PR for review.

Historical GitHub Actions evidence remains visible in repository history. The draft PR should record the final local test count and current CI run rather than reusing an obsolete count from an earlier stacked branch.

## Pending manual evidence

- Explicitly authorized live Meta contract smoke with safe usage/latency output.
- Human review of a rights-clear multilingual corpus, including a 91-line script and negative dialogue-memory fixture.
- Chrome/Edge EN/ES switching, scene coverage progression, review controls, and responsive/accessibility checks.
- Audible local GO/STOP/fade/STOP ALL at a safe level, including network-offline operation.
- JSON save/reopen with `PLAN_AUDIO`, reassignment/reload of audio, and confirmation that transient analysis data is absent.
- Independent code/security/privacy review before any merge.

## Submission truthfulness

- Synthetic expected/predicted suggestions are test fixtures, not Meta output.
- “Prepare AI generation” records intent; it does not synthesize audio or spend generation credits.
- `operatorConfirmed` expresses a UI transition, not authenticated identity.
- Browser playback is real local code but not professional/certified show control.
- Native WASAPI/ASIO, complete portable projects, desktop installer, hardware routing, and paid audio generation are not implemented.
- Never commit keys, account/billing details, full private scripts, raw provider responses, or unlicensed media.
