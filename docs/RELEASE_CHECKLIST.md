# RUNQ — submission readiness checklist

## Repository
- [ ] Verify final commit SHA, branch and tag.
- [ ] Confirm README matches the exact submitted version.
- [ ] Confirm LICENSE and attribution/third-party notices are appropriate.
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

**Do not run paid model requests automatically as part of QA.**
