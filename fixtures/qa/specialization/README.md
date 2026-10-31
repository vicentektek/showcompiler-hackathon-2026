# RUNQ — Specialization corpus (SFT/LoRA preparation)

Offline, provider-neutral dataset infrastructure adapted to the REAL agent contract. **No model has been trained and no gold is human-approved.**

## Contract (single source of truth)
- Input = exactly what `tools/agentRoutes.mjs` sends: `AGENT_SYSTEM_PROMPT` (developer message) + user JSON `{instruction, language, conversation, context}`; `context` comes from `fitAgentContext(buildAgentContext(...))` (≤15000 chars, ≤80 cues).
- Output (`expected`) = wire format of `AGENT_OUTPUT_SCHEMA`: `status` ∈ PLAN|ANSWER|CLARIFY, `message`, `operations[]` with all of `op,cueId,afterCueId,targetCueId,position,label,edits` (unused = null, edits `[]`; edit = `{field,numeric,text,boolean}` with exactly one non-null). There is no REJECTED status: refusals are ANSWER/CLARIFY with no operations. GO/STOP is never an operation.
- `contract.mjs` imports the schema/prompt from the route (no copy), validates targets, maps wire → agentCore operations and verifies a target with the real judge + `prepareAgentPlan/commitAgentPlan` on a project copy.

## Files
- `fixtures/qa/specialization/examples.jsonl`: 3 format samples (train/dev/holdout), pending review.
- `tools/qa-specialization/build-dataset.mjs`: builds 290 rows from the ORIGINAL frozen scenes (`fixtures/qa/theatre-real`) into `artifacts/specialization/` (git-ignored) plus `experiment-plan.json`. Splits are by scene: train 146 (scenes 01–06), dev 48 (07–08), holdout 96 (09–12, the frozen eval holdout). NOTES/TRIGGER/query/artistic cases (96) get no auto target; they need a human-written one.
- `validate-dataset.mjs`: contract, limits, reviewer/rights, scene-disjoint splits, cross-split task leakage, holdout never trainable.
- `export-sft.mjs`: refuses until a human approves rows (`review_status=approved` + reviewer, `allow_training=true`, split=train, rights original/cleared). It is **supposed to fail today**.
- Evaluator link: `node tools/runq-theatre-real-eval.mjs --set spec-dev|holdout ...` (same case ids). Raw evidence now stores request, full response, context, `projectBefore` and `projectAfter`.

## Commands
```powershell
node tools/qa-specialization/build-dataset.mjs
node tools/qa-specialization/validate-dataset.mjs artifacts/specialization/runq-corpus.jsonl
node tools/qa-specialization/export-sft.mjs artifacts/specialization/runq-corpus.jsonl   # fails until human approval
node --test test/specialization.test.mjs
```

## Experiment (prepared, not executed)
Arms on the same frozen cases: Meta Muse Spark 1.3, Baseten Muse Spark Open, and an open-weight + LoRA model (needs reviewed rows, a deployed endpoint and a provider adapter in `agentRoutes`; not implemented). Fine-tune only on approved `train`; tune on `dev`; score the specialized arm once on `holdout`. The base arms already ran holdout once (128/128 each); that data never trains anything.
