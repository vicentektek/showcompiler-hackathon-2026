# Project persistence — schema v1

Implementation: `src/core/projectPersistence.mjs`
Automated coverage: `test/projectPersistence.test.mjs` and workflow/audio-planning integration tests.

## Contract

```js
import { serializeShowProject, deserializeShowProject } from './src/core/projectPersistence.mjs';

const json = serializeShowProject(project);
const restored = deserializeShowProject(json);
```

The codec is pure: it validates and canonicalizes project objects and JSON text. It does not access the filesystem, call a model, generate or decode audio, play a cue, or use browser storage. The browser UI provides explicit JSON download/open controls around this codec.

## Persisted fields

Schema v1 stores:

- `schemaVersion: 1`, project ID, and project name;
- authoritative original `scriptText`, from which stable line references are derived;
- audio assets as `{ id, name }` metadata only;
- proposals with `PENDING`, `APPROVED`, or `REJECTED` state and optional validated provenance;
- approved `DRAFT` cues linked to exactly one source proposal;
- one or more validated actions:
  - executable `{ "type": "PLAY", "assetId": "…" }`;
  - unresolved `{ "type": "PLAN_AUDIO", "prompt": "…", "resolution": "DEFER" | "GENERATE" }`.

`GENERATE` records preparation intent only. It is not a generation job and does not imply that a provider was contacted.

## Deliberately not persisted

- audio bytes, decoded buffers, file-system paths, or live device handles;
- runtime state such as PLAYING, pending GO, timestamps, fades, or active voices;
- API keys, account/billing data, raw provider responses, or full diagnostic logs;
- UI locale and script-language hint;
- scene/window coverage and next-batch position;
- transient `CueSuggestionV2` details, non-PLAY observations, deduplication metadata, and safe request diagnostics;
- generated-audio jobs or candidates (none are implemented).

The new analysis pipeline therefore makes **no change** to the persistent project shape or schema version.

## Validation and limits

- A cue persists only when its parent proposal is approved and line references/actions still match.
- A `PLAY` action must reference a known asset. A `PLAN_AUDIO` action needs a nonempty prompt no longer than 500 characters and a supported resolution.
- Unknown fields, malformed JSON, unsupported versions, missing references, invalid state, duplicate IDs/cue numbers, and divergent proposal/cue actions are rejected.
- Maximum JSON: 2 MB; script: 500,000 characters; assets: 500; proposals: 100; cues: 2,000.
- Live transport state is never serialized.
- Audio data are not embedded: JSON export is not a complete or portable show backup.
- No compatibility with the earlier pre-hackathon application's format is claimed.

## Directional compatibility note

The current strict v1 reader accepts older projects containing only `PLAY`. During the hackathon, schema v1 was extended to accept `PLAN_AUDIO`. Consequently, an older ShowCompiler build that knew only `PLAY` may reject a newer v1 document containing `PLAN_AUDIO` even though the version number is still 1.

This historical limitation is now documented. Do not silently add further persistent fields or action types to v1. A production release should introduce an explicit schema v2 with a tested v1 migration and clearly defined export compatibility.

## File workflow and manual checks

The UI can download validated JSON and reopen it. On reopen:

1. original script text and line references must be identical;
2. proposal decisions, provenance, cue numbers, and `PLAN_AUDIO` resolution must roundtrip;
3. transient coverage/diagnostics must be absent;
4. audio must be reloaded locally before any `PLAY` cue can GO;
5. invalid or future JSON must leave the current show unchanged.

A future portable package needs separately validated media files, relative paths, hashes, license/provenance metadata, and recovery behavior. Do not call the current JSON a show backup.
