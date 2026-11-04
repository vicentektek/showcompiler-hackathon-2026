# RUNQ — Security and repository audit (3 November 2026)

> **Historical audit record, not a current repository status declaration.** The repository became public on 4 November. Its previous private status below is obsolete. An additional operator audit using Gitleaks 8.30.1 reported no findings in `origin/main`, a historical synthetic fixture and two non-empty Modal credentials in an ignored local `.env`; **provider-side rotation remains unverified**. The owner must keep private reports private. This new note does not certify release safety or historical media rights.

**Status: NOT CLEARED FOR SHARING.** The source remains private. This is an audit record and a reproducible verification procedure, not a claim that no secret ever reached Git.

## Operator-reported Gitleaks review (3 November 2026)

The local operator reports a completed Gitleaks 8.30.1 scan covering 2,283 accessible commits, plus the current working directory and nine extracted ZIP archives. The operator reports two probable sensitive values in a locally ignored configuration file and one historical test-fixture candidate. The historical candidate appears in a test of log redaction and is **likely synthetic**, but its exact scan match still requires private confirmation. No detected values or raw scanner records are published in this document.

**Status: NOT CLEARED FOR SHARING.** Provider-side revocation/rotation of affected credentials and a fresh local scan remain required. The archive scan found no flagged values but does not establish media licensing. The local backup includes ignored files and must remain private. GitHub security alerts and archived CI logs have not been conclusively audited.

## Scope / immutable source

- Frozen functional SHA: `b4e7df724d569c1d5af7682540c206ff3fb97701`.
- Documentation PR #137 is based on that SHA; all changes for this audit are non-runtime.
- Repo comparison `main...frozen` shows **1,347 ahead, 1 behind**, with the compare endpoint listing only **300 files**. This is not an exhaustive file inventory. Do not claim main is the submission and do not bulk-merge historical PRs.
- `.gitignore` ignores `.env`, `.env.*`, `.runq-local/` and multiple private evaluation directories; this is useful hygiene but **cannot remove data that was previously committed**.

## Read-only connector checks actually performed

**Current frozen Git tree, not its full history:**

1. Checked the following usual sensitive paths and found none present at those exact paths: `.env`, `.env.local`, `.env.production`, `.npmrc`, `.modal.toml`, `modal/.env`, `modal/.secrets.toml`, `config.json`, `credentials.json`, `secrets.json`, `.vscode/settings.json`, `.runq-local/global-spend-ledger.json`, `artifacts/agent-live-eval/summary.json`.
2. `.env.example` was present with blank API/provider variable values. It names historical Modal credentials, but does not include values.
3. Pattern-checked **eight selected text code files** for recognizable literal key formats: `tools/dev-server.mjs`, `tools/sfxRoutes.mjs`, `tools/metaRoutes.mjs`, `tools/voiceLiveRoutes.mjs`, `src/core/metaCueProvider.mjs`, `src/core/modalSfxPilotClient.mjs`, `modal/runq_sfx_pilot.py`, `RUNQ_AI_BATTERY.ps1`. No matches found in those files under these patterns. References to variable **names** are expected and are not credentials.
4. Found no `LICENSE` and no existing root `SECURITY.md` in frozen source. A security disclosure file is added by the documentation branch; selection of a distribution license is **not** performed automatically.
5. No provider keys were used, pasted, printed or called during this audit.

**Limitations:** This is not a comprehensive scan of all tracked files, embedded media, git blobs, old commits, stashes, unreachable objects, forks, GitHub Actions logs, PR comments, historical artifacts or other local checkouts. The connector cannot certify those areas. Prior exposed credentials must be treated as potentially compromised until provider-side rotation is verified. A clean scan does not prove a token never existed.

## Mandatory offline scan on the local machine (Windows PowerShell)

These commands run locally and need no Meta/Modal credits. Install **Gitleaks** from its official repository first: https://github.com/gitleaks/gitleaks. Check `gitleaks version` and `gitleaks git --help`.

Run from the **root of a full local clone**, not a shallow ZIP archive:

```powershell
git fetch --all --tags --prune
git status --short
git rev-parse HEAD
gitleaks version
New-Item -ItemType Directory -Force -Path artifacts/release-security | Out-Null
gitleaks git --redact --report-format json --report-path artifacts/release-security/git-history.json .
gitleaks dir --redact --report-format json --report-path artifacts/release-security/working-tree.json .
```

Notes:

- Gitleaks may exit nonzero when it detects findings. **Do not suppress or interpret that as a passing scan.**
- Git scan includes the locally reachable branches/tags. Ensure all relevant remotes and legacy branches are fetched. Shallow clones, untracked files, external files, Actions logs, and deleted unreachable objects may be outside that history.
- The output JSON may contain source locations and security-sensitive details despite redaction: reports must remain private and ignored by Git. **Do not paste raw reports into chat, PRs, CI artifacts or the video.**
- Scan `docs/design-references/*.zip`, demo ZIPs and other archives using the tool's documented optional archive-depth settings before making a public snapshot. Inspect licenses and rights independently.
- Review GitHub repository security settings and secret-scanning alerts if available, plus previous PRs/Actions logs, before any public publication.
- If a secret is found: record its **type and file path only** in a private checklist, revoke/rotate it in its original service, inspect actual access/scope, remove it from current source if still present, and plan history-remediation separately **after** backup and owner approval. No force-push during hackathon submission.
- Do not add ignore rules to silence real leaks. False positives require manual inspection.

## Release permission gates

- [ ] Full tracked-file + history scan executed and the results reviewed.
- [ ] All suspected real credentials revoked/rotated and their old scopes checked.
- [ ] Public asset/media licensing confirmed, including zipped references.
- [ ] Access policy chosen: private judge invitations, separately sanitized public snapshot, or explicitly authorized visibility change.
- [ ] Exact build SHA, README, source link and video are mutually consistent.
- [ ] Release ZIP inspected to ensure it contains **no** `.env`, ledgers, debug traces or unlicensed customer media.
- [ ] Owner explicitly approves publicity/merge.

**Until all applicable gates are satisfied, the code repository remains private.**

## Source-specific observations

The default server uses `generationDisabled: options.sfxPilotClient ? false : true`, which keeps new sound generation disabled in the normal app but permits a separately injected test client in controlled tests. This is a deliberate safety/compatibility exception, **not** an advertised generation capability. See [Feature status](FEATURE_STATUS_AND_FUTURE_AUDIO_2026-11-03.md).
