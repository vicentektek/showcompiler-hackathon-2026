# Muse Spark Open on Baseten — hackathon fallback (26 October 2026)

Status: optional implementation in a draft pull request. On 29 October 2026 one explicitly authorized live request reached Baseten and returned HTTP 404 with no usage for the retired dated model alias. The canonical-alias correction is validated offline; a successful live inference is still pending. Automated tests use mocked provider responses.

## Why this pathway exists

The first-party $150 Meta Model API credits are still pending. The hackathon expressly accepts Meta open-weight models hosted by inference partners. Baseten is a launch partner for Muse Spark Open. The participant FAQ originally specified the hackathon model ID `meta-models/muse-spark-open-1026`; on 29 October 2026 Baseten returned HTTP 404 for that retired alias and its official Model API page identified the canonical replacement as **`meta-models/muse-spark-open`**.

This is still a **Meta model**, hosted and billed by a **different provider**. Baseten credits and Meta Model API credits are completely separate. Free Baseten starter credits may not equal the $100 hackathon partner grant. Check actual Billing balance/conditions.

Baseten's Chat Completions API is https://inference.baseten.co/v1/chat/completions. The Baseten documentation explicitly states **Muse Spark Open does not support structured outputs or JSON mode**. Therefore we request normal text containing JSON, parse it strictly, reject bad/partial/unsupported results in full, and verify line/audio references again on the Node server and in the browser. No silent model repair or unsafe parsing. This is a limitation until tested with real model output.

## Windows setup

Save your existing show as JSON before leaving the old demo. Stop the old Node server with Ctrl+C.

In a PowerShell terminal inside your hackathon repository:

    git status
    git fetch origin
    git switch --track origin/feat/baseten-muse-open-fallback
    npm test

If the branch already exists locally: git switch feat/baseten-muse-open-fallback ; git pull --ff-only. Never force-reset uncommitted work.

Get your own Baseten Personal API Key via https://app.baseten.co/settings/api_keys . Baseten only displays a new key once.

**Paste the key into a private PowerShell prompt, NOT GitHub, Discord or chat:**

    $k = Read-Host "Baseten API key (hidden)" -AsSecureString
    $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($k)
    try {
      $env:BASETEN_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)
      Remove-Variable k,p
    }
    npm run dev

The local application is http://127.0.0.1:5173 . Choose **Baseten · Meta Muse Spark Open** in the provider selector. You should see the provider as configured, without showing the key.

1. Open a short *original/non-confidential* Spanish script TXT, or click Example while the interface is set to Spanish.
2. Load an actual WAV/MP3 for the music/sound described in the script. Only the name/ID is exposed to inference; the file itself stays in browser memory.
3. In the AI panel choose the script-language hint Auto or Spanish.
4. Press Generate with Muse Spark Open and **read/confirm the external-data and credit disclosure**. No provider calls happen on page load, on changing language, or on checking configuration.
5. Inspect the proposed line L-number and exact audio reference. Reject incorrect suggestions; explicitly approve only suitable ones.
6. Click GO to play the local audio. Try STOP, FADE and STOP ALL, then save JSON.
7. Reload the saved JSON and verify each proposal identifies its origin as BASETEN/Meta Muse Open; reload WAV/MP3 manually (binary audio is not in the JSON).

To remove the key from that PowerShell process, stop Node with Ctrl+C and run:

    Remove-Item Env:BASETEN_API_KEY

## Safeguards

- Only the local Node server sends requests to Baseten. UI scripts cannot read API keys.
- Requests require a local same-origin JSON POST; only one Baseten request at once.
- Each request may send at most 120 script lines truncated at 250 chars and 80 audio names/IDs.
- Never send binary audio, other files, shell commands or the API key to the model.
- One model response is at most eight proposals, each in PENDING state, traceable as BASETEN_MUSE_SPARK_OPEN in the existing versioned show JSON.
- The model cannot issue GO. Audio playback is manual, deterministic and operates offline after approval.
- Errors for missing/wrong key, bad model ID, rate limits or malformed JSON are handled without leaking secrets or raw model output.
- A strict return JSON is **not guaranteed by Baseten** for this specific model: rejection of a malformed response is expected safe behavior, not proof that the model cannot understand the script.
- Do not assume free credits create a hard spending cap; monitor the account's real balance/usage. Stop testing if you do not want charges.

## Official references

- Hackathon FAQ: https://discord.com/channels/1557169028080869426/1557169028626251802
- Inference API: https://docs.baseten.co/reference/inference-api/chat-completions
- Current Muse Spark Open model identifier: https://www.baseten.co/library/muse-spark-open/
- JSON-mode support limitations: https://docs.baseten.co/inference/model-apis/overview
- Meta Muse Spark Open: https://dev.meta.ai/docs/muse-spark-open
- Baseten billing: https://app.baseten.co/settings/billing

## Acceptance still pending

CI tests and the observed 404 do not prove allocation of partner credits, successful inference with the canonical model, output quality, or audio playback on physical hardware. Never label the corrected adapter as a successful live inference until its bounded retest completes on the user's PC.

The official first-party Meta Model API adapter remains available by selecting Meta Model API in the same dropdown, once its separate credits/key/billing are configured.
