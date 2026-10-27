# Codex execution plan — high-value engineering only
Updated 2026-10-27. Audience: engineering agents. This is an execution contract, not proof that the tasks below are complete.

## Goal and prioritization

Ship one reliable, demonstrable path before the submission deadline:
original script -> bounded optional Meta analysis -> locally validated source-linked suggestions -> explicit approval -> attach real/synthetic audio -> prepare -> manual GO -> STOP/FADE/STOP ALL -> complete package -> reopen offline.

A useful demo is more valuable than many unmerged features. Do not begin a major UI redesign or desktop port while this path is not tested end-to-end.

## Verified repository orientation at drafting time

- Default main has planning documents, not the running prototype.
- PR 1 begins the browser core; PR 3 adds the optional Meta proxy; PR 4 the EN/ES UI; PRs 5–13 form a stacked chain through manual operator queue and same-output audition.
- PR 14 (feat/portable-show-archive-2026-10-27) branches after PR 13, adds original synthesized WAV demo, complete ZIP import/export and related tests.
- PR 15 repairs an audition test expectation; PR 16 adds pure cue automation planning; PR 17 adds an injectable cancellable automation runtime.
- PR 18 (feat/audio-natural-end-events-2026-10-27) adds the audio completion callback separately.
- PR 19 persists optional automation settings; PR 20 adds the editor-facing automation update model. PR 19/20 are not UI/transport integration.
- The head of PR 20 and the head of PR 14 are divergent. PR 18 also diverges from the PR 20 line. Their green CI results are isolated and do NOT prove that ZIP + AUTO_FOLLOW + editor work together.
- Current PR 20 package.json uses Node >=20 and npm scripts test, check:syntax, dev, demo:core and smoke:meta. Do not substitute commands from a different framework.
- The first-party Meta adapter has one previously recorded successful, operator-authorized bounded live smoke. Avoid repeating it merely to establish connectivity.
- No complete native desktop installer, independent audio preview output, reliable real-time speech following or real hardware routing is proven in this branch.

Re-check HEAD and PR status at start; these facts are snapshots, not permanent assumptions.

## Execution sequence: only one stage per Codex task

### C0 — Minimal local preflight (already researched; DO NOT redo discovery)

This branch graph and CI evidence have already been checked directly in GitHub. Codex should NOT spend a new task researching old branches or rerunning whole isolated suites merely to recite results:
- PR 20 Node test job: 223 passed, 0 failed/skipped (2026-10-27 12:43 UTC), plus syntax check passed.
- PR 18 Node test job: 221 passed, 0 failed/skipped (2026-10-27 12:37 UTC).
- PR 14 Node test job: 225 passed, 0 failed/skipped (2026-10-27 00:48 UTC), generated original WAV demo package and validated its ZIP structure.
- None of those green runs proves the three branches integrated in one runtime or audible physical output.

Before C1 coding, perform ONLY git status --short, git branch --show-current, git rev-parse HEAD and git merge-base for the relevant branch heads. Verify no uncommitted user work. If HEAD/ref differs from this snapshot, report the minimal discrepancy; do not restart broad research. Commit to one narrow, integration-ready feature branch and run the full suite once AFTER actual integration work.

### C1 — Converge branches in ONE integration branch (after review of C0)

Objective: have one runnable checkout containing ZIP/demo, audio end semantics and operator automation data without losing any behavior.

- Work on a new isolated feature branch based on the reviewed code head. Do not overwrite or delete old branches; never force-push or merge main.
- Bring over PR 14 portable ZIP/demo, PR 18 natural-end callback, and PR 19/20 automation persistence/editor model, accounting for their shared ancestor and PR 15–17 chain. Prefer smallest reviewable diffs; do not import whole historical histories or duplicate code.
- Preserve original audio bytes and transactional ZIP import. Preserve old valid JSON and reject malformed package input without erasing the current show. Maintain exact source IDs and approvals.
- If automation hooks are not wired to real GO/STOP yet, leave them disabled and explicitly indicate this. Never make default transport automatically run the next cue.
- Update CI to test the complete integration branch; avoid repeated workflow runs from trivial intermediate pushes. Use workflow concurrency cancellation where appropriate, while still retaining final evidence. Keep existing offline suites.
- Tests: npm run check:syntax, npm test and demo:package if that script is actually present. Inspect the produced ZIP with a system unzip or independent archive parser where available.
Acceptance: a single reproducible checkout and PR with a passed full offline suite, portable show roundtrip, no automatic GO after STOP ALL, documented unverified browser/audio behavior. No auto merge.

### C2 — Automations and transport: hostile deterministic regression suite

Objective: exercise real scheduler and cue state edges, not merely pure DTO constructors.

- Review createCueAutomationRuntime, normalizeCueAutomation, BrowserAudioEngine, operator queue, UI event wiring, cancellation and project teardown.
- Add injectable fake clock/timers and fake audio/transport; forbid real delays, sleep loops, network and actual speakers in automated unit tests.
- Cover MANUAL, AUTO_CONTINUE from successful GO, AUTO_FOLLOW from actual natural completion; delay = 0 and >0; loop refusing natural-follow; stopped/failed GO; duplicate GO; repeated onended; short/long fade; cancellation during pending asynchronous GO; STOP other source; STOP ALL; dispose; project switch; stale callbacks from old show; return from queued microtask and timer races.
- Use ownership/identity of running cue instances. Different cues playing the same asset must not both stop accidentally; selection and script navigation cannot alter prepared GO.
- Build deterministic property/metamorphic tests with fixed seeds if useful, but report actual invariants rather than running random tests forever.
Acceptance: every listed destructive/cancel case has an automated assertion. In particular, NO audio restart after STOP ALL, NO double GO, NO stale execution after replacing project, NO model request along transport paths.

### C3 — Provider and theatre-analysis evaluation, OFFLINE by default

Objective: prove contract and performance without spending inference credits.

- Reuse src/core/cueEvaluation.mjs and test/theatreCueAnalysis.test.mjs; extend, do not replace existing tests.
- Add rights-clear fixture manifests with original source lines, positive/forbidden line IDs, expected intent (PLAY/CONTINUE/STOP/SILENCE), explicit vs suggested status, repeats, evidence substring, expected unbound-asset prompt, language and reviewer note. Keep fixtures authored for this project only.
- Include Spanish, English, French, Portuguese and German, diacritics, long scenes (>120 lines), cross-window context, dialogue mentions of sounds not happening, repeated ambience, sound cues in directions, silence and no-cue scripts.
- Test Meta and fallback providers with HTTP mock responses (success, non-JSON, truncation, HTTP 401/429/500, timeout, invalid refs, unknown asset, model refusal, prompt-injection text in script, malicious HTML text, duplicate cues, quota exhaustion). Assert one request max, no retry, sanitized failures, strict local validation, no raw payload/keys in logs and no cost-incurring test.
- Freeze a labelled offline gold set. Report exact-line TP/FP/FN, precision, recall, F1, duplicate rate, forbidden triggers, hallucinated line refs, cue-kind/intent confusion and invalid-output count. Do not claim these scores represent quality of a real model when the provider is mocked.
- Produce an optional operator-only live quality protocol, limited and cost-capped, requiring a distinct explicit authorization before any actual provider call. An already successful smoke does not need repeating. Never put secrets in fixtures or CI.
Acceptance: tests execute with network disabled and without MODEL_API_KEY, live checks are excluded by default, evaluation reports can be regenerated from local fixtures and contain no fabricated model quality claims.

### C4 — Browser journey smoke and visual/keyboard acceptance

Objective: prove the real user journey with browser automation in an isolated profile.

- Inspect existing UI test helpers first. Add minimal browser E2E tooling ONLY if needed; explain dependency cost and do not break zero-runtime-dependency design.
- Test: no show -> create/import -> script L# references -> optional mocked AI -> pending review -> approve -> unresolved GO blocked -> attach WAV -> Prepare -> GO once -> STOP/FADE/STOP ALL -> ZIP save -> close/reopen -> correct IDs and audio bytes -> offline GO/STOP.
- Verify selected vs prepared cue, operation pending/loading, keyboard activation while typing, irreversible actions confirmed, error banner accessible, fake speakers clearly disclosed during audition.
- Use fixtures, injected Web Audio mocks or browser-supported synthetic WAV. Record that browser automation cannot establish audible speaker output, hardware latency or deterministic OS routing.
- Capture only rights-clear synthetic test screen and output. Avoid leaks of credentials/provider responses.
Acceptance: green CI with screenshots/traces on failure and a short manual acceptance checklist for physical sound.

### C5 — Release gate and three-minute demo evidence

Objective: one reproducible jury-facing demo; no unverified marketing claims.

- Choose only completed features. Build a deterministic demo show with original 10–20 lines and three audible synthetic cues. Record source IDs and approval status. Distinguish manual sample from live Meta outputs.
- Ensure fresh clone -> documented start command -> no required secret to run local mock/demo. Include a deliberate optional real Meta step if operator decides it is worthwhile.
- Produce a compact evidence manifest: commit, PR, UTC date, commands, number of tests, artifact checksums, provider/live-manual status, and known limits.
- Prepare a 3-minute run-of-show: 0:00 problem/scene; 0:20 script import; 0:40 validated AI suggestion (or clearly labelled recorded output); 1:20 approval/attach; 1:50 GO/fade/stop; 2:20 ZIP/reopen offline; 2:45 safety/summary.
- Review public files for private research, proprietary names, inherited pre-event code, secrets and copyrighted assets. Do not change repository visibility until separately approved.
Acceptance: live-feasible sequence from one tested commit, source and audio provenance, honest demonstration notes. Do not treat CI as a substitute for human listening.

## Deferred beyond core demo

- Full desktop repackaging or native WASAPI/ASIO production engine; no unsupported Windows portability claims.
- Fully redesigned workspaces/themes, multi-device patch, native show control, visual design systems: keep as UX backlog with testable acceptance only.
- Streaming microphone ASR, script following, automatic rehearsal GO: begin only with text-event replay in a separate isolated spike, never from generative AI directly to audio GO. Include false positive, ambiguity and re-take controls before considering physical audio.
- Hardware lighting and timecode integration: mock first and test on physical rigs only in a later gated phase.

## Reusable engineering response contract

Every task returns: (1) branch + HEAD; (2) limited scope and files changed; (3) exact commands and tests pass/fail/skip; (4) source of evidence; (5) newly uncovered risks; (6) next SINGLE recommended task; (7) explicit list of things not tested. Do not spend budget on rewriting product requirements, market research, screenshots with no tested flows, or speculative rewrites.
