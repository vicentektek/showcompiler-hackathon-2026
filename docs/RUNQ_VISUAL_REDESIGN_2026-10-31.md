# RUNQ: progressive visual redesign

## Scope and evidence

The operator requested a modern redesign based on three supplied references:
a backstage image, a project launcher and a RUNQ visual identity board.
This implementation uses the supplied backstage image and existing RUNQ logos.
It does not generate promotional images or copy fictional shows from the mockup.

Starting checkout: `feat/runq-ai-campaign-100-2026-10-31`,
HEAD `5fdb4d1b5cd3f4fd5ca65771ca822b18d1731ad1`. There is no active PR;
no PR base, remote CI result, merge or release is claimed. The related
`feat/runq-hero-operator-integration-2026-10-31` and
`feat/runq-interface-rework-2026-10-31` heads were inspected; they add no
missing implementation relative to this checkout. Existing campaign edits
remain untouched.

## Design assessment

- The reference gives Project a clear purpose: start, import, restore or try.
  The previous implementation instead spent three horizontal strips on chrome.
- A theatrical backdrop, off-white typography and sage accents communicate
  the product more clearly than another generic dark dashboard.
- RUNQ AI should be an explicit creative destination, not two small duplicate
  header buttons. Its entry must not itself call a model or apply a proposal.
- File export is a project action, not a permanent primary action beside panic.
- STOP ALL is operational safety, not branding. It cannot disappear while
  audio is active or waiting for asynchronous resume.

## Delivered phases

1. **Project launcher:** supplied backstage backdrop, large wordmark, four
   original functional actions, ordered New / Import TXT / Open ZIP / Demo.
   The active-project card reports actual cue and ready-audio counts.
2. **Navigation hierarchy:** one main header, highlighted RUNQ AI tab,
   gear-icon **Settings / Ajustes** action immediately beside the locale
   selector, and a secondary Menu containing the original application
   menus. Narrow windows wrap the main navigation into a second row and allow
   horizontal scrolling rather than removing destinations.
3. **AI destination:** prominent home CTA and creative welcome explaining
   Propose / Review / Approve. The original conversation, contextual data,
   permissions, proposal review and undo controls remain in place. The
   contextual Studio agent remains accessible in the editor toolbar, rather
   than repeating the primary AI destination in the global header.
4. **Context and polish:** complete ZIP export moves to the active project
   and remains available through Menu > File everywhere. STOP ALL remains in
   Studio, Rehearsal and Live, and appears on any other screen while a cue,
   audition or pending audio operation exists. Responsive cards, keyboard
   focus and reduced-motion behavior are covered.

Presentation is integrated into the existing interface composition and brand
stylesheet rather than adding a framework or another stylesheet layer.
The read-only presentation bridge exposes existing audio status; the redesign
does not introduce a transport, change project JSON, touch source references,
modify prompts or add provider requests.

## Acceptance and verification

Run `npm run test:interface`, `npm run check:syntax` and `npm test`.
Browser acceptance is offline, uses mock Web Audio, blocks provider traffic
and checks:

- actual loading of the backdrop and logos, not just image elements;
- home and AI entry, four real actions and contextual export;
- all nine workspaces at 1920, 1440, 1093 and 768 pixels;
- a usable home CTA and no horizontal page overflow at 390 pixels;
- unchanged original script and prepared NEXT after AI navigation;
- STOP ALL available during active and pending audition outside Studio;
- late audio resume fenced after STOP ALL;
- existing pane resizing, editing, library, Setup, GO and audition behavior;
- English/Spanish switching with no page errors or provider submissions.

Local screenshots are written under `artifacts/interface-review/`; they are
not release artifacts or proof of real speaker output.

### Observed results

- `npm run check:syntax`: passed.
- `npm test`: 719 passed, 0 failed, 0 skipped in the final run. This is the
  whole current working tree, including concurrent, unrelated campaign work;
  the redesign does not claim authorship of those tests.
- `npm run test:interface`: passed all workspace/size, image, export, NEXT,
  active/pending audition and locale checks.
- `npm run test:ai-review`: passed offline loading/error, selected operations,
  approval/undo and source/audio context checks.
- `node tools/runq-agent-browser-e2e.mjs`: passed retained contextual agent
  access, one-shot mocked consent and Studio/Stage isolation.
- `node tools/browser-e2e.mjs`: passed original transport, complete ZIP
  download/reopen, tampered ZIP rollback and Spanish menu.
- `npm run test:last-go`: passed the original TXT/WAV show, contextual agent,
  ZIP/JSON export and reopen, independent STOP and manual Live GO.
- `git diff --check`: passed. No remote CI was requested or run.

### Changed implementation surfaces

- [Interface composition](../src/ui/runq-interface.mjs) and
  [brand stylesheet](../src/ui/runq-brand.css).
- [Read-only UI state bridge](../src/ui/app.mjs) and
  [agent presentation](../src/ui/runq-agent-ui.mjs).
- [Supplied backdrop](../assets/runq-backstage.png) and its
  [server-public allowlist](../tools/dev-server.mjs). The existing Windows
  package builder reads this allowlist, so no duplicate packaging manifest
  or new native release was introduced.
- [HTTP contract test](../test/browserPrototype.test.mjs),
  [interface acceptance](../tools/interface-browser-e2e.mjs),
  [AI review acceptance](../tools/ai-review-browser-e2e.mjs),
  [original browser smoke](../tools/browser-e2e.mjs) and
  [complete-show acceptance](../tools/last-go-browser-e2e.mjs).
- [Local startup documentation](../README.md) and this plan.

## Deliberately deferred

- Persistent recent-project thumbnails/search require a real local storage
  and recovery design. The mockup's fictional projects are not displayed.
- Tutorials and documentation shortcuts should only be added when their
  actual destinations and content exist.
- Real microphone, speaker output, hardware routing and live-show usability
  still require operator acceptance. AI quality is not measured by UI tests.
- No dependencies, native packaging, paid experiment, commit, push, public
  PR or merge is part of this task.

Already-running development servers cache the static allowlist. Restart the
chosen server after this change to publish the new backdrop; refreshing a
browser alone does not update that server's manifest.
