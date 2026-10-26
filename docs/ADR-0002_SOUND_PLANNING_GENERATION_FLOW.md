# ADR-0002 — Script first, audio later

Date: 26 October 2026
Status: accepted for the isolated hackathon prototype; automated verification exists, interactive acceptance remains pending. No audio-file generation engine is integrated.

## Context

A sound designer must be able to import a script, receive suggestions, approve sound needs, and prepare a show before any WAV/MP3 library exists. A cue represents a theatrical event and its required sound; an audio file is a later execution resource, not the cue's identity.

AI analysis is useful during preparation, but live playback must remain deterministic. A provider outage, slow response, or malformed suggestion must never affect GO, STOP, fade, or panic behavior.

## Decision

```text
Original script
    ↓ deterministic scene/window plan (60 core + up to 3 context lines)
Explicitly confirmed Meta request (maximum 2 windows, 8 transient V2 items)
    ↓ strict schema + exact source/evidence/asset validation + deduplication
Pending PLAY proposal, possibly assetId:null + acoustic brief
    ↓ explicit human APPROVE (never automatic)
DRAFT / AUDIO PENDING
    ├─ 1. Existing library ─ choose and load local asset ─ preflight ─ manual GO
    ├─ 2. Decide later ───── retain DEFER plan ──────────── GO blocked
    └─ 3. Prepare generation ─ retain GENERATE intent ──── GO blocked
```

Each later analysis batch needs another user click and confirmation. Coverage, rich model fields, non-PLAY observations, and diagnostics are transient; they do not modify project schema v1.

### Three audio-resolution paths

1. **Existing library.** The operator selects a registered audio asset. `assignAudioToCue` atomically changes both the approved proposal and its cue from `PLAN_AUDIO` to `PLAY`, preserving source references. The matching local file must also be decoded in browser memory before GO.
2. **Decide later.** The cue keeps `{ "type": "PLAN_AUDIO", "prompt": "…", "resolution": "DEFER" }`. It can be approved and saved, but it is not executable.
3. **Prepare AI generation.** The operator changes only `resolution` to `GENERATE`. This records future intent. It does not contact a provider, create a job, consume credits, synthesize a file, or make GO available.

The currently executable action remains `{ "type": "PLAY", "assetId": "asset-1" }`.

## Theatrical analysis rules

The transient `CueSuggestionV2` distinguishes:

- `EXPLICIT` acoustic directions from lower-certainty `SUGGESTED` atmosphere;
- `PLAY` from `CONTINUE`, `STOP`, and `SILENCE` transport intent;
- `FX`, `AMBIENCE`, `MUSIC`, `VOICE`, `SILENCE`, and `TRANSITION` kinds;
- exact source evidence, trigger relationship, duration/loop/fade estimates, confidence, reason, and an acoustic brief.

Dialogue that merely mentions or remembers a sound is omitted. Continuing ambience is not converted into another PLAY. Silence or a request to stop/fade sound remains a transient observation because project v1 has no approved STOP/FADE domain action. Only validated PLAY items enter the ordinary pending-proposal workflow.

If no existing asset genuinely matches, the model must return `assetId: null` plus a precise, nonempty `soundPrompt`. Selecting the only available file merely because it exists is invalid.

## Approval and execution invariants

- Every model result enters as `PENDING`.
- Only a direct human APPROVE interaction creates a `DRAFT` cue.
- Approval never plays audio and never resolves missing audio automatically.
- The UI disables GO for `PLAN_AUDIO`; the browser audio engine independently rejects non-`PLAY` actions and unloaded assets.
- GO, STOP, fade, and STOP ALL contain no AI or network path.
- Importing a script, approving a proposal, choosing DEFER/GENERATE, opening a project, or entering playback mode never calls an inference or generation provider.
- No background or automatic retry exists.

## Persistence compatibility

Both `PLAY` and `PLAN_AUDIO` are accepted by the current strict schema-v1 codec. Projects written before `PLAN_AUDIO` remain readable. However, an older ShowCompiler build that only understands `PLAY` may reject a newer schema-v1 file containing `PLAN_AUDIO`; this directional compatibility limitation is documented rather than hidden.

No new persistent fields were introduced for scene coverage, `CueSuggestionV2`, diagnostics, prompt classification, or observations. A future production format should use an explicit schema-version migration rather than silently extending v1 again.

## Future audio-generation design (not implemented)

Any future generator must be an asynchronous preparation tool, never part of GO or a real-time audio callback:

1. Show the exact prompt, provider, expected price/range, limits, license, duration, and loop settings.
2. Require consent for each generation request; use an idempotent job ID and bounded, user-visible retry policy.
3. Track `QUEUED`, `RUNNING`, `FAILED`, `SUCCEEDED`, and `CANCELLED` away from the live transport thread.
4. Download candidates locally with hash, provider/model, license, prompt, date, duration, channels, sample rate, and size.
5. Let the operator preview A/B, reject, regenerate, or explicitly bind one candidate to the cue.
6. Enable GO only after a chosen file becomes a validated, loaded asset.
7. Allow replacement with the operator's own file; avoid provider lock-in.
8. Warn about cloned voices, copyrighted music/lyrics, and model-weight license restrictions.

Potential providers remain research topics only. Their current pricing, licensing, duration, and commercial-use terms must be rechecked before implementation.

## Consequences

Benefits:

- scripts without assets are first-class;
- sound design and file acquisition can proceed independently;
- every cue retains exact source traceability and human ownership;
- network/model failures cannot interrupt live audio;
- users can see unresolved work instead of receiving a misleading “ready” state.

Costs and limits:

- an approved cue may still require sound resolution and file loading;
- project v1 cannot represent executable STOP/FADE or rich analysis metadata;
- no multiaudio pending plan, professional prompt editor, generated candidates, portable audio package, or production preflight exists yet;
- browser audio remains a prototype and needs manual audible acceptance.

## Manual acceptance checklist

- Import a synthetic or rights-clear script with no audio assets.
- Confirm Meta analysis clearly discloses one potentially billable request and its scene-window scope.
- Verify coverage advances only after a successful response and a later batch needs another click.
- Confirm explicit, suggested, continuing, and silence/stop cases are labeled honestly.
- Approve an unbound proposal and exercise all three resolution choices.
- Verify DEFER and GENERATE survive JSON roundtrip and cannot GO.
- Assign and load an existing asset; verify only then can manual GO run.
- Disconnect the network and verify loaded GO/STOP/fade/STOP ALL still work.

Do not describe paid audio generation, automatic execution, portable media backup, or professional native routing as implemented.
