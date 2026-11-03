# SHOWCOMPILER hackathon audit

Date: 26 October 2026
Scope: repository history, automated tests, public event guidance, and official provider documentation. This file intentionally contains no credentials, account identifiers, billing screenshots, balances, or private scripts.

## Submission constraints

- Claim only work created during the hackathon; do not copy the earlier SHOWCOMPILER codebase.
- Keep a dated, reviewable commit history in the new repository.
- A Meta model integration is required for the intended competition entry.
- The submitted repository must be accessible under the event rules at submission time.
- The demonstration must show new functionality honestly; simulated fixtures are not model output.
- Do not publish unlicensed media, private scripts, credentials, or account/billing information.
- Recheck the organizer's current participant guide and deadline before submission; this dated audit is not the authority for changed rules.

## Repository boundary

- `main` remains outside the stacked experimental feature work.
- Script/review, persistence/UI/audio, Meta, i18n, Baseten fallback, sound planning, theatrical evaluation, and reliability work were developed as isolated feature branches/draft PRs.
- The current integration branch is `feat/meta-muse-reliable-cues`, based on `feat/meta-theatrical-prompt-evals`.
- Do not merge automatically. Preserve any user-owned local changes and review the final diff.

## Automatically verified behavior

- stable script line IDs, source search, and original text roundtrips;
- strict project JSON validation and safe rejection of malformed/unknown fields;
- model suggestions never auto-approve or execute;
- explicit approval creates a `DRAFT` cue;
- asset-free `PLAN_AUDIO`, three resolution paths, and blocked unresolved GO;
- Web Audio GO/STOP/fade/panic state through simulated AudioContext tests;
- audio-backend facade truthfully excludes native/ASIO capabilities;
- loopback/same-origin provider routes and server-only credentials;
- strict Meta schema/response parsing, required sound brief, safe phased diagnostics, one-attempt timeout/transport behavior, and non-disclosure;
- deterministic scene/window coverage, transient V2 validation, theatrical distinctions, and deduplication;
- exact-line precision/recall/F1, forbidden triggers, duplicate, and hallucinated-reference evaluation;
- EN/ES catalog parity and independent script-language hint.

## Not demonstrated by automated tests

- a successful live Meta or Baseten inference request;
- account entitlement, credits, spending protection, or current provider pricing;
- audible output, codec behavior, device latency, or safe gain on the user's hardware;
- production-ready browser accessibility/responsive behavior;
- native WASAPI/ASIO cue execution, multichannel routing, or installer;
- paid audio generation or a portable show-media package.

## Current critical path

1. Run `npm test` and `npm run check:syntax` on a clean checkout.
2. Perform Chrome/Edge UI and low-volume local-audio acceptance with rights-clear media.
3. Review active Meta account terms, quota, and cost outside the repository.
4. With explicit authorization, run the one-request three-line smoke command once; do not retry automatically.
5. Evaluate a locked rights-clear corpus, including negative dialogue mentions, continuation, silence, multilingual text, and a 91-line script.
6. Verify approval, all three sound-resolution routes, JSON roundtrip, and network-offline playback.
7. Prepare a truthful short demo and draft PR evidence; keep unsupported/native/generation claims out.

## Risk register

- **Live Meta access:** adapter correctness does not prove entitlement or billing readiness. The guarded smoke is still unrun.
- **Model quality:** one successful response does not establish precision/recall. Use the reproducible corpus and human review.
- **Cost:** each explicit analysis may be billable; a timeout may still consume tokens. There are zero automatic retries.
- **Privacy:** Standard/Contributor and promotional-credit terms may differ. Never send confidential or third-party scripts without authorization.
- **Audio portability:** JSON contains metadata, not media. A reopened project requires local files to be loaded again.
- **Professional output:** browser audio and the separate WASAPI spike do not constitute certified native show control or ASIO support.
- **Historical schema:** current v1 reads `PLAY` and `PLAN_AUDIO`, but old PLAY-only builds may reject later v1 documents.

## Acceptance checklist

- [ ] Clean automated suite and syntax checks pass.
- [ ] Draft PR diff contains no `.gitignore` user change, secret, account data, raw provider response, or private script.
- [ ] Guarded live Meta smoke succeeds once and only safe metadata is recorded.
- [ ] Human-reviewed corpus metrics are attached without representing synthetic fixtures as model results.
- [ ] Every imported proposal is manually approved/rejected; unresolved cues cannot GO.
- [ ] Local audio transport works with the network disabled.
- [ ] EN/ES, JSON reopen, and coverage progression pass interactive checks.
- [ ] Known limitations and unverified claims appear in README and PR.

CI success is necessary but not proof of provider access, audible playback, latency, or production readiness.
