# RUNQ — Final repository branch map and judge handoff
**Reviewed on 3 November 2026 · project freeze remains in force**

## Canonical release state

| Git object | Purpose | Disposition |
| --- | --- | --- |
| `b4e7df724d569c1d5af7682540c206ff3fb97701` | **Immutable reference build actually approved for the video** | Functional source of truth; Core tests passed, run `41690922577` |
| `release/runq-hackathon-2026-frozen` | Branch holding the exact approved reference commit | Preserve unchanged |
| `release/runq-indie-submission-2026` | **Only intended source branch for judges**; frozen runtime + submission docs and logo | Link this branch in the submission once access is authorized |
| `docs/runq-final-submission-2026-11-03` / PR #137 | Review/work branch for the presentation and security documentation | Historical preparation PR; do not ask judges to inspect its draft status |
| `fix/runq-prompt-only-sound-demo-2026-11-03` / PR #135 | Intermediate prompt-only SFX workflow | Historical preparation stage; not an independent final release |
| `feat/runq-cue-sound-design-review-2026-11-03` / PR #136 | Reviewed UI enhancement, basis of frozen source | Included by ancestry in final source; open PR does **not** mean the final branch is missing the code |
| `release/runq-hackathon-2026` | **Older, divergent release attempt**, not the freeze | Do not run or provide this branch to judges |
| `main` | Original default repository branch; **not updated to the selected final build** | Do not use as the submission link unless explicitly changed after review |

The default branch is presently `main`, the repository is private, and the final build is on an explicitly named release branch. GitHub's ordinary landing page therefore **does not automatically show the final README** until the default branch is changed. This is an outstanding packaging/access task.

Do not interpret old open/draft PRs as missing final code. Conversely, an open PR does not count as merged into `main`. The release branch was built from the actual approved descendant, and its functional source tree was checked against the frozen reference.

## Safe default-branch transition (owner action)

**Preferred approach:** make `release/runq-indie-submission-2026` the repository's **default branch** using the GitHub Settings interface **after** security/media clearance, rather than force-updating the old `main`. This does not rewrite the original `main` history and makes the right README appear by default.

1. Visit repository **Settings → General → Default branch** (GitHub UI placement can change).
2. Select `release/runq-indie-submission-2026`.
3. Save and reload the repository landing page; verify it shows the RUNQ logo and final judge instructions.
4. Check that all README links and the release source link resolve in a browser not signed in to the owner account **if the submission requires unauthenticated access**.
5. Decide whether the original `main` should remain a historical branch; never delete it merely because it is old.

**Do not** force-push `release` over `main`, merge 1,000+ historical commits, or close/delete hundreds of old branches to make the repository look tidy. A default-branch change is an admin setting, not a code merge.

## Security gate — blocks publication until cleared

The owner's Gitleaks report covered 2,283 reachable commits and nine extracted ZIPs. Two probable sensitive values were detected in the local ignored `.env`; one historical test-fixture value is still pending confirmed classification. The working-tree file is ignored and not in the published tree at its standard path, **but that is not sufficient to claim all credentials are harmless**.

- [ ] Provider credentials suspected compromised **revoked/rotated**, old copies removed or replaced in the local working tree, and a fresh local scan checked.
- [ ] Historical test-fixture finding classified as synthetic or treated as a real secret and revoked.
- [ ] Review GitHub secret scanning/Actions logs and third-party assets/licenses; do not publish private reports.
- [ ] Approve visibility/access plan; repository remains private until explicit action.
- [ ] Do **not** distribute the full local backup: it includes ignored and untracked material.

See [security audit](RELEASE_SECURITY_AUDIT_2026-11-03.md) and [rights inventory](THIRD_PARTY_AND_MEDIA_REVIEW_2026-11-03.md).

## Judge availability and demo

The released product runs with Node.js 20+, `npm install`, `npm run dev`, and a compatible browser. Optional Meta Muse API inference requires a server-side `MODEL_API_KEY` and an explicitly authorized request; no provider key is included in source. Reviewers without their own Meta key can inspect the documented offline/manual workflows and the recorded genuine inference segment, if supplied in the video.

A local `http://127.0.0.1:5173` address is **not a public hosted demo**. A private repository or private Codespace link is likewise not publicly judge-accessible. Do not claim that it is.

The official Meta public page confirms the **Indie developer** track and November 4, 2026 at **9:00 PM ET** deadline; this is November 5 at **03:00 CET**. The accessible public event page does **not** verify the exact authenticated submission form, required video length or source visibility. Use the official authenticated portal and accepted Official Rules as authority before uploading.

## Completion gates

- [x] Selected functional release source and reproducible version pin.
- [x] Core CI passed on approved runtime and on the earlier completed documentation branch.
- [x] Main judge-facing README, logo, installation, feature/limitation descriptions and technical provenance.
- [x] Canonical branding recorded: [RUNQ — FROM SCRIPT TO STAGE](BRAND_IDENTITY_FINAL_2026-11-03.md).
- [x] Written English submission and video narration draft.
- [x] Legacy research categorized as history, not promised functionality.
- [ ] Final current documentation-branch CI rechecked after updates.
- [ ] Meta/Modal credential and historical security findings fully cleared.
- [ ] Rights/redistribution audit of supplied audio/images/ZIPs signed off.
- [ ] Correct default branch and judge access set by owner.
- [ ] Video uploaded, link verified, exact portal fields filled.
- [ ] Final portal submission completed and receipt saved.

**No repository condition above implies the application itself should be modified.**


---

## Post-merge addendum — 4 November 2026

The historical branch-routing instructions above describe the state **before** PR #138. The owner explicitly approved integration, and [PR #138](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/138) was merged using a merge commit. As of this addendum, **`main` is the default branch and contains the final RUNQ source**, with only the scoped Windows verified-snapshot path fix relative to `release/runq-indie-submission-2026`. Do not change the default branch to the historic release branch as proposed in the superseded instructions above.

The repo is still **private**. The organizer's 3 November notification explicitly requires an **open-source GitHub repository** for submission; this is not satisfied by publishing a private link or simply inviting a judge. No source-publication approval, credential clearance, media-rights sign-off, or public video URL is recorded here. See [submission-day handoff](SUBMISSION_HANDOFF_2026-11-04.md) for the current critical path.
