# RunQ AI Studio V3 — functional integration

Status: experimental feature branch, not yet merged or validated for live use.

## Workflows now wired

- Script -> sound -> cue: choose a real proposal, transfer original Lxx and editable prompt into Sound Design without starting generation; after listening and accepting verified WAV, create a cue and its first PLAY track from that same screen.
- Script -> cue -> sound: the already-approved cue can be chosen as target, with explicit Add or Replace and a named track.
- Independent sound -> library or cue: start with local WAV, or explicitly authorize a generated SFX request, then decide library only / new cue / existing cue.
- Recovery: imported WAV is retained in the show library if its cue assignment fails. Reuse its asset ID; never reissue a paid request for the same sound.
- Audio IN/OUT reviewed region becomes non-destructive per-cue playback trim where supported by the actual current engine. Original WAV remains unchanged.

## Real components reused

The old Sound Lab's genuine SFX provider journal, authorization confirmation, generation status, checksum verification, human review, Web Audio waveform and audition are unchanged. Only the human-selected destination is passed through to existing import logic; all cue mutations run through a pure validated project update. All operator transport remains independently owned.

The user may inspect and reject a proposed cue, correct its prompt, generate a new single take with explicit authorization, keep audio in library, create a cue after sound, or return to Script. No navigation or acceptance changes NEXT GO or starts playback.

## Limitations (do not hide)

- The V3 prototype's A/B comparison and durable library of multiple generated takes have not yet been fully integrated; existing job lookup is by ID.
- Independent headphone prelisten is not available. Audition uses system default output.
- Sound generation from a scriptless manual source depends on the currently configured provider accepting a null sourceLineId; never fabricate L1.
- The interface does not run an inference on page load, and the browser demo does not certify hardware output.
- Do not count prototype synthetic audio as provider-generated audio.
- Tested branch retains current project JSON, cue model, manual audio operation and ZIP import/export. Physical Windows acceptance remains necessary.

## Implementation map

- src/ui/ai-studio-v3.mjs — contextual source selection, destinations, view continuity.
- src/ui/ai-studio-v3.css — three-pane Stagecraft sound workbench with genuine waveform and an inline destination panel.
- src/core/aiStudioDestinations.mjs — pure library/new/existing cue assignment and selected track region.
- src/ui/app.mjs — read-only project snapshot, real proposal to Sound Design, reviewed/local WAV import bridge.
- src/sfx/lab.mjs — passes the chosen destination to approved import without touching paid job authorization.
- test/aiStudioDestinations.test.mjs — pure roundtrips, target identity and invalid states.
- tools/browser-e2e.mjs — local sound -> cue after sound; no model request and no unintended GO.

## Operator acceptance checklist

1. The script proposal retains exact Lxx; create cue only after sound if desired.
2. A generated WAV is locally accepted, hash-verified and imported before any cue assignment.
3. Switching scenes or projects never silently changes a destination cue.
4. Failed assignment leaves the accepted WAV available, with a safe retry path.
5. Add and Replace apply only to the exact cue/action selected, never current NEXT GO.
6. The complete show ZIP retains imported WAV and its per-track playback settings.
7. Verify browser UI at 1366x768 and 1093x614, English/Spanish, keyboard focus.
8. Verify real audio at conservative levels on Windows separately from CI.

## Safe preview on Windows

PowerShell in your current repository:

    git fetch origin
    git worktree add --detach ..\runq-ai-studio-v3-test origin/feat/runq-ai-studio-dual-entry-functional-2026-10-28
    cd ..\runq-ai-studio-v3-test
    $env:PORT=5182
    npm run dev

Open http://127.0.0.1:5182, then AI & Review or Sound Lab. Opening either view makes no billable requests.

This is original public-safe product documentation with no competitor or predecessor repository references.
