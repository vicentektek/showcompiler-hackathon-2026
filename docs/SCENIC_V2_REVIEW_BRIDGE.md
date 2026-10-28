# RunQ — V1-to-V2 Scenic Review Bridge

This milestone makes the existing strict cue-event tuples inspectable under the
V2 action/note/suggestion vocabulary **without modifying V1 interpretation,
provider prompts, human-review approvals or the live show engine**.

## What is connected

`bridgeV1EventsToScenicV2({scriptText,events,operatorBindings})` accepts
validated-format `{lineId|sourceLineId,transport,cueKind,basis}` tuples and
returns strictly advisory V2 items. It rejects invented script lines and extra
model-supplied fields. No V1 tuple contains a verified playback cue ID or
lifecycle state: the bridge **never guesses those**.

The optional `operatorBindings`, entered independently of model output and
indexed by source line, can supply verified cue IDs, playback states and
requested parameter changes. This module validates structure only: the review
interface that later captures those bindings must also check the cue exists in
the active project and belongs to the requested playback group.

Default output:
- PLAY: inert action-shaped proposal needing an audio asset and approval.
- STOP without target: operator suggestion, **not** an executable stop.
- CONTINUE without target: operator suggestion; when operator verifies an
  unchanged source it becomes a script note.
- SILENCE without requested scoped action: scenic script note.
- TRANSITION is not a V1 transport and must be authored in a future V2-specific
  review flow, not fabricated by this bridge.

An operator who confirms a finished one-shot can make an unnecessary STOP a
note. An operator who scopes a SILENCE action to named playback cues can
review a selective stop proposal. Nothing here can dispatch GO/STOP.

## Offline development review

Run `npm run qa:scenic-v2:review` to produce:
- `artifacts/scenic-v2-review/review.md`
- `artifacts/scenic-v2-review/review.json`

Both are gitignored. This command intentionally reads **only six development
cases** from the Level 1 provisional gold. It does NOT use any model, does NOT
measure prediction quality, and does NOT show qualification cases. Run it to
inspect the bridge's output vocabulary, not to certify the gold.

## Still required

1. Operator review of gold and lifecycle assumptions; record signed
   approvals separately. No automatic approval.
2. An explicitly trusted review UI capturing scoped cue bindings against
   the active project's cue inventory, plus user-facing action/note/suggestion
   presentation.
3. Separately versioned V2 gold and model contract if testing note/suggestion
   extraction; existing V1 F1 numbers are not V2 F1.
4. A supervised, paid provider pilot only after independent authorization.

Verification: `npm run check:syntax`, `npm test`, and
`npm run qa:scenic-v2:review` are offline.
