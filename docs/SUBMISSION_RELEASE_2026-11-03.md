# RUNQ — Final submission release notes (3 November 2026)

> **Authoritative submission reference.** This document describes the operator-selected browser build, not `main` and not historical V13–V15 or Modal-generation prototypes.

## Freeze record

- Product: **RUNQ** (repository name: `showcompiler-hackathon-2026`).
- Track: **Indie developer** (solo project).
- Theme fit: **Build for Your World** — tools for theatrical and live-event production, informed by firsthand show-operation workflows.
- Frozen runnable commit: `b4e7df724d569c1d5af7682540c206ff3fb97701`.
- Frozen feature branch: `feat/runq-cue-sound-design-review-2026-11-03`.
- Product PR: [#136](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/136), based on the prompt-only demo [#135](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/135).
- This documentation branch deliberately adds **no runtime code changes**.
- GitHub Actions **Core tests** on the frozen commit: **SUCCESS**, run `41690922577`. This means automated checks passed, not that every real microphone, audio device or AI call was independently tested.
- Owner reports that the browser build works during local use. The demo video and final manual acceptance evidence are to be attached after capture.

## What the frozen build delivers

### Start and script
- Create a show, import a TXT (UTF-8), text-based PDF or DOCX, or use a packaged demo. Scanned image-only PDFs and legacy DOC are not supported. Import is local and source references remain traceable to original `L#` lines.
- Work through script, proposed cues, sound design, configuration and readiness in a guided **Build your show / RUNQ AI** experience.

### Model-assisted cue planning
- Opt-in **Meta Muse Spark** integration for script interpretation and proposals anchored to source lines. A model response does not start sound, arm voice-following, approve cues or edit an active show without explicit review.
- Human approval/rejection of suggestions, contextual review, and editable cue labels and trigger phrases. Meta access depends on the operator configuring a valid API key; offline workflows are available separately.
- A deterministic/local prompt preparation path is **not** described as a new inference from Muse.

### Sound and cue editing
- Proposed acoustic descriptions are visible with each pending proposal. Approved cues have **Sound design** summaries and expandable operator controls for gain, fades, loop and handling of earlier playing sounds (overlap or stop previous).
- Those numeric settings are **the current editable cue settings**, not fabricated Meta-derived estimates. The current AI proposal contract does not supply structured recommended dB, duration, fades or overlap policy.
- Import/assign WAV and other locally supported media using the library, inspect/edit playback trims and fades, and save non-destructive cue settings.
- Cue audio duration is derived from real media or explicit trims; an unspecified duration is never presented as a model measurement.
- The usual sound assistant creates/edit sound prompts and imports existing audio. **New Modal SFX generation is disabled in this frozen demo**; historical generation code and journal records must not be presented as a current user workflow.

### Rehearsal and manual operation
- Manual **GO**, **NEXT**, individual stop/fade and **STOP ALL** use the local browser audio engine; model requests are not part of the GO/STOP path.
- Rehearsal includes optional microphone transcription, script/trigger following and explicitly armed automatic GO. Manual GO **disarms** the armed rehearsal autopilot by design; keep that behavior in this submission.
- Opening a page or selecting a cue cannot arm automatic GO. STOP ALL, leaving rehearsal and other safety conditions disarm/cancel pending actions.
- The interface defaults to English for a new browser profile; voice language defaults to English for fresh operator preferences. Existing saved language preferences remain respected. Spanish and mixed voice recognition remain selectable.

### Portable project
- Export a show ZIP with embedded assets when portability matters. A bare JSON export is not a substitute for a media-inclusive show archive.
- UI can be used locally through Node.js and a modern browser; this submission is **not** represented as a signed Windows installer or certified hardware controller.

## Safety and honest limitations

- Browser audio; no certified professional show-control guarantee, dedicated PFL bus, ASIO/DMX hardware integration, or dependable device-isolated routing.
- New paid remote sound generation is deliberately disabled.
- Some AI actions require network, model key, explicit action and currently available service.
- No claim of real-model F1 or overall ASR accuracy based solely on synthetic/offline tests.
- Looping and entry-stop behavior are operator-reviewed and bounded by the existing validators; imported media must decode successfully to play.
- The site may not function directly from a GitHub source preview. Run the Node server, install dependencies, and open the forwarded port.

## No-change policy

No feature work, dependency updates, provider switches, `main` merges or deployment changes after this freeze without a separate release decision. Presentation text, a video link and screenshots can be added as documentation only.

## References

- [Judge quick start](JUDGE_QUICKSTART_2026-11-03.md)
- [Submission form copy](SUBMISSION_COPY_2026-11-03.md)
- [Video shot list](DEMO_CAPTURE_2026-11-03.md)
- [Submission checklist](SUBMISSION_CHECKLIST_2026-11-03.md)
