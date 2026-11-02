# RUNQ — Hackathon submission overview

**Project:** RUNQ (repository: ShowCompiler)  
**Event:** Meta Global AI Developer Hackathon 2026  
**Reference version:** `verified-working-2026-11-02` (`6d1d65d`)  
**Status:** Working prototype; not certified for safety-critical live-show operation.

## One-line pitch

RUNQ turns a theatre script into a reviewable, script-linked sound-cue workflow, combining AI-assisted preparation with deterministic local playback controlled by a human operator.

## The problem

Sound operators preparing theatre, galas and scripted performances must translate dialogue and stage directions into cues, locate or produce suitable audio, arrange transitions, and repeatedly adapt the show during rehearsals. Source-to-cue traceability is easy to lose, and rehearsal changes are time-consuming.

## The solution

RUNQ keeps script references, cue planning, sound preparation, review and show operation in one browser-based workspace. AI helps propose and edit; the operator remains responsible for approval and live transport.

## Product walkthrough

1. **Create or open a show.** Import a script and preserve its original source lines.
2. **Prepare cues.** Ask RUNQ AI to suggest sound cues tied to script evidence; inspect and approve proposals.
3. **Prepare sound.** Import audio or generate sound effects through the configured provider, then review and assign assets.
4. **Edit.** Configure playback, layers, fades, loops, stops and other cue properties.
5. **Rehearse.** Use script context and rehearsal tools to iterate.
6. **Operate.** Use explicit local GO/STOP controls; AI suggestions never directly trigger playback.
7. **Export.** Use the complete-show ZIP when audio media must travel with the show.

## Technical architecture

- **Runtime:** Node.js 20+ local HTTP server and browser ES modules.
- **Audio:** Browser Web Audio; output uses the system's default device.
- **AI:** Meta Muse Spark integration for cue/assistant workflows; Modal integration for sound generation. Provider credentials stay server-side.
- **Quality:** Offline syntax, unit, integration and synthetic evaluation tests; live provider behavior requires separate validation.
- **Portability:** JSON for project references; complete-show ZIP to include media.

## What makes RUNQ different

- Script-linked cue provenance instead of detached cue lists.
- Human-reviewed AI proposals instead of AI-operated live playback.
- An integrated route from script to sound asset to cue.
- Rehearsal-oriented workflow with explicit separation between preparation and operation.
- A dependency-light local browser architecture.

## Verified evidence

The owner reports the `6d1d65d` version works with real AI integrations. The published verification records 817 offline tests passing, zero failing. The offline suite does **not** certify audio hardware, live show reliability or model quality.

## Submission assets still to prepare

- A concise three-minute narrated demo with actual application footage.
- Screenshots from the tagged version, with source/asset rights checked.
- An accurate list of AI providers and which calls appear in the recorded demo.
- Final submission URL, team/author attribution and any required contest disclosures.
- A fresh run of QA on the exact final submission commit.

## Safety and scope

RUNQ is a prototype. AI-generated plans require human review. No AI call is added to deterministic GO/STOP operations. It does not claim isolated PFL, ASIO, multichannel hardware certification or professional live-show certification.
