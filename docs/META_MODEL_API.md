# Meta Model API integration

Status: implemented and deterministically tested with mocked transports. The live smoke command has **not** been run; live credentials, entitlement, quota, billing, and inference remain unverified. Audio GO is manual and independent of this integration.

## Official contract

ShowCompiler uses the official Meta Model API Chat Completions surface:

- `POST https://api.meta.ai/v1/chat/completions`
- `Authorization: Bearer` using server-only `MODEL_API_KEY`
- Standard model `muse-spark-1.3`
- `developer` and `user` messages
- `response_format: { type: "json_schema", json_schema: { strict: true, … } }`
- `reasoning_effort: "low"`
- `max_completion_tokens: 4096`
- `stream: false` and explicit `store: false`

See Meta's [Chat Completions guide](https://dev.meta.ai/docs/protocols/chat-completions), [schema reference](https://dev.meta.ai/docs/api-reference/chat-completions/schemas), [structured output guide](https://dev.meta.ai/docs/structured-output), and [error handling](https://dev.meta.ai/docs/error-handling).

The Responses API uses a different `text.format` parameter. Do not substitute that shape into this Chat Completions request.

## Local setup

In PowerShell, from this repository:

```powershell
$env:MODEL_API_KEY = '<set locally; never commit>'
npm test
npm run check:syntax
npm run dev
```

Open `http://127.0.0.1:5173`, import a nonconfidential UTF-8 script (an audio library is optional), select Meta Model API, and review the disclosure. Each click authorizes exactly one external request and is followed by no automatic retry. Stop the server and remove the key from that shell when finished:

```powershell
Remove-Item Env:MODEL_API_KEY
```

Never paste the key into code, project JSON, a GitHub issue, PR, screenshot, recording, provider response fixture, or chat.

## Scene/window request boundary

The deterministic planner divides the unchanged script into scenes and 60-line core windows, with up to three read-only context lines before and after. One confirmed request contains at most two windows and asks for at most eight `CueSuggestionV2` records. A later batch requires another click and confirmation.

The external request contains:

- stable source line IDs and original-language text for the selected windows (individual transmitted line text is bounded and marked if truncated);
- scene/window identity and target-versus-context roles;
- at most 80 audio metadata IDs/names;
- expert theatrical instructions and a strict dynamic schema.

It does **not** contain WAV/MP3 bytes, decoded buffers, local file paths, the API key, transport state, or unrelated project data. The browser sends the validated project to its own loopback server; only the bounded analysis document leaves the machine.

Coverage shows exact submitted line/window counts and the next batch, but it is in-memory UI state. It is not added to project JSON.

## Output and validation

`CueSuggestionV2` records exact window/line evidence, cue kind, explicit/suggested basis, `PLAY`/`CONTINUE`/`STOP`/`SILENCE` intent, label, acoustic brief, asset choice, trigger, duration/loop/fade estimates, confidence, and reason.

Validation is all-or-nothing:

- strict keys, types, bounds, and enums;
- source line must belong to that window's core lines;
- evidence must be an exact substring of the original source line;
- asset must be known or `null`;
- `assetId: null` requires a nonempty bounded `soundPrompt`;
- transport/cue-kind combinations must be coherent;
- non-PLAY observations cannot pretend to bind an asset;
- server and browser revalidate before creating project proposals;
- deterministic deduplication removes repeated sound proposals.

Only deduplicated `PLAY` records become ordinary `PENDING` proposals with `source: "META_MODEL_API"`. Continuing ambience, stop, and silence remain transient observations. Every project proposal still needs human approval; approval creates `DRAFT`, never GO.

Rich V2 details, coverage, observations, and diagnostics are deliberately transient. The persistent show JSON format is unchanged.

## Safe diagnostics

Failures are separated into local validation, upstream HTTP, schema incompatibility, local timeout, transport, response envelope, model finish/refusal, output schema, and local semantic validation. The local response may include:

- a non-sensitive request ID;
- stable phase/code;
- upstream status;
- elapsed milliseconds;
- finish reason and token counts;
- sanitized provider `type`, `param`, and `code`.

The implementation discards provider `message`, raw bodies, raw generated text, scripts, keys, and stack traces. It performs one fetch attempt. A timeout is not proof that the provider did no work or incurred no charge.

## Guarded one-request smoke

The smoke tool is separate from tests and startup. It sends one tiny, rights-clear three-line script with no assets, performs zero retries, and expects a valid L2 `assetId: null` proposal.

```powershell
$env:MODEL_API_KEY = '<local secret>'
npm run smoke:meta -- --authorize-one-billable-meta-request
```

The explicit flag is mandatory. Output is restricted to safe model/request metadata and proposal count. **This command has not been run in this branch, and the repository must not claim live inference success.**

## Manual acceptance checklist

1. Confirm the status endpoint reveals configuration/model only, never the key.
2. Use a three-line synthetic script with zero assets and run the guarded smoke once after reviewing cost/account terms.
3. Verify one fetch attempt, a completed strict response, `assetId: null`, a useful brief, exact L2 evidence, latency, finish reason, and usage.
4. Try a rights-clear multilingual script while the UI is English; verify source text and IDs remain unchanged.
5. Exercise a script over 60 and over 120 lines; verify window progress and explicit confirmation for each later request.
6. Review explicit, suggested, dialogue-memory, continuing-rain, silence, and stop cases.
7. Approve an unbound cue; verify all three resolution paths and blocked GO.
8. Disconnect the network and verify already-loaded GO/STOP/fade/STOP ALL remain deterministic.

## Boundaries

- No model request occurs on startup, import, approval, audio-resolution choice, project open, or GO.
- No provider retry, polling loop, audio upload, fine-tune, or paid audio generation exists.
- The loopback server is a single-user development boundary, not an Internet-facing production service.
- Standard-mode data terms and current pricing/rate limits must be checked in the user's active Meta account before submitting third-party material.

Implementation: `src/core/metaCueProvider.mjs`, `src/core/theatreCueAnalysis.mjs`, `src/core/sceneAnalysis.mjs`, `tools/metaRoutes.mjs`, `src/core/workspace.mjs`, and `src/ui/app.mjs`.
