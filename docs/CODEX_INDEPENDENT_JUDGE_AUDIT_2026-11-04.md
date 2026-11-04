# RUNQ — Codex independent jury audit

**Owner-operated, read-only technical audit for the Meta Global AI Developer Hackathon 2026.** This is a prompt, not evidence that an audit has run.

## Paste into Codex

Act as a skeptical independent hackathon judge and release QA engineer reviewing RUNQ. Your job is to REPRODUCE evidence, uncover failures and issue an impartial PASS / FAIL / NOT VERIFIED decision for every requirement.

1. Read `AGENTS.md`, `package.json`, `README.md`, `docs/JUDGE_QUICKSTART_2026-11-03.md`, `docs/JUDGE_EVIDENCE_2026-11-04.md` and `docs/JUDGE_AGENT_QUICKSTART_2026-11-04.md`. Historical AGENTS budget permissions do NOT authorize billable requests for this task.
2. Clone public `main` into a **new temporary folder**. Protect the owner's working copy: no reset, clean, branch switching, local process termination or edits to the original checkout. Record SHA, environment and prerequisites. **Do not edit tracked product code or docs, commit, merge, push or open PRs.**
3. Run `npm install --no-audit --no-fund`, `npm run check:syntax`, `npm test`, `npm run demo:package`, `npm run demo:rehearsal` and verify both generated ZIP archives using a standard ZIP tool. Record every command and exit code. A fresh checkout has no published lockfile; do not substitute `npm ci`.
4. Install the CI-only driver using `npm install --no-save --package-lock=false playwright-core@1.56.1`. With Chrome/Edge installed, run `npm run test:interface`. With actual Google Chrome installed, additionally run `npm run test:last-go` and `npm run test:ai-review`, after inspecting test files for network behavior. These use offline fixtures; they do not measure live model accuracy.
5. Start `npm run dev` on loopback and interact as a first-time judge: load original demo, inspect script L# links, cues, library and audio readiness; navigate Studio, Rehearsal and Direct; exercise NEXT, manual GO, STOP ALL, cue settings and show ZIP export/import. If automated UI or physical audio cannot be inspected, use NOT VERIFIED rather than PASS.
6. Trace Muse Spark in `src/core/metaCueProvider.mjs`, `src/core/theatreCueAnalysis.mjs`, `src/core/performanceKnowledge.mjs`, `src/core/proposals.mjs` and `tools/metaRoutes.mjs`. Verify source-linked cues, human approval, limits and no AI-driven GO. Verify that new Modal WAV generation is disabled by default in `tools/dev-server.mjs`.
7. Verify original contribution log, October 26 initial commit, current public default branch and `main` changes relative to tested application SHA `35d04069`. Review known prior-project provenance limits, external component license attribution and third-party media. If gitleaks is available, only report redacted finding counts and file locations; a shallow clone is NOT a full Git-history scan.
8. Check claims in README and submission copy against actual code and user-visible behavior. Do not claim the original synthetic demo shows a real Muse model result. Distinguish existing, optional, disabled and planned features.
9. Produce private local files `JUDGE_AUDIT_SUMMARY.md`, `JUDGE_TEST_MATRIX.md`, `JUDGE_CLAIM_TRACEABILITY.md`, `JUDGE_PROVENANCE_RIGHTS.md`, and `JUDGE_REPRO_STEPS.md`. Include evidence, SHA, commands, exit codes, critical blockers and a five-minute summary. Preserve failures and unknowns; suggest narrow fixes without implementing them.

**Safety rules:** Never contact paid AI providers, launch live Meta/Modal/Baseten/Fireworks requests, access or print API keys, inspect owner `.env` files, publish reports, or touch existing backups. Ordinary git/npm package downloads are allowed. Only local-loopback app testing is permitted. Do not invent an authenticated submission receipt or certification of physical sound equipment. Do not ask the owner to repeat known project details; proceed through all safe offline checks.

Execute the audit in the available local environment. If blocked by missing tools, browser, network or credentials, mark affected checks NOT VERIFIED, continue with the rest, and report the blocker precisely.

## Notes for independent judges

For a shorter, entirely optional evaluation prompt and basic commands, use the [agent-assisted quickstart](JUDGE_AGENT_QUICKSTART_2026-11-04.md). Judges can also follow [the manual quickstart](JUDGE_QUICKSTART_2026-11-03.md) without AI assistance. A passing agent audit does not replace independent permission checks for third-party media, physical audio validation or the owner's submission receipt.
