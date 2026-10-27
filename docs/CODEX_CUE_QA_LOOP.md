# RunQ — ciclo de pruebas y mejoras con Codex (27 de octubre de 2026)

## Objetivo

Evaluar los cambios de RunQ de forma reproducible, localizar regresiones reales, proponer **una corrección acotada** mediante Codex y verificarla antes de revisión humana. No es un sistema que entrene automáticamente los pesos de Muse Spark ni que sustituya la valoración de un regidor.

## Estado real

- Ejecutable sin coste de API: `npm run check:syntax`, `npm test`, `npm run qa:cues`.
- `npm run qa:cues` escribe `artifacts/cue-qa/report.json` y `report.md`; GitHub Actions sube el informe en las PR sin necesidad de ejecutar Codex ni llamar a Meta.
- Los ejemplos predeterminados son **ficción sintética** y las predicciones son **inventadas deliberadamente** para probar el evaluador. Sus estadísticas **NO** miden la calidad real de Muse Spark. `artifacts/cue-qa/` está ignorado por Git: nunca subir informes generados con guiones privados.
- Se evalúa coincidencia exacta de `L# + transport + cueKind + basis`; STOP/CONTINUE/SILENCE son sucesos evaluables y una mera mención dialogada o un golpe físico no deben crear PLAY automáticamente.
- Las propuestas SUGGESTED no incluidas en gold quedan pendientes de valoración artística, salvo que contradigan una acción esperada o estén en una línea expresamente prohibida.
- No se ha integrado un exportador de resultados de Meta desde la UI ni una API de evaluación pagada. **Ninguna prueba de CI usa el modelo real.**
- Si Codex usa su propia IA para analizar informes, el uso está sujeto a los límites de Codex/ChatGPT; GitHub Actions puede consumir minutos de CI según la cuenta. Eso es independiente del coste de inferencia de Meta.

## En VS Code

Usar la rama unificada de RunQ o una copia aislada (`git worktree`) de esta rama:

```powershell
npm run check:syntax
npm test
npm run qa:cues
code artifacts/cue-qa/report.md
```

Para evaluar una captura de inferencia real **sin almacenar material privado en Git**, crear dos JSON locales en una carpeta fuera del repositorio (o ignorada):

1. **Gold** revisado por un técnico: estructura `{ "version":1, "cases":[{ "id":"escena-1", "scriptText":"ESCENA 1\\n(Suena un aviso)", "expected":[{"lineId":"L2","transport":"PLAY","cueKind":"FX","basis":"EXPLICIT"}], "forbiddenPlayLineIds":[] }] }`.
2. **Predicciones** capturadas y depuradas de la respuesta del modelo: `{"version":1, "predictionsByCase":{"escena-1":[{"sourceLineId":"L2","transport":"PLAY","cueKind":"FX","basis":"EXPLICIT"}]}}`.
3. Ejecutar `node tools/cue-qa-report.mjs --gold RUTA_GOLD.json --predictions RUTA_PRED.json --output RUTA_PRIVADA_REPORTE`.

No copiar tokens, cabeceras HTTP, audio, respuestas completas de terceros ni guiones sin autorización a PR, chats de Codex, CI o capturas públicas. Registrar fuera del repositorio, si se autoriza una prueba real: versión de modelo, prompt, línea/escena, `finish_reason`, tokens de salida/razonamiento, duración, coste aproximado y decisión humana. Nunca asumir que fallos de validación son fallos de interpretación artística.

## Prompt para Codex en VS Code

> Actúa como ingeniero de QA de RunQ y experto en regiduría teatral. Lee AGENTS.md, docs/CODEX_CUE_QA_LOOP.md y artifacts/cue-qa/report.md. Ejecuta npm run check:syntax, npm test y npm run qa:cues. Distingue las predicciones ilustrativas de resultados reales del modelo. Identifica la causa comprobable del primer fallo **técnico** de mayor prioridad; si el fallo es de interpretación artística y no hay captura real verificada, limita tu trabajo a añadir un test o mejorar el evaluador, sin afirmar calidad del modelo. Añade primero un test que reproduzca el problema; modifica solo el componente necesario; repite pruebas y presenta métricas antes/después y el diff. No hagas llamadas Meta/Baseten, no leas ni envíes claves, no modifiques audio GO/STOP, no fusiones main ni abras una PR sin revisar el cambio.

## Ciclo repetible

1. Bloquear la versión del gold y el conjunto de guiones (sin introducir nuevos ejemplos entre comparativas).
2. Cambiar **una variable por experimento**: ventana, estructura, prompt, campos del schema o validación.
3. Ejecutar suites offline, publicar un informe de diferencias y conservar resultados comparables.
4. Si necesitamos medir **precisión de Muse Spark**, obtener consentimiento explícito para **cada petición potencialmente facturable**, guardar un resumen seguro (sin credenciales) y generar manualmente/mediante exportador futuro el JSON de predicciones.
5. Pedir valoración a una persona con experiencia en sonido/regiduría de las propuestas creativas. La aprobación o rechazo puede generar ejemplos para un conjunto gold revisado; no "entrena" Meta automáticamente.
6. Solicitar a Codex una corrección acotada y verificar la regresión sin aumentar el número de cues artificialmente.
7. Integración humana solo si pasan las pruebas y la revisión funcional. No publicar ni desplegar automáticamente.

## Siguientes ampliaciones

- Exportación local de propuestas tipadas, razones, líneas, observaciones y diagnósticos sin cuerpos privados del proveedor.
- Evaluación de identidad de sonido/STOP objetivo, continuidad entre ventanas, precisiones creativa y explícita separadas, orden de cues, tasa de edición humana y métricas de coste/latencia.
- Comparación controlada entre Meta estándar y Baseten, solo tras aprobación, límites de coste y cuenta configurada.
- El último paso sería automatizar tareas Codex mediante `codex exec` o SDK en entorno de permisos mínimos y revisión por PR; nunca empezar por un agente con permisos ilimitados.

Referencias de orientación: Codex IDE en https://learn.chatgpt.com/docs/codex/ide; OpenAI Codex Cookbook sobre ciclos de mejora https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex.