# RunQ — Professional technical workstations (V13, 29 Oct 2026)

## Goal

RunQ is show-control software, not a marketing dashboard. Its primary surfaces must be source documents, media catalogues, cue sequences, AI review queues and live transport. A list is more important than cards, and a console must never sacrifice safety to aesthetics.

## Design contract

| Workspace | Primary surface | Secondary inspector/tools | Always-visible critical functions |
| --- | --- | --- | --- |
| Home | recent/create/open project | project identity + complete ZIP reminder | New, Open, Save |
| Script | referenced script lines | searchable acts/scenes index | Import TXT, show name, script search |
| AI & Review | proposal queue | Meta analysis + manual controls in disclosures | review decisions and AI progress |
| Cue Editor | full ordered cue list | cue parameter inspector | row Play, row NEXT, prepared GO, STOP ALL |
| Sound | dense media list | file-attribute inspector | Preview Play/Stop, Import batch/archive, Edit |
| Sound preview | single source waveform (bottom) | zoom/pan, asset choice, statistics | Preview only; never executes GO |
| Sound generation | existing Sound Lab review | provider controls & reviewed variants | separate audition lease, STOP ALL |
| Rehearsal | script + cue transport | real-time Voice Follow / Autopilot dock | ARM state, manual GO, STOP ALL |
| Operation | operator cue sequence + active cues | read-only inspector | GO, NEXT, STOP ALL, current ON AIR |
| Setup | technical settings & readiness | keyboard mapping and audio routing | status, reset and safe navigation |

### Interaction

- Single click on a cue or media row: **inspect only**.
- Direct row Play deliberately plays that one cue and does **not** advance prepared NEXT.
- Row Set NEXT prepares a cue without GO.
- Audio auditions are mutually exclusive with GO and cease when switching to Live, and with STOP ALL.
- Script lines Lxx are stable and selection never performs a cue.
- Rehearsal Autopilot is explicitly armed and disarmed; hiding the dock cannot silently arm it.
- AI results require explicit review. No model call without consent.
- Never hide or replace element IDs already wired to live controllers solely for layout. Reparent the original node, never clone controls with duplicate handlers.
- Keep dangerous actions labelled, focusable and visually isolated. Tooltips alone are insufficient for GO, STOP ALL and ARM AUTO GO.

### Technical surfaces

Colors are semantic, not decorative: blue selected/editing, amber prepared NEXT, teal ON AIR, red STOP ALL/danger. Dark graphite everywhere. Dense row target ~38–46px in editing; safety controls larger in Live and Rehearsal. Source preview is compact by default (~120px waveform) and expands only by request. Native scrollbars on source list, cue list and inspectors; no hidden overflow clipping.

The MediaBay-like sound desk uses exactly **one** original waveform viewer, with no extra transport engine. It is not an independent PFL bus. Large-WAV streaming and permanent disk paths remain architectural next steps, not claimed V13 capabilities.

## Regression / visual acceptance

Every branch that changes layout must pass:

1. Runtime core / export / import / archive / JSON round trip / malformed audio guards.
2. Voice Follow and Rehearsal Autopilot with armed/disarmed, cue skip/rewind, STOP ALL and real WAV sample.
3. Cue Play without changing NEXT; Set NEXT without sound; selected cue STOP/FADE; no single-click GO.
4. Sound library at 1740×864, 1366×768, 1100×640 and 900×600 with list internally scrollable, first file and transport reachable, import report visible **outside** the collapsed advanced drawer.
5. Library file inspector, same waveform viewer, generator tab isolated, preview STOP, no provider use without consent.
6. AI proposal queue and Meta/manual tools accessible without losing pending results or progress indicators.
7. Script search/scene navigation, original Lxx and source selection unchanged.
8. Actual audio-device / microphone / latency / DPI smoke in Windows before an executable release.

These checks are progressive. Browser CI uses fake audio except for dedicated local WAV tests; **CI success never certifies physical interfaces or pro-audio timing**.

## CSS architectural debt and consolidation

The repo still loads older V4/V7/V8/V9/V10/V11/V12 style modules. V13 deliberately makes structural changes **inside existing layout modules**, not by adding a V13 script/css pair. Some older selectors remain, including V8 daylight Studio rules and V9 dark overrides. This must be reduced after V13 behavior is approved:

- inventory identical or conflicting declarations and retain one authoritative rule for each workspace;
- move theme tokens and shared UI density to a canonical stylesheet;
- replace one-off CSS override blocks with scoped workstation components;
- keep test coverage for DOM IDs and viewport accessibility while deleting superseded rules;
- never combine the style cleanup with changing playback/Autopilot logic.

## Known limits

No packaged .exe or detached windows claimed. No >20 MB WAV, >10 min file, or >64 MB ZIP capability claimed; changing the labels alone does not create streaming support. Distinct local Audition and Lab audio contexts remain coordinated by the Show controller, not yet unified at the PCM graph level.
