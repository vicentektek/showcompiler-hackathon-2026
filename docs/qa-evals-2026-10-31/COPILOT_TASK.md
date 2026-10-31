# PROMPT MAESTRO PARA COPILOT — RUNQ QA/Evals y feedback loop

Actúa como arquitecto senior de QA, especialista en NLP/LLM evaluation, Web Audio, reconocimiento de voz y software de espectáculos. No quiero solo un informe: quiero **un sistema de pruebas masivas implementado e integrado progresivamente** con los módulos ya existentes de RUNQ, manteniendo los tests gratuitos por defecto.

**Fuente:** `docs/TEST_AND_TRAINING_STRATEGY.md` y `corpus/*.jsonl` del kit `RUNQ_QA_EVALS_2026-10-31`. También lee en RUNQ `AGENTS.md`, `docs/RUNQ_SYSTEMATIC_EVAL_PROTOCOL.md`, `docs/QA_MATRIX_2026-10-27.md`, `docs/REHEARSAL_AUTOPILOT.md`, `tools/runq-systematic-lab.mjs`, `tools/runq-agent-mass-eval.mjs`, `src/core/stageCueQa.mjs`, `src/core/showBuilder.mjs` (si existe), `src/ui/show-builder-ui.mjs` (si existe), y todos los tests pertinentes.

## Seguridad del checkout

1. Inspecciona git status, HEAD, worktrees y cambios sin commit. No restablezcas ni sobreescribas trabajo. Crea respaldo verificable de lo necesario, fuera del repo, antes de editar. No branches/merges/resets destructivos.
2. Inspecciona código real y diferencias entre la rama actual y la referencia `runq-interface-approved-2026-10-31`. No supongas que una función existe por documentos o por ID HTML.
3. Asegura que cada comando es offline **y sin costes por defecto**. No realices requests Meta, Modal, Baseten, Fireworks ni otros proveedores durante las pruebas. No pidas ni imprimas claves. No repitas trabajos que ya realiza `qa:codex` o `qa:agent:mass`.

## Tareas secuenciales

**E0 (corpus):** incorporar los corpus sintéticos con licencias originales a `test/fixtures/runq-evals` o ubicación concordante. Mantener ID/etiquetas/splits por escenario. Corregir únicamente errores objetivos. No marcar `DRAFT` como `VERIFIED` sin revisión humana.

**E1 (validación):** integrar CLI L0/L1. Ejecuta `node --test test/campaign-contract.test.mjs` y `node tools/run-offline-evals.mjs --repo <RUNQ_ROOT> --repeat 10`; adaptar rutas a la estructura elegida. Añadir la campaña a scripts npm sin bloquear tests existentes con nuevas dependencias.

**E2 (orquestación):** implementar harness que aplique el mismo guion y contexto a deterministas y mocks; separación por prueba/seed, sin estado compartido, sin mensajes reales al proveedor. Crear reporte JSON, Markdown y JUnit. Dejar trazas seguras y códigos PASS/FAIL/INCOMPLETE/BLOCKED/NOT_RUN.

**E3 (IA propuestas):** adaptar las salidas REALES de `metaCueProvider`, `sceneAnalysis` y `stageCueQa` a `[{lineId,intent,basis}]`, conservando diferenciación `STOP`, `SILENCE` y `PLAY`. Comparar con gold verificado; reportar F1 por idioma, género y casos negativos. Rechazar referencias desconocidas; no puntuar incompletos como F1=0 o F1=1 artificiales.

**E4 (conversación):** reproducir las 102 sesiones con `agentDialogue` / UI real a través de adapter y mock provider. Verificar cambios de opinión, estado real, que el usuario no salga involuntariamente de Show Builder, consentimiento, no GO, y diffs revisables. Evaluación de calidad semántica como propuesta para revisor humano/LLM, NO fingir PASS.

**E5 (builder):** automatizar los 18 recorridos `journeys.json` en Playwright con acciones reales y WAV generados localmente; registrar screenshot/trace solo al fallar. Probar ES/EN y 1920x1080,1440x900,1093x614,768x900. Pruebas con audio faltante, servidor offline y cambio de proyecto durante respuesta tardía.

**E6 (voz y audio):** usar tests simulados y audio consentido para verificar salto/repetición/autopiloto; desarmar inmediatamente al salir. Ninguna llamada de proveedor ni falsa certificación en sala. Incluir STOP ALL y no GO inadvertido como invariantes.

**E7 (fallos):** inyectar los 32 fallos de `faults.jsonl` en dependencias mock para comprobar atomicidad de importaciones, políticas de gasto, permisos de micrófono, resultados obsoletos y disponibilidad offline.

**E8 (IA real / FUTURO, no ejecutar):** preparar plan de solicitudes A/B y coste por proveedor usando `runq-systematic-lab.mjs` y el ledger existente. No activar `--live`, `--ack-paid` ni ningún modo equivalente sin instrucción expresa del usuario. No ampliar límites por su cuenta.

**E9 (feedback):** clasificación de fallos, reporte comparativo por commit/seed y generación de tareas pequeñas para Codex. Cada corrección: test rojo, una variable modificada, suite offline, comparación contra baseline congelado. No modificar gold por conveniencia ni evaluar sobre casos entrenados como si fueran holdout.

## Criterios de aceptación

- Cero GO inadvertidos, cero mutaciones sin revisión, cero peticiones o reintentos pagos sin permiso, cero secretos expuestos, cero referencias de fuente falsas tras validación.
- Los resultados observados y los marcadores `NOT_RUN/BLOCKED/FAIL/INCOMPLETE/PASS` deben corresponder con ejecución real. Los E2E y los tests de IA real no son PASS por instalar fixtures.
- En el informe final separa con claridad **código implementado**, **fixtures disponibles**, **tests realmente ejecutados**, **problemas**, **costes** y **next steps**.
- No ejecutes una campaña masiva pagada automáticamente; la autorización debe ser independiente y contener proveedor, modelo, conjunto, máximo de peticiones y presupuesto. Antes de eso, ejecuta tanto QA gratis como permita el checkout.

**Empieza por E0 y E1. Continúa por fases mientras los cambios no comprometan el trabajo existente.**