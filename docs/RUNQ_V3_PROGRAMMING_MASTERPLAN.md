# RunQ V3 — Product delivery master plan
Status: planned implementation. Date: 2026-10-27.
Public-safe original design and delivery contract. No historical repository, competitor, personal or billing identifiers.

## Mission and honest capabilities

RunQ is an operator-controlled workstation for scripts, cues and sound. Its operator can create an entire show manually, optionally review AI suggestions linked to original source lines, attach and edit real audio, then operate deterministic GO, STOP and STOP ALL.

The current delivery target is a browser/Web Audio demonstration. A professional Windows audio engine, true multichannel routing, independent PFL, hardware timecode and voice auto-GO are NOT currently verified capabilities.

### Identity and transport invariants

- Selected cue: editing context only.
- Prepared cue: destination of NEXT GO, changed only by explicit prepare or documented successful advance.
- Active run/voice: physical playing instance, never identical to an asset or selected cue.
- Pending GO: potentially delayed device/context start; STOP must invalidate it before playback.
- Pending AUTO: forbidden in the current live UI until the single transport guard is implemented and race tested.
- Audition: real local file preview, but SHARES the system output at present.
- Unsaved edit: local draft only; never silently mutates a running sound.

Selecting, dragging, searching, switching workspace, opening source reference, or reviewing model output MUST NOT trigger sound or change NEXT GO. Source files and original script text are immutable.

## Baseline and integration

Start from the current unified manual/creative feature branch. Selectively integrate independent QA updates only after inspecting diffs. Do not start from the standalone visual v2 branch or unintegrated default branch. Record baseline commit, browser captures, fixture JSON/ZIP, test results, and original show-opening behavior.

Keep feature work in bounded branches and pull requests. No automatic merge to main; no live/paid model calls during tests. The professional V3 prototype is a design target, not an implemented playback engine.

## Eight connected workspaces

**Home** — New, Open JSON, Import complete ZIP, Demo, plus recent-project tiles ONLY after durable recent-project persistence is implemented. Avoid invented recovered projects.

**Cue Editor** — Primary target. Dense accessible sequence table, Add/Insert/Duplicate/Delete/Move, actual multi-track cue actions, independent selected versus prepared markers, filter and keyboard navigation, right-hand inspector with Basics / Audio / Actions / Timing / Script / Notes. Inactive/unsupported controls are disabled with explanatory messages, not decorative.

**Script** — Original imported text and stable L#; scenes/characters index, search and bidirectional cue links; changing the source requires explicit revision mapping.

**Audio** — Library -> actual PCM-derived stereo waveform -> editable IN/OUT/fade/loop handles -> per-track settings. Non-destructive; each reuse of a file may have an independent region. Save and playback support must agree. Prelisten shares the same system output until true monitor routing exists.

**AI Creation** — Import context, opt-in bounded analysis, evidence-backed suggestions, Review and Apply. Manual cues need no AI. AI cannot execute sound or silently modify cues.

**Rehearsal** — Script plus cue queue and manual transport, notes and optional suggestion-only transcript. Full voice following or automatic firing remains a later gated feature.

**Operation** — Large GO, separate targeted STOP/FADE and STOP ALL, visible NEXT, active voice instances, pending starts, readiness and diagnostics. Structural editing locked during sound. No false claim of LIVE-certified mode.

**Settings** — Device and capability truth, visual density, language, keyboard mapping, project profiles and opt-in provider settings. UI preferences separate from show JSON. Unsupported outputs not selectable.

## Application architecture

Extract UI progressively from the current monolithic browser controller, not in a one-shot rewrite. Suggested boundaries:
- appShell, cueSequence, cueInspector, audioWorkspace, waveformCanvas
- scriptWorkspace, aiReview, rehearsalWorkspace, operatorDashboard, settings
- shared presentation selectors and a small action/transport adapter owned by the existing runtime

Use ONE authoritative project object and ONE transport authority. Every UI command is explicit, named, validated and safe to repeat when appropriate. Editing state is distinct from persisted project and from audible runtime. Preserve English-first and Spanish localization. Support keyboard and 200% zoom.

## Ordered work packages

| ID | Task | Dependency | Acceptance |
|---|---|---|---|
| V3-00 | Lock and regression-test unified baseline | existing code | ZIP, manual creation and Chrome safety checks green |
| V3-01 | Shell, navigation and view models | V3-00 | navigation cannot alter NEXT or fire GO |
| V3-02 | Cue table and inspector rebuild | V3-01 | create/edit/inspect 84 cues without full page hopping |
| V3-03 | Real waveform peaks and viewport | V3-00 | PCM extrema match file; stereo and zoom tested |
| V3-04 | Saved IN trim and graphic fades | V3-03 | numeric/drag edits survive JSON/ZIP and change GO |
| V3-05 | Saved OUT trim and looping region | V3-04 | region bounds honored at source, not just cosmetic |
| V3-06 | Script/AI connected workflows | V3-02 | exact L# and explicit review preserved |
| V3-07 | Operation and transport hardening | V3-02 | active/pending states truthful; emergency cancellation |
| V3-08 | Manual rehearsal experience | V3-06, V3-07 | no unauthorized voice-driven playback |
| V3-09 | Settings, layouts and demo package | V3-01..08 | accessible verified Windows/browser showcase |
| V3-10 | Later native/hardware engine | V3-05, V3-07 | independent physical hardware testing required |

Parallel work is possible on V3-02 and V3-03 once a shared state boundary exists.

## Deadline strategy: 4 November 2026

P0: stable unified baseline, V3 editor and inspector with actual manual controls, source-linked AI review, real waveform preview, existing persisted playback settings, deterministic GO/STOP, complete portable ZIP, Chrome/Windows operator acceptance.

P1 only after P0: OUT region, custom loop in/out, multi-track waveforms, improved preflight and batch editing.

P2 later: fully native audio I/O, independent monitoring, MIDI/OSC/lighting/timecode, autonomous speech following, advanced track automation, desktop installer and device profiles.

Do not replace a real capability with a simulated graphic to meet the deadline. A feature is delivered only when engine behavior, persistence and UI agree.

## Quality gates

1. Offline syntax + unit tests + Codex synthetic review gate. CI never reads secrets or makes paid requests.
2. Original show JSON and full ZIP fixture roundtrip (including WAV bytes, source lines and multi-track metadata).
3. Deterministic browser smoke: empty, 1, 8, 84 and 500 cue shows; keyboard, search, selection vs NEXT GO, STOP ALL and no accidental playback.
4. Media tests: PCM peaks, stereo, silence, short sample, clip boundary, fade overlap, loop behavior, repeat semantics, rate and out-of-range rejection.
5. Screenshot tests at 1920×1080, 1366×768, 1093×614, 125%/200% zoom and reduced motion.
6. Physical Windows low-volume audition for trim/fade, multiple simultaneous voices and explicit emergency stop. CI success is not evidence of this test.
7. Security/privacy: no credentials, upstream raw scripts, provider responses, copied research or unlicensed media in public files.

## Production walkthrough

New blank show -> Add three cues -> Attach local stereo audio -> View actual L/R waveform -> Edit region -> Save -> Reopen -> Verify sound boundaries -> Import script -> Approve optional AI suggestion -> Go to Operation -> Prepare -> Manual GO -> targeted fade/STOP -> STOP ALL -> Export complete show -> Reopen offline.

Every step must be linked by actual UI controls. One selected cue should retain its identity across Editor, Script and Audio; opening Audio never silently changes NEXT.

## Execution discipline

Read AGENTS.md plus this plan and one bounded work package at a time. Branch from a pinned integrated candidate. For every slice: test first, implement, run focused tests, full offline QA, screenshot and report. Explicitly label implemented versus preview-only or blocked on schema/hardware. Do not merge or call paid inference without authorization.
