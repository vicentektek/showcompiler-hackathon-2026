# Script core — isolated new implementation

Branch: `feat/hackathon-script-core`

This is a small, dependency-free first increment written during the hackathon. It is **not** a complete application.

Implemented:
- UTF-8 string parsing with BOM, CRLF, CR and LF normalization.
- Stable source references `L1`, `L2`, etc., including blank lines.
- Lookup by source reference.
- Accent- and case-insensitive search, preserving original text.

Run tests locally with Node.js 20+:

```sh
node --test test/script.test.mjs
```

Scope limits:
- No file upload UI, AI model, cue proposal generation, audio or deployment.
- No previous repository source files imported.
- Tests are committed, but execution in the user's environment and CI remains to be verified.
- No merge to `main` until tests are executed and reviewed.
