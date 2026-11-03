# Verified working version — 2 November 2026

The working version for this release is tagged `verified-working-2026-11-02` on branch `feat/runq-ai-campaign-100-2026-10-31`.

The tag identifies the exact source used for the final offline verification. To check out and test that same version:

```powershell
git fetch origin --tags
git checkout verified-working-2026-11-02
git rev-parse HEAD
npm test
npm run check:syntax
```

Compare the `^{} ` line (the peeled commit) with the commit printed by `git rev-parse HEAD`:

```powershell
git ls-remote origin "refs/tags/verified-working-2026-11-02*"
```

The test suite is offline and makes no Meta, Modal, Baseten or Fireworks requests. It verifies that Meta and Modal do not stop at the former local budget ceilings, that duplicate submissions remain blocked, and that Baseten and Fireworks remain prohibited. Passing these checks does not verify provider account balance, service availability, audible hardware output or live model quality.

The published branch remains a feature branch; this tag does not merge or release it to `main`.
