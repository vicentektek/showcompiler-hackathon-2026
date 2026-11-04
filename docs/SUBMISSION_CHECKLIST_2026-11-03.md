# RUNQ — Submission control sheet

## Current verified control sheet — 4 November 2026 (supersedes dated notes below)

- [x] Public GitHub repository and tested functional source on `main` (PR #140; application source `35d04069`).
- [x] Public 2:38 YouTube video: https://youtu.be/zH_ErjF2gM0 (YouTube Studio reports no restrictions).
- [x] Root rights-reserved limited evaluation `LICENSE` and README updated; non-OSI source-available terms.
- [x] Unverified design-reference ZIP removed from **current** main via PR #143; old public Git history still includes it.
- [x] PR #140 Core tests passed; docs-only and archival-exclusion PR CI passed before merge.
- [ ] Confirm owner rights for live image assets and other third-party resources; demo synthetic WAV generator is documented but rights clearance still requires sign-off.
- [ ] Revoke/rotate the two Modal credentials in the local ignored `.env`; verify in the provider dashboard.
- [ ] Check historic refs/media exposure and security alerts as available; never rewrite history or force push without a separate plan and approval.
- [ ] Visit authenticated Cerebral Valley portal; complete form and save official confirmation/receipt.

**Older checkboxes below are retained as dated audit history and may contradict this newer status.**


## Submission-day update — 4 November 2026

- [x] PR #138 merged into `main` using a merge commit `6fbf45357b6d9651e4d04d7db82f67a067b562c1`; previous `main` and the unmodified release branch have archive refs.
- [x] Core tests and Windows PowerShell preflight passed for integration commit `ad90436`; this is not a new full run on the merge SHA.
- [ ] Organizer's **3 November reminder** requires an **open-source GitHub repository**; the current private source is not compliant yet. Do not mark this complete from a private judge invitation alone.
- [ ] Verify all historical and local credential findings, revoke/rotate affected keys, check archive/media ownership, select a source-code license and **explicitly approve** what to publish. A curated public snapshot may be safer than exposing the entire development history.
- [ ] Upload a working **3-minute demo video** and verify text clarity and playback in an independent session; paste the real link into the portal and `SUBMISSION_COPY_2026-11-03.md`.
- [ ] Complete and submit the authenticated Cerebral Valley form before **5 November 2026 03:00 CET**; save the receipt.

See [submission-day handoff](SUBMISSION_HANDOFF_2026-11-04.md). Earlier entries below are preserved as historical evidence and may refer to the original pre-merge state.

## Required repository security clearance

- [x] Initial targeted check of current frozen tree found no typical credential files and no recognized hard-coded token values in eight inspected modules. **Partial only.**
- [x] `.gitignore` hardened for private reports, raw footage and key files.
- [x] `SECURITY.md` and historical feature/experiment classification published on the docs branch.
- [x] Gitleaks full-history and working-directory scans reportedly executed (2,283 accessible commits); findings are **not yet cleared**. See [security audit](RELEASE_SECURITY_AUDIT_2026-11-03.md).
- [ ] Revoke/rotate the affected local provider credentials and rerun the working-tree scan.
- [ ] Privately classify the historical test-fixture candidate and sign off the result.
- [ ] Any exposed historical provider tokens revoked/rotated; inspect legacy PR/CI logs separately.
- [ ] Licensing/redistribution of bundled demo audio, brand images and reference ZIP confirmed.
- [ ] [Dependency and media rights inventory](THIRD_PARTY_AND_MEDIA_REVIEW_2026-11-03.md) reviewed and signed off before public sharing.
- [ ] Judge access or sanitized public snapshot approved; repository currently private.

## Recorded local backup

- [x] Operator reported a completed local full-directory backup (including `.git`, ignored files and uncommitted changes), checked by equal **17,465-file** counts and **761,501,620-byte** totals. This is an inventory comparison, not a bytewise hash verification.
- [ ] Keep the backup private and locally protected; ignored files may include sensitive credentials. **Do not distribute or upload this full backup.**

## Verified facts (3 November 2026)

- [x] Operator chose the build on branch `feat/runq-cue-sound-design-review-2026-11-03` as final.
- [x] Exact runnable commit identified: `b4e7df724d569c1d5af7682540c206ff3fb97701`.
- [x] GitHub Actions Core tests for that commit completed successfully (run `41690922577`).
- [x] No new provider requests are required to run offline tests.
- [x] Current source repository remains **private**; verify judge access before submission.
- [x] Docs deliberately distinguish disabled new Modal generation from optional Meta Muse analysis.
- [x] Operator reports that the demonstration video has been recorded and all intended local material prepared (3 November 2026); delivery files were not independently inspected here.
- [ ] Upload the final video, confirm its playback from an unauthenticated browser, and add its actual URL to the submission form and repo docs.
- [ ] Final screenshots captured from frozen build, without credentials.
- [ ] Official authenticated portal's **actual** required fields, duration and disclosure requirements checked and filled. Do not assume a generic Devpost form.
- [ ] Submission link points to a **judge-accessible version** of the exact frozen code or an explicitly approved source snapshot. Do not change repository visibility without owner approval.
- [ ] Secret scan and license/media-rights review completed, including Git history and video stills.
- [ ] New-profile clean install and start validated on final source.
- [ ] If demonstrating Muse, the on-screen model result and any performance number are verifiable; otherwise mark route as offline demonstration.
- [ ] If demonstrating live voice, record actual microphone result; do not substitute a simulator without labeling it.
- [ ] Final captions, audio levels and resolution reviewed.
- [ ] Submission confirmation/receipt saved outside repository.

## Official schedule and pending portal verification

Meta's public event page states **November 4, 2026, 9:00 PM Eastern Time** for submission. On that date US Eastern is EST (UTC-5), so this is **November 5, 03:00 CET (Europe/Madrid)**. Treat the authenticated portal as authoritative if rules or form requirements have changed.

Official event page: https://dev.meta.ai/events/global-hackathon

The event page describes the **Indie developer** track as assessed on creativity, technical ambition and whether it works. Do not borrow another competition's video-length, public-repo, or Devpost-specific requirements.

## Final GitHub branch and PR handoff

- [x] Dedicated source branch `release/runq-indie-submission-2026` contains the frozen application and the final documentation; functional source files unchanged.
- [x] PR #135 and #136 identified as historical feature stages, PR #137 as documentation review; no blanket merge into `main`.
- [x] Complete [release branch map](REPOSITORY_HANDOFF_2026-11-03.md) records the older divergent `release/runq-hackathon-2026` branch.
- [x] **Updated after the original checklist:** PR #138 integrated the approved source into `main`; `main` is now the default branch. The earlier alternative of changing default to the release branch is no longer necessary. Publication and judge access remain pending.

## Release integrity

The documentation-only branch `docs/runq-final-submission-2026-11-03` originates from the exact frozen commit. Never describe later docs-only commits as a new tested program version. If docs are merged, retain the runnable build SHA in the release notes.

### After the video is ready
1. Add its verified URL to `SUBMISSION_COPY_2026-11-03.md` and check privacy/embedding permissions.
2. Add approved screenshots and only permitted/licensed public assets, if the portal needs them.
3. Confirm the exact repository/tag/archive judges will see is equivalent to frozen SHA.
4. Submit through the official authenticated portal, not an unrelated hackathon page.
5. Save the final receipt or confirmation page.
