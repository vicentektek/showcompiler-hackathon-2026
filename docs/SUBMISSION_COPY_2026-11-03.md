# RUNQ — Submission copy (English, ready to adapt)

> **Status:** prepared English submission copy, **not proof of submission**. The public YouTube video, GitHub URL and restrictive source-evaluation license are verified; only use screenshots you have personally inspected and meet any additional fields shown in the authenticated submission portal. The organizer's 3 November reminder requires a public repository and recommends a 3-minute demo.

## Name
RUNQ — From Script to Stage

## Short tagline
AI-assisted theatre cue planning, with human review and deterministic live audio control.

## Category / theme
**Indie developer** · **Build for Your World** · Performing arts / live-event technical production.

## Project overview
In theatre and live production, turning a script into a reliable sequence of sound cues often involves manually searching for stage directions, translating them into audio needs, mapping them back to source text, and keeping rehearsal changes synchronized with the operator's cue list.

**RUNQ** connects those steps. It imports a script, preserves original line references, proposes sound cues through an optional Meta Muse Spark analysis, and lets an operator review and approve each suggestion. The same show then flows into sound preparation, non-destructive cue settings, rehearsal, and manual audio operation. The objective is to reduce preparation friction without giving generative AI uncontrolled access to performance playback.

## Why this theme and why this developer

RUNQ is a **solo Indie Developer** entry under **Build for Your World**. Its creator works in live-event sound engineering and technical production: show preparation involves reading human-authored instructions, coordinating technical timing, managing audio readiness and responding to changing rehearsal conditions. A STANDBY is not a GO; live instruments, practical props, lighting directions and prerecorded sound must not be confused. Those first-hand operational distinctions shaped RUNQ's cue proposal rules, interface and safety boundaries.

The technical ambition also relates to the spirit of **Push the Frontier**: using domain-guided AI to make unstructured stage documents interpretable as inspectable, source-traceable proposals, without letting probabilistic output directly control a show. **Build for Your World remains the selected theme**; RUNQ does not claim physical hardware autonomy.

## Evidence a judge can inspect

- Domain-aware stage-production guidance: [src/core/performanceKnowledge.mjs](../src/core/performanceKnowledge.mjs).
- Meta Muse Spark 1.3 API adapter: [src/core/metaCueProvider.mjs](../src/core/metaCueProvider.mjs).
- Validation of untrusted proposals: [src/core/proposals.mjs](../src/core/proposals.mjs).
- AI context boundaries and separation from live transport: [docs/RUNQ_AI_CONTEXT.md](RUNQ_AI_CONTEXT.md).
- Reproducible offline demo and Core test evidence: [judge quickstart](JUDGE_QUICKSTART_2026-11-03.md) and [PR #140](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/140).

## How it works
1. Import a TXT, text-based PDF or DOCX script. Original lines stay available as L# references.
2. Ask Meta Muse to analyze selected script content and propose cues, or work with the offline/manual preparation route.
3. Inspect source evidence; approve, reject or edit proposals. Model output never triggers playback.
4. Review sound ideas directly on each cue. Configure gain, fades, loops and what happens to earlier playing sounds. Import/assign actual media; missing media cannot play.
5. Rehearse using optional speech following with explicit Auto GO arming, or operate GO/NEXT/STOP manually using the local audio engine.
6. Package the show with its audio as a portable ZIP.

## Why Meta AI matters
Meta Muse Spark is an **optional live inference** component in the real script-to-cue workflow. It proposes theatrical sound moments with line-backed evidence; the application validates and keeps those suggestions pending until reviewed. The product intentionally separates probabilistic interpretation from deterministic transport control. All local cue playback remains independent from inference availability.

The interface also includes a deterministic sound-prompt preparation path. This is described as local logic, **not** as another Meta model generation. The frozen submission does **not** generate new WAV files through Modal.

## Technical implementation
- Node.js local server with browser-native JavaScript modules (no React/Vite/Electron runtime in the frozen build).
- Browser Web Audio engine for local deterministic transport.
- Meta Model API integration for optional Muse-assisted script/cue analysis.
- Separate optional speech/rehearsal flow with deliberately armed Auto GO and operator emergency override.
- Strict validation for cue proposals, source references and editable playback policies.
- TXT/PDF/DOCX extraction; local audio library; portable archive import/export.
- Offline Node regression suites and browser E2E coverage. Application-tested SHA: `35d04069c4aa2595202b49ef101d1cf30d77273b`; [Core tests](https://github.com/vicentektek/showcompiler-hackathon-2026/actions/runs/41747150069) passed on the identical PR source. PR #140 development evidence reported 843 offline tests. Later source-tree updates are documentation/licensing and non-runtime archive exclusion.

## What makes it different
A stage operator can move from a script line to a reviewed cue and then to rehearsal and playback without handing the GO button to an LLM. The value lies in the **traceable script evidence**, **operator-level sound behavior**, and **explicit separation between AI proposals and show execution**.

## Current boundaries
RUNQ is a browser prototype, not a certified show controller. New remote audio generation is disabled in the submitted demo. It has no dedicated PFL or native hardware routing. Cue-level gain/fade/loop/overlap values are operator-controlled current settings, **not structured recommendations output by Muse**. Voice rehearsal depends on available microphone and provider conditions; manual GO intentionally disarms Auto GO.

## Built during the hackathon — evidence and disclosure
This repository is the event-specific implementation. The project developed script-linked AI proposal validation, review and operation workflows and iterated through UI, local audio, rehearsal and test work during the event. See dated commits and PRs for precise attribution. Some earlier design ideas and domain knowledge predate this event; do not present them as fresh hackathon code. Do not invent numerical quality claims from synthetic tests.

## Technologies
JavaScript ES modules, Node.js, browser Web Audio, Meta Model API (Muse Spark), optional speech service, `pdfjs-dist`, `mammoth`, `libarchive.js`. Historic Modal SFX experiments exist in development history but are **disabled for new generation in this submission**. Identify any additional actual deployment and third-party assets in the portal.

## Verified submission URLs (copy into Cerebral Valley)

- **Project:** RUNQ — From Script to Stage
- **Video:** https://youtu.be/zH_ErjF2gM0 (public, 2:38, verified in YouTube Studio).
- **Public source:** https://github.com/vicentektek/showcompiler-hackathon-2026
- **Judge install guide:** https://github.com/vicentektek/showcompiler-hackathon-2026/blob/main/docs/JUDGE_QUICKSTART_2026-11-03.md
- **License:** https://github.com/vicentektek/showcompiler-hackathon-2026/blob/main/LICENSE (All Rights Reserved + limited noncommercial evaluation).
- **Hosted demo:** not deployed; run locally with Node.js 20+ and Chrome/Edge using the judge guide. Do **not** invent a live web-app URL.
- **Screenshots:** attach only verified, approved captures if required by the portal; no public screenshot set has been independently attested here.
- **Submission receipt:** NOT VERIFIED. Complete and save the authenticated portal submission.

## Suggested video voice-over, ~3 minutes (adapt to actual footage)

The organizer's 3 November reminder specifically recommends a **3-minute video**. Do not upload until the final export has been checked at native screen resolution, particularly for text readability; verify the actual link plays outside the owner's authenticated account.
**0:00–0:20 — Problem.** "Every theatre production begins with a script. Turning stage directions into reliable sound cues is time-consuming — and during rehearsal, the plan changes constantly."

**0:20–0:45 — Script.** "RUNQ imports the script and preserves precise line references, so sound decisions can always be traced back to their source."

**0:45–1:20 — Meta AI and review.** "With Meta Muse Spark, RUNQ can propose cues from theatrical context. Suggestions stay pending. The operator checks the evidence and decides what becomes part of the show." If this recording uses an offline example, explicitly label it offline; do not claim a live model response.

**1:20–1:55 — Sound design.** "Each approved cue exposes its sound description and actual playback settings: level, fades, loop, and how to handle previous sounds. Real media is imported or selected locally."

**1:55–2:30 — Rehearsal.** "In rehearsal, optional speech tracking can follow the script and trigger explicitly armed cues. The operator remains in control: manual GO interrupts automatic mode, and STOP ALL is always available." Show only behaviors that truly work in the captured take.

**2:30–2:55 — Operation and portability.** "When the show is ready, GO and STOP run locally, without calling a model. The show can be exported with its assets for later use."

**2:55–3:00 — Closing.** "RUNQ: AI helps prepare the show. The operator runs it."
