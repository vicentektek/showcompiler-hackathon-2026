# RUNQ — Theatre QA corpus (50 works, Spanish + English)

This is a **candidate catalog**, not a suite of 200 passing tests.

## Files
- `works.json`: 50 plays by 50 distinct authors (25 ES / 25 EN). A URL is given only when a candidate direct-source link is known; other works need a verified edition.
- `case-templates.json`: four **uninstantiated** case templates per play: PARSE / CUES / TRIGGER / EDIT.

**No full plays are embedded. No exact line IDs, expected cues or human-reviewed gold exist yet. No AI requests have been run.**

## Instructions for Copilot / VS Code
1. Read `AGENTS.md`, `package.json`, and current QA scripts before changing anything.
2. Load `works.json` and select an edition for each play, saving bibliographic reference, translator, terms, URL, and a SHA-256 hash. `source_url: null` means discovery remains necessary. Verify all links before automated download.
3. Store source texts privately outside the public repo until licensing/edition checks are complete. Never auto-publish full third-party texts.
4. Normalize a copy to UTF-8 text preserving character headings, acts, scenes, stage directions and line number mapping. Use stable `Lxx` only after normalization.
5. Convert each template into a **distinct case**, filling `script_excerpt`, `line_ids`, `operator_instruction`, `expected_result` and exact expected project diff. Mark `gold_human_approved: true` **only after review by a human**.
6. Separate works/authors into development and holdout sets; do not reuse the same scene in both. Ensure diverse lengths, casts, stage directions, cue types and ambiguity patterns.
7. For evaluation, run existing RUNQ agent interfaces; save raw request, full raw response, provider/model, project before/after, exact diff, evidence links, latency, cost and error category for every case. Distinguish simulated and live results.
8. Run offline tests first. **Never send paid model calls or full scripts to third-party providers without explicit approval**.
9. Report per-function results, sample sizes and holdout results. Do not claim 200 executable tests or a precision percentage from this catalogue.
10. Do not merge this branch into main or overwrite the local `feature/voice-cue-editing` branch without reconciliation.

## Starting point
`fixtures/qa/theatre-50/works.json` → `fixtures/qa/theatre-50/case-templates.json`.

For extra metadata from the separate ZIP prepared in ChatGPT, compare its `obras_50.json` and `plantillas_200_casos.csv`. This GitHub branch contains a compact equivalent for Copilot, not the downloaded texts.

## Validation expectations
Check 50 distinct `id` values, 50 distinct authors, exactly 25 ES and 25 EN, and 200 unique template IDs. Verify no case with pending gold is silently counted as passing.
