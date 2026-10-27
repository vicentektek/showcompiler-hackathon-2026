# RunQ — three-case independent quality review

This feature is based directly on PR #61. It **does not** modify the cue transport, UI, source gold, Meta adapter or Baseten adapter. It is offline by default and has **no network client**; the existing opt-in provider runners remain solely responsible for live requests.

## Exact selected fixtures (existing provisional original gold)

- `hotel-door`: separation of dialogue from sound, forbidden false-positive PLAY cues, explicit VOICE STOP.
- `gala-rundown`: music, voice, ambience, STOPS and LX/video false positives.
- `delta-signal`: continuation of sound, explicit STOP/SILENCE and technical dialogue.

All three are short single-window cases according to current planning. If a fixture changes and requires more than one window, **do not silently raise the request allowance**: inspect the dry run first.

## 0 — Safe Windows worktree

Do not checkout this branch over the user's currently edited repository:

```powershell
cd "C:\Proyectos\Hackaton 2026\showcompiler-hackathon-2026"
git status --short
git fetch origin
git worktree add "..\runq-quality-review-2026-10-28" origin/feat/three-case-quality-review-2026-10-28
cd "..\runq-quality-review-2026-10-28"
git log -1 --oneline
```

This worktree starts detached at the remote branch: run tests there; make no local commit until explicitly creating a tracking branch.

## 1 — Free, repeatable checks (no API calls)

```powershell
npm run qa:codex
npm run qa:three-case:plan
node tools/run-meta-seminar-eval.mjs --case hotel-door --max-requests 1 --output artifacts/three-case-quality/meta-hotel-door
node tools/run-baseten-seminar-eval.mjs --case hotel-door --max-requests 1 --output artifacts/three-case-quality/baseten-hotel-door
```

The last two lines WITHOUT `--live --ack-paid` are dry runs, and write reports to ignored local files. Confirm each planned case has **one** request and is complete; repeat plan for gala-rundown and delta-signal before spending.

## 2 — Live calls: ONLY after explicit operator consent

The developer/agent MUST NOT run these automatically, in tests or in CI. Set the keys **in the same local PowerShell session**, without printing values. `MODEL_API_KEY` and `BASETEN_API_KEY` are read by the Node CLIs only. Prior PowerShell-session variables may be unavailable. Do not share secrets with Codex or in chat.

Six independent commands, one paid request each when the fixture fits one window. Check the provider dashboard after the first pair and before the remaining commands.

```powershell
node tools/run-meta-seminar-eval.mjs --live --ack-paid --case hotel-door --max-requests 1 --budget-usd 0.20 --output artifacts/three-case-quality/meta-hotel-door
node tools/run-baseten-seminar-eval.mjs --live --ack-paid --case hotel-door --max-requests 1 --output artifacts/three-case-quality/baseten-hotel-door

node tools/run-meta-seminar-eval.mjs --live --ack-paid --case gala-rundown --max-requests 1 --budget-usd 0.20 --output artifacts/three-case-quality/meta-gala-rundown
node tools/run-baseten-seminar-eval.mjs --live --ack-paid --case gala-rundown --max-requests 1 --output artifacts/three-case-quality/baseten-gala-rundown

node tools/run-meta-seminar-eval.mjs --live --ack-paid --case delta-signal --max-requests 1 --budget-usd 0.20 --output artifacts/three-case-quality/meta-delta-signal
node tools/run-baseten-seminar-eval.mjs --live --ack-paid --case delta-signal --max-requests 1 --output artifacts/three-case-quality/baseten-delta-signal
```

Each Meta command uses the EXISTING local cumulative budget ledger; `--budget-usd 0.20` is a conservative per-run software ceiling, not a guaranteed provider billing cap. Baseten has a **request-count-only** limiter, no verified monetary limit. If an individual case needs multiple windows, a one-request run will be incomplete and **must not** be compared. Never retry automatically after a failure; a timeout may still consume credits. Monitor provider billing separately.

## 3 — Build comparison and safe evidence, with zero further calls

```powershell
npm run qa:three-case:review
```

The command checks all six local reports and refuses a dry run, missing report, partial case or model mismatch. It writes:

- `artifacts/three-case-quality/review.json`: fixed expected events and provider events (line ID, transport, cue kind, basis), misses, extras, forbidden PLAY, duplicates, existing paired metrics, measured latencies and token totals.
- `artifacts/three-case-quality/review.md`: human-friendly review record.

Both are ignored by Git and contain **no scripts, raw model completions, prompts, keys, private asset data or provider HTTP bodies**. These metadata artifacts can still be sensitive; inspect before sharing and do not upload them publicly.

The automated review is based on EXACT event matching against provisional gold. It can identify likely weaknesses, but cannot judge creative suitability, timing, audio quality, or distinguish all dramaturgically valid alternatives. A theatre technician should annotate disagreements before updating the source gold. Preserve false negatives and hallucinations instead of suppressing them.

## Important interpretation limitations

No live inference was performed in this PR. Offline tests do **not** establish accuracy. A failure to emit valid 16-field structured JSON is an invalid model reply, **not** a true zero-event script. Meta and Baseten may use different sampling or response constraints; report these as comparability limitations.

Do not merge this branch or any dependency PR without reviewing CI and integration conflicts.
