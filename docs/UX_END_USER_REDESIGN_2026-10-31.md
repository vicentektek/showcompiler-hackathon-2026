# RUNQ — End-user interface redesign (31 October 2026)

## Scope and provenance

This document records work performed on **31 October 2026** for the Meta Global AI Developer Hackathon 2026. The change set is in branch `feat/runq-user-facing-ux-2026-10-31`, proposed in [draft PR #128](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/128) against `integration/runq-demo-2026-10-30`. It is **not merged into the integration branch or main** at the time of writing.

**Design objective:** make RUNQ feel like a finished show-control product rather than an AI testing bench. Keep operational and financial safety checks, but avoid exposing internal error codes, cost-policy implementation details, pilot terminology, and repetitive prompts in ordinary workflows.

This is a change log, not a claim that every RUNQ screen has been fully redesigned.

## Implemented changes

### Sound Lab and audio creation
- Moved connection diagnostics, per-request estimated ceiling, and daily spending limits into an optional **AI connection and usage details** disclosure. These values remain available when needed.
- Removed the **second native confirmation dialog** that followed an already explicit, amount-specific generation authorization. A checked authorization is still required for each paid sound request.
- Rewrote ordinary creation, connection, review, preview, accept/reject, import, and status messages to be clearer for an end user; added English/Spanish labels for the main Sound Lab workflow.
- Relabeled the local synthetic test sample as an **offline audio example (not AI-generated)** and moved it under optional details. It must never be presented as a live model result.
- Preserved sound-review requirements: a generated take must be ready and listened to before acceptance; importing a sound or creating a cue remains an explicit operator decision.

### AI script analysis and conversational editing
- Moved the Meta/Baseten provider and data-sharing explanation into an expandable disclosure. Explicit external-request consent and proposal review remain mandatory.
- Moved the conversational agent's provider selection and consent into optional AI settings. The consent control is revealed when an operator attempts an AI request without authorization.
- Simplified agent and conversational cue editor messages and sanitized raw upstream error strings.
- Introduced `src/ui/userFacingErrors.mjs`, a bilingual user-facing error mapping module; added unit and UX contract tests.

### Supporting integration
- Updated `tools/dev-server.mjs` to serve the new client-side message module.
- Updated existing browser test expectations for the revised wording and collapsed offline example.
- Added optional English/Spanish UI screenshot capture logic in `tools/sfx-lab-browser-e2e.mjs`, guarded by `RUNQ_CAPTURE_UI=1`. This is a test aid, not a claim that the screenshots have been reviewed.
- Updated English and Spanish locale strings describing AI permissions and proposals.

## Non-negotiable safeguards

The redesign must **not** weaken or remove:
1. Backend spending caps, server-side cost-policy validation, exact `acknowledgedMaxCostUsd`, `authorizationId`, and `confirmed: true` on a paid sound-generation request.
2. Explicit authorization before sending script/show context to Meta or Baseten; no automatic paid retries.
3. Cue proposal review/approval before applying AI changes.
4. Live show-control protections, STOP ALL, audio safety, and rehearsal autopilot ARM/DISARM.
5. Honest distinction between live model inference and recorded/offline examples.
6. Secret isolation: API credentials must never be embedded in public frontend code or the repository.

**Important distinction:** the normal interface can be simpler without promising free or unlimited inference. If a provider is not configured, generation must remain unavailable, with local editing still usable.

## Verification and evidence

- [GitHub Actions run 41155099279](https://github.com/vicentektek/showcompiler-hackathon-2026/actions/runs/41155099279) passed after integration fixes. It covers syntax, offline/unit checks, synthetic agent QA, ZIP demo packaging and browser tests. This run predates the later screenshot-capture-only change at commit `74ad728ed8b2bb9ea8f4ed850973a55bb9008169`.
- The later screenshot capture addition and any subsequent changes need their own CI verification before merge.
- No paid model calls were deliberately made to validate this redesign.
- Manual acceptance is **still required** for appearance, English/Spanish consistency, real audio devices/microphone, and authorized live-provider behavior. Do not present those as validated.

## Reproduce locally

From a clean local checkout, after saving any uncommitted work:

```powershell
git fetch origin
git switch feat/runq-user-facing-ux-2026-10-31
git pull origin feat/runq-user-facing-ux-2026-10-31
npm install
npm run dev
```

Open `http://127.0.0.1:5173`, then navigate to **Audio → Generate sound**. If the port is already occupied, stop the older development server first.

## Acceptance checklist (before merge)

- [ ] Review visual layout in English and Spanish, including desktop resolutions.
- [ ] Check that no normal user-facing errors expose provider tokens, JSON, HTTP codes, or raw stack traces.
- [ ] Confirm that generation cannot start without configured provider, valid server cost policy and explicit amount-specific consent.
- [ ] Confirm there is **one**, not two, consent interactions for a paid sound generation.
- [ ] Confirm unknown/uncertain generation outcomes are not retried automatically.
- [ ] Check proposal acceptance/rejection and no unauthorized show mutation.
- [ ] Test cue transport, STOP ALL, audio preview, and rehearsal ARM/DISARM on real devices.
- [ ] Re-run CI against the final PR head and inspect any captured screenshots.
- [ ] Review all remaining screens for untranslated or laboratory-only terminology.
- [ ] Keep PR #128 as draft until these checks are complete.

## Chronology and auditability

The commits in [PR #128](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/128/commits) provide the authoritative timestamped change chronology. The workflow logs and test artifacts provide supporting technical evidence. **Do not infer actual hours worked from commit timestamps**: accurate time accounting requires separately recorded work sessions. Do not rewrite, squash away, or fabricate evidence solely to make the history appear more extensive.

## Follow-up

A later phase can simplify remaining settings, AI creation, rehearsal and live-screen text. That work is **not** included in the scope claimed here. Do not merge the UX branch into the public hackathon candidate until the acceptance checklist and security review have been completed.
