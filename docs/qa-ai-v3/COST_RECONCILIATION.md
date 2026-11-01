# Assistant V3 cost and reservation reconciliation

## Authorization boundary

This runner has a separate, incremental **Meta-only** authorization of at most
EUR 60 and 1,800 requests. It does not replace, reset, upgrade, or rewrite the
pre-existing per-user campaign policy. **The active shared USD 100 / Meta USD
65 / 400-request limits still apply** until an executable, reviewed policy
transition is available. The new EUR ceiling is currently an additional
accounting constraint, not permission to bypass the installed shared policy.
Every attempted V3 request appends to
`global-spend-v1.json.extensionCampaigns["runq-assistant-v3-meta-eur-20261101-v1"]`
under the original `global-spend-v1.json.lock`; a separate EUR sidecar mirrors
every extension entry. The existing ledger validator ignores this additional
property. Each V3 liability also appends a matching ordinary Meta reservation,
so all existing callers see and respect that spend. Historical rows and caps
remain unchanged; production remaining capacity decreases. The old ledger must still exist, validate,
and be lockable; missing, corrupt, changed, locked, or unreconciled history
fails closed. V3 cannot use Baseten, Modal, Fireworks, voice, web search,
tools, multimodal input, sampling `n > 1`, streaming, or stored completions.

The prior independently verified snapshot supplied for the task had USD
56.331903 total reservations; Meta had USD 53.513358 and 392 of its 400 request
reservations. A later **read-only** plan check reported USD 11.409566 remaining
for Meta and 6 old Meta request slots. Those figures continue to govern only
the shared campaign and constrain V3 as well. With no V3 history, EUR 60 permits
**at most 36 full-window reservations**, further reduced by the shared remaining
USD and request caps. At the later snapshot only six requests could fit the
active shared request policy. This is an explicit blocking policy gap, not
enactment of the requested independent EUR 60 campaign.

The extension and EUR sidecar are append-only and mutually reconciled by
request ID, model, provider, amount, and status. Their baseline digest includes
all historical reservation rows and all other campaign extensions, excluding
only this V3 extension and its strictly matched V3 ordinary liabilities. A sidecar amount must exactly equal the
published full-window reserve; prior completed, reserved, and unknown V3
requests all count against both EUR and request ceilings. Any unexplained
history change, missing counterpart, mismatch, or corrupt state blocks further
calls. V3 reserves the shared extension atomically first, then its sidecar;
failure between writes leaves a detectable mismatch and fails closed. Tests
use disposable synthetic ledgers inside the checkout and never modify the
real per-user ledger.

## Per-request maximum

Official Meta documentation checked on 2026-11-01:

- [Muse pricing and rate limits](https://dev.meta.ai/docs/pricing-rate-limits):
  Muse Spark 1.3 text input USD 1.25 / 1M tokens and output USD 4.25 / 1M
  tokens; no long-context premium.
- [Chat completions protocol](https://dev.meta.ai/docs/protocols/chat-completions):
  `max_completion_tokens` is supported.
- [Reasoning tokens](https://dev.meta.ai/docs/reasoning): reasoning tokens are
  included in the completion-token limit.
- [Models](https://dev.meta.ai/docs/models): context window 1,048,576 tokens.
- [ECB reference rates](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml):
  2026-10-30 EUR 1 = USD 1.1172.

The gate reserves the **entire 1,048,576-token input window**, not a byte-based
or estimated prompt length, plus the 2,200-token completion cap:

```
input:       1,048,576 × USD 1.25 / 1,000,000 = USD 1.310720
completion:      2,200 × USD 4.25 / 1,000,000 = USD 0.009350
USD maximum per request                         = USD 1.320070
EUR reserve multiplier (conservative)           = 1.25 EUR per USD
EUR maximum per request, rounded up to 1e-6     = EUR 1.650088
```

The EUR multiplier is deliberately much more conservative than the cited ECB
spot rate and also provides headroom for currency/card/tax variability. The
EUR 60 envelope covers at most 36 such reservations (EUR 59.403168); the
1,800-request count is a ceiling, not a target. This full-window maximum is a
reservation, **not expected usage, provider credit, or an invoice**.
Usage-based tariff calculations in reports are separate and are explicitly
not invoices. Uncertain reservations are not refunded.

Pricing/FX verification expires at **2026-11-02 22:15 UTC**. After expiry the
paid gate blocks until the sources and constants are re-verified and changed
with review. No automatic rate refresh, retry, or fallback provider is used.

## Requests, recovery, and commands

The default is offline. `ai-live` and `resume` require both `--live` and
`--ack-paid`; a new batch also requires a bounded `--limit 4`, `8`, or `12`.
The explicit `--variants A,D --limit 2` option supports a smaller remeasurement
without pretending it includes the B/C variants.
Calls are serial, once-only, and limited to the exact Meta chat-completions
endpoint/model. The runner persists its request identity, worst-case USD/EUR
reservation, payload hash, and `RESERVED` checkpoint before fetch. A crash or
timeout with uncertain provider outcome becomes `UNKNOWN`; that request ID
cannot be retried. HTTP 401/402/429, timeouts, and ledger errors stop the batch.
The runner uses an already-configured process key only inside request transport;
it does not print or copy credentials. It does not persist response text,
scripts or prompts.

Command plan:

```
node tools/runq-assistant-v3.mjs plan
node tools/runq-assistant-v3.mjs baseline
node tools/runq-assistant-v3.mjs ai-offline --split development
node tools/runq-assistant-v3.mjs ai-live --split development --limit 4 --live --ack-paid
node tools/runq-assistant-v3.mjs resume --run <32-hex-run-id> --live --ack-paid
node tools/runq-assistant-v3.mjs status [--run <32-hex-run-id>]
node tools/runq-assistant-v3.mjs report [--run <32-hex-run-id>]
node tools/runq-assistant-v3.mjs compare [--run <32-hex-run-id>]
```

Do not import credentials or reset a ledger to unblock the pilot. Missing
process credentials, stale tariff verification, failed shared reconciliation
or exhausted shared capacity stop before provider transport.
