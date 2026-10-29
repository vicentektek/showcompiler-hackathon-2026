# Sound Lab — Review → Library in one confirmed action, and SFX quality experiments

**Status:** candidate UX change, not yet merged into RC1. No paid requests, no GPU inference in CI.

## Findings from user walkthrough

The previous path was: Generate (confirmed) → manually Check result / load WAV → Play → Accept → Import to library (second confirmation), or Import + Create cue. This forced an explicit accept action before selecting the destination and obscured the actual outcome.

Updated UX:
1. Describe one short sound; the offline prompt hint warns about Spanish input (Stable Audio 3 Small-SFX is predominantly trained on English captions), incomplete descriptions, multi-event sounds, or long duration for a one-shot.
2. Confirm each generation separately; the backend / local journal and spending policy are unchanged. **Another variation** changes the seed only, revokes earlier consent, and never sends a request.
3. Check result and load once; **Play** requires the existing sound-preview lease, shares the main output and marks the actual remote WAV as auditioned.
4. After listening, choose **Save to library** or **Save & create cue** and approve **once**. If the remote job is still READY_FOR_REVIEW, the UI accepts it, verifies the accepted state, then delegates to the existing provenance-validated `importReviewedGeneratedSfx()`. If already accepted, no second review request is made.
5. For safety, a rejected, queued, failed, stale, local demo, unplayed or missing WAV cannot be committed. The operator can still choose **Accept only (without import)**. No GO, no audible auto-play, no automatic new generation or retry.
6. The WAV remains the verified ORIGINAL. Edits are non-destructive cue metadata; standalone library import leaves cue sequencing unchanged.

## Effect-quality diagnosis

Stable Audio 3 **Small-SFX** is an intentional small, post-trained sound-effects model. Its default `steps=8` is already the recommended reference; the upstream guide warns that increasing steps beyond 8 need not improve post-trained outputs and CFG/negative prompting are not useful knobs for this checkpoint. **Do not change 8 to 16/32 or bump CFG blindly.** Different seeds create alternatives; they should be intentionally auditioned.

Small-SFX prompts generally work better in English, with a *single* sound source/action, acoustic timbre and room/microphone characterization, and an appropriate duration. Text-to-sound for multiple consecutive cues should be split into individual effects.

Example quality test pairs with the **same model revision and settings**:

| Category | Typical vague prompt | Improved controlled prompt | Duration |
|---|---|---|---|
| One shot | 'una puerta que se cierra' | 'A single heavy oak door slamming shut against its frame; a sharp wooden impact with a brief metal latch rattle and a short natural decay, close-miked in a dry indoor room.' | 3 s |
| Bell | 'campana' | 'A single large bronze bell strike, a strong clear metallic transient followed by a resonant natural decay, recorded close inside a quiet stone room.' | 4 s |
| Rain | 'rain storm' | 'Steady moderate rainfall on a tiled roof, diffuse pattering droplets, distant outdoor space, stable texture with no abrupt changes.' | 8 s |

Any additional paid A/B needs explicit operator authorisation and confirmed Modal spend estimate. Start with **3 source descriptions × 2 prompt variants**, keeping same seed/duration per pair; listen blind and score semantic accuracy (0–5), audible artifacts/clipping (0–5), cleanliness of onset/decay (0–5), and cue-usefulness (0–5). Then optionally run an independent seed variation for the best prompt. Measure actual latency and Modal billing; no guarantees from the configured local estimate.

Evaluate Stable Audio 3 **Medium** later only after checking deployed GPU, weights, licensing, latency, memory, model contract and cost. It is not a drop-in replacement for the existing pinned Small-SFX route; keep the current stable provider as baseline.

## References

- Stability-AI inference controls: https://github.com/Stability-AI/stable-audio-3/blob/main/docs/workflows/inference.md
- Stability-AI prompt guide: https://github.com/Stability-AI/stable-audio-3/blob/main/docs/guides/prompting.md
- Stability-AI model overview: https://github.com/Stability-AI/stable-audio-3/blob/main/docs/guides/model-overview.md

## Acceptance and rollout

- Unit: never allow library commit if unplayed/stale/wrong provider state; valid seed wrap.
- Chrome E2E: buttons disabled before audition, enabled after remote WAV is loaded and genuinely played; one confirmation -> POST /review exactly once + local import; optional cue create does not GO. Cancel confirmation has no side effects.
- CI Node and browser smoke green.
- Manual Windows: 3s bell generated once, play, save to library without extra acceptance click; optional save+cue in a **new** take/project; ZIP roundtrip; no unintended GO.
- After acceptance, compare and integrate this branch to RC1. Preserve previous stable checkout until operator approves.
