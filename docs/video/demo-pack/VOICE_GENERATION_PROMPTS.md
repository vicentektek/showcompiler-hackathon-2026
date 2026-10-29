# Prompts y protocolo de síntesis de voces · RUNQ video kit

**Objetivo:** voces inglesas pronunciadas correctamente sin que el operador tenga que hablar inglés. Preparar **por escrito** la síntesis TTS, conservar trazabilidad de cada WAV y después reproducirlo por la entrada real de reconocimiento en un ensayo grabado. Este documento **no inicia servicios, no consume créditos, no contiene API keys y no afirma haber generado audios**.

## 1. Elección de herramienta y permisos

**Flujo recomendado:** herramienta TTS con voces inglesas comerciales y exportación WAV (por ejemplo ElevenLabs o Azure Speech Studio, si sus licencias y planes son adecuados). Un editor local (Audacity, REAPER o DaVinci Resolve/Fairlight) se usa para unir archivos, insertar silencios y exportar masters. Se puede utilizar otro motor con derechos equivalentes: las instrucciones son **agnósticas del proveedor**.

No contratar ni ejecutar API por defecto. Verificar por escrito: derechos de uso del audio generado en vídeo público/concurso, reutilización comercial, política de conservación de archivos, precio, exportación y voz sintética permitida. No utilizar voces de celebridades, clones no consentidos ni voces identificables de terceros.

**Especificación de entrega:** TTS sin música ni reverberación; PCM WAV, preferiblemente 48 kHz, 16 o 24-bit, mono (si el proveedor solo exporta MP3, convertir a WAV de trabajo y conservar el original). Grabar el identificador de voz, modelo, idioma, fecha, licencia y versión del texto. Mantener picos sin clipping; no aplicar compresión agresiva ni alterar el pitch del clip para «mejorar» ASR.

Carpetas de producción **locales** sugeridas (no subir binarios hasta verificar derechos): `production/audio/tts/raw/`, `production/audio/tts/takes/`, `production/audio/narrator/`, `production/audio/sfx/`, `production/video/masters/`.

## 2. Prompt MASTER para narrador (copiar y pegar)

> You are the English-language technical narrator for a three-minute product demonstration of RunQ, software for theatre sound cues. Speak in a calm, precise, credible, medium-low voice. Use clear neutral international English with a subtle British influence, not a dramatic trailer voice. Keep a measured pace, around 130 words per minute, with natural sentence breaks and no singsong intonation. Pronounce "RunQ" as "run cue", "cue" as "kyoo", and "Meta Muse Spark" carefully. Stress "The model suggests. The operator decides." Never add words, stage directions, music, sound effects, laughter, breaths for drama, or marketing claims. Record each numbered scene separately, using the exact spoken text from NARRATION_EN_V2.md. Do not read timecodes, scene names, technical notes, or bracketed instructions. Leave at least 200 ms of clean room-tone/silence at the beginning and end for editing.

**Texto fuente para el narrador:** `NARRATION_EN_V2.md` (S01–S07, S09–S11; S08 SILENCIO). Exportar `narrator/S01.wav` ... `S11.wav` excepto S08. No encadenar en una sola generación: así se sincronizan y sustituyen frases de forma independiente.

### Variantes de prueba antes de elegir la voz definitiva

- **A — documental técnico (preferida):** pausada, articulada, sobria; voz masculina o femenina neutral, sin acento regional marcado.
- **B — inglesa cálida:** ligeramente más cercana, ritmo 125 wpm.
- **C — norteamericana neutra:** alternativa por inteligibilidad con público internacional; frases y timings idénticos.

Crear un **sample de 15 segundos**, no producir todas las escenas hasta escoger la voz y confirmar derechos. Preferir consistencia de una sola voz al montaje final.

## 3. Personajes: prompts de identidad vocal

**JAMES (pie Q01, L6)**

> Create a distinct adult male English theatre voice. Neutral contemporary British pronunciation, medium-low pitch, audible consonants, mild apprehension and curiosity. Natural speaking pace about 125–135 words per minute. No shouting, whispering, extra words, music, effects, or exaggerated acting. Keep identical voice identity across all takes. Deliver each exact text as a separate spoken turn.

**MAYA (pie Q02, L14)**

> Create a distinct adult female English theatre stage-manager voice. Neutral contemporary British pronunciation, medium pitch, calm measured authority, a slight sense of urgency. Clear consonants and full words; natural pace about 120–130 wpm. No whispering or effects. Keep the same voice across takes. Read the exact words only.

**ELLA (pie Q03, L23)**

> Create a distinct adult female English theatre voice, lighter and warmer than Maya, neutral British pronunciation. Intelligent, lively, gently ironic, with clear diction at 125–140 wpm. Avoid overacting or clipping the beginning of sentences. Same voice identity across takes. Read only the provided dialogue.

**DIRECTOR / ensayo fuera de escena**

> A fourth voice, clearly distinguishable from James, Maya and Ella. Adult neutral English, brief practical rehearsal instructions, conversational and untheatrical. Do not sound like a virtual assistant or command system. Read only the supplied rehearsal notes. These are *not* transport commands for RunQ.

**Criterio:** conservar el mismo voice ID o preset por personaje; no introducir una identidad de voz nueva entre una repetición y la primera toma. Las cuatro voces deben sonar como personas distintas, aunque todas sean sintéticas.

## 4. Banco exacto de pies (generar individualmente)

### James / L6 / Q01

**Audio literal:**

> Listen carefully. The theatre is holding its breath.

**Archivo:** `raw/james_l06.wav`. Crear opcionalmente una segunda toma `james_l06_repeat.wav` con pausas apenas distintas, **sin alterar las palabras**.

### Maya / L14 / Q02

**Audio literal:**

> When the clock strikes once, open the envelope.

**Archivo:** `raw/maya_l14.wav`. Repetición: `maya_l14_repeat.wav` como una GENERACIÓN o lectura diferente, manteniendo el texto literal.

### Ella / L23 / Q03

**Audio literal:**

> When the red light comes on, we make our choice.

**Archivo:** `raw/ella_l23.wav`.

## 5. Banco de diálogos secundarios (para escena completa)

Generar un WAV por línea, para poder reordenar sin alterar la voz original. El campo `L#` es el del TXT importado.

| L# | Voz | Texto exacto |
|---|---|---|
| L5 | Ella | There is still time to change our minds. |
| L8 | Ella | You say that every time the room gets quiet. |
| L9 | Maya | I say it when the silence is doing its job. |
| L10 | James | We have one decision to make, and no time left. |
| L12 | Maya | The audience is waiting on the other side of that curtain. |
| L13 | Ella | Then tell me what we are supposed to do. |
| L16 | James | That sounded like a very final instruction. |
| L17 | Ella | Wait. I want to hear the first part again. |
| L18 | Maya | We can start that moment again. This is only a rehearsal. |
| L19 | James | I remember the beginning better than the ending. |
| L20 | Ella | And what happens if we skip straight to the decision? |
| L21 | Maya | Then we still need to know where we are. |
| L25 | James | I thought the ending would be more dramatic. |
| L26 | Maya | Not every ending needs a thunderstorm. |
| L27 | Ella | It only needs someone ready to say go. |
| L29 | James | Are we ready? |
| L30 | Maya | Ready when you are. |

**Importante:** L27 contiene la palabra inglesa *go*, pero **NO** es un pie de voz y no debe disparar Q01/Q02/Q03. Úsese como caso negativo adicional en la toma completa. Para TTS de escena completa no leer descripciones entre paréntesis, encabezados, números de línea, nombres de personajes ni acotaciones; las acotaciones las ejecutará RUNQ mediante WAV.

## 6. Voz del director y negativos

**Director (voz fuera del texto teatral):**

- `director_restart.wav`: "Let's start from the first moment again."
- `director_skip.wav`: "Skip ahead to the decision."

Son indicaciones humanas grabadas para probar recuperación de posición. **No se asume** que el Autopiloto ejecute esas instrucciones; el disparo debe producirse cuando se reconoce el pie de James o Ella.

**Negativos:**
- `negative_clock.wav`: "The clock is somewhere above us."
- `negative_light.wav`: "Perhaps the light will turn on."
- `negative_go.wav`: "go"
- `negative_next.wav`: "next"
- `negative_stop.wav`: "stop"

**Comandos para pruebas aisladas condicionadas a la build (no promocionar sin validar):**
- `commands/go.wav`: "Go."
- `commands/stop.wav`: "Stop."
- `commands/next.wav`: "Next."
- `commands/stop_all.wav`: "Stop all."
- `commands/cancel.wav`: "Cancel."

Nunca mezclar los comandos con la pista de reproducción del show ni permitir que esos audios se vuelvan a capturar por el micrófono para causar realimentación.

## 7. Montaje reproducible de tomas

Usar clips individuales sin reverberación, silencios verdaderos y un editor de audio que conserve formato común. Crear las tomas descritas en `CUE_AND_VOICE_MATRIX.md` exactamente:

- `01_linear_en.wav`: James L6 → Maya L14 → Ella L23.
- `02_jump_en.wav`: James L6 → Ella L23.
- `03_rewind_en.wav`: Ella L23 → James L6.
- `04_repeat_en.wav`: Maya L14 → 3.5 s o más de silencio → nueva toma Maya L14.
- `05_disarmed_en.wav`: James L6 → Maya L14, con ARM desactivado.
- `06_negative_en.wav`: negativos alternados con silencios.
- `07_director_en.wav`: director restart → James L6 → director skip → Ella L23.
- `08_full_scene_en.wav`: interpretación completa de todos los diálogos L5–L30, acotaciones omitidas.

No aplicar time-stretch a los clips para encajar la pantalla; alterar el audio entre pruebas invalida comparaciones de latencia. El fichero de ensamblaje o hoja de edición debe conservar marcas de inicio/fin de cada frase.

### Control de calidad auditivo previo

Comprobar escucha por auriculares: voz natural, dicción del pie exacta, consonantes completas, ruido de fondo bajo, sin clipping, sin palabras añadidas. Transcribir los WAV con un ASR independiente si está disponible y comparar **texto literal**; esta verificación previa no cuenta como precisión de Muse. Registrar duración, peak, frecuencia de muestreo, origen de voz y licencia; mantener el audio crudo intacto.

## 8. Efectos sonoros opcionales: prompts de generación solo si se decide crear otros

**El plan A usa los tres WAV originales offline**; estos prompts no implican necesidad de gastar créditos ni atribuyen los WAV existentes a la IA.

- **Q01, atmósfera**: "A 7-second low, subtle, uneasy ambience for an empty theatre, restrained atmospheric drone, no speech, no recognizable melody, no sudden loud impacts, clean stereo or mono sound design, fade cleanly at tail."
- **Q02, campana**: "One solitary old theatre clock bell, only one strike, natural metallic resonance and decay, about 2.8 seconds, dry and clean, no other sounds, no voice."
- **Q03, decisión**: "A short 5.5-second restrained cinematic tonal rise marking a final theatre decision, understated and hopeful, smooth ending, original notes, no copyrighted themes, no speech."

Si se genera sonido externo, aprobar el resultado al oído, comprobar licencia, registrar proveedor/modelo/coste y reemplazar el WAV únicamente después de escuchar la diferencia. Nunca mostrar una generación Modal exitosa sin servicio y resultado reales.

## 9. Hoja de producción por asset

Registrar una fila por archivo: `filename | character | L# / scene | prompt version | exact text | TTS provider | model / voice ID | rights / licence URL or receipt | generation date | source format | sample rate | duration | checksum | manual accept/reject`. No incluir claves ni datos de facturación en el repo.

**Ninguna voz del narrador entra al micrófono de reconocimiento de RUNQ.** Las tomas de actores sí; mantener ambas pistas y el audio del show separados hasta el montaje final.
