# Security and responsible disclosure

RUNQ is a hackathon prototype, not a certified show-control, security or safety platform.

## Sensitive data and access

- Do **not** open public issues, PRs or discussions containing access tokens, API keys, private scripts, billing details, customer audio, account information, security reports or raw provider responses.
- Keep provider keys in the operator's local environment. The reference `.env.example` must contain **blank values only**; `.env` and related files are ignored.
- The browser GO/STOP path is local and independent of model inference. Model calls require operator action and available credentials.
- The current submission source is private until its owner approves explicit access. GitHub visibility must never be changed by an automated documentation or cleanup task.
- All secrets exposed in any past commit, issue, PR, log or capture must be **revoked/rotated at the provider**, even after the file is deleted; Git history rewriting is not a substitute for revocation.
- For a security concern, contact the repository owner privately or use GitHub's private vulnerability-reporting/security advisory channel **if enabled**. Never paste a secret into a public report.

## Before sharing source code

Run an actual secret scan across **the full reachable Git history**, not just the current checkout. The commands and screening limitations are in [Release security audit](docs/RELEASE_SECURITY_AUDIT_2026-11-03.md).

Review distribution rights for audio samples, images, logos, model outputs, reference ZIPs, dependencies and any third-party media. The absence of a `LICENSE` in this repository does **not** grant redistribution rights and does not automatically make it open-source.

## Known technical boundaries

- The demonstration uses a local development server and browser Web Audio; do not expose its server port as a public production service without an independent security review.
- No professional live-show, safety-critical or hardware isolation certification is claimed.
- Legacy SFX pilot code exists in source history; new paid Modal generation is disabled for the normal frozen demo.
- Report suspected vulnerabilities privately and do not publish proof-of-concept exploitation while the source remains private.
