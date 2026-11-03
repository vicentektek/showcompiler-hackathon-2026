# RUNQ — Judge quick start

**RUNQ** is a browser-based AI-assisted cue-planning and audio operation tool for theatre, rehearsal and small live shows. It turns script directions into reviewed cue proposals linked to original lines, then gives the human operator explicit control of the show.

## Reproduce the submitted build

The release source is the exact **frozen commit** `b4e7df724d569c1d5af7682540c206ff3fb97701`, not the repository's historical `main` branch.

Requirements: **Node.js 20+**, npm, recent Chrome or Edge, audio output. The package requires the dependencies in `package.json` (including `libarchive.js`, `mammoth` and `pdfjs-dist`).

```sh
git clone https://github.com/vicentektek/showcompiler-hackathon-2026.git
cd showcompiler-hackathon-2026
git checkout b4e7df724d569c1d5af7682540c206ff3fb97701
npm install --no-audit --no-fund
npm run dev
```

Open **http://127.0.0.1:5173** on the same computer. In GitHub Codespaces use the **Ports** panel to open forwarded port 5173. A private repo cannot be cloned by third parties until explicit judge access or an approved public release is provided.

To run the offline regression suite:

```sh
npm run check:syntax
npm test
```

The GitHub Actions Core tests for the frozen commit completed successfully (run `41690922577`). A green automated test is not a certification of the connected audio or microphone hardware.

## Five-minute walkthrough without a paid API

1. Open RUNQ and choose **Try original audio demo**, or create a show and import a TXT/PDF/DOCX script.
2. Open **Build your show / RUNQ AI** and follow script → cues → sound review. Existing demo cues may be used when external model access is not configured.
3. Open a cue's **Sound design** panel. Inspect the audio description, gain, fades, loop and overlap/stop-previous policy. Edit one setting and save; the edit alone does not play audio.
4. In **Audio**, import/assign a local media file if an unresolved cue needs one. Unresolved cues cannot GO.
5. Prepare NEXT, use manual GO to play a ready cue, then demonstrate individual STOP and STOP ALL.
6. Export a **portable show ZIP** if a package including audio is needed.

## Optional: Meta Muse script analysis

Configure the Meta Model API key in the local server environment according to `docs/META_MODEL_API.md`. Key values must never be committed or exposed in screenshots. Choose the explicit analysis action. Review the source-line evidence and approve/reject suggestions manually. An offline prompt example or deterministic sound-description generator is **not** proof of a live Muse response.

## Optional: voice rehearsal

The microphone path requires explicit user interaction, permissions, available credentials and supported browser/audio hardware. Choose the spoken language; new profiles default to English. Start listening and arm automatic GO separately. Automatic GO is confined to rehearsal. Manual GO disarms automatic mode, deliberately; rearm it to resume. If the provider or microphone is unavailable, demonstrate manual operation instead of simulating voice success.

## Capabilities and non-capabilities

**Included:** script import, source-linked human-reviewed cues, configurable local audio playback, sound design inspection/editing, script and cue views, bilingual interface, portable show export, optional Muse analysis and optional voice rehearsal.

**Not claimed:** generated WAV creation by the shipped sound assistant; professional show-control certification; independent PFL; hardware ASIO, DMX/timecode output; native Windows installer; model-derived numeric sound recommendations; flawless ASR performance.

See [release notes](SUBMISSION_RELEASE_2026-11-03.md).
