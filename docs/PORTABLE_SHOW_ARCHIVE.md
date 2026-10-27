# Portable SHOWCOMPILER ZIP — complete audio-inclusive shows

**Date:** 2026-10-27. Developed during the Meta Global AI Developer Hackathon 2026 on branch `feat/portable-show-archive-2026-10-27`. **Status:** new browser prototype implementation, automated CI verified, manual Chrome/Edge sound acceptance still pending.

## Why two save formats?

| Save option | Contents | Use |
|---|---|---|
| **Save JSON** | Script, cue definitions, line IDs, proposal provenance, approved cue details and audio *names/IDs* | Lightweight editing and structured interchange |
| **Save complete ZIP** | All JSON content **plus original WAV/MP3/OGG/M4A/AAC/FLAC bytes**, hashes and manifest | Moving a complete show to another Windows computer or restoring after closing the tab |

The browser still uses Web Audio for playback and has no ASIO or independent PFL bus. The show ZIP is portable *data*, not a desktop installer or live-safety certification.

## Operator walkthrough on Windows

1. Start the hackathon development app on `feat/portable-show-archive-2026-10-27` using `npm run dev` and open http://127.0.0.1:5173 in Chrome or Edge.
2. Import a TXT script, attach local WAV/MP3 files to approved cues, review proposals and edit operator notes as needed.
3. Click **Save complete ZIP** / **Guardar ZIP completo**. A `.showcompiler.zip` is downloaded. The ZIP includes actual audio, not just file references.
4. Click **Open show ZIP** / **Abrir espectáculo ZIP**. Select the downloaded archive and explicitly confirm replacing the current show.
5. The entire archive and every included WAV/MP3 are verified/decoded **before** your current show is replaced. If the archive is invalid or a sound cannot be decoded, the current show and sound engine remain available.
6. After successful import, all original audio names/IDs are restored; prepare the desired cue and press **GO** manually. Neither opening nor saving a package automatically plays audio.

### Fastest test: one click inside the browser

The Script panel now includes **Try with real sounds** / **Probar con sonidos reales**. After confirming replacement of an open show, the browser synthesizes three original WAV clips and loads them together with the 11-line theatre script and three approved manual DRAFT cues.

There is **no need to create WAVs, run the CLI, download GitHub artifacts or configure a model API key** for this test. The browser does **not** execute GO automatically: select **Prepare**, then **GO PREPARED**, or use the cue's manual GO. STOP and STOP ALL remain available. This is a genuinely audible browser transport trial, but not proof of an AI generation or ASIO engine.

### An original, rights-clear show for testing

The project includes a deterministic generator: `npm run demo:package`. It writes `demo/SHOWCOMPILER_SHOW_DEMO.showcompiler.zip`, using an original 11-line English theatre script and three original synthesized PCM WAV samples (quiet atmosphere, bell, and musical transition). Three manually authored proposals are preapproved as DRAFT cues. **This example does not demonstrate live Meta AI inference.**

A CI job runs the generator, independently verifies its standard ZIP structure using the system `unzip -t` command, and publishes a downloadable `showcompiler-full-demo-zip` artifact. After downloading, extract the **outer GitHub Actions artifact ZIP** to obtain the **SHOWCOMPILER show ZIP** that you open inside the app.

## Integrity and bounds

- Standard ZIP STORE (method 0) with UTF-8 filenames and CRC32, no compression, encryption, descriptors or ZIP64. It is compatible with ordinary unzip tools.
- A strict `manifest.json` includes the archive version, exact asset IDs, original names, internal paths, byte lengths, and SHA-256 of each audio file.
- A versioned, schema-validated `project.json` contains script and cues. Neither API tokens nor machine transport state are serialized.
- Strict import rejects mismatched CRCs, SHA-256, unknown paths, duplicate/overlapping ZIP entries, bad references, unsupported compression and hidden content.
- Maximum **64 MB** total ZIP, **20 MB** per source audio, **100 files**. Browser decoder also limits audio to **10 minutes each**, mono/stereo.
- **All registered audio assets must have their original files present** to create a full ZIP. Otherwise Save JSON remains available and the ZIP export explains that some audio is missing.
- Historical asset IDs containing a colon are percent-encoded within the ZIP path to remain Windows-safe. ZIP extraction is never executed automatically.
- Audio is read from the browser's local `File` objects and downloaded as a local ZIP. No audio is sent to Meta, Baseten or SHOWCOMPILER's Node server by this feature.
- ZIP import stages the project and decoded buffers before committing; staged contexts are disposed on failure. Operator GO, pending runs and audition are blocked during import.

## Deliberate limitations

- This format stores sound files uncompressed, so downloaded ZIPs can be close to the combined audio file sizes.
- It is a prototype format, **not** a long-term archival guarantee or backup of external project dependencies.
- It cannot import arbitrary third-party ZIPs, compressed ZIPs or project formats from the earlier application.
- Original audio filenames are retained; decoded buffers are session-local after opening the show. No automatic cloud syncing.
- Very long / multi-channel files, timecode, sample-accurate scheduling, multiple physical audio outputs, ASIO and real Directo mode are outside this delivery.
- Browser audio may be interrupted by OS/browser power management; do not use this prototype in a public live show.
- Actual audible operation and browser dialogs still require human acceptance testing with speakers at safe levels.

## Engineering references

- `src/core/zipStore.mjs`: bounded ZIP STORE encoder/decoder and CRC32.
- `src/core/showArchive.mjs`: schema, asset, SHA-256 and manifest verification.
- `src/ui/app.mjs`: original audio File vault, UI export and transactional import.
- `tools/build-demo-package.mjs`: original synthetic WAV generator.
- `test/showArchive.test.mjs`, `test/demoPackage.test.mjs`: ZIP and WAV roundtrips, tamper resistance and origin.
- `.github/workflows/core-tests.yml`: Node tests, syntax, independent system ZIP validation and downloadable sample artifact.

No older application source code or third-party copyrighted audio has been copied into this branch.
