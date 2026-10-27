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

## Stage-document agent benchmark (12 original scripts)

For stage-document or agent-analysis tasks, FIRST consult `docs/CODEX_STAGE_SCENARIO_AGENT_PLAN.md` and `fixtures/qa/scripts/README.md`, then run `npm run qa:scripts` (or full `npm run qa:codex`). The stage-script report distinguishes real deterministic independent-review coverage from a synthetic gold-to-schema replay. **Do not interpret either as measured Muse Spark accuracy.** The scenario with 12 commands deliberately exceeds the current schema capacity (8 proposals per request). No automatic paid requests, audio GO, source mutation, disclosure of private scripts, or main merges. Work on one reproducible defect per PR and validate against negative cases.
