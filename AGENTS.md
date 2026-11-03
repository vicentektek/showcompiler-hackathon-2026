# CURRENT OWNER OVERRIDE - Meta and Modal without local budget caps (2026-11-02)

The owner explicitly requested removal of ALL local Meta/Modal budget limits for manual testing, the demo, and CLI evaluation batteries. This supersedes the monetary and cumulative request ceilings below for these two providers. Production defaults disable campaign, per-run, per-request and daily spending gates, and cumulative/daily request quotas. Historical cap metadata and reservations remain intact. Legacy enforcement options exist only for historical regression checks; do not enable them in production or restore caps without a new owner request. CLI live flags, finite selected batches, duplicate protection, uncertain-submission handling, offline CI, credential privacy, human cue approval and deterministic GO/STOP remain required. Baseten/Fireworks remain prohibited. This change does not authorize an agent to launch a paid run for validation. See [implementation and verification](docs/META_MODAL_UNLIMITED_2026-11-02.md).

# HISTORICAL SCOPED EXCEPTION - paid autonomous RUNQ QA (2026-10-31)

**The user has explicitly authorized paid Copilot/Codex QA within the 100 USD campaign** (Meta 65 USD, Modal 35 USD, Baseten 0, Fireworks 0; Meta <=400 requests, Modal <=100). Full policy: [PAID_AUTONOMOUS_QA_POLICY.md](https://github.com/vicentektek/showcompiler-hackathon-2026/blob/d1f589bddb636e6729dc2851cfa4a4914d88ac80/docs/qa-evals-2026-10-31/PAID_AUTONOMOUS_QA_POLICY.md) and its [JSON manifest](https://github.com/vicentektek/showcompiler-hackathon-2026/blob/d1f589bddb636e6729dc2851cfa4a4914d88ac80/docs/qa-evals-2026-10-31/paid-campaign-policy.json). This **supersedes the historic blanket prohibition on coding agents launching paid evaluations, solely for this campaign and solely after shared, fail-closed, pre-request budget enforcement and tests are implemented**. Copilot need not request operator consent for each request inside this already-authorized campaign, and must still use explicit live flags. Until the gateway works and verifies previous reservations, all paid calls remain BLOCKED. Prior per-call and daily Modal limits remain effective; never silently raise them. CI and routine tests remain offline. All other restrictions below remain binding. Do not reset ledgers, expose keys or auto-merge. Documentation authorization alone is NOT an executable billing guard.

# Repository execution guidance (27 October 2026)

This is a hackathon-specific, dependency-light browser prototype for script-linked, human-reviewed sound cues. Its CURRENT runtime is Node >=20, browser ES modules, local HTTP tooling and Web Audio, not a React/TypeScript/Vite or native desktop application. Read package.json and the current checkout before assuming commands or architecture.

## Product and safety invariants

- Import and preserve original script text and stable L# references. Never fabricate source references or overwrite the source with a translation.
- Generative models propose ideas in design/review only. A person approves proposals before they become DRAFT cues. Neither model output nor page navigation can execute a cue.
- The operator-selected item, prepared cue, running sound instances, audition state and pending automatic advances are different states. Reading/editing/searching never advances prepared GO.
- GO, STOP, FADE and STOP ALL are deterministic local transport operations. No network or AI calls may be added to GO or STOP paths.
- STOP ALL, project replacement, dispose, cue interruption and explicit cancel must invalidate pending delayed GO callbacks and late asynchronous results. Never restart automatically after an error.
- Missing, undecoded or unresolved audio cannot play. Audition uses the same output as GO; do not describe it as isolated PFL.
- No claim of professional live-show certification, reliable multichannel routing, native installer, real ASIO, real voice-following or hardware integration without separate objective validation.

## Cost, security and provenance

- Current owner-authorized campaign ceilings (31 October 2026): global USD 100, Meta USD 65, Modal USD 35, Baseten USD 0, Fireworks USD 0. Baseten and Fireworks must receive no paid requests in this campaign. These are ceilings, not verified credit or mandatory spending.
- Preserve all historical reservations, including forbidden-provider history and unreconciled local ledgers. Production design requests and evaluation runners enforce the shared per-user ledger; never reset it or create a new checkout to evade accounting. See [campaign policy and exact operator gates](docs/RUNQ_AI_CAMPAIGN_100_2026-10-31.md).
- npm test, syntax checks and CI are OFFLINE. No provider calls, automatic retries, external billing or new secrets in tests.
- A live Meta request requires explicit authorization by the operator, one bounded request, no retries, sanitized diagnostics and confirmed spend policy. Never launch a billable smoke test opportunistically.
- No credential, model raw response, private theatre script, copyrighted media, personal information or proprietary external research in source, tests, logs, CI artifacts, pull requests or docs.
- Preserve dates and contribution evidence. Do not represent earlier research or pre-event implementations as new contest work.
- Do not modify or merge main automatically. No unrequested release or public status change.
- No new dependencies or architecture rewrite unless there is a demonstrable test or delivery need and it is explained in the PR.

## Working contract for coding agents

1. First read the ONE bounded assignment for the current task, plus this file; for the immediate integration use docs/CODEX_TASK_01_SAFE_INTEGRATION.md. Consult docs/DECISION_INDEX_2026-10-27.md to find optional design evidence. Do NOT bulk-read all product or QA dossiers unless the current task needs them; this wastes context and conflicts with one-task scope.
2. Record current branch, HEAD, PR base, relevant related feature branches, and existing test commands. An open PR or passing isolated CI does not establish integration.
3. Make one bounded change at a time; preserve backward-compatible project JSON and source provenance. Avoid unrelated refactors.
4. First reproduce with a minimal deterministic test; implement the smallest fix; run focused tests, then npm run check:syntax and npm test.
5. Report exact commands, observed results, changed files, meaningful gaps, CI URL, and what still requires browser/hardware/manual approval.
6. Stop at the task acceptance criteria. Do not cascade into the next phase, merge, run paid models, or assume passing tests means real audio was heard.

## Current technical orientation

- Tests: test/*.test.mjs through node --test; CI: .github/workflows/core-tests.yml.
- Core: src/core/workspace.mjs, projectPersistence.mjs, browserAudio.mjs, cueAutomation.mjs, cueAutomationRuntime.mjs, operatorQueue.mjs.
- Meta: src/core/metaCueProvider.mjs, theatreCueAnalysis.mjs, sceneAnalysis.mjs; tools/metaRoutes.mjs and tools/meta-smoke.mjs.
- Browser: src/ui/app.mjs; i18n: src/ui/i18n.mjs and locales.
- The complete-show ZIP and original synthesized-audio demo live on a SEPARATE feature branch from the cue-automation editor. Inspect the branch graph before trying to use or modify these features together.

## Offline theatre cue QA (opt-in coding workflow)

For tasks about cue precision, consult `docs/CODEX_CUE_QA_LOOP.md`, run `npm run qa:cues`, and inspect `artifacts/cue-qa/report.md`. Default fixtures and predictions are illustrative and **do not measure the Meta model**. Treat `artifacts/cue-qa/` as private/local output: never commit it. A successful CI report verifies the evaluator pipeline only. Change one variable per iteration, require a regression test, review all cue behavior with a human, never run billable model calls or merge unrequested work.


## Automated Codex regression gate (Meta-inspired independent review)

For coding/QA tasks on cue interpretation, read `docs/CODEX_AUTOMATED_TEST_PLAN_2026-10-27.md`, and run `npm run qa:codex` before reporting completion. The command performs only offline syntax, unit/integration regression tests and synthetic cue-event QA; it writes `artifacts/codex-qa/summary.md` and `artifacts/cue-qa/report.md` for local review. These reports explicitly DO NOT measure Muse accuracy. The independent audio review is heuristic; showing a source-line warning must never auto-create, approve or trigger playback. GitHub CI runs the same gate for PRs. No secret access, billable requests, automatic main merges or claims of professional live certification.


## Original seminar corpus + opt-in paid Meta laboratory

For theatre/Muse interpretation work read \`docs/CODEX_META_SEMINAR_EVAL_LAB.md\`. The nine original scripts and *provisional* gold annotations live under \`fixtures/qa/seminar/\`. \`npm run qa:codex\` includes the free contract QA. \`npm run qa:meta:plan\` previews bounded Muse request counts without calling the provider.

The owner has authorized the campaign budget above; do not request that general authorization again. An operator still executes a bounded live batch using \`npm run qa:meta:live\`, and **coding agents and CI must NEVER run that command by themselves or read MODEL_API_KEY**. The persistent local Meta history has a USD 65 cumulative ceiling in addition to the shared USD 100 ledger; the seminar/systematic command ceiling remains USD 2. Neither ledger may be committed, reset or bypassed. Local reservation estimates are not Meta billing enforcement. Never interpret synthetic tests or unreviewed gold as measured Muse quality. Do not modify live GO/STOP from an AI suggestion.

## Systematic Muse evaluation lab

For repeated experiments read docs/RUNQ_SYSTEMATIC_EVAL_PROTOCOL.md and run npm run qa:systematic (dry-run, no API). The lab outputs per-case typed event evidence and matching A/B scores only on completed cases. Never invoke a paid --live run from Codex or CI, and do not copy model keys, raw responses or local reports into public Git. Fix one issue with a test before changing prompts, and do not alter source gold to inflate results without operator signoff. Local histories are preserved, while the shared per-user ledger additionally enforces cross-checkout campaign ceilings. No auto-GO or auto-merge.
