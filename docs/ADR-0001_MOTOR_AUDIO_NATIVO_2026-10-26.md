# ADR-0001 — Windows native-audio architecture

Date: 26 October 2026
Status: design direction accepted; native backend **not implemented**. This is new hackathon documentation informed by research, not code imported from an earlier project.

## Decision

ShowCompiler is desktop-first and offline-first. The current `127.0.0.1:5173` server is a local development host, not cloud deployment. The HTML/JS UI can later run in a Tauri 2/WebView2 desktop shell, but Web Audio remains a demonstration backend rather than the intended professional output engine.

Keep the script, proposal, human review, cue, persistence, and UI layers. Isolate transport behind an explicit audio-backend boundary. The long-term target is Tauri 2 with a Rust core and CPAL/WASAPI on Windows; ASIO may be optional only after licensing and hardware validation. Approved playback must remain available without a model or Internet connection.

## Current boundary

`src/core/audioBackend.mjs` is the UI-facing facade for `loadFile`, `go`, `stopCue`, `stopAll`, `reset`, asset state, runtime state, and truthful capabilities. It does not claim physical-device selection, independent preview buses, multichannel routing, ASIO, persistence, or professional certification.

`src/core/browserAudio.mjs` is a local demo adapter. It performs manual GO/STOP/fade/panic for loaded browser buffers and contains no inference/network path. A future Rust backend needs a richer, versioned contract; the current cue-ID transport is not falsely presented as a complete native abstraction.

## Capability comparison

- **Web Audio:** convenient stereo browser demonstration with local buffers and scheduling; no direct ASIO API or guaranteed professional channel routing/latency.
- **WASAPI shared:** built into Windows and usable without a third-party ASIO SDK; capabilities and latency require device-specific measurement.
- **WASAPI exclusive:** may reduce layers but monopolizes the endpoint; evaluate only after measuring shared mode.
- **ASIO:** useful for professional multichannel hardware when its driver and licensing requirements are satisfied. It must not be announced or distributed before review.
- **Rust CPAL:** provides host/device/stream I/O (WASAPI by default, optional ASIO feature), not decoding, cue scheduling, mixing, or show-control semantics.
- **RtAudio/miniaudio:** possible alternatives if measured CPAL limitations justify the additional integration/FFI cost.

## Intended process architecture

```text
Frontend UI (Tauri WebView)
  script · project · cue list · explicit operator GO
                ↓ typed IPC command / status ACK
Rust non-real-time control
  validation · preflight · devices · decode/stream workers
                ↓ bounded real-time command queue
Rust CPAL/WASAPI/optional-ASIO callback
  sample clock · voices · gains · buses · physical output · priority panic
  NO disk · NO network · NO allocation · NO blocking locks · NO model/UI logic
```

PCM blocks remain in Rust; JavaScript IPC carries typed commands and status, never the audio stream.

## Future domain/transport contract (not implemented)

- `Asset`: ID, hash, authorized local source, duration, sample rate, channels.
- `PlayAction`: creates an independent stable `playId` with asset, gain, timing, loop, delay, and bus.
- Stop/fade targets an exact `playId`, not every use of an `assetId`.
- Logical buses map explicitly to an output device and channel matrix after capability discovery.
- Selected cue, prepared cue, and active plays are distinct states.
- `runId`, epoch, `commandId`, cue ID, and prepare token reject stale callbacks/GO.
- GO performs preflight, resource reservation/prebuffer, same-clock scheduling, and atomic commit or safe rollback.
- Panic invalidates pending commands and silences output without waiting for the frontend.
- Scheduling uses the native sample/device clock, not JavaScript timers.

Illustrative API:

```text
listOutputDevices()
openOutput(deviceId, backend, format)
loadAsset(assetId, secureLocalSource)
prepareCue(cueId) -> prepareToken | errors
go(cueId, prepareToken, commandId) -> runId + ACK
stopPlay(playId) / fadePlay(playId, durationMs, targetGain)
panic()
getTransportStatus()
closeOutput()
```

This is not an implemented public API or an ASIO guarantee.

## Real-time rules

1. Preflight missing audio, formats, channel maps, and device availability before live operation.
2. Decode short files ahead of time; stream long files from non-RT workers through bounded ring buffers.
3. Use one device timeline and per-`playId` gain envelopes.
4. Mix voices to logical buses and an explicit physical-output matrix; expose clipping rather than silently normalizing.
5. If a device disappears, enter a visible safe error state; never silently redirect a live show to internal speakers.
6. Call preview independent only when hardware supplies genuinely separate outputs.
7. Portable packages need hashes, validated relative paths, and migration rollback; current JSON is not a media backup.
8. The callback must not allocate, block, log, access disk/network, or execute UI/AI work.

## Required native acceptance (not performed)

- Enumerate and repeatedly open/close real WASAPI devices and supported formats.
- Play simultaneous WAV/FLAC assets, repeated triggers, high voice counts, independent fades, and panic.
- Measure physical GO-to-output latency/jitter on the same hardware across shared/exclusive/ASIO; make no unmeasured claim.
- Test buffer sizes, supported sample rates, underruns, CPU pressure, long playback, sleep, and hot-plug.
- Verify multichannel PA/preview separation only on a device that exposes those channels.
- Verify silence after panic during UI failure/window close/pending GO.
- Label mock, real WASAPI, and real ASIO evidence separately.

## ASIO licensing

Steinberg's published licensing information distinguishes proprietary and GPLv3 routes and requires review before external distribution, including betas. Using a wrapper library does not automatically remove obligations. Do not commit proprietary ASIO SDK files to this public repository.

The architecture may remain ASIO-compatible, but ASIO stays disabled and unclaimed until licensing, build integration, channel routing, and real-device tests are complete. WASAPI does not depend on the ASIO SDK.

Primary references: [Tauri process model](https://v2.tauri.app/concept/process-model/), [Tauri Rust commands](https://v2.tauri.app/develop/calling-rust/), [CPAL](https://github.com/RustAudio/cpal), [Microsoft low-latency audio](https://learn.microsoft.com/en-us/windows-hardware/drivers/audio/low-latency-audio), [WASAPI exclusive mode](https://learn.microsoft.com/en-us/windows/desktop/coreaudio/exclusive-mode-streams), [Web Audio latency](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency), [ASIO license](https://github.com/audiosdk/asio/blob/main/LICENSE.txt), [RtAudio](https://github.com/thestk/rtaudio), and [miniaudio](https://github.com/mackron/miniaudio).

Revisit this ADR only after a real Windows WASAPI backend has hardware evidence. It does not demonstrate native or ASIO operation today.
