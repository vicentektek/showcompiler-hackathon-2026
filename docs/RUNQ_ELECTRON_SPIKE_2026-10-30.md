# RUNQ desktop spike — isolated Windows portable experiment (30 October 2026)

**Branch:** `spike/runq-electron-windows-2026-10-30` from RC1 `d10b32fc`.
**Status:** Experimental source + offline loopback/permission tests + Windows packaging workflow. **Not a working/certified EXE until GitHub Windows Actions and a physical Windows test pass.**

## Boundaries

- Reuse the **one** existing `createAppServer()` and the **one** existing browser-side Web Audio cue engine. No duplicated GO/NEXT/STOP, cue queue or persistent project state.
- Electron is the desktop host only. Its main process launches Node HTTP at an ephemeral **127.0.0.1** port; the BrowserWindow navigates only to that exact origin. One process instance and one window.
- `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`; no IPC or preload; deny all popup windows and off-origin navigation.
- Deny all requested permissions except exact-origin **audio-input media**. Camera, screen, location and notifications are rejected. Physical microphone operation is **not yet proven**.
- Uses Electron `45.1.0` and electron-builder `26.18.0` as dev-only dependencies. No auto-update, externally hosted scripts, API inference, key handling, release, public repository change or merge.
- .env / keys / local ledgers / artifacts must **not** be packaged. A portable executable may have **no provider configuration by default**. Configuring safe per-user provider settings is future work; do not embed keys for a demo.

## Offline Windows build instructions (operator later)

Run from a **separate worktree** using this branch:

```powershell
git fetch origin
git worktree add "..\\runq-electron-spike" origin/spike/runq-electron-windows-2026-10-30
cd "..\\runq-electron-spike"
npm install --no-audit --no-fund
node --test test/electronSpike.test.mjs
npm run desktop:dev
npm run desktop:pack
```

`npm run desktop:dev` opens RUNQ in Electron, independent of a browser or manually started dev server. `npm run desktop:pack` creates an **unsigned experimental** `dist-electron/RUNQ-spike-*.exe`. This is not a verified standalone product; SmartScreen warnings may occur for an unsigned executable.

GitHub Windows Actions should publish the isolated portable file as a **private CI artifact**, not a release. Verify the exact branch HEAD and workflow conclusion before opening it.

## Physical acceptance gate (manual on Windows; not simulated)

1. Launch from EXE without Node installed or an external browser. Exactly one window; second launch refocuses, no duplicate server/audio engine.
2. Import original ES and EN TXT; import local WAV and RAR/7z/ZIP archive; export/re-import complete show ZIP.
3. Listen to pre-audition and cue GO, set NEXT without executing, per-cue STOP/FADE, STOP ALL; verify the actual default audio device and no late audio after closing.
4. In Ensayo only, request microphone, verify real transcription, ARM/DISARM and AutoGO skip/rewind/repeat. No accidental GO; no camera/video permission.
5. Confirm local server/socket closes on exit; reopen with Windows firewall and antivirus enabled.
6. Confirm that protected secrets, `.env`, .runq-local and private scripts are absent from packaged contents; no costs incurred.
7. Measure memory and audio timing in a real rehearsal; test 1366×768. No certification, hardware integration, ASIO or separate PFL claims.

**Fallback:** If Electron breaks voice, archive import or audio STOP, keep the already-tested browser RC1 for hackathon submission. Do not merge this spike or claim portable readiness prematurely.
