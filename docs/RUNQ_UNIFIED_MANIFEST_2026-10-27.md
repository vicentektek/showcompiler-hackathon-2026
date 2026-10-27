# RunQ unified candidate — integration manifest (27 Oct 2026)

## Purpose
A single **testable candidate**, based on the current advanced RunQ browser workspaces and AI code, plus independent manual cue authoring. This is a new feature branch, not a merge to `main`. The operator owns the cue list: AI is optional.

## Source lineages
- PR #22: safe manual transport, cancelled pending GO, self-contained ZIP + demo
- PRs #23–25: workspaces, single NEXT GO, STOP ALL emergency, real audio properties
- PRs #27–30 and #32: dense modern RunQ editor, independent selection, media/script/AI layout, playable multi-asset tracks
- PR #29: target-cue fades on manual GO and sound replacement inside cue inspector
- PRs #34–35: creative analysis modes, visible bounded model progress, advisory genre and document-type context
- PR #33: fully manual cue sequence actions added/integrated into this candidate
- PR #26: non-executable event interpretation research is **not yet integrated**; assess its schema separately, do not claim it is included.

## Included operator actions
- Add, insert after selected, duplicate, move up/down, delete, edit description and assign audio
- Manual cues have `origin: MANUAL`, may exist without any script, evidence or source proposal
- AI-origin cues retain strict approved proposal evidence and source line references
- Duplicate of an AI-origin cue is an independently editable manual copy
- Targeted stop references are sanitized if a cue is removed
- Structural operations refuse to modify while sound or pending transport operations are active
- Cue position returns to the first on structural edits; this is a safe, documented limitation, not a live resequencing feature

## Audio and model boundary
- Explicit GO, STOP, FADE, emergency STOP ALL; per-cue sound properties and multiple additional audio tracks
- Operator-managed target STOP/FADE transitions
- Project JSON / complete-show ZIP remains compatible with older show schema-v1
- Creative Meta analysis stays opt-in, bounded, with progress and human review. No AI on GO.
- Desktop/native audio routing, independent PFL, autonomous follow and professional hardware testing remain out of scope

## Acceptance gates
1. Offline Node test suite, syntax, ZIP integrity and headless Chrome smoke
2. Chrome test that executes both creative Meta UI (mocked) and empty-manual-show operations in one session
3. Windows/Chrome manual audition: 2 tracks, fades, loops, STOP ALL and ZIP roundtrip
4. Human review of list density, visible manual buttons, script source navigation, progress indicator and editable audio inspector

No automatic merge to main or claim of real show certification.
