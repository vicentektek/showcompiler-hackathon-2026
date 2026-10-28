# Baseten Muse Spark Open — seminar benchmark (isolated)

This is a **laboratory-only** feature. It does not alter GO, STOP, cue transport, application UI, production Baseten provider, or the first-party Meta adapter.

- Both providers use the same committed seminar cases, original lines, scene windows, theatrical 16-field proposal validation, and `stageCueQa` scoring dimensions.
- Baseten hackathon endpoint is fixed to `meta-models/muse-spark-open-1026`. No other model IDs are accepted.
- Baseten does not advertise the same strict JSON-schema response-format support, so the schema is placed in the prompt and **every complete result is locally validated**. An invalid or truncated response is a failed request, never an empty successful prediction.
- No credentials, full provider replies or source scripts are exported in lab reports. Local reports may still contain sensitive metadata and belong outside version control.
- The output budget is 8192 tokens because reasoning may exhaust smaller limits. No automatic retry, no parallel requests.
- Real inference requires explicit `--live --ack-paid`, and a session-scoped `BASETEN_API_KEY`. Default is offline.
- Monetary cost is *not* estimated: hackathon Baseten prices have not been verified. Check actual credits in Baseten billing.
- A local `--max-requests` count is a request safety gate, **not an account-level spending cap**.
- Tests should inject fake network responses and must never contact either provider.

## Commands

```powershell
# First ensure you're on the PR branch in a separate clean worktree.
node tools/run-baseten-seminar-eval.mjs --case <fixture-id> --max-requests 1
# Only after reviewing planned requests, opt in to billing:
node tools/run-baseten-seminar-eval.mjs --live --ack-paid --case <fixture-id> --max-requests 1
# Uses existing first-party Meta results, with NO new API charges:
node tools/compare-provider-seminar.mjs
```

Equivalent offline package commands are `npm run qa:baseten:plan` and
`npm run qa:compare-providers`. The paired command writes both
`artifacts/seminar-compare/report.json` and a concise `report.md`.

The comparison recalculates precision, recall, F1, invalid references, forbidden PLAY, wrong event types, duplicates, dimensions and semantic alternatives **on the intersection of fully completed cases only**. Without overlapping cases, the comparison explicitly says it is unavailable. The corpus gold requires human review, and no model quality certification is claimed.

Sanitized request telemetry includes latency plus prompt, completion, reasoning and cached tokens when the provider returns them. Missing usage remains missing rather than being guessed. Baseten monetary cost remains unavailable until an authoritative price or dashboard charge is supplied.

Your VS Code local environment is not accessible from this GitHub patch: no live Baseten/Meta calls have been executed by this PR. Avoid running Codex and OpenCode edits simultaneously in the same worktree.
