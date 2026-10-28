# RunQ — Baseten voiceover stage: provider evaluation (2026-10-28)

Status: **researcher's decision record, not yet implemented**. No credits consumed. SFX generation
on Modal keeps priority; this document only fixes the choice so the next bounded task can proceed.

## Why an extensible provider interface

`src/core/voiceProviderCatalog.mjs` registers reviewed providers offline. It never generates
audio, never calls the network and rejects unregistered model candidates or languages. The
future Baseten adapter must follow the same rules as the Modal SFX pilot:

- one explicit operator authorization per request; no retries; no spend without authorization;
- generated audio enters the pipeline ONLY through reviewed WAV import (checksum + human accept);
- no automatic cue creation, no automatic transport, no automatic asset replacement.

## Candidates evaluated

| Property | Qwen3-TTS (Alibaba) | Chatterbox Multilingual V3 (Resemble AI) | Orpheus (Canopy Labs) |
| --- | --- | --- | --- |
| License | **Apache-2.0** | **MIT** | Older Orpheus-3B Apache-2.0; newest v1 license unconfirmed |
| Spanish | Native among 10 languages (zh en ja ko de fr ru pt es it), reported SOTA multilingual WER | Dedicated es-ES and es-MX single-language packs ("tighter quality control") + broad 23-language checkpoint | Spanish among 11 languages (v1) |
| Registrations | `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice`, 1.7B-CustomVoice, VoiceDesign variants | `ResembleAI/chatterbox`, `ResembleAI/Chatterbox-Multilingual-es-es`, `-es-mx-latam` | Baseten library trisses (TTS v1; Orpheus 3B WebSockets) |
| Baseten presence | Library truss "Qwen3 TTS 12Hz — vLLM — H100"; documented wire protocol used by the livekit plugin (`model: "qwen3-tts"`); vLLM-Omni official day-0 support | No ready-made library truss found; deploy custom Python truss (simple PyTorch) | Native Baseten library trusses (TRT-LLM, H100 MIG) |
| Voice presets without cloning | 9 preset voices + free-form VoiceDesign (describe voice in text) | Generation style needs a reference sample; zero-shot clone by default → consent risk | 6 preset voices + inline delivery tags (`cheerful`, `whisper`…) |
| Sizing / GPU | 0.6B–1.7B + tokenizer; L4-class feasible for 0.6B with vLLM; library truss assumes H100 | ~0.5B core + counter Mandarin T5-ish stack; comfortable on T4/L4 | TRT-LLM optimized; H100 MIG |
| Ethics/boundaries | Cloning exists upstream → RunQ plan keeps cloning OFF first | Cloning-first design → only usable with a documented consented reference voice | No cloning in v1 → cleanest consent story |

## Decision

**Primary: Qwen3-TTS — preset voices (NO cloning), deployed via its published protocol behind
RunQ's own Baseten adapter.** Reasons:

1. License cleanliness (Apache-2.0) with preserved attribution duties;
2. Spanish in the officially released language set with documented quality focus in the
   technical report; final judgment requires our own listening tests before shipping claims;
3. A registered Baseten truss exists, plus a documented request protocol, which minimizes the
   do-it-ourselves surface;
4. Preset voices and text-based VoiceDesign avoid every consent/voice-clone question for this
   prototype (cloning stays OFF until operator consent is documented).

**Runner-up (fallback): Chatterbox-Multilingual-es-es** (MIT, dedicated es-ES single-language
pack) — a strong Castilian option when a consented voice reference is available, cheaper GPU
tier (L4). **Not chosen now:** Orpheus v1 pending license confirmation; revisit if Qwen3
quality on our own Spanish test lines disappoints.

## Cost reference (Baseten published dedicated GPU-minute rates, Oct 2026)

| Tier | $/min | $/hr |
| --- | --- | --- |
| T4 16GB | 0.01052 | ~0.63 |
| L4 24GB | 0.01414 | ~0.85 |
| A10G 24GB | 0.02012 | ~1.21 |
| H100 MIG 40GB | 0.0625 | ~3.75 |
| H100 80GB | 0.10833 | ~6.50 |

One short branded line (~10 s) at ~2–5 minutes start-to-finished on a hosted H100 MIG replica ≈
**$0.13 – $0.31**; L4-class (0.6B, vLLM) ≈ **$0.03 – $0.08**. Practical for punctual tests with
credits; not for unattended batches. These are planning estimates: real spend must be confirmed
on the Baseten dashboard. Baseten dedicated deployments scale to zero when idle and bill per
minute hosted: keep the deployment stopped after review unless explicitly redeployed.

## Next bounded tasks (not in this branch)

1. `docs` draft of request/authorization mapping to the SFX job store pattern (persisted
   jobs + accept/reject/ checksums), reuse `sfxJobStore` journaling.
2. Baseten adapter `src/core/basetenVoiceClient.mjs` mirroring `modalSfxPilotClient` safety:
   explicit request, status polling, WAV validation, cancel, zero retries.
3. Sound Lab voice tab: text + language + preset voice + one cost flag + authorization.
4. Live listening QA on Spanish lines: read intelligibility, naturalness, latency; judge 1-5
   against a consensually selected corpus. No promotion without human hearing.
