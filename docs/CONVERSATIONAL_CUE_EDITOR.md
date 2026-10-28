# RunQ — Conversational Cue Editor (2026-10-28)

## Purpose

The operator can describe edits to **one selected cue** in conversational Spanish or English. The new editor is an optional contextual drawer in Cue Editor. It is deliberately isolated from rehearsal voice-follow and from the Operation GO transport.

## Available now

- Select cue → **Editar conversando / Edit with AI**.
- Type an instruction such as `Pon un fade in de 3 segundos y volumen a -9 dB`.
- A free local interpreter handles unambiguous volume in dB, fade in/out, start delay and loop on/off. For more complex instructions, the operator can explicitly opt in to **one Muse Spark request**. No automatic retry.
- Structured model outputs are checked against a fixed allowlist: gain dB, fade in/out, start delay, trim IN/OUT, rate, pan, loop, repetitions, label, spoken trigger, notes. Existing RunQ validators still enforce all ranges and loop/fade incompatibilities.
- The assistant produces a *staged* before/after diff. No project mutation occurs until the operator clicks **Apply changes**.
- A correction like `Mejor que sean cuatro segundos` updates the proposal while retaining earlier pending edits. **Discard** cancels the proposal. **Undo** restores the last applied snapshot if nobody else modified the show.
- Optional **Muse Voice dictation** records at most 10 seconds locally. Upload for transcription requires a separate one-shot explicit consent. The transcript lands in the prompt editor; it never automatically submits an edit.
- Text and dictation language follow the currently selected interface (ES/EN), independent of rehearsal voice-follow.
- The server keeps `MODEL_API_KEY`; the model sees only the selected cue's editable properties and the current text request, never the entire project, media files or credentials.
- Unsafe situations (audition/GO/active audio, unsaved manual inspector changes, changed project or selection, invalid model values) reject the apply operation.

## Scope limits

This first version edits one cue at a time. Bulk edits, cue creation, audio generation, stop-other relationships and advanced orchestration still belong to subsequent stages. AI changes are neither silently applied nor fired. Automatic GO in rehearsal remains on its independent, saved stable branch `stable/voice-autopilot-2026-10-28`.

### How to try

1. Start the latest feature branch, open a show with editable audio cues, enter **Cue Editor** and select a cue.
2. Click **Editar conversando** on the inspector.
3. Write `Pon un fade in de 3 segundos y volumen a -9 dB`. Review the diff; request `Mejor que sean cuatro segundos` to revise, then **Apply**.
4. Inspect the existing cue audio editor values. Click **Undo** if desired.
5. For a more complex instruction, enable the explicit Meta consent, send and check the proposal. There are no silent paid requests.
6. For speech, expand **Dictado opcional**, record, stop, explicitly authorize one upload and click **Transcribir grabación**. Review recognized text before submitting.

## Quality gates

- Offline unit: property staging, corrections, validation, preservation of source references and sound asset links.
- Local HTTP mocked model: consent and same-origin, secret isolation, strict schema, no unapproved action and no retries.
- Chrome E2E: free instruction → staged diff → correction → operator apply → undo → no audio GO.
- Real model inference and real microphone must be checked on Windows. No mocked provider test proves recognition quality or conversational model accuracy.

## Next work

Improve interpretation when users ask for group changes, multiple selected cues and conditional STOP/fade logic. Add a snapshot-safe multi-cue transaction, independent preview of the proposed sound without touching the live queue, and corpus-driven mass testing of ES/EN corrections, ambiguity and hallucination rates.
