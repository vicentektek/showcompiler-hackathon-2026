# RunQ unified integration candidate

This branch combines advanced operator cue/audio controls with the new RunQ workspace. It is an offline browser preview, **not** a certified show-playback application.

## Included
- Dense, responsive Cue Editor and separate Script, Audio, AI, Setup and Operation workspaces.
- Distinct cue selection and NEXT GO, one manual GO, immediate STOP ALL.
- Real local browser audio with fade-in/out, level, pan, delay, loop, finite repeats and rate.
- Named STOP targets with individual fade durations.
- Primary source reassignment and additional PLAY tracks with per-track playback options.
- Audio-inclusive show ZIP, JSON persistence, staged safe import and script evidence references.
- English and Spanish UI without changing script text.

## Integration decisions
- The branch uses the latest multi-track functionality as its first parent and the visual v2 work as a second parent.
- The editor and operation browser tests from the newer functional branch are kept where older overlapping visual-test hunks would otherwise overwrite the advanced cue journey.
- Visual selectors, density and geometry tests are added where applicable.
- No private predecessor source, external brands or credentials are included.

## Validation gates
1. `npm run check:syntax`, `npm test` and deterministic Chrome browser workflow must pass.
2. Verify desktop 1920×1080, 1366×768, compact 1093×614 and keyboard focus.
3. Confirm GO, repeated tracks, STOP ALL, STOP with fade and audio replacement.
4. Confirm complete ZIP export/import retains original sounds and per-track settings.
5. Perform real Windows speaker/headphone manual checks before live use.
6. Verify no autoplay, unauthorized model calls or unreviewed cue execution.

A green CI result validates deterministic behavior only; it does not prove live-grade audio timing, hardware I/O or accessibility.
