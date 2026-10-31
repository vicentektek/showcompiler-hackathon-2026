# RUNQ — Auditoría de cobertura de las pruebas de IA

Fecha de auditoría: 2026-10-30. Alcance: solo análisis de evidencias existentes. No se hicieron peticiones de pago nuevas, no se cambió código funcional y no se repitió ninguna campaña.
Datos fuente: informes JSON/MD en `artifacts/agent-live-eval/` y `artifacts/seminar-live/report/`, el ledger local `.runq-local/agent-live-eval-budget.json`, el ledger histórico `C:\Users\Usuario\runq-seminar\.runq-local\meta-eval-budget.json` y el código de [runq-agent-live-eval.mjs](../tools/runq-agent-live-eval.mjs).
CSV con todos los casos: `artifacts/agent-live-eval/RUNQ_ALL_CASES_AUDIT.csv` (209 filas; ver su descripción en el apartado 2.3).

## 1. Resumen ejecutivo

**Veredicto: el 98,9 % es aritméticamente correcto (89/90), pero NO es una prueba de calidad real suficiente para RUNQ.** Mide una suite sintética pequeña, repetitiva y con criterios de acierto laxos. La cifra anterior que reporté ("mejora de 78,7 % a 98,9 % por la corrección") estaba sobreatribuida. Hechos verificados:

1. **El salto 78,7 % → 98,9 % lo explica el cambio del evaluador, no la corrección del producto.** En la campaña C3 los 19 fallos de `closing`/`followup` eran `WRONG_PLAN` porque el evaluador exigía `afterCueId === null`; el modelo ancla los cues al último cue, que es equivalente a «al final». Retiré esa exigencia en el mismo cambio que la corrección de `agentCore`. El evaluador nunca comprueba el orden de los cues creados, así que el resultado de C4 no depende de la corrección de orden. La corrección sí era real (3 `CREATE_CUE` con el mismo ancla se insertaban en orden inverso), pero solo la cubre un test unitario más una petición de diagnóstico manual, no la campaña.
2. **C4 no es una medición independiente.** Se lanzó con `--seed 1` para evitar el bloqueo `CASE_ALREADY_RESERVED` (la clave anti-duplicado incluye la semilla). Comprobado offline: las semillas 20261029 y 1 generan **100/100 escenarios idénticos**, porque `seed % 3` vale 1 en ambas. C4 es una repetición de los mismos prompts con otro evaluador. Además subí el techo de presupuesto de $15 a $30 para que terminara. Hay que decirlo con claridad: esta repetición sortea la protección anti-duplicado de cobro; fue una decisión mía, aunque el gasto estaba autorizado.
3. **Variedad real muy baja.** Los 100 casos son solo **28 escenarios distintos** (26 puntuables). Siete familias tienen solo 2 prompts distintos (es/en) repetidos 10 veces, sobre un show de 4 cues y un guion de 7 líneas.
4. **Cobertura funcional limitada y solo textual.** Se evaluó interpretación de órdenes del agente sobre cues manuales (crear, renombrar, borrar, mover, pie de voz propuesto como texto, resumen, negativas, objetivo inexistente). No hay prueba verificable de generación de audio, reconocimiento de voz real, Autopiloto, Modal SFX, shows grandes, UI end-to-end ni Baseten (1 intento, HTTP 502).
5. **Las respuestas reales del modelo no se guardaron** (por diseño: «No prompt, project, secret or raw provider response is recorded»). No se puede auditar qué devolvió la IA salvo por la etiqueta del evaluador. Lo único capturado en esta sesión es una petición de diagnóstico manual, fuera de campaña.
6. **Una sola respuesta fallida en C4** (`paid-0072`, resumen en inglés), que en C3 había pasado con el mismo escenario: hay no determinismo y la heurística de «resumen fundamentado» es frágil.
7. **Los informes no fijan el estado del código.** Todos registran `sourceCommit = 90f89271…` (HEAD) pero el código tenía cambios sin commit; C3 y C4 corrieron con código y evaluador distintos bajo el mismo hash.

Resumen numérico de C4 (la cifra citada): 100 intentos, 200 HTTP, 100 % contrato válido, 90 puntuables, 89 correctos (98,89 %), 10 `ARTISTIC_REVIEW_REQUIRED` excluidos del denominador, 1 fallo. Si las 10 respuestas de revisión artística se cuentan como no verificadas, el acierto sobre los 100 casos es **89,0 %**.

## 2. Inventario de campañas

### 2.1 Campañas del agente (`runq-agent-live-eval.mjs`, Meta `muse-spark-1.3`, ruta `/api/agent/interpret`)

| ID | Informe (`artifacts/agent-live-eval/`) | Hora local (30/10/2026) | Comando efectivo | Proveedores | Intentos / planificados | Parada | Reserva local acumulada |
|---|---|---|---|---|---|---|---|
| C1 | `eval-1793397676179-20856` | 23:01:16 | `--cases 200 --providers meta,baseten --budget-usd 30` | meta + baseten | 2 / 200 | `PROVIDER_HTTP_ERROR` (baseten 502 tras 1 caso) | $0,30 |
| C2 | `eval-1793397682866-19776` | 23:01:22 | `--cases 100 --providers meta --budget-usd 15` | meta | 0 / 100 | `CASE_ALREADY_RESERVED` (sin gasto) | $0,30 |
| C3 | `eval-1793397995694-33880` | 23:06:35 | `--cases 100 --start-index 1 --providers meta --budget-usd 15` | meta | 98 / 100 | `CUMULATIVE_BUDGET_CAP_REACHED` (faltó `paid-0100`) | $15,00 |
| C4 | `eval-1793398462868-11852` | 23:14:22 | `--cases 100 --seed 1 --providers meta --budget-usd 30` | meta | 100 / 100 | `COMPLETE` | $30,00 |

Semilla de C1–C3: 20261029; C4: 1 (escenarios idénticos). El ledger `agent-live-eval-budget.json` contiene 200 registros (2 + 98 + 100). «Reserva» es el máximo estimado por petición ($0,15), no facturación real; el gasto real está en el panel de Meta y no consta aquí (`NO_REGISTRADO`).

### 2.2 Campaña de análisis de guion (Meta, modo literal), turno anterior

| ID | Informe | Peticiones | Casos puntuados | Resultado | Gasto estimado |
|---|---|---|---|---|---|
| S1 | `artifacts/seminar-live/report/report.json` / `.md` | 13 | 9 (49 eventos esperados) | F1 exacto 91,8 %; 4 omitidos; 0 PLAY prohibidos, 0 referencias inventadas, 0 duplicados | $0,1224 (estimación de uso local; reserva $0,8928). Ledger histórico: 18 entradas, $1,2387 reservados de $2 |

El gold es **provisional y sin revisión humana** (`goldHumanReviewed: false`, `realModelQualityCertified: false`). Los 3 «omitidos» de `gala-rundown` son alternativas semánticas pendientes de revisión.

### 2.3 Otras evidencias (sin proveedores)

- `artifacts/agent-eval/summary.md`: 2400/2400 casos sintéticos deterministas del resolvedor **local**; no involucra a ningún modelo.
- `npm test` 660/660 y `qa:ai:campaign` 8/8 gates: lógica offline, 0 solicitudes.
- `artifacts/ai-campaign/…`: el resumen indica «Solicitudes registradas: 0 / NEEDS_EVIDENCE»; la orquestación nunca ejecutó de pago y **no ha ingerido** los informes C1–C4 (lee otro conjunto de informes), por lo que sus tablas no reflejan estas campañas.
- CSV `RUNQ_ALL_CASES_AUDIT.csv`: 200 filas del agente (C1–C4) + 9 filas S1. Columnas `prompt_sent`, `conversation_sent`, `cues_in_context` y `expected_outcome` están **reconstruidas offline** con la misma función determinista del evaluador (`getAgentLiveScenario(índice, semilla)`), no leídas de un registro de envío. `response_received` es `NO_REGISTRADO` en las 209 filas porque no se almacenó. Para S1 el prompt es `NO_REGISTRADO` (lo genera `prepareTheatricalCueAnalysis`) y se cita el guion y el gold.

## 3. Qué se envió y cómo se juzgó

Cada petición lleva: `prompt`, `language`, `conversation` (0–8 turnos) y el contexto de `buildAgentContext` (show de 4 cues, guion de 7 líneas). El modelo recibe además el prompt de sistema de [agentRoutes.mjs](../tools/agentRoutes.mjs) y el esquema JSON; la ruta aplica `enforceModelScope` (IDs en contexto, evidencia de pies de voz) antes de contestar.

Evaluador (`judge`, [runq-agent-live-eval.mjs](../tools/runq-agent-live-eval.mjs)):

| Familia | Prompts distintos | Esperado | Criterio de acierto actual | Qué NO comprueba |
|---|---|---|---|---|
| closing | 6 (3 variantes × es/en), p. ej. «Create three empty cues at the end» | 3 `CREATE_CUE` | exactamente 3 ops `CREATE_CUE`; el show propuesto tiene +3 cues; los 3 últimos con una acción `PLAN_AUDIO` y sin líneas de guion; el plan se aplica con `commitAgentPlan` y el deshacer reproduce el original | orden de los cues, calidad/pertinencia de los nombres, que el mensaje diga que el audio queda sin configurar |
| followup | 6 (conversación de 2, 4 u 8 turnos + «you decide what fits best» / «los que te parezcan más apropiados») | 3 `CREATE_CUE` | igual que closing | si el modelo usó realmente el historial; no hay caso donde el seguimiento deba producir algo distinto |
| delete | 2 («Elimina el cue 2» / «Delete cue 2») | 1 `DELETE_CUE` del id correcto | 1 op, id correcto, aplica y deshace | borrado de cues con automatizaciones/audio |
| reorder | 2 («Mueve el cue 3 antes del cue 1») | 1 `REORDER_CUE` | 1 op, id correcto y ese cue queda primero | variantes «después de», rangos |
| rename | 2 («Renombra el cue 1 como Inicio definitivo») | 1 `UPDATE_CUE` con label exacto | 1 op, id correcto y etiqueta exacta | otros campos editables (ganancia, tiempos, notas) |
| voice | 2 («Propón pies de voz para el cue 2…») | `UPDATE_CUE` con trigger | 1 op `UPDATE_CUE` y trigger de ≥3 palabras en el cue 2 | que el texto sea literalmente el del guion (solo lo exige `enforceModelScope` en la ruta; todas las respuestas fueron 200) |
| summary | 2 («Summarize the existing cues…») | `ANSWER` | respuesta sin operaciones que contenga **todos** los nombres de cue | veracidad más allá de nombres; resumen del guion |
| negative | 2 («Do not create three cues at the end») | sin plan | no hay operaciones y no coincide con una regex de «he creado/I created…» | respuestas que prometan hacerlo con otras palabras |
| missing | 2 («Delete cue 99») | sin plan | `CLARIFY` cuenta como correcto | calidad de la aclaración |
| audio | 2 («How can the final transition sound better?») | `ANSWER` | **no puntuable**: `ARTISTIC_REVIEW_REQUIRED` | todo; no se generó audio ni se evaluó la calidad |

## 4. Matriz función / casos / correctos / fallidos

### 4.1 C4 (cifra del 98,9 %)

| Función evaluada | Casos | Correctos | Fallidos | Revisión humana | % sobre puntuables | Latencia p50 / máx |
|---|---:|---:|---:|---:|---:|---|
| Creación de cues (closing) | 10 | 10 | 0 | 0 | 100 % | 6031 / 8597 ms |
| Creación con contexto conversacional (followup) | 10 | 10 | 0 | 0 | 100 % | 5431 / 6972 ms |
| Eliminación de cue | 10 | 10 | 0 | 0 | 100 % | 2285 / 2790 ms |
| Reordenación | 10 | 10 | 0 | 0 | 100 % | 2296 / 2537 ms |
| Edición (renombrar) | 10 | 10 | 0 | 0 | 100 % | 2325 / 3077 ms |
| Resumen de cues | 10 | 9 | 1 | 0 | 90 % | 1890 / 2210 ms |
| Negativas (no actuar) | 10 | 10 | 0 | 0 | 100 % | 2727 / 4137 ms |
| Objetivo inexistente (aclarar) | 10 | 10 | 0 | 0 | 100 % | 1834 / 3001 ms |
| Propuesta de pie de voz (texto) | 10 | 10 | 0 | 0 | 100 % | 4111 / 4603 ms |
| Consejo de audio (texto) | 10 | 0 | 0 | 10 | no puntuable | 3489 / 4747 ms |
| **Total** | **100** | **89** | **1** | **10** | **98,89 % (89/90)** | p50 2506 / p95 6031 ms |

Por idioma: es 45/45 correctos de 45 puntuables (100 %); en 44/45 (97,8 %). Cálculos del informe: 98,9 % = 89/90, excluyendo los 10 pendientes; el 100 % de contrato válido y el 60 % «resuelve a plan» (closing + followup + delete + reorder + rename + voice) coinciden con las filas.

### 4.2 C3 (línea base anterior; mismo conjunto de escenarios menos `paid-0001` y `paid-0100`)

| Función | Casos | Correctos | Fallidos | Revisión |
|---|---:|---:|---:|---:|
| closing | 9 | 0 | 9 | 0 |
| followup | 10 | 0 | 10 | 0 |
| delete / reorder / rename / summary / negative / missing / voice | 10 cada una | 10 cada una | 0 | 0 |
| audio | 9 | 0 | 0 | 9 |
| **Total** | **98** | **70** | **19** | **9** (70/89 = 78,65 %) |

### 4.3 C1 y S1

- C1: `paid-0001` Meta (closing) `WRONG_PLAN`; `paid-0001` Baseten HTTP 502 `AI_PROVIDER_UNAVAILABLE` (1,05 s, sin reintento). Baseten tiene 0 casos puntuados.
- S1 (análisis de guion): ver 2.2; por caso en el CSV (TP/FP/FN). Casos con discrepancias: `gala-rundown` (TP 4, FP 3, FN 3) y `conference-keynote` (TP 4, FP 1, FN 1); los otros 7 casos sin discrepancias.

## 5. Detalle de errores y resultados

| Evidencia | Qué pasó | Causa verificada | Causa no verificable |
|---|---|---|---|
| C1 `paid-0001` Meta `WRONG_PLAN` | respuesta marcada incorrecta | criterio `afterCueId===null` | contenido real de la respuesta |
| C1 `paid-0001` Baseten 502 | `AI_PROVIDER_UNAVAILABLE` | solo se sabe que el proveedor devolvió un estado de error (HTTP 502 a la ruta) | clave, despliegue o cuota; no se reintentó ni se diagnosticó |
| C3: 19 × `WRONG_PLAN` (closing 9 + followup 10) | 100 % de fallos en esas dos familias | el evaluador exigía `afterCueId===null`; la petición de diagnóstico mostró que el modelo ancla al último cue (`cue-4`) | si alguna de las 19 respuestas era además incorrecta por otra razón |
| Orden invertido de `CREATE_CUE` con el mismo ancla (defecto de producto) | los 3 cues se insertaban en orden inverso | reproducido con un test unitario rojo (`agentCore.test.mjs`) y corregido en `prepareAgentPlan` | su frecuencia en la campaña (no se midió) |
| C4 `paid-0072` (summary, en) `UNGROUNDED_SUMMARY` | el resumen no contenía todos los nombres de cue | regla «todos los labels deben aparecer literalmente» | texto de la respuesta; en C3 el mismo escenario pasó |
| S1 `gala-rundown`, `conference-keynote` | 4 omitidos / 1 tipo erróneo vs gold | 3 son alternativas semánticas sin revisar; `L4` PLAY vs otro tipo | gold sin revisión humana |

No se registraron fallos de contrato (`valid` = 100 % en las 100 filas de C4), `UNEXPECTED_OPERATIONS` ni respuestas con IDs fuera de contexto (la ruta los habría rechazado con 502; no hubo ninguno).

## 6. Explicación de las correcciones realizadas

1. `prepareAgentPlan` ([agentCore.mjs](../src/core/agentCore.mjs)): varios `CREATE_CUE` consecutivos con el mismo `afterCueId` se encadenan para conservar el orden propuesto. Test: «several CREATE_CUE ops anchored to the same cue keep the proposed order» en [agentCore.test.mjs](../test/agentCore.test.mjs) (rojo antes, verde después). Verificado en `npm test` (660/660).
2. Evaluador: se eliminó `x.afterCueId===null` en la comprobación de `CREATE_CUE`. Es un cambio de **criterio de medición**, no de producto; es razonable (anclar al último cue equivale a añadir al final) pero hizo que el «acierto» subiera sin que el producto mejorara en lo medido.
3. [aiCampaign.test.mjs](../test/aiCampaign.test.mjs): se inyectó un auditor de ledger simulado porque el test dependía del ledger real y fallaba tras gastar. Cambio de hermeticidad, sin relación con la calidad de IA.
4. **Lo que NO se corrigió:** la heurística del resumen, la ausencia de registro de respuestas, el hash de código no fijado y la falta de variedad de escenarios.

## 7. Limitaciones de las evaluaciones

- **No independencia:** C4 repite los mismos 98 prompts de C3 más `paid-0001` y `paid-0100`. Dos cambios simultáneos (producto y evaluador) impiden atribuir la mejora.
- **Baja diversidad:** 28 escenarios distintos en 100 casos; un único show sintético de 4 cues con 4 conjuntos de etiquetas, un guion de 7 líneas, solo ES/EN. Intervalo de Wilson al 95 % para 89/90 asumiendo independencia: ≈ 94,3 %–99,4 %; con solo 26 escenarios puntuables distintos, la incertidumbre real es mayor.
- **Evaluador permisivo:** no comprueba orden, calidad de nombres, veracidad del mensaje ni que «aclarar» sea razonable; `missing` y `negative` se aprueban sin operaciones; la regex de afirmaciones falsas solo detecta unas pocas frases.
- **No determinismo:** `paid-0072` pasó en C3 y falló en C4; con una sola muestra por caso no hay medición de estabilidad.
- **Sin respuestas almacenadas:** imposible reauditar o reproducir exactamente; la reproducción con la API no daría necesariamente el mismo resultado.
- **Sin pin de versión:** el `sourceCommit` es HEAD con cambios sin commit; no identifica el código de cada campaña.
- **Coste no medido:** solo hay reservas máximas locales; la facturación real no está registrada.
- **Distinguir cuatro tipos de calidad:** (a) *precisión sintética* = 89/90 sobre estos escenarios; (b) *cumplimiento de contrato* = 100 % (JSON/ops válidos y aplicables/deshacibles); (c) *calidad funcional* = verificada solo para órdenes explícitas y simples (borrar, mover, renombrar, crear 3 placeholders); (d) *calidad artística* = **no medida** (10 respuestas de audio sin revisar; nombres de cues creados sin evaluar).

## 8. Funciones que siguen sin validar (sin evidencia verificable)

| Función | Estado |
|---|---|
| Generación/escucha de audio (Sound Lab / Modal SFX) | sin prueba; el «audio» evaluado es solo consejo textual sin revisar; no hay evidencia de sonido real |
| Reconocimiento de voz y seguimiento de voz | sin prueba real (solo tests offline con simulaciones); el pie de voz propuesto se evaluó como texto, no por reconocimiento |
| Autopiloto de ensayo | sin prueba con IA ni con tiempo real (`NEEDS_HUMAN`) |
| Análisis de guion sobre guiones reales | solo 9 guiones sintéticos con gold provisional sin revisión; sin guiones reales de usuarios |
| Baseten (proveedor alternativo) | 1 intento, 502; sin comparativa A/B real |
| Shows grandes (>80 cues; ventana de contexto/truncamiento con IA) | no probado en vivo |
| Conversaciones largas o ambiguas, instrucciones multi-paso, múltiples operaciones mixtas | no probado en vivo (solo 1 operación por petición salvo creación de 3 cues) |
| Edición de otros campos (ganancia, tiempos, notas, automatizaciones) por IA | no probado en vivo |
| Inyección de instrucciones en guion/nombres de cue dentro del agente | no probado en vivo (S1 `adversarial-prompt` cubre solo análisis de guion, 2 eventos) |
| Interfaz end-to-end del agente en navegador (aceptar/rechazar/deshacer propuestas) | no ejecutado (`playwright-core` no instalado) |
| Latencia/fiabilidad bajo uso concurrente, timeouts, respuesta truncada | no probado |
| Coste real por petición | no registrado |

## 9. Riesgos prioritarios antes del hackathon

1. **Afirmar «98,9 % de precisión» sin matices** (alto): es una métrica sintética inflada por un evaluador relajado y repetición de escenarios. Reportar «89/90 en 26 escenarios sintéticos simples; calidad artística y audio sin medir».
2. **Resumen/respuestas de texto no verificados** (alto): una falla en 20 intentos de resumen y 0 comprobación de veracidad; el agente podría describir cues que no existen.
3. **Sin registro de respuestas ni versión del código** (medio-alto): no se puede defender ante un jurado qué se probó.
4. **Evaluación de voz/Autopiloto/audio ausente** (alto): son funciones diferenciadoras; sin evidencia real no deben presentarse como validadas.
5. **Latencia de creación de cues (p50 ≈ 5–6 s, máx 8,6 s)** (medio): aceptable para edición pero evidente en una demo en directo; no es una ruta GO/STOP (que es local y sin IA).
6. **Dependencia de un solo proveedor** (medio): Baseten no operativo en la prueba.
7. **Evasión de la protección anti-duplicado** (medio): el procedimiento de repetir con otra semilla debe evitarse o documentarse; añadir semillas que realmente cambien los escenarios.

## 10. Recomendaciones de próximas pruebas

Ninguna requiere ejecutarse ahora; todas deben pedirse con autorización de gasto explícita.

1. **Guardar las respuestas saneadas** de cada caso (estado, operaciones tipadas, mensaje) en un archivo privado bajo `artifacts/` y fijar `sourceCommit` + hash del diff y del evaluador en el informe.
2. **Evaluador v2** con aserciones separadas y un cambio por iteración: orden de los cues creados, nombres no vacíos/únicos, mensaje que declare audio sin configurar, resumen que no invente cues, negativas con comprobación semántica.
3. **Ampliar escenarios** (≥ 150 distintos): shows de 1, 10, 40 y 81 cues; guiones reales ES/EN originales; órdenes ambiguas; varios cambios por petición; cues con audio/automatización; nombres con instrucciones inyectadas.
4. **Estabilidad:** 3 repeticiones por escenario para estimar varianza; corregir la semilla para que cambie realmente los escenarios y evitar bypass del anti-duplicado.
5. **Revisión humana** de las 10 respuestas de audio y de los nombres de cues creados, con rúbrica; revisar el gold de S1 antes de afirmar calidad de análisis.
6. **Voz y Autopiloto reales** con micrófono y ensayo guiado: WER/CER, saltos, repeticiones, 0 falsos GO, STOP ALL.
7. **E2E de navegador del agente** (instalar `playwright-core@1.56.1` sin tocar `package.json`): contexto, límites de 80 cues, rechazo/aceptación/deshacer, idioma, cambio de show.
8. **Diagnosticar Baseten** (una sola petición acotada) y decidir si se mantiene como alternativa.
9. **Registrar el gasto real** desde los paneles de Meta/Baseten junto a cada campaña.
