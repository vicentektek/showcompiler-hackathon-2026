# Real local audio — browser MVP

Date: 26 October 2026
Status: Web Audio engine implemented and automatically tested with simulated adapters; manual audible Windows acceptance remains pending.

The browser decodes and plays operator-selected local files. This engine is separate from model analysis: no AI or network request occurs in GO, STOP, fade, or STOP ALL.

## Windows acceptance

From PowerShell in the repository:

```powershell
npm test
npm run dev
```

Open `http://127.0.0.1:5173` in Chrome or Edge, set a safe speaker/headphone level, then:

1. Select **Example** or import a rights-clear script.
2. Select **Load real audio** and choose a short supported file. It stays in browser memory and is not uploaded.
3. Create a simulated proposal on a source line with that asset, then explicitly approve it.
4. Select **GO** and verify the file is audible.
5. Test immediate **STOP**, GO again, and **FADE 1.5 s**.
6. Run multiple cues and select **STOP ALL**; confirm every source is silent.
7. Approve an unbound `PLAN_AUDIO` cue and verify GO remains disabled for DEFER and GENERATE intent.
8. Assign a library asset but do not load its file; verify GO remains disabled until decoding completes.
9. Disconnect the network and repeat loaded GO/STOP/fade/STOP ALL.
10. Export/open JSON and reload the matching local file, because audio bytes are not persisted.

If port 5173 is occupied:

```powershell
$env:PORT = 5174
npm run dev
```

## Enforced constraints

- GO needs a direct operator action on an approved `DRAFT` cue.
- Every action must be `PLAY` and every referenced asset must have a decoded buffer.
- Initial gain is 50% (approximately −6 dB); this is not a substitute for safe hardware gain staging.
- Input size is capped at 20 MB, duration at 10 minutes, and channels at mono/stereo. Browser codec support varies.
- A running/pending cue cannot GO twice.
- STOP and fade are local; STOP ALL silences active gains and invalidates pending asynchronous GO.
- Changing/opening a project resets buffers and cancels stale decode/transport work.
- Audio exists only in volatile browser memory and is never embedded in project JSON.

## Not provided

No ASIO, professional channel routing, independent preview bus, multichannel output, timecode, native sample-clock guarantees, portable media package, or safety certification exists. Do not use this prototype for a public performance or safety-critical control.

Automated tests validate state transitions and scheduling against fake AudioContext objects. They do not certify audible output, codecs, hardware compatibility, latency, or gain. Record manual evidence before making those claims.

Implementation: `src/core/browserAudio.mjs` behind `src/core/audioBackend.mjs`. Tests: `test/browserAudio.test.mjs` and `test/audioBackend.test.mjs`.
