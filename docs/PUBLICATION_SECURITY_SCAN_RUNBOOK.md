# RUNQ — Full-history public-release security audit runbook

**Do not run this against the working checkout with uncommitted changes.** Use a fresh read-only clone of the intended release branch. Do not upload raw scan reports containing secrets to GitHub.

## 1. Inventory

```powershell
git status --short --branch
git rev-parse HEAD
git ls-files > tracked-files.txt
git log --all --oneline > commit-inventory.txt
git branch -a
git tag -l
```

Inspect tracked files for .env files, keys, tokens, personal information, paid provider traces, customer scripts, WAV/ZIP archives, large binaries and generated QA reports. Include **all reachable branches and tags** in a historical audit, not just the proposed release branch.

## 2. Secret scanning

Use a reputable local secret scanner (for example Gitleaks or TruffleHog) against **Git history** and a second scan of the worktree. Record tool version, scope, timestamp and findings count; keep detected values redacted. If an actual credential is found, revoke/rotate it before considering history cleanup.

## 3. Dependency and rights audit

- Review package-lock, package metadata, vendored assets, libarchive.js and Python/Modal dependencies.
- Inspect demo scripts, recordings, sound effects, images and fonts for redistribution rights and identifying metadata.
- Distinguish original assets, model-generated assets, externally licensed content and unknown provenance.

## 4. Publication architecture

Compare:
- Publishing the existing development repository (all accessible Git history becomes public).
- Creating a separate public submission repository from a vetted snapshot with a clean history (safer when historic experiments or secrets exist).

Keep the verified tag and backup intact. Never rewrite or delete history without owner approval.

## 5. Release gate

No public visibility change until all are true:

- [ ] Binding hackathon licensing rules reviewed
- [ ] Copyright ownership and source-distribution notice approved
- [ ] Full Git-history secret scan completed and findings resolved
- [ ] Assets/dependencies and private data cleared
- [ ] Clean checkout install and offline QA pass
- [ ] README and demo represent the actual verified product
- [ ] Explicit owner authorization to publish
