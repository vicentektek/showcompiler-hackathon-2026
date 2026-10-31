# RUNQ — Fireworks / Muse specialization groundwork

This branch adds **offline, provider-neutral dataset infrastructure**, not a trained model. It does not modify the runtime, prompts, playback engine or voice autopilot.

## Scope
- `examples.jsonl` is a format example, **not a verified gold dataset**.
- `validate-dataset.mjs`: validate IDs, splits, bilingual labels, reviewer state, holdout exclusion and licensing.
- `export-sft.mjs`: exports OpenAI-compatible messages JSONL only for train entries with explicit human approval and verified training rights.
- No costs, provider calls, model uploads or training runs have been made.

## Local commands
```powershell
node tools/qa-specialization/validate-dataset.mjs
node tools/qa-specialization/export-sft.mjs
```
The export is **supposed to fail** until examples are reviewed and cleared. The sample operation schema is illustrative; check against actual RUNQ `agentCore` before generating any gold.

## Recommended workflow
1. Import the 50-play catalogue from `../theatre-50/works.json`. Check each edition and rights (read/evaluate rights differ from rights to train or upload).
2. Create realistic, operator-reviewed instructions for precise cue selection, numeric values, fade direction, trigger matching, ambiguity, context retention and negative safety cases.
3. Divide by **work and author** into train/dev/holdout. Do not create near-duplicate tasks across partitions.
4. Preregister cases with hashes. Preserve exact prompt/response, project state, model, settings, tokens, timing and spend; score exact project diffs independently of generation.
5. Compare Meta Muse Spark, Baseten Muse Spark Open and optional Fireworks hosted models with the **same frozen cases**.
6. Experiment with reasoning effort only when supported, track p50/p95, and keep training separate from evaluation.
7. If base models fail consistently, prepare SFT/LoRA on reviewed examples. **Do not fine-tune until sufficient verified training data exists.**
8. Evaluate tuned weights exclusively on previously untouched holdout works. Keep operator approval on all modifications, and never allow voice-edit to fire GO or STOP.
9. Before merging, reconcile with local `feature/voice-cue-editing` and `qa/real-agent-eval-2026-10-31` branches; those local changes may not be on GitHub.

## What Copilot still needs to do
- Connect a parser to the actual RUNQ project schema and implement frozen evaluation cases.
- Build a curated reference set, manually score artistic quality, collect human voice speech.
- Integrate Fireworks SDK/API only after verifying current model/deployment support, terms and budget.
- Add regression tests and CI once linked to runtime.
