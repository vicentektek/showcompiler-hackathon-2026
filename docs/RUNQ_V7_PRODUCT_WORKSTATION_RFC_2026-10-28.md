# RunQ V7 — Product Workstation RFC
**Date:** 2026-10-28. **Status:** documentation-only proposal, not implemented.
**Goal:** professional bilingual ES/EN application for scripting, cue authoring, sound creation, voice-assisted rehearsal and deterministic live operation.
**Based on:** V6 UX document, separate PRs for Sound, Voice/Rehearsal and conversational edits. These are not yet one validated production build.

## Thesis
ONE specialist production workbench with three postures: EDITAR / ENSAYAR / DIRECTO. Not a collection of pages. The same show, cue list, script references, media library, playback engine, command vocabulary, menus, inspector and style tokens persist. The task changes layout and allowed commands, not the underlying model.
A cue inspected, a cue prepared for NEXT, an audio preview, an AI suggestion, a detected voice trigger and a sound actually playing MUST be distinct.
Recommend creative production suite as the overall design, dense technical workstation for editing, and show-control console for live. Reject marketing-dashboard cards and decorative controls in operating views.

## Evidence and references
Research is from product documentation and design research, NOT interviews or verified field usability tests.
- NNGroup, Complex Application Design: https://www.nngroup.com/articles/complex-application-design/
- NNGroup, Progressive Disclosure: https://www.nngroup.com/articles/progressive-disclosure/
- NNGroup, Complex App Heuristics: https://www.nngroup.com/articles/usability-heuristics-complex-applications/
- QLab 5 workspace: https://qlab.app/docs/v5/fundamentals/workspace/
- QLab 5 inspector: https://qlab.app/docs/v5/fundamentals/inspector/
- ETC Eos playback status: https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/04_System_Basics/05_Playback_Status_Display_%28PSD%29_%5BTab_2%5D/PLAYBACK_STATUS_DISPLAY_%28PSD%29_%5BTAB_2%5D.htm
- ChamSys Execute: https://docs.chamsys.co.uk/magicq/1.9.8.x/manual/execute.html
- Ableton Live concepts: https://www.ableton.com/en/live-manual/12/live-concepts/
- VS Code workspace layout: https://code.visualstudio.com/docs/editing/getting-started/userinterface
- Blender areas: https://docs.blender.org/manual/es/4.0/interface/window_system/areas.html
- IBM Carbon Data Table: https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines
- Adobe Spectrum: https://spectrum.adobe.com/getting-started/introduction
- Atlassian design tokens: https://atlassian.design/foundations/design-tokens
- Microsoft HAX: https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/
- W3C grid, keyboard and WCAG 2.2: https://www.w3.org/WAI/ARIA/apg/patterns/grid/ ; https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/ ; https://www.w3.org/TR/WCAG22/
- MDN Web Audio best practices: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices

## 1. Common shell, not isolated screens
Global compact menu: Archivo, Editar, Ver, Cues, Audio, Ensayo, Ventana, Ayuda, with keyboard shortcuts.
Persistent project/status toolbar: project name, real durable-save status, real engine/audio output, preflight count, settings, STOP ALL physically separated from GO.
Three operational modes: EDITAR / ENSAYAR / DIRECTO; editing task presets Guion / Cues / Sonido. An optional narrow project browser exposes script, scenes, groups, assets and triggers; panel layouts are adjustable and optionally persisted per computer.
Main workspace: center editor + context inspector + collapsible auxiliary media/script/assistant pane + status footer. On 1366x768, 2–3 usable panels; on 1093x614, at most 2; on 1920+ allow optional third. 200% zoom must not overlap transport.
Use task presets rather than arbitrary full Blender docking for hackathon scope.

## 2. Source of truth / command design
Domain entities: Show, Scene, Script Lxx, Cue, CueGroup, Asset, AudioTake, Track, VoiceTrigger, AIProposal, PlaybackInstance.
Separate UI state: selectedCueId, browsedCueId, preparedNextCueId, activeCueInstances, pendingAiPatch, voiceCandidate, rehearsalMode, autoGoArmed. Neither row selection nor browsing alters preparedNextCueId. AI never plays a cue.
All UI changes use validated domain commands with mode, version and destination checks; playback engine independent from the render tree and network. Preview and show are different routes; never advertise PFL routing unless verified.

## 3. Screen-by-screen specification
**Project Hub:** create/open/import/restore show, sample demo, recent files only if real, warning if assets missing, saved vs in-memory vs portable ZIP distinction.
**Guion:** source script with search, scenes, stable Lxx, annotations and cue references. Side panel of AI proposals with evidence and editable accept/reject/create cue/create sound actions. Preserve script scroll and selection when jumping to cue and back.
**Cue Editor:** dense grid of ALL cues with configurable columns Q, type, name, scene/Lxx, duration, trigger, asset/output and status; group rows, filters, keyboard navigation, contextual menu, drag/reorder safely, undo and batch actions only when supported. Click name selects; explicit Prepare sets NEXT; cue-local Listen previews; GO only on transport. Inspector tabs by applicable cue type: General, Audio, Trigger, Actions, Routing, Advanced. REAL waveform, IN/OUT drag, fade curves, zoom/ruler, numeric fine controls, loop/repeat, audition.
**Sonido:** unified library and create/edit preset. Safe multiimport/archive handling with honest supported formats, missing/corrupt file notices, preview, waveform and assets linked to cue. Generated take is a draft, not automatically imported; accept into Library only, Create new Cue, Add track to Q or Replace track with explicit target and safe rollback. Failed attachment never discards audio take. Advanced model parameters hidden until needed.
**Conversational Assistant:** dock attached to selected cue/asset/script, never an overlay over transport. Show context, source local/remote, ES/EN, current vs proposed real inspector fields. Separate transcription consent and interpretation consent; conversational corrections retain other staged edits; Apply/Discard/Safe Undo, version conflict and unsupported warnings; no silent AI changes or GO. Existing first iteration supports one cue, not bulk operations.
**Voice Follow:** reached from Rehearse config, not main tab. Mic permissions, ASR provider, ES/EN final transcription, phrase matching, simulation vs real, false positives and latency only when observed. Dictation for editing is not voice trigger rehearsal.
**Ensayar:** same cue grid and real active-cue monitor plus script follow. Manual = operator GO without voice. Assisted = voice candidate and human approval. Autopilot = mode selected AND separate ARM AUTO GO; STOP ALL, mic loss, show change and leaving Rehearse disarm. Show detected vs executed vs ignored distinct. Rewinds/skips must not fire intermediate cues.
**Directo:** main surface is full searchable/browseable cue list at approx 60–70% of main area, without collapse to a tiny 3-row queue. Mouse wheel, scroll bar, Up/Down, PageUp/Down, Home/End, Go to cue, Search. Scroll/browse WITHOUT changing NEXT. Auto-follow can be suspended by manual scrolling, with persistent Return to NEXT. Selected/Inspected/Prepared/Playing statuses distinct. Big NEXT + GO, separate safety STOP ALL, all running instances visible with progress, STOP and FADE each, compact readonly cue detail if requested. No editing/AI network actions/Autopilot. Manual GO does not require remote Meta connectivity.
**Preflight:** global actionable list with real missing media, decode/output, show version and saved-state checks; cue-level repair link, block vs warning vs informational severity, no invented diagnosis.
**Settings:** general, density/theme, output/audio, shortcuts, voice/AI provider connection, data import and diagnostics, About/version. Never expose API keys in client or show log.

## 4. Graphic system / editorial layout
Visual grammar is utility-first, controlled neutral low-glare dark. Flat continuous panes separated by fine 1px dividers, aligned labels, compact titlebars, small contextual toolbars, tabbed inspectors, real meters and timelines. Avoid giant rounded cards, gratuitous shadows, bright gradients, colorful tiles, fake status indicators and excessive padding. Use system UI sans (Segoe UI etc.), numeric tabular/monospace for Q numbers, timecode, dB, durations.
Starting palette pending contrast checks: canvas #11161C; pane #1B222B; header #232C36; divider #33404D; primary #E9EFF5; secondary #B3C2CF. Semantic highlights: selected violet, NEXT pale yellow-green, preview cyan, active playing green, warning amber, emergency red. Pair color with explicit text/icon and focus outline.
Spacing based on 4px increments, 8px group increments; row height defaults 32–34px, compact 28px where valid, pane header 28–34px; detail typography approx 13–14px adjustable; no important text forced below 12px. User can select compact/comfortable density; do not create separate 'simple engine' vs 'pro engine'. WCAG AA normal text 4.5:1; larger 3:1; >=24x24 clickable target or compliant spacing; test 200% zoom.

## 5. Interaction contracts
Windows conventions: Ctrl+S save, Ctrl+F local search, arrows/page keys grid, F6 pane switch, discoverable shortcuts in menus/tooltips, accessible grid keyboard model, contextual commands with same outcomes as toolbar. No GO from a focused text input/chat. Double-clicking a cue must NOT GO. STOP ALL immediate and disarms rehearsal; don't block it with a confirmation dialog. Explicit GO cannot be mistaken for sound audition.
For Directo, browsing Q005 while Q023 is prepared and Q019 is playing MUST leave both untouched. Preparing Q005 requires a distinct command. Active list must stay visible while browsing.
Error messages say what failed, affected cue, why when known, and Fix/Retry/Keep draft options; never delete pending AI text, accepted take or manually edited fields on failed action.

## 6. Integration architecture (avoid cosmetic refactor)
One CueGrid and one shared CueInspector across task presets, configured by permissions/layout and persisted state, not duplicated page code. Virtualize long rows with preserved keyboard focus/ARIA row semantics and stable scroll anchor.
One transport coordinator, separate playback/preview sessions, engine unaffected by tab changes, remote API errors or large-wave rendering. Version guard staged AI patch. Shared ES/EN localization dictionary for all labels/aria/errors. Layout manager stores user preferences, with default reset and min-pane sizes. No promises of ASIO, separate hardware PFL, OSC/MIDI, external timecode or ChamSys until integrated and actually tested.

## 7. Hackathon scope and risks
Deadline Nov 4: P0 integrate branches with CI; shared shell and all-cues grid in Show; mode/GO safety; cue waveform and audio library links; ES/EN; controlled AI draft/accept; rehearsal mode/arm clarity; truthful preflight. P1 panel persistence, shortcuts, better asset preview, real microphone Windows validation; P2 native professional I/O, hardware timecode, multi-cue AI, conditional stop rules and extensible docking.
Avoid high-risk full rewrite; change one critical architecture slice then run regression tests.

## 8. Verification (acceptance targets, not achieved results)
Test demos of 10, 100 and 500 cues, multiple loops, corrupt/missing media, network disconnected, voice errors and conflicts, 1366x768, 1093x614 and 200% zoom.
Required safety: ZERO inadvertent GO while selecting, scrolling, finding, auditioning, dictating, reviewing AI or switching view. Selected, prepared, playing and detection remain different even when scripts reflow.
Full cue list in Directo; active instances stay visible; clear Return to NEXT; explicit prepare. User can navigate Q5 while NEXT Q23 and still GO Q23.
Full workflow script Lxx > AI proposal > cue > generate/import sound > listen/trim > assign > rehearsal > show, with context, timestamps, IDs and assets preserved. Correct ES/EN, no stale AI apply, no silent paid request.
Measure not claim performance: p95 cue filtering <=150ms on 500 cues on target PC (proposed target), UI-dispatch delay under 50ms (proposed target); measure actual audio onset separately via hardware loopback before making pro latency claims.
Run observed usability sessions with novice, intermediate and pro users; this RFC is desk research only. Candidate task targets >=90% completion, no accidental GO, rapid cue lookup and recovery; evaluate and revise based on real tests.

## 9. Decision requests
Default Open Show landing: Cue Editor (recommend) or last visited work area?
Allow readonly inspector in Show as side pane (recommend) or bottom?
Default density comfortable (recommend) or compact?
Save layout per user/device (recommend) rather than embedding window positions in show?
Implement P0 first; aesthetic polish must not displace safety, responsiveness and persistence.

## Non-goals
A clone of QLab/REAPER; claim of production certification; arbitrary window docking by the deadline; remote AI required for live playback; fake hardware routing features; UI redesign that breaks separately tested features.
