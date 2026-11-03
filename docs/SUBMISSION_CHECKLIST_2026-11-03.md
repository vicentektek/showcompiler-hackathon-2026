# RUNQ — Submission control sheet

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

## Release integrity

The documentation-only branch `docs/runq-final-submission-2026-11-03` originates from the exact frozen commit. Never describe later docs-only commits as a new tested program version. If docs are merged, retain the runnable build SHA in the release notes.

### After the video is ready
1. Add its verified URL to `SUBMISSION_COPY_2026-11-03.md` and check privacy/embedding permissions.
2. Add approved screenshots and only permitted/licensed public assets, if the portal needs them.
3. Confirm the exact repository/tag/archive judges will see is equivalent to frozen SHA.
4. Submit through the official authenticated portal, not an unrelated hackathon page.
5. Save the final receipt or confirmation page.
