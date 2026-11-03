# Codex assignment 01 — Integrate the existing safe demo (NO new features)

TASK TYPE: implementation / integration / offline regression verification.
The goal is to spend credits on integration mechanics, NOT on discovery or another plan.

## Inputs and prepared evidence

Start from branch `docs/codex-qa-playbook-2026-10-27`. Read `AGENTS.md` and THIS task brief first. It is self-contained. Do not read the long plan, QA matrix, product UX documents, or second-pass audit unless a specific merge conflict/failed test requires a targeted section; use `docs/DECISION_INDEX_2026-10-27.md` to locate it.

Previously confirmed branch map:
- This branch includes the PR 20 automation persistence/editor-model stack; current app UI is still manual.
- PR 14 `feat/portable-show-archive-2026-10-27`: offline complete show ZIP, original synthesized WAV demo, and **pending per-cue GO cancellation**.
- PR 18 `feat/audio-natural-end-events-2026-10-27`: **onCueNaturalEnd** guarded against STOP/fade/STOP ALL.
- The two branches change the same file, `src/core/browserAudio.mjs`; a naive merge may silently discard either safety feature.
- PR 20 and PR 14 are divergent; isolated test success (223 vs 225) does not prove integration.
- No reliable browser E2E/speaker acceptance has been completed. No live provider testing is required.

## Execute

1. Check `git status --short`, current branch and HEAD, fetch only the necessary refs, and create `feat/integrated-safe-browser-demo-2026-10-27` based on the documentation branch. If user work is uncommitted or branch heads unexpectedly changed, stop and describe the blocker, never discard changes.
2. Bring the PR 14 features over while retaining PR 20's data-model validation, then incorporate PR 18's natural-end behavior. Use a small reviewable merge or cherry-pick strategy; do not independently reimplement working ZIP or duplicate entire branch history.
3. Reconcile `browserAudio.mjs` carefully: keep `cancelledPending` checks in GO/stopCue/finally, keep natural-end callback emitted exactly once after all voices end, suppress callback for interrupted/stopping playback, keep STOP ALL transportEpoch fencing.
4. Preserve the complete ZIP generator/manifest, original WAV files, transactional import before project replacement, and browser UI buttons. Keep legacy schema-v1 documents valid. Do not overwrite `src/core/projectPersistence.mjs` with a pre-automation version.
5. Preserve the existing manual GO/STOP/FADE flow. DO NOT connect new AUTO_FOLLOW/AUTO_CONTINUE runtime to the UI, enable loops/fades that engine ignores, or claim instance-targeted STOP. Those are another gated task.
6. Add the MINIMUM focused regression tests: (a) stopCue while context.resume is pending prevents source.start, (b) no natural end after STOP or fade, (c) exactly one natural-end callback after a multivoice cue, (d) full ZIP reopen preserves original WAV and current show on invalid ZIP.
7. Run `npm run check:syntax` and `npm test` once after integration is coherent. If present, run `npm run demo:package`, verify with `unzip -t` or equivalent, and inspect the produced archive structure. Run relevant CI.
8. Open ONE draft PR targeting `docs/codex-qa-playbook-2026-10-27`. No auto-merge, no change to main or visibility, no unrelated refactor, no paid model request, no new framework.

## Hard stop conditions

If a conflict requires rewriting the project schema or replacing the audio engine, STOP. Return the specific conflict and a two-option recommendation. Do not increase scope silently.

If tests fail, make one focused diagnosis/fix with targeted rerun. If more architectural uncertainty remains, return evidence, not repeated open-ended attempts.

## Delivery report: maximum 300 words

- New branch, HEAD, draft PR URL.
- Exactly which PR 14/18 features were retained; important conflict resolutions.
- Changed files and commands with pass/fail/skip counts.
- Status of pending GO cancel, natural end, ZIP integrity, offline operation.
- What remains untested (real browser/audio, actual AUTO runtime, native Windows).
- The next ONE proposed bounded action.

Success means one functioning testable base, NOT completion of the full product.
