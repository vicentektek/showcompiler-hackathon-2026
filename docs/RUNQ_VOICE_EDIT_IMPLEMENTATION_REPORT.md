# RUNQ — Edición conversacional de cues por voz: informe de implementación

Rama: `feature/voice-cue-editing` (desde `integration/runq-qa-visual-2026-10-30`). Sin commit, push ni merge. Sin peticiones de pago.

## 1. Auditoría de dependencias (estado real previo)

Cadena: captura de micrófono → WAV PCM16 → `POST /api/voice/transcribe` (`tools/voiceTranscribeRoutes.mjs`, consentimiento obligatorio, 0,2–10,5 s, una petición activa) → texto → `agentDialogue`/`agentIntent` (local) o proveedor IA → `prepareAgentPlan` → evento `runq:agent-apply` en `app.mjs` (con `safeAgentEditState`) → `runq:agent-undo`.

Había dos grabadores independientes (`voice-microphone-test.mjs`, `cue-conversation-ui.mjs`) y el modo en vivo/Autopiloto, todos coordinados con el bloqueo `document.body.dataset.runqVoiceCapture`. No se modificaron `voice-live-ui`, `voice-follow-*`, `voiceFollow.mjs` ni el Autopiloto.

## 2. Diseño

- `src/core/voiceEditCommand.mjs` (puro): normaliza transcripciones, clasifica, rechaza transporte/inyección/ruido/exceso de longitud (`VOICE_TRANSPORT_REJECTED`, `VOICE_INJECTION_REJECTED`, `VOICE_UNINTELLIGIBLE`, `VOICE_TOO_LONG`), delega en el motor existente de texto (sin duplicarlo), nunca aplica. Máquina de estados `idle→recording→recorded→transcribing→review→preview` e historial acotado (20).
- `src/core/wavEncode.mjs`: codificador WAV compartido.
- `src/ui/runq-agent-ui.mjs`: una sola caja de instrucciones (texto + voz): mantener para hablar, transcripción editable, consentimiento, vista previa, aplicar/cancelar/deshacer, historial. El lock de captura usa `agent-voice` y respeta el existente.
- Aislamiento: el módulo no importa ni emite eventos de GO/STOP, voice-follow ni Autopiloto (test por inspección del código fuente). Las frases de transporte por voz se rechazan sin cambios.

## 3. Fallos deterministas corregidos (con test de regresión)

1. «Crea un cue llamado X» caía en CLARIFY por el flujo de añadir cues → `namedCue` en `agentDialogue.mjs`.
2. «Show summary» caía en NEEDS_AI → regex de resumen en `agentIntent.mjs`.

## 4. Resultados (SIMULADO / OFFLINE, semilla 20261101)

| Comando | Resultado |
|---|---|
| `npm run check:syntax` | 219 módulos OK |
| `npm test` | 670/670 |
| `npm run qa:voice:campaign` | 500/500 (voz 285, texto 215; ES 253, EN 247) |
| `npm run qa:ai:campaign` | 8/8 gates; masa 2400/2400; pagos 0 |
| E2E Chrome (Playwright transitorio) | ok, 0 errores de consola, 0 peticiones remotas |

Categorías (todas 100 %): create-named 50, delete 50, reorder 50, update-playback 60, add-ending 40, query 40, transport-safety 60, injection-negation 40, invalid-target 40, acoustic 70. Tamaños de show 3–85 cues. Latencia local p50 ≈ 3 ms, p95 ≈ 7–10 ms. Coste 0.

La primera ejecución dio 495/500 (5 «Show summary»), corregidos. Se evalúa el proyecto resultante (borrado, orden, campos, NOOP sin cambios, undo restaura, la propuesta no muta, estados de cue intactos, sin upstream sin consentimiento).

## 5. Limitaciones (no inferir calidad real)

- El reconocedor es un **mock** (devuelve la transcripción guionizada si el RMS > 0,003): mide el pipeline RUNQ, no el ASR de Meta.
- Solo 314 frases distintas de 500 casos; plantillas que el parser local entiende → es control de contrato/regresión, no calidad artística ni de IA.
- Casos «noisy» aceptan `exact_or_noop`.
- Etiquetas con «stop/go» (p. ej. «Stop motion») se rechazan por voz; usar texto.
- Números hablados hasta 15 (ES)/12 (EN).

## 6. No verificado

Micrófono real y navegadores distintos de Chrome, ASR live, ruido/acentos reales, latencias reales, IA live (requiere autorización explícita y gasto), pruebas con operadores humanos, i18n dinámico del bloque de voz, CSS específico (el bloque usa estilos genéricos; revisión visual solo a 1440×900), 1920×1080.

## 7. Riesgos y próximas pruebas

1. Lote live acotado de ASR (≈30 grabaciones reales ES/EN) con autorización.
2. Pruebas con ruido de sala y varios micrófonos.
3. Ampliar vocabulario (mayor variedad de frases, más de 500 únicas).
4. Pulido visual y i18n del bloque de voz.
5. Prueba de interferencia con Autopiloto/voz en vivo en un ensayo real.

Artefactos locales (no versionados): `artifacts/voice-edit-campaign/{cases.csv,summary.json,agent-voice-drawer-1440x900.png}`.
