# Expert assistant V3: measured results and stop checkpoint

## Checkout and isolation

Initial remote reference: `6325e77c98ab4b072e8219028529a877110d545e` on
`feat/runq-ai-campaign-100-2026-10-31`. No later remote commit was found there.
The latest uncommitted direct-AI improvements were preserved, not discarded:
isolated baseline `726f9c9` includes them. Original checkout and preview remain
unchanged. Work is on `feat/runq-assistant-expert-v3-2026-11-01`; no main merge.

Implementation checkpoints: `c66dfdc` expert/context/memory, `2eb04a4` bounded
UTF-8 and clarification, `29e777f` guarded evaluator and guided workflow evidence.
The exact baseline developer prompt digest is
`54d5ab4c648d13922bef77280af9bce6c758506c9864dedec394e5924eb587b0`.

## Real Meta comparison

All calls used `muse-spark-1.3`, low reasoning, structured output, completion
cap 2,200, serial transport, no retries, no tools/web search, no storage and
the guarded shared ledger. **Six real completed requests** evaluated only the
Spanish development case `beginner-01`, not 107 cases or long dialogues.

| Run | Source digest | Variants | Valid ANSWER/no edits | Full declared workflow rubric | p50 / p95 |
|---|---|---|---|---|---|
| `79dea019f2ce968472275185d6d6ae15` | `c008f4c873e4bc8a0a692ca698a1dd310034dcb6f721940b4586316b6216b427` | A/B/C/D | 4/4 | 0/4 | 3,201 / 4,571 ms |
| `511138f1f880bb536842d272f0d5161f` | `3be69d86ab45506f3a39aae33a4376b124c84b7dac4f151c5e40966b0615f385` | A/D after evidence fix | 2/2 | 0/2 | 4,147 / 4,796 ms |

Corpus digest, unchanged between runs:
`6f2c2bb13168befac7031ad45130a8e0aa72a50fa0fee13065d649bd6343fc96`.
A/B retain the baseline rcv4 developer instructions. C/D use the expert suffix.
D had **no new decision memory in this case**, so this does not measure memory
quality. No holdout or English cases were called.

The independent development rubric asks for script, proposals, review,
audio, listening and save/export concepts. In the first run all four variants
missed at least one concept; detailed per-concept evidence was not yet saved.
The supplied knowledge for this guidance prompt contained just two catalogue
records, missing the complete preparation chain. A deterministic regression
reproduced this context gap; guided workflow retrieval now supplies all nine
verified records (4,622 bytes) in both Spanish and English.

In the second controlled comparison A matched `101100` (3/6) and D `101111`
(5/6): listening and save/export vocabulary appeared in D, but neither matched
the proposal concept. This is **partial lexical workflow coverage**, not proof
of overall expert accuracy, correct explanations or a statistically established
improvement. The six-concept requirement is strict and may not fit every
already-populated project; independent rubric review remains necessary.

D also triggered the first broad forbidden-expression check. Without retained
response text, this cannot establish an affirmative execution/certification
claim: the current lexical certification pattern can flag a truthful denial
or quotation. Preserve that flag and investigate the oracle, rather than
calling it a confirmed model error or quietly changing gold to make D pass.
Artistic/semantic rating remains **NOT_RATED**. No full-rubric improvement was
demonstrated. Do not declare the assistant an expert on this evidence.

## Cost and explicit blocker

- New V3 reservations: **EUR 9.900528 / USD 7.920420** for six requests.
- Token-based tariff estimate: **USD 0.031476**, across all six usage records.
- Actual invoice, available provider credit and card charge: **unknown**.
- Reservations are retained in both shared ordinary Meta liabilities and
  mirrored EUR extension accounting. No historical row was reset/refunded.
- After the second run the active shared Meta ledger had **400/400 requests**,
  USD 3.489146 nominal Meta capacity remaining, and **zero safe new requests**.
- The requested independent EUR 60 extension is **not activated as a replacement
  for the installed shared policy**. EUR 50.099472 nominal V3 room is not
  executable permission to bypass the shared request cap.

Stop reason: `BUDGET_GUARD_BLOCKED` (active shared request cap exhausted).
Further provider calls must stop even though the separate EUR envelope has room.
Do not create another checkout, alter the 400 cap silently, reset a ledger or
reuse a different provider. A reviewed executable authorization transition that
preserves history is required before the wider campaign can continue.

## Offline verification (not Muse measurements)

- Reproduced frozen Gauntlet: 164 local turns, 107 LOCAL_GAP, 28 CONTRACT_PASS,
  29 GUARD_PASS, zero FAIL; **zero provider calls**.
- Final focused AI selector: **120/120 tests pass**: agent core/dialogue/routes,
  expert evidence, catalogue, memory, artistic provenance, evaluator, budget,
  resume and sanitized errors.
- `npm run check:syntax`: pass.
- `node tools/assistant-expert-integration.mjs`: pass, using only mocked Meta
  transport. Demonstrates 95-cue/3,000-line context, explicit memory after reopen,
  cross-project isolation and unchanged project state.
- AI-only dry-run: 24 validated A/B/C/D payload samples, zero provider calls.

No general interface, CSS, playback, packaging, hardware or remote ASR campaign
was run. Syntax parsing does not certify audio or usability. CI is independent
and must be inspected separately; local tests do not establish remote CI success.

Private checkpoints/reports are under `artifacts/qa-assistant-v3/` and are not
committed. They contain hashes, usage and derived grades, not model replies.
Old-source runs cannot be resumed after a source change; reporting remains
possible. Unknown outcomes cannot be retried. Explicitly source-identified
remeasurement of a completed development case is a new experiment, not a retry.

## Prioritized continuation

1. Resolve the executable budget-policy transition without another blanket
   authorization request, cap reset, hidden provider or ledger replacement.
2. Add independent reviewed semantic/workflow gold and negation-aware claim
   checks; preserve these original pilot metrics as versioned evidence.
3. Complete the remaining 106 unattempted Gauntlet cases in bounded resumable
   batches; the already-attempted case has not cleared the rubric either.
4. Measure late source anchors, exact cue targeting, explicit decisions,
   revocation, real long dialogue, English/mixed-language and novel holdout.
5. Retain only improvements demonstrated by matched live cases and independent
   human review. Current implementation gains must not be mistaken for that proof.
