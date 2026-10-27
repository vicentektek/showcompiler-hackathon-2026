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

### C1 — Integrate existing branches, preserve pending-GO cancellation (first coding task)

Objective: a SINGLE executable checkout preserving the PR 20 base, PR 14 portable archive/demo and PR 18 natural-end event; do not turn on new AUTO playback.

Base this task on docs/codex-qa-playbook-2026-10-27 (which contains PR 20's data-model stack). Branch off safely, confirm tree is clean, and inspect branch heads/diffs briefly. The full findings are already recorded in docs/SECOND_PASS_TECHNICAL_AUDIT_2026-10-27.md. Do NOT redo a repo-wide audit.

CRITICAL MERGE TRAP:
- PR 14 src/core/browserAudio.mjs provides cancelledPending, stopCue on pending AudioContext.resume, originalAudioFiles, complete ZIP and transactional stage import.
- PR 18 src/core/browserAudio.mjs provides onCueNaturalEnd, suppression after STOP/fade and after all voices stop.
- PR 19/20 provide validated optional automation in the existing schema and updateCueAutomation model; their UI/engine are still not wired to those optional settings.
- Keep all three behaviors while reconciling the SAME browserAudio.mjs file. Do not overwrite PR 20's schema with older PR 14 persistence. The audioBackend facade may need to pass event callbacks later; no claims until wired.
- Existing src/ui/app.mjs has independent manual player.go/stopAll flows. Never attach the new scheduler in C1; it must remain disabled until a single arbitration gate is added in C2.

Preserve original ZIP/CRC/SHA behavior, per-cue pending GO cancellation, no onended callback after stop, project-swap immutability and legacy JSON compatibility. No new dependency or framework migration.

Commands and evidence: run npm run check:syntax and npm test AFTER integration; if npm run demo:package is present, generate the ZIP, run unzip -t or equivalent independent validation, and verify contents. On CI check an integrated branch run, not isolated PR checks. Add narrow regression tests for any exposed conflict. Do not merge to main, change repository visibility or run paid APIs.

STOP condition: an unresolved schema conflict or unsafe concurrency issue requiring broad redesign. Report exact lines, minimal proof and recommended bounded next task; do not improvise a rewrite.

Acceptance: one draft integration PR with complete original demo ZIP + original audio, automation data model, correct natural-end reporting and pending GO stop safety, full offline suite green. Automatic follow and advanced fades/loops are explicitly NOT active yet.

### C1-M — Manual validation, zero Codex cost (after C1)

Operator on a Windows PC: start the development server with npm run dev; open the local browser and select Try with real sounds; confirm sample script + three original WAVs, prepare + manual GO, check audible output at low gain, STOP/FADE/STOP ALL, then save complete ZIP, reopen and manually GO offline. Record browser version, speaker route and any failed step. This is NOT evidence of native audio or isolated audition routing. If it fails, give Codex ONLY the failing reproduction steps.

### C2 — Optional automation transport integration ONLY after C1-M passes

Objective: one arbitration owner for cue execution and cancellation, not two independent GO paths. Before writing features, inspect createCueAutomationRuntime, BrowserAudioEngine, src/core/audioBackend.mjs, operatorQueue and real UI event handlers.

Must create a single cancelAll / stopAll authority that synchronously invalidates timers/epochs and silences the backend. Pass onCueNaturalEnd from engine through facade to coordinator, with generation-based protection. Manual GO, optional automation and STOP must share an idempotent dispatch API. Project replacement disposes old coordinator before activating new show. No trigger from AI output. Defaults remain MANUAL; AUTO is explicitly opt-in.

Do NOT advertise configurable fades/loop/stop-other parameters unless the audio engine genuinely applies them; data-model support is not transport support. For each capability choose: implement with deterministic tests, or disable with truthful UI messaging. Any unsupported automation remains disabled rather than silently ignored.

Minimum deterministic tests use controlled AudioContext.resume promise, synthetic onended events, fake clock, multiple voices and zero network. Assert no audio on STOP during pending resume; no event on intentional stop; one event on true natural end; no restart after STOP ALL, project switch/dispose or UI selection; no double GO from automatic and manual collisions. Include test for loop not ending and maximum automatic chain behavior.

Acceptance: C1 tests remain green and specific runtime/DOM unit or browser tests prove the coordinator path. STOP ALL is effective even with queued asynchronous work. If safe integration needs a larger redesign, stop with evidence and defer AUTO instead of risking the MVP.

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
