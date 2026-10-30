# Studio pane focus — isolated UX increment (30 October 2026)

**Branch:** `feat/runq-studio-pane-focus-2026-10-30`, based on RC1 `d10b32fc`.
**Scope:** One bounded, reversible workstation improvement. This is not a claimed
pixel-exact implementation of the five approved mockups; their original PNGs
still need to be committed or recovered.

## What changes

- The original Show Sequence header gets an **Expand cue list** button.
- The original Property Inspector header gets an **Expand inspector** button.
- Clicking an already expanded pane returns to a split view. Escape on the
  active focus button also restores the split layout.
- The active pane is saved locally as a Studio preference; language switch
  updates labels in English/Spanish.
- Hiding a pane never unmounts it. Staged edits and the original cue list,
  selection and NEXT state are preserved.
- A Studio-only data attribute changes the existing CSS grid. The current
  keyboard/pointer splitter stays intact in normal split mode.

## Safety boundaries

- No edits to `app.mjs`, Web Audio, operator queue, speech, Autopilot or AI
  routing. The UI has no GO or STOP listeners.
- This toggle is only effective in Studio/Cue Editor. The live/rehearsal layouts
  remain untouched, including STOP ALL.
- This is not a generic overlay or cloned inspector. The two controls are
  appended to headings of the **existing** mounted panels.
- Hidden inspector changes remain staged; users should restore the pane before
  navigating or applying edits. Existing unsaved-change navigation guard remains.
- No provider calls, billing, keys or changes in `main`.

## Acceptance gates

1. `node --test test/studioPaneMode.test.mjs` and existing `npm test`.
2. Browser: at 1920×1080, 1366×768 and 1093×614, open Cue Editor, expand list,
   restore, expand inspector, restore; no overlap, no inaccessible Restore control.
3. Select a cue: neither pane toggle may play it or change NEXT. Change a form
   field, toggle view, restore: the form's unsaved state must still be present.
4. Switch to Rehearsal and Stage with either preference: both must retain their
   layouts. Explicit GO, individual STOP and STOP ALL must behave as before.
5. Inspect actual Chrome screenshots before approving; compare to the approved
   Studio mockup when its original image is available.

**Do not merge automatically.**
