# AI-only evaluation matrix

## Priority and provenance

The exact previous Gauntlet baseline is reproduced: 164 turns, 107 LOCAL_GAP,
28 CONTRACT_PASS, 29 GUARD_PASS, zero FAIL. LOCAL_GAP is a limitation of the
local parser, not a measured Muse failure. All 107 IDs are imported before
supplementary cases and grouped by original journey, not scattered by language.
The original synthetic scripts and original dates are preserved.

The supplementary corpus has 15 scenario groups over six families: source
grounding, stable cue identity, capability boundaries, confirmed memory,
ambiguity and forbidden transport. It covers Spanish/English, script lengths
80/300/1,200/3,000 and configured conversation positions 2/8/20/30/50.
These positions are replayed synthetic recent-history fixtures, **not proof of
50 live Muse turns**. Mixed-language and many artistic/technical questions
are additionally present in the original Gauntlet. Further independently
reviewed mixed-language, changing-intent and real long dialogues remain needed.

## Controlled variants

| Variant | Knowledge | Retrieval | Confirmed memory |
|---|---|---|---|
| A | Frozen existing prompt/context | Existing first 80 cues/120 lines | Existing bounded recent dialogue |
| B | A plus verified capability data | Same A page | No new memory |
| C | B plus expert context guidance | Targeted cues/lines/scenes/diagnostics | No new memory |
| D | C | Same C | Project-scoped confirmed decisions where fixture requires |

Model, completion limit, structured output and low reasoning effort are matched.
C also adds expert instructions: this is explicitly **not** a pure retrieval-only
ablation. B/C/D are identical when the particular added evidence is irrelevant;
such cases must not be counted as independent improvements.

## Independent oracles and holdout

Splits are fixed by base scenario/journey. Spanish/English repetitions of a
family must not be moved between splits to manufacture novelty. The holdout
is available to the evaluator but not inspected to optimize prompts. The first
five development beginner gaps have manually authored source/workflow concept
checks; the rest without a detailed oracle remain STATUS_AND_SHAPE_ONLY.
Unrated cases do not become semantic success because the reply says ANSWER.

Exact source grounding uses a door line near the end of the script, not an
always-visible L2 proxy. Cue edits must target the exact stable ID and preserve
all non-requested fields through the existing validator. Catalogue availability
is diagnostic context coverage, **not a score requirement**: A can correctly
answer without receiving catalogue data.

Only real completed requests count as model evaluations. Reports separate
schema/target/source/workflow facts from NOT_RATED artistic/semantic quality.
No model is used to write its own gold or judge its own answers.

## AI-only verification commands

Run focused `node --test` selectors for agent core/dialogue/expert context,
capabilities, expert routes, budget/evaluator/runner and sanitized AI errors.
`node tools/assistant-expert-integration.mjs` verifies only AI request context,
memory restoration, project isolation and unchanged project state with a mock.

Do not run general interface/CSS/playback/archive suites for this campaign.
Navigation used to expose the assistant in the dedicated integration is not a
general usability or hardware validation.

## Resumable selection

```
node tools/runq-assistant-v3.mjs plan
node tools/runq-assistant-v3.mjs baseline
node tools/runq-assistant-v3.mjs ai-offline --split development
```

Paid commands require a proven guard, explicit flags and bounded 4/8/12 calls.
An explicitly selected `--variants A,D --limit 2` allows a small baseline/expert
remeasurement; it is not reported as a four-variant ablation.
`--start-case` selects a later case without re-submitting the first batch.
`--suite supplementary --family source-grounding` or `memory-confirmation`
selects an independent targeted experiment. `--split holdout` must not be used
for tuning. Resume refuses changed source/corpus/identity or unknown outcomes.

The 1,800 request count is a planning ceiling, not a result or spending duty.
Full-window liability reservations currently permit at most 36 new requests
within EUR 60; that cannot evaluate 107 cases in four variants (428 calls).
Do not silently loosen the reserve to achieve the target.
