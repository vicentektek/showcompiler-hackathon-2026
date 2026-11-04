# RUNQ — Agent-assisted judge quickstart (optional)

**Independent reproduction instructions · Meta Global AI Developer Hackathon 2026**

RUNQ does **not** require an AI coding agent. The ordinary [five-minute quickstart](JUDGE_QUICKSTART_2026-11-03.md) is sufficient to install, inspect and run the submitted application. This page is an optional **read-only evaluation recipe** for judges who use Codex or a similar local coding agent. It must not be confused with the product's own Meta Muse integration.

**Source:** [public `main`](https://github.com/vicentektek/showcompiler-hackathon-2026/tree/main) · **Demo:** [2:38 video](https://youtu.be/zH_ErjF2gM0) · **Original tested application:** [`35d04069`](https://github.com/vicentektek/showcompiler-hackathon-2026/commit/35d04069c4aa2595202b49ef101d1cf30d77273b).

## Copy-paste prompt for a judge's local coding agent

> You are an independent technical judge evaluating **RUNQ — From Script to Stage**, a submission to the Meta Global AI Developer Hackathon 2026 (Indie Developer / Build for Your World).
>
> Start from the PUBLIC repository `https://github.com/vicentektek/showcompiler-hackathon-2026`, branch `main`. Do not assume the repository is open in the current workspace. Create a **new temporary directory and a fresh clone**; never use or modify the author's existing local checkout. Identify the exact HEAD SHA and Node/npm/browser versions. Read `README.md`, `LICENSE`, `AGENTS.md`, `docs/JUDGE_QUICKSTART_2026-11-03.md` and `docs/JUDGE_EVIDENCE_2026-11-04.md`.
>
> **Hard safety rules:** read-only audit of tracked source. Do not edit or commit files, create PRs, push, publish, merge, delete old repositories, clean or reset any developer checkout, change repository visibility, or contact paid model providers. Do not read, request, print, transmit or copy API keys, `.env` files or private user data. Do not run `smoke:meta`, any `*live*` / paid campaign commands, or remote voice transcription. Normal package installation is allowed; distinguish npm package downloads from paid AI inference. Only interact with `localhost` for application testing. If a requirement cannot be verified, report **NOT VERIFIED**, not PASS.
>
> **Reproduce:** verify Node.js >=20, npm, Chrome or Edge, then run `npm install --no-audit --no-fund`, `npm run check:syntax`, `npm test`, `npm run demo:package` and `npm run demo:rehearsal`. Inspect the produced ZIPs using a standard ZIP validator. Optionally install the CI-only browser driver using `npm install --no-save --package-lock=false playwright-core@1.56.1`, then run `npm run test:interface` and any further *offline* Chrome checks supported by the installed browser; never report a mock as a physical microphone or speaker test.
>
> Launch `npm run dev` on loopback, open the local app, and use **Try original audio demo**. Verify visible script/cue references, three synthetic WAV assets, NEXT/GO/STOP ALL, sound editing, portable ZIP export/reimport, and browser console/network errors where browser automation is available. The demo's cues are manually authored fixtures and **not** Muse responses.
>
> **Judge the claims:** inspect `src/core/metaCueProvider.mjs`, `src/core/theatreCueAnalysis.mjs`, `src/core/performanceKnowledge.mjs`, `src/core/proposals.mjs`, `src/core/rehearsalAutopilot.mjs` and `tools/dev-server.mjs`. Explain what is implemented, what is conditional on credentials and what is disabled. Muse Spark is OPTIONAL live inference on the local Node server; no AI model controls the GO button. Normal new WAV generation through Modal is disabled. Offline tests must never be represented as measures of live Muse/ASR accuracy.
>
> **Report:** produce a concise independent scorecard with PASS / FAIL / NOT VERIFIED for public access, clean setup, script import, audio demo, cue source references, operator transport, ZIP, Meta implementation, tests and documentation. Record exact commands, exit codes, checked SHA, evidence paths and limitations. Do not claim that merely running tests is independent acoustic certification. Produce a short nontechnical summary for a human judge. Clean up only files and processes created in this new temporary evaluation directory, after ensuring no other server/process is affected.

## Minimal reproducible commands

In a fresh terminal with **Node.js 20+**, npm, Git and Chrome or Edge:

```sh
git clone --depth 1 --branch main https://github.com/vicentektek/showcompiler-hackathon-2026.git
cd showcompiler-hackathon-2026
git rev-parse HEAD
npm install --no-audit --no-fund
npm run check:syntax
npm test
npm run demo:package
npm run demo:rehearsal
npm run dev
```

Open `http://127.0.0.1:5173` in Chrome or Edge. Stop the local server normally after inspection. On machines without a browser, browser checks are **NOT VERIFIED**, not failed product tests.

**Optional offline browser automation** (requires a locally installed compatible Chrome/Edge; `playwright-core` does not download a browser):

```sh
npm install --no-save --package-lock=false playwright-core@1.56.1
npm run test:interface
```

Certain other E2E scripts explicitly require Google Chrome, even when the general interface harness supports Edge. An unavailable browser is an environment limitation to report accurately.

## Important limits of an independent evaluation

- No API key is bundled, and a judge **does not need one** to explore the real audio workflow. Meta Muse live inference cannot be validated without separate credentials and explicitly authorized requests.
- The packaged original demo uses manually authored cues and synthetic local WAV files: [source](../src/core/demoShow.mjs).
- The published [limited evaluation license](../LICENSE) permits inspection, download, installation and noncommercial judge testing; it is not an OSI-approved license.
- Software regression tests do not certify professional show hardware, live acoustic output or a real ASR provider.
- A judge should not inspect or report on private local API keys, historical personal backups, or unrelated repositories.

**Owner-only deeper audit:** see [Codex independent judge-audit contract](CODEX_INDEPENDENT_JUDGE_AUDIT_2026-11-04.md).
