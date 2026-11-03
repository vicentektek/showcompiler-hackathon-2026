> **HISTORICAL RESEARCH, NOT A SHIPPED CAPABILITY.** New Modal SFX generation is disabled in the frozen RUNQ demo. The operator imports/assigns local audio; a future audio provider (including a possible Meta option) requires a verified official API and a separate release decision. See [current feature status](FEATURE_STATUS_AND_FUTURE_AUDIO_2026-11-03.md).

# RunQ Modal audio-generation roadmap

Verified 28 October 2026. This document prepares an interface and phased plan. It does **not** deploy an app, allocate a GPU, download gated weights or generate audio.

## Safety architecture

```text
Original L# direction
  -> Meta/Baseten observation
  -> human-reviewed sound proposal
  -> PREPARATION_ONLY generation plan
  -> explicit authorization for one generation request
  -> future Modal adapter and asynchronous job
  -> validated WAV metadata
  -> manual local import and audition
  -> explicit asset binding
  -> manual GO
```

`src/core/audioGenerationPlan.mjs` implements only the provider-neutral stages shown before and after a future adapter. It supports SFX, environments, optional music and voiceover plans. Voiceover keeps editable text, voice and language. A generated WAV is recorded by name, SHA-256, duration, sample rate and channels, but it does not become an `assetId`, cue action or playable object. Each plan needs its own authorization identifier; authorization is single-use.

Generation is preparation work. GO, STOP, STOP ALL, scheduling, routing, show schema and active playback state are outside this interface.

## Candidate verification

| Candidate | Verified availability | Hardware evidence | License evidence | Status |
| --- | --- | --- | --- | --- |
| Stable Audio 3 Small SFX | Official open-weight `stabilityai/stable-audio-3-small-sfx`, 0.6B; official demo suggests A10G | Exact peak VRAM is not published in the model card; profile before choosing Modal GPU | Stability AI Community License; commercial users must register and the free commercial threshold is under USD 1M annual revenue | Preferred first SFX pilot, not production-selected |
| Stable Audio 3 Medium | Official gated open weights, 2B; main safetensors file about 9.22 GB plus conditioning components | Exact peak VRAM is not published; start profiling on L40S 48 GB, then reduce | Community License plus T5Gemma terms; commercial registration/threshold applies | Complex-environment candidate after license acceptance |
| Chatterbox Multilingual V3 | Official ResembleAI 0.5B, 23+ languages; Spain-Spanish specialization is published | No authoritative peak-VRAM figure found; benchmark L4/A10 before selection | MIT; generated audio is watermarked by the model | Voiceover candidate; explicit voice rights/consent required |
| ACE-Step 1.5 | Official music model and REST/Python interfaces | Standard model can operate below 4 GB with offload; XL requires at least 12 GB with offload and 20 GB recommended | MIT; project warns about copyright/style risks | Optional incidental-music experiment only |

Primary sources:

- Stable Audio 3 Small SFX model card: https://huggingface.co/stabilityai/stable-audio-3-small-sfx
- Stable Audio 3 Medium model card: https://huggingface.co/stabilityai/stable-audio-3-medium
- Stability licensing: https://stability.ai/license
- Chatterbox official repository/model card: https://github.com/resemble-ai/chatterbox and https://huggingface.co/ResembleAI/chatterbox
- Spain-Spanish checkpoint: https://huggingface.co/ResembleAI/Chatterbox-Multilingual-es-es
- ACE-Step 1.5 repository and GPU guide: https://github.com/ace-step/ACE-Step-1.5 and https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/GPU_COMPATIBILITY.md
- Modal GPU and pricing documentation: https://modal.com/docs/guide/gpu and https://modal.com/pricing

None of these candidates was verified as a predeployed Modal shared endpoint. The safe plan assumes a custom Python container and pinned model revision until Modal documents otherwise.

## Modal cost envelope

Current GPU-only list prices are billed per second. Illustrative compute per active minute, excluding CPU, memory, storage, egress, region multipliers and container load/idle time:

| GPU | USD/second | GPU USD/active minute |
| --- | ---: | ---: |
| T4 | 0.000164 | 0.00984 |
| L4 | 0.000222 | 0.01332 |
| A10 | 0.000306 | 0.01836 |
| L40S | 0.000542 | 0.03252 |
| A100 40 GB | 0.000583 | 0.03498 |
| H200 | 0.001261 | 0.07566 |

Modal bills application load and input-processing time, and a warm container may remain billable until scaled down. These figures are not a per-WAV quote. The reported workspace credit balance and GPU eligibility must be checked in the dashboard before an authorized pilot.

## Phased implementation

1. **Offline contract (implemented):** validate plans, one-request authorization and WAV metadata; test that no transport/network field exists.
2. **Profiling spike (requires explicit authorization):** one short rights-clear SFX on Small SFX, one Spanish phrase on Chatterbox V3, one optional short music bed on ACE-Step. Capture cold start, GPU type, peak VRAM, wall time, output duration and Modal dashboard cost.
3. **Adapter:** asynchronous Modal job IDs, bounded duration, no retries by default, sanitized status, cancellation and output hash. No show mutation.
4. **Review/import:** download WAV locally, validate RIFF/audio bounds, waveform audition, explicit operator acceptance and manual binding to an existing approved cue.
5. **Production decision:** select models only after quality, license, cost and failure-mode review. Add spend budgets and per-request confirmation before any UI integration.

Hard stops: no voice cloning without documented speaker permission; no copyrighted lyrics/reference track without rights; no automatic job from GO; no GPU deployment from tests, CI, startup or page load.
