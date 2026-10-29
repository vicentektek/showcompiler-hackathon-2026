# RUNQ · Sound Lab · Spanish description → reviewed English SFX prompt

**Date:** 29 October 2026 · **Implementation:** PR #117, based on the English-first UX PR #116. No live provider calls made as part of implementation or CI.

## User evidence and decision

The operator reported materially better sound-effect results from **their own English translations** than from their Spanish descriptions. This is a qualitative finding, not a blinded quantified A/B. Stable Audio Small-SFX can be kept as baseline while improving the upstream caption quality. Do not switch checkpoint or increase sampling steps merely because output is inconsistent.

**Default UX remains simple:** description → Generate sound → Listen → Use sound. No visible seed/history/model selector.

### Exact behavior

| User action | Actual behavior | Provider/cost |
|---|---|---|
| Types a clear English effect and selects Generate sound | One existing Modal cost confirmation, then the same generator | 0 Meta calls; 1 authorized Modal call |
| Types recognizably Spanish effect, selects Generate sound | Explicit prompt-consultation consent for Meta; prepares English acoustic draft | 1 Meta text request that may cost; **0 Modal calls** |
| Edits/reviews the English draft, selects Generate sound again | Separate existing cost confirmation; Modal receives edited **English**, original Spanish remains visible | 1 authorized Modal call; no second Meta call |
| Changes original description, kind or duration | Invalidates old English draft; requires a fresh authorized translation | 0 automatic requests |
| Meta responds CLARIFY / invalid schema / timeout / error | Explain failure, preserve Spanish, do **not** submit Modal | 0 Modal calls; Meta request may already be billable |
| Enters English from start / types a revised English description directly | Skip Meta, submit to Modal only after the existing cost confirmation | 0 Meta calls |
| Try another version of an already reviewed effect | Reuse the approved translated draft and change seed; each new Modal generation requires consent | No extra Meta request |
| User opens Stage, rehearses or presses GO | No model request, no translation, no audio generation | 0 |

### Components

- `tools/sfxPromptRoutes.mjs` — server-side loopback route `GET /api/sfx/prompt/status`, `POST /api/sfx/prompt/suggest`; Meta Muse Spark 1.3 via Model API, private key remains server-side. Same-origin, explicit `X-RunQ-Prompt-Consent: yes`, strict structured result, 25s timeout, single in-flight, no retries, no hidden Modal call.
- `src/sfx/englishDraft.mjs` — conservative Spanish detection, immutable draft tied to the original prompt + category + duration. Never silently mutates the source.
- `src/sfx/lab.mjs` — the original free-text field stays; on first Generate with Spanish request, one explicit Meta confirmation and an editable English proposal; second Generate requires ordinary Modal confirmation. Every revised input invalidates the approved draft.
- `index.html` / `src/sfx/lab.css` — one contextual English review textarea, hidden until needed. QA-only seed, WAV fixtures, raw history remain hidden in normal user mode.
- `test/sfxEnglishPrompt.test.mjs` and `tools/sfx-one-step-browser-e2e.mjs` — unit+HTTP+Chrome simulated flows without provider network/billing.

### Security and limitations

1. Model output is advice, **not proof** of semantic accuracy: a generated caption must be reviewed to catch invented sources/actions. Validation rejects malformed, non-English, HTML-like and extra-field responses, but cannot validate semantic faithfulness automatically.
2. No language detector is perfect; the heuristic intentionally avoids guessing on unclear short descriptions. Users can write English directly. Other languages need later opt-in detection.
3. There is currently no authenticated user-specific Meta text-inference balance/price quote displayed inside Sound Lab. Therefore Meta requests require **separate opt-in confirmation warning of possible charges** and the existing provider/account billing protections; the workflow is NOT a guarantee of zero spend or a hard provider-billing cap.
4. Text edits must never change GO, STOP, prepared NEXT, source L# or the active show. SFX still uses Modal's existing reservations and no-repeat idempotency journal.
5. When an earlier request is RUNNING / SUBMISSION_UNKNOWN, the generator remains blocked safely; use **Previous sounds**, not a journal reset.
6. Human/manual verification still required on Windows with actual Meta credentials and Modal deployment. Existing CI only mocks providers.
7. Preserve English UI default, Spanish available; source language of prompt is independent of product locale. Browser `?sfxqa=1` on loopback explicitly exposes developer fixtures only.

## Quality evaluation for 30 Oct

Use frozen original Spanish sounds and expected semantic English interpretations in `docs/CODEX_AI_QA_TOMORROW_2026-10-30.md`. First run deterministic schema/interaction checks. Later only with explicit credit approval, measure 6 ES prompts → English drafts (semantic score 0–5, invented events 0–5) and 2–3 pairs of real Modal effects holding seed/duration/revision constant. Score faithful events, no extras, onset/decay and stage cue suitability. Document failed/clarify cases and API latency. **Never present model mocks as acoustic evidence.**

## Product acceptance

- English input: single Modal approval, no Meta text consultation.
- Spanish input: one explicit Meta draft consultation, editable English visibly, no Modal request before second approval.
- Generated original WAV can be played and added to project library in one click after audition, without GO.
- Both EN/ES application UI modes work; no QA technical settings in normal workspace.
- Back-to-back generations keep previous takes recoverable; cap USD still enforced.
