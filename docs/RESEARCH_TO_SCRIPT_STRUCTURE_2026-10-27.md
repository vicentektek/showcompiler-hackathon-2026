# Evidence-informed dramatic structure: first bounded implementation

Date: 2026-10-27. Scope: source annotation for **Meta script analysis only**, not an AI quality or real-show acceptance claim.

## Research inputs (public academic sources)

1. Schneider & Ruiz Fabo (2024), *Stage Direction Classification in French Theater: Transfer Learning Experiments*, ACL LaTeCH-CLfL, DOI 10.18653/v1/2024.latechclfl-1.28. They evaluate a 13-type **literary** stage-direction taxonomy on French theatrical corpora. It is not a validated audio-cue classifier. Do not treat classes such as music, object or movement as instructions to play audio.
2. Debaene & Hoste (2025), *Classifying TEI Encoding for DutchDraCor with Transformer Models*, ACL LAW, DOI 10.18653/v1/2025.law-1.11. Their reported macro-F1 increase 0.717 to 0.923 concerns structural annotations in Dutch drama under their experimental setting, **not** RunQ cue precision.
3. TEI Consortium, *P5 Performance Texts*, 2026: describes acts/scenes, spoken text, speakers, stage directions, technical notes, sound and props. These distinctions motivate metadata, not a wholesale dependency on TEI markup.
4. Norrthon (2023), *Cueing in Theatre: Timing and Temporal Variance in Rehearsals of Scene Transitions*, Human Studies, DOI 10.1007/s10746-023-09672-8. The operator/rehearsal must confirm exact cues. Dramaturgical information must not control GO.
5. Naeem et al. (2026), *ThetreStageAI: Multi-View Retrieval-Augmented Generation for Structured Bengali Theatre Production Planning*, arXiv:2610.23618. Its scene/blocking/lighting views motivate **future** retrieval separation; it does not demonstrate sound-cue recall for Spanish plays.

## What is now implemented

- `src/core/dramaticStructure.mjs` is an original, **deterministic**, read-only annotation of plain-text line roles. It distinguishes bracketed one-scene headers, scene headings, technical notes, running-order rows, cast entries, dialogue with an inline speaker and, importantly, speakers printed **alone on their own lines** followed by parenthesized stage directions and dialogue.
- Original source lines/IDs remain authoritative. All ambiguous text is left unmarked, rather than creating audio events from acoustic keywords.
- The bounded Meta request now attaches `role` and `speaker` to each existing line record; its output remains the same strict cue-proposal schema and operator-approval workflow. This does **not** add a paid request or expand allowed window count/audio metadata.
- Source-specific semantics, including whether to play a sound versus use a stage prop, still require model interpretation and operator review.
- Focused offline tests use original short synthetic Spanish drama, a gala rundown, French dialogue and direct Meta request-payload checks. No source text from uploaded private scripts is committed.

## Why this is only a first step

- The cited 13-category stage-direction typology is **not yet implemented as a trained classifier**; naive regex categories should not masquerade as learned predictions.
- A `SPEAKER_LABEL` is contextual metadata and does not authorize creating a cue.
- Existing cue PLAY/CONTINUE/STOP relationship analysis in another PR remains unmerged; the current update does not rewrite `projectPersistence` or `browserAudio`.
- A multi-window scene still needs cross-window narrative state; this increment adds explicit local line structure, not a reliable global sound-state tracker.
- There is no measured improvement in the number or correctness of Muse Spark suggestions. The next gate is an A/B experiment with a human-reviewed gold set: baseline versus genre/document profiles versus these structural hints versus richer scene context. Report precision, recall, explicit/optional split, duplicate rate, correct stop target, latency and API cost; no score inflation by counting weak creative ideas.

## Operative decision

Keep analysis and show control separated. No automatic GO, no new external requests, no unreviewed physical-output commands, no schema persistence changes. Integrate the previously developed stage-event planner after a conflict-aware code review, not by blindly merging cross-base branches.

Published documentation:
- https://aclanthology.org/2024.latechclfl-1.28/
- https://aclanthology.org/2025.law-1.11/
- https://www.tei-c.org/release/doc/tei-p5-doc/en/html/DR.html
- https://link.springer.com/article/10.1007/s10746-023-09672-8
- https://arxiv.org/abs/2610.23618
