# RUNQ · Campaña exhaustiva QA + IA · Entrada para Copilot
Fecha: 31/10/2026. Estado: **documentación publicada; infraestructura y corpus pendiente de integración**.

## Qué está publicado en esta rama
- [TEST_AND_TRAINING_STRATEGY.md](TEST_AND_TRAINING_STRATEGY.md): estrategia integral y seguridad.
- [COPILOT_TASK.md](COPILOT_TASK.md): tareas E0–E9.
- [CORPUS_AND_REPORT_CONTRACT.md](CORPUS_AND_REPORT_CONTRACT.md): formatos y aceptación.
- [REPORT_SCHEMA.md](REPORT_SCHEMA.md): informe estructurado y marcadores.
- [PROMPT_PARA_COPILOT.md](PROMPT_PARA_COPILOT.md): instrucciones listas para pegar.

## IMPORTANTE: estado honesto
El paquete inicial que se preparó fuera del repositorio contenía **100 guiones sintéticos (50 pares ES/EN), 102 conversaciones (51 pares ES/EN), 18 recorridos E2E y 32 fallos tipados**, además de un runner. **Esos archivos de corpus y ejecutables NO se han integrado todavía en esta rama**. No los declares presentes ni ejecutados. La tarea E0 debe recrearlos con esta especificación, o recuperarlos de su fuente local SI existe y tras inspeccionarlos. Todas las etiquetas semánticas iniciales son DRAFT_NEEDS_STAGE_EXPERT, nunca VERIFIED sin revisión. No trates las muestras como gold definitivo.

## Base y precauciones
- Rama independiente de documentación: `docs/runq-evals-exhaustive-2026-10-31`.
- Partida: `feat/runq-interface-rework-2026-10-31` (versión visual aprobada).
- **No se ha modificado** ni `main` ni el checkout local de Copilot.
- El usuario tenía modificaciones locales y una rama `feat/runq-ai-campaign-100-2026-10-31` sin constancia de publicación remota. No cambies de rama dentro de su worktree sin asegurar primero ese estado.
- No sustituyas el motor de tests ya existente: `tools/runq-agent-mass-eval.mjs`, `tools/runq-systematic-lab.mjs`, `docs/RUNQ_SYSTEMATIC_EVAL_PROTOCOL.md`, `docs/QA_MATRIX_2026-10-27.md`.

## Incorporar los documentos en el checkout local **sin cambiar de rama**
En la terminal del repo, si no se interfiere con trabajo en curso:
```powershell
git fetch origin docs/runq-evals-exhaustive-2026-10-31
git show origin/docs/runq-evals-exhaustive-2026-10-31:docs/qa-evals-2026-10-31/PROMPT_PARA_COPILOT.md
```
Leer con `git show` no modifica los archivos de trabajo. Para copiar documentos al checkout actual, Copilot debe revisar primero `git status`, realizar respaldo verificable y resolver eventuales conflictos; no hacer reset, checkout, merge ni cherry-pick ciegos.

## Plan inmediato
1. Inspeccionar capacidades **reales** del checkout; congelar SHA y tests existentes.
2. Implementar E0 + E1: fixtures sintéticos, contratos, generador determinista y runner offline, con reporte honesto.
3. Ampliar E2–E7: adapters, escenarios de Builder, conversaciones, voz, audio, fallos; solo marcar PASS cuando se haya ejecutado.
4. E8: integrar la política [PAID_AUTONOMOUS_QA_POLICY.md](PAID_AUTONOMOUS_QA_POLICY.md), validar el gateway único y solo entonces ejecutar campañas Meta/Modal autorizadas; si no se cumplen sus precondiciones, bloquearlas. E9: feedback loop.
5. Automatizar en CI solo lo offline y determinista. La autorización del usuario para Meta 65 USD / Modal 35 USD ya consta en la política; cada lote usa sus límites y flags explícitos. Sin reintentos automáticos.

## Ejecuciones reales verificadas por esta publicación
Publicar documentos en GitHub **no ejecuta ninguna prueba sobre RUNQ**. No atribuirle por defecto los 100 casos, 102 conversaciones, 18 E2E ni validación de Muse Spark a la rama.


## Agente personalizado de Copilot para campañas pagadas

Se ha creado **[RUNQ Paid QA](../../.github/agents/runq-paid-qa.agent.md)** en \`.github/agents/runq-paid-qa.agent.md\`. Este archivo sí es un agente de VS Code Copilot reconocido por su interfaz, independiente de \`AGENTS.md\`.

Para utilizarlo en el checkout activo con modificaciones sin confirmar:

1. Recuperar la rama \`docs/runq-evals-exhaustive-2026-10-31\` con \`git fetch origin docs/runq-evals-exhaustive-2026-10-31\` (no cambia checkout).
2. Inspeccionar \`git status\` y comprobar si \`.github/agents/runq-paid-qa.agent.md\` existe localmente; **no sobrescribirlo si existe**.
3. Importar ese archivo en la ruta de workspace \`.github/agents/runq-paid-qa.agent.md\`, conservando el contenido literal, y verificar que el editor lo reconoce.
4. En VS Code Copilot Chat escoger el agente **RUNQ Paid QA** en el selector de agentes. La política económica está integrada en el agente y las referencias están en esta rama; importar también la documentación necesaria de forma no destructiva.
5. Verificar gates, créditos y pruebas offline antes de ejecutar un \`--live\`. La existencia del archivo **no lanza pruebas por sí misma ni convierte el presupuesto en garantía de facturación**.

El agente dedicado puede realizar lotes pagados sin confirmación por solicitud únicamente dentro de los topes de 100 USD, Meta 65 USD y Modal 35 USD, y cuando el gasto está controlado por el gateway compartido.


## Nuevo test extremo del Asistente de Show — Gauntlet v2 (01/11/2026)

Prueba ejecutable disponible en la MISMA rama:
- [164 preguntas en 13 conversaciones](../../fixtures/qa/show-assistant-gauntlet-v2.json), incluyendo un maratón de 44 turnos y 10 guiones originales.
- [Runner offline](../../tools/runq-show-assistant-gauntlet-v2.mjs): no importa proveedores ni ejecuta GO ni aprueba planes.
- [Tests de contrato](../../test/runqShowAssistantGauntletV2.test.mjs): validación del corpus y de las reglas de clasificación de fallos.
- [Protocolo y E2E](SHOW_ASSISTANT_GAUNTLET_V2.md): precisión semántica, revisión humana, selección de casos Meta y cinco recorridos críticos del Builder.

Comandos una vez incorporados de manera NO destructiva al checkout actual:

    node --test test/runqShowAssistantGauntletV2.test.mjs
    node tools/runq-show-assistant-gauntlet-v2.mjs

Un FAIL es diagnóstico del programa actual, no un error en la existencia del corpus. NINGUNA prueba publicada aquí ha sido ejecutada sobre el checkout local del usuario por esta publicación. No confundir \`CONTRACT_PASS\` con calidad de Muse.
