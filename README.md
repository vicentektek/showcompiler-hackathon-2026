# RUNQ — From Script to Show

**Meta Global AI Developer Hackathon 2026 · Indie developer · Build for Your World**

RUNQ is a browser-based rehearsal and sound-cue production tool. It connects a theatrical script, optional Meta Muse Spark cue suggestions, a human review process and deterministic local audio operation. AI helps prepare the show; **the operator controls GO**.

> **Frozen application build:** [`b4e7df7`](https://github.com/vicentektek/showcompiler-hackathon-2026/commit/b4e7df724d569c1d5af7682540c206ff3fb97701) (3 November 2026). Source branch: [`release/runq-hackathon-2026-frozen`](https://github.com/vicentektek/showcompiler-hackathon-2026/tree/release/runq-hackathon-2026-frozen). Documentation is prepared independently in PR [#137](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/137). **Do not use the historical `main` branch as the submitted version.**
>
> **Project status:** working browser hackathon prototype, not a certified professional show-control application. Repository is currently **private**; judge access/publication requires explicit approval.

## What it does

| Workflow | Frozen submission capability |
| --- | --- |
| Script import | TXT UTF-8, text-based PDF and DOCX; preserve original content and traceable `L#` references |
| Optional Meta AI | Muse Spark proposes script-linked cues; the user reviews and approves/rejects each proposal |
| Cue preparation | Review and edit pending descriptions, labels, source evidence and voice triggers |
| Sound design | Inspect cues individually: sound idea, level in dB, fades, loop and overlap/stop-previous policy |
| Local audio | Import/assign real sound files, edit playback properties, audition and prepare cues |
| Rehearsal | Optional transcription/script following and explicitly armed Auto GO; manual GO disarms autopilot |
| Operation | NEXT/GO, individual stop/fade and STOP ALL through browser Web Audio; no inference required for transport |
| Portability | Export/import full show ZIP with audio; JSON alone does not embed media |
| Languages | English/Spanish UI and spoken-language choices; English defaults for new profiles |

**Important distinction:** Muse-derived acoustic descriptions are not the same as operator-configured numeric dB, fade, duration and overlap values. The current model proposal contract does not ship structured numeric sound-setting recommendations. RUNQ does **not** create new WAVs through Modal in the frozen version; the sound assistant prepares prompts for local audio assignment.

## Run the exact build

**Prerequisites:** Node.js 20+, npm, recent Chrome or Edge, audio output. Meta credentials are optional for the manual/offline walkthrough.

```sh
git clone https://github.com/vicentektek/showcompiler-hackathon-2026.git
cd showcompiler-hackathon-2026
git checkout b4e7df724d569c1d5af7682540c206ff3fb97701
npm install --no-audit --no-fund
npm run dev
```

Open **http://127.0.0.1:5173**. In Codespaces open the forwarded port 5173; do not assume a GitHub source page runs the application.

For offline validation:

```sh
npm run check:syntax
npm test
```

The frozen commit passed GitHub Actions **Core tests**, run `41690922577`. This confirms automated checks (including offline browser validation), **not** professional operation, live microphone reliability or guaranteed live-model availability. No paid calls are needed to run routine tests.

## Five-minute walkthrough

1. Use **Try original audio demo** or import a rights-cleared TXT/PDF/DOCX script.
2. Open **Build your show / RUNQ AI**. Review pending script-linked cue proposals or create a manual cue.
3. Open **Sound design** on an approved cue; inspect gain/fades/loop/entry behavior. Saving a setting does **not** execute GO.
4. Assign a local audio file if the cue is unresolved. Check its actual duration rather than assuming a model estimate.
5. In Rehearsal, use manual control or explicitly start listening and arm Auto GO (credentials/mic required). **Manual GO disarms Auto GO** intentionally.
6. Prepare **NEXT**, execute manual **GO**, demonstrate stop/STOP ALL, and export a complete show ZIP.

For a live Meta Muse demonstration, configure the server-side `MODEL_API_KEY` according to [Meta Model API setup](docs/META_MODEL_API.md) and make an explicit request. Do not upload private scripts or show API keys in screenshots. Offline prompts and synthetic fixtures must be labelled as offline, not real model results.

## Submission documentation

- [Release notes and complete feature boundaries](docs/SUBMISSION_RELEASE_2026-11-03.md)
- [Judge installation and walkthrough](docs/JUDGE_QUICKSTART_2026-11-03.md)
- [Project description in English and draft narration](docs/SUBMISSION_COPY_2026-11-03.md)
- [Capture list and recording guidance](docs/DEMO_CAPTURE_2026-11-03.md)
- [Final verification checklist](docs/SUBMISSION_CHECKLIST_2026-11-03.md)
- [Security audit and publication conditions](docs/RELEASE_SECURITY_AUDIT_2026-11-03.md)
- [Third-party components and media-rights inventory](docs/THIRD_PARTY_AND_MEDIA_REVIEW_2026-11-03.md)
- [Feature status / future audio integration](docs/FEATURE_STATUS_AND_FUTURE_AUDIO_2026-11-03.md)
- [Dated development history and experiments](docs/DEVELOPMENT_HISTORY_INDEX_2026-11-03.md)

## Technology and disclosure

Node.js local HTTP server, browser JavaScript ES modules, Web Audio, optional Meta Model API (Muse Spark), `pdfjs-dist`, `mammoth` and `libarchive.js`. The project does **not** claim a native Windows binary, PFL isolation, hardware DMX/ASIO integration, certified live-show safety, or enabled remote audio-generation deployment.

Earlier Modal SFX, Baseten evaluation, TTS, desktop and other proof-of-concept work remains in dated development documentation and Git history; it is **not** advertised as shipped. See the [archived long-form development README](docs/README_DEVELOPMENT_HISTORY_2026-11-03.md). No implicit open-source license is granted; distribution rights for media and code must be reviewed before a public release.

**RUNQ — AI helps prepare the show. The operator runs it.**
