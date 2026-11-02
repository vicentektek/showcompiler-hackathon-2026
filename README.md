# ShowCompiler — Meta Global AI Developer Hackathon 2026

ShowCompiler is a new, hackathon-only browser prototype for turning theatre scripts into human-reviewed sound-cue plans. It combines opt-in Meta Muse Spark analysis with deterministic local audio playback. No code was copied from the earlier SHOWCOMPILER repository.

**Current truth:** the Meta and Baseten adapters, strict validation, review workflow, and browser audio engine are implemented. The user successfully completed one guarded live Meta Muse Spark 1.3 smoke test (1 valid bell cue, 3.968 s, 1,170 tokens), and manually confirmed AI proposal and approval into DRAFT in the browser. Baseten live inference and paid audio generation remain unverified/unimplemented.

## RUNQ RC1 candidate (29–30 October 2026)

The current integration candidate lives in `integration/runq-demo-2026-10-30`, based on V15 (PR #110), with selected safety fixes from audit PR #109. The repo's `main` branch is not this runnable release. The precise candidate changes and remaining checks are tracked in [the hackathon execution plan](docs/RUNQ_HACKATHON_EXECUTION_PLAN_2026-10-29.md).

Windows developer quick start in a **separate worktree** (does not touch another checkout):

```powershell
git fetch origin
git worktree add "..\\runq-demo-2026-10-30" origin/integration/runq-demo-2026-10-30
cd "..\\runq-demo-2026-10-30"
npm install --no-audit --no-fund
powershell -ExecutionPolicy Bypass -File .\\tools\\runq-preflight.ps1 -RunTests -StartServer
```

Use Chrome/Edge on the local address printed by the preflight. This script does not read secrets or contact paid AI providers. Offline CI is not certification for live-show use. The browser uses the system's default audio output for show and preview; there is no isolated PFL bus. JSON stores references but **not audio bytes**; export a full show ZIP to move/reopen media. Modal SFX generation needs separate provider and cost-policy configuration and is not a prerequisite for the offline demo.

## Run locally

The reference-led RUNQ interface now puts sound design with RUNQ AI on the
project home screen. Project export is available in the active-project card
and **Menu > File**; global STOP ALL is contextual and remains visible whenever
audio is active or pending. See the [progressive visual redesign](docs/RUNQ_VISUAL_REDESIGN_2026-10-31.md)
for scope, offline acceptance and deferred features. Restart an already-running
development server to publish the new backstage asset.

Node.js 20 or newer is required. Run `npm install` to install pinned `libarchive.js` for RAR/7z imports before testing.

```sh
npm test
npm run check:syntax
npm run demo:package
npm run dev
```

Open `http://127.0.0.1:5173` in Chrome or Edge. English is the default interface; Spanish is selectable. `npm run demo:core` runs the terminal-only review demonstration.

### Prepare a show with RUNQ AI

Open `http://127.0.0.1:5173/?workspace=ai` to use the guided workflow on the
active show. Its five stages cover the original script, cue proposals, sound,
cue configuration and preflight. The canvas shows one task at a time, while
the stage bar and left-side routes let you start from the script, a cue, audio
or a request to RUNQ AI. A persistent right panel keeps the active show, cue,
source-line and audio context visible. Proposals remain reviewable and require
explicit operator approval. Navigation does not submit provider requests or
start playback. With a script loaded, **Suggest cues to review** jumps directly
to the existing proposal flow; the Sound step shows each approved cue's
suggested sound and opens the sound desk with that cue selected. The review
step can approve all pending proposals together, with the existing explicit
confirmation and undo. Provider settings stay under optional advanced settings,
while explicit AI action buttons start bounded requests through server cost controls,
without a second permission checkbox or dialog.
Opening **Prepare sound for this cue** now fills the English sound prompt,
estimates duration from a recognized script direction, and pins its L# and cue
destination. For a cue with an active generation, RUNQ checks readiness and
loads the WAV without playing it; one explicit accept action assigns the take
to that cue. Listening first is optional. If a Spanish cue idea is
not recognized by the offline sound compiler, the interface flags that it needs
an English rewrite rather than claiming it translated the text.

Run `npm run test:product` for the offline unit and browser regression suite,
including the integrated Show Builder. Tests use local fixtures and mocked
providers; they do not measure live-model quality or generate billable audio.

### Bulk preparation

**RUNQ AI** has a dedicated preparation card with four numbered stages, accessible
progress bars and icon-labelled actions. The same sound batch controls are available
in **Sound > Generate**:

- **Accept all cues** confirms all reviewed pending proposals together, creating
  DRAFT cues without playback. Preparation also fills missing **operation triggers**
  with the last 4–8 words of nearby preceding actor dialogue (`ACTOR: speech`),
  without overwriting operator text or changing the cue's original sound L#.
  The local search is limited to 12 preceding lines and stops at scene boundaries;
  repeated/ambiguous phrases, missing references and missing reliable dialogue
  remain pending manual review instead of using unspoken stage directions.
  The preparation card shows the feet and L# references; edit them in Cues.
  Existing feet are preserved, including older operator/stage-direction feet:
  review them before arming Autopilot. These are source-backed suggestions, not
  verified speech recognition or automatic arming/GO.
  Individual rejection and approval remain available.
- **Generate audio for all** immediately starts a serial batch for pending
  single-action sound cues, without replacing existing audio or asking for repeated
  permissions. **Adjust batch · optional** lets you edit prompts or select cues.
  This is also available in
  **Sound > Generate**. Unsupported music/voice and non-sound cues are excluded.
  The batch records each cue separately (submitted, generating, ready, failed or
  uncertain), preserves completed WAV references and can resume an already
  submitted job by request ID after a reload. A failed cue does not erase or
  re-send completed work; daily/provider limits still stop new submissions.
  **Stop batch** only stops local tracking and new submissions; requesting
  remote cancellation is a separate per-take action. Checking a take never
  creates a duplicate or starts playback.
- **Auto prepare entire show** starts analysis of remaining script windows.
  **Include all sounds** is on by default: after reviewing proposals, choose
  **Accept all and generate sounds** to continue directly with every eligible cue.
  Turn that option off for analysis only. A shortcut is on Project.
  It is one preparation entry point, not unattended approval or execution.
  Existing cues also receive missing operation triggers when starting preparation
  or a sound batch; this is local and does not require another model request.
- **Accept all sounds** accepts and assigns all ready batch takes to their original
  cues, without requiring prior listening. Changed or already assigned cues stay out
  of the batch. Each result in RUNQ AI also has **Listen / Stop preview** and
  **Accept and assign** actions that stay on that screen; **Edit take** opens Sound.
  Existing IN/OUT/fades are preserved; an unedited take uses its full duration.
  Reopening a show does not impose a listening prerequisite.

Accepting or assigning a take releases Sound's own preview before saving, so you
do not need to stop that preview first. It never stops a running show cue or changes
prepared GO/NEXT. An already saved generated take can be assigned or used to create
a cue without duplicating its verified library asset. For a free generated take,
the destination selector is next to **Save + assign**, not hidden with the
library-only editing controls. Assignment progress counts
completed cue imports; generation progress counts completed jobs, not an invented
GPU percentage. Single-take work shows indeterminate activity while loading or waiting.

### Assistant audio edits

The assistant can propose primary audio assignment/replacement from decoded library
assets, extra audio layers (add, replace, edit or remove), playback gain/pan/rate,
trims, delays, repetitions, loops and fades, overlap policies and targeted stops.
The same strict editor validators run during preview and again on **Apply**.
All edits remain reviewable and undoable; unavailable files cannot be assigned.

For example: “cue 1 debe ser loop” and “el último cue debe detener el cue 1 con
un fade out de 5 segundos”. Enabling a continuous loop clears an existing automatic
ending fade and finite repeat count; these changes appear in the preview.
The final cue's targeted 5000 ms stop fade is separate from the looping source's
playback fade. It only takes effect on that cue's subsequent manual GO.
Invalid plans show actionable errors instead of claiming the edit succeeded.
No assistant tool executes GO, STOP, ARM or timed advances, or changes prepared GO
when applying/undoing nonstructural audio settings. No live-model quality or
hardware-output guarantee is implied by offline tests.

Meta and Modal requests run serially, without retries, through the existing
server-side reservation and spending gates. If a selected batch exceeds the configured
daily maximum, only the bounded first part runs and the rest is explicitly reported
as pending. Each server reservation still checks remaining historical budgets and
job limits; nothing raises limits or refunds unknown requests. **Cancel batch**, STOP ALL and show
replacement prevent further submissions and discard late results; cancellation
does not revoke already reserved costs. STOP ALL also invalidates pending batch
assignments, including a late WAV download or decode. Completed assignments remain;
there is no automatic retry. Explicitly accept ready takes for their original cues,
individually or together; listening is optional. No preparation action executes GO.

Cue/request associations persist in this browser's local storage, preventing
automatic duplicate generations after reopening the same show. Uncertain requests
require checking Sound history. These associations are not portable show media:
JSON retains cue/source and asset metadata, while a full show ZIP carries audio.
Do not clear history to retry an uncertain request.

Offline validation: `npm run test:show-preparation` (English/Spanish browser
journeys with mocked providers) and `npm run qa:codex` (regression gates). Neither
verifies live-model quality or consumes provider credits.

## Implemented

### Assistant workflow

RUNQ AI keeps alternate entry routes, one focused task and the active show
context together. **Ask RUNQ AI** opens the optional assistant in the context
panel without submitting a request. Expand the selected cue to inspect its
original L# evidence or open the editor. Starter actions only fill the request;
edit it and choose **Work with AI**, then review and apply selected changes.
This button and Ctrl+Enter start one bounded Meta consultation directly.
**Plan without AI** remains an explicitly offline alternative. Provider/context
details stay under **AI details · optional**. Sound attachment and dictation
are optional expandable controls. Discarding a proposal clears its pending task;
navigation and preparation never execute GO.
Dictation cancellation uses the shared supported status messages, so STOP ALL
also restores the recording controls without accepting late transcription.
Requests such as "prepara los cues" / "prepare the cues" now show numbered steps
and open the existing script-to-cue tools. Unsupported local requests explain
how to start an AI consultation rather than just saying "complex request".
The AI consultation action submits directly; navigation and script guidance never
submit, approve or play anything.

**Generate sound**, **Work with AI**, cue-editor **Send**, **Transcribe** and
voice **Start listening** are the explicit request authorization, without additional
permission checkboxes. Record still starts microphone capture explicitly; opening
a panel never uploads audio. Request authorization headers, exact SFX cost caps,
campaign/daily reservations and server rejection of unauthorized API calls remain
unchanged. Generated cues and sound takes still require human review before being
applied; voice-triggered rehearsal playback still needs separate explicit arming.

Read-only questions such as "Which audio is still unresolved?", "Is cue 2
ready?" and "¿Está listo el cue seleccionado?" use the local preflight checks.
They distinguish unresolved sounds, unavailable files and unverified loading,
name the affected cues, and explain the next manual step. Only confirmed decoded
audio passes the local audio check; unknown availability is not a pass. Pending
proposals remain subject to human review. These answers never play or edit cues,
call providers, or certify live-show readiness.
The offline assistant Gauntlet keeps new answers without a recorded semantic
review as `PENDING_REVIEW`, even when their structural contract passes. It does
not abort or automatically promote them to semantic successes; recorded local
review rationales are separate from model evaluation and new human validation.

### Generated sound audition

Ready takes have **Listen to sound**, **Stop preview** and volume controls beside
the result. Listen loads and decodes the selected WAV on demand and then auditions
it, without requiring acceptance or library import first. Repeated listening
reuses the decoded take; volume changes do not interrupt playback. Approval and
import remain separate human actions. STOP ALL or stopping a pending audition
invalidates late audio loads. Status checks remain explicit and never create
another take or retry an uncertain submission. This reduces local review steps;
it does not claim faster Modal GPU generation. Audition shares GO's output.

For a running generation, **Track readiness for 2 minutes** is an explicit
opt-in: at most 24 status checks, 5 seconds apart, stopping at completion or the
first error. It never resubmits a generation, auto-accepts or auto-plays audio.
Stopping tracking, STOP ALL, changing the take, hiding the page or leaving the
sound editor invalidates the remaining checks. No tracking resumes on reload.
**Use 3-second take** only edits duration and clears cost consent; shorter audio
is not a guaranteed inference speedup. The deployed pilot's actual cold-load
and inference time require separate measurements before changing GPU retention,
model steps or infrastructure. The local worker remains scale-to-zero with no
automatic deployment or new paid benchmark.

### Exhaustive campaign evidence review (1 November 2026)

`npm run qa:exhaustive` is offline: it replays retained typed Meta evidence and
exercises 100 original scripts, 102 conversations and 18 instrumented core
journey contracts. It preserves the shared ledger and makes zero provider calls.
The private results and exported corpus are in ignored `artifacts/runq-evals/`.
`quality.md` separates model observations, oracle checks and local simulations;
core journey PASS does **not** mean a full browser E2E or professional acceptance.
Some conversation requirements deliberately report FAIL to expose capability
gaps rather than hiding them. The 1 November fixes retain a bounded local
pending closing-cue task across long chats, resolve ES/EN renames offline, and
allow unresolved DRAFT cues to store validated playback settings. Those settings
do not resolve audio or permit GO. Pending task memory is cleared on cancel,
STOP ALL, apply/undo, project replacement and project edits; it is not persisted
in show JSON. If AI consultation is explicitly authorized, only a short labelled
task summary and at most seven recent turns are sent, never the local snapshot.
`npm run qa:quality:history` additionally measures existing original WAVs
without regenerating them and includes the same retained Meta replay.
Discarded reply text, labels and complete project snapshots cannot be recreated
from hashes. This review must not be presented as an improvement in Muse accuracy.

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

## Navigable professional-workspace prototype (PR #23, draft)

A separate browser UI branch introduces six functional workspaces without changing the validated audio backend, show schema or provider safety:

- **Script:** original source text, TXT import and stable L# navigation.
- **RUNQ AI / Show Builder:** a resumable five-stage project flow with one active task, alternate routes from script/cue/audio/request, and a persistent show-context panel; its sound stage lists current cues and opens the existing sound desk with the selected cue and original source line pinned.
- **Context inspector:** follows script lines, proposals, cues and audio across workspace changes; pinning a sound task keeps its cue destination fixed when selection changes.
- **AI & Review:** simulated/opt-in Meta proposals, explicit approval and source evidence; selected pending proposals can be approved or rejected together, with confirmation and undo while the show is unchanged.
- **Cue Editor:** full cue list, independent selection, contextual actions and editable operator label/trigger/notes; inspection never changes the prepared GO.
- **Audio:** local library, file loading and same-output audition; an accepted generated WAV can be saved and assigned to its pinned compatible cue in one confirmed action.
- **Setup:** truthful browser engine capabilities and live readiness checks; does not arm a professional live mode.
- **Operation:** prepared queue, manual GO/STOP/FADE, STOP ALL, and active cue cards.

Current modes are labelled **DESIGN · MANUAL** only. No automatic cue-follow, separate PFL, physical device routing, lighting output, native executable or safe live arming is implied. Saved cue automation metadata is not engine-executed. No filesystem-backed recent-project library exists yet. All workspaces use the same single in-memory active show; only explicit export saves it to disk.

To try the new interface in a separate worktree rather than switching the already checked-out integration branch:

```powershell
git fetch origin
git worktree add "..\\showcompiler-hackathon-2026-ui-2026-10-27" origin/feat/workspace-navigation-inspector-2026-10-27
cd "..\\showcompiler-hackathon-2026-ui-2026-10-27"
npm run dev
```

This checks out the remote feature branch in detached-HEAD mode (safe for local testing); do not make commits there without explicitly creating a local branch. Use another terminal or stop any prior local server to free port 5173. Check [PR #23](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/23) and its CI before relying on this interface.

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

Do not run it merely to execute the test suite. A timeout may still have consumed provider tokens. The user has run this guarded command successfully once. Do not rerun it routinely: every invocation may consume Meta credits. Direct audio attachment still requires explicit manual acceptance, not prior listening.

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
