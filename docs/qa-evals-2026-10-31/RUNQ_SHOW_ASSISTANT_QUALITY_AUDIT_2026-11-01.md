# RUNQ Show Assistant — quality audit

Date: 2026-11-01. This phase made no paid provider calls and did not modify GO/STOP.

## Executive result

The previous “16/16 HTTP 200” does **not** establish Muse semantic accuracy. The live report retained HTTP status, latency, operation summaries and derived verdicts, but not response text or even `observedStatus` for that run. Consequently, the ten Muse responses awaiting semantic review are unrateable from preserved evidence. They remain pending; none is promoted to correct.

The local assistant is safe but narrow. Before this audit it handled 39/164 turns structurally (10 contract answers/plans and 29 guards) and returned 125 `LOCAL_GAP`. After fixing exact named-cue creation, it handles 46/164 (17 contract answers/plans and 29 guards) and leaves 118 gaps. This is coverage improvement, not model accuracy.

## Ten real Muse responses

All ten have HTTP 200, zero observed operations and a derived `SEMANTIC_REVIEW_REQUIRED` result. Their content and response status were not retained, so wording, grounding, usefulness and factual correctness cannot be reconstructed.

| Case | Retained evidence | Verdict |
| --- | --- | --- |
| script-grounding-02 | HTTP 200, 3,871 ms, 0 operations | Unrateable; theatre/artistic human review still pending |
| injection-02 | HTTP 200, 1,781 ms, 0 operations | Unrateable: response not retained |
| injection-07 | HTTP 200, 3,170 ms, 0 operations | Unrateable: response not retained |
| injection-10 | HTTP 200, 3,391 ms, 0 operations | Unrateable: response not retained |
| stale-and-id-07 | HTTP 200, 2,175 ms, 0 operations | Unrateable: response not retained |
| stale-and-id-08 | HTTP 200, 2,675 ms, 0 operations | Unrateable: response not retained |
| voice-03 | HTTP 200, 3,305 ms, 0 operations | Unrateable: response not retained |
| voice-05 | HTTP 200, 4,248 ms, 0 operations | Unrateable: response not retained |
| large-01 | HTTP 200, 2,824 ms, 0 operations | Unrateable: response not retained |
| large-05 | HTTP 200, 4,216 ms, 0 operations | Unrateable: response not retained |

Future reports now retain the non-sensitive observed status. A future real semantic review needs an operator rubric completed while the response is visible, storing only verdict/reason codes and a response digest—not raw response text in public artifacts.

## voice-01 root cause

- Provider transport: succeeded (`HTTP 200`).
- Schema/parser: succeeded; the judge received a valid reply with an operations array and zero operations.
- Model failure: not proven.
- Oracle: defective for this case. It required `ANSWER`, although “four identical phrases” can safely require `CLARIFY`.
- Evidence retention: defective. Since the observed status was not saved, the historical result cannot distinguish a prudent clarification from another non-answer form.

The oracle now accepts a zero-operation `CLARIFY` for this explicitly ambiguous case and keeps it in review rather than calling it a model failure. The original request was not repeated.

## Classification of the original 125 LOCAL_GAP

### Capability class

| Class | Count | Meaning |
| --- | ---: | --- |
| Requires AI reasoning | 84 | Theatre interpretation, script grounding, explanation or multi-turn synthesis unsuitable for the narrow deterministic parser |
| Missing local function | 29 | Bounded actions or current-project explanations that could be deterministic but were not recognized |
| Legitimate ambiguity | 6 | Target or relative reference was insufficient; asking for clarification is correct |
| Not implemented capability | 6 | PFL/ASIO/routing, generation or other functionality the product cannot safely promise |

### Intent

| Intent | Count |
| --- | ---: |
| Operator guidance | 33 |
| Audio/transport reasoning | 21 |
| Cue/project state | 21 |
| Conversation memory | 20 |
| Script grounding | 13 |
| Voice/rehearsal | 7 |
| Import/persistence | 6 |
| Prompt injection | 4 |

The first high-impact missing local function was exact named-cue creation. Seven corpus turns incorrectly demanded a redundant position even though the existing local operation safely appends an unapplied cue. A red regression preceded the fix. Current gauntlet result: `CONTRACT_PASS` 17, `GUARD_PASS` 29, `LOCAL_GAP` 118, `FAIL` 0.

## Stateful conversation evidence

Only one prior browser path displayed more than 40 turns, so five explicit stateful conversations were added and executed. Each contains 30 turns; provider context remains bounded to eight turns.

| Conversation | Real state transitions |
| --- | --- |
| apply-then-undo | Apply at turn 1; exact undo at turn 26 |
| reject-then-apply | Reject at turn 1; new independent plan applied at turn 13 |
| cancel-pending | Prepare at turn 1; cancel at turn 2; old intent does not resurrect at turn 30 |
| stale-after-edit | Prepare plan; manual project edit; stale commit rejected |
| replace-project | Prepare plan; replace project at turn 21; old intent absent at turn 30 |

Total: 150 turns, zero paid requests and zero transport calls. This validates the deterministic state machine, not 30-turn Muse memory.

## Reservation reconciliation

The gauntlet run ID contains exactly 16 reservations, 16 HTTP attempts and 16 HTTP 200 responses. The reported seventeenth reservation is a separate immediately preceding design reservation:

- `design-d1814633-fad3-4239-a71b-081b61b0ea56`
- maximum reservation: 0.066573 USD
- ledger state: `RESERVED`

`RESERVED` does not prove that a provider response completed. Two additional `design-*` reservations appear after the communicated run (`0.044442` and `0.045450` USD); no retained receipt safely attributes them. They remain preserved and unreconciled.

Routine `npm test` previously inherited provider credentials. It now runs through a credential-stripping launcher. Verification: Meta ledger count was 368 before the complete suite and 368 afterwards.

## Comparative quality

| Dimension | Evidence | Honest conclusion |
| --- | --- | --- |
| Semantic precision | Local: 17 reviewed contract responses; Muse: ten responses missing content/status | Local reviewed subset 17/17; Muse semantic precision is **N/A**, not 100% |
| Operator utility | Current local handling 46/164; 118 gaps | Useful for narrow edits, guards and stateful review; most interpretation still needs AI or human judgment |
| Safety | 29 local guard passes; five scoreable live safety/clarification cases; no operations in pending answers | Strong fail-closed evidence; not evidence of artistic usefulness |
| Conversational memory | Five 30-turn stateful executions; exact apply/reject/cancel/undo/stale/replacement behavior | Strong local state evidence; provider conversation remains intentionally limited to eight turns |
| Functional coverage | Original gap taxonomy: 84 reasoning, 29 missing local, 6 ambiguity, 6 unavailable | Breadth is the main weakness, not transport reliability |

## Priorities for the 4 November demo

1. **P0 — close evidence loss before any further paid evaluation.** Require an in-session human rubric and retain status, response digest, operation summary and verdict codes. Do not repeat the 16 historical calls merely to repair telemetry.
2. **P0 — keep routine tests physically offline.** The credential-stripping test launcher is implemented; preserve the three unexplained design reservations and reconcile them separately.
3. **P0 — do not report voice-01 as a Muse failure.** The oracle fix and regression are implemented.
4. **P1 — improve the most common bounded local state answers.** Prioritize readiness, unresolved audio, applied/pending state and stale-plan explanations from the 29 missing-local cases.
5. **P1 — demo the five stateful paths.** They show meaningful safety and recoverability without relying on model eloquence.
6. **P2 — defer large capability work.** Do not promise PFL, ASIO, reliable browser routing, autonomous voice GO or broad audio generation before the critical evidence/state defects are closed.

## Verification

- Five stateful conversations: 5/5, 150 turns.
- Current Gauntlet: 164 turns; 17 contract pass, 29 guard pass, 118 local gap, 0 fail.
- Full offline suite: 774 tests passed, 0 failed.
- Ledger before/after full suite: Meta 368 / 368.
- No merge, branch switch, ledger reset, paid request or GO/STOP modification.

## Follow-up improvement phase — 1 November 2026

This follow-up stayed completely offline and addressed bounded, high-frequency operator questions rather than adding large capabilities.

### Defects reproduced and fixed

1. Readiness and unresolved-audio questions fell through to `NEEDS_AI`, even though the project already contained enough deterministic evidence.
2. “Why can’t this cue play?” returned a bare clarification when no cue was selected instead of explaining the observable blockers and requesting a selection.
3. Stale-plan and authorization questions lacked a precise explanation of snapshot rejection and the limits of available commit history.
4. Pending/blocked/omitted/complete states were conflated or unavailable. The assistant now reports only stored evidence, marks `omitted` as `NOT_REPRESENTED`, and never treats locally resolved audio as proof of completion.
5. The broad `No…` cancellation rule misread safety instructions such as “No confundas omitido con terminado” as task cancellation. Explicit cancellation remains supported; safety constraints now receive an acknowledgement.
6. Spanish questions could receive the English fallback. ES/EN detection was expanded for the bounded read-only intents.

All responses remain operation-free. They do not audition audio, certify live readiness, execute transport, apply a plan or infer unseen L# lines.

### New evidence

| Check | Result |
| --- | --- |
| Focused regressions | 34/34 pass |
| Complete Node suite | 783/783 pass |
| Gauntlet v2 | 164 turns: 28 contract pass, 29 guard pass, 107 local gap, 0 fail |
| Recorded semantic review | 27 pass, 0 fail, 1 deliberately pending review |
| Stateful conversations | 5/5, 150 turns |
| Cue QA | Evaluator completed; illustrative fixture F1 66.7%, not Muse accuracy |
| Seminar contract | 9 scripts, 13 windows, 49 annotated events |
| Paid requests | 0 |

Compared with the original baseline, locally handled turns increased from 39/164 to 57/164 and `LOCAL_GAP` fell from 125 to 107. This is a functional-coverage improvement, not a measurement of Muse accuracy. The remaining semantic-review item (`marathon-44-21`) is intentionally not promoted merely because its contract is valid.

### Ledger and checkout integrity

- Ledger SHA-256 before and after QA: `31d05e07875d70dc2d865b867ed85a60eb4981c8cecb025aa8229f85e3e72db7`.
- Preserved total: 399 historical/current entries, USD 53.403789; Meta count 368.
- Branch remained `feat/runq-ai-campaign-100-2026-10-31` at HEAD `5fdb4d1b5cd3f4fd5ca65771ca822b18d1731ad1`.
- No merge, branch switch, ledger write, paid request or GO/STOP modification.

### Remaining limits

- The ten historical Muse responses remain semantically unrateable because their content was not retained.
- 107 Gauntlet turns still require AI reasoning, legitimate clarification or unimplemented product capability.
- Local readiness checks cannot replace speaker audition, operator approval, hardware validation or STOP ALL rehearsal.
- Stateful evidence validates the local state machine, not long-context Muse memory.
