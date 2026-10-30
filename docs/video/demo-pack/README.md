# RUNQ · paquete de preproducción del vídeo (29 octubre 2026)

**Estado:** documentación, prompts y generador de voz ejecutable preparados; se han generado por separado WAV robóticos **solo para QA** (no versionados). **NO** hay voces neuronales finales, pruebas reales de Muse, capturas ni montaje definitivo. **Carácter:** obra y diálogos originales, libres de material de terceros; los audios sintéticos WAV existentes son del propio proyecto. **Repositorio:** privado. **Rama:** `docs/runq-video-production-kit-2026-10-29`, independiente de la integración.

## Decisiones recuperadas (no reinventar la campaña)

1. Vídeo para el **Meta Global AI Developer Hackathon 2026**, objetivo **03:00**, condicionado a las reglas y campo de envío autenticado.
2. Imagen 1920×1080, 16:9, 30 fps; voz sintética inglesa y subtítulos ingleses; **no hace falta que el operador pronuncie inglés o aparezca en cámara**.
3. **«From script to stage. AI-assisted. Human-controlled.»** como tesis; conservar también el lema previo **«From script to sound on cue»** para el cierre, si encaja.
4. Once escenas del storyboard de [PR #97](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/97): problema → guion → Meta → revisión → audio → ensayo → operación → cierre.
5. Prioridad nueva solicitada: vídeo **técnico/directo**; hacer claramente visibles transcripción, pie, L#, cue esperado, ARM AUTO GO, GO y sonido. No reemplazar acciones reales por simulaciones.
6. El rediseño Studio/Audio/Guion/Ensayo/Directo aún debe aprobarse. **Captura y edición final EN PAUSA**, según `docs/RUNQ_REPLAN_AI_VISUAL_DESKTOP_2026-10-29.md`; esta rama solo prepara material.
7. Fuente base: `integration/runq-demo-2026-10-30` (RC1); **NO** alterar GO/STOP, el reconocedor, los medios, la rama principal ni los gastos de IA.

## Índice de entregables

| Archivo | Uso |
|---|---|
| [`fixtures/demo/runq-the-last-go-en.txt`](../../../fixtures/demo/runq-the-last-go-en.txt) | Obra teatral ORIGINAL y LIMPIA importable como TXT UTF-8; sin «Q01», referencias L# insertadas ni instrucciones promocionales |
| [`CUE_AND_VOICE_MATRIX.md`](CUE_AND_VOICE_MATRIX.md) | Pies de voz, líneas, audio, ensayos normales/no lineales, negativos y criterios de éxito |
| [`VOICE_GENERATION_PROMPTS.md`](VOICE_GENERATION_PROMPTS.md) | Prompts listos para sintetizar personajes y locutor; tomas y especificaciones técnicas |
| [`NARRATION_EN_V2.md`](NARRATION_EN_V2.md) | Texto de presentación en inglés por escena, alternativa honesta si falla Autopiloto |
| [`NARRATION_ES_REFERENCE.md`](NARRATION_ES_REFERENCE.md) | Traducción española para revisar la locución, no destinada al vídeo final |
| [`STORYBOARD_AND_CAPTURE.md`](STORYBOARD_AND_CAPTURE.md) | 11 planos, timecodes provisionales, overlays, captura limpia y montaje |
| [`PRODUCTION_RUNBOOK.md`](PRODUCTION_RUNBOOK.md) | Preparación Windows, enrutado de audio, permisos, evidencia, métricas, control de calidad y exportación |
| [`demo_manifest.json`](demo_manifest.json) | Matriz estructurada reutilizable por Codex: líneas, pies, cues, takes, gates y procedencia |
| [`TTS_AUTOMATION.md`](TTS_AUTOMATION.md) | Generación de 14 clips esenciales o 43 ampliados con SSML neuronal, muestras offline y ensamblado reproducible de tomas |
| [`tools/video/build_voice_kit.py`](../../../tools/video/build_voice_kit.py) | Script ejecutable, sin red ni claves, que crea SSML y WAV; importa después voces profesionales con licencia |

## Obra y razón de diseño

**The Last GO:** comedia breve y sobria sobre una deliberación antes de anunciar el resultado de un concurso. Tres intérpretes — Ella, James y Maya — permiten voces inglesas contrastadas. **No habla de RUNQ**: tiene guion dramático natural y acotaciones que un modelo debe interpretar con trazabilidad. Tres pies exactos se asocian a los tres WAV originales ya construibles sin APIs: atmósfera → campana → transición final. Esto reutiliza `src/core/demoShow.mjs` sin afirmar que su ZIP anterior sea la nueva obra. Una eventual automatización que construya un ZIP EN es **pendiente de implementación y prueba**.

**No confundir:** la obra limpia es el input para análisis Meta; la matriz técnica y el guion de presentación NO deben importarse como obra. Si se decide insertar voces de «director» en los tests, estas pertenecen a las tomas de ensayo, no al texto teatral original.

## Procedencia y afirmaciones permitidas

- **Meta Muse Spark**: solo decir «analyzes / suggests» acompañado de una captura real de una llamada autorizada y de su revisión. Si se usa fixture manual, rotular «prepared demo fixture»; nunca simular inferencia.
- **Biblioteca y WAV**: los efectos existentes `01_atmosphere.wav`, `02_clock_bell.wav`, `03_finale.wav` son sintéticos, originales, construidos offline en `src/core/demoShow.mjs`. No atribuirlos a Modal ni a Meta audio generation.
- **Voice Follow / Auto GO**: la ejecución real requiere Muse Voice escuchando audio entrante y autorización ARM explícita en Ensayo; una transcripción editada/sintética o un test simulado no es prueba de precisión de ASR.
- **«GO, STOP, NEXT» pronunciados**: grabaciones reservadas para probar comandos SOLO si la build fija confirma esa función. El guion no afirmará que están implementados sin verificación. El GO manual sí se puede mostrar.
- **Sesión de ensayo**: permitir saltos, retrocesos y repeticiones únicamente si el resultado real se observa en captura continua; si falla, usar una demostración asistida y locución alternativa.
- **Limitaciones**: no afirmar ASIO, PFL independiente, DMX, integración con hardware, certificación de directo ni ejecutable instalable sin validación.
- Derechos: usar voces sintéticas con licencia de uso demostrable, sin clonar identidades; no subir WAV de terceros, claves, logs privados ni audio de proveedores sin comprobar permisos.

## Estado de producción (checklist)

- [x] Obra original inglés y pies planificados por escrito.
- [x] Prompts de TTS y ensayos definidos.
- [x] Texto narrador v2 y storyboard técnico redactados.
- [x] Generar WAV **robóticos provisionales** offline para QA técnico (eSpeak; no válidos como locución final). Script y SSML listos. 66 WAV (scope all), 29 WAV (scope hero).
- [ ] Generar WAV **neuronales definitivos** de los intérpretes y locutor por herramienta TTS elegida, sujeto a licencia.
- [ ] Preparar paquete RUNQ EN / cargar audio real y asignar pies con L#.
- [ ] Validar Meta/voz/GO real, bajo control humano y con gastos explícitamente aprobados.
- [ ] Aprobar la UI final, congelar commit, grabar capturas reales, editar vídeo.
- [ ] Consultar requisitos y duración máximos del portal de entrega.
- [ ] Exportar subtítulos sincronizados y MP4 final.

## Referencias del repositorio

- [Guion y storyboard original PR #97](https://github.com/vicentektek/showcompiler-hackathon-2026/pull/97)
- `docs/RUNQ_HACKATHON_EXECUTION_PLAN_2026-10-29.md`
- `docs/RUNQ_REPLAN_AI_VISUAL_DESKTOP_2026-10-29.md`
- `docs/REHEARSAL_AUTOPILOT.md`
- `tools/build-rehearsal-demo.mjs` (demostración ES de 3 pies y WAVs)
- `src/core/demoShow.mjs` (fuentes de los tres WAV originales)
