# RunQ — local 18-request Level 1 campaign

This feature is **OFFLINE by default**. It never runs in CI, app startup, or unit tests.
The 6 development scripts contain 9 windows. Each window is submitted once to Meta and once to Baseten (18 total calls). Qualification scripts remain locked and are not read into any model request.

## Preconditions

- Node >=20, local MODEL_API_KEY and BASETEN_API_KEY; never paste secrets into chat or Git.
- Verify provider credits, Baseten pricing and the account-level billing limits in provider dashboards.
- **$5 is an operator budget target, NOT a guaranteed provider spending cap.** Meta reserves a conservative per-request estimate and uses the existing persistent $2 Meta ledger; Baseten has no verified dollar estimate and only enforces its nine-request maximum. Do not run if a hard combined $5 cap is required.
- Prior gala-rundown results are independent seminar experiments and do not count toward the 18 Level 1 requests.
- Gold annotations are PROVISIONAL_UNREVIEWED; report scores as exploratory, never certification.

## First: zero-cost preflight

```powershell
cd "C:\Proyectos\Hackaton 2026\runq-dual-provider-test"
npm run qa:dual-provider:campaign
```

The campaign lives in the feature branch; fetch and create a new worktree for that branch if the command is not yet installed.

## Explicitly paid local execution

Only after confirming the 18-request plan, provider dashboards, credentials and accepting the $5 **target** (not a billing guarantee):

```powershell
npm run qa:dual-provider:campaign -- --live --ack-paid --budget-usd 5 --max-requests 18
```

The runner executes sequentially, one provider call at a time. It writes a local private journal BEFORE each attempt. A failed, interrupted or timed-out request is never retried automatically. A persistent `campaign.lock` prevents a second invocation or accidental restart; do not delete it merely to rerun. A new authorized campaign needs deliberate inspection of the journal and a new isolated run directory/implementation.

Outputs: `artifacts/dual-provider-campaign/journal.json` and `summary.{json,md}`. No raw prompts, source text, API keys, or full model completions are persisted. Predictions contain line IDs and event types; inspect before sharing. A machine interruption may leave an attempt with unknown provider billing; check dashboards.

Do not run this in CI or give unattended agents credentials. Do not alter prompts mid-campaign, execute GO/STOP, or automatically tune on qualification gold.
