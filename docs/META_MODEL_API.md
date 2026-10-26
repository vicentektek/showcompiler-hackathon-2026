# Meta AI integration — new hackathon work (26 October 2026)

**Status:** implemented behind an isolated draft PR. Tested with mocked HTTP responses and no secrets, but **not yet confirmed against a live account or quota**. Audio GO remains entirely manual.

## Provider

The official [Meta Model API](https://dev.meta.ai/docs/overview) supports `POST https://api.meta.ai/v1/chat/completions`, a model such as `muse-spark-1.3`, Bearer authentication and [JSON Schema structured outputs](https://dev.meta.ai/docs/structured-output).

The local Node server reads `MODEL_API_KEY` from its environment. No API key may be written to the code, browser, README, JSON project or issue/PR. No model key is ever returned in a health status or error response.

## Run on Windows

In PowerShell, inside `showcompiler-hackathon-2026`:

```powershell
git fetch origin
git switch --track origin/feat/meta-model-cue-proposals
$env:MODEL_API_KEY = Read-Host "Introduce tu clave de Meta Model API"
npm test
npm run dev
```

If the branch already exists, switch without `--track` and run `git pull --ff-only`.

Open **http://127.0.0.1:5173**. Import a nonconfidential TXT example, then register or load at least one audio. Click **Generar propuestas con Meta AI** and read the disclosure carefully. A confirmation dialog is required for **every analysis**. The model returns up to 8 suggestions pointing only to known lines/audio IDs; results appear **PENDING**, never executed. You may approve/reject them and then explicitly click GO for playback.

Do **not** paste credentials into a GitHub issue, screen recording, chat or source file. To remove the key from the current PowerShell process after stopping the server, use:

```powershell
Remove-Item Env:MODEL_API_KEY
```

## Privacy and network boundary

Only after a user confirms sending data, the Node server sends to Meta:
- the **first 120 script lines**, each truncated at 250 characters;
- the **first 80 audio resource IDs and names**;
- strict model instructions, JSON schema and a request for up to 8 suggestions.

**No binary WAV/MP3, local file paths, JSON project snapshots, cue playback state or API secrets are sent to Meta.** The local UI does send its JSON project to its own loopback Node server, which validates it and reduces content to that excerpt before the external request.

The local server uses `127.0.0.1` and accepts the analysis POST only with `Content-Type: application/json` and a matching browser `Origin`/Host. Request bodies have a 2 MB cap; model calls are serialized per server. No external model API calls happen from the frontend; its CSP only allows same-origin HTTP requests.

Never send unpublished, licensed or confidential show scripts without authorization. The real provider may consume paid API quota. Do not automatically poll or call models on application startup.

## Validation contract

- All model outputs are strictly parsed; no fuzzy markdown or code executes.
- Meta text suggestions are revalidated against real project lines/audio metadata both server-side and browser-side.
- Invalid proposal batches are rejected wholly.
- Provenance `source: 'META_MODEL_API'` is saved in project JSON; manual mock items use `source: 'MANUAL_MOCK'`.
- Approval still produces only `DRAFT` and does not trigger GO.
- Live performance must work offline and without Meta Model API.

## Boundaries and remaining work

- **Not yet verified with live Meta API credentials**; a real account may need entitlement, billing, or model availability.
- The server returns up to eight proposals; no audio is generated and no new sound asset can be hallucinated.
- Only the first 120 lines are analysed per request. Scene selection / chunking / cost controls and retry UI are future work.
- `MAX_COMPLETION_TOKENS`, budget limits and robustness should be evaluated using real API responses before live demo.
- This is a hackathon prototype, not a production multi-user server or a deployable Internet API.
- Native Rust/WASAPI/ASIO execution is tracked independently in the [audio ADR](ADR-0001_MOTOR_AUDIO_NATIVO_2026-10-26.md).

Reference implementation: `src/core/metaCueProvider.mjs`, `tools/metaRoutes.mjs`, `src/core/workspace.mjs`, `src/ui/app.mjs`.
