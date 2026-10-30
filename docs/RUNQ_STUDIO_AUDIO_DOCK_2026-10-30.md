# RUNQ Studio — Bottom audio editor / waveform docking (30 October 2026)

**Stacked candidate:** PR #124 (`feat/runq-studio-pane-focus-2026-10-30`) as the base.
This change is an experimental second visual increment, not a rewrite of
`app.mjs` or a claim of mockup-perfect fidelity.

## Purpose

Make the professional cue editor more usable by offering one **bottom audio
editing surface** while retaining the left Show Sequence and the right Property
Inspector. The bottom editor contains the **actual** cue playback form, with
its original waveform, draggable trim/fade handles, timecode transport,
gain, loop, pan, speed and Save.

In the normal collapsed state the original form remains in its original
inspector. Click **Open waveform and audio editor below** to physically move
that exact form into the lower workspace. Click **Return editor to inspector**
to put the same node back. No clones or second preview engine exist.

## Constraints

- A `MutationObserver` follows the existing `renderCueInspector()` re-renders
  when a different cue or tab is chosen and discards stale detached forms.
- `#cuePlaybackForm` remains the same node, with all raw millisecond fields
  and Web Audio preview listeners. `stagedPreviewCue()` continues reading
  its original form rather than a duplicated or partial waveform.
- On switching away from Studio or the Audio inspector tab the form returns
  to its original position. No special behavior in Rehearsal/Stage.
- Desktop >=1600×850 initially proposes an open bottom editor, narrow/small
  displays default to the original Inspector. Preference saved in localStorage
  and can always be reversed; no project JSON changes.
- No model calls, GO/STOP/NEXT handlers, AI state or automatic actions.

## Acceptance checks

1. All `npm test`, `npm run qa:codex`, Chrome E2E on the exact head SHA.
2. At 1366×768: original form is initially in inspector; toggle moves it,
   all numeric fields and the actual waveform remain in the same form; toggling
   back preserves the DOM node, preview and NEXT untouched.
3. At 1920×1080: three regions (cue list, inspector, lower waveform form)
   visible. No overlapping controls. Check at 1093×614 with the dock closed
   and manually opened; STOP ALL remains visible.
4. Switch inspector Audio → Details and cue A → B: no stale waveform, source
   file, listeners or form from previous cue. Show ZIP save/load unaffected.
5. Verify with original approved five PNGs when available, not just the
   technical description of the visual specification.

No automatic merge or paid provider request. Physical Windows audio/voice
remains an explicit operator gate.

## 30 Oct responsive correction after Chrome evidence

The first CI failed at the original waveform fade pointer target because a
**collapsed** bottom dock was still consuming vertical space. This was fixed
by placing the compact open button in the existing inspector heading.

A later screenshot at **1093×614** showed that even a deliberately opened
three-part layout leaves the sequence too short and the dock overlaps the
inspector's tab hit targets. Therefore **below 701 px viewport height**, an
expanded bottom editor explicitly replaces the editor's two top panes until
the operator returns it to the inspector. The manual GO and STOP ALL remain
outside the collapsing desk and visible. At larger sizes the dock and existing
sequence/inspector share height with a bounded waveform region.

This is a UX responsiveness fix, not a change to the waveform drag algorithm,
cue schema, audio engine or playback permissions. Acceptance requires fresh
Chrome screenshots and the exact-head CI before merging.
