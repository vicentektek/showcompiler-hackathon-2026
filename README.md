# ShowCompiler — Meta Global AI Developer Hackathon 2026

ShowCompiler is a new, hackathon-only browser prototype for turning theatre scripts into human-reviewed sound-cue plans. It combines opt-in Meta Muse Spark analysis with deterministic local audio playback. No code was copied from the earlier SHOWCOMPILER repository.

**Current truth:** the Meta and Baseten adapters, strict validation, review workflow, and browser audio engine are implemented. The user successfully completed one guarded live Meta Muse Spark 1.3 smoke test (1 valid bell cue, 3.968 s, 1,170 tokens), and manually confirmed AI proposal and approval into DRAFT in the browser. Baseten live inference and paid audio generation remain unverified/unimplemented.

## Run locally

Node.js 20 or newer is required; there are no npm dependencies to install.

```sh
npm test
npm run check:syntax
npm run demo:package
npm run dev
```

Open `http://127.0.0.1:5173` in Chrome or Edge. English is the default interface; Spanish is selectable. `npm run demo:core` runs the terminal-only review demonstration.

## Implemented

- Import a UTF-8 script without translating or rewriting it. Stable `L1`, `L2`, … references always point to the original source.
- Plan bounded scene-aware analysis windows: 60 core lines plus up to three read-only context lines. One expressly confirmed Meta request analyzes at most two windows and returns at most eight rich transient suggestions. Later windows require another explicit click.
- Distinguish explicit acoustic directions, creative atmospheric suggestions, dialogue-only mentions, continuing ambience, stop/silence intent, and playable cues. Exact source evidence and original-language labels are validated locally.
- Analyze a show with no audio library. A valid missing sound uses `assetId: null` and a nonempty acoustic `soundPrompt`.
- Keep every AI result `PENDING` until the operator approves or rejects it. Approval creates a `DRAFT`; it never executes audio.
- Resolve approved sound needs in three ways: choose an existing library asset, decide later, or prepare future AI generation. The third choice records intent only—no generation request or charge occurs.
- Block **GO** for unresolved `PLAN_AUDIO` cues and for missing decoded files. The browser audio engine independently enforces this rule.
- Load a supported local file directly from an approved cue, automatically register/link the audio, or replace its file while retaining cue number, approval and source references. No network call is made for audio attachment.
- Run approved `PLAY` cues using local Web Audio with manual **GO**, **STOP**, **FADE 1.5 s**, and **STOP ALL**. Playback performs no AI or network call.
- Export and reopen strict versioned project JSON. Audio bytes, UI locale, analysis coverage, provider diagnostics, and transient `CueSuggestionV2` fields are deliberately excluded.
- Use either the first-party Meta Model API or the Baseten-hosted Muse Spark Open fallback. Keys stay in the local Node process; WAV/MP3 bytes are never sent.
- Measure offline exact-line precision, recall, F1, forbidden triggers, duplicate proposals, and hallucinated source references with rights-clear synthetic fixtures.

## Integrated portable-show demo (draft branch)

On the integration branch (PR #22), the browser has a self-contained `.showcompiler.zip` format with original WAV bytes, checksum validation and transactionally staged import. Select **Try with real sounds** for an 11-line example with three synthesized WAVs and three manually approved DRAFT cues; playback starts only after operator GO. A synthetic demo package can also be built offline using `npm run demo:package`.

JSON export still excludes audio content. A cue's optional `automation` settings can be stored, but AUTO_CONTINUE/AUTO_FOLLOW are intentionally **not wired into browser GO**. The prototype has no per-playback-instance fading, true infinite loop, independent monitor bus, hardware routing, ASIO or native Windows installer.

GitHub Actions validates the Node suites, syntax, demo ZIP construction and independent ZIP structure. Browser acceptance, real speaker output and operator verification remain pending.

See [portable show documentation](docs/PORTABLE_SHOW_ARCHIVE.md) and [technical integration audit](docs/SECOND_PASS_TECHNICAL_AUDIT_2026-10-27.md).

## Meta contract smoke test

The smoke command is intentionally separate from tests and the development server. It makes exactly one potentially billable request, uses a three-line synthetic script with no assets, performs zero retries, and prints only sanitized metadata.

```powershell
$env:MODEL_API_KEY = '<set locally; never commit>'
npm run smoke:meta -- --authorize-one-billable-meta-request
```

Do not run it merely to execute the test suite. A timeout may still have consumed provider tokens. The user has run this guarded command successfully once. Do not rerun it routinely: every invocation may consume Meta credits. Direct audio attachment still requires manual listening acceptance.

## Safety and scope limits

- The loopback server binds to `127.0.0.1`, serves an allowlist, and requires same-origin JSON POSTs for inference.
- Provider errors are reduced to safe categories, a local request ID, status, phase, latency, finish reason, token counts, and allowlisted error `type`/`param`/`code`. Keys, full scripts, upstream messages, and raw provider bodies are never logged or returned.
- No inference request is automatic and no request is automatically retried.
- Project JSON remains schema v1. It supports both executable `PLAY` and unresolved `PLAN_AUDIO`; older builds may reject v1 files containing the later action.
- Browser audio is a local prototype, not certified professional show control. Native WASAPI/ASIO, hardware routing, desktop installation, and paid sound generation remain future work. A bounded browser show ZIP with original audio is implemented but not yet manually accepted.
- First-party Meta smoke and one browser analysis/approval were verified by the user. Baseten live inference and direct audio-link/replacement still need manual verification; browser audio also needs audible acceptance. There is no independent preview bus. A limited self-contained media ZIP exists in this draft branch.

## Documentation

- [Meta Model API contract and setup](docs/META_MODEL_API.md)
- [Technical research and evaluation record](docs/META_API_TECHNICAL_RESEARCH_AND_EVAL_2026-10-26.md)
- [Theatre cue evaluation](docs/THEATRE_CUE_EVALUATION.md)
- [Sound-planning decision](docs/ADR-0002_SOUND_PLANNING_GENERATION_FLOW.md)
- [Internationalisation architecture](docs/I18N_ARCHITECTURE.md)
- [Persistence contract](docs/PERSISTENCE.md)
- [Browser acceptance](docs/UI_PROTOTYPE.md)
- [Hackathon contribution log](docs/CONTRIBUTIONS.md)

## Contribution boundary

Work remains on isolated feature branches and draft pull requests until review; do not merge to `main` automatically. Keep dated commits and truthful capability statements. Never commit credentials, account/billing data, private scripts, raw provider responses, or unlicensed media.
