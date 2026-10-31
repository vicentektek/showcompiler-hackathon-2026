# RUNQ overnight recovery report — 2026-10-31

Rolling state report for resuming the current work; not a claim that the full sprint is complete.

## Repository

- Branch: `feat/runq-ai-context-hardening-2026-10-31`
- Validated checkpoints: `143bd86` (context), `53e4047` (Rehearsal), `cd7d40d` (Last GO/Hero), `b908470` (main AI), `ac9e106` (dictation), `0975476` (Stage/Library gates), `8cce4ac` (Live layout), `79702d1` (Windows). Consult `git log` for the current documentation/candidate HEAD.
- Parent product work: verified RUNQ interface/Setup checkpoint; integrated portable-demo branch is an ancestor and exists in a separate worktree.
- Pre-existing local file: `respaldo-runq-cambios.patch` is untracked and untouched. Do not stage it.
- Initial full backup and targeted pre-edit backups: see `docs/RUNQ_AUTONOMOUS_SPRINT_2026-10-31.md`; all created outside Git and SHA-256 verified.

## Current change

Current state at 12:26: the dependency-free Windows EXE/browser package compiles and passes verification from an independently extracted ZIP, including 165 payload hashes, actual bundled Node/HTTP, Last GO WAV decoding, reviewed Hero apply, complete ZIP export/reload/reopen, GO/STOP ALL and process/port shutdown. The launcher is unsigned, not an installer or native audio engine. Build outputs remain external; the final delivery will be rebuilt after source commit so its recorded revision matches validated committed source.

`npm run qa:codex` now passes **661/661** tests, existing and Windows syntax checks, illustrative cue QA and the nine-script seminar contract. The extracted-package gate passes. Previous local Agent QA passed **600/600**, with zero provider calls; this does not measure Muse, Modal or Fireworks. Responsive interface, dictation, Last GO and transport browser gates are being repeated for candidate acceptance.

The Windows source was committed at `79702d1` after a verified external backup of all 11 pending files, including the unstaged patch. The build from that committed source and its independent extracted-package test passed. The malformed PowerShell `npm.ps1` flag forwarding was caught before output; `npm.cmd` preserves the flags and the documented rebuild command is corrected.

Local candidate reference: `feat/runq-release-candidate-2026-10-31`, to be created from the validated documentation handoff HEAD without switching worktrees. Rebuild the final attached ZIP from that reference, report its actual checksum and verify the extracted EXE again. No main merge, push, public release or new CI execution has occurred. Paid campaign authorization is recognized, but current coding-agent execution constraints leave billable live commands and keys to the operator; Baseten remains excluded. Physical microphone, hearing, device routing and paid model quality are not measured by these gates.

### Candidate acceptance evidence

Continued after the initial candidate: narrow loaded-show screenshot review reproduced Live inspector clipping (358px available / 615px content). Original sequence/status now stack within narrow Stage containers; wide resize preferences are retained/restored and reset still works. Full interface, real-WAV Last GO, Stage safety and **661/661** offline tests passed. The packaged gate now also checks this actual Chrome geometry and captures the original three-cue show at 768px. Preserve initial `f5ff320` and create a fresh `feat/runq-release-candidate-v2-2026-10-31` from the validated follow-up; no ref overwrite.

- PASS: `npm run qa:codex` (661/661 Windows tests, existing/Windows syntax, illustrative cue QA, seminar contract).
- PASS repeated: `npm run test:interface`, `npm run test:dictation`, `npm run test:last-go`, `node tools/rehearsal-auto-browser-e2e.mjs`, `node tools/stagecraft-cue-safety-e2e.mjs`, `node tools/browser-e2e.mjs`, `node tools/runq-agent-browser-e2e.mjs`, `node tools/voice-follow-click-e2e.mjs`.
- PASS earlier: keymap, audio batch and SFX Lab browser gates; `npm run qa:agent:mass` (600/600 local scenarios, not real-model accuracy).
- PASS: committed-source Windows build via `npm.cmd run demo:windows -- ...` and `npm run test:windows-package -- <independently extracted root>`. Original Last GO script/audio, reviewed Hero, complete four-cue/three-WAV browser reopen and clean PID/port shutdown were exercised.
- Screenshots: approved-mockup-informed before/current AI views and loaded Studio/Library/Script/Rehearsal/Live captures remain external. The early empty Studio frame is explicitly not valid loaded-show evidence.
- Windows delivery instructions: [Windows browser package](demo/WINDOWS_BROWSER_PACKAGE.md); reproducible original demo: [The Last GO](demo/THE_LAST_GO_REPRODUCIBLE.md).
- Genuine outstanding acceptance: human acoustic/device/room/ASR checks and operator-run Meta/Modal/Fireworks measurements under existing budgets. No Baseten, key read, ledger reset or paid call was performed by this coding session. CI URL: none; no remote run was requested or created.

### Historical checkpoints (11:40 onward)

Latest state at 11:40: The Last GO and reviewed Hero cue creation are integrated, with reproducible original WAVs, save/export/reopen and real browser-engine playback. Rehearsal has a visible shared Assist/Autopilot selector and corrected labels. RUNQ AI is now a principal two-column workspace using the same contextual Agent instance; history, selected operations and provider/manual proposal forms are preserved. No network or automatic GO is added by navigation.

Current gates: `npm run qa:codex` passed syntax and **650/650** offline tests. Interface, Agent, Last GO, expanded Rehearsal and general browser E2E passed. Last GO speech events are injected; this is not a real microphone/ASR or physical acoustic measurement. Before/after screenshots for six workspaces are local session evidence, excluded from Git.

Next task: explicit dictated Agent editing and late-result cancellation. Paid provider campaigns remain operator-run under effective project restrictions; Baseten is excluded. Physical ASR/audio validation and Windows packaging still require separate evidence. No push, CI run or merge has been performed, so there is no new CI URL.

### Earlier context-hardening block (historical)

Update after the dictated-command block: main AI workspace checkpoint `b908470` is preserved. Agent and Cue Editor now share explicit bounded mono-WAV capture and epoch-bound cancellation; transcripts never auto-submit/apply. Stage, STOP ALL, close/cancel and identical project replacement reject late results. Operator-selected microphone and strict duration/consent are covered by seven new tests. Current offline gate is **657/657**, not the historical count below. Dictation, Last GO, Agent, responsive interface, general browser, Voice Follow and Rehearsal browser gates passed. One independent Stage safety browser gate still references a removed legacy Setup control; repair that gate next before candidate sign-off.

12:00 update: dictation checkpoint is `ac9e106`. Remaining Stage safety, keyboard, Library batch and Sound Lab gates now pass after aligning obsolete test paths with the current UI. Local Agent mass QA passed 600/600; this is not remote model evidence. Continue Live read-only Script accessibility and Windows launcher feasibility, then candidate handoff; real provider/hardware acceptance remains explicitly unmeasured.

Live layout update: Stage/Library gates were committed in `0975476`. The original-script toggle now has real accessible Show/Hide labels; its sidebar truly resizes/persists/resets. Responsive testing found and fixed the prepared/GO dock collapsing into a tall narrow column with the script open. Container-based stacking and stored-width clamping keep GO and the script toggle usable even at 768x900. All six current screenshots wait for complete Last GO ZIP import and decoded audio; the early empty Studio frame is excluded as a loaded-show comparison. Continue the feasible Windows launcher package next.

AI context hardening across the single-cue conversational editor and Studio Agent. The editor sends only bounded selected-cue data, linked script references, a small scene excerpt and linked audio titles after explicit one-shot consent; the Studio Agent now receives active design workspace/mode/selected cue identity, and its disclosure describes the bounded show context. The duplicate Cue Editor AI shortcut that was hidden by CSS was removed; the original visible editor remains the single entry point.

Changed code/test paths: `src/core/agentCore.mjs`, `src/core/cueConversation.mjs`, `src/ui/app.mjs`, `src/ui/cue-conversation-ui.mjs`, `src/ui/runq-agent-ui.mjs`, `src/ui/runq-workstation-v14.mjs`, `tools/agentRoutes.mjs`, `tools/cueConversationRoutes.mjs`, `tools/interface-browser-e2e.mjs`, `tools/runq-agent-browser-e2e.mjs`, `test/agentCore.test.mjs`, `test/cueConversation.test.mjs`, and `test/cueConversationRoutes.test.mjs`.

## Verification state

- Baseline: syntax passed; 634/634 Node tests passed.
- After implementation, focused conversation/route suite passed 14/14 and Agent core/route suite passed 13/13.
- Final `npm run qa:codex`: syntax passed; `npm test` passed 637/637; cue QA passed with clearly labeled synthetic-only metrics; seminar contract passed for 9 scripts, 13 scene windows and 49 annotations. No provider calls.
- `npm run test:interface` passed all nine workspaces at four viewport sizes; it verified explicit bounded context, distinct fade-in/out, manual transport and no external submission from local proposals.
- `node tools/runq-agent-browser-e2e.mjs` passed with a locally intercepted one-shot request and verified active workspace, mode, selected cue, apply/undo and Stage/Ensayo isolation.
- `node tools/browser-e2e.mjs` passed transport separation, complete ZIP download/reopen, tampered ZIP rollback, script-preserving locale change and zero external calls.
- Demo generator and existing portable archive both reopened in memory with 11 original script lines, 3 cues and 3 synthetic WAVs; the existing archive hash remained unchanged.
- The Cue Editor consent now explicitly discloses linked-audio status/titles and that no audio files are sent; its final browser assertion passes.
- Provider cost in this session: $0; no provider credentials read and no live requests. Browser/audio hardware, real microphone, external model quality, and actual The Last GO rehearsal remain unverified.

## Resume order

1. Use the fresh local candidate and verified attached Windows ZIP for operator acoustic/ASR and authorized provider measurements; retain script/source provenance and explicit approvals.
2. Keep generated QA reports local/ignored and the untracked patch intact.
3. Continue only with bounded, verified tasks; use a human for hardware/acoustic acceptance. Do not run paid models, merge, or claim hardware acceptance.
