# Theatre sound-design evaluation — offline baseline

Status: experimental, no model calls or billing. **The example gold cases below are synthetic fixtures, not demonstrated Muse Spark results.**

## Baseline design rubric

The model must distinguish:
- **Explicit acoustic action:** stage directions such as “(Suena una campana)” are high-confidence cue opportunities.
- **Narrative mentions:** a character saying “recuerdo aquella tormenta” is not a request to sound thunder.
- **Continuous sound:** existing rain/ambience stays running; do not propose another GO merely because later dialogue says it continues.
- **Silence and stop:** these require transport intent; until the model output includes an approved STOP/FADE action, **do not invent a PLAY audio file** to represent silence.
- **Unbound audio:** if no asset matches the scene, provide `assetId:null` and precise `soundPrompt`; do not pick the only available audio blindly.

The current adapter adds these instructions but **has not yet been tested against live Meta inference**.

## Offline evaluator

`src/core/cueEvaluation.mjs` exports `evaluateCuePlacement({ scriptText, expectedLineIds, forbiddenLineIds, proposedLineIds })` for human-reviewed gold comparisons.

Calculates exact-line true positives, false positives, false negatives, specifically forbidden triggers, precision, recall and F1. Validates unique source references, rejects phantom lines and contradictions. Exact-line scoring is a deliberately strict baseline; a future `±1` location tolerance should **not** be adopted without explicit justification. The function does not infer which cues are objectively correct.

Run `npm test` for the six new synthetic cases. They test the scorer and rubric fixture definitions, **not model quality**.

## Runtime changes in this branch

- Increase Meta `max_completion_tokens` from 1200 to 4096; Meta reasoning tokens may count against this output budget. This may increase the **maximum possible bill** for an inference, though consumption depends on actual output. Measure before broad evaluation.
- Increase Meta default abort timeout from 25s to 45s. A timed-out request may have been processed and billed remotely, so do not retry automatically.
- Keep model ID `muse-spark-1.3`, JSON schema, prompt source boundaries, single-user confirmation and zero automatic retries unchanged.
- Keep Browser Audio, manual GO and existing v1 project JSON unchanged.

## Next acceptance gate

1. Run regression suite and syntax checks (CI).
2. With human authorization for an explicitly paid request, use a 3-line synthetic source and no audio assets. If a provider error occurs, classify HTTP and schema error separately; **no raw model content or API secrets in logs**.
3. Only after the minimal contract succeeds, compare the two prompt variants on the same locked test inputs. Record usage tokens, latency, model ID and exact match metrics. Do not choose based on a single anecdote.
4. Build a real, human-reviewed gold set from *La ciudad suena*, *Protocolo Aurora* and other original scripts: annotated line, sound kind, evidence, false-positive traps and ambiguity notes.
5. Integrate source-aware prompt quality and operator-edit feedback into the UI only after measured improvements.

## Safety and rights

Evaluation scripts are synthetic and freely authored for testing. No existing copyrighted play text was copied. No API credentials are stored. This PR does not generate WAV/MP3 audio and does not modify ASIO/WASAPI.
