# RunQ / SHOWCOMPILER — plan de pruebas automáticas para Codex
Fecha: 27 de octubre de 2026
Ámbito: rama unificada del hackathon, motor local, generación de propuestas con Meta y revisión humana.

## 1. Objetivo y límites comprobables

Convertir los cambios de Codex en iteraciones reproducibles: PR -> pruebas offline -> informe priorizado -> corrección acotada -> pruebas de regresión -> revisión del operador. No ejecutar agentes en bucle desatendidos ni entrenar pesos de Muse automáticamente.

El verificador de audio inspirado en el taller Meta ya está integrado en esta rama de trabajo. Detecta SFX:/FX:/SONIDO:/SOUND:/AUDIO:/MUSIC:/MÚSICA: explícitos no abordados por el modelo dentro de la ventana analizada y presenta una sugerencia de revisión con L#. Es una HEURÍSTICA parcial: no detecta todos los sonidos escritos como prosa ni juzga valor artístico.

**Seguridad obligatoria:** las pruebas automáticas nunca deben llamar a Meta/Baseten ni usar MODEL_API_KEY, leer guiones privados, tocar reproducción GO/STOP o publicar respuestas completas. No deben fusionar main ni hacer despliegues. Ninguna prueba verde certifica audio real, ASIO ni calidad artística del modelo.

## 2. Circuito ya operativo

En VS Code (terminal del repositorio):

    npm run qa:codex

Este único comando ejecuta en orden:
1. npm run check:syntax: sintaxis de módulos de interfaz, Meta, audio y del informe Codex.
2. npm test: tests Node de análisis, API local, importación, aprobación, audio, reproducibilidad, seguridad y revisión independiente.
3. npm run qa:cues: compara seis casos sintéticos con predicciones deliberadamente imperfectas. Evalúa lineId + transport (PLAY/STOP/CONTINUE/SILENCE) + cueKind + basis, cues indebidos, líneas imaginadas y duplicados.
4. node tools/codex-qa-summary.mjs: genera informe compacto sin documentos ni secretos.

Los resultados están en:
- artifacts/cue-qa/report.md y report.json: métricas y diferencias del evaluador de cues.
- artifacts/codex-qa/summary.md y summary.json: resumen de incidencias priorizadas para Codex.

Los dos directorios están ignorados por Git. El CI en GitHub ejecuta el mismo comando en cada PR y adjunta artefactos sintéticos. GitHub Actions ejecuta además la construcción y validación del ZIP de demostración y un smoke test del DOM con Chrome (sin salida de audio física y sin IA real).

## 3. Matriz automática de regresión

| Grupo | Caso que no puede romperse | Prueba y criterio de aceptación |
|---|---|---|
| Ingesta | Caracteres UTF-8, escenas, personajes, escaleta, idioma, líneas L# | Tests sceneAnalysis / dramaticStructure / script; no cambio de IDs |
| Modelo | JSON estricto, límite 1 ventana, acabados y rechazos | theatreCueAnalysis y metaCueProvider; fallo seguro sin importar parcialmente |
| Evidencia | Cita del texto real, core vs contexto, sin L# inventadas | test de parseTheatricalCueContent y metadatos originales |
| Verificador Meta | SFX/SONIDO explícitos no abordados, STOP como observación, cota 16 | independentCueReview + metaIntegration; solo avisos para revisión |
| Seguridad | API key solo servidor, mismo origen, sin guiones en errores | metaIntegration / browserPrototype; no fuga de texto privado |
| Aprobación | AI PENDING no crea DRAFT ni ejecuta audio | propuestas y flujo de aprobación; sin GO automático |
| Reproducción | GO / STOP / FADE / STOP ALL, cancelaciones y carreras | browserAudio / cueAutomation*; resultado determinista |
| Persistencia | JSON legado y paquete ZIP con WAV reales originales | projectPersistence / showArchive + unzip -t |
| Interfaz | Inglés/español, búsqueda L#, accesibilidad básica | i18n / browserPrototype + Chrome smoke |
| Calidad de cues | PLAY vs acción física, menciones dialogadas, CONTINUE/STOP, silencio | stageCueQa + corpus sintético, con informe por caso |

**Gates de integración inmediatos:** 0 fallos de sintaxis, 0 tests Node fallidos, script QA/report completado, ZIP válido y Chrome smoke completado. Las cifras P/R/F1 de fixtures inventadas NO son un gate de calidad de Muse; solo demuestran que el evaluador funciona. Una regresión reproducible en cualquier gate bloquea la integración.

## 4. Proceso obligatorio para Codex

Cuando una tarea o PR falle:
1. Leer AGENTS.md, este plan y artifacts/codex-qa/summary.md; revisar solo el área relacionada. Anotar rama actual, base, SHA, y si se parte de una PR apilada.
2. Reproducir exactamente **un fallo técnico** con un test rojo determinista. Si el problema es artístico, documentarlo y proponer un criterio de evaluación humana; no inventar una verdad.
3. Modificar un único subsistema pequeño, sin reescribir arquitectura ni tocar archivos no relacionados.
4. Ejecutar el test focalizado y npm run qa:codex. Antes de proponer fusión, comprobar que no cambió indebidamente el formato de proyecto, las referencias al guion ni el motor de audio.
5. Abrir o actualizar PR aislada solo cuando se haya pedido. Incluir diff, SHA, comandos reales, resultados, captura de CI y límites.
6. Requerir aprobación del técnico cuando una modificación cambie significado de una acotación, manejo de STOP/SILENCE o comportamiento de directo. No activar GO automático.

## 5. Pruebas de integración manuales antes de etiquetar una demo

- Cargar al menos un guion dramático y una escaleta reales autorizados, sin subirlos a GitHub.
- Probar que una instrucción como "SFX: timbre" omitida por el modelo dispara aviso y enlaza exactamente a su L#.
- Confirmar que "(Se oye un trueno)" no se clasifica como comprobado por el verificador heurístico; registrar esta limitación.
- Confirmar que luces LX, vídeo, diálogo que menciona un sonido y efectos escénicos prácticos no se convierten automáticamente en PLAY.
- Verificar manualmente con altavoces la salida, STOP ALL, interrupción por cue, cancelación, fades y archivo de show empaquetado.
- Comprobar uso en Chrome y Edge sobre Windows y ajustar la experiencia visual y navegación con teclado.

## 6. Evaluación real y control presupuestario, NO automática

Solo tras autorización expresa:
1. Congelar corpus de guiones con uso autorizado y un gold con evaluación profesional de cues obligatorios, opcionales y prohibidos.
2. Capturar salidas tipadas del modelo sin claves ni cuerpos privados. Registrar versión, schema, modo de diseño, ventanas cubiertas, tokens y tiempo. Almacenar fuera del repositorio; no guardarlas en PR.
3. Comparar dos configuraciones A/B cambiando SOLO una variable (prompt, schema, ventana o versión del modelo). Calcular precisión/recall explícitos, creatividad revisada por humano, STOP objetivos, duplicados y coste por análisis.
4. Publicar solo resultados agregados seguros. No entrenar modelo con scripts sin derechos y no inferir que un resultado sintético mide la calidad de Muse.
5. Sin aprobación expresa, las suites deben usar datos ficticios y un modelo simulado, de coste de API igual a cero.

## 7. Mejoras siguientes, por prioridad

P1: detección de acotaciones acústicas sin prefijo ("Se oye un trueno") como *candidatos por revisar*, con falsas alarmas medidas. No convertirlas automáticamente en PLAY.

P1: test de respuesta estructurada truncada, reintento explícito y reanudación de la siguiente ventana tras interrupción; nunca reintento de pago automático.

P1: guardado de cobertura y decisiones de revisión entre sesiones sin alterar proyecto JSON legado; diseñar migración antes de escribir persistencia.

P2: exportación local y privada de propuestas tipadas del modelo para compararlas con gold humano, bajo consentimiento explícito.

P2: benchmark de latencia y precisión de reconocimiento de pies con Muse Voice Transcribe sobre ensayos autorizados; siempre GO humano.

## 8. Mensaje recomendado para Codex en VS Code

Actúa como ingeniero senior de QA de RunQ. Lee AGENTS.md y docs/CODEX_AUTOMATED_TEST_PLAN_2026-10-27.md. Ejecuta npm run qa:codex y revisa los informes locales en artifacts/codex-qa/summary.md y artifacts/cue-qa/report.md. Los datos por defecto son sintéticos inventados: NO midas con ellos precisión de Muse. Identifica primero un único defecto técnico reproducible, crea una prueba que falle, aplica el parche mínimo y vuelve a ejecutar QA. Comprueba que no hay regresiones en GO/STOP, referencias L#, esquema de proyectos, aprobación humana, confidencialidad o costes. Devuélveme cambios concretos, comandos, resultados, causa raíz y limitaciones. No ejecutes solicitudes de pago, no accedas a claves, no modifiques main ni fusiones ramas sin autorización.

### Material de referencia
- https://github.com/meta-models/legal-agent-workshop (principio de verificación independiente)
- docs/META_INDEPENDENT_AUDIO_REVIEW.md
- docs/CODEX_CUE_QA_LOOP.md
- docs/CODEX_TASK_01_SAFE_INTEGRATION.md
