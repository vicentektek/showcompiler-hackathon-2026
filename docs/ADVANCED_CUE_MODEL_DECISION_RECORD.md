# Design decision: cue identity, actions, evidence, and future schema v2
Status: DESIGN ONLY — NOT A CODE MIGRATION
Date: 2026-10-27. Public-safe product specification, no external repo/code copied.

## Why this decision exists

Current schema v1 stores a show with immutable script text, registered audio assets, AI/manual-mock proposals, and DRAFT cues. Approved cues must have the same source references and actions as their approved parent proposal. Current action types are PLAY(assetId) and PLAN_AUDIO(prompt, resolution). Cue-level optional automation is persisted through mode/delayMs/fadeInMs/fadeOutMs/loop/stopCueIds. The browser transport currently runs only PLAY with fixed gain/timing. It does NOT execute all stored automation settings.

This is appropriate for a small controlled proof, but it cannot directly represent independent PLAY instances, STOP/FADE events and operator-edited actions while retaining AI evidence. No coding agent should silently loosen v1's source/approval validation to make advanced controls appear to work.

## Architectural decision

Separate these entities permanently:

1. **Script source**: original immutable text and stable line ID, e.g. L17. Source revision changes must be deliberate, versioned and remapped with confirmation.
2. **Suggestion/evidence**: model or explicitly authored concept with original line references, acoustic brief, optional matching asset, provenance and review outcome. Evidence is NOT a playback action.
3. **Production cue**: operator-owned, number/order/label/prompt and an ordered list of actions; may cite reviewed evidence. A manual operator cue does not require a fabricated AI suggestion.
4. **Audio asset**: unique ID and original binary/metadata; never stores cue-specific volume, fade, pan or output settings.
5. **Action definition**: a persistent, uniquely identified instruction PLAY/STOP/FADE/etc. Multiple PLAY actions may refer to the same asset but are independently editable.
6. **Playback instance**: a volatile execution of ONE PLAY action in ONE GO run. An instance is NEVER inferred solely from a filename or asset ID.
7. **Show transport**: one arbitration authority for prepare/GO/stop/fade/STOP ALL, active voices, delayed advances and lifecycle fencing.
8. **Output profile**: logical buses/routing and real-device capabilities; unavailable capabilities are disabled and clearly labelled.

## Proposed shape (illustrative future document; NOT CURRENT supported JSON)

```json
{
  "schemaVersion": 2,
  "id": "show-unique",
  "name": "The Example",
  "script": { "revisionId": "rev-1", "text": "(A bell rings.)\nACTOR: Go." },
  "assets": [
    { "id": "asset-bell", "name": "bell.wav", "sha256": "<sha256-of-audio>", "kind": "audio" }
  ],
  "evidence": [
    {
      "id": "evidence-1",
      "kind": "MODEL_SUGGESTION",
      "review": "APPROVED",
      "sourceRevisionId": "rev-1",
      "sourceLineIds": ["L1"],
      "label": "Bell",
      "soundBrief": "A close, short metal bell with a natural decay"
    }
  ],
  "cues": [
    {
      "id": "cue-001",
      "number": 1,
      "label": "Bell at entrance",
      "sourceLineIds": ["L1"],
      "origin": { "kind": "APPROVED_EVIDENCE", "evidenceId": "evidence-1" },
      "advance": { "mode": "MANUAL", "delayMs": 0 },
      "actions": [
        {
          "id": "act-play-bell",
          "type": "PLAY",
          "assetId": "asset-bell",
          "delayMs": 0,
          "gainDb": -6,
          "fadeInMs": 0,
          "fadeOutMs": 0,
          "repeat": { "mode": "FINITE", "plays": 1 },
          "playbackRate": 1,
          "startOffsetMs": 0,
          "pan": 0,
          "busId": "main"
        }
      ]
    }
  ]
}
```

The sha256 placeholder above is illustrative. Never place this example in fixtures accepted by the current v1 loader.

## Identity rules and stop targeting

- `assetId`: reusable data, never playback identity.
- `cueId`: stable logical cue definition, not an instance.
- `actionId`: stable instruction identity, unique within a show (or globally prefixed), preserved across save/load.
- `runId`: generated per accepted GO execution, volatile.
- `voiceId`: unique per started PLAY; references runId + actionId. Per-voice stopping is idempotent.
- A STOP or FADE definition names an explicit target by actionId AND an unambiguous selection policy. Initial product rule: the operator targets an ACTIVE voice or an explicit action target; if two executions could match, require a deliberate selector or documented ALL_ACTIVE. Never silently stop every reuse of an asset.
- Stopping `act-bell-a` must not affect `act-bell-b` even if both reference `asset-bell`.
- Reorder/duplicate cue: cloned actions get NEW action IDs, preserve the original asset references. Editing asset audio is distinct from editing the action's gain/delay/fade.
- Deleting an action referenced by another STOP/FADE must offer repair/retarget, never leave an silently broken reference.
- If a STOP target has already completed, it is a safe no-op plus operator feedback; never target another play as a fallback.

## Cue action contracts (future)
 
| Action | Required fields | Effect and safety |
| --- | --- | --- |
| PLAY | actionId, assetId, gainDb, delayMs, fadeInMs, repeat, busId | Decode/preflight first, then start exactly once. Retain playback instance ID. |
| STOP | actionId, explicit target action/instance selector, optional fadeMs | Stop only matching active instances. Intentional stop is NOT natural completion. |
| FADE | actionId, explicit target, targetGainDb, durationMs, curve | Ramp target gains; reaching silence does not imply STOP unless explicit stopAtEnd. |
| WAIT | actionId, durationMs | Non-audio scheduling; cancellation token owned by transport. |
| LIGHT | actionId, explicit target + safety profile | Optional, capability-gated, no fire from text/model alone. |
| VIDEO | actionId, explicit target + safety profile | Optional, capability-gated, no fire from text/model alone. |

A cue may contain multiple actions. Ordered vs simultaneous must be represented explicitly in a group/scheduling layer (NOT inferred from array position alone). Preserve a deterministic event log with action IDs, timestamps and outcome for diagnostics; never log raw model secrets.

## Time semantics

- `action.delayMs` means delay from the accepted GO origin to that action's scheduled start, using one monotonic transport clock where possible.
- `AUTO_CONTINUE` schedules the next cue a configured interval after the source cue's successful GO acceptance. It is independent of whether all source audio has ended.
- `AUTO_FOLLOW` schedules after a completion barrier: all eligible non-looping blocking PLAY actions naturally finish. An intentional STOP, fade-to-stop, missing asset, failed GO or disposed transport does not satisfy that barrier.
- Infinite looping playback cannot be the sole completion trigger for AUTO_FOLLOW. The editor must reject that unsafe combination or require explicit alternative completion semantics.
- `repeat.plays=1` plays once; `repeat.plays=N` is total play count N, not N additional repeats. `INFINITE` is separately named and opt-in.
- Pause/resume, scrubbing, start offset, per-action rate, equal-power curves and routing require separate engine capability gates; their fields are future product targets, not current prototype claims.
- Delayed automated GO after STOP ALL or project replacement must never fire. Timer cancellation alone is insufficient: callbacks and promises must check generation and run ownership.

## Migration policy and approval gates

- **Do not change schema v1 during the hackathon's initial C1 integration.**
- Future v2 migration is a deterministic PURE function: `migrateV1ToV2`; retains sourceText/IDs, original proposals, asset references and operator edits without rebuilding cues from AI.
- V1 approved proposals become an evidence entry; corresponding cue gains independent operator-owned actions with stable generated action IDs.
- Legacy mock/manual fixture origin must not be mislabeled as real model output. Honest provenance is a hard requirement.
- Keep a reversible copy of source document or support export of the original; unknown future schema must be rejected without overwriting current show.
- Migration must be idempotent when version already 2, maintain stable mapping, validate all references and execute without network/audio.
- Planned migration requires golden-file tests for v1 JSON and v1 ZIP fixtures, and end-to-end ZIP re-open. Only implement once current path is stable.

## Deliberate capabilities to postpone

- Multi-output ASIO/WASAPI route selection, latency assertions and native desktop patching.
- Native pause/resume of active instances and sample-accurate scheduling.
- Real DMX/OSC/MIDI or other external effect outputs.
- Speech-following automatic firing during public live operation.
- Unbounded local asset library, online store sync or provider-dependent runtime.

## Acceptance for future implementation

1. Given two cues referencing the SAME asset, each has a distinct actionId and autonomous playback instance; STOP/FADE on first does not affect second.
2. Original source and AI evidence remain unchanged after operator edits cue number/label/actions.
3. Imported v1 ZIP/JSON upgrades only after explicit migration, retaining audio and traceability.
4. Cue action timing is reproducible in deterministic transport tests and cancellable by STOP ALL.
5. UI never offers controls unsupported by the selected audio backend.
6. A cue without a source is possible only when operator explicitly authored it; no fabricated L# ID.
