# RUNQ — Submission-day handoff (4 November 2026)

**Status: NOT SUBMITTED / NOT PUBLICLY CLEARED.** This is a live handoff for final actions, not a submission confirmation. Do not expose credentials, private media, or the development history without an explicit release decision.

## Official constraints and evidence

- **Track/theme:** Indie developer / Build for Your World.
- **Public deadline:** 4 November 2026 at 9:00 PM US Eastern (EST), **5 November 2026 03:00 CET** in mainland Spain. Organizer: https://dev.meta.ai/events/global-hackathon . Confirm in the authenticated portal before relying on any grace period.
- **Organizer reminder received 3 November:** spend time on a **3-minute demo video**, make sure GitHub is **open source (mandatory)**, and submit early because the form contains many questions. These requirements are from the participant event notification; do not confuse them with requirements of another hackathon.
- **Event portal:** https://cerebralvalley.ai/e/meta-ai-developer-hackathon . Submission UI, final form fields and acceptance of Official Rules require an authenticated participant session and have **not** been verified by this repository audit.

## Verified technical state

| Item | State |
| --- | --- |
| Default branch | `main` at merge commit `6fbf45357b6d9651e4d04d7db82f67a067b562c1` at handoff |
| Integrating PR | [#138](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/138), merged |
| Final functional freeze | `b4e7df724d569c1d5af7682540c206ff3fb97701` |
| Unmodified submission source | `release/runq-indie-submission-2026` at `991363d9b9b23a1c120949dadece516c0639e663` |
| Narrow post-freeze fix | Windows cross-drive verified snapshot check in `tools/runq-agent-live-eval.mjs` |
| Offline QA | 832/832 locally reported on PR head; PR Core tests and Windows PowerShell preflight succeeded |
| New post-merge CI | Not established by prior PR results; existing Core tests push trigger does not include `main` |
| Visibility | Private — **not compliant with organizer's open-source GitHub reminder yet** |

## Critical path: what the owner must complete

1. **Safe open-source source:** before changing visibility, privately confirm that suspected real API credentials were rotated/revoked, the historical Gitleaks finding has been classified, and no secrets appear in previous commits, artifacts, PRs or screenshots. Review the [security audit](RELEASE_SECURITY_AUDIT_2026-11-03.md).
2. **Rights and license:** inspect bundled demo audio, screenshots, logo and `docs/design-references/RUNQ_referencias_visuales_A-H.zip`. Confirm the licenses/notices of Node dependencies and decide which source license to apply. Do not silently assume all historical media can be redistributed. See [media audit](THIRD_PARTY_AND_MEDIA_REVIEW_2026-11-03.md).
3. **Publication route:** an appropriately licensed, **sanitized public source snapshot** (new public repository if necessary) avoids exposing the entire historic private Git DAG. It must contain the runnable application, required dependencies manifests, README and approved demo assets, and reflect the verified functional source. Alternatively publish this repository only after complete history/media clearance and explicit owner approval. A private judge invitation alone is insufficient for the organizer's stated open-source requirement.
4. **Video:** export and verify the final approximately **3-minute** capture. Check that small UI text is sharp, visuals correspond to the submitted source, no API keys appear, audio is legible, and any mocked/offline interaction is clearly labeled. Upload video to the actual service accepted by the submission portal and verify access from a logged-out window. Record real video URL below.
5. **Submission:** complete all fields in the **authenticated** Cerebral Valley portal using [English project copy](SUBMISSION_COPY_2026-11-03.md). Use the actual public repo link, not a private or local-only URL. Check track and theme; save the confirmation/receipt privately.

## Links to fill from actual release

- **Open-source GitHub URL:** NOT VERIFIED / NOT PUBLISHED.
- **Final video URL:** NOT PROVIDED / NOT VERIFIED.
- **Hosted interactive demo:** NOT CLAIMED; RUNQ is started locally with Node and a modern browser.
- **Official entry receipt:** NOT PROVIDED.

## Quality and integrity rules

- No additional runtime features, dependency changes or post-freeze refactors as part of submission packaging.
- No blanket merge of old PRs. Preserve historic branches, and do not represent disabled Modal SFX or proof-of-concept hardware integration as currently working.
- Meta Muse inference is optional and requires explicit operator action and credentials; approved cues are run by local deterministic GO/STOP. Explain how the genuine model output is distinguished from synthetic/offline examples.
- The default `main` README was updated in a separate **documentation-only PR**; the runtime has not changed through that documentation.
- Any new screenshots must have owner permission, be checked against the frozen UI, and not reveal secrets. Existing `assets/runq-logo-full.png` is the canonical approved logo.

**This document never constitutes approval to publish the current repository.**
