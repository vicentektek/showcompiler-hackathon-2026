# WASAPI native audio feasibility spike (new hackathon work)

**Purpose:** compile a minimal native Windows/Rust CPAL program, enumerate real output devices, and optionally play a short low-level tone using the default Windows audio host (WASAPI). This is intentionally **not** imported by the UI; it is not a mixer, QLab alternative, Tauri bundle, or ASIO host.

## Build on Windows with Rust / MSVC

```powershell
cargo test --manifest-path native-audio-spike/Cargo.toml
cargo run --manifest-path native-audio-spike/Cargo.toml
```

The normal command **only lists audio devices**; it produces no sound.

To audition *only when safe* and with monitors turned down:

```powershell
cargo run --manifest-path native-audio-spike/Cargo.toml -- --beep
```

This plays a brief 440 Hz tone at low gain. It uses the device's default configuration and supports F32/I16/U16 for this diagnostic. Other sample formats return a clear error.

**Status:** source committed to isolated branch `spike/native-wasapi-2026-10-26`, pending Windows CI and optional manual hardware acceptance. It does not include ASIO bindings, ASIO SDK, external audio files, device-specific channel routing, output buses, cue scheduling or UI integration.

## Validation scope

GitHub Actions Windows builds can demonstrate **that the Rust code compiles**. They cannot guarantee real speaker output, ASIO operation, multioutput routing or low latency without a real device. Document all measured results with hardware, driver, sample rate and buffer settings.

See the architecture ADR at `docs/ADR-0001_MOTOR_AUDIO_NATIVO_2026-10-26.md`.

Third-party dependency: `cpal` (Apache-2.0). Preserve dependency notices before distribution; never commit vendor SDK binaries or private license material.
