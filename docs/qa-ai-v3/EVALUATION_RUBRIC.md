# Assistant V3 evaluation rubric

## Frozen design and cohort

The V2 local interpreter baseline is frozen in
`fixtures/qa/assistant-v3-baseline.json`: commit `726f9c9`, prompt version
`agent-expert-context-v3-1`, developer prompt SHA-256
`54d5ab4c648d13922bef77280af9bce6c758506c9864dedec394e5924eb587b0`, and a
separate developer/schema payload fingerprint,
164 turns, 107 `LOCAL_GAP`, 28 `CONTRACT_PASS`, 29 `GUARD_PASS`, zero `FAIL`.
`baseline` re-runs the offline V2 harness and fails if those values or the
prompt hash change. These measurements describe the local harness only; they
are not Muse results.
The exact 107 `LOCAL_GAP` turn IDs from that frozen run are imported into
`fixtures/qa/assistant-v3-baseline.json`, checked against a fresh offline
baseline reproduction, and scheduled before supplemental synthetic cases.
Each pending ID is paired A/B/C/D in that order. Their baseline `A`/`C`
expectations are deterministic structural checks only; every unreviewed answer
still remains `NOT_RATED`.

`fixtures/qa/assistant-v3-corpus.json` defines synthetic scenarios grouped by
scenario family into development, validation, and holdout. Generated scripts
are synthetic and cover 80/300/1,200/3,000 lines. Journey sizes cover 2/8/20/30/50
independent evaluation turns. The route's input history ceiling is respected:
at most four deterministic user/assistant pairs are supplied, never prior
model output. Supplemental cases use fixed synthetic pairs; imported baseline
gaps use the matching bounded local-interpreter transcript. Each
source/corpus/model/variant/policy combination has a stable hashed request
identity.

Variants are paired on the same case, prompt, output schema, model, and
completion limit:

| Variant | Context | Prompt mode |
|---|---|---|
| A | Original `buildAgentContext` | Frozen baseline (`expert:false`) |
| B | Original context plus retrieved, verified capability records | Frozen baseline (`expert:false`) |
| C | Dynamic `buildExpertAgentContext` plus retrieved capabilities | Expert additions enabled |
| D | C plus explicit, revision-scoped synthetic APPLIED project memory | Expert additions enabled |

Development/validation can be used to diagnose implementation changes. Holdout
is reserved for evaluation and must not be used to edit prompts, choose features,
or tune thresholds. No optimizer is implemented. `compare` only aggregates
completed, matched deterministic rubric facts and cannot nominate a winning
prompt.

## Deterministic evaluator

The evaluator does not ask a model to judge itself. It records only derived
facts:

- Reply decodes under the production JSON schema; status matches the fixture.
- Operations are absent when expected, or match the exact allowed operation,
  stable cue ID, and target label.
- Every cited `L#` exists in the exact context; the source-grounding case
  contains its expected line reference.
- Capability answers have a retrieved catalogue record, mention an
  import/export path and the original-audio prerequisite, and do not claim
  unsupported JSON/playback behavior.
- D may recall the exact synthetic APPLIED decision; A/B/C must not claim that
  unavailable memory.
- Explicit playback prompts do not produce operations or a claim that GO or
  playback already happened.

These are structural/synthetic contract facts, not complete semantic or
artistic judgments. Free-text outputs are used transiently to compute facts,
then discarded. Checkpoints/reports contain no raw response text, prompt,
script, user data, key, or authorization header.

## Ratings and interpretation

- `contractPass` means the deterministic synthetic oracle passed. It is not a
  semantic quality PASS.
- Imported baseline gaps whose oracle is status/shape only are explicitly
  marked `STATUS_AND_SHAPE_ONLY`; they cannot increment the full-oracle
  `contractPass` count.
- Semantic, artistic, theatrical, bilingual nuance, and actual Muse quality
  remain **`NOT_RATED`** until an independent human reviews output evidence.
- The fixture memory is an explicit test condition, not evidence that the
  product has stored or confirmed a real operator decision.
- No score establishes professional live-show certification, playback safety,
  reliable multichannel routing, or hardware integration.
- Failed/invalid/unknown paid attempts remain reserved. Usage-derived cost is
  a documented tariff estimate, not invoice reconciliation.

Offline verification command:

```
node tools/runq-assistant-v3.mjs ai-offline --split development --no-write
```

It validates fixture/context/payload construction only, sends zero provider
requests, and reports `modelQuality: NOT_MEASURED`.
