# RunQ — protocolo de evaluación y mejora sistemática (27 octubre 2026)

## Actualizacion autorizada - 31 octubre 2026

La [politica vigente](RUNQ_AI_CAMPAIGN_100_2026-10-31.md) establece USD 100
globales, Meta USD 65 y Modal USD 35; Baseten y Fireworks USD 0. El limite de
USD 2 se conserva **por comando**, no como techo global de la nueva campana.
Los dos runners conservan el historial local y exigen tambien el ledger
compartido por usuario, independiente del checkout. No reiniciar registros,
repetir peticiones desconocidas ni confundir reservas con facturacion o credito.
La autorizacion general ya existe; los controles de ejecucion por operador,
dashboard real, credenciales privadas, gold provisional y no auto-GO siguen.

## Finalidad

Evaluar Muse Spark mediante **experimentos controlados**, con guiones originales, un gold **provisional**, trazas de eventos estrictamente tipadas y tareas concretas para Codex. El objetivo es mejorar prompts, validación y usabilidad, **no entrenar automáticamente los pesos de Meta** ni permitir que un agente ejecute audio.

El sistema separa cinco capas: (1) ingesta y planificación con L# estables, (2) inferencia opt-in, (3) validación determinista de esquema y fuente, (4) comparación y diagnóstico de errores, (5) regresión y revisión humana. No modificaremos múltiples variables en un mismo experimento. La comparación A/B requiere el **mismo guion completo** en ambos modos.

## Ya disponible

- `npm run qa:codex`: batería offline gratuita con regresiones, guiones del seminario, Chrome en CI y empaquetado. No llama a Meta.
- `npm run qa:systematic`: genera una matriz **DRY RUN**, sin claves, llamadas ni créditos.
- `node tools/runq-systematic-lab.mjs --cases hotel-door,gala-rundown --modes literal,balanced --max-requests 4 --budget-usd 0.35`: planificación offline del experimento.
- `node tools/runq-systematic-lab.mjs --live --ack-paid --cases hotel-door,gala-rundown --modes literal,balanced --max-requests 4 --budget-usd 0.35`: **cuatro peticiones autorizadas como máximo**, serializadas y con reservas antes de enviar. No lo ejecutes como Codex.

El historial local en `CWD/.runq-local/meta-eval-budget.json` conserva sus entradas
y ahora tiene un techo acumulado de **65 USD**, ademas del ledger compartido
global de **100 USD**. El comando sigue limitado a 2 USD. La prueba anterior
`hotel-door` reservo 0,069127 USD; no debe considerarse disponible para repetir.
Conservar e importar conservadoramente los historiales anteriores con el
procedimiento de la politica vigente; nunca usar una copia nueva para evadirlos.
Ningun sistema local garantiza facturacion o credito real de Meta: comprobar el
panel y no usar otras aplicaciones con la misma API key.

## Qué se registra

Cada corrida crea una carpeta distinta `artifacts/systematic-eval/run-XXXXXX/`, ignorada por Git:

- `summary.md`: tabla de resultados, comparación entre modos en el mismo caso, errores ordenados y costes estimados.
- `summary.json`: métricas estructuradas, líneas y tipos de evento.
- `codex-next-task.md`: el siguiente cambio acotado y comprobable.
- Subcarpetas `hotel-door-literal`, etc., con informe y **eventTrace** con solo `sourceLineId`, `transport`, `cueKind`, `basis`, sin texto de guion, tokens secretos ni respuesta íntegra.

**Cuidado**: los identificadores L# y sus inferencias siguen siendo metadatos potencialmente privados; todos los informes son locales y no deben publicarse. Los guiones de fixtures son originales y pueden usarse en el repositorio.

Una solicitud incompleta o truncada produce diagnóstico, **no** un F1 artificial. No hay reintento automático. La suite no permite GO, START ni reproducción mediante respuesta de modelo. Los STOP y SILENCE siguen siendo observaciones y cualquier actuación real exige revisión humana.

## Protocolo de aprendizaje incremental

1. Congelar el conjunto de pruebas y el commit del programa. Iniciar con `hotel-door` para identificar el evento EXTRA de L5. **No dar por supuesto que es PLAY**; observar evento tipado.
2. Ejecutar A/B de `literal` y `balanced` en los mismos casos, primero `hotel-door`, luego `gala-rundown` y `delta-signal`, después un guion largo con continuidad `umbra-long`.
3. Analizar por prioridad: falso PLAY en líneas negativas > alucinación de fuente > STOP/CONTINUE erróneo > omisiones explícitas > duplicados > creatividad opcional. La prioridad exacta del evaluador es reproducible pero requiere regidor.
4. Revisar cada discrepancia con la línea original y un técnico de sonido. Una anotación gold incorrecta se corrige SOLO con revisión explícita.
5. Pasar `codex-next-task.md` a Codex. Una tarea a la vez: escribir test rojo, cambiar una variable (prompt, parser, validación o fragmentación), ejecutar `npm run qa:codex`, registrar diff y SHA.
6. Ejecutar una nueva tanda expresamente autorizada con la MISMA selección de casos para comparar con la línea base. No usar totales mezclados de casos diferentes ni ajustar el benchmark hasta lograr una puntuación perfecta.
7. Pasar validación de Chrome/STOP ALL, aprobación humana y CI antes de integrar. No fusionar main automáticamente.

## Gating real y estimación de coste

Los precios y tokens tienen volatilidad. `tools/metaSeminarEval.mjs` estima un máximo a partir del tamaño de petición, margen de entrada y 8192 tokens de salida; el registro global reserva de forma conservadora **antes** de cada llamada. El gasto estimado del proveedor se registra por separado. Los costes mostrados por el cliente no son garantía de cargos finales.

Limites actuales: hasta 20 peticiones y 2 USD **por comando**, mas los techos
persistentes de la politica vigente. La ampliacion a USD 100 ya esta autorizada,
pero tandas mayores requieren diagnostico previo y credito verificado; no
eliminar controles ni repetir estados desconocidos. La mejor eficiencia se
logra primero corrigiendo el diagnostico y seleccionando casos discriminativos.

## No prometer falsas capacidades

La automatización **genera observaciones y tareas**: no se reescribe sola, no mejora los pesos de Muse, no usa Codex en segundo plano ni certifica calidad del audio en sala. Por ahora la puntuación artística es respecto a anotaciones provisionales; el objetivo es que Codex corrija causas técnicas respaldadas por evidencias y un regidor apruebe las decisiones semánticas.

## Prompt para Codex

«Lee AGENTS.md, docs/RUNQ_SYSTEMATIC_EVAL_PROTOCOL.md y el último codex-next-task.md del directorio local de artefactos. No invoques Meta, no leas claves, no modifiques el transporte GO/STOP. Selecciona una discrepancia verificable, crea un test que falle, mejora una sola variable y ejecuta las pruebas offline. Presenta cambios, commit y métricas antes/después. Diferencia errores de anotación, errores reales del modelo, falsos positivos y creatividad opcional. No mezcles datos parciales, no edites el gold para obtener una mejora artificial y no fusiones ramas sin permiso.»
