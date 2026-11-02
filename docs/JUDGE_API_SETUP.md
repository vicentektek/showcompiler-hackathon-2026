# RUNQ — Judge API setup (optional)

**For Meta Global AI Developer Hackathon 2026 reviewers.**
This guide describes the *local Node/browser RUNQ application*, not a hosted public service. **No API key is required to review the offline demo.** Live model calls are optional, may incur charges on **your own account**, and should be initiated only after you choose a specific action.

**Build note:** These instructions were checked against the RUNQ documentation-preparation branch and the code at `verified-working-2026-11-02`. They do not imply the final submitted commit, real provider accounts, or a fresh deployment have been tested. Use the version/tag expressly designated in the published submission README.

## 0. Run RUNQ without any API credentials (recommended first)

Prerequisites: Node.js **20+**, Chrome or Edge, audio output; allow microphone access only for voice rehearsal.

```sh
git clone https://github.com/vicentektek/showcompiler-hackathon-2026.git
cd showcompiler-hackathon-2026
npm install --no-audit --no-fund
npm run demo:package
npm run demo:rehearsal
npm run dev
```

Open the **local URL printed by the server** (normally `http://127.0.0.1:5173`). Import the generated complete-show ZIP via **Project** to test cues and sound playback. The rehearsal ZIP provides a second offline example. Use GO / STOP / STOP ALL, inspect linked script lines, and try voice following with microphone permission. This offline path **does not invoke Meta or Modal**.

If a port is busy, start from the same terminal with `PORT=5174` (macOS/Linux) or `$env:PORT="5174"` (PowerShell) followed by `npm run dev`.

## 1. Meta Muse Spark — optional live script analysis (easy)

### Get an API key

1. Sign in to [Meta Model API](https://dev.meta.ai/docs/quickstart).
2. In your Model API dashboard, create a key with access to Muse Spark. Ensure your account has the permissions / billing needed for requests.
3. **Do not paste the key into the RunQ project, GitHub, browser console, an issue, or a screenshot.**

### Start RUNQ with your key

In **Windows PowerShell**, from the RUNQ repository directory:

```powershell
$env:MODEL_API_KEY = "PASTE_YOUR_OWN_META_API_KEY_HERE"
npm run dev
```

In **macOS/Linux**:

```sh
export MODEL_API_KEY="PASTE_YOUR_OWN_META_API_KEY_HERE"
npm run dev
```

Use the same terminal for both commands. The variable applies to that process/session. **The current RUNQ local server does not load `MODEL_API_KEY` from `.env`** (the `.env` loader only allowlists Modal SFX settings), so use the environment variable above. The code defaults to `muse-spark-1.3`; a different supported model can be selected with the server-side `META_MODEL_ID` variable if necessary.

### Check local configuration without using credits

Open `http://127.0.0.1:5173/api/meta/status` (substitute your actual port). The JSON should include:

```json
{"configured":true,"model":"muse-spark-1.3","provider":"META_MODEL_API"}
```

Additional fields are normal. This endpoint checks **local configuration only**; it **does not validate the key against Meta and does not spend credits**. A real provider error may still occur if the key is invalid, unauthorized, or out of credits.

### Exercise live Meta AI (billable)

1. Return to RUNQ in the browser. Open a project containing a sample script.
2. Go to **RUNQ AI** and select **Suggest cues to review** (or the current equivalent in the submitted UI).
3. Deliberately start a single analysis request. Review the returned cue proposals and linked source lines.
4. Approve/reject proposals yourself, then try local audio playback. **AI suggestions never directly execute GO.**

Do not use unattended/batch QA commands for this quick review. If `configured` is false, restart the Node server from the terminal containing the key, then reload the browser. HTTP 401/403 generally points to incorrect credentials or account permission; HTTP 402 to billing/credit requirements; HTTP 429 to rate limiting. Never disclose your key in support diagnostics.

At the end of the session, stop the server and clear the terminal variable with `Remove-Item Env:MODEL_API_KEY` (PowerShell) or `unset MODEL_API_KEY` (macOS/Linux).

## 2. Modal — optional live sound generation (advanced)

**Important: Modal is not a plug-in API key in RUNQ.** The included integration hosts Stable Audio 3 Small SFX as a GPU-backed Modal function behind an **authenticated web endpoint**. Each evaluator wishing to use their own Modal account must set up/deploy their **own instance**. Deployment and generation can generate cloud charges; neither the offline demo nor the Meta test requires this.

This section is for technically experienced reviewers. If you only want to assess the resulting cue workflow, use the already generated sounds from the offline demo instead.

### Requirements

- An active [Modal account](https://modal.com/) with appropriate GPU/billing permissions.
- Python and the Modal CLI ([Modal setup](https://modal.com/docs/cli/latest/setup)); a matching Python SDK in the 1.x family is appropriate for the current app's API image.
- A Hugging Face account with access to [`stabilityai/stable-audio-3-small-sfx`](https://huggingface.co/stabilityai/stable-audio-3-small-sfx), acceptance of any applicable access/usage conditions, and a valid **HF_TOKEN**. The model is subject to the [Stability AI license](https://stability.ai/license).
- A **Modal Secret** named `huggingface-secret` that provides `HF_TOKEN` to your deployment. Create this in the **Modal dashboard** in the same environment you will deploy into. Do not place the HF token in this repository, a shell command or RUNQ's `.env`.

### Deploy your own backend

In a terminal, in the RUNQ repository:

```sh
python -m pip install "modal>=1.6,<2"
modal setup
modal deploy modal/runq_sfx_pilot.py
```

The deploy command publishes the `runq-sfx-pilot` Modal application in **your** workspace. Copy **your own HTTPS web-function root URL** ending in `.modal.run` from the deploy output/dashboard. **Do not copy the demo author's endpoint**; do not append `/jobs` to the root URL.

Create an independent **proxy token** for the endpoint (not the Modal CLI/API token):

```sh
modal workspace proxy-tokens create --name runq-judge-sfx
```

Modal displays a proxy **ID beginning `wk-`** and a **secret beginning `ws-`**; the secret is generally shown only when created. Store it privately. These are **not** the Modal API tokens (typically `ak-` / `as-`); see [Modal proxy tokens](https://modal.com/docs/cli/latest/workspace).

### Connect the deployed endpoint to RUNQ

Copy `.env.example` to an untracked **local** `.env` and configure *only* your deployment:

```dotenv
RUNQ_SFX_PILOT_ENABLED=1
MODAL_SFX_ENDPOINT=https://YOUR-OWN-WEB-ENDPOINT.modal.run
MODAL_PROXY_TOKEN_ID=wk-YOUR_OWN_PROXY_ID
MODAL_PROXY_TOKEN_SECRET=ws-YOUR_OWN_PROXY_SECRET
RUNQ_SFX_MODEL_REVISION=05ca3857881c94a2b84026b1111c537d78f5f9f0
```

The example `RUNQ_SFX_MODEL_REVISION` is the reference revision recorded in RUNQ's `.env.example`; **verify the actual deployed model weights revision** before representing it as provenance. The local configuration needs a valid 40- or 64-character revision hash. Do not include the `HF_TOKEN` here.

**Cost-policy compatibility:** Some older RUNQ examples also contain `RUNQ_SFX_ESTIMATED_MAX_COST_USD` and `RUNQ_SFX_DAILY_BUDGET_USD`. The `verified-working-2026-11-02` release notes say local Meta/Modal monetary caps were disabled, although these optional fields and historical diagnostic messages remain in some files. Their presence **does not cap your Modal bill**. Confirm actual costs and account-level controls in Modal itself.

Restart `npm run dev` after saving the local file. The server's SFX settings loader reads this allowlisted Modal configuration; it does not publish the secrets to the browser.

### Check readiness without generating audio

```sh
npm run sfx:doctor
```

Then open `http://127.0.0.1:5173/api/sfx/status` (or the running server port). Its `enabled` flag and `configurationChecks` describe **local wiring only**; they are not proof of account permissions, deployment health, access to Hugging Face weights or successful GPU inference. No model request is made by these checks.

To verify live generation, open **Sound → Generate** in RunQ, deliberately request one short SFX, monitor the job, review/import the produced WAV and assign it to a cue. **This is a billable GPU action.** Never start it as an automatic smoke test. A request that times out may already have started a paid job; inspect status before retrying.

### Modal troubleshooting

- `MODAL_SFX_ENDPOINT`: must be the deployed **root** HTTPS `.modal.run` URL, without query string/path.
- Proxy token: `wk-` ID and `ws-` secret from the **same** workspace/environment as the endpoint; an account API token will not work.
- Missing `huggingface-secret` / HF access: fix the **Modal workspace secret** and model access, not the local RUNQ key.
- Invalid revision or disabled pilot: correct `.env` and restart the Node server.
- Deployment exists but generation fails: inspect Modal logs and GPU availability, access rights and costs; RUNQ's local status cannot certify a deployed model.
- Never expose the service unauthenticated or share proxy keys in public issues/PRs.

## Security and reproducibility

- **Do not commit** `.env`, API keys, Modal proxy keys, HF tokens, provider responses containing private content, or generated private scripts. Keep the Node server bound to `127.0.0.1`.
- **No shared evaluator account or public proxy** is supplied by this guide; all live requests use the judge's own provider access.
- The offline ZIP is the baseline for evaluation. **Live Meta/Modal behavior should be described as tested only after an authorized real request succeeds.**
- RUNQ's user-approved AI suggestions and deterministic local transport are different layers; GO/STOP never require a network request.

### Official documentation

- [Meta Model API quickstart](https://dev.meta.ai/docs/quickstart)
- [Modal CLI setup](https://modal.com/docs/cli/latest/setup)
- [Modal token types and proxy tokens](https://modal.com/docs/cli/latest/workspace)
- [Modal Secrets](https://modal.com/docs/cli/latest/secret)
- [Stable Audio 3 Small SFX model card](https://huggingface.co/stabilityai/stable-audio-3-small-sfx)
