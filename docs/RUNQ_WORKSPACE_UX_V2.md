# RunQ — Workspace layout v2

Status: **UI preview**, implemented on an isolated feature branch. This is not an operational live-show certification.

## Design goals

Create a dense, predictable desktop workspace for sound-cue preparation and operation. The visual system should prioritize the cue sequence, always distinguish NEXT GO from the selected cue, and make audio sources easy to manage without hiding important safety limitations.

## Implemented in this iteration

### Cue Editor
- Full-height workspace with independent cue-list and inspector scrolling.
- Compact numbered rows with name, source reference, readiness and explicit NEXT GO marker.
- Original list ordering and stable source anchors are preserved when applying a search.
- Density switch: **Compact / Comfort**, stored as a local UI preference, never as show data.
- Quick links to Script and Audio are navigation only.
- Existing inspector tabs (Basics, Audio and Actions) retain their actual editing actions.
- STOP ALL remains distinct from GO. No row click prepares or plays a cue.

### Audio
- Media summary shows counts based on **actual listed assets** and the loaded/available state already exposed by the audio controls.
- Asset rows are easier to scan and retain manual audition functionality.
- The warning that audition shares the current system output remains prominent.
- No invented waveform, multichannel routing, independent audition bus or DSP capability.

### Script
- Original numbered text displayed as the primary reading surface.
- File and source actions remain separate from text navigation.
- Quick return to the Cue Editor does not prepare or execute a cue.

### AI
- Analysis controls and proposal review use distinct visual regions. All existing approval gates and explicit provider-consent boundaries remain unchanged.

### Desktop navigation
- Simplified top bar: project identity, emergency audio stop, language and save/export actions.
- Secondary file actions are accessible in the real File menu.
- Workspace transitions do not change NEXT GO or trigger playback.
- English-default interface, Spanish localizable labels and high-contrast keyboard focus.

## Operational boundaries

All transport operations remain owned by the existing application. The new UI modules do not call an audio backend, contact providers, or alter persistent show schemas. Browser audio is not a professionally validated device-routing engine.

## Acceptance criteria

1. Desktop Editor keeps the cue list left and inspector right without overlap.
2. GO and STOP ALL remain visible at 1366×768 and 1093×614.
3. Selecting a cue does not change NEXT GO; only explicit preparation can do so.
4. Search does not reorder the underlying cue sequence.
5. Density switch does not change project or transport data and survives locale switching.
6. Audio overview reflects the actual loaded/available state.
7. AI and file operations retain explicit user confirmation and safe error behavior.
8. Full ZIP export and reload preserve scripts, cue metadata and original media.
9. Spanish and English UI switching do not rewrite the imported script.
10. The browser smoke with fake audio confirms no unintended playback on navigation.

## Next product milestones (not implemented here)

- Multi-action cues with reusable sound regions and structured PLAY/FADE/STOP inspector.
- Non-destructive waveform editing, markers, loops and fade envelopes, requiring real engine/data support.
- Device-aware routing, private monitoring and live-grade timing after hardware feasibility and validation.
- Rehearsal assistant and AI proposals with transparent approval, bounded inference and separate safety gates.
- Customizable operator layouts and project library only when durable storage and recovery are implemented.

No third-party visual assets, competitor identifiers, or historical repository references are required for this specification.
