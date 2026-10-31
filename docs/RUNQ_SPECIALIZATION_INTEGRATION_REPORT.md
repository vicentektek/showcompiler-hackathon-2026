# RUNQ — Specialization foundation: integration report (2026-10-31)

Branch `qa/specialization-eval-2026-10-31`, created from the working tree of `qa/real-agent-eval-2026-10-31` (all uncommitted work preserved; nothing committed, pushed or merged). Files from `origin/qa/fireworks-specialization-foundation` (2076105) were imported selectively and rewritten.

## What the remote foundation got wrong vs the real contract
| Remote | Real contract | Fix |
|---|---|---|
| status `REJECTED` | statuses are PLAN/ANSWER/CLARIFY | refusals → ANSWER/CLARIFY, `operations: []` |
| `{op, cueId, changes:{gainDb}}` | wire `edits:[{field,numeric,text,boolean}]` + all keys required | targets built in wire format |
| REORDER/CREATE shapes absent | `targetCueId+position`, `afterCueId` | covered |
| generic system prompt in SFT export | the route's developer prompt + user JSON | prompt exported from route (`AGENT_SYSTEM_PROMPT`), no copy |
| context `{cues:[{id,label}]}` | `fitAgentContext(buildAgentContext)` | real contexts |
| no check that cue IDs exist, no leakage checks | `MODEL_CUE_NOT_IN_CONTEXT` | validator checks IDs, scene/split disjointness, cross-split task leakage |

## Added / changed
- `tools/agentRoutes.mjs`: now exports `AGENT_SYSTEM_PROMPT` and `AGENT_OUTPUT_SCHEMA` (behaviour unchanged; route tests 7/7).
- `tools/qa-specialization/{contract,build-dataset,validate-dataset,export-sft}.mjs` (rewritten), `fixtures/qa/specialization/*`, `test/specialization.test.mjs` (6 tests).
- `tools/runq-theatre-real-eval.mjs`: new set `spec-dev`; raw evidence stores context + `projectBefore` + `projectAfter`.

## Results
**Tested (offline/simulated):** 290 reference rows (train 146 / dev 48 / holdout 96) all pass the wire validator, the real judge and a real agentCore commit on a project copy; export gate refuses 0 approved rows and exports the exact route message format when rows are approved (test fixtures only). Full suite: `npm run check:syntax` 230 modules OK; `npm test` 686/686; `qa:ai:campaign` READY_FOR_OPERATOR_REVIEW, 0 paid requests by itself.

**Real paid inference (one bounded run, tag `specdev`, scenes 07/08, no retries, final code):**
| Provider | Requests | Interpretation | Selection | Modification | Unauthorized | Median latency |
|---|---|---|---|---|---|---|
| Meta muse-spark-1.3 | 64 | 64/64 | 52/52 | 60/60 | 0 | 2.9 s |
| Baseten muse-spark-open | 64 | 64/64 | 52/52 | 60/60 | 0 | 1.0 s |

Artistic cases (8/provider) are not scored (human review pending). The evidence (`artifacts/theatre50-real-eval/raw-specdev.jsonl`, git-ignored) holds request, full raw response, context and project before/after. Spend: ledger reservations this run 2.56 USD per provider; cumulative reserved ≈ Meta 10.3, Baseten 10.7, ASR 0.56 (≈ 21.5 of 30 USD). These are estimates, not billing.

## Not verified / pending
- No SFT/LoRA training, no specialized model, no endpoint, no provider adapter (Fireworks or other): **not started** by design.
- All 290 targets are deterministic reference plans, **not human reviewed**; `allow_training=false` everywhere. 96 cases (notes, trigger, query, artistic) need human-written targets.
- 64/64 and the earlier 128/128 mean the cases are easy (ceiling): they cannot show a gain from specialization. Harder adversarial cases are needed before the comparison is meaningful.
- The holdout was already scored once for the base arms; it stays independent of training, but a truly untouched second final set (new scenes) would be better and does not exist yet.
- Training rights: scenes are original and authored here; any third-party text needs per-edition rights clearance (catalogue `theatre-50` is metadata only).
- Voice with human speech, hardware and live-show claims remain unvalidated.
