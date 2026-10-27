# Engineering / product decision index — read ONLY your current task
2026-10-27. This is a navigation aid, not implementation proof.

**The first programming task is already scoped. Start with AGENTS.md + docs/CODEX_TASK_01_SAFE_INTEGRATION.md. DO NOT read every design dossier before integration.**

## Today: what's actually runnable vs designed

| Item | Last verified code state | Gate |
| --- | --- | --- |
| Approved script-linked manual GO/STOP | Implemented in browser feature branch | Integrated browser + audible test still required |
| Complete ZIP with original WAV demo | Built/tested on separate PR 14 | Merge and roundtrip with other branches |
| onCueNaturalEnd event | Built/tested separately on PR 18 | Merge without losing pending GO cancellation |
| Cue automation plan/runtime | Model and stand-alone scheduler PR 16/17 | NOT wired to operator transport/UI |
| Automation persistence/update model | PR 19/20 | Does NOT prove playback of loops/fades/AUTO |
| Full hybrid workspaces/modes | Product design only | Not MVP shipping claim |
| Native desktop / device patch / isolated audition / voice GO | Not implemented/verified | Explicitly deferred |

## Task-oriented routes — do not scan all docs

| Task type | Read these and no others unless blocked |
| --- | --- |
| **C1 now** | AGENTS.md; docs/CODEX_TASK_01_SAFE_INTEGRATION.md |
| Audio conflict in C1 | docs/SECOND_PASS_TECHNICAL_AUDIT_2026-10-27.md sections 2–5 only |
| C2 future coordinator | docs/TRANSPORT_ARBITRATION_SPEC.md + targeted sections of docs/QA_MATRIX_2026-10-27.md |
| Future per-action editor | docs/ADVANCED_CUE_MODEL_DECISION_RECORD.md |
| UI navigation/modes | docs/PRODUCT_UX_NAVIGATION_V1.md |
| AI offline evaluation | fixtures/theatre-gold-v1.json + docs/CODEX_EXECUTION_PLAN_2026-10-27.md C3 |
| Actual demo / public release | docs/DEMO_AND_RELEASE_RUNBOOK_V1.md |
| Full backstory / phase prioritization | docs/CODEX_EXECUTION_PLAN_2026-10-27.md |
| Full test inventory | docs/QA_MATRIX_2026-10-27.md |

## Why these are intentionally separate

A product specification may include features that are *desired* but not delivered. A coding task requires only the files and behavioral contracts necessary for its current goal. The repository should therefore remain public-safe and detailed while each Codex session is narrow, cheap and provable.

Do not rewrite v1 persistent schema for v2 on C1. Do not enable automated GO because a model or scheduler file exists. Do not claim speaker quality from node tests. Never copy pre-event source into this event repo without separate explicit compliance review.

## Next actions and release discipline

1. Codex C1 integration, one draft PR, tested ZIP and audio safety.
2. User/manual real browser + low-volume sound acceptance. Record observations, no generic passing checkbox.
3. Offline Meta response evaluation using fixed original fixtures; ONE explicitly authorized live-quality sample only if useful.
4. Real browser journey test on the integrated commit.
5. Demo and submission freeze; optional auto advance/desktop features only if all mandatory gates passed.

**Release boundary:** official event page lists 2026-11-04 21:00 ET. Recheck organizer notices and exact upload requirements. Keep margin before the deadline; no unverified installer promise.
