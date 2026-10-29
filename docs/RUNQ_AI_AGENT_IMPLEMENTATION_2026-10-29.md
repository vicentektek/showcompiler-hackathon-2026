# RUNQ AI Agent — implementación experimental sobre V14
Fecha: 29/10/2026. Rama: feat/runq-ai-agent-global-2026-10-29. PR: #108 (draft).
Base: feat/runq-v14-studio-stage-functional-workspaces-2026-10-29, HEAD inicial f1ff9a6ec76f747cfbfb644101bca8c3b5d76d20.

## Funciones realmente incorporadas
- Botón **RUNQ AI** en Studio; panel lateral accesible y oculto en Ensayo/Directo.
- Contexto local del proyecto: IDs permanentes, números visibles, metadatos de audio, líneas L# originales y disponibilidad real de archivos.
- Consultas locales ES/EN: resumen, auditoría básica, información de cues, eliminación por número, reordenación, creación, ajustes sencillos y propuestas de pies.
- Propuestas conservadoras de pies hablados desde diálogo anterior vinculado al cue, con rechazo de frases duplicadas o demasiado cortas, sin inventar líneas de guion.
- Propuestas de mejora de sonido mediante **traspaso revisable a Sound Lab**, sin generar o sustituir un archivo automáticamente.
- Consulta opt-in a Meta Muse Spark: un único POST desde el servidor local, límites de tamaño, origen local, consentimiento independiente, sin reintentos ni secretos en el navegador.
- Respuesta estructurada restringida a cuatro operaciones: UPDATE_CUE / DELETE_CUE / CREATE_CUE / REORDER_CUE, o ANSWER/CLARIFY.
- Verificación de que los IDs propuestos existen en el contexto enviado; los nuevos pies propuestos por modelo deben poder localizarse en diálogo original cercano al cue.
- Vista previa de cambios antes de aprobación; selección individual de operaciones, con regeneración de la vista previa y validador de dependencias.
- Aplicación atómica usando los módulos de edición ya existentes, con revisión de versión del show, denegación durante audio activo, confirmación por clic y deshacer del lote aplicado.
- Sin cambios en Web Audio, cola de operador, GO/STOP/STOP ALL o estado de Autopiloto.
- Sin cambio de schema v1 ni nuevas dependencias runtime.

## Seguridad
- El modelo no recibe capacidades de transporte, código ejecutable, shell ni escrituras directas.
- Ningún cambio entra en el proyecto hasta que el usuario pulsa Aplicar.
- Cambios de proyecto invalidan la propuesta; cambios posteriores al lote invalidan deshacer.
- Studio es el único ámbito de escritura. Ensayo/Directo bloquean el panel y el guard de mutación.
- Los sonidos originales no se eliminan al borrar cues.
- Las solicitudes a proveedores requieren casilla explícita por consulta. El servidor no implementa reintentos.
- Las tareas locales funcionan sin clave de modelo ni conexión a Internet.

## Pruebas
- Unitarias: test/agentCore.test.mjs, test/agentRoutes.test.mjs.
- Browser E2E: tools/runq-agent-browser-e2e.mjs.
- CI: .github/workflows/core-tests.yml incluye la prueba del navegador, y package.json incluye node --check de los nuevos módulos.
- Ejecutar: npm run check:syntax && npm test && npm run qa:codex. El E2E necesita playwright-core/Chrome en CI y se invoca con node tools/runq-agent-browser-e2e.mjs.
- Ningún test llama a Meta, Baseten o Modal.

## Guía de uso
1. Ejecutar npm run dev en la rama experimental y abrir la URL local.
2. Importar JSON o ZIP de un proyecto (no se modifican los archivos originales).
3. En Studio pulsar RUNQ AI.
4. Probar «elimina el cue 2», «mueve el cue 3 antes del 1», «pon pies de voz coherentes a todos los cues» o «revisa el show».
5. Inspeccionar el diff, desmarcar operaciones no deseadas y pulsar Aplicar lote; deshacer si procede.
6. Para preguntas complejas, marcar consentimiento y elegir Consultar Meta. Una casilla marcada no envía solicitudes por sí sola.
7. Para «mejora el sonido del cue 3», abrir la alternativa precargada en Sound Lab, escuchar y aprobar manualmente el resultado.

## Límites y próximos pasos
- No es un agente de Directo ni un sistema de transporte por voz.
- No integra generación de audio autónoma en una misma transacción conversacional; Sound Lab sigue siendo una herramienta separada con permisos.
- No hay historial persistente de conversación ni reanudación de tareas externas después de reiniciar.
- El intérprete local cubre comandos concretos; solicitudes abiertas requieren proveedor y pueden fallar si falta clave o cuota.
- Contexto remoto: máximo 80 cues y 120 líneas, con máximo 15 k caracteres de contexto. Proyectos grandes necesitan paginación/selección explícita y validación posterior.
- Pie hablado automático solo si hay referencias L# y diálogo anterior apropiado. El algoritmo abstiene cuando no dispone de evidencia suficiente.
- No se ha demostrado calidad de inferencia real de Meta ni precisión de pies en actores reales. Validar manualmente con regiduría y micrófonos.
- No se certifica latencia, compatibilidad Windows hardware ni uso profesional en directo.

## Riesgos de integración
La rama V14 sigue siendo experimental. Mantener la PR como draft hasta CI verde y aceptación visual/manual. Revisar HEAD de V14 antes de rebase/merge para evitar conflictos con cambios paralelos.
