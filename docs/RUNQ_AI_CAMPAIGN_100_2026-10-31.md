# RUNQ - owner-authorized Meta/Modal campaign, 31 October 2026

This supersedes the old USD 30 campaign allocations, not historical results or
execution safety rules. The owner explicitly authorized the increase:

| Ceiling | USD |
|---|---:|
| Global, including all historical reservations | 100 |
| Meta Muse Spark | 65 |
| Modal Stable Audio | 35 |
| Baseten - prohibited | 0 |
| Fireworks - excluded from this campaign | 0 |

Amounts are maxima, not required expenditure or confirmed provider credit.
The source of truth for ceilings is
[campaignPolicy.mjs](../src/qa/campaignPolicy.mjs).

## Durable accounting and upgrades

[globalSpendLedger.mjs](../src/qa/globalSpendLedger.mjs) reuses the historical
`RunQ/Evaluation/global-spend-v1.json` location in the user's local application
data directory, independent of checkout. The old schema, campaign ID, approval
date and reservation array remain intact. The new policy has a dated history.
Forbidden-provider historical charges still count globally, but cannot receive
new reservations. Unknown, failed and completed reservations stay charged
conservatively until separately reconciled with authentic evidence.

`npm run budget:status` is read-only and makes zero provider calls.
`npm.cmd run budget:upgrade -- --authorized-at <UTC-ISO> --backup <external-file>`
applies the already-authorized policy, under an exclusive cross-process lock,
only after byte-for-byte SHA-256 backup verification. It never creates an
approval from scratch, resets balances, refunds uncertainty or verifies credit.

Additional historical ledgers can be counted conservatively using repeated
`--legacy-meta-ledger`, `--legacy-agent-ledger` and `--legacy-modal-job` arguments.
Imported entries are separate UNKNOWN carryovers with stable path/sequence IDs
and evidence hashes. Original reservations are unchanged; rerunning the same
import is idempotent. Changed evidence requires reconciliation, not overwriting.
Agent history lacking a provider-attributed case key fails closed.
Possible overlap is intentionally counted twice unless a reliable correlation
proves otherwise; this is a conservative ceiling, NOT measured billing.
Keep all ledgers, backups, prompts, audio and derived reports private/local.

Reservations use integer micro-USD. Positive amounts below supported precision
are rejected before writing or submitting; they cannot round into a zero-cost
reservation. An exclusive temporary-file collision preserves earlier evidence
and fails closed without charging or deleting an unowned file.

Meta production design routes reserve before outbound inference; Modal reserves
before submission and preserves its existing shared job journal. The consent,
cost acknowledgement, model revision, daily/active job limits and explicit
manual review are still required. Dependency injection makes offline tests free;
it is not an alternative execution path for evading campaign controls.

The Agent evaluator validates programmatic entrypoints before side effects,
defaults to 20 Meta-only cases and reserves USD 0.15 maximum per request.
Its private loopback server uses that existing reservation, not a second one.
Seminar/systematic commands retain the USD 2 per-command bound; their old local
histories now have a USD 65 cumulative ceiling AND the shared campaign gate.
Interrupted two-ledger writes remain reserved conservatively and never retry.

## Exact remaining live gates

### Supervised first-pair procedure

After the first pair, `npm run qa:modal:live -- --live --ack-paid
--credit-verified --port 5192` runs nine NEW serial sound cases through the
updated local server. `--credit-verified` is an operator attestation after
checking the actual workspace; it does not authenticate or manufacture credit.
The production default daily count is now 10 (previously 3), preserving the
configured USD 0.50 daily estimate, one active job, Modal USD 35 and global
USD 100 ceilings. With the original USD 0.05 pilot plus nine at USD 0.05, the
maximum current-day estimate is USD 0.50. Unknown or other existing jobs can
still block the batch; no quota or ledger is reset to make it fit.

The runner stores fixed input hashes and request IDs under ignored
`.runq-local/modal-quality-v1`, never prints keys or raw upstream responses,
polls each original job at most 30 times, validates WAV hash/duration/PCM, and
records RMS, peak, saturated-sample and near-silent fractions. Original WAVs
are saved locally; completed receipts are hash-checked on resume. Uncertain
submissions never resubmit, and stale batch locks fail closed. Re-running
resumes existing jobs/cases, not another nine generations. These are nine
pilot cases, NOT the requested 100 Modal generations or a 500-case campaign.
Artistic adequacy, distortion and cue/playback integration remain separate
human/browser checks; PCM saturation is not an artistic score.

The Meta Agent runner now excludes previously reported case IDs (including the
operator's first 20) and fingerprints actual prompt/context/contracts for new
reservations. Changing the seed or random project IDs does not authorize a
repeat. `--start-index` selects a later fixture range; identical-content cases
are still skipped. A new UUID or seed is not independent quality coverage.
Old/unrecognized history fails closed rather than assuming it is safe to retry.

The owner supervises an explicit first pair: one new Muse Spark request and one
new Stable Audio submission through the budget-guarded local product routes.
The owner verifies vendor credit/limits and initiates each paid action in their
private terminal or RUNQ UI; the assistant can prepare inputs and review sanitized
results. No credential sharing, agent-initiated paid calls, retries of uncertain
requests, automatic cue acceptance, GO or provider-policy bypass is permitted.
Keep the original request IDs and all reservations after errors; a status lookup
or WAV download is not another generation. Expand only after reviewing the pair.

The general budget authorization is already granted. It is not the blocker.
Before an operator executes a paid command:

1. Verify actual remaining Meta/Modal account credit and account spend limits
   through their authenticated dashboard or previously approved account tooling.
   Record timestamp, provider, currency, available amount and method privately.
   Local USD 100 approval is not proof of vendor balance.
2. Preserve/review historical UNKNOWN requests. Do not resubmit them, change
   their IDs or fake a cancellation/completion/refund.
3. Pin a clean, validated commit and run from the existing ledger context.
   The historical pilot additionally required `--live --ack-paid
   --dashboard-verified` and accumulated request quotas. It is absent from this
   checkout and is NOT silently resurrected with obsolete allocations.
4. Supply credentials in the operator's private terminal through established
   configuration, never through source, chat, logs or CI. Coding agents must not
   read keys or execute the operator-only paid Meta/systematic commands.

No dashboard verification flag or credit record is generated by the budget
upgrade. No new provider requests are claimed until these gates are genuinely
satisfied. Keep developer/agent execution restrictions even though spending is
authorized; do not delegate or change directories to bypass them.

## Progressive product evaluation

The shared campaign ledger enforces the USD ceilings and the campaign request
ceilings (Meta 400, Modal 100) before accepting each reservation. Its status
reports reserved requests and remaining request capacity; reservations are not
provider invoices or verified account credit.

- `npm run qa:agent:live:plan`: history-aware offline selection, Meta only.
  The legacy 400 fixture positions contain only 24 unique inputs. The runner
  preserves those identities and adds the existing 400 quality-matrix contracts,
  interleaving functions, ES/EN and all four difficulties. Fixtures remain
  synthetic inputs even when evaluated by a real provider.
- `--cases N` now requests N NEW completed evaluations, not N visited positions.
  `--target-total 100 --cases 100` subtracts unique completed historical inputs:
  with the current history, it selects 76 new cases (38 ES, 38 EN). Preview with
  `node tools/runq-agent-live-eval.mjs --target-total 100 --cases 100`.
  Only the owner adds `--live --ack-paid` after the existing credit/clean-commit
  gates. Reservations, including UNKNOWN, never permit a retry. Legacy rows
  without fingerprints block identical-content aliases, not only old case IDs.
  Results are atomically saved before each POST and after each evaluation.
  `COMPLETE` requires the effective completion target; underfill reports
  `CORPUS_EXHAUSTED`, budget or provider blockage instead. Errors stop without
  retries. HTTP completion, objective correctness and human review are separate.
  New extraction metrics reuse exact event P/R/F1; edits reuse exact property
  and preservation contracts. Legacy summary heuristics cannot establish a
  measured improvement in Muse extraction or artistic quality.
- `npm run qa:meta:plan`: original seminar-script extraction and typed
  PLAY/STOP/CONTINUE/SILENCE evidence, provisional human gold, no inference.
- `npm run qa:systematic`: bounded original-case plan with independent A/B
  matching. Expand only after inspecting real completed-case evidence.
- Modal: start with the existing two-request latency pilot, verified endpoint,
  reproducible model revision, acknowledged maximum, and current credit. Do not
  deploy again or retry a failed/unknown job without diagnosis.

Record case ID, prompt/model/source commit, expected provenance, review
requirement, tokens when supplied, latency, conservative reserve, measured usage
estimate, actual invoice when verified, errors and retries. Unavailable tokens
or billing are null, not zero. Precision/recall/F1 apply to typed event matches;
conversation contract accuracy is a separate metric. Never mix failed or
incomplete responses into fabricated F1, or retune gold to improve a score.

`contract-scoring-v2` separates scored replies, network errors and artistic human
review. Explicit summaries must enumerate actual cue labels; label coverage is
a grounding heuristic, not comprehensive hallucination detection. Unspecified
creative counts are not assigned an invented target of three. Empty closing
cues are checked by final placement/source state, not by one `afterCueId`
spelling. Derived operation kinds, target ordinals and changed field names are
recorded without model messages or raw text. Historical reports are not rescored
without their original evidence and protocol; percentages across versions are
not directly comparable.

For product E2E, human review precedes approval, audio import, cue creation and
transport. Verify save/export/reopen with real WAV bytes; browser engine checks
are not proof of physical sound, microphone recognition or theatre readiness.
No model response, warning, navigation or cost tooling may call GO/STOP.

## Deterministic quality campaign

`npm run qa:quality` freezes an original 400 Meta / 100 Modal matrix under
ignored `.runq-local/quality-campaign/`: ten functional families, ES/EN,
four difficulties, 60% development and 40% held-out cases. The first phase
has 30 varied Meta cases. Fixtures and gold are provisional; a plan is not
500 actual provider calls.

`npm run qa:quality:history` is offline. It hash-checks original saved WAVs,
compares existing silence/duration flags with versioned RMS/clipping/gap
checks, and reports legacy evidence limitations. Silent intervals have 20 ms
resolution. Ambience gap checks are PCM heuristics, not semantic judgement.
No WAV, journal, historical budget or show is modified.

Only the owner starts paid execution, once, after the existing clean-commit,
credit and spend gates:

```powershell
node tools\runq-quality-campaign.mjs --live --ack-paid --credit-verified --credit-record <private-credit.json> --continuous
```

The private credit record contains `policyRevision` from campaignPolicy,
`sourceCommit`, `verifiedAt` (within 24 hours), method
`AUTHENTICATED_PROVIDER_DASHBOARD`, and `providers.meta` / `providers.modal`
objects with `currency: "USD"` and actual `availableUsd`. This is an owner
attestation, not automated vendor balance verification. Do not fabricate it.
The command uses only existing loopback product APIs and their ledger gates;
it never reads a key. `--resume` continues existing intent receipts. Uncertain
Meta requests never repeat; Modal resumes only the original job ID with bounded
refresh/download. Shared per-user intent fingerprints exclude random project
IDs, candidate labels and seeds. No result can auto-accept/import or call GO.

Phases stop on uncertainty, unscorable evidence, critical failures or over 20%
scored failures. The owner may inspect a separately staged candidate, not
silently override this gate. Create one offline:

```powershell
node tools\runq-quality-campaign.mjs --new-candidate preservation-v1 --agent-suffix "Preserve every unrequested property."
```

`--candidate <private-candidate.json>` runs changed agent instructions or a
different supported extraction design mode without altering stable prompts.
`--baseline-report <file> --candidate-report <file>` compares only matching
case fingerprints and evidence modes. It blocks regressions and records
insufficient holdout evidence; approval remains human. Code changes use the
normal focused/full regression gate and a separately pinned clean commit.
Historical aggregate-only agent replies cannot establish edit preservation,
cue extraction precision or a measured improvement of Muse.

## Saved-take recovery and manual acceptance

Sound -> Create & edit -> **Show saved takes** loads the bounded local history.
Choosing a take opens its record only: no provider polling, generation,
acceptance, cue creation or sound. Check/load the WAV explicitly, audition at low
volume, STOP the audition, then decide whether to accept. Unknown submissions
remain non-retryable; their review/poll controls are disabled.

Import + create cue is a separate confirmed action. Recovered takes preserve
their original asset provenance, but new cues do not inherit an old L# merely
because that number exists in the current script. Newly generated same-session
source behavior is preserved. Inspect the created cue, explicitly Set as NEXT,
then GO/STOP ALL. Export through File -> Export complete show, reopen it and
verify original WAV hashes, IN/OUT/fades and silent reopening.

`npm run test:sfx-history` is a free browser regression with original synthetic
fixtures, real Web Audio and a synthetic UNKNOWN journal. CI runs only that
mode. An operator can separately set `RUNQ_SFX_HISTORY_DIRECTORY` to the existing
private local journal to reuse historical WAV bytes WITHOUT submitting jobs.
The harness copies journals to a temporary isolated directory, makes no provider
requests, changes acceptance only in that copy and rechecks original hashes.
Automated clicks/audition state are NOT an acoustic or human acceptance.
Historical takes with the same prompt/seed and identical WAV hash represent one
distinct sound, not independent semantic quality measurements.

Manual sign-off still requires listening through the intended output device,
checking the actual effect against the brief, background noise/levels, complete
show GO/NEXT/individual STOP/STOP ALL, and real microphone/actor speech. Use the
already documented Last GO protocol; never describe synthetic speech or headless
AudioContext success as physical microphone or room validation.

## Preserved delivery

RC v2 `bce9bd3`, RC v3 `ca466a7`, their Windows ZIPs and other worktrees remain
untouched. Campaign development starts at documentation HEAD `05471fe` on
`feat/runq-ai-campaign-100-2026-10-31`. This is not a release or main merge.
The existing preview at port 5190 belongs to the user's test session; budget
work must not replace its show or restart live transport behind their back.
