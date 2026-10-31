# RUNQ interface rework (2026-10-31)

Branch: `feat/runq-interface-rework-2026-10-31`. Recovery point: branch `backup/interface-before-rework-2026-10-31` (includes the previous uncommitted local changes).

Scope: presentation, layout and usability only. GO, STOP, FADE and STOP ALL remain manual, local and deterministic; no network or AI call was added to any transport path, and no dependency was added.

## Structure
- Three contexts in a top page bar: **Prepare** (Project, Studio, Script, Sound, AI proposals, Preflight), **On stage** (Rehearsal, Live).
- Desktop-style window: title bar, menubar, page bar, status bar, flat neutral panels, green GO / red STOP.
- Cue editor: the previously inert divider now really resizes the panels (mouse and keyboard); redundant navigation and disabled STOP placeholders removed.

## Style layers (load order)
`runq-interface.css` (structure) then `runq-desktop.css` (final presentation layer, uses `!important` with the `:root#runqApp...` prefix to win over earlier layers).

## Resizable panels — `src/ui/runq-panels.mjs`
- Drag grips (always-visible pill), arrow keys to nudge, double-click to reset. Sizes persist in `localStorage` key `runq.panels.v1`.
- Modes: `grid` (between tracks), `size` (height, top edge) and `width` (drawer, right edge).
- Panels: Live cues/events, Live running cues (`#runqActiveCues`), Live script drawer, Rehearsal, Sound, Script scenes, AI inspector.

## Live workspace
- **Script drawer:** optional, closed by default, button "Script/Guion" left of the cue search; animated slide (respects `prefers-reduced-motion`); read-only; highlights the source line (`L#`) of the NEXT cue. State in `runq.live.script.v1`. It never prepares or fires cues.
- **Running cues:** freely resizable and scrollable.
- **States:** NEXT = amber row with bold "NEXT GO" badge; PLAYING = green row with pulsing dot (`.cue-playing`, set in `app.mjs` with the cue state label); selection = quiet blue.
- **Transport cluster:** GO and STOP ALL share the first row; Previous (icon, keeps accessible name), Skip and Restart are aligned beneath.

## Fixed defects
- Inert divider; duplicated navigation; clipped controls on laptops; partly untranslated voice panel after restoring an ES session.
- "Audition cue" staying disabled after opening a ZIP/demo, GO, then STOP.

## Sound generator is "offline" by design
It needs a local `.env` (see `.env.example`: `RUNQ_SFX_PILOT_ENABLED=1`, Modal endpoint/proxy tokens, spend limits). Not created here because it holds credentials and enables billable calls.

## Verification
`npm run check:syntax`, `npm test` (624 pass), `npm run test:interface` (all PASS, includes drag/persist/reset and drawer), `node tools/browser-e2e.mjs` (BROWSER_SMOKE_OK).

## Approved reference version and how to recover it
The operator approved this interface as the stable reference for future work.
- Tag (annotated): `runq-interface-approved-2026-10-31`, on the commit that adds this section (child of `3c62e2d`, the last code/docs commit before the tag).
- Branch: `feat/runq-interface-rework-2026-10-31`.
- Pre-rework backup (local branch, not pushed): `backup/interface-before-rework-2026-10-31`.

Recover exactly this version:
```
git fetch origin --tags
git switch --detach runq-interface-approved-2026-10-31      # read-only inspection
git switch -c work/from-approved-interface runq-interface-approved-2026-10-31   # to continue developing
```
Verify: `git describe --tags` and then `npm run check:syntax`, `npm test`, `npm run test:interface`, `node tools/browser-e2e.mjs`.
Restore a single file from it: `git restore --source=runq-interface-approved-2026-10-31 -- <path>`.
Never move or re-create the tag; make a new tag for later approved versions. This tag is a reference point, not a release, and `main` is untouched.

## Not verified
Real audio output by ear, Spanish locale and very small viewports for the newest Live additions, hardware/multichannel. No professional live-show certification is claimed.

## Sound design screen restyle (post-approval)
Sound > Create & edit was restyled after tag `runq-interface-approved-2026-10-31` (the tag is unchanged). New files: `src/ui/runq-soundlab.css` (studio layout: create + result on the left, listen & edit on the right, hero header, gradient step badges and generate button, animated empty waveform) and `src/ui/runq-soundlab-ui.mjs` (one-click example prompts and a character counter; it only fills the prompt, never starts a generation). No generation, authorisation or provider logic changed.

## Brand palette and AI proposals restyle (post-approval)
Applied the RUNQ brand identity (sage #A7B28F, charcoal #0F110E, off-white #EBE6DD, stone #686F68, deep green #1E2A21): blue accents in the stylesheets were remapped to sage, the top bar uses the Q mark (assets/runq-q.png; assets/runq-logo-full.png and runq-wordmark.png are available for splash/about), and src/ui/runq-brand.css restyles AI proposals (hero header, proposal cards with state chips, prominent generate button). Presentation only: no handler, id or AI/GO/STOP logic changed.
