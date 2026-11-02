# RUNQ — submission readiness checklist

## Publication model
- [x] Owner chose publicly viewable source with no general open-source reuse license.
- [x] Verified Cerebral Valley response: public GitHub repository required; no specific license mandated; source-available accepted.
- [ ] Verify exact rights-holder attribution and third-party notices.
- [ ] Complete whole-history secret scan and rights clearance; the documentation branch alone is not clearance.
- [ ] Select clean public submission snapshot versus exposing the full development history.
- [ ] Owner explicitly approves visibility change after clearance.

## Repository
- [ ] Verify final commit SHA, branch and tag.
- [ ] Confirm README matches the exact submitted version.
- [ ] Confirm all-rights-reserved notice and attribution/third-party notices are appropriate; do not add an OSI license by default.
- [ ] Check git history and tracked files for secrets and private material.
- [ ] Verify `.gitignore` excludes local provider logs, generated audio and private scripts.
- [ ] Ensure the demo build can be started from a clean checkout.
- [ ] Review open PRs and avoid accidental merge to `main`.

## Verification
- [ ] `npm install --no-audit --no-fund`
- [ ] `npm run qa:codex`
- [ ] `npm run test:product` (browser dependencies required)
- [ ] Confirm Meta and Modal workflows manually with operator authorization.
- [ ] Import and export a complete-show ZIP, then reopen it.
- [ ] Exercise GO, STOP ALL, cancellation and late-result handling.
- [ ] Validate ES and EN labels and workflows.

## Submission
- [ ] Final project name and short pitch.
- [ ] Screenshots and three-minute demo video.
- [ ] List of model/provider integrations with accurate attribution.
- [ ] Team attribution and contribution timeline.
- [ ] Confirm contest rules, deadlines and required fields from official source.
- [ ] Confirm all scripts, sounds and screenshots may be shared publicly.
- [ ] Freeze and tag the final submission commit.

**Offline release QA must not trigger paid provider requests.** Authorized Meta/Modal live evaluations are separate and must be explicitly invoked. Existing project policy does not impose local Meta/Modal spending caps.
