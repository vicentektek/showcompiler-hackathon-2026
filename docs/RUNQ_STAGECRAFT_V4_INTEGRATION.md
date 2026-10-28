# RunQ Stagecraft V4 — Integrated presentation

Stagecraft V4 is now applied to the **real unified application** through `src/ui/runq-stagecraft-v4.css`, loaded last in `index.html`. The existing application controller, audio engine, manual cues, AI review, project format and ZIP export are unchanged.

## Scope
- Near-black instrument canvas, obsidian navigation rail, neutral charcoal workspaces.
- Semantic tokens: signal lime for GO/prepared, violet for selected/editing, aqua for active audio, amber for caution and warm red for STOP.
- Compact icon-led workspace rail, stable technical typography, cue state spine, restrained panels and control geometry.
- Clear visual priority for operator GO and emergency STOP ALL.
- Applied to Home, Script, AI, Cue Editor, Audio, Operation and Settings via existing CSS classes.

## Not yet implemented
- The standalone Stagecraft design prototype's advanced waveform workspace, real graphical OUT trim and independent audition monitoring are **not** copied as fake controls. The integrated app continues to expose only its actual implemented audio functions.
- Full eight-screen information architecture and custom Canvas waveform editing require subsequent UI and engine work packages.
- No live-show hardware certification, real meters, independent audio output or automatic voice GO is implied.

## Acceptance
1. `npm run check:syntax`, `npm test`, `npm run qa:codex` and browser smoke pass.
2. At 1366×768 and 1093×614, the operator GO and STOP ALL remain accessible.
3. Manual cue create/duplicate/delete/reorder and multi-track edit remain available.
4. Selecting a cue never prepares or fires it.
5. Script/AI, JSON/ZIP, and audio audition work as before.
6. Screen captures must be taken from **this integrated branch**; the separate concept HTML is not proof of product implementation.

## Next steps
- Replace old visual-only CSS rules with consolidated Stagecraft tokens after functional review, instead of stacking further overrides.
- Implement V3 CueSequence/Inspector components, then the real waveform renderer and persisted clip editing.
- Audit contrast at all states and keyboard navigation at 200% zoom.
