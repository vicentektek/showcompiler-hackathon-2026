# RUNQ Sound Lab — one-screen user flow (29 Oct 2026)

**Operator priority:** no technical jargon or multi-step acceptance in main UI. The user reported being stuck on «Aceptada para guardar» and blocked from another generation. This iteration intentionally **does not** add more AI/provider switches.

## Default workflow

1. **Describe** one sound (Spanish or English).
2. **Generate sound**; a single confirmation states the configured estimate and that real billing may differ. It is a one-shot operator authorization, **no automatic retries or silent model calls**. The former separate checkbox is hidden/inert; permission is conferred only after the user accepts this exact confirmation.
3. **View result** and **Listen** in the same Sound Lab.
4. **Use sound** — accept and import into the current project's library with one confirmation. Never GO. Alternatively, **Try another version** — changes the seed and opens the same one-shot cost confirmation. Previous WAV remains in the persistent journal, not lost by creating another take.

Advanced/optional features remain under HTML `details`: prompt assistance, source-line, seed and examples, original WAV/local test, alternate Save & create cue, numeric IN/OUT/fades and technical journal controls. **My other sounds** is the plain-language recovery portal, collapsed by default. No technical IDs are required for the normal path.

## Why another generation used to fail

The original pilot used `maxDailyStarts=3` as an independent hard ceiling, regardless of the configured daily cost budget, and did not distinguish this in the main UI. Review/accept/reject never refunds a start. The default is now a hard **10 attempts per UTC day**, *in addition* to and never instead of:
- the existing locally configured daily USD reservation budget (user's RC1 policy reported $0.50),
- maximum estimated USD per request ($0.05 in RC1),
- required operator confirmation of every individual remote generation,
- a single active/uncertain job at once,
- no automatic retry, no journal deletion, no bypass of spend/cancel protections.

Changing the software limit does NOT authorize any requests or increase the USD cap. Provider billing remains uncertain until verified. If 10 USD reservations at $0.05 each reach $0.50, the budget blocks additional attempts. Other charged/unknown records remain fail-closed. Other uses of `createSfxJobStore` can explicitly configure lower caps; this change affects only the previously too-low default.

## Important audit tests

- Starting a new take before accepting the first must not lose the original; both recover without provider regeneration.
- `Use sound` requires a truly auditioned, verified WAV; only one import, no GO and no duplicate WAV load.
- `Try another version` must change the seed and create **one** paid authorization only after explicit confirmation. Cancel leaves the sound and credits unchanged.
- Active/unknown job blocks new generation. Display a concise message; advanced resolution stays discoverable.
- No prompt translator or Meta call is implied. The existing offline English suggestion helper is optional; a general intelligent prompt optimizer is **not** in the default path.
- Run Chrome E2E, unit tests and the general CI before approving merge. Windows real-Modal acceptance is still pending.

**Scope warning:** the new default is not meant as a design-system freeze; align this simple flow with the approved workstation mockups during later visual implementation. Protect the Cue/Stage/Autopilot engine.
