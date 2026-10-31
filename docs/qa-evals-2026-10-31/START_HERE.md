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
4. Preparar E8 **sin ejecutar modelos pagados** y E9 feedback loop; informar lo bloqueado.
5. Automatizar en CI solo lo offline y determinista. Pilotos pagados requieren autorización específica por proveedor, presupuesto y lotes.

## Ejecuciones reales verificadas por esta publicación
Publicar documentos en GitHub **no ejecuta ninguna prueba sobre RUNQ**. No atribuirle por defecto los 100 casos, 102 conversaciones, 18 E2E ni validación de Muse Spark a la rama.
