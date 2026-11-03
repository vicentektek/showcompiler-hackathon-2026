# Theatre sound-design evaluation

Status: reproducible offline baseline using synthetic, rights-clear fixtures. It makes no model request and spends no API credit. Results from these fixtures test the scorer and contract; they are **not measured Muse Spark quality**.

## Evaluation rubric

- **Explicit acoustic action:** a stage direction such as “a bell rings” is a strong cue opportunity (`EXPLICIT`, normally `PLAY`).
- **Suggested atmosphere:** a location/time description may support a restrained creative ambience (`SUGGESTED`) but must not be reported as a script fact.
- **Narrative or dialogue mention:** remembering a storm, naming a radio, or discussing music is not evidence that the sound happens now.
- **Continuing ambience:** rain that continues is `CONTINUE`, not another PLAY/GO.
- **Silence and stop:** intentional silence is `SILENCE`; ending existing music is `STOP`. Neither creates a fake playable silence asset.
- **Unbound audio:** if no library item genuinely matches, use `assetId: null` and a precise nonempty `soundPrompt`.
- **Source fidelity:** line references must exist, evidence must come from that line, and the original language/text is authoritative.
- **Economy:** prefer fewer defensible cues; repeated ambience and decorative overproduction count against quality.

## Exact-line scorer

`src/core/cueEvaluation.mjs` exports:

```js
evaluateCuePlacement({
  scriptText,
  expectedLineIds,
  forbiddenLineIds,
  proposedLineIds,
})
```

Gold expected/forbidden references must be unique and present in the script. Proposed IDs must use valid `L#` syntax, but an ID outside the source is measured rather than causing the evaluator to abort.

Metrics:

- `truePositives`: expected lines proposed at least once;
- `falseNegatives`: expected lines not proposed;
- `falsePositives`: every emitted proposal that is not the first creditable match, including duplicates and phantom references;
- `forbiddenTriggers`: proposal occurrences on annotated negative lines;
- `hallucinatedReferences`: proposal occurrences whose `L#` is absent from the script;
- `duplicateProposals`: repeated proposal occurrences;
- `precision = TP / emitted proposals` (or 1 for an empty prediction against empty gold);
- `recall = TP / expected cues` (or 1 when gold has no expected cues);
- harmonic-mean `f1`.

Every duplicate consumes precision budget. This intentionally penalizes firing the same continuing ambience twice.

`evaluateCueFixtureSet(fixtures)` sums TP/FP/FN, forbidden, hallucinated, and duplicate counts across independent fixtures, then recomputes precision, recall, and F1 from the totals.

## Synthetic coverage

Automated fixtures include:

- Spanish explicit bell versus a remembered storm in dialogue;
- one rain start versus a later continuation;
- intentional silence with no invented asset;
- an explicit one-shot door slam;
- English suggested station atmosphere;
- French continuing ambience and a duplicate prediction;
- German silence;
- Portuguese phantom source reference.

They are original test text and contain no copied play. Run them with the complete suite:

```sh
npm test
```

## Scene/window coverage

`planScriptAnalysis` deterministically detects conservative multilingual headings, splits long scenes into 60-line core windows, and supplies up to three context lines on either side. Every line is a core member exactly once. Tests verify stable IDs, multilingual text, blank lines, long scenes, nonmutation, exact coverage, and detached output.

The live-analysis UI displays submitted line/window coverage. This metadata is transient and must not be mistaken for human validation of model quality.

## Human-reviewed model evaluation

After the one-request contract smoke succeeds, lock a rights-clear corpus and annotate:

- expected and forbidden exact lines;
- cue kind, explicit/suggested basis, and transport intent;
- exact evidence and ambiguity note;
- whether continuing sound should suppress a new cue;
- expected asset binding or required acoustic brief;
- prompt-quality rubric (0–5).

For each fixed model/prompt version record precision, recall, F1, forbidden triggers, hallucinations, duplicates, acoustic-brief score, latency, sanitized token usage, and operator approve/edit/reject rate. Approval is workflow feedback, not objective truth.

Use controlled ablations: change only one of prompt examples, reasoning effort, windowing, or design density at a time. Do not adopt ±1-line matching without a documented theatrical rationale; exact-line scoring is the current baseline.

## Acceptance threshold and honest status

Before a live demo claim:

- 100% technically valid DTOs and source/asset references;
- zero hallucinated source IDs after local validation;
- zero executable proposals for `CONTINUE`, `STOP`, or `SILENCE`;
- no unresolved cue able to GO;
- documented precision/recall on a locked human-reviewed corpus;
- a successful explicitly authorized Meta smoke request.

The final item is still pending. Current status is “offline evaluator and adapter tests pass,” not “Muse Spark quality proven.”
