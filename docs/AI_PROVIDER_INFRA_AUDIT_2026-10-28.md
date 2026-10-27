# RunQ AI provider and evaluation infrastructure audit

Date: 28 October 2026. Scope: offline engineering only; no provider inference, deployment or transport changes.

## Repository and branch inventory

The initial checkout was `feat/meta-muse-reliable-cues` at `1846462` and contained the untracked path `yntax`; it was left untouched. `main` was at `e4ee27a`, two commits behind `origin/main`. Existing worktrees were preserved.

Remote pull refs observed with `git ls-remote`:

- PR #5 head `e4f6c6d`: production Baseten Muse Spark Open fallback.
- PR #43 head `f6a254a`: Meta seminar laboratory.
- PR #59 head `a10c283`: Baseten seminar benchmark and paired comparison.
- 43 open merge refs were advertised by the remote. GitHub CLI was unavailable and the connected search returned no metadata, so titles/states beyond the verified refs were not invented.

Ancestry checks established that PR #59 descends from both `feat/runq-systematic-eval-optimizer-2026-10-27` and PR #5. It also contains, by content, the independent scoring and semantic-alternative regressions developed separately on `feat/runq-eval-metrics-2026-10-27`. Therefore `a10c283` is the most advanced compatible evaluation base. V3/editor/audio-runtime branches were deliberately excluded because they are unrelated to provider evaluation and may change live transport.

Safe integration branch and worktree:

- Branch: `feat/ai-provider-eval-infra-2026-10-28`
- Base: `origin/feat/baseten-seminar-benchmark-2026-10-28` (`a10c283`)
- Worktree: `C:\Proyectos\Hackaton 2026\runq-ai-provider-infra-2026-10-28`

## Baseline observed before implementation

- `npm run check:syntax`: pass.
- `npm test`: 349 passed, 0 failed/skipped/cancelled.
- `npm run qa:codex`: pass; illustrative exact P/R/F1 62.5% / 71.4% / 66.7%.
- `npm run qa:seminar`: pass; 9 scripts, 13 windows, 49 annotated events.
- `npm run qa:systematic`: dry run; 0 requests, 1.7892 USD conservative planned reserve.

`MODEL_API_KEY` and `BASETEN_API_KEY` were absent. Modal CLI 1.6.3 was authenticated to profile `audiomaclet`; no app, GPU or inference was started.

## Consolidated provider boundary

Meta remains first-party with strict JSON Schema. Baseten remains an independent adapter using exactly `meta-models/muse-spark-open-1026`, plain JSON text and strict local validation. Neither adapter silently falls back to the other.

`.env.example` now documents only server-side variable names. Default evaluation scripts are offline:

- `npm run qa:meta:plan`
- `npm run qa:baseten:plan`
- `npm run qa:systematic`
- `npm run qa:compare-providers` (reads existing reports only)

Live commands remain separate and require explicit paid acknowledgement. No live command is invoked by tests, CI, startup or `qa:codex`.

## Evaluation changes

- Preserved exact tuple scoring plus localization, transport, sound class and EXPLICIT/SUGGESTED dimensions.
- Preserved the nine fixtures and original gold; semantic alternatives remain separate and human-reviewed.
- Added aggregated sanitized latency, prompt, completion, reasoning and cached-token measurements.
- Added typed timeout/transport failures with one attempt and no response bodies.
- Paired Meta/Baseten comparison now emits JSON and Markdown, and uses only the intersection of complete cases for both quality and telemetry.
- Baseten cost remains `null`: no unverified price is invented. Meta's token-based value remains an estimate, distinct from provider billing.
- Local Baseten and paired reports are ignored by Git.

## Remaining limitations and gates

- No live Meta or Baseten request was run; account credits, quotas and real output quality remain unverified in this branch.
- No Baseten price or actual billed cost was available. Billing dashboards remain authoritative.
- Gold annotations remain provisional; exact scores are regression metrics, not professional certification.
- No real browser/speaker acceptance was performed.
- Modal model cold-start, VRAM use, generation quality, WAV normalization and actual cost require a separately authorized pilot.
- No commit, push, draft PR or merge is performed by this audit without a final reviewed diff.

## Final offline validation

- `npm run qa:codex`: pass; syntax pass and 356/356 tests passed with 0 failures, skips or cancellations.
- `npm run qa:seminar`: pass; 9 scripts, 13 windows and 49 annotated events.
- `npm run qa:systematic`: pass in `OFFLINE_EXPERIMENT_PLAN`; 0 real requests and 1.7892 USD conservative planned reserve.
- `npm run qa:baseten:plan`: pass; 0 real requests, 2 planned requests, 0 scored cases and a safe stop at `MAX_REQUESTS`.
- `npm run qa:compare-providers`: safely unavailable with exit 1 because both real complete-case reports do not exist. A regression now prevents offline plans from masquerading as F1=0 model results; the command made no network call and did not fabricate a comparison.
- `git diff --check`: pass.

The illustrative cue fixture remains at exact precision 62.5%, recall 71.4% and F1 66.7%; this is deliberately not represented as Meta or Baseten quality.
