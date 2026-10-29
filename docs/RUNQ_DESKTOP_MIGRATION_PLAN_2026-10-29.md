# RunQ Desktop — Windows migration decision (2026-10-29)

Status: PROPOSED, no Windows .exe has been verified. Browser prototype is private loopback, not a public website.

## Packaging choice

Start a parallel Electron proof-of-concept: it embeds Chromium and preserves the existing HTML, CSS and JS engine. A Tauri/WebView2 experiment is a valid comparison for installer size, memory and startup, but would change the rendering engine and require Rust/native integrations. Choose by measured Windows results, not theoretical claims.

The local URL 127.0.0.1 is bound to the user's machine. Only explicitly authorized remote AI functions require internet. Never embed paid provider API keys in the executable.

## Process boundaries

- One authoritative show runtime: audio, GO, NEXT, STOP ALL, microphone, project state. Never one audio engine per window.
- Main process: window lifecycle, native file dialogs, local loopback server on ephemeral port, safe project storage. Deny unsolicited popups and external navigation.
- Renderer: sandboxed Chromium BrowserWindow with nodeIntegration=false, contextIsolation=true, sandbox=true.
- Narrow, validated IPC: openProject, saveProject, openAudio, openAuxWindow, showSnapshot, cueState. No arbitrary filesystem access or generic execute channel.
- Detached Script, Audio Library and Inspector windows subscribe to authoritative snapshots. They may request explicit commands but never start another transport or register duplicated global shortcuts.
- Local File assets currently live in browser memory. Desktop must handle persistent local paths/handles safely, revalidate on reopen and preserve complete ZIP export.
- STOP ALL always reachable. Passive row selection cannot trigger GO; direct row Play is an explicit action; rehearsal auto GO requires deliberate ARM.

## Visual fidelity

Chromium-to-Chromium preserves layout semantics and the CSS implementation, but pixel-perfect equivalence is not guaranteed across fonts, GPU, Chromium version and Windows DPI. Test 100%, 125%, 150% scaling and 1093x614, 1366x768, 1920x1080.

## Windows acceptance gates

1. Portable executable starts without Node installed on the target PC.
2. Single-instance lock and clean shutdown of local server, microphone and audio.
3. Import show, attach WAV/MP3, export ZIP, reopen offline with intact media and settings.
4. Test GO, direct row Play, Set NEXT, loop, fade, overlap, individual STOP and STOP ALL during pending asynchronous GO.
5. Detach Script and Audio Library, verify synchronization, no duplicate playback or auto GO, safe close/reopen.
6. Microphone permission and revocation, device unplug/replug and switching.
7. Stress 100/500 cues, 10 simultaneous sources, long loops, trim/fades and measured real output latency.
8. No provider requests without consent; no credentials in binaries; offline local operations work.
9. Keyboard shortcuts, accessibility, focus and visual parity at multiple Windows DPI scales.
10. Installer signing, SmartScreen and update strategy before distribution.

## Work plan

A. Stabilize V9 browser tests and operator safety.
B. Build separate Electron prototype branch and private unsigned test package.
C. Run actual Windows audio, microphone, latency and screenshot tests.
D. Implement shared state and detachable windows.
E. Merge desktop shell only after successful acceptance.

No executable or multiwindow engine is claimed as implemented in V9. Browser iteration is faster; desktop validation must run in parallel, not at the end.
