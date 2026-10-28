# RunQ — Offline paired model evaluation planner (Level 1)

Run: `npm run qa:dual-provider:plan`

Optional bounds: `npm run qa:dual-provider:plan -- --max-requests 4 --budget-usd 2`

This command reads the **six development scripts only** in the Level 1
provisional corpus and uses the existing deterministic scene planner to
select complete pairs of identical analysis windows. One planned window
means one planned META request and one planned BASETEN request.

It outputs gitignored local files:
- `artifacts/dual-provider-plan/plan.json`
- `artifacts/dual-provider-plan/plan.md`

The default 20-request cap covers 9 development windows in 18 requests:
9 META, 9 BASETEN. The $20 budget is a planning ceiling, **not a
reservation or a verified charge**. Provider budgets are shown separately.
No request is actually executed.

## Non-negotiable safeguards

- **Offline only**: there are no live/paid flags and the planner imports
  neither provider clients nor API credentials.
- The 10 qualification cases are **not included in plan output**; any
  qualification planning requires independent human-reviewed gold and an
  explicit release path not exposed by this CLI.
- No synthetic or provisional gold is presented as measured model quality.
- No automatic retries, model selection, prompt tuning or code edits.
- Pairing is by precise script case, planned source line span and scene
  window. The future executor must preserve these and attach provider
  evidence with verified completed status.
- The 20-request cap bounds total *requests*, not cases; longer scripts
  may require multiple windows. Always quote per-provider actual pricing
  and verify ledger behavior before permitting paid execution.
- V1 scorer and existing V2 interpretation remain unchanged. No GO/STOP
  or runtime project transport is connected to this tool.

## Next milestone

Build a **separately authorized** provider executor consuming a validated
plan, with opt-in paid acknowledgment, strict per-provider limits, persistent
cost accounting, local sanitized result retention and no automatic retry.
After operator gold sign-off, compute paired TP/FP/FN and compare exact
event accuracy. Evaluate V2 notes/suggestions separately from V1 F1.
