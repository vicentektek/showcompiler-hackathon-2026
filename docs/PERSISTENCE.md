# Project persistence (schema v1)

Implementation: `src/core/projectPersistence.mjs` — **hackathon-only**. Automated coverage: `test/projectPersistence.test.mjs`.

## Contract

```js
import { serializeShowProject, deserializeShowProject } from './src/core/projectPersistence.mjs';

const json = serializeShowProject(project);
const restored = deserializeShowProject(json);
```

This module is intentionally **pure**. It converts between a validated project object and a JSON string. It does **not** write files, install codecs, call models, play audio, or manage local storage.

The current v1 document stores:
- `schemaVersion: 1`, project ID and name
- Original `scriptText` (including its line endings), used to derive line references
- Audio assets as `{id, name}` **metadata only**
- Cue suggestions with status `PENDING`, `APPROVED` or `REJECTED`
- Reviewed `DRAFT` cues with a verified `sourceProposalId`, references and `PLAY` action(s)

## Deliberate constraints

- Supports **PLAY only** in the current prototype; STOP/FADE require a separate domain and persistence migration.
- A cue can only be persisted if its original proposal is approved and its references/actions still match.
- No live runtime state (`PLAYING`, GO, timestamps or transport) is serialized.
- Maximum JSON size: 2 MB; maximum script length: 500,000 characters; 500 audio metadata entries; 100 proposals; 2,000 cues.
- Rejects unknown fields, malformed JSON, future versions, missing references, duplicate IDs or cue numbers, and missing assets.
- Audio file data are **not** included: JSON export is **not** a portable or complete show backup.
- Does not persist to disk yet: file save/open UI is future work.
- No compatibility with the older application's project format is claimed.

## Next steps

Build a user-initiated save/open UI with transparent JSON download/upload, and later a separately specified, validated asset package export. Never claim that a project is portable until its binary audio assets are included and verified. Keep the provenance log and commit dates updated.
