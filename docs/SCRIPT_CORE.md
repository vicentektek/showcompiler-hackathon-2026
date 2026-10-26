# Script core — independent hackathon implementation

Branch: `feat/hackathon-script-core` (isolated from main).

The pure script utilities support text parsing, stable line references and accent-insensitive search. The separate proposal module validates untrusted suggestions against actual script lines and available asset IDs. The separate review module requires explicit operator confirmation before creating a **DRAFT** cue.

Run all 22 tests with Node.js 20+:

```sh
npm test
```

The tests passed in a copied isolated Node.js 22.16.0 environment. Running a full build is not yet possible because this branch has no UI or bundler.

See `docs/REVIEW_CORE.md` for trust-boundary details.

### Not implemented
- Script file upload UI, generative model calls, audio, cue editor, persistence, desktop application and deployment.
- Human identity verification or durable approval history.
- STOP and FADE validation or professional show-control readiness.

Do not merge into main before checkout-based tests, review and integration.
