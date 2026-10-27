# Hackathon demo and final release evidence — operator runbook
Date: 2026-10-27. Prepared plan / not an assertion that the tasks have passed.
Public-safe. Audience: solo indie developer, evaluator and QA.

## Primary promise

A live-show technician brings an original script. SHOWCOMPILER proposes source-linked sound moments using a Meta model (only after explicit consent), permits a human to review/approve, attaches real locally decoded sound, operates manually with safe GO/STOP, and exports a complete portable show for offline replay.

A second, guaranteed offline demonstration uses ORIGINAL, explicitly labeled sample cues + synthetic WAVs. The offline sample does NOT count as a live Meta model inference.

Never demonstrate an unfinished AUTO editor or native direct-sound stack as functional. The distinction between working MVP and upcoming features is part of credibility.

## Preconditions: choose the ONE tested integrated commit

The default main currently does not contain the tested full app. Do not point the judges to a scaffold or an unreviewed branch. Before publishing:
- one selected integrated commit exists, reviewed and with passed CI;
- README exact Node>=20 startup command and secure local endpoint documented;
- clean checkout works without API credentials in local demo mode;
- complete SHOWCOMPILER_SHOW_DEMO.showcompiler.zip is reproducible;
- no accidental provider billing during npm test or on page load;
- no proprietary files/third-party recordings, old-source-code imports, keys or personal account details;
- published repository is intentionally approved and actually accessible when submission is due;
- eligibility and submission requirements are verified against current OFFICIAL organizer rules. The public date page currently lists due date 2026-11-04 21:00 ET; reconfirm before final submission.

## Variant A: guaranteed offline judge path (NO API KEY)

1. `node --version`: confirm >=20.
2. `npm run check:syntax` then `npm test`.
3. `npm run demo:package` IF that command exists on chosen integrated checkout; independently verify archive integrity.
4. `npm run dev`, navigate to locally displayed URL in a mainstream desktop browser.
5. Choose the ORIGINAL three-sound demo. See the source script, L# references, approved/manual sample cue provenance, audio inventory.
6. Prepare first sound cue and use manual GO; confirm actual playback at safe volume. STOP. Test optional individual fade and STOP ALL with operator monitoring.
7. Export complete portable ZIP, reload in fresh browser session and GO again with network disconnected. Check audio bytes, count and source references match.
8. Open legacy JSON separately to demonstrate that it stores cue metadata only and requires audio reload; NEVER suggest JSON contains audio.
9. Confirm no PFL bus, physical device routing, certified real-time or native installer implied.

Acceptance notes: use a human, physical speaker/headphone check; browser tests alone cannot prove audibility or OS-level latency.

## Variant B: REAL Meta model value (ONLY with authorization)

1. Have a 10–20-line ORIGINAL theatrical script, annotated with expected positive AND negative sound triggers, in the selected script language.
2. Confirm exact Meta first-party model provider status without issuing an inference just by opening the UI.
3. Confirm current approved request budget/credits; disclose what excerpt and audio titles are sent. Do NOT expose API credentials or full private scripts.
4. Human explicitly authorizes ONE bounded analysis. Capture sanitized latency/tokens and quality notes only if the response was actually received.
5. Verify model suggestions: correct source L# anchors, meaningful brief for missing files, no fake thunder because an actor mentions an earlier thunderstorm, no duplicate ambience on its continuation line. Human may reject/modify incorrect suggestions.
6. APPROVE the sound ideas before they become draft cue definitions; attach local synthetic WAV or a new rights-clear sample. The model does not control GO.
7. Run manual GO/STOP at low volume. Show that even a correct model suggestion cannot trigger itself.
8. Export and reopen offline. Distinguish inference preparation from runtime: playback must not depend on Meta network availability.

If service, billing, or output validation fails: do NOT repeatedly retry in a live jury demonstration. Use the honest pre-recorded evidence of a previously validated REAL model sample if provenance exists, or use Variant A and explain that model access is optional/unavailable for this recording. No invented AI successes.

## Video: proposed 2m50s storyboard (adjust to submission requirements)

| Time | Visual proof | Operator narration goal |
| --- | --- | --- |
| 0:00–0:18 | Short original script / backstage context | A sound operator spends rehearsal time converting scripts into technical cues |
| 0:18–0:38 | Import TXT + L# source view | Original text anchors actions; no invented cue positions |
| 0:38–1:03 | Real Meta analysis output with provenance OR explicitly marked sample proposals | A model proposes moments, never executes or auto-approves |
| 1:03–1:28 | Review/approve and unresolved audio warning | Human stays responsible; missing sound remains blocked |
| 1:28–1:56 | Attach/select original WAV and press manual GO/STOP | Real local sound, deterministic operator action |
| 1:56–2:18 | Portable ZIP export/import | Whole show and original audio work offline |
| 2:18–2:40 | Successful reopened GO and panic | Portability, safe operation and no network dependency |
| 2:40–2:50 | Brief capability disclosure and value | Current prototype scope, clearly demonstrated |

If the API request takes time, capture the exact actual response before recording the 2m50s cut; disclose edited/accelerated segments, do not synthesize fabricated AI behavior. The video must correspond to the submission commit.

## Manual acceptance worksheet — do not check off without actual execution

- [ ] Starting from a fresh clone of the selected commit, Node packages/commands documented and app launches without credentials.
- [ ] A blank project starts with zero cues and current project identity visible.
- [ ] An original TXT script imports without losing text; source line references match.
- [ ] The offline demo is visibly identified as authored/synthetic, not model output.
- [ ] If live model is showcased, its origin, approval and bounded request are demonstrable without revealing the key.
- [ ] Missing audio blocks GO; attach/replace sound and re-evaluate readiness.
- [ ] Prepare cue 1; merely selecting cue 3, searching script or switching tabs does NOT change prepared GO.
- [ ] First GO audibly plays correct WAV at low volume; no GO is fired from AI/script navigation.
- [ ] Individual STOP and fade act on the intended cue; STOP ALL produces silence as far as backend allows.
- [ ] If AUTO is not live-integrated, no option claims that automatic follow or configurable loop is working.
- [ ] Save complete ZIP, reopen and confirm original source lines, asset names and audio bytes, then GO offline.
- [ ] Invalid ZIP cannot erase current running/staged show.
- [ ] During same-output audition, a visible speaker/output risk disclosure is presented.
- [ ] Recorded sound/screen are legible, at supported resolution, with no leaked identities, tokens or private show material.
- [ ] Submission links work for an unauthenticated evaluator after approval of public visibility.
- [ ] Official submission portal requirements, deadline/timezone and licenses are checked immediately before submission.

## Evidence manifest — fill in real outputs, do not prefill with assumptions

```json
{
  "product": "SHOWCOMPILER",
  "checkedAtUTC": null,
  "repositoryCommit": null,
  "branch": null,
  "runtime": "Node >=20, browser ES modules, Web Audio",
  "nodeVersionObserved": null,
  "syntax": {"command": "npm run check:syntax", "result": "NOT_RUN"},
  "unitTests": {"command": "npm test", "passed": null, "failed": null, "skipped": null},
  "demoPackage": {
    "command": "npm run demo:package",
    "result": "NOT_RUN",
    "sha256": null,
    "independentZipVerification": "NOT_RUN"
  },
  "browser": {"name": null, "version": null, "manualGoHeard": false},
  "model": {
    "liveUsedInRecording": false,
    "operatorAuthorized": false,
    "recordedRealRequestId": null,
    "usageClaim": "NONE",
    "qualityReviewedByHuman": false
  },
  "claimsNotValidated": [
    "native installer",
    "multichannel output routing",
    "isolated headphone audition",
    "professional latency",
    "voice-triggered live GO"
  ]
}
```

Do NOT commit completed manifest with false success data or raw model tokens, personal provider IDs or keys. Evidence data must be redacted and reproducible.

## Product release decision: GO / NO-GO

GO to public submission only when the actual supported path passes: fresh clone -> local startup -> script import -> manual/synthetic or verified-real AI proposal -> explicit approve -> audio loaded -> manual GO/STOP -> complete ZIP export/reopen -> manual GO offline. Any broken or misleading step is a blocking issue.

Reject speculative feature expansion if it jeopardizes this path. Defer automatic GO, runtime voice ASR, device routing and packaging to separate proven milestones.

## Next Codex engagement

Integrate C1 first. Do not give Codex this runbook as another broad coding task. After C1 and human audio verification, use ONE bounded browser E2E task to automate only the already working path. UI redesign and advanced action schema are separate post-demo backlog items.
