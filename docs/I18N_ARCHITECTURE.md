# ShowCompiler internationalisation

Status: English-default and Spanish UI implemented in the hackathon repository. Automated tests verify catalog parity, placeholder parity, safe interpolation, project roundtrips, and model-language request boundaries. Interactive Chrome/Edge acceptance remains pending.

## Design decisions

1. **English is canonical and default.** The application starts in `en` independently of operating-system language. Spanish is selectable from the top bar. Repository documentation is maintained in English; source scripts keep their own languages.
2. **UI preference is not show data.** The selected locale is stored, when available, in browser `localStorage` under `showcompiler.ui.locale.v1`. It is absent from project JSON, so opening a show cannot force the recipient's interface language.
3. **The script is authoritative.** Switching locale never translates, normalizes, transliterates, or rewrites imported text. Stable `L1`, `L2`, … references continue to identify the original source lines.
4. **Analysis language is independent.** The Meta panel supports auto-detect, common EN/ES/FR/DE/PT hints, and a validated custom BCP47-style hint such as `ja`, `ar`, or `zh-Hans`. The hint is transient and does not enter project JSON.
5. **Model output follows the source.** Instructions request labels, acoustic briefs, and reasons in the relevant source language where feasible. `sourceEvidence` must be an exact substring of its unchanged line.
6. **Scene planning is language-preserving.** Conservative multilingual headings produce stable scene/window IDs, but all line text and IDs are copied from the deterministic parser. Context/core roles do not alter content.
7. **Transient metadata stays transient.** Coverage text, V2 cue details, non-PLAY observations, safe diagnostics, and next-batch state are localized UI state and are never persisted.
8. **Voice language is a separate future concern.** Speech-to-text, microphone cue tracking, and voice commands are not implemented; model-language hints do not guarantee equal quality across languages.

## Files

- `src/ui/locales/en.json` and `src/ui/locales/es.json`: **201 keys each**, with exact key and placeholder parity.
- `src/ui/i18n.mjs`: built-in catalogs, English fallback, safe placeholder interpolation into text properties, and guarded local storage.
- `index.html`: initial English text plus `data-i18n`, placeholder, and accessible-label keys.
- `src/ui/app.mjs`: dynamic statuses, review/workflow labels, scene coverage, consent, and safe error localization.
- `src/core/scriptLanguage.mjs`: transient language-hint validation.
- `src/core/script.mjs` and `src/core/sceneAnalysis.mjs`: exact source text/line IDs and language-neutral window planning.
- Meta/Baseten providers: receive a validated hint but do not translate the script.
- `test/i18n.test.mjs`, browser, provider, persistence, and scene-analysis tests: regression boundary.

There is no translation service or third-party i18n dependency. Catalogs and modules are served only by the allowlisted local server.

## Manual EN/ES acceptance

1. Start `npm run dev` and verify the initial UI is English.
2. Load Example, create/approve a cue, and load a local asset. Switch to Spanish and back; show/audio state must remain intact.
3. Import multilingual text containing accents and non-Latin characters. Verify preview, proposal evidence, and line IDs stay byte-for-byte equivalent after JSON roundtrip.
4. Reload the page and confirm only the UI preference returns; the locale must not be present in exported project JSON.
5. Choose a source-language hint independently of UI language. Invalid custom hints must fail before any provider call.
6. Inspect the Meta consent, coverage progress, diagnostic errors, transient cue detail, and three sound-resolution paths in both locales.
7. With no key, verify no provider request is possible. A future live multilingual Meta check requires explicit authorization and has not yet been performed.

## Adding another locale

Copy the English catalog, translate every value, preserve placeholder names exactly, register the locale, add selector/UI tests, and run `npm test`. Render user/model text through safe text properties, never `innerHTML`. Do not move source scripts into locale files.

## Current limits

- Only English and Spanish interface catalogs exist. A French/German/Portuguese analysis hint is not a translated UI.
- Right-to-left layout, native-backend diagnostic translation, speech localization, and professional terminology review remain future work.
- Model language quality is unverified live and may vary.
- The project JSON schema remains unchanged; locale, hint, V2 details, coverage, and diagnostics are external to it.
