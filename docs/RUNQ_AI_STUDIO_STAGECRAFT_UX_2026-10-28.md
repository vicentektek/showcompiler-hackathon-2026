# RunQ AI Studio — Stagecraft UX and integration specification

Status: **design contract only**. No model-generation workflow is added, enabled or deployed by this document. All examples are conceptual and must never be labeled as actual model output.

## Product proposition

A script creates a **need**; an operator approves a **cue**; the audio workbench prepares the **sound**; the operator approves the **asset**; the existing runtime executes only on a deliberate manual **GO**.

**AI Studio** must feel like a connected production environment, not a separate chatbot or sound generator. The show remains fully operable when AI and SFX services are offline.

## Three task modes in one workspace

### 1. Script Analysis
- Left: original numbered source with selectable scenes, character cues and stable Lxx.
- Center: cues proposed in sequence with kind (SFX, environment, or manual), trigger line and review state.
- Right: inspector explaining the source evidence, editable cue label, action type and **Approve / Edit / Reject / Design sound** actions.
- Display whether a proposal directly follows an **explicit stage direction** or is a **creative interpretation**. Avoid invented numerical confidence.
- Submitting analysis is an explicitly opt-in remote action; send a bounded selection/context, never a full raw script silently. Model output never alters the cue queue or fires sound.

### 2. Sound Design
- Open contextually with a preserved cue target, proposal ID and Lxx, or with no target from the Audio Library.
- Left: exact script evidence, destination cue, type, source and operator notes.
- Center: REAL decoded WAV waveform, low-volume audition, trim IN/OUT, sample list/history; show an accurate empty state before a file is available.
- Right: an editable acoustic prompt, actual supported kind (SFX or environment), supported duration 1–12 seconds for pilot, provider/cost/capability status, and explicit request authorization.
- Keep seed/request ID in expandable advanced details. Do not make these mandatory visible controls for most people.
- One visible sample corresponds to ONE accepted job. Three variations require three historical jobs or a future API capability. Do not fabricate multiple results from one request.
- Only verified provider milestones may appear: not configured; pending authorization; queued; running; submission unknown; cancel requested; ready for review; accepted; rejected; cancelled; failed.
- Do not show percentage complete or remaining time if provider returns only status. Unknown cost must be shown as unknown, not zero.

### 3. Review and Apply
- Show a trace chain: original Lxx -> cue proposal -> human decision -> sound request -> reviewed WAV checksum -> imported asset -> cue track.
- Sound review and cue assignment are **distinct approvals**.
- Accepted WAV enters the show only after a selected destination and an explicit import action; allow "Add to library only" and "Assign to selected cue".
- Import errors leave the current show, local assets and manual GO sequence untouched. The archive contains generated files only after they are imported.
- On success return to the exact cue in the Cue Editor with correct source, asset and visual READY state; **never change NEXT GO**.

## Contextual access, not duplicate screens

| Entry point | Launch behavior | Retained context |
|---|---|---|
| Home | Optional Start with AI | Active show |
| Script selected lines | Analyze selected scene/lines | Exact Lxx and excerpt |
| AI review proposal | Design missing sound | Proposal and cue intent |
| Cue Editor unresolved track | Generate for this cue | Explicit cueId + actionId + Lxx |
| Audio library | Generate sound | No cue target required |
| Rehearsal | Save an idea for later review | Script context; manual-only |
| Operation | NO generation, provider calls or AI-driven automatic GO | Deterministic transport only |

A cue may be created and edited entirely without AI. Alternatives are always available: choose existing asset, load a local file, defer the audio plan, or keep a manual cue.

## Design language

- Preserve Stagecraft's technical typographic identity, dark graphite surfaces and compact geometry.
- Highlight **selection and AI suggestion** with violet; **approved/ready** with signal lime; **confirmed audio** with cyan; **cost or uncertain job** with amber; **errors/cancellation** with red. Use text and shapes as well as color.
- Three-pane layout at 1366x768; at 1093x614 collapse the right inspector to a switchable panel/drawer, never shrink labels below 12px for primary content.
- Script Lxx and cue numbers use aligned monospaced digits. Make the waveform central when audio exists; do not substitute a decorative wave for missing real data.
- Avoid large chat-bubble threads, card dashboards, fake meters, fabricated coverage percentages and repetitive pop-ups.
- Support keyboard focus, escape/discard, repeatable review actions, accessible context state and EN/ES.

## Existing implementation boundaries to preserve

- The cue engine owns the selected cue, NEXT GO, live voice instances and STOP ALL.
- Existing script AI workflow owns source evidence and human proposal approval.
- The separate SFX API owns one authorized job's lifecycle: GET /api/sfx/status; POST /api/sfx/jobs; GET /api/sfx/jobs/{id}; POST /api/sfx/jobs/{id}/refresh; POST /api/sfx/jobs/{id}/cancel; POST /api/sfx/jobs/{id}/review; GET /api/sfx/jobs/{id}/audio.
- The initial SFX pilot has one active or uncertain job, at most three daily starts, source line field Lxx, 1–12s audio and remote generation off by default. This is a **request quota, not a monetary cap**.
- The existing sound laboratory may preview and export a trimmed local WAV, but its acceptance does not yet mutate or import anything into a RunQ show.
- The WAV import candidate requires human acceptance and matching SHA-256 and has targetCueId=null until deliberate assignment. Never bypass the existing show asset import and persistence.
- Provider model roles may differ: script understanding does not imply that same model made the sound.
- Show and Sound Lab branches are developed in parallel; integrate via a small adapter and test, not a blanket copy of independent audio engines or competing UI components.
- The sound audition currently shares the system output with live audio; do not call it isolated PFL.

## Hackathon positioning: model value must be observable

The central model-assisted moment is **script understanding with verifiable stage directions and editable cue proposals**. Show the exact input lines, the output actions, the operator corrections, and the resulting runnable sequence. This is the clear domain-specific contribution.

The sound synthesis pilot may be implemented through a separate provider. It completes the production workflow but should **not** be described as output of the script-understanding model. In the demo, distinguish the two services and their actual responsibilities, and avoid spending most of the time on an unrelated SFX playground. Prioritize a complete end-to-end working flow over model-count or decorative output.

## One focused demo scenario (65–90 seconds)

1. Show a previously imported short scene. Highlight the stage direction "the iron door slams" and its original Lxx.
2. Analyze the selection, displaying real proposals with provenance and "explicit" versus "creative" origin.
3. Rename and approve an actual cue; the selected cue still does not reposition NEXT GO.
4. Open "Design sound" from the unresolved cue, inheriting the exact context, edit the prompt and show the supported SFX settings.
5. Show a genuine previously generated WAV **labeled as a historical result**, or an explicitly authorized real live job when verified. Never pretend that a synthetic preview is an AI result or that a job finished instantly.
6. Listen at safe output gain, trim in the genuine sound preparation view, approve and manually import/attach to cue.
7. Jump back to Cue Editor, show Lxx/track and readiness, then press the actual manual GO in Operation.
8. Conclude with script evidence -> edited cue -> approved original WAV -> deterministic performance.

Quality of the ONE showcased sound and the end-to-end flow matter more than generating many weak samples.

## Delivery slices and acceptance

**P0:** Contextual navigation; scripted proposal review; real SFX capability/error state; one authorized job and verified WAV; safe user-reviewed import with explicit target; existing manual GO/STOP. Maintain full offline manual cue workflow.

**P1:** A/B comparison of actual historical takes, cues grouped by scene, stable sound-job history, multi-asset library reuse, full contextual waveform editing and monetary usage reporting.

**P2:** Expanded audio categories only with compatible licensed providers, more intelligent rehearsal suggestions, portable native audio output after hardware testing.

**Regression matrix:**
- Selection, search, language and view change never move NEXT GO or start audio.
- No model request on page load, GO, STOP, preview or reopening an existing project.
- No new job submission on uncertain remote status; status refresh is not a retry.
- Sound jobs with missing/incorrect WAV/hash cannot enter the asset library.
- Import failure, stale project switch, wrong target cue and changing source file are safe and recoverable.
- The Sound Lab's authorization, limited quota and explicit review are preserved.
- Project JSON/ZIP reopen preserves original cue source IDs and imported WAV bytes.
- 1366x768, 1093x614, 125% and 200% zoom, keyboard-only, EN/ES and reduced motion.
- Windows low-volume hardware audition and emergency STOP verified separately; offline browser CI does not certify physical playback.

This document is intentionally independent of competitor names and previous repositories. No provider deployment, paid requests, schema migration or UI changes are performed by this design specification.
