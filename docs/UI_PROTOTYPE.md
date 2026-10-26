# Browser UI — early hackathon prototype

The frontend is a **local, dependency-free browser prototype**, not a production show-control system or a working Meta AI integration.

## Windows quick start

From the repository root in PowerShell:

```powershell
git switch feat/hackathon-script-core
git pull --ff-only
npm test
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173) in Chrome or Edge. Stop with **Ctrl+C** in the same terminal. The local server binds to **127.0.0.1** only. If port 5173 is busy, run `$env:PORT=5174; npm run dev` and open `http://127.0.0.1:5174`.

## Manual test flow

1. Click **Ejemplo** to load a short original script, or import a UTF-8 `.txt` file.
2. Click **Cargar WAV/MP3 real** and choose a file from your computer. The decoded buffer stays in the browser (no upload). Then select a script line, the loaded asset, and enter the cue label.
3. Click **Crear propuesta simulada**. **No actual AI** is called.
4. Click **Aprobar** or **Rechazar**. Approval creates a cue in `DRAFT` state. **GO** explicitly starts actual audio. **STOP**, **FADE 1,5 s** and **PARAR TODO** stop it.
5. Click **Guardar JSON** to download a validated project document; click **Abrir JSON** to load it again.
6. Verify lines, proposals, statuses and draft cues persist after reopening. Audio files do **not** persist: relink by loading files with matching names.

## Boundaries and caveats

- **No real Meta AI**, but **real browser audio playback** is available after loading a local supported WAV/MP3. The JSON is not a complete sound-show backup.
- In-memory edits are lost if the tab is refreshed or closed without exporting a JSON document.
- The UI only displays the first 300 script lines. Source selection is limited to the first 1,000 lines (the domain parser supports more).
- Importing a new script creates a **new show** rather than silently invalidating existing cue references.
- Imported JSON is rejected if invalid or incompatible. The current state is preserved when a load fails.
- The local server exposes allowlisted files only and no write APIs; it binds to loopback, not the LAN.
- Node's automated tests and syntax checks do not replace interactive browser acceptance or accessibility audits.

## Browser acceptance still to be verified

Check audio playback, emergency stop, fades, file pickers, confirmation dialogs, cue approval and rejection, JSON download/reopen, and responsive layout manually in Chrome/Edge. See [manual audio acceptance](LOCAL_AUDIO_MVP.md). Then use those results to decide whether the UI may be merged into `main`.
