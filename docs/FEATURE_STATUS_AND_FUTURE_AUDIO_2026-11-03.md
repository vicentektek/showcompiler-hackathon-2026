# RUNQ — Product feature status, deferred integrations and honest claims

**Frozen build:** `b4e7df724d569c1d5af7682540c206ff3fb97701`, selected by the operator for the 2026 Indie developer submission.

The file intentionally describes **present functionality** separately from **historical experiments** and **future ideas**. An experimental source module or a named integration does not mean a working user-facing feature.

## Shipped in the frozen browser demo

| Area | Status | Evidence / boundary |
| --- | --- | --- |
| Import scripts | Implemented | UTF-8 TXT, text-based PDF, DOCX; no OCR or legacy DOC |
| Script-linked proposal review | Implemented | Original L# evidence; approval/rejection remains human |
| Muse Spark script/cue analysis | **Optional; requires Meta credentials and explicit request** | Model inference is not the same as local sound prompt preparation |
| Sound design within Show Builder | Implemented | Pending acoustic prompt is visible; approved cue panel edits real gain/fades/loop/overlap |
| Model-generated numeric sound design (duration, dB, fades, overlap) | **Not shipped as structured recommendations** | These numeric values are current operator settings; never fabricate Muse recommendations |
| Local audio library and cue binding | Implemented | Imported asset must be decoded; unresolved cue GO blocked |
| Browser audio transport | Implemented | Explicit NEXT/manual GO/individual stop/fade/STOP ALL; local engine |
| Voice-follow rehearsal and armed Auto GO | Conditional | Explicit mic and session action; works only when provider/browser/mic available; manual GO disarms |
| ES/EN UI / ES/EN/mixed spoken language | Implemented as options | English is default for new preferences; existing saved settings may override |
| Full-show ZIP export/import | Implemented | Use full ZIP for media-inclusive portability; JSON alone is not embedded audio |
| Sound generation (new WAV) from Modal in the normal app | **Disabled** | Prompt-only final build; no paid generation request through default server |
| Native Windows desktop executable | **Not claimed** | Browser + local Node server is the reference |
| Hardware DMX/ASIO/timecode and independent PFL | **Not claimed** | No professional certification |

## Why historical audio generation is still in the repository

Earlier work explored **Modal + Stable Audio 3 Small SFX** as a backend for generated audio. Source and tests include `modal/runq_sfx_pilot.py`, `src/core/modalSfxPilotClient.mjs`, `src/core/audioGenerationPlan.mjs`, historical route contracts and documentation. Those artifacts demonstrate exploration, but the frozen runtime disables fresh generation in its normal server path.

The final workflow is **sound idea/prompt → human review → import or select a local WAV → cue settings → manual GO**.

Do not delete or comment out old modules now. They can be referenced by tests, import compatibility, historical ledger handling or user-saved project data. Removing them under a deadline could break regression and provenance.

## Future audio-generation integration: proposal only, not a current Meta API claim

RUNQ's provider-neutral audio preparation plan could support **a future, officially documented Meta audio-generation API**, *if such a compatible service becomes available to this project, its terms permit the intended use and its output can be validated*. This document does **not** assert that a specific public Meta audio-generation endpoint currently exists, is accessible, or has been integrated.

Before any future integration:

1. Verify actual official API availability, credentials, license and commercial rights.
2. Keep generation **outside** deterministic show transport; never trigger remote inference from GO/STOP.
3. Require explicit user action, account/spending transparency, request idempotency and controlled polling.
4. Validate produced audio independently (format, duration, sample rate, content/type and rights), then require human review and import.
5. Make the feature optional so the shipped manual workflow remains completely usable.
6. Add tests and a new release candidate; never enable it silently in the frozen hackathon submission.

The historical Modal pilot remains a development experiment rather than a promised product dependency. Label any future roadmap item **Planned / subject to provider availability**.

## Experiment classification (not for main README feature list)

- Meta/Baseten comparative evaluations, large AI campaigns, original synthetic corpora, pilot voice/TTS infrastructure, desktop/Electron spike, alternative workstation versions, ASR prototypes, waveform studies and research dossiers remain retained for reproducibility and contribution traceability.
- A former prototype can contain tests that still exercise safety contracts in the current build. Historical text is not evidence that the feature ships.
- See [Development history](DEVELOPMENT_HISTORY_INDEX_2026-11-03.md) and [Release notes](SUBMISSION_RELEASE_2026-11-03.md).
