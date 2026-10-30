# RUNQ · operador técnico — biblioteca de voz EN para demo

**Estado:** guion de locución para generación y pruebas; **NO** indica que la build soporte cada orden por voz. Grabaciones pendientes. Mantener separados el narrador, los actores y el operador. La identidad del operador debe ser una voz inglesa propia, distinta de James/Maya/Ella y del narrador.

> **Selección para el vídeo principal:** NO sintetizar de momento las 17 órdenes de esta biblioteca. Las elegidas tras revisar el código V15 son `Set the fade in to three seconds.` y, opcionalmente, `Make it four seconds.`; detalles, riesgos y alternativas en [DEMO_OPERATIONS_SELECTION_2026-10-31.md](DEMO_OPERATIONS_SELECTION_2026-10-31.md). Las demás quedan para pruebas extendidas, no son claims de funcionalidades completas.

## Funciones de voz diferentes (NO mezclarlas)

1. **Actores / pies**: RUNQ escucha frases de la obra para disparar cues en Ensayo **solo después de ARM explícito**. Entradas de `fixtures/demo/runq-the-last-go-en.txt`: L6, L14, L23.
2. **Operador / edición conversacional**: instrucciones humanas para preparar propuestas, modificar un cue y revisar una vista de cambios. Requiere verificar que la build dispone de reconocimiento de comandos del operador. El agente de texto existente no demuestra por sí mismo control por voz. **No introducir estas frases en el canal de voz de los actores**.
3. **Operador / transporte**: `GO`, `NEXT`, `STOP`, `STOP ALL` hablados son casos **CONDICIONALES**; no asegurar soporte ni ejecutarlos sin controles manuales visibles. En Directo, el vídeo debe probar GO/NEXT/STOP ALL **manuales**.
4. **Operador / diálogo de rodaje**: frases que se escuchan como actuación de regidor pero que no envían comandos; usar otro canal solo si aparece claramente etiquetado como dramatización. La opción más sólida para el hackathon es usar los clips de operador solo cuando se ve una función de voz real.

## Identidad y prompt de la voz (en inglés)

**Nombre:** OPERATOR / STAGE MANAGER. **Casting:** voz adulta neutra británica, ligeramente grave, madura, natural, precisa, seca y profesional; distinta del narrador documental. Volumen normal, sin teatralidad ni música. Ritmo ~125–135 palabras/minuto, buena articulación de números y decibelios; conservar el mismo voice preset/ID en todas las tomas.

**Prompt TTS:**

> Generate a natural, realistic English-speaking theatre sound operator, aged around 35–55, with clear neutral British pronunciation and an understated, confident delivery. This is a technician speaking to show-control software while rehearsing. Natural pacing, no sales-pitch voice, no dramatic acting, no whispering, no background, no music, no added words. Leave a short beat before the key action. Read only the given line, exactly as written. Maintain identical voice identity on every clip. Pronounce RunQ as "run cue"; pronounce "cue" as /kjuː/, "GO" as the word go, "dB" as decibels. Deliver each sentence independently as WAV or another lossless format.

## Grabaciones propuestas (un archivo por frase)

| Archivo | Texto EXACTO a pronunciar | Objetivo / precaución |
|---|---|---|
| `operator/01_create_cue.wav` | "Create a new audio cue after cue three." | Propuesta de creación; solo si se reconoce y muestra diff |
| `operator/02_rename_cue.wav` | "Rename cue two to Single Clock Bell." | Renombrar; revisar que se refiere a cue real |
| `operator/03_fade_in.wav` | "Set the fade in to three seconds." | **Primer plano recomendado**: propiedad clara y fácilmente comprobable |
| `operator/04_gain.wav` | "Lower the volume by six decibels." | Mostrar diferencia antes/después y revisión |
| `operator/05_move.wav` | "Move this cue before cue two." | Mostrar cambio de orden y confirmación humana |
| `operator/06_undo.wav` | "Undo the last change." | Comprobar restauración exacta |
| `operator/07_clarify.wav` | "No, I meant cue three, not cue two." | Corrección conversacional, condicionada a build |
| `operator/08_confirm.wav` | "Apply the change." | Solo válido si existe confirmación por voz; en caso contrario realizar clic real |
| `operator/09_reject.wav` | "Cancel that proposal." | Descartar sin mutación, condicionado a soporte |
| `operator/10_go.wav` | "Go." | **No anunciar control por voz** hasta pasar prueba de comando |
| `operator/11_next.wav` | "Next." | Ídem |
| `operator/12_stop.wav` | "Stop." | Ídem; distinguir STOP de STOP ALL |
| `operator/13_stop_all.wav` | "Stop all." | Ídem; no fingir parada por voz, mantener botón manual |
| `operator/14_rehearsal_again.wav` | "Let's take that line again from the top." | Indicador humano de repetición; NO es pie activador |
| `operator/15_skip.wav` | "Let's skip ahead to the final decision." | Indicador de salto; el GO real debe proceder del pie de actriz |
| `operator/16_ready.wav` | "Standing by. Ready when you are." | Ambiente de ensayo, nunca activar cue |
| `operator/17_negative.wav` | "We need to check the sound before the audience arrives." | Negativo, no mutación ni GO |

**No leer las etiquetas o nombres de archivos durante TTS.** Exportar cada línea separada, silencio 0.7–1.0 s al inicio y al final, 48 kHz mono PCM16 para material de QA. Para versión final, voz neuronal, sin reducción drástica de ruido ni procesado que altere ASR. Licencia de uso del proveedor obligatoria.

## Selección de microescena para el vídeo principal (8–12 s)

**S05/S06 — editar un cue en RUNQ**:

- El operador selecciona Q02 en Studio (por interfaz real).
- Se reproduce `03_fade_in.wav` al **dispositivo de entrada específico para la función de edición por voz**, solo si ésta existe.
- Mostrar transcripción real y **propuesta de ajuste: Fade In 0.0 → 3.0 seconds**, con el campo real del cue.
- El operador confirma mediante interfaz real; comprobar persistencia.
- Volver a Ensayo (S08) y usar únicamente **voces de actores** para pies de Auto GO. **No hablar del operador mientras Muse escucha a los actores**, para evitar falsos positivos.

**Si edición por voz NO está disponible en la build**: la misma locución puede utilizarse solo como explicación editorial, y el cambio se introduce mediante el campo real de RUNQ. Rotular **EDITED MANUALLY**; no afirmar voice editing.

**S09 — transporte manual**:

- Preparar NEXT con clic real y ejecutar GO manualmente.
- STOP ALL pulsado en UI; capturar audio de parada real.
- El clip `13_stop_all.wav` queda reservado para una prueba separada solo si soporte seguro de comando está confirmado.

## Preparación de tomas para la automatización

Generar también una secuencia `operator/hero_edit_take.wav` que contenga: 1 s silencio → `03_fade_in.wav` → 2 s silencio. Usar un reproductor independiente y ruta de micrófono de edición; nunca reproducirla como sonido del espectáculo. Guardar logs de qué campo cambió y si hubo propuesta/confirmación efectiva.

Pruebas negativas: `14_rehearsal_again.wav` y `15_skip.wav` no deben hacer un GO por sí solas; los verdaderos pies son L6/L14/L23. El clip de operador `13_stop_all.wav` no debe ser considerado una parada operativa sin evidencia de control de voz real.

## Nota de implementación

El repositorio tiene `src/core/agentVoice.mjs`, pero este módulo **propone pies del guion** y declara explícitamente «No ASR, auto arm, GO». `src/ui/runq-agent-ui.mjs` gestiona un agente conversacional con revisión de diff. Revisar el circuito completo y sus pruebas antes de afirmar que un audio de operador puede controlar ese agente.

**Estado de producción:** guion listo; archivo binario de voz OPERATOR pendiente; prueba de voice editing pendiente. No generar ni consumir créditos de proveedor sin presupuesto y licencia claros.
