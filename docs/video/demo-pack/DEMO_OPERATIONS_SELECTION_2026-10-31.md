# RUNQ · Selección definitiva de operaciones para el vídeo técnico (revisión de código)

**Estado:** decisión de preproducción; **NO** indica que se hayan superado pruebas de ASR con micrófono real. Se revisó la rama `integration/runq-demo-2026-10-30` con sus implementaciones de V15. La captura final sigue supeditada a UI aprobada y a build fija.

## Conclusión ejecutiva

**No grabar los 17 comandos de operador para el vídeo principal.** Seleccionar UN cambio de cue con voz, UNA corrección contextual opcional, un análisis Meta real con revisión, una demostración convincente de pie Auto GO + salto, y cierre manual de operación. Esta secuencia minimiza riesgos de ASR, evita funciones sin soporte y demuestra IA + criterio humano + audio real.

En una presentación de 3 minutos el presupuesto de tiempo es limitado; una segunda orden de voz exige otro ciclo de micrófono, transcripción con autorización, vista previa y comprobación. Preferir un solo ciclo inequívoco de voz y utilizar la corrección como toma de respaldo o versión extendida si el tiempo no permite dos.

## Evidencia de implementación revisada

- **Dictado de edición ya implementado:** `src/ui/cue-conversation-ui.mjs` tiene `rqChatRecord` (grabación <=10 s), `rqChatVoiceConsent`, `rqChatTranscribe`, `/api/voice/transcribe`, texto editable, `rqChatSubmit` (proponer), `rqChatApply` (aplicar) y `rqChatUndo` (deshacer con botón). **No** interpreta sonido sin la transcripción/autorización ni aplica automáticamente.
- **Parser gratuito y controlado:** `src/core/cueConversation.mjs` reconoce patrones ingleses `fade in`, `fade out`, `enable loop`/`disable loop`, ganancia cuando se expresa **numéricamente en dB**, y correcciones `make it <value> seconds` usando `lastField`. Tests: `test/cueConversation.test.mjs` cubre explícitamente `Set fade out to 2 seconds`, así como fade in y corrección conversacional en español. El inglés de las frases seleccionadas se deriva del mismo parser; **no hay una prueba ASR real**.
- **Agente global principalmente textual:** `src/ui/runq-agent-ui.mjs` presenta entrada por `rqAgentPrompt` y revisión de plan; `src/core/agentIntent.mjs` acepta comandos muy concretos como `Move cue 3 before cue 2`, `Add 2 empty cues at the end`, `Audit the show`. No afirmar que el micro del editor es una interfaz de voz del agente global.
- **Pies reales en Ensayo:** `src/ui/voice-live-ui.mjs` obtiene micrófono y transcripción; `src/ui/rehearsal-auto-ui.mjs` arma tras consentimiento y `window.confirm`; `src/core/rehearsalAutopilot.mjs` evalúa finales, saltos/retrocesos y cooldown. Tests deterministas no demuestran éxito de los WAV naturales ni de voz virtual en la máquina.
- **Transporte:** seleccionar ≠ preparar NEXT ≠ GO; STOP ALL debe ser manual y observable en vídeo. Ni modelo ni Playwright deben pasar por encima de la autorización real.

## Recomendación priorizada

La columna **Probabilidad relativa** es criterio profesional de previsibilidad a partir del código, **NO porcentaje de éxito medido**.

| Prioridad | Acción | Probabilidad relativa | Valor para el jurado | Decisión |
|---|---|---|---|---|
| P0 | Importar TXT original → Muse Spark propone audio referenciado a L# → aceptar/rechazar | Alta en UI; inferencia real condicionada | Muy alto: Meta AI y revisión humana | **Incluir**, llamada autorizada y capturada de verdad |
| P0 | Voz del operador cambia `fadeInMs` del Q01 | Alta una vez transcrito el inglés exacto | Alto: voz + edición conversacional + diff | **Incluir** |
| P0 | Actor dice pie L6 → Q01 suena tras ARM explícito | Media hasta validación real ASR | Máximo: diferenciación del producto | **Incluir si pasa prueba real** |
| P0 | Salto L6 → L23, sin Q02 intermedio | Media hasta prueba ASR, exige frase prácticamente exacta | Muy alto: ensayo no lineal | **Incluir si pasa prueba real** |
| P0 | NEXT → GO → STOP ALL manuales | Alta en ruta local preparada | Alto: control humano/seguridad | **Incluir** |
| P1 | Voz `Make it four seconds` corrige el fade anterior | Media-alta: parser con `lastField` y dos transcripciones | Alto, pero requiere tiempo de dos turnos | **Toma extra opcional**, no bloquear el vídeo |
| P1 | Loop on/off mediante voz | Alta una vez transcrito; posibles incompatibilidades con fade out | Medio | Solo clip complementario, otro cue sin fade-out incompatible |
| P1 | Añadir 2 cues vacíos al final por agente textual | Alta con frase exacta, pero altera la secuencia | Medio | Clip alternativo en COPIA del show, sin contaminar la demo vocal |
| P2 | Mover/borrar/renombrar cues mediante voz | Dependencia del agente externo e integración de dictado no acreditada | Medio | **Excluir vídeo principal** |
| P2 | GO/NEXT/STOP ALL **hablados** | Soporte seguro real de comandos no acreditado | Alto si existiese | **Excluir**, demostrar controles manuales reales |
| P2 | Generación SFX Modal durante rodaje | Coste/estado/política no resueltos | Medio-alto | Usar WAV original y demostrar generación solo si ya hay captura real autorizada |

## Única orden principal de operador a producir

**Take: `operator/hero_01_fade_in.wav`**

**Texto literal (INGLÉS, sin prefijo RUNQ):**

> Set the fade in to three seconds.

**Por qué esta y no otras:** vocabulario simple, una magnitud numérica, parser local de `fadeInMs` (3000), campo visible en inspector, no necesita generar audio ni plan multicue ni consumir una solicitud adicional a Muse Spark *para interpretar* el texto. **La transcripción de voz sí requiere petición real a Muse Voice y consentimiento por grabación.**

**Preparación:** seleccionar Q01 (atmósfera, ~7 s); detener todo; confirmar que está DRAFT y su editor disponible; inglés activo. Abrir cue editor conversacional; grabar <10 s por entrada virtual; detener; autorizar transcripción; verificar `Set the fade in to three seconds` como texto reconocido. Pulsar `Propose changes` (parser local, sin inferencia generativa), capturar comparación real `Fade in 0.0 s → 3.0 s`, pulsar `Apply changes`. Demostrar brevemente su efecto con reproducción real si sobra tiempo.

**No** dejar una edición sin aplicar y cambiar de cue. No simular en post un valor. Un error de ASR no debe corregirse silenciosamente para fingir éxito; si el operador corrige texto manualmente, decir `dictated then reviewed/corrected` o usar toma de teclado.

## Corrección conversacional opcional de segundo turno

**Take: `operator/hero_02_correction.wav`**

> Make it four seconds.

Después de `Propose changes` del primer turno y **ANTES de `Apply changes`**, grabar esta frase en el mismo editor, con el mismo cue seleccionado. Si Muse transcribe exactamente y `lastField === fadeInMs`, el parser debe conservar el campo y generar una propuesta revisada de **4.0 s**. Este comportamiento se deriva de `parseLocalCueChat` y del merge de cambios pendientes en `src/ui/cue-conversation-ui.mjs`; en los tests hay precedente de corrección conversacional (ES). La comprobación real EN + ASR sigue pendiente. Evitar `Actually, make it four seconds` porque la sintaxis de corrección local no cubre con seguridad la coma seguida de `make it`.

El cambio más impresionante es una corrección antes de aprobar, pero el vídeo solo la incorpora si no alarga más que la escena disponible y la captura real pasa.

## Clip de edición sin voz si falla la transcripción

Una pantalla captura el editor de Q01. Escribir el mismo texto `Set the fade in to three seconds`, pulsar `Propose changes`, mostrar diff y `Apply changes`. No anunciar `voice editing`, decir `conversational cue editing`. La locución puede indicar que RUNQ permite preparar ajustes sin tocar el transporte; la captura es auténtica.

## Plan final recomendado para montaje 03:00 (pendiente de reglas)

| Tramo | Tiempo | Operación observable |
|---|---|---|
| 00:00–00:20 | 20 s | Problema y apertura rápida RUNQ; narrador |
| 00:20–00:45 | 25 s | Importación TXT original y líneas L# |
| 00:45–01:10 | 25 s | Análisis Meta real, propuestas, aceptación de una y rechazo de otra (si devuelve ambas); la fuente exacta |
| 01:10–01:30 | 20 s | Adjuntar WAV original, preescuchar, onda/editor; **audio auténtico** |
| 01:30–01:55 | 25 s | **Voz del operador**: seleccionar Q01, grabar orden, transcribir, mostrar diff, aceptar |
| 01:55–02:35 | 40 s | **Voces de actores**: micro EN, ARM, pie L6 y Auto GO; corte **rotulado** a salto L6→L23 (solo si se verifica), sin narrador encima |
| 02:35–02:50 | 15 s | Modo Directo: NEXT, GO, STOP ALL manuales |
| 02:50–03:00 | 10 s | Conclusión, pantallas auténticas y marca |

**Si los ciclos de voz son más lentos**, acortar S01/S02 y quitar edición opcional, no acelerar ASR ni fabricar estado. Conservar original de cada master de voz íntegro y etiquetar los cortes `TAKE 1`, `TAKE 2`.

## Pruebas de pregrabación mínimas (con 3 pasadas por caso)

- **Editor local:** verificar parser de `Set the fade in to three seconds` y `Make it four seconds`, siempre con cue Q01; comprobar que la transcripción de voz que produce Muse llega al campo correcto y que no hay inferencia pagada inesperada. Mostrar consentimiento y aprobación.
- **Actor primera frase:** cada WAV real L6 produce Q01 con ARM; en OFF no produce nada.
- **Salto:** L6→L23 con dos finales distintos; Q02 no se ejecuta. Si falla, usar secuencia lineal L6→L14 en la hero shot y reservar salto para clip aparte de investigación, sin afirmar éxito.
- **Directo:** seleccionar solo no hace GO; Set NEXT no hace GO; GO sí; STOP ALL detiene y desarma según corresponda.
- **Meta:** una solicitud real autorizada dentro de política de coste; verificar evidencia L# auténtica y no atribuir fixture manual a IA.

**Gate:** no se considera aprobada ninguna operación por el número de tests unitarios si falla en la aplicación de rodaje. Mantener `production/reports` privados y fuera de Git; registrar commit, dispositivo, WAV de entrada, transcripción final, resultado y vídeo master.

## Biblioteca de órdenes recomendadas

### Mantener para casting inmediato
1. `Set the fade in to three seconds.`
2. `Make it four seconds.` (solo opcional)
3. `Set fade out to two seconds.` (alternativa por fallo del primer comando)

### Mantener únicamente para demo extendida o QA
4. `Enable loop.` (solo cue compatible)
5. `Disable loop.`
6. `Set gain to minus six decibels.` **NO fiable para parser local** si ASR escribe palabras en vez de `-6 dB`.
7. `Move cue three before cue two.` **TEXTO AGENTE GLOBAL, no voz demostrada**.
8. `Add two empty cues at the end.` **TEXTO AGENTE GLOBAL, no voz demostrada**.

### No grabar por ahora
`Create a new audio cue after cue three`, `Rename this cue to Thunderstorm`, `Undo that change` (por voz), `Go`, `Stop all` (por voz). Estas frases pertenecían a la lluvia de ideas anterior pero no tienen una cadena end-to-end de voz de operador corroborada en la versión revisada.

**Racional final:** valor convincente para jurado = **IA crea una propuesta con evidencia**, **humano la aprueba**, **técnico ajusta un cue hablando**, **actor dispara sonido real mediante el pie**, **ensayo salta**, **operador conserva control manual**. Mostrar una sola cadena completa vale más que enumerar diez funciones no verificadas.
