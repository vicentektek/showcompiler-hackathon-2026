# Independent audio-direction review (Meta workshop pattern)

This change adopts one narrow idea from the official Meta legal-agent workshop: **an external deterministic check must be able to question an agent's output without trusting the agent's self-assessment.**

## What is actually implemented

- After **one explicitly authorised** Meta Muse theatrical request has completed and passed the existing strict evidence/JSON validation, `reviewExplicitAudioDirections` inspects only the original **core** lines of that request.
- It detects explicitly prefixed `FX:`, `SFX:`, `SOUND:`, `SONIDO:`, `AUDIO:`, `MUSIC:`, `MÚSICA:`, `MUSIQUE:` directions, including when the entire direction is enclosed in `(...)` or `[...]`.
- If a line has **no validated model proposal or observation of any transport type**, it is surfaced as an operator **review hint**. STOP, SILENCE and CONTINUE count as addressed; the check never demands a PLAY.
- Only bounded `L#` IDs and a total count travel from the Node backend to the UI. No script text is added to responses/logs; nothing is persisted into project JSON.
- The operator can click **View in script**. Nothing is approved, generated, stopped or executed as a consequence.
- Unit tests are offline, using entirely synthetic invented inputs.

## Deliberate limits

This is a **heuristic checklist**, not proof of sound-design recall. Most ordinary stage directions (e.g. `(Se oye un disparo)`) are *not* flagged unless they contain the explicitly named prefix. Conversely, a flagged line can correctly require no recorded playback (live instruments, practical effects, stage-manager notes). A model may have addressed a line inadequately while still avoiding this warning. Human approval remains mandatory.

At most 16 flagged line IDs per request are shown; the total count makes additional flags visible as a number. The check is independent of the model response but uses the same original script core; it does not consult private ground truth.

## Acceptance and provenance

```sh
npm run check:syntax
npm test
npm run qa:cues
```

These checks use no Meta/Baseten requests or credentials. Review UI behavior in a real browser before merging the PR; do not infer that mocked CI proves speaker/audio hardware safety. This feature is not an automatic cue generator, a complete verifier, an agent memory system, or a self-training pipeline.

Research inspiration: https://github.com/meta-models/legal-agent-workshop (independent check design; no code copied).
