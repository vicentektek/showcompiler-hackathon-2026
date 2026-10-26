# SHOWCOMPILER internationalisation (hackathon-only work)

**Status:** EN/ES UI implementation added on 26 October 2026, behind a separate draft PR. GitHub Actions verifies translation dictionaries, module syntax, project roundtrips and model-language request safety. Interactive Chrome/Edge user acceptance still pending.

## Design decisions

1. **English first:** the default interface language is `en`, even on a Spanish-language PC. The complete `es` interface is selectable from the upper bar.
2. **Separate language settings:** the UI locale is saved in local browser `localStorage` under `showcompiler.ui.locale.v1` and is not part of a show JSON file. A JSON project therefore does not force the recipient's interface language.
3. **Original scripts are authoritative:** a TXT script is never translated, normalised, or rewritten as part of a UI language change. Stable `L1`/`L2`/... references continue to mean exactly the same source lines.
4. **Model-analysis language is independent:** the Meta AI panel offers **Auto-detect** (default), common language hints (EN/ES/FR/DE/PT), and a custom language code such as `ja`, `ar` or `zh-Hans`. It validates the language hint locally and server-side. The hint is passed to the model without being added to project JSON or overwriting the script.
5. **Cue labels follow the source:** model instructions request short labels in the language of the relevant script passage, regardless of whether the UI is English or Spanish. Manual proposal labels remain exactly as the operator entered them.
6. **Future voice language is a third independent concern.** Speech-to-text, cue tracking and microphone selection have not been implemented in this hackathon prototype. Do not claim that any model accurately understands *every* language.

## Files and dependencies

- `src/ui/locales/en.json`, `src/ui/locales/es.json`: catalog keys (142 each), including normal/exception states, audio errors, confirmations and consent.
- `src/ui/i18n.mjs`: built-in JSON modules, fallback-to-English, safe parameter interpolation into `textContent`, translation of placeholders and accessible labels, and guarded `localStorage` usage.
- `index.html`: static elements use `data-i18n`, `data-i18n-placeholder` or `data-i18n-aria` attributes. The initial HTML itself is in English.
- `src/ui/app.mjs`: dynamic labels, statuses, cues, confirmation dialogs and error messages; switching the language does not reset the current show or audio engine.
- `src/core/scriptLanguage.mjs`: BCP47-style hint validation; default `auto`.
- `src/core/metaCueProvider.mjs` and `tools/metaRoutes.mjs`: the selected hint reaches Meta's text analysis with no translation or auto-GO.
- `test/i18n.test.mjs`, `test/metaCueProvider.test.mjs`, `test/metaIntegration.test.mjs` and `test/browserPrototype.test.mjs`: regression suite.

No third-party i18n package or network translation service is required. Both catalogs are served from `127.0.0.1` by the allowlisted local Node server.

## Manual QA (Windows, Chrome/Edge)

1. Start `npm run dev` from the `feat/i18n-en-es-2026-10-26` branch. Open `http://127.0.0.1:5173` and verify English headings and labels.
2. Load **Example**, import a real WAV/MP3 and approve a manual test cue. Switch the UI to **Español**. All headings, controls and playback status should translate, **without clearing the cue or stopping audio**.
3. Export the JSON. Switch back to English, reopen that JSON and verify source text, cue numbers, references and approval states are identical. Remember the audio itself is not saved inside JSON.
4. Reload the page and verify the selected **interface** language is restored from local storage.
5. In the Meta panel, choose a script-language hint independently of the UI. No model call happens before confirming that the source excerpt will be sent to Meta. With no API key, the model button stays disabled.
6. With a real Meta key and credits, test a Spanish script while the UI is English; inspect that proposed cue labels and line references follow the original script. This real-model test has **not** been performed automatically.

## Adding languages later

Create a complete catalog by copying `en.json`, translate every value while preserving placeholder tokens (`{count}`, `{name}`, etc.), register the locale in `src/ui/i18n.mjs`, add a selector option, update catalog parity tests and run `npm test`. Avoid storing translated or original scripts as UI strings; user-supplied data must always go through safe text rendering.

## Current limits

- Only English and Spanish interfaces are translated. French/German/Portuguese are supported as **model language hints**, not as UI translations yet.
- Only the first 120 script lines are sent in one Meta inference request. Auto-language inference quality varies across languages and models; it is not a guarantee of universal recognition.
- Right-to-left screen layout, translated technical error details from every native backend, and speech command localization are future work.
- The existing versioned project JSON schema remains unchanged. UI preference and analysis hint are external to it.
