# Intelligence failure backlog

## Reproduced and corrected

| ID | Root cause | Correction | Reproducible evidence |
|---|---|---|---|
| V3-01 | Remote assistant rejects any project beyond 80 cues and only sees a first script window | Targeted stable cue IDs and source ranking; bounded pages | 95-cue/3,000-line fixture retrieves cue 95 / L2800; dedicated AI request integration |
| V3-02 | Product functions not provided as verified runtime knowledge | Bilingual capability catalogue with wired source/test references, replaced server-side | Catalogue evidence tests and forged-capability route test |
| V3-03 | Recent chat is lost across reopen; default show ID cannot safely identify different projects | Confirmed local decision/task memory keyed by ID/name/original-script identity and revision | Reopen integration plus same-ID/different-project isolation |
| V3-04 | Selected cue, prepared GO and active sound instances absent/distorted in model context | Separate read-only runtime fields | Context/state integration; no transport changes |
| V3-05 | Scene requests risk selecting the first page rather than the requested last scene | Existing scene planner feeds metadata-directed retrieval | Red missing-scene test followed by green S3 / last-scene test |
| V3-06 | Character-count context limits can exceed HTTP bytes for bilingual/non-ASCII text | UTF-8 budget, essential anchor protection, recent-history compaction | Non-ASCII source regression; request remains bounded |
| V3-07 | Model can invent Lxx references in advice | Expert output evidence guard; missing-reference clarification allowed explicitly | L9999 advice rejected; unavailable-line CLARIFY accepted |
| V3-08 | Proposal or undone work can be mistaken for a confirmed applied decision | PENDING/APPROVED/APPLIED/REVOKED states and revision revalidation | Memory tests plus Apply/Undo/cancel wiring |
| EVAL-01 | Evaluator expected ANSWER even for original P plan cases | Preserve original A/P/C intent | Corrected pending case loader |
| EVAL-02 | Input catalogue availability could force baseline to lose despite a correct answer | Separate evidence availability from scored output | Equal deterministic response rubric for A/B/C/D |
| EVAL-03 | Source fixture always puts requested door at L2, hiding long-script retrieval defects | Move target near final cue/source anchor | A misses late evidence; C retrieves exact source |
| EVAL-04 | Empty usage or no cited source could look like zero-cost/exact-source success | Unknown cost remains null; only explicit required source counts | Runner summary tests |

## Not yet demonstrated

- Six guarded live requests on one development case were completed; none cleared
  the full workflow rubric. The active shared request cap now blocks continuation.
- Detailed semantic Muse before/after quality and statistical improvement.
- Expert consistency across all 107 pending Gauntlet cases with independent gold.
- Real 20/30/50-turn conversations, not synthetic replay positions.
- General semantic quality beyond the exact declared rubric and independent review.
- Comprehensive task contradiction resolution; explicit decision revocation works,
  but arbitrary natural-language preference replacement may need clarification.
- Memory portability between browsers, cloud synchronization and project rename.
- Automatic multi-page read-only tool loops for huge scene-wide operations.
- Provider tariff/tokenizer bound refinement to safely permit more than the
  conservative full-window reservations; no lower reserve without evidence.

Holdout findings must remain separate from prompt optimization. A model/schema
failure stops safely and does not authorize automatic retries or transport.

## First live development finding

The exact Spanish beginner workflow question retrieved only import/export and
script references, excluding proposal review and listening from the supplied
catalogue. Red/green retrieval tests corrected this for the same Spanish and
English guidance queries without changing prompt instructions or source gold.
The A/D remeasurement showed partial concept coverage (3/6 versus 5/6) but
**zero full-rubric passes**. This does not establish the context gap as the sole
cause of the model omission.

The broad certification lexical oracle may confuse an affirmative claim with
a denial/quotation. Its D flag is inconclusive without independently reviewed
reply evidence. Do not suppress that recorded flag or describe it as a proven
unsafe execution. See [measured comparison](BASELINE_VS_IMPROVED.md).
