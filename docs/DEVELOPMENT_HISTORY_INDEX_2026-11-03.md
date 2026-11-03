# RUNQ — Development history and experiment archive index

> **This is a history index, not the current product manual.** The dated artifacts in this repository reflect experiments and milestones during 26 October–3 November 2026. Judge-facing claims should come from [the final release notes](SUBMISSION_RELEASE_2026-11-03.md).

## Chronology / major workstreams

| Date / phase | Evidence group | Status for final submission |
| --- | --- | --- |
| 26–27 Oct — core and AI | `docs/SCRIPT_CORE.md`, `docs/CORE_DEMO.md`, `docs/META_MODEL_API.md`, `docs/CONTRIBUTIONS.md`, `docs/ADR-0001_MOTOR_AUDIO_NATIVO_2026-10-26.md` | Core design, source-linked analysis, reviewed cues and audio safety decisions; updated implementation details in final release |
| 27–28 Oct — audio and rehearsal | `docs/PORTABLE_SHOW_ARCHIVE.md`, `docs/REHEARSAL_AUTOPILOT.md`, `docs/AUDIO_FEATURES_AND_MASS_TEST_PLAN_2026-10-28.md` | Audio ZIP, cue playback, voice/rehearsal iteration; old test status may be superseded |
| 28–29 Oct — interface versions | `docs/RUNQ_V13_PROFESSIONAL_WORKSTATION_CONTRACT.md`, `docs/RUNQ_V14_IMPLEMENTATION_AND_REGRESSION_CONTRACT.md`, `docs/RUNQ_V15_MASS_QA_AND_VISUAL_FREEZE.md` | Historical UI iterations; not independent final builds |
| 28–29 Oct — generated sound | `docs/MODAL_AUDIO_GENERATION_ROADMAP_2026-10-28.md`, `docs/SFX_GENERATION_PILOT_2026-10-28.md`, `modal/runq_sfx_pilot.py` | Experimental work retained; new remote generation intentionally **disabled** in final demo |
| 29 Oct–2 Nov — QA, agent and UX | `docs/RUNQ_SYSTEMATIC_EVAL_PROTOCOL.md`, `docs/qa-evals-2026-10-31/`, `README_RUNQ_AI_BATTERY.md`, multiple draft PRs | Validated/simulated contracts and technical work; do not equate synthetic evaluation PASS to quality in real production |
| 2 Nov — working tag | `docs/VERIFIED_VERSION_2026-11-02.md` | Older snapshot retained as rollback evidence; **not** the submitted build |
| 3 Nov — final prompt-only demo | PR [#135](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/135) | UI streamlining and WAV import with server-side blocking of new paid SFX |
| 3 Nov — per-cue sound review | PR [#136](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/136) | Selected final product, frozen runnable SHA `b4e7df724d569c1d5af7682540c206ff3fb97701`; GitHub Actions success |
| 3 Nov — submission docs | PR [#137](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/137) | Documentation/metadata only; does not change the frozen executable |

## Preserving investigations without clutter

We will **not** remove failed experiments, rewrite the 1,300+ commit history, close bulk PRs without review, or delete old code on the eve of submission. Those operations can erase useful evidence, break imports or invalidate archived test results.

Instead:
- The README begins with a **Final submission** entry section.
- Release notes and judge quick start are the single source of truth for the presented feature set.
- Experimental provider and desktop research remain in dated files and branches, clearly labelled historic.
- The old multi-version README has been retained as [archived development notes](README_DEVELOPMENT_HISTORY_2026-11-03.md) rather than deleted.
- No archived research is imported into the public demo video as an implemented feature.
- For a future post-hackathon cleanup, evaluate an intentionally separate public snapshot with only verified source, legal media, tests, README and references.

## Authorship and evidence

Retain the original dated commit/PR evidence. The historical [contribution log](CONTRIBUTIONS.md) explains the hackathon-only work and its then-current validations. Historical entries should not be silently edited to predict newer capabilities; add chronological appendices for subsequent progress.

The event-specific repository is not the earlier ShowCompiler repository. Do not imply that pre-event assets/code were authored as new contest work. No fabricated benchmarks or provider calls.

## Open questions after video

- Did the capture show a genuine Muse inference, or an offline fallback? Label accurately.
- Was Auto GO demonstrated with real mic/provider or a simulated fixture? Label accurately.
- Which screenshots/audio files may be published under their actual rights?
- Is the code shared with judges through private access or a sanitized snapshot? Decide explicitly.
- Are any old credentials present in historical branches? Run full-history scan before sharing.
