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

## 27 October 2026 — interface, operations and complete-show portability

| New work / isolated draft PR | Evidence | Truthful state |
|---|---|---|
| [#9](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/9) Local audio attach/replace from approved cue | Workspace, browser/static integration tests | Original File reference and decoded buffer are local to the browser |
| [#10](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/10) Navigate back to precise script line, accent-insensitive search and operator preflight | Navigation, source and readiness tests | Preflight is advisory, not live-mode arming |
| [#11](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/11) Editable cue title, trigger and operator notes | JSON persistence and UI tests | Editing changes approved cue metadata, not model output |
| [#12](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/12) Manual prepared-cue GO, SKIP and next-cue position | Pure queue and operation tests | Preparation does not execute sound automatically |
| [#13](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/13) Same-output audio audition and STOP ALL interlocks | Audio mock and UI tests | Audition uses the same speakers as GO; no PFL hardware bus |
| [#14](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/14) Self-contained ZIP with script, cues and original audio; staged import, manifest SHA-256 and CRC32 | ZIP corruption/roundtrip/interop tests; original three-WAV demonstration; [CI run 224/224 passing](https://github.com/vicentektek/showcompiler-hackathon-2026/actions/runs/40427926064) | Portable data package implemented; manual browser acceptance still pending |
| [#14](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/14) Fix stale pre-audition tests and individual pending-GO STOP cancellation | Tests for asynchronous GO, duplicate activation, STOP ALL and independent pending cues | Race prevention tested with fake Web Audio contexts, not real device latency |

## Current verification

- Working branch: `feat/portable-show-archive-2026-10-27`, stacked after the separate draft PRs through #13. Default `main` is unchanged.
- **224/224 automated tests passed, 0 failures, 0 cancellations**, including ZIP integrity and the local-browser pending-GO cancellation cases: [GitHub Actions run](https://github.com/vicentektek/showcompiler-hackathon-2026/actions/runs/40427926064).
- `npm run check:syntax`, `npm test`, `npm run demo:package`, and independent `unzip -t` completed successfully in that CI run.
- CI publishes a downloadable `showcompiler-full-demo-zip` with three original synthetic WAV files and three explicitly approved MANUAL_MOCK cues. No copyrighted sound was downloaded or uploaded.
- Source code and CI use no external Meta/Baseten token. A previous guarded first-party Meta smoke was recorded in the repository README; **it was not repeated by this work**.
- Native WASAPI/ASIO show-control, Tauri install, multichannel buses, output selection, and audio generation are **not integrated**. Portable ZIP is a data package, not a desktop EXE.

## Pending manual evidence

- Independently review the earlier authorized Meta contract smoke record; no new paid inference was performed during this branch.
- Human review of a rights-clear multilingual corpus, including a 91-line script and negative dialogue-memory fixture.
- Chrome/Edge EN/ES switching, scene coverage progression, review controls, and responsive/accessibility checks.
- Audible local GO/STOP/fade/STOP ALL at a safe level, including network-offline operation.
- Browser acceptance of **complete ZIP import/export**, original WAV decoding, cue GO/STOP/fade, JSON compatibility, audio reassignment and transient analysis isolation.
- Independent code/security/privacy review before any merge.

## Submission truthfulness

- Synthetic expected/predicted suggestions are test fixtures, not Meta output.
- “Prepare AI generation” records intent; it does not synthesize audio or spend generation credits.
- `operatorConfirmed` expresses a UI transition, not authenticated identity.
- Browser playback is real local code but not professional/certified show control.
- Complete show ZIP storage **is implemented and verified automatically**. Native WASAPI/ASIO playback integration, desktop installer, independent output routing and paid audio generation are not implemented.
- Never commit keys, account/billing details, full private scripts, raw provider responses, or unlicensed media.
