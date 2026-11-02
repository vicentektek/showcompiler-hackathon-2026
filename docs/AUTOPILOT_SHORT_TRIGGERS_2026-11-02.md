# Autopilot: recognized two-word trigger did not fire

Bounded assignment: reproduce the reported recognized-but-not-fired cue and correct the local trigger decision, with no provider requests or audio-engine changes.

The supplied screenshot shows cue 2 configured with `is holding`, repeated final transcripts containing that exact text, and only three loaded triggers for a four-cue show. Both the scenario loader and automatic GO policy excluded triggers shorter than three words. The UI silently ignored the resulting `TOO_SHORT` decision.

Autopilot now loads two-word operator-configured triggers. A two-word trigger requires an exact normalized whole final turn, a source line within 25 lines of the rehearsal focus, and no competing match. Partial/extra words, ambiguous matches and distant short triggers cannot fire. Duplicate-turn protection, the 2.5-second repeat cooldown, explicit arming and STOP ALL disarming remain intact. Assist/simulator mode keeps its previous minimum. No source text or project schema changes.

The detection panel now explains short/unmatched/ambiguous phrases, distant short triggers, confidence failures, repeat cooldown and a GO still starting. These messages do not queue playback or retry failed GO operations.

Changed files for this task:

- `src/core/voiceScenario.mjs`
- `src/core/rehearsalAutopilot.mjs`
- `src/ui/rehearsal-auto-ui.mjs` (pre-existing edits retained)
- `test/rehearsalAutopilot.test.mjs`
- `tools/rehearsal-auto-browser-e2e.mjs`
- This report.

Validation:

- `node --test test/rehearsalAutopilot.test.mjs`: reproduced two failures before the fix; 9/9 passed afterward.
- `npm run qa:codex`: exit 0; includes `npm run check:syntax`, supplementary syntax checks, `npm test` (815 passed, 0 failed), `npm run qa:cues`, and `npm run qa:seminar`. Reports reviewed locally; synthetic cue scores do not measure Muse accuracy.
- `node tools/rehearsal-auto-browser-e2e.mjs`: exit 0. Real browser WAV engine with simulated completed speech turns; two-word trigger loaded and fired, repeat cooldown explained, skip/rewind, duplicate prevention, manual override and STOP ALL passed. Zero provider calls.
- `git diff --check`: passed.

Branch/HEAD: `feat/runq-ai-campaign-100-2026-10-31` at `6325e77c98ab4b072e8219028529a877110d545e`, tracking the same origin branch. Related voice refs inspected: `origin/feat/voice-follow-synced-2026-10-28` (`aa752a4`) and `origin/feat/runq-voice-console-rehearsal-ux-2026-10-28` (`7d2e13c`). No PR/base selection, CI URL, commit or merge was created. Existing user changes remain in place.

Reload the app and start a new explicitly armed listening session to load the updated trigger map. Real microphone recognition and audible hardware output still require operator verification. This fixes the reproduced short-trigger exclusion; it does not establish that every reported intermittent non-fire had the same cause. Longer phrases still use the existing confidence rules.
