# RUNQ — Audio prompt replacement: implementation specification

## Product contract
RUNQ does **not** synthesize audio internally in the hackathon submission. It helps design an appropriate sound, provides a copyable prompt for an external generator, and imports user-provided files for cue playback.

## User journey
1. In Script, Cue Editor or Sound Library, user chooses **Suggest sound / Sugerir sonido**.
2. RUNQ uses available script/cue context to return a textual recommendation.
3. Review panel shows type, dramatic purpose, descriptive prompt, suggested duration, mood, acoustic setting, onset/ending and optional negative prompt.
4. User may edit the text and press **Copy prompt / Copiar prompt**.
5. User obtains audio externally (outside RUNQ) and selects **Import audio / Importar audio**.
6. Imported audio is assigned to the selected cue; existing edit/playback behavior is unchanged.

## Suggested structured output
```json
{
  "cueId": "optional",
  "scriptReference": "Lxx",
  "category": "ambience | effect | transition | music_reference | other",
  "purpose": "brief dramatic justification",
  "prompt": "clear standalone external-audio prompt",
  "negativePrompt": "optional unwanted characteristics",
  "durationSeconds": 8,
  "loopSuggested": false,
  "fadeInSeconds": 0,
  "fadeOutSeconds": 1,
  "language": "en"
}
```
Treat durations as suggestions, not measured audio properties. Do not silently create a playable cue from a prompt alone.

## UI states
- No cue selected: explain how to select a cue or script passage.
- Generating text: loading/cancel only for actual text-generation request.
- Suggestion ready: edit, copy, regenerate text, import audio.
- Missing Meta credentials: explain unavailable AI text request; do not imply local sound synthesis.
- Copy failure: selectable prompt remains visible.
- Missing imported file: show relink/replace.
- Rejected suggestion: leave cue and assets unchanged.

## Technical boundaries
- Feature-flag or remove audio-generation entry points from navigation, including whole-show preparation, retries and indirect assistants.
- Backend must reject outbound audio-synthesis requests from the final demo flows. Test with a network spy/mock that no Modal calls occur.
- Preserve playback engine, import, ZIP portability, waveform, cue editing and STOP controls.
- Preserve provider secrets outside client code; never expose API keys.
- Keep bilingual ES/EN labels and user prompts.
- Do not delete Modal integration history or code without dependency mapping; code may be disabled safely before later cleanup.

## Acceptance tests
1. Script selection -> sound suggestion -> editable/copyable text.
2. Cue selection -> suggestion -> import -> assign -> GO -> STOP.
3. Whole-show preparation generates no Modal request.
4. Old generate/retry buttons absent or intentionally disabled with clear explanation.
5. Offline project remains usable with previously imported audio.
6. Errors and cancellation never interrupt existing playback.
7. No sound generation claims remain in submitted README, demo, overview, setup and provider descriptions.
