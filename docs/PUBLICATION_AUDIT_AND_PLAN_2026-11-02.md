# RUNQ — Public repository readiness audit and execution plan

Date: 2026-11-02  
Audited reference: `verified-working-2026-11-02` / `6d1d65d`  
Documentation branch: `docs/hackathon-submission-2026-11-02`

## Scope and evidence

This is a **remote, preliminary, non-destructive audit** of selected files and GitHub metadata, not a complete clone-based repository scan or a verified public-release sign-off. Read: README, AGENTS.md, package.json, .gitignore, .env.example, CI workflow, verified-version and unlimited-budget notes. Queried open PRs and compared `main` against the verified tag.

The owner reports 817 passing offline tests and working real AI integrations. No tests, paid calls, binary scans or secret-history scans were executed in this audit.

## Findings

| Priority | Finding | Evidence | Resolution |
| --- | --- | --- | --- |
| P0 | Default `main` does not represent the verified product | `main...verified-working-2026-11-02` comparison: diverged, ahead 1205, behind 1, 300 files returned | Plan a reviewed publication branch; decide default branch only after verification |
| P0 | No root LICENSE found in tagged version | Fetch returned not found | Owner chooses proprietary source-available vs OSI-approved open-source license; audit third-party rights before adding |
| P0 | Full secret/history exposure review not yet performed | Only `.gitignore` and `.env.example` inspected | Run tracked-file, history and binary scans; rotate any exposed keys, remove from history when necessary |
| P1 | README contains obsolete product, version and budget statements | References old RC1, historical spend gates and Baseten/Modal status | Replace with concise RUNQ-first English README based on verified features |
| P1 | Many open PRs, some draft/experimental | GitHub open PR query, including #133 and #129 | Triage by merged-equivalent, release-critical, post-submission, abandoned; do not bulk merge |
| P1 | No root SECURITY.md / CONTRIBUTING.md / CODE_OF_CONDUCT.md found | Fetch returned not found | Add appropriate governance docs once distribution model is chosen |
| P1 | CI trigger explicitly lists old feature branch plus PRs | `.github/workflows/core-tests.yml` | Validate release branch and PR checks, branch protections, and CI results |
| P1 | Documentation mixes superseded campaign policies | `AGENTS.md` includes owner override and historical contradictory sections | Archive historical policies and clearly label current rules |
| P1 | Public demo/fixtures and AI artifacts need rights review | Demo ZIP, source fixtures, image assets present | Verify originality, licenses, metadata and private data |
| P2 | Public brand and product story were not canonical | RUNQ positioning defined in project discussions and current UI | Use `docs/BRAND_AND_POSITIONING.md` and current visual assets |
| P2 | .env.example still documents historical cost flags | `.env.example` | Update to current supported variables without real values |

## Publication decision required

**Public repository** can mean public visibility with all rights reserved, or a genuinely open-source release. These are different legal choices. Do not invent or add a license without the owner's decision. GitHub visibility change is separate from license choice and must be explicitly approved.

## Execution plan

### Phase 0 — freeze and inventory (P0)

- Keep tag `verified-working-2026-11-02` unchanged.
- Establish release candidate branch from the verified commit, not from old `main`.
- Capture exact commit graph, tracked file list, file sizes, Git LFS, submodules, branches, PRs and GitHub Actions status.
- Confirm which current local improvements, if any, are absent from the tagged reference.

**Exit:** signed-off source SHA and explicit inclusion/exclusion inventory.

### Phase 1 — privacy, security and intellectual property (P0)

- Scan tracked files and full Git history for API keys, tokens, credentials, personal data, private scripts, model outputs and hidden files.
- Review images, audio, ZIPs, examples and model attribution for rights, provenance and embedded metadata.
- Audit `.gitignore`, `.env.example`, CI secrets and dependencies.
- If credentials are found, rotate/revoke first; deleting a current file is not sufficient to remove public Git history.
- Decide licensing and contribution policy.

**Exit:** documented security/IP clearance, with no unmitigated critical findings.

### Phase 2 — documentation and product story (P1)

- Replace root README with RUNQ brand, screenshot/wordmark, value proposition, product pillars, setup, verified feature matrix and demo.
- Emphasize professional workstation, specialized contextual RUNQ AI, few-click whole-show preparation, voice-following autonomous rehearsal, and assisted triggers for small companies.
- Separate rehearsal automation from supervised live operation; do not claim unattended reliability without proof.
- Add `docs/ARCHITECTURE.md`, `docs/USER_GUIDE.md`, `docs/DEMO.md`, `SECURITY.md`, `CONTRIBUTING.md` as appropriate.
- Archive or clearly label superseded technical notes without destroying useful provenance.

**Exit:** newcomer can understand, install and operate the demo from README alone.

### Phase 3 — release engineering and QA (P1)

- Validate clean clone on Windows and Linux.
- Run `npm run qa:codex`, `npm run test:product`, Windows packaging smoke and demo ZIP import/export.
- Verify ES/EN, script provenance, AI proposal review, audio generation, autopilot arming, GO/STOP ALL, persistence and cancellation.
- Verify CI on the exact candidate SHA; review GitHub Actions artifact privacy.
- Do not run paid provider calls without explicit operator action.

**Exit:** documented pass/fail matrix and known limitations.

### Phase 4 — GitHub presentation and submission (P1)

- Prepare screenshots from the approved current UI, three-minute video, model/provider attribution, demo script and judge-facing summary.
- Triage open PRs; close or defer only after owner review.
- Decide whether to update `main` and repository default branch, and how to preserve old history.
- Create a release tag and optional GitHub Release only after final approval.

**Exit:** publication checklist complete and owner authorizes visibility change.

## Non-goals

No automatic visibility change, license selection, history rewrite, deletion, PR merge, paid calls, or modification of `main`.

## Immediate next actions

1. Perform exhaustive repository and Git history scanning in a clean isolated checkout.
2. Decide licensing/public distribution model.
3. Rewrite README and update example configuration in the documentation branch.
4. Prepare release candidate from verified source, then validate and publish only on explicit approval.
