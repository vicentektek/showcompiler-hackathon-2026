# RUNQ — guion de rodaje definitivo propuesto (versión 3)

**Preparado para voces inglesas naturales. No filmado.** Duración objetivo 3:00, pendiente de límite oficial. Esta versión **actualiza** las decisiones de `NARRATION_EN_V2.md` en S05/S08: en esos dos apartados **no hay narrador**, porque se escucha primero al operador técnico y después a los actores. Se mantiene el contenido verificado de las demás secciones.

## Locuciones definitivas a exportar (inglés)

| ID | Tiempo objetivo | Quién habla | Texto literal |
|---|---|---|---|
| S01 | 00:00–00:10 | Narrator · Benedict | Every live sound cue depends on one thing: perfect timing. |
| S02 | 00:10–00:26 | Narrator · Benedict | Before a performance, the sound operator reads the script, organizes files, and builds a cue list. Rehearsals change the timing again and again. |
| S03 | 00:26–00:35 | Narrator · Benedict | Meet RunQ. From script to stage. AI-assisted. Human-controlled. |
| S04 | 00:35–00:55 | Narrator · Benedict | Import an original theatre script. RunQ keeps every line intact. Meta Muse Spark can analyze the context and suggest sound cues with references to the exact source lines. |
| S05 | 00:55–01:20 | **Operator · Arian** | Set the fade in to three seconds. [Optional second take BEFORE applying: Make it four seconds.] |
| S06 | 01:20–01:40 | Narrator · Benedict | Assign real audio, preview the result, inspect the waveform, and adjust the cue. Every edit is connected to the show, ready for rehearsal. |
| S07 | 01:40–01:47 | Narrator · Benedict | But rehearsals rarely follow the script in order. Watch what happens when actors speak. |
| S08 | 01:47–02:35 | **James · Steve; Ella · Ella; optionally Maya · Philippa** | James: Listen carefully. The theatre is holding its breath. Ella: When the red light comes on, we make our choice. [Optional linear playback: Maya: When the clock strikes once, open the envelope.] |
| S09 | 02:35–02:50 | Narrator · Benedict | On stage, the operator remains in charge. Set the next cue, press GO, stop one sound, or stop everything immediately. |
| S10 | 02:50–02:55 | Narrator · Benedict | Understand the script. Rehearse the changes. Run the show. |
| S11 | 02:55–03:00 | Narrator · Benedict | RunQ. From script to sound on cue. |

**Límites:** la narración se generó en Descript como proyecto privado y todavía falta revisar su voz exacta, la pronunciación de RunQ y los silencios (el agente indicó que no insertó las pausas). No afirmar que las nueve piezas están exportadas en WAV independientes. Proyecto [RUNQ Hackathon voiceover · Benedict](https://web.descript.com/c9b27c2d-b505-40b1-a327-b1f8b6df9d5d).

**Operador:** los dos clips Arian están generados en otro proyecto privado. Falta exportar los WAV y escucharlos: [RUNQ Operator voice · Arian](https://web.descript.com/4d0882c0-5aa0-4903-a6fc-330ab8691679).

## Estructura del S05 — prueba de voz + edición humana

- 00:55–00:58: Studio/Cue Editor real, Q01 seleccionado, fade in inicial visible.
- 00:58–01:04: micrófono para dictado, entrada Arian (voz pregrabada), botón Record/Stop; consentimiento individual.
- 01:04–01:11: transcripción real de Muse Voice aparece en campo de instrucción y se revisa.
- 01:11–01:17: Propose changes muestra `Fade in 0 s → 3 s`; es **interpretación local determinista**, NO atribuir esta edición al modelo Muse Spark.
- 01:17–01:20: botón Apply ejecutado por operador y sin GO.

La captura puede requerir más tiempo por la transcripción: grabar **master completo**, seleccionar tomas reales, hacer cortes de tiempo narrativo marcados; no fingir que transcribe sin latencia. Si falla, escribir el comando y rotular «conversational editor», no «voice recognition».

## Estructura del S08 — demostrar la diferencia real

- Estado `DISARMED` visible: micrófono puede escuchar, pero **NO GO**.
- El operador prepara `AUTO GO` y acepta advertencia manual; nunca armar por script sin consentimiento.
- Chrome puede emitir el WAV de actor al `getUserMedia` mediante `--use-file-for-fake-audio-capture=...%noloop`, documentado como **prerecorded test input**, no un micrófono humano. El proveedor recibe audio y hace ASR real.
- Actor James L6: disparo de Q01 atmosférico (real, salida de RUNQ).
- Toma aparte salto James L6→Ella L23: Q01→Q03, Q02 no se lanza; mostrar corte editorial «TAKE 2 · SKIP», no unión oculta.
- Repetición y rewind opcionales **solo si los resultados reales pasan**.
- Audio de actores añadido a mezcla final desde el mismo WAV fuente solo para escucharse en vídeo; el cue debe proceder de la grabación real de salida del programa.

**Atención:** `Playwright recordVideo` registra el navegador **sin audio**; para un vídeo con efectos reales de RUNQ se necesita **OBS** u otro capturador de sistema. No atribuir sonido insertado en post al motor si no se capturó el evento.

## Mensaje al jurado

1. **Muse Spark** entiende el guion original y propone con L# (requiere captura real de una inferencia y revisión humana).
2. **Muse Voice** reconoce una orden de operador, que el parser local traduce a propuesta de cambio y el técnico confirma.
3. **Muse Voice Follow + Autopiloto** reconoce texto de actores, con ARM explícito, y dispara efectos reales, incluso con salto si se verifica.
4. **Modo Directo** sigue siendo manual y seguro.

La diferencia clave es el origen de cada acto: el análisis de escenas puede ser del modelo Meta; la edición del fade es un parser local tras ASR Meta; el GO procede del motor local tras ASR y ARM; STOP ALL es un control local manual. Este reparto debe describirse con precisión.

## Pruebas recomendadas antes de rodar

- Cuatro pasadas del pie L6 y L23 por la entrada Chrome; registrar coincidencias, falsos GO y tiempos.
- Tres pasadas de `Set the fade in to three seconds` con Arian, comparando transcripción exacta.
- Dos pasadas del salto L6→L23 con Q02 ausente.
- Una prueba de desarmado para probar cero GO involuntarios.
- Un ensayo completo de S05+S08 antes del master definitivo, para detectar cortes de voz y errores del dispositivo.

**No** gastar créditos de Meta/Modal desde estas instrucciones: la prueba de voz sigue exigiendo autorización de la sesión y política de coste vigente.
