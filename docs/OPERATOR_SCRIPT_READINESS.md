# Operator script navigation and readiness — SHOWCOMPILER

## What the interface supports

The original UTF-8 TXT script is the source of truth. Each parsed line is assigned a stable `L#` reference. A proposed or approved cue includes **View in script**, which moves the source preview to the cited line and highlights it. This action does not approve, load, prepare or execute a cue.

**Find in script** searches the whole script, ignoring letter case and common Unicode accents. Use the next/previous arrows or Enter/Shift+Enter to move through matches. The preview renders at most 300 lines at a time, centered around the chosen source, to avoid building thousands of DOM elements. The text and line IDs are never renumbered or rewritten to produce a search result.

**Check show readiness** creates a local advisory snapshot. It detects:

- a show with no approved cues;
- approved cues whose audio is still unresolved;
- assigned audio references whose files have not been decoded in the browser;
- ongoing audio decoding;
- AI/manual suggestions that still await human approval (warning only).

The report displays the number of playable cues and actionable issue descriptions. It never arms a live mode, changes source/proposal/cue state, starts audio, calls an AI model or guarantees professional show readiness.

## Practical acceptance

1. Import a short script and approve one cue without audio. Its source link should highlight the correct `L#`; the readiness report must describe missing audio.
2. Load a compatible file directly from the cue and verify readiness changes. GO remains a separate operator action.
3. Export project JSON and open it again. Source references and cue definitions persist, but local audio must be loaded again before GO becomes enabled.
4. Import a script over 300 lines, create a proposal for a late line, and confirm **View in script** makes the cited line visible. Try accented and unaccented searches.
5. Test with blocked network connectivity: navigation, reporting and loaded local audio controls should not depend on a model response.
6. Check at narrow and desktop window widths. Automated tests cover code paths, not audible playback or visual accessibility.

## Boundaries

The prototype currently uses a browser-owned AudioContext and volatile decoded files. The JSON project format stores metadata but not audio binaries. The readiness report does not verify audio routing, sample-clock stability, amplifier configuration, stage safety, operator permissions, hardware timecode, DMX/OSC/MIDI, redundancy or venue readiness.

No inference credits are required for any script navigation or readiness operation.
