# Autopilot short-trigger integration

The local regression concerned an operator-configured two-word trigger that
matched the final transcript exactly but was excluded by a three-word minimum.
The integrated scenario loader accepts two-word triggers; Autopilot only treats
them as a match when the complete normalized final turn is exact, near the
rehearsal focus and unambiguous. Longer triggers retain the existing confidence
rules. Negated or quoted cue mentions remain blocked.

Existing duplicate-turn protection, repeat cooldown, explicit arming and STOP
ALL disarming remain in force. The change does not alter source text or project
schema and does not add provider calls or playback retries. AI-generated cues
remain suggestions; only the configured local rehearsal path can request GO.

Offline regression coverage is in `test/rehearsalAutopilot.test.mjs` and
`test/showPreparation.test.mjs`. Browser and microphone recognition still
require separate operator verification.
