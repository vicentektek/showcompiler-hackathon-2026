# Windows browser-demo package

Verified on Windows x64 with .NET Framework's installed C# compiler, Node 22.16.0 and Chrome. This is an **unsigned console launcher plus the current browser application**, not an installer, Electron rewrite, native audio engine or professional live-show certification.

## Operator walkthrough

1. Verify the supplied ZIP SHA-256, then extract the **entire** ZIP to a fresh folder. Do not run the EXE from inside the archive.
2. Start `RUNQ.exe`. It starts its own bundled Node server on an available loopback-only port and opens the default browser. No npm install or system Node is required.
3. Open `demo\RUNQ_THE_LAST_GO_EN.showcompiler.zip` using RUNQ's complete-show import. The original script, three cues and three original synthesized WAVs are included.
4. Follow [The Last GO](THE_LAST_GO_REPRODUCIBLE.md) for reviewed Hero creation, saving, reopening, Rehearsal and manual Live.
5. Use **STOP ALL**, then close the browser before typing `exit` or pressing Ctrl+C in the launcher. Stopping HTTP alone cannot stop audio already decoded in an open browser.

Requires Windows x64, .NET Framework 4.5+ and a current browser supporting the existing Web Audio application. No automatic restart or model request occurs at launch. Actual microphone/ASR, audible output, device routing and room latency require separate operator measurements. Paid AI must be configured and explicitly authorized by the operator; this packaging gate performs no provider calls.

The package has its own working directory and intentionally does not include private evaluation ledgers or credentials. It therefore does not reuse the original lab's local budget history. Run any paid campaign from the operator-approved directory under its existing ledger and spend policy; never use fresh package copies to bypass a cap.

## Rebuild without secrets or dependencies

Use Node >=20 and the existing Windows .NET Framework compiler. Obtain the **complete license** and official `win-x64/node.exe` SHA-256 for the exact installed Node version from the public Node distribution. The observed Node 22.16.0 SHA-256 was `c5ff4c736112dd483c750fd4149d30c8a116db1a49b8b3ec88be4b65e6c86c19`; do not reuse it for another version.

```powershell
npm.cmd run demo:windows -- --output "C:\RUNQ-Deliverables\fresh-build" --node-license "C:\RUNQ-Inputs\NODE-LICENSE.txt" --node-sha256 "<official SHA-256>"
Expand-Archive -LiteralPath "C:\RUNQ-Deliverables\fresh-build\RUNQ-Windows.zip" -DestinationPath "C:\RUNQ-Deliverables\fresh-build\extracted package"
npm run test:windows-package -- "C:\RUNQ-Deliverables\fresh-build\extracted package\RUNQ-Windows"
npm run qa:codex
```

The output must be fresh and outside the repository; existing destinations are refused. The builder copies only server-public assets, relative server dependencies, the published libarchive.js package with its license, the verified Node executable/full license and the original demonstration. No project `.env`, ledger, Git folder, local reports, backup patch or private worktree snapshot is copied.

Use `npm.cmd` for the flagged build command in PowerShell: the local `npm.ps1` invocation consumed the `--` separator and stripped option names. The builder correctly refused that malformed invocation before writing output. Direct `node tools\windows\build-windows-package.mjs --output ... --node-license ... --node-sha256 ...` also preserves the flags.

`FILE_HASHES.json` covers 165 payload files in this build; the ZIP's separately reported SHA-256 covers the manifest as well. `SOURCE_REVISION.txt` records the checkout base: build a delivery after committing validated source. Archive timestamps can differ between builds, so compare the reported hash of the actual delivered ZIP rather than assuming a byte-reproducible compressed archive.

The extracted-package gate exercises the actual EXE, bundled Node and HTTP server, checks payload hashes and process exit, imports/decodes Last GO, reviews/applies Hero, exports/reloads/reopens four cues with three WAVs, and performs browser-engine GO/STOP ALL. Browser output is not acoustic evidence. Cross-platform offline tests cover sanitized startup failure; Windows-only contract tests cover rejected build inputs. Windows compilation/extracted EXE verification is local evidence, not an unexecuted Linux CI claim.

The follow-up gate restores the original three-cue show, explicitly returns to Live after import, opens Script at 768px and checks the real status/read-only inspector has no horizontal overflow and no change to prepared GO/audio. Its `live-inspector-768.png` capture is written next to the freshly extracted application, not into the delivered ZIP.
