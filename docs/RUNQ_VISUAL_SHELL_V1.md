# RunQ — Visual Shell v1

Status: UI implementation on an isolated feature branch. Not a release or validated live-show system.

## Goal

Replace the crowded browser-prototype presentation with a compact, consistent, professional-looking RunQ workspace **without changing cue execution, persistence, model calls or audio processing**.

## Included

- New RunQ branding and document title.
- Charcoal surfaces, restrained turquoise accents, consistent readable typography, visible focus and deliberately distinct emergency-stop treatment.
- Persistent desktop workspace rail: Home, Script, AI & Review, Cue Editor, Audio, Setup and Operation.
- Working File / Edit / View / Cues / Tools / Help menus. Menu commands route to existing DOM controls or switch workspaces; they never run GO.
- Compact cue-editor transport, generous cue-list width and contextual inspector.
- Larger GO and STOP ALL AUDIO controls in Operation.
- Independent scrolling for cue list and inspector, responsive design and reduced-motion support.
- EN/ES menu labels based on the existing language selector, without changing script content or project data.
- Explicit resource allowlist entries on the local development server.
- Static integration tests and new browser smoke assertions for safe navigation.

## How to run

```bash
npm run check:syntax
npm test
npm run dev
```

Then open the loopback address printed by the server. No new npm dependency is required.

## Intentional limits

- Visual CSS and menu forwarding only. Not a new audio engine, native app, hardware controller, live mode, independent monitor bus or expanded cue schema.
- Existing IDs, event listeners, GO/STOP semantics, model safety checks and archive contracts remain intact.
- Menu shortcuts deliberately exclude GO, emergency-stop aliases and other implicit transport actions.
- The underlying prototype may still have feature gaps; styling must not imply otherwise.
- Accessibility and all target viewport checks still require actual browser/manual testing. Automated smoke is a regression guard, not visual sign-off.

## Operator journeys to verify

1. Start in Home; open the original audio demo, then enter Cue Editor from the left rail.
2. Inspect a cue and search the script; confirm the prepared cue does not change and no playback occurs.
3. Use File to save JSON and a complete ZIP; verify existing buttons and menu entries do the same.
4. Inspect Audio and AI workspaces; verify local audio and explicit human review remain separate.
5. Enter Operation; verify GO and STOP ALL AUDIO are clearly distinguished and reachable.
6. Switch EN/ES; the application menu updates without modifying the imported script.
7. Repeat at 1366×768, 1093×614, 1920×1080 and Windows scaling 125%, with keyboard navigation.

## Next iteration

After visual acceptance, implement inspector tabs and dense row interactions as a separate incremental PR. Avoid bundling renderer and engine changes with purely visual review.
