# Cue preparation and operator details — SHOWCOMPILER

## Editing an approved cue

Every approved cue remains anchored to its source script line. The cue card includes **View in script** and **Edit cue**. The edit form can change:

- **Cue label** (up to 200 characters) — the name an operator sees during rehearsal and playback.
- **Operator trigger** (optional, up to 300 characters) — the dialogue line, physical action or stage-management instruction that calls for manual GO.
- **Technical notes** (optional, up to 1,500 characters) — equipment, intended treatment, warnings or rehearsal observations.

Choose **Save cue** to validate and store the changes or **Cancel** to leave the project untouched. Editing does not alter the original script, the AI suggestion, its approval status, the cue number, the audio action or the line references.

Fields are stored within the existing project JSON version 1. Documents without these optional fields remain valid. Saving JSON still does **not** embed WAV/MP3 files, and reopening it requires loading the original audio again.

## Operational boundaries

The trigger is an operator-facing note. It is **not** speech recognition, voice activation, an automatic GO instruction or a timecode event. Technical notes do not generate hardware commands. Playback is exclusively manual in the current browser implementation; every GO still validates a playable local audio resource.

## Acceptance checklist

1. Approve a test proposal and edit the cue label, trigger and notes.
2. Save to JSON, reopen, and verify metadata and exact source line IDs.
3. Confirm that original model proposal evidence remains visible, even when the operator renames the cue.
4. Load a compatible local file and verify that edited notes do not trigger audio by themselves.
5. Clear the optional fields, save JSON again and confirm no schema errors.
6. Switch English/Spanish interface and verify the saved trigger text remains in its original language.

No new AI requests or API credits are required for these operations.
