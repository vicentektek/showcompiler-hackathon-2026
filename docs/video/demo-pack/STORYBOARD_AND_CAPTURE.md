# RUNQ · Storyboard técnico y lista de captura v2

**Duración planificada:** 03:00 (180 s), **sujeta a verificación del límite oficial del concurso**. Formato 1920×1080, 16:9, 30 fps. Interfaz oscura de RUNQ aprobada, todavía **NO congelada**. Narración EN en `NARRATION_EN_V2.md`. Retomar base de 11 escenas de PR #97: ninguna captura antigua se hace pasar por la versión final.

## Plano a plano

| ID | TC IN–OUT | Dur. | Acciones, UI y composición | Audio / voz |
|---|---|---:|---|---|
| S01 | 00:00–00:10 | 10 s | Fondo de escenario original o tipografía sobre negro. Titular «THE MOMENT MATTERS». | Narrador S01, golpe sonoro propio |
| S02 | 00:10–00:26 | 16 s | Texto teatral original a la izquierda, necesidad de cues como esquema/editor REAL, no interfaz de un competidor | Narrador S02 |
| S03 | 00:26–00:35 | 9 s | RUNQ abierto con nombre de producto y proyecto visible, captura de build final | Narrador S03 |
| S04 | 00:35–00:55 | 20 s | Importar `runq-the-last-go-en.txt`; resaltar líneas L6/L7 y L14/L15; hacer **una inferencia Meta real autorizada** si existe crédito y permiso | Narrador S04; cursor y foco claros |
| S05 | 00:55–01:13 | 18 s | Inspeccionar propuesta, L# y evidencia; aceptar una, rechazar otra; mostrar cue DRAFT sin que suene | Narrador S05 |
| S06 | 01:13–01:34 | 21 s | Biblioteca audio → adjuntar `01_atmosphere.wav` o `02_clock_bell.wav` → forma de onda real → edición/preview; la cue list sigue visible | Narrador S06; 2–3 s para escuchar preescucha |
| S07 | 01:34–01:41 | 7 s | Cambiar de Studio a Ensayo; se ven guion, pies, estado de voz y AUTO GO desarmado | Narrador S07 |
| S08 | 01:41–02:31 | 50 s | **HERO SHOT TÉCNICO**: fuente voz separada, transcripción real, L#, cue real, ARM consciente, GO audible, salto/repetición | **NO NARRADOR**, solo actor/efecto capturados y breves rótulos veraces |
| S09 | 02:31–02:47 | 16 s | Cambiar a Directo, manual: seleccionar ≠ preparar NEXT ≠ pulsar GO; STOP individual, STOP ALL | Narrador S09 y sonido real |
| S10 | 02:47–02:55 | 8 s | Montaje de capturas auténticas Script / Review / Waveform / Rehearsal / Operation | Narrador S10, palabras «UNDERSTAND / REHEARSE / RUN» |
| S11 | 02:55–03:00 | 5 s | Logo RUNQ / texto «FROM SCRIPT TO SOUND ON CUE» | Narrador S11; fundido |

**No atribuir S04 al modelo si usa mock.** En tal caso aplicar texto alternativo de `NARRATION_EN_V2.md`; anotar motivo en el manifiesto. **No mostrar un producto inexistente, ejecutable, ASIO o hardware si no está validado.**

## S08 · despiece sugerido (cada prueba con master continuo individual)

| TC | Subevento | Qué debe verse a la vez |
|---|---|---|
| 01:41–01:47 | Pie Q01 con Autopiloto desarmado (toma negativa) | Se oye la frase y aparece transcripción real; **sin GO** |
| 01:47–01:52 | Operador arma explícitamente AUTO GO | Click, confirmación, estado real ARMED, micrófono EN |
| 01:52–02:05 | Pie Q01 y Q02, en sesión real | `L6` → Q01 sonido; `L14` → Q02 campanada; no rótulo pregrabado para «GO» |
| 02:05–02:17 | Salto Q01 → Q03 en toma delimitada | Nuevo inicio claro «TAKE 2 — SKIP»; `L23` dispara Q03, Q02 no suena |
| 02:17–02:25 | Retroceso Q03 → Q01 | Nuevo inicio claro «TAKE 3 — REWIND» y posición observada |
| 02:25–02:31 | Repetición del mismo pie | Nuevo inicio «TAKE 4 — REPEAT»; dos eventos distintos y segundo GO solo si cupo visualmente |

**Atención al tiempo:** 50 s es una guía de edición, no una promesa de que seis tomas completas quepan a velocidad normal. Si faltan segundos, priorizar **ARM → frase → GO audible → salto sin cue intermedio**, y mover rewind/repeat a material técnico complementario. No acelerar ni manipular la toma para fabricar capacidad. Los rótulos «TAKE 2», etc., indican cortes entre ensayos, no un salto oculto en una sesión continua.

## Panel de Ensayo ideal para leer en 1080p

Mantener visibles en una misma captura, siempre con datos **verdaderos**:

1. **Estado**: `MIC LISTENING` (si activo); `AUTO GO DISARMED / ARMED` (estado auténtico).
2. **Texto**: «Recognized speech» mostrando la frase final de James, Maya o Ella; no texto editado en post que se haga pasar por ASR.
3. **Guion**: número de línea `L6`, `L14`, `L23` destacado cuando proceda.
4. **Cues**: Q01/Q02/Q03 con «NEXT», «PLAYING», «SKIPPED» solo si la app informa de esos estados.
5. **Salidas**: transporte real GO/STOP y audio audible.
6. **Trazabilidad**: si se añade overlay externo, debe rotularse como **anotación editorial**, no como salida de la UI; la transcripción real permanece visible debajo.

**Control visual:** no inventar porcentajes de confianza, ms de latencia ni etiquetas de estados que no existan. El cursor no tapa el texto. Evitar zoom digital excesivo que parezca otra interfaz.

## Diseño sonoro y mezcla

- **Pista 1 narrador**: TTS independiente, pausas naturales, sin narración durante S08.
- **Pista 2 voces de personajes**: desde la fuente de prueba original, clara y audible durante S08; conservar archivo fuente.
- **Pista 3 salida real RUNQ**: atmósfera/campana/transición y la parada; proceder del audio grabado de la aplicación, **no reemplazar con efectos de librería mientras se afirma que son RUNQ**.
- **Pista 4 música original** (opcional): muy baja bajo locución, **silencio musical en S08** si distrae.
- Evitar que el audio de salida RUNQ vuelva al canal que transcribe Muse (realimentación/cues falsos).
- Mezclar el máster sin recortar sonidos clave; escuchar en auriculares y altavoces normales. Guardar WAV stems y export final MP4 H.264 (valores de códec pendientes del portal).

## Capturas obligatorias y nombres

| Archivo de captura master | Requisito |
|---|---|
| `01_title_app.mp4` | Pantalla RUNQ versión fijada, sin ficticios |
| `02_script_import.mp4` | Archivo limpio + L# reales |
| `03_meta_inference.mp4` | Provider real + aprobación operador, sin secretos |
| `04_review.mp4` | Aceptar/rechazar y DRAFT |
| `05_audio_editor.mp4` | Waveform real, playback de biblioteca, trim/fades si existen |
| `06a_rehearsal_disarmed.mp4` | Pie sin GO |
| `06b_rehearsal_armed.mp4` | ARM + pie + GO real sin cortes |
| `06c_rehearsal_skip.mp4` | Salto en sesión real, cue intermedio no lanzado |
| `06d_rehearsal_rewind.mp4` | Regreso de posición real |
| `06e_rehearsal_repeat.mp4` | Dos turnos de voz distintos y repetición real |
| `07_manual_operation.mp4` | NEXT/GO/STOP/STOP ALL con audio |
| `08_archive_roundtrip.mp4` | Exportar/importar ZIP con WAV (material de respaldo) |

Cada master registra: build SHA, fecha/hora, fuente de voz, dispositivo de entrada, si ARM estuvo activo, si Meta fue real, y el resultado observado. Tomar 2 s antes/después de cada operación. Una toma fallida se conserva como evidencia privada y **se replantea el montaje**, no se maquilla.

## Herramientas y acabados previstos

- OBS Studio para captura real a 1080p/30 fps. No capturar ventanas que muestren claves.
- DaVinci Resolve/Fairlight para cortar y mezclar; sin gráficos de aplicación inventados.
- Subtítulos ingleses SRT hechos tras generar la narración aprobada; durante S08 los subtítulos corresponden a las frases de actores, diferenciando cada voz (no al narrador).
- Colores coherentes con cinco mockups aprobados: oscuro profesional, cian para evidencia guion/cue, ámbar Ensayo, verde Directo, rojo STOP ALL. No usar colores o porcentajes «de producto» generados sin base.
- Versión de pantalla y configuración de permisos iguales en las tomas principales.

## Alternativa honesta

Si no se consigue demostrar AUTO GO con audio de entrada **real**, sustituir S08 por una prueba asistida: se reconoce una frase, aparece el cue sugerido, el operador prepara y pulsa GO. Narración y rótulo `ASSISTED REHEARSAL`. No prometer retroceso/salto automáticos que no sean observables.

## Gate para empezar captura

**No grabar el producto hasta que el usuario apruebe la UI**, el build del vídeo quede fijado, la demo real funcione, la licencia de voz/audio esté verificada y se confirme el límite de duración. Mientras tanto solo se puede preparar guiones, prompts, toma de prueba y QA offline.

Baseline original: [PR #97](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/97).
