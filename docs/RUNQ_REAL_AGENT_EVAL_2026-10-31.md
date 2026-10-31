# RUNQ — Real agent evaluation (Meta vs Baseten), 2026-10-31

Branch `qa/real-agent-eval-2026-10-31` (from `feature/voice-cue-editing`). No commit, push or merge was made. Raw evidence is local and git-ignored: `artifacts/theatre50-real-eval/raw-*.jsonl` (full request, response, context, operations, timings, usage). Do not publish it.

## What was and was not measured

- **Real**: every number below comes from live calls through the real route `POST /api/agent/interpret` (and `/api/voice/transcribe`). Nothing simulated feeds any accuracy figure. Offline unit tests with oracle responses only validate the judge.
- **Corpus**: 24 **original** scenes (12 ES, 12 EN; 16 dev, 8 holdout) in `fixtures/qa/theatre-real/scenes.mjs`, 386 cases (17 functions). The 50-works catalogue (`fixtures/qa/theatre-50`) holds metadata only (no text, no gold). Third-party plays were **not** used or sent to any provider, because their edition/usage rights were not verified.
- **Gold is author-preregistered, NOT human validated.** Criteria (cases, judge, scenes) were frozen by sha256 in `fixtures/qa/theatre-real/cases.lock.json` before any paid call; the harness refuses to run if they change. Criteria were never changed after seeing answers. Holdout was run once, after the last code change.
- Plans are applied to **copies** of the project; the judge compares the resulting project.
- Separate metrics: interpretation (status + operation kinds), cue selection, exact project modification, unauthorized operations, art quality (`PENDING_HUMAN_REVIEW`, not scored), voice WER.

## Budget

Per-provider durable ledgers with duplicate-key protection and automatic stop (Meta 13, Baseten 13, ASR 4 USD; sum 30). Sequential, no retries, a provider is halted after 3 consecutive non-timeout failures (this fired for Baseten in dev1 and saved spend).

| Ledger (conservative reservation, not billing) | Calls | Reserved |
|---|---|---|
| Meta | 428 | 9.01 USD |
| Baseten | 448 | 9.41 USD |
| ASR | 28 | 0.56 USD |

Measured tokens: Baseten ≈ 658k prompt / 486k completion ⇒ ≈ 2.9 USD at its listed price (1.25/4.25 USD per M tokens). Meta ≈ 590k prompt / 226k completion; **its price was not verified**, so no real cost is claimed (proxy at Baseten price ≈ 1.7 USD). Account billing was not checked; real spend is expected to be far below the 30 USD cap.

## Results (interpretation / selection / modification / unauthorized ops)

| Run | Provider | Requests | Interpretation | Notes |
|---|---|---|---|---|
| Pilot (15 dev) | Meta | 15 | 15/15 | sel 13/13, mod 15/15 |
| Pilot (15 dev) | Baseten | 15 | 0/15 | HTTP 404: model id `meta-models/muse-spark-open-1026` no longer exists |
| Pilot rerun | Baseten | 15 | 10/15 | 4× empty reply (reasoning ate 2600 tokens), 1× REORDER shape |
| Dev (258) | Meta | 258 | 256/258 | 1 timeout 25 s, 1 `BAD_EDITS` (label at op level) |
| Dev (258) | Baseten, after id/prompt fixes | 258 | 247/258 | all 11 failures = reasoning exhausted 7000 tokens |
| Dev rerun of those 11 | Baseten, `reasoning_effort:low` | 11 | 11/11 | median 1.3 s |
| **Holdout (128, once, final code)** | **Meta** | 128 | **128/128** | sel 104/104, mod 120/120, 0 unauthorized |
| **Holdout (128, once, final code)** | **Baseten** | 128 | **128/128** | sel 104/104, mod 120/120, 0 unauthorized |

Unauthorized operations: **0** in every run (negation, GO/STOP requests, non-existent cue, ambiguity all produced no operations). Ambiguity cases (twin cues) correctly returned CLARIFY on both providers. Median latency: Meta 2.7–3.0 s; Baseten 4.0 s before and 1.1 s after the low-reasoning fix.

Functions covered (each ×16 dev and ×8 holdout scenes per provider, ambiguity ×2/×0 because only two scenes have twin cues): delete by number/description, move, gain, fade, rename, create named, create several, voice trigger (verbatim dialogue, no actor name), notes with actor, query, negation, GO request, non-existent cue, ambiguity, artistic proposal (shape only), follow-up with history.

## Defects found and fixed (each with a regression test)

1. **Baseten model id stale** (`…-1026`→`meta-models/muse-spark-open`, verified via the free `/v1/models` listing). Updated in `basetenCueProvider.mjs` and tests.
2. **Baseten empty replies**: hidden reasoning exhausted `max_tokens` (finish_reason=length). Now 7000 tokens, `reasoning_effort:low`, timeout 60 s, response cap 64000 bytes. Test: `agentRoutes.test.mjs`.
3. **Baseten prompt lacked the REORDER_CUE and edit shapes** (`afterCueId` used; edits without `numeric/text/boolean`). Prompt now documents both. Test asserts it.
4. **Meta put `label` at operation level with empty `edits`** for a rename. The decoder now reads that as a label edit (still a reviewable plan). Test added.
5. Judge/harness bug found during the pilot (HTTP failures counted as correct modification) fixed before any result was reported.

Because fixes 2–4 came after dev results, dev figures are pre-fix evidence; the holdout is the post-fix figure. Meta's holdout run did not benefit from fixes 1–3 (Baseten-only).

## Voice (28 cases, real ASR, SYNTHETIC speech)

Audio comes from Windows TTS (Helena es-ES, Zira en-US), **not human voices, no room noise**: it measures the real Muse ASR + agent chain, not real-world voice accuracy.

- Transcribed 27/28 (1 `TRANSCRIPTION_UNAVAILABLE` 502, not retried). Mean WER 0.37, median 0.40, exact 2/27. The WER is inflated by the literal homophone "cue"→"Q / cuetres / queues"; the agent still handled most of them.
- Agent on the 27 transcripts: interpretation 26/27, exact modification 25/27. Failures: "QEDOS" (→ CLARIFY, safe) and "fading" heard for "fade in" (the agent set **fadeOut** instead of fadeIn — a wrong but reviewable change). Plus the one ASR 502.
- Unauthorized operations 0; all GO requests ended with no operation.
- The local resolver (`prepareVoiceEditRequest`) was run on the same transcripts for free: it never produced a wrong plan; ~half fall to NEEDS_AI.

## Limitations (pending, not verified)

- Gold and judge are author-made and **not human reviewed**; artistic quality (16 dev + 8 holdout ART cases) is **unscored**, awaiting a human.
- The cases are simple, single-instruction, with clean projects (≤5 cues): both providers hit a ceiling (holdout 100 %), so this suite does **not** discriminate between them nor prove performance on large shows, noisy scripts, real plays or multi-step edits. Add harder cases next.
- Only one run per case; no variance estimates. Meta price/billing unknown. No real human/noisy voice, no browser E2E with real calls, no hardware or live-show claims.
- Pilot count (30 requests) was met but Baseten's pilot half was invalidated by the stale model id; documented above, not hidden.

## Recommendations

1. Human-review the gold and score the artistic proposals.
2. Build a hard set (large shows, ambiguous references, Spanish/English mixed, multi-operation, long dialogue, truncated context) before further provider comparison.
3. Make `reasoning_effort:low` the Baseten default permanently (done) and monitor `finish_reason`.
4. Map homophones (`Q`, `cuetres`, `queues`) in the voice normaliser and add a fade-in/fade-out confirmation when the transcript is uncertain.
5. Record real human-voice samples (consent) for the ASR check; keep the preview/confirm step for all voice edits.

## Reproduce (offline / opt-in)

- `node tools/runq-theatre-real-eval.mjs --set pilot` (dry run, no network).
- Paid runs need an explicit operator `--live --ack-paid`; do not run in CI or from coding agents.
- `npm run check:syntax` (225 modules), `npm test` (680/680), `npm run qa:ai:campaign` (8/8 gates), `npm run qa:voice:campaign` (500/500 simulated) all pass on this branch.
