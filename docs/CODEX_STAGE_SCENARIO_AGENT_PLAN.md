# RunQ — plan de pruebas automáticas para Codex con guiones teatrales

Fecha: 27 de octubre de 2026. Rama de trabajo: `feat/runq-agent-seminar-theatre-evals-2026-10-27`. El proyecto conserva la rama unificada como destino de revisión, sin modificar `main`.

## Aplicación concreta de los conocimientos del seminario Meta

| Principio de diseño de agentes | Aplicación conservadora en RunQ | Prueba |
| --- | --- | --- |
| Contextualizar la observación | Leer estructura y tipo de producción; conservar texto/L# originales | Guiones dramatizados, libreto, escaleta, gala y multilenguaje |
| Planificar acciones limitadas | Una ventana por petición, máximo ocho items, control del presupuesto de respuesta | Preparador de solicitudes con schema estricto y contexto acotado |
| Tratar resultados de herramientas como datos | Respuesta sintética tipada, no ejecución | Parseo local y rechazo de JSON roto, líneas inventadas y claves extra |
| Verificación independiente | Heurística acústica sobre evidencia sin confiar ciegamente en el modelo | Cobertura *real* de la heurística frente a los eventos gold |
| Estado y memoria del proceso | STOP y CONTINUE deben referirse a fuentes existentes | Gold `soundKey` y `targetPlayLineId`, incluida continuidad entre ventanas |
| Autoridad del operador | PLAY/STOP no se ejecutan al generar/analizar datos | Pruebas de no mutación y flujo de aprobación ya existente |

**Importante:** es una interpretación técnica de conceptos vistos durante el seminario; no constituye una reproducción literal del taller. Muse Spark no es entrenado ni reentrenado por estas pruebas.

## Comandos de ejecución

```powershell
npm run qa:scripts
npm run qa:codex
```

Salidas: `artifacts/stage-script-qa/report.md` y `report.json`, además de los anteriores informes `artifacts/cue-qa` y `artifacts/codex-qa`. GitHub Actions debe superar también Chrome con audio simulado y el ZIP de demostración.

### Interpretación de las métricas

- **Oracle sintético**: respuestas construidas a partir del gold se procesan como si fueran respuestas JSON válidas del modelo. Un F1 perfecto aquí solo comprueba la coherencia del pipeline.
- **Verificador heurístico real**: número de instrucciones gold detectadas y omitidas si el modelo no devolviera nada. Es una medida reproducible de cobertura de *código determinista*, nunca de calidad real del modelo.
- **Escenario de saturación**: 12 instrucciones explícitas en una ventana frente al máximo actual de 8. El déficit se publica, no se oculta ni se afirma que sea un error de Muse.
- **Seguridad**: las instrucciones «ignora reglas» dentro del guion deben permanecer como datos no fiables; ningún test usa claves, redes ni efectos en audio.

## Ciclo de trabajo optimizado para Codex

1. Leer solo `AGENTS.md`, este plan, `fixtures/qa/scripts/README.md`, `artifacts/stage-script-qa/report.md` y los módulos estrictamente necesarios. No consumir contexto abriendo todas las investigaciones anteriores.
2. Comprobar `git status --short`, rama, HEAD y PR de destino. No pisar archivos sin confirmar.
3. Priorizar un defecto **realmente medido**: una acotación acústica explícita que el verificador independiente no detecta, o un falso aviso medido sobre una línea no exigida.
4. Reproducir primero con un test focalizado en L#; conservar como negativos diálogo retrospectivo, utilería real, sonido en directo, LX, VIDEO, indicaciones PREVENIR y comandos falsos dentro del guion.
5. Implementar el cambio mínimo en el verificador **orientativo**, sin emitir automáticamente PLAY ni alterar GO/STOP reales.
6. Ejecutar tests focalizados, `npm run qa:codex`, comparar `verifierDetected`, `verifierMissed`, `verifierFalseFlags` con el informe anterior. El objetivo no es aumentar avisos indiscriminadamente.
7. Si el cambio reduce omisiones sin introducir falsos avisos, preparar una PR aislada con el diff, los comandos, la CI y los riesgos. Sin merge automático.
8. Después, en PR separadas, investigar paginación cuando hay más de ocho instrucciones y relaciones STOP entre escenas. No ocultar cues por límites de esquema.
9. Cuando el operador autorice una prueba real, registrar en privado versión de Meta, resultados revisados, reason/usage sanitizado, latencia, precisión explícita, creatividad valorada y coste; nunca en CI normal ni con reintento de pago automático.

## Asignación lista para Codex en VS Code

> Trabaja como ingeniero de QA y diseño de sonido/regiduría teatral sobre RunQ. Lee AGENTS.md, docs/CODEX_STAGE_SCENARIO_AGENT_PLAN.md, fixtures/qa/scripts/README.md y artifacts/stage-script-qa/report.md. Ejecuta npm run qa:codex. No confundas la reproducción de un gold sintético con predicciones reales de Muse. Analiza primero la cobertura del verificador independiente y los falsos avisos, selecciona **una sola mejora técnica demostrable**, añade una prueba de regresión que inicialmente falle y cambia solo el verificador o el subsistema pertinente. Compara métricas antes/después y preserva la seguridad: ninguna IA puede ejecutar GO, ningún resultado inventado puede crear cues y el operador aprueba todos los cambios. No invoques Meta/Baseten ni scripts de pago, no accedas a claves, no cambies main y no fusiones automáticamente. Entrega el informe con archivos modificados, tests, métricas y limitaciones.

## Siguientes experimentos autorizables por separado

1. Revisión lingüística de acotaciones sin prefijo en español, francés e inglés.
2. Segmentación selectiva/continuación para más de ocho eventos en una ventana, con confirmación de cada petición.
3. Ledger de sonidos en curso entre escenas: PLAY → CONTINUE → STOP del objetivo exacto.
4. Exportación **local** de propuestas tipadas a un JSON de evaluación sin publicar guiones privados.
5. A/B de Muse Spark en dos configuraciones: mismas escenas, gold congelado y máximo coste fijado por el operador.

Referencia orientativa: seminario Meta del 27 de octubre de 2026; docs oficiales de modelos y salida estructurada de Meta, y `docs/CODEX_AUTOMATED_TEST_PLAN_2026-10-27.md`.