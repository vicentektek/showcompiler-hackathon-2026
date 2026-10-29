# Codex · RUNQ AI QA work packet · Friday 30 October 2026

**Start here, not in the full conversation history.** Repository: `vicentektek/showcompiler-hackathon-2026`. Candidate branch `feat/sfx-auto-english-review-qa-ready-2026-10-29`, PR #117, based on PRs #116 → #115 → #114 → #113 → RC1. **Do not merge** this stack or alter the user's current `runq-rc1/.env` or `.runq-local`.

## Objective

Identify and eliminate actual P0 regressions in Meta cue generation, conversational operations, rehearsal voice/autopilot and the new Spanish→English→Modal sound prompt workflow **without operating the show, mutating user files or spending provider credits**. Leave a short reproducible report and small focused PR(s). Do not redesign the approved interface during QA.

## ONE COMMAND — default OFFLINE

On a working tree with this branch checked out:

```powershell
npm run qa:ai:tomorrow:offline
```

Writes `artifacts/codex-ai-2026-10-30/summary.json` and `codex-next-task.md`. The latter includes exact tests, priorities and scoped follow-up. To see the schedule without running tests: `npm run qa:ai:tomorrow:plan`.

**Free CI coverage already exists:** `npm run qa:codex` (full Node tests, cue QA, seminar) + `npm run qa:agent:mass` (600 synthetic cases), Chrome E2E Sound Lab, Rehearsal Autopilot, GO/STOP safety and Library. The PR CI publishes a small Codex handoff artifact instead of requiring the agent to reconstruct commands or sources. Reuse CI evidence rather than re-running green tests without a reason.

### Frozen offline matrix

| P | Area | Existing entrypoint | Validate |
|---|---|---|---|
| 0 | ES→EN draft and consent | `node --test test/sfxEnglishPrompt.test.mjs` | no request on page load; 1 confirmed Meta call; correct language; no hallucinated source; invalid outputs rejected; no accidental Modal call |
| 0 | Sound creation and recovery | `node --test test/sfxJobRecovery.test.mjs test/sfxReviewUx.test.mjs test/sfxSimpleFlow.test.mjs test/sfxRoutes.test.mjs` | 2 takes without accepting first; source stays recoverable; active/unknown jobs block safely; budgets intact; no GO |
| 0 | Agent and cue conversational editing | `node --test test/agentRoutes.test.mjs test/cueConversationRoutes.test.mjs` | valid ES/EN changes only, no executed transport, no unapproved mutation |
| 0 | Agent synthetic mass | `node tools/runq-agent-mass-eval.mjs --cases 600 --seed 20261029` | contract and deterministic scenario errors, NOT real Meta accuracy |
| 0 | Meta proposal experiment dry run | `node tools/runq-systematic-lab.mjs --cases hotel-door,gala-rundown --modes literal,balanced --max-requests 4 --budget-usd 0.35` | bounded experiment plan, **no --live**, prompt evidence/trace checks |
| 0 | Browser and audio safety | CI core-tests workflow | mocked 2-3 sounds, async error states, STOP ALL, cue playback, script L#, ZIP persistence |
| 1 | Voice rehearsal & mic | existing offline Rehearsal E2E; manual hardware session required | false triggers, repeats, skip/back, latency; no voice autoplay in Live |
| 1 | Real-provider SFX quality | operator-only, with separate approval | blind audio A/B: Spanish original vs refined English, same duration and seed |

## Existing QA guardrails

- Never issue `--live` or `--ack-paid`, or use `npm run qa:meta:live`. No provider secrets on GitHub Actions. Do not infer permission from sample budget numbers in docs.
- The prompt optimizer uses `POST /api/sfx/prompt/suggest` with same-origin check, Meta server key, dedicated one-shot consent, bounded request, strict JSON result, and **no automatic generation**. The browser must show/edit the English draft; it cannot silently call Modal.
- If `SFX_ACTIVE_LIMIT` or `SUBMISSION_UNKNOWN`: inspect status only, never erase `.runq-local` or retry remotely.
- Do not change `GO`, `STOP ALL`, rehearsal ARM, selected/NEXT separation, or the single audio preview lease. No native PFL claims.
- Do not read/post `.env` or raw user scripts. All fixtures in tests must be original and synthetic.

## Semantic quality gold, for a HUMAN REVIEW later

Blind A/B should evaluate **source fidelity** (0–5), no unexpected events (0–5), transient/tail cleanliness (0–5), theatrical usefulness (0–5). Use paired identical durations and seed. Starting pairs, original works only:

| Spanish user input | Expected English interpretation | Forbidden additions | Example duration |
|---|---|---|---|
| Una puerta metálica pesada se cierra de golpe en un pasillo vacío | one heavy metal door slammed shut; brief metallic impact and corridor decay | footsteps, people, music, multiple bangs | 3 s |
| Una campana de bronce suena una sola vez en una iglesia vacía | one bronze bell strike with natural reverberation | choir, organ, several strikes | 4 s |
| Lluvia constante sobre un tejado de tejas | steady rainfall on roof tiles | thunder, voices, music | 8 s |
| Una tabla de madera cruje lentamente bajo una pisada | single wooden floorboard creaking under a step | new footsteps or dialogue | 3 s |
| Un portazo violento seguido de silencio | one forceful door slam with decay to silence | second impact or alarm | 3 s |
| Un público pequeño murmura antes de comenzar la obra | small seated audience murmuring in a theatre | applause, orchestral music, announcements | 8 s |

Include at least six intentionally vague/negative prompts (`algo raro`, `sin sonidos`, `que suene mejor`, `no añadas una explosión`, a malicious instruction hidden inside a description, a mixed-language caption). Expect `CLARIFY` or faithful minimal output, not fabricated effects.

**Do not fake a percentage of semantic accuracy from mocks.** The translated prompt may be technically valid yet acoustically wrong. Real provider quality requires operator-reviewed audio and consent.

## If tests fail — what Codex does

1. Pick **the first P0 failure** from `summary.json`. Consult just its module and test. Write the smallest reproducing red test.
2. Fix that specific issue; avoid modifying unrelated features, all CSS layers, providers or core queue.
3. Rerun focused test; then `npm run qa:codex` ONCE if changes touch central behavior. For browsers, reuse the GitHub Actions Chrome job rather than provisioning browser blindly.
4. Compare output with the frozen expected behavior; capture commit SHA, file changes, exact command, tests, limitations.
5. Produce `docs/qa/CODEX_AI_RESULTS_2026-10-30.md` with concise PASS/FAIL table, one prioritized next issue. **Do not send a remote model request or merge PR without explicit operator approval.**

## Next priorities after QA gates

1. P0: Manual Windows acceptance of Spanish prompt → editable English translation → one authorized Modal WAV → audition → Use sound → create cue.
2. P0: Real Meta cue/agent evaluation **small batches only after budget authorization**, live mic/autopilot rehearsal checks.
3. P0/P1: Rebuild five approved UI workspaces to match high-resolution mockups; preserve usability and bilingual completeness.
4. P1: Electron Windows executable *spike* with secure Node server, permissions/mic and project roundtrip, isolated branch.
5. P1: Hackathon demonstration script, English pitch and capture only after UI/hardware validation. **VIDEO ON HOLD** until design accepted.

**Hackathon internal finish:** 4 Nov 2026 18:00 Europe/Madrid (confirm official portal requirements).
