# RUNQ — Intelligent Show Production Workstation

**FROM SCRIPT TO STAGE**

RUNQ is a local show-production workstation for theatre, galas and scripted performances. Prepare a show from a script with contextual AI, refine cues using professional sound tools, rehearse with voice-following autopilot, and operate playback with direct controls.

![RUNQ wordmark](assets/runq-logo-full.png)

> **Hackathon submission:** Meta Global AI Developer Hackathon 2026. This repository's public-facing product is **RUNQ**; **ShowCompiler** is the historical repository and project name.

## Who RUNQ is for

- **Sound designers and operators** — cue lists, waveform editing, playback settings, fades, loops, layers and show control.
- **Small and amateur theatre companies** — prepare a cue-driven show with fewer dedicated technical resources, and use voice-following tools during rehearsals.
- **Drama schools and educational groups** — repeat scenes and practise audio cues without an operator pressing GO for every rehearsal moment.

## From script to show

1. **Project:** Create a show, import a TXT script or open a complete-show ZIP.
2. **RUNQ AI:** Use contextual assistance and **Auto prepare entire show** to analyze script windows, propose cues and prepare eligible sounds. Review and approve proposals and audio assignments.
3. **Studio / Sound:** Edit cue properties, waveform IN/OUT, fades, layers, loops, stop behaviour and sound assets.
4. **Script:** Keep cue references tied to source lines.
5. **Rehearsal:** Configure voice-following cues and rehearsal autopilot. It can respond to recognized spoken cues and support repeated or reordered rehearsal passages, subject to recognition limits and operator override.
6. **Live:** Use explicit GO, STOP and STOP ALL controls. The live transport is deterministic; AI-generated proposals do not directly authorize live playback.
7. **Export:** Use a full-show ZIP to include media when moving a show. Project JSON alone does not embed audio.

### A note on rehearsal automation

RUNQ's rehearsal autopilot is intended to let performers rehearse without a dedicated person triggering every sound. For simple small-company productions, voice-following playback can also assist a supervised operator. **Do not treat it as a certified, fail-safe unattended live-show system.** Microphone conditions, background noise and deviations from the script affect recognition. Keep manual override available.

## Quick start

**Requirements:** Node.js 20 or later; Chrome or Edge; local audio output. Microphone permission is required for voice features.

```sh
git clone https://github.com/vicentektek/showcompiler-hackathon-2026.git
cd showcompiler-hackathon-2026
npm install --no-audit --no-fund
npm run dev
```

Open the local URL printed by the server (typically `http://127.0.0.1:5173`). The interface supports English and Spanish.

**Important:** The repository's default branch may not yet contain the verified release candidate. Until publication is finalized, use tag `verified-working-2026-11-02` or the explicitly designated submission branch rather than assuming `main` is current.

### Run an offline demonstration

```sh
npm run demo:package
npm run demo:rehearsal
npm run dev
```

Import the generated complete-show ZIP through the Project screen. The original demonstration and rehearsal packages provide an offline path without connecting a judge's personal AI account. Real provider-based generation is optional and requires separately configured credentials.

### Run tests

```sh
npm run qa:codex
npm run test:product
```

The verified working reference `6d1d65d` was reported with **817 passing offline tests**. This is historical verification of that reference, **not a claim that tests have been rerun on the final public commit**. Offline tests do not validate model quality, sound hardware or unattended live operation.

## Architecture and AI providers

- **Local runtime:** Node.js HTTP server and browser ES modules.
- **Audio engine:** Browser Web Audio using the system's default output; no claim of isolated PFL or ASIO-certified routing.
- **Meta:** Muse Spark via Meta Model API for supported script/cue and contextual assistant workflows.
- **Sound generation:** Modal-hosted sound-effect generation integration.
- **Security:** Provider secrets must remain on the local server. Never commit API keys or credentials.
- **Portable shows:** Complete-show ZIP includes audio assets; JSON stores references.

RUNQ's product value is the integrated workflow, not automatic execution of unreviewed AI decisions. Models, providers, supported features and third-party license attributions must be verified against the exact submitted build.

## Documentation

- [Product identity and positioning](docs/BRAND_AND_POSITIONING.md)
- [Hackathon overview](docs/SUBMISSION_OVERVIEW.md)
- [Three-minute demo script](docs/DEMO_SCRIPT_3_MIN.md)
- [Repository and developer guide](docs/REPOSITORY_GUIDE.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [Publication security audit](docs/PUBLICATION_AUDIT_AND_PLAN_2026-11-02.md)
- [Rights and event-rules review](docs/PUBLICATION_RIGHTS_AND_RULES_2026-11-02.md)
- [Verified working version](docs/VERIFIED_VERSION_2026-11-02.md)

## Source availability and rights

**Copyright © 2026. All rights reserved by the respective rights holder(s).**

RUNQ is intended to be **publicly viewable for hackathon review**, **not released under an open-source license**. No general permission to copy, modify, redistribute or commercially exploit RUNQ's original code or assets is granted by this README. GitHub platform terms and third-party licenses still apply to their respective subject matter. Third-party components retain their own licenses. The final copyright-owner attribution and publication clearance remain pending review.

**Status:** Submission preparation in progress. This is a working prototype, not certified for safety-critical performance use.
