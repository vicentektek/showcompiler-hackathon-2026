# RunQ cue audition studio — UX and implementation contract

Date: 2026-10-28. Branch: `feat/cue-audition-studio-ux-2026-10-28`.

## Sources and design decision

Earlier RunQ mockup discussions selected **Option C, a professional hybrid**: an operationally dense instrument rather than a generic SaaS form. The palette now uses violet for **selected/editing**, lime for **prepared NEXT GO**, and teal for **audio waveform/preview**. Selection does not prepare or execute a cue. No double-click GO.

External reference: QLab 5 documents **Preview** as playing one selected cue in isolation, not advancing the playhead or following the sequence; **Audition Preview** can route elsewhere if the host supports alternate outputs, and its Time & Loops editor exposes IN/OUT, waveform, zoom and preview. RunQ implements only the features it can substantiate:
- https://qlab.app/docs/v5/tools/auditioning-cues/
- https://qlab.app/docs/v5/audio/audio-cues/
- https://qlab.app/docs/v5/fundamentals/cue-sequences/

## Operator mental model

| Action | Affects prepared NEXT GO | Emits sound | Uses unsaved fields | Needs approved cue |
| --- | --- | --- | --- | --- |
| Single click cue | No | No | N/A | No |
| Prepare NEXT GO button | Yes | No | N/A | Yes |
| Listen to cue | No | Yes, shared default output | Yes, if the selected Audio inspector is open | Yes |
| Solo track / from cursor | No | Yes, shared default output | Yes | Yes |
| Stop audition | No | Stops preview only | N/A | No |
| Operator GO | Advances after successful GO | Yes, live transport | No — saved settings only | Yes |
| STOP ALL | Keeps prepared pointer | Silences all available sources | N/A | No |

**No private PFL/monitor output**: the preview uses the same output patch as show playback and is forbidden while any show cue is active or pending. Explicit on-screen warning; one-time confirmation on first audition. A second audition cannot overlap an active audition. Preview gain is reduced relative to GO, but this does not substitute for device volume safety.

## Screen structure

- **Cue list**: selection and quick Listen are separate controls. List selection never triggers sound; row Listen has its own focusable button and accessible label.
- **Inspector header**: selected cue number, name, source reference, preview status and three explicit controls: **Listen cue**, **Stop preview**, **Prepare NEXT GO**.
- **Compact inspector**: a quick gain control is visible beside the preview transport, synchronized with the detailed playback form. Mutations are staged until explicit Save; navigating away with edits requires discard confirmation.
- **Keyboard**: V auditions the inspected cue only in Cue Editor when focus is not in a text/number/select field. Escape stops audition. Neither key alters NEXT GO or invokes the show GO.
- **Waveform panel**: actual decoded local PCM amplitude envelope, IN (amber), OUT (rose), fade overlays (violet), audio progress playhead, zoom, pan, and Alt-click audition cursor. Buttons: Solo track, From cursor, Stop.
- **Property grid**: gain is above the waveform so it remains reachable on 1093×614 laptop view; waveform and numeric controls remain synchronized.
- **Extra audio tracks**: each track has its own waveform and audition controls; solo selection is not a mixer's persistent solo state.

## Validated engineering constraints

- Preview is an independent `BrowserAudioEngine.previewCue` path: no `go`, no cue queue state, no natural-end GO, no stop-target transitions.
- Preview supports saved cue settings or currently staged inspector values, including IN/OUT, gain, fades, playback speed, pan, repeat and loop.
- Preview intentionally skips pre-waits for immediate audition. GO still obeys saved start delays.
- Legacy `auditionAsset` remains available for checking library files outside a cue, with the same output warning.
- STOP audition invalidates pending `AudioContext.resume()`, and STOP ALL handles both show and audition.
- Projects keep the existing schema; preview state, cursor, zoom, waveform samples and pending edits are not persisted.
- Browser automated tests are deterministic; they do not prove physical routing, loudness, codec behavior or timing suitability for live shows.

## Manual acceptance on Windows

1. Open the demo from the PR branch; load the included portable show ZIP.
2. Select cue 2 with one click; ensure NEXT GO still points to cue 1. Click cue-row Listen; after speaker-output warning, confirm only cue 2 previews.
3. Stop audition without disturbing queue. Select cue 1, open Audio, drag OUT and edit gain to −12 dB **without saving**. Listen cue: hear the staged cut and level; inspect status and playhead.
4. Save, export, reopen ZIP, verify IN/OUT/gain are retained, and audition again.
5. Add a second track, use **Solo track** and **From cursor**; verify only chosen stem plays and original file bytes are unchanged.
6. Start show GO and try to audition another cue; it must be blocked until sound stops. STOP ALL always remains available.
7. Repeat at 1366×768 and 1093×614 with keyboard focus; neither gain nor the main listen controls should require hidden-scroll gymnastics.

## Next deliberate iterations

A truly independent headphone/PFL bus requires a backend with explicit output-device routing and safety review, not another CSS control. Later usability goals: native audio device selector, precise playhead waveform sampling at high zoom, keyboard shortcuts scoped to editing, slices and scrubbing, multi-stem mixer/mute/solo and automated audio-level meters. None are claimed as implemented here.
