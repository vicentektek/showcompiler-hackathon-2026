# RUNQ implementation progress — 2026-10-31

## Current checkpoint

Show Builder and the requested Studio/Script workflow are integrated in the current worktree. The local Meta connection display now separates configuration diagnostics from provider requests. Existing uncommitted work was preserved; no branch change, commit, merge, C1 task, live provider request, or paid operation was run.

## Complete and locally verified

| Area | State | Evidence / boundary |
|---|---|---|
| Five-stage Show Builder | Complete for current local workflow | Existing stage actions, project-derived checks, skip/navigation and persistence were retained and exercised by browser acceptance. |
| Studio cue toolbar/context menu | Complete for the listed edit operations | Actions reuse the original functional controls; browser acceptance verifies safe edits and menu behavior. |
| Script line toolbar/context menu | Complete for the listed source-line actions | Create, analyze, detect and ask route to existing handlers; E2E verifies L# creation, selected-line context, navigation and no automatic request. |
| Local Meta diagnostics | Complete for local endpoint/configuration checks | Safe GET status, categorized config issues, endpoint mismatch and unreachable-server UI states; no remote health claim. |
| Decoration-only controls introduced here | None in the audited toolbar/menu additions | Added entries call existing command controls rather than implementing a second mutation path. |
| Provider availability, real audio and hardware | Pending operator validation | Requires provider authorization or physical equipment; not proven by local tests. |

### Show Builder

- Five navigable stages use the current project, cues, audio references, configuration, and preflight state.
- Skipping a stage does not mark it complete; assistant progress is stored separately from project JSON.
- Stage actions reuse Studio tools. “Ask RUNQ AI” focuses the existing assistant and does not submit a request.
- The project task imports the original TXT into the active show and keeps the operator in Builder; acceptance verifies exact source text and stable L2 references.
- The cues task embeds the existing proposal review and consent-gated provider controls; proposal review expands to a usable single-column layout on narrow desktop.
- Browser acceptance covers navigation, omission, persistence, import, manual L# cue creation, and unchanged GO/audio/provider state.

### Studio and Script

- Cue operation toolbar has localized icon-and-label actions for add, insert, duplicate, move, and delete.
- Cue context menu reuses the existing controls for properties, sound assignment, insert, duplicate, move, and delete.
- Script line context menu reuses existing actions for manual cue creation from selected L# lines, selection analysis, detection, and contextual RUNQ AI.
- Keyboard/context-menu flows preserve source lines and do not execute GO or submit a provider request during preparation.
- E2E coverage checks English/Spanish layouts at 1920×1080 and 1440×900, plus additional responsive sizes.

### Local Meta diagnostics

- `/api/meta/status` reports safe issue codes for a missing key and invalid model; it does not return credentials or contact Meta.
- “Check local setup” issues one local GET only. UI distinguishes missing key, invalid model, provider mismatch, an unrecognized status endpoint, local server errors, and unreachable address/port.
- Actual provider failures remain in the existing typed POST error path; they are not inferred from a local status check.

## Verification performed

| Command | Result |
|---|---|
| `node --check src/ui/app.mjs`, `tools/metaRoutes.mjs`, `tools/interface-browser-e2e.mjs` | Passed after diagnostic changes |
| `node --test test/metaIntegration.test.mjs` | 25 passed, 0 failed |
| `npm run test:interface` | Passed; includes one local GET check, contextual Script/cue workflows, no provider submissions, and no script errors |
| `npm run qa:codex` | Passed; 733 Node tests, syntax gates, offline cue QA and seminar QA |
| `node tools/browser-e2e.mjs` | `BROWSER_SMOKE_OK`; manual GO/STOP ALL, ZIP round-trip/rollback, no provider calls |
| `npm run test:ai-review` | Passed; offline review/apply/undo and error/loading flows |
| `npm run test:interface` | Passed; 1920×1080/1440×900 bilingual Studio toolbar, Builder import and L# cue creation, no page errors or provider submissions |
| `git diff --check` | Passed on the final worktree; Git emitted only the existing LF-to-CRLF advisory for the edited browser test |

QA artifacts under `artifacts/cue-qa/` and `artifacts/codex-qa/` are local/ignored outputs, not deliverables or measurements of Meta accuracy.

## Incomplete or requiring separate operator validation

- A local status GET validates only local endpoint/configuration. It cannot prove provider credentials, remote availability, or that Meta will accept a future request.
- Incorrect address/port and a stopped server can both surface as an unreachable local endpoint; the UI advises checking both. A 404 or non-JSON response is classified separately as an endpoint/version mismatch.
- No live provider request was made. Paid/provider behavior requires explicit operator authorization and spend approval.
- Real audio output, hardware routing, microphone devices, and venue use require separate manual validation. Chrome automation does not certify physical audio or Edge compatibility.
- Audio-file drop after a finished sequence is covered by the queue-completion follow-up below.
- Other existing changes outside this task were preserved and not committed.

## Worktree protection

- Branch: `feat/runq-ai-campaign-100-2026-10-31`
- HEAD at start: `5fdb4d1b5cd3f4fd5ca65771ca822b18d1731ad1`
- The earlier ZIP backup covered 47 modified and untracked files. This responsive follow-up has a new verified external backup of all 48 changed/untracked paths plus the binary Git patch; no changes were committed.
- No commit, pull request, branch change, merge, or paid request was made.

## Responsive wizard follow-up — 2026-10-31

- Reproduced the reported 390×844 failure: after narrowing the window, the wrapped workspace navigation could extend beyond the top bar and browser navigation scrolled the shell horizontally, moving the entire Builder off-screen.
- The mobile workspace navigation now has a bounded full-width flex basis and scrolls within its own viewport. The narrow shell clips horizontal overflow instead of retaining a stale horizontal scroll position.
- Browser acceptance now resizes from desktop to 390×844 and checks that the Builder, all five stages, visible navigation actions and the Cues task stay within the viewport.
- `npm run test:interface` passes with the Spanish mobile flow and existing 1920×1080/1440×900 bilingual toolbar checks. `npm run check:syntax` passes; `npm test` passes all 733 tests; `git diff --check` passes with only Git's existing LF-to-CRLF advisory.
- The automated mobile test verifies geometry and navigation, not a physical-phone rendering; no real audio, hardware or provider operation was performed.

## Guided continuous Show Builder follow-up — 2026-10-31

- Replaced the remaining step-by-step workspace hops with one Builder canvas containing all five task cards. Stepper, Back and Continue change the highlighted step and scroll within the current AI workspace; they do not switch projects or workspaces.
- Added an explicit sound-plan choice. “Add sounds” records intent only; its separate action opens the existing creation workflow. Deferring sound keeps playback readiness independent and does not make an empty or audio-free show appear verified.
- Cue suggestions continue through the existing analysis handler and confirmation. Proposal review stays attached to the script context; no proposal is approved, no sound is generated, and no cue is played automatically.
- Removed a duplicate listener for the contextual assistant event. Desktop assistant sizing keeps the primary action visible at 1440×900, while the 901–1099px layout uses a single Builder column so proposal review remains usable.
- Added unit and browser regression coverage for empty-show verification, all five visible task cards, no workspace switch on Continue, explicit sound-desk navigation, deferred sound, zero provider submissions, and Builder layout/copy at 1920×1080 and 1440×900 in Spanish and English.
- Verification: `node --test test/showBuilder.test.mjs` (7 passed); `npm run test:interface` (passed); `npm run test:ai-review` (passed); `npm run check:syntax` (passed); `npm test` (734 passed); `git diff --check` (passed; existing LF-to-CRLF advisory only).
- No live provider request, audio-generation call, paid operation, merge, or commit was performed. Actual speaker output and provider credentials remain operator validation; browser audio is mocked.
- The previous audio-file-drop risk was addressed and verified in the queue-completion follow-up below.

## Finished-queue cue creation follow-up — 2026-10-31

- Reproduced that dropping a new audio file in Cues, Rehearsal, or Operation after the operator queue had finished created a cue but left `NEXT` empty.
- When a successful drop creates a cue and there is no currently prepared cue, that new cue is now prepared by stable ID. A non-null existing `NEXT` remains unchanged; no GO or playback is initiated.
- Applied the same rule to creating a new cue from a local library source in the audio editor, which had the same stale `NEXT` condition. Assigning audio to an existing cue does not reposition the queue.
- Fixed STOP ALL visibility while Sound Lab preview is reserved: the runtime state now reports the dedicated preview state and emits the audio-state update, so the global stop action is exposed and remains distinct from cue playback/audition state.
- Browser acceptance reproduced the prior null-NEXT failure before the fix, then passed dropped-audio flows in English/Spanish across Cues, Rehearsal and Operation; it also checks queue-finished library cue creation and STOP ALL for Sound Lab preview. All audio/provider work in these checks is synthetic or mocked; provider endpoints remain blocked.
- Verification: `node tools/audio-cue-drop-browser-e2e.mjs` (6 locale/workspace cases passed); `node tools/sfx-lab-browser-e2e.mjs` (passed); `npm run test:interface` (passed); `npm run test:ai-review` (passed); `npm run check:syntax` (passed); `npm test` (734 passed); `git diff --check` (passed, existing LF-to-CRLF advisory only).
- No live provider request, paid operation, merge, or commit was performed. Physical audio output still requires operator validation.
