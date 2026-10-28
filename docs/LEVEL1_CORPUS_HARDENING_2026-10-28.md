# RunQ — Level 1 corpus quality hardening

Date: 2026-10-28
Branch: feat/level1-corpus-hardening-2026-10-28 (isolated from PR #64, feat/level1-corpus-2026-10-28 @ 383e116)
Scope boundary: fixture corpus, its validator, review draft generator and regression tests only. No runtime transport, GO/STOP, provider, schema-vocabulary or project-JSON behaviour was touched. No provider call of any kind was made and every gold annotation keeps `PROVISIONAL_UNREVIEWED`; nothing here self-certifies operator sign-off.

All pre-change annotations remain recoverable in Git history (`383e116`); every wording change below is documented per case.

## 1. pastel-company — is STOP valid on the short one-shot boing?

**Determination.** STOP on a boing is semantically valid only if the gag was authored to keep sounding (the classic cartoon-spring wobble that repeats under the dialogue until it is cut in sync). A fully decayed one-shot sample can never receive a meaningful STOP, because there is nothing left to stop. The original script text ("reproducir el boing grabado de dibujos animados … cortar el boing grabado en seco") did not say the sound persisted, so the L8 STOP was a plausible but ambiguous reading.

**Clarifications applied (gold tuples L3 PLAY/FX and L8 STOP/FX unchanged).**

- Script L3: now reads "en vaivén repetido hasta nueva orden" (prepared repeating wobble).
- Script L8: "cortar en seco el vaivén del boing grabado, todavía sonando" (cut while still ringing).
- Gold justification for L3 now states that a vanished one-shot could not receive a stop, and for L8 that the wobble is still active when the real door slam lands.

## 2. marina-house — recorded thunder: sustained ambience or one-shot FX?

**Determination.** The annotation set (L2 PLAY AMBIENCE followed by L5 CONTINUE AMBIENCE on the same file) is only self-consistent if the thunder is a sustained recorded storm ambience with long rolling thunder, not a single distant boom. A one-shot boom could be PLAYed once but never CONTINUEd.

**Clarifications applied (gold tuples L2 PLAY/AMBIENCE, L5 CONTINUE/AMBIENCE, L9 PLAY/AMBIENCE, L11 STOP/VOICE, L14 PLAY/AMBIENCE unchanged).**

- Script L2: "reproducir el ambiente de tormenta grabado, con trueno largo rodante, volumen medio" (sustained rolling storm bed).
- Script L5: "mantener el mismo ambiente de tormenta grabado rodando bajo el diálogo".
- Gold justifications for L2/L5 now state the sustained-bed reading and explicitly deny the one-shot reading for CONTINUE.

## 3. keynote-rundown — existing cue kind for recorded video audio

**Determination.** The promo video's recorded production soundtrack stays classified with the **existing `FX` kind**, matching the established corpus convention where `FX` covers canned/produced media playback (canned stingers, gag samples). The schema already contains `FX, AMBIENCE, MUSIC, VOICE, SILENCE, TRANSITION`; no new category (e.g. "VIDEO") was added, and the alternatives are worse: `MUSIC` would claim music-only content, `VOICE` would claim narration-only content (the VO at L6 keeps that), and `AMBIENCE` is reserved for environmental beds. This may stay `FX` because the scored evidence is one playback of one pre-mixed canned media file; any artistic re-mapping is an operator decision after sign-off.

**Clarifications applied (script text untouched; gold tuples L2 PLAY/FX, L4 STOP/FX, L6 PLAY/VOICE unchanged).** Justifications for L2/L4 now record why `FX` was retained, that no new schema category exists, and that stopping the audio while the picture stays frozen is a deterministic audio STOP, not video engineering.

## 4. circo-cuchillos — SILENCE is an operator-reviewed proposal

**Determination.** The SILENCE cue at L5 is a *cue proposal recorded on the cue sheet*; in the live system it can only be realised by the human operator with the existing deterministic transport controls (per-cue STOP and the operator's STOP ALL / emergency cut). It never bypasses or automates live safety controls, and no annotation can execute anything.

**Clarifications applied.**

- Script L5 now says the order is "preparada y revisada, la dispara el operador y ninguna rutina automática se salta los mandos de seguridad".
- Gold justification for L5 states the operator-prepared/fired nature and that it neither auto-mutes nor cancels STOP ALL.
- For consistency, `monologo-farola` L9 (the other SILENCE event at level 1) received the same operator-reviewed semantics in its gold justification; its tuple is unchanged.

**Defect found and fixed while auditing this case.** The three opposing justifications for L6, L7 and L8 were rotated one step against the line they justify (L6 described the waiting band, L7 described the audience breathing, L8 described the official's prohibition). They are now aligned one-to-one with the actual L6 (spoken prohibition, not a transport order), L7 (live band waiting silent) and L8 (audience silent breathing) content. `forbiddenPlayLineIds` values were already correct and stay unchanged.

## 5. Qualification mismatch resolved

The curriculum level-1 gate (`fixtures/qa/curriculum-v1.json`) requires `EXACT_CASES = 10`, but only four cases carried `pool: "qualification"` (obertura-viva, glass-river-dance, keynote-rundown, monologo-farola). Six additional **original** qualification scenarios were written (new hackathon material, rights-clear, all `pool: "qualification"`, `tuningUse: false`):

| Case | Show type | Document kind | Language | Windows | Expected | Forbidden |
|---|---|---|---|---:|---:|---:|
| reloj-muerto | play | dramatic_script | es | 1 | 3 | 6 |
| barn-nap-puppets | children-theatre | cue_sheet | en | 1 | 4 | 5 |
| pizarra-comica | comedy | running_order | es | 1 | 3 | 4 |
| echo-ferry-choir | musical | libretto | en | 2 | 3 | 5 |
| patinaje-hielo-nocturno | dance | calling_script | es | 2 | 4 | 4 |
| sales-kickoff-hall | corporate | running_order | en | 1 | 4 | 3 |

The corpus now holds **16 cases: 10 reserved qualification cases + 6 development cases**. `tools/level1Corpus.mjs` now validates this exactly: the level gate is tied to 10 qualification cases (`Level gate must require exactly 10 exact qualification cases`), the manifest must hold 16 cases, and a dedicated regression test fails if any qualification case is demoted. Qualification isolation is unchanged and stronger: every qualification case must keep `tuningUse: false` (already enforced per case), is listed in the ledger above, and never feeds prompt optimization.

New totals: 16 scenarios / 23 scene windows / 169 script lines / 55 expected events / 81 forbidden PLAY lines / languages es×11, en×5 / pools {development: 6, qualification: 10}. Human review draft (`npm run qa:level1`, gitignored under `artifacts/level1-qa/`) now renders 16 operator sign-off blocks.

## Validation performed (all offline, no provider, no key access)

- `node --test test/level1Corpus.test.mjs` — 13/13 pass.
- `node --test test/*.test.mjs` (`npm test`) — 390/390 pass (full offline suite).
- `npm run check:syntax` — 0 failures (all checked modules, including `tools/level1Corpus.mjs`, `tools/level1-review.mjs`).
- `npm run qa:level1` — 16 scenarios / 23 windows / 55 expected / 81 forbidden; status PROVISIONAL_UNREVIEWED.
- `npm run qa:codex` — full offline gate pass (syntax + tests + cue-QA report + seminar contract + summary). Those outputs stay gitignored local artifacts and never claim Meta accuracy.

New/updated regression coverage: qualification pool reserve count, gate tied to qualification cases, verbatim traps for the clarified gags, updated totals and review-document pins, plus existing duplicate/source-reference/window-accounting rejection paths revalidated.

## Remaining blockers (not fixable by this change)

1. All 16 gold annotations remain `PROVISIONAL_UNREVIEWED` until a theatrical sound operator signs the generated review draft; paid model work must not start before that sign-off.
2. Deliberate silence semantics in the live app remain operator-driven by design; the corpus expresses this but cannot certify runtime behaviour (no audio was played during this task).
3. The six new scenarios are authored by a coding agent and therefore still need the same independent operator review as the original ten.
