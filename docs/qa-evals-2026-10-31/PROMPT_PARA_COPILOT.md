# PROMPT LISTO PARA PEGAR EN COPILOT · RUNQ QA/EVALS

Actúa como **arquitecto senior de calidad y evaluación de IA**, experto en Node.js, Playwright, guiones escénicos, gestión de cues, Web Audio y voz. Quiero que implementes un banco exhaustivo y reproducible de pruebas para Show Builder + Studio + RUNQ AI, sobre el checkout que tengo abierto en VS Code, **sin perder ni sobrescribir trabajo**.

## 0. Recupera la documentación de GitHub; NO necesitas ZIP
Repositorio: \`vicentektek/showcompiler-hackathon-2026\`.
Rama de documentación: \`docs/runq-evals-exhaustive-2026-10-31\`.

Lee directamente en GitHub estos archivos (la rama está publicada):
- \`docs/qa-evals-2026-10-31/START_HERE.md\`
- \`docs/qa-evals-2026-10-31/TEST_AND_TRAINING_STRATEGY.md\`
- \`docs/qa-evals-2026-10-31/CORPUS_AND_REPORT_CONTRACT.md\`
- \`docs/qa-evals-2026-10-31/REPORT_SCHEMA.md\`
- \`docs/qa-evals-2026-10-31/COPILOT_TASK.md\`

Si tu acceso a GitHub desde Copilot no los encuentra, utiliza \`git fetch origin docs/runq-evals-exhaustive-2026-10-31\` y \`git show origin/docs/runq-evals-exhaustive-2026-10-31:<ruta>\` **sin cambiar de rama**. Los ficheros del corpus del ZIP original no se han publicado en GitHub; créalos conforme al contrato (o recupéralos de un paquete local solo si realmente existe). No inventes que ya están integrados.

## 1. Preflight, seguridad del worktree y arquitectura
1. Lee \`AGENTS.md\`, \`package.json\`, \`README.md\`, \`docs/RUNQ_SYSTEMATIC_EVAL_PROTOCOL.md\`, \`docs/QA_MATRIX_2026-10-27.md\`, \`docs/REHEARSAL_AUTOPILOT.md\` y el informe reciente de implementación de Builder.
2. Captura \`git status --porcelain\`, HEAD, rama, worktrees y estado de tests; respalda archivos sin confirmar en un directorio aparte, con hashes, antes de modificar.
3. No hagas \`reset --hard\`, \`git clean\`, merge, cambio de rama destructivo ni commits globales de trabajo ajeno.
4. Identifica lo que YA hacen \`qa:agent:mass\`, \`qa:codex\`, \`qa:systematic\`, \`runq-agent-mass-eval.mjs\` y \`runq-systematic-lab.mjs\`. Extiende y orquesta; **no dupliques**.
5. Los guiones/diálogos se crean con derechos limpios y origen sintético. No uses piezas comerciales ni secretos.

## 2. Fase E0 — Corpus sintético y anotaciones
Crea \`test/fixtures/runq-evals/\` con **100 guiones** originales ES/EN (50 pares de escenario), **102 conversaciones** de 2+ turnos (51 pares ES/EN), **18 recorridos** E2E declarados y **32 fallos** tipados. Añade generador determinista idempotente, documentación y split por escenario agrupado: development/validation/holdout, con seed y SHA. Los casos deben cubrir expresiones literales, metáforas, STOP, SILENCE, continuidad, negativas, libreto largo, errores, guion cambiado, citas textuales GO/STOP, instrucciones adversarias inertes, traducciones, audio primero y Show Builder sin guion.

**No confundas cantidad con calidad**: añade revisión de cobertura por escenario, riesgos y diversidad semántica. Declara todas las etiquetas como \`DRAFT_NEEDS_STAGE_EXPERT\` hasta que un técnico/regidor las revise; no les asignes score oficial.

## 3. Fase E1 — Validación contractual y runner offline
Implementa validadores JSONL/JSON y CLI que prueben:
- IDs únicos y legibles, Lxx fuente válida, evidencia substring exacta, basis EXPLICIT/SUGGESTED, PLAY/STOP/SILENCE.
- Pares ES/EN mantenidos juntos en el mismo split.
- Corpus repetible bit a bit por seed (SHA256).
- Versiones Windows CRLF, BOM, Unicode NFD, espacios extra y mayúsculas para regresión del parser real.
- Estados PASS, FAIL, BLOCKED, INCOMPLETE y NOT_RUN honestos, sin falsear E2E ni calidad LLM.
- Reporte JSON + MD conforme a \`REPORT_SCHEMA.md\`.

\`npm test\` y el runner offline NO deben leer claves, contactar proveedores ni activar audio.

## 4. Fases E2–E7 — Integración real
Crea adapters al parser, \`sceneAnalysis\`, \`stageCueQa\`, \`agentDialogue\` y Show Builder reales. Para E2E usa Playwright/Chrome, mocks Meta/Baseten/Modal, WAV sintéticos, puertos aislados y estado limpio por caso.

Automatiza como mínimo:
- Los cuatro comienzos: guion, audios, desde cero, retomar ZIP.
- Análisis → propuestas → aceptar/rechazar/editar → audio → preflight → ZIP.
- Operaciones dentro del Builder **sin redirigir involuntariamente a Studio**.
- Repeticiones, saltos, cambios de guion, promesas de IA, respuestas obsoletas y estado de pasos omitidos.
- Audio: importación, falta de WAV, ZIP corrupto, fades, loop, stop cue, STOP ALL.
- Voz/autopiloto: simulación con consentimiento/armado explícitos, ambigüedad, repeat, rewind, saltos y disarm automático.
- Negaciones, errores intencionales, preguntas de principiante/profesional, ES/EN y 4 viewports.
- Fallos de endpoints, timeout, auth, rate, coste, datos obsoletos y prompt injection.

Las pruebas de browser deben observar el estado de proyecto real, las llamadas instrumentadas y los cambios; **no basta con comprobar que el botón existe**. No marcar una prueba inexistente como PASS. En voz real o calidad artística, indicar revisión humana pendiente.

## 5. Fase E8 — Plan de proveedores, NO ejecución pagada
Genera \`artifacts/runq-evals/campaign-plan.json\` con casos, proveedor/modelo, estimación, límite de peticiones, coste/reserva, tiempos y consentimiento. Mantén o refuerza la contabilidad de reservas ya existente de RUNQ. **No ejecutes Meta, Baseten, Modal, Fireworks ni otros modelos de pago; no habilites LIVE en CI.** Cualquier piloto real exige una autorización nueva y explícita por proveedor, presupuesto, número de solicitudes y horizonte.

## 6. Fase E9 — Ciclo de mejora verificable
En cada fallo: reproducir, registrar caso mínimo, verificar gold con humano cuando haga falta, test rojo, corregir una causa, repetir tests verdes y comparar baseline/candidate congelando corpus/seed/SHA. No permitir que el modelo cambie el gold, modifique el transporte ni evalúe su propia seguridad como único juez. Crear informe por idioma/tipo de guion y listado priorizado de siguientes tareas.

## 7. Gates P0 obligatorios
- Ningún GO/ARM accidental por guion, chat, búsqueda, selección, importación o ayuda de Builder.
- Ninguna mutación de cues o medios sin revisión/autorización.
- Ningún gasto, reintento automático, fuga de credenciales ni envío de guiones confidenciales.
- Ninguna referencia Lxx inventada llega a un cue aprobado.
- Ninguna respuesta antigua se aplica a otro show.
- STOP ALL funciona cuando una acción está pendiente.
- Un archivo de audio faltante impide presentarlo como reproducible.
- El usuario puede continuar manualmente con Meta offline.

## 8. Ejecución, entregables y autonomía
Empieza inmediatamente por E0/E1, ejecuta tests reales y continúa con E2–E7 en incrementos seguros. Si encuentras conflictos de archivos, trabaja en las tareas no conflictivas sin perder los cambios del usuario; no bloquees todo el programa por una instrucción C1 de integración ajena a este trabajo. Si un gate crítico falla, detén la modificación peligrosa y comunica el problema.

Entrega:
- Corpus/versionado/generador y CLI en repo.
- Tests y scripts npm que ejecuten suites gratis por defecto.
- Reporte inicial HONESTO: fixtures creados ≠ comportamiento probado de RUNQ ≠ evaluación real del modelo.
- QA con comandos, SHA, pruebas PASS/FAIL/NOT_RUN y evidencia.
- Documentación de lo que falta y prompt de continuación por siguiente fase.
- **Sin merges automáticos** y sin activar modelos de pago.

No me pidas descargar un ZIP: **toda la documentación de referencia ya está en GitHub**. Haz el máximo trabajo comprobable posible dentro del checkout local y termina con un resumen verificable.
