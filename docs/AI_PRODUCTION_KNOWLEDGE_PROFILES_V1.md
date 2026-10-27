# RunQ — Performing-arts document knowledge profiles (V1)

Date: 2026-10-27. Implementation scope: Meta text analysis / operator review. No added playback behavior.

## Why this exists

A dramatic text, musical libretto, corporate rundown, technical script, calling book, cue sheet, annotated score and setlist are **not interchangeable**. Words such as "entry", "GO", "music", "video", "play", and "hold" have distinct meanings depending on department and source document. Generating more audio clips from the same generic prompt is not adequate.

## Implemented

- Small, curated, controlled knowledge module: `src/core/performanceKnowledge.mjs` (no external documents downloaded during analysis).
- Two independent operator-selectable dimensions: **kind of show** and **kind of source document**. The UI defaults to **auto** and allows explicit override.
- Performance profiles: play, musical theatre, dance, opera, gala, concert/festival, circus/variety, corporate.
- Document profiles: dramatic script, libretto, running order (escaleta), technical script, stage-manager calling script (regiduría), cue sheet, musical score/textual annotations, setlist, other.
- Explicit cross-sector invariants: a warning/standby is not a GO; a live sung/instrumental song is not necessarily a prerecorded asset; prop sound is not necessarily an audio cue; LX/video cues do not justify an audio PLAY; estimated running-order timings are not deterministic triggering times.
- The selected profile is supplied to Meta's single bounded Chat Completions request as high-priority interpretation guidance, with controlled metadata in the user payload. No extra inference call and no runtime dependencies.
- All profiles remain transient analysis metadata; original scripts and existing show JSON stay unchanged.
- `auto` gives the model neutral inference guidance. **The chosen/inferred document type is not yet returned as an auditable classifier output.** For a mixed, tabular or unusual document, selecting its type explicitly is recommended.
- This is an **interpretation aid**, not knowledge added to permanent model weights, and is not proof of improved recall. The model can still misunderstand a script.

## Implementation boundaries and security

- Every Meta request is manually confirmed and potentially billable; one request per confirmation, no automatic retries.
- Strict proposal schema remains CueSuggestionV2, limited to 8 items per request with checked L# source evidence.
- Only validated PLAY suggestions enter review; STOP/CONTINUE/SILENCE remain observations without an executable transport compiler.
- No auto-GO, speech following, score parsing of image-based notation, hardware routing, or audio generation is introduced.
- Baseten's earlier fallback adapter retains its own simpler model contract and does not yet use these new first-party Meta profiles.
- User source text is untrusted; it must not override the professional instructions, and the server rejects unknown profile identifiers.

## Next controlled stages

1. Add an **auditable first-pass document/genre classifier** that reports label, evidence, confidence/unknown and operator override before cue analysis, rather than pretending text-only automatic inference is reliable.
2. Extract line roles (speaker, stage direction, segment, department, timing) into an intermediate document model without overwriting original lines. Integrate the previous isolated PR #26 after a branch-aware merge review, not a blind copy.
3. Add purpose-specific parsers: running-order rows, cue numbers, dramaturgical stage directions and manually marked musical cues.
4. Separate scene-event detection from cue planning and sound asset binding. Add source-mode and target sound identity review before STOP/FADE is compiled.
5. Expand the human-reviewed gold set with diverse *original or rights-cleared* examples: two-column rundown, a musical number with live orchestra, a stage-management calling book with standby and GO, existing cue sheet, a literal theatre script and a soundless physical stage action.
6. Compare exact-line precision/recall, false cues, missed cues, transport intent, target identity, operator edit rate and total latency under fixed provider/model/JSON schema settings. No fabricated Muse accuracy percentages.
7. Test one authorized paid request on the user's own test script only after UI/core tests pass and a spending decision is made. Never store a secret in the repo.

## User-visible QA checklist

Select `Teatro de texto` + `Guion de obra teatral` for a prose play and `Gala` + `Escaleta` for a running order. Confirm that the selected type is present in the bounded request's local mock, an activity indicator is visible, each request is explicitly confirmed, and approved cues/audio never start without manual GO.

This PR is stacked on the creative progress branch; merging directly into main bypasses prior unmerged work.