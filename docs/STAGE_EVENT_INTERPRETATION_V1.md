# Stage interpretation core — first implementation increment

Date: 27 October 2026. Scope: offline, non-executable analysis metadata. No public-release or live-safety claim.

## Implemented

- 'src/core/scriptStructure.mjs': preserves source 'L#' locations and conservatively classifies scene headings, marked dialogue/speaker, bracketed stage directions, technical directions, blanks and unmarked prose. No acoustic keyword list is used to create sound.
- 'src/core/stageEventPlan.mjs': takes human-authored or validated model events, checks exact source line/evidence, places them in source order and models PLAY/CONTINUE/STOP/SILENCE without executing anything. Repeated sound relationships require **explicit operator identity**; neither identical labels nor a unique active sound is enough to silently choose a STOP target.
- Meta analysis now sends bounded 'role' and 'speaker' hints beside each source line. Its existing strict CueSuggestionV2 output is unchanged. After validation, the server-side model adapter generates a transient stage-event plan in addition to the existing pending PLAY proposals.
- No new permissions, dependencies, automatic GO, external calls, data persistence or audio transport changes.

## Concrete example

A script containing a telephone ring, later "the ringing continues", and finally "the ringing stops" is represented as:

1. PLAY, source L2, sound identity 'phone' (identity supplied by operator, not inferred)
2. CONTINUE, source L4, linked to the L2 event, non-executable
3. STOP, source L7, linked to the L2 event, non-executable until a reviewed cue compiler exists

A remembered thunderstorm in character dialogue is not created as an event by the structural classifier; the model is separately instructed not to infer sounds from mere dialogue mentions. A physical stage-door slam still requires review to determine whether it needs a prerecorded audio file.

## Explicit boundaries

- The new planner returns in-memory candidates; the browser API currently forwards only the existing sanitized proposal/observation fields. No new stage-event view or executable STOP cue exists yet.
- The model may still hallucinate a semantically unsupported but text-matching suggestion. Syntax + exact evidence validation alone cannot establish theatrical truth.
- Stable 'L#' across **rewrites** is not solved; this increment preserves unchanged-source IDs only. Later revisions require diff-based identity mapping and operator confirmation.
- Source types LIVE_PERFORMER / PRACTICAL / SET_PROP / RECORDED are operator-confirmed bindings, not model predictions.
- The stage-event plan is never persisted in schema-v1, and does not modify accepted operator cues.
- Full scripts may include unmarked dialogue, split stage directions, tables or numbers; these remain unmarked instead of being classified with false certainty.

## Follow-up steps, separately gated

1. Add dedicated per-intent and target-link **offline scoring** using the existing rights-clear gold corpus. Do not record invented model accuracy metrics.
2. Extend the model DTO in a schema-versioned way to include acoustic identity candidates, source-mode candidates and dramaturgical trigger types; validate independently. Confirm current official Meta JSON Schema compatibility before sending live requests.
3. Add operator review UI for source mode and identity links; keep STOP/FADE proposals non-executable until reviewed, serialized and routed through the single safe transport owner.
4. Resolve revised line identities, and support running-order/beat-sheet imports in a separate module.
5. Run one explicitly authorized, bounded live inference only after provider terms, credentials and cost are confirmed. Real QA on speaker/headphone output is a separate acceptance gate.

## Offline verification

Node >=20:

    node --test test/scriptStructure.test.mjs test/stageEventPlan.test.mjs
    npm run check:syntax
    npm test

These commands do not connect to Meta or Baseten. Treat GitHub CI evidence separately from real-model performance.
