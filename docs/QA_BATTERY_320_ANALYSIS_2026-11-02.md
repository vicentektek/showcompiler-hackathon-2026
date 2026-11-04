# RUNQ — auditoría de la batería Meta AI (320 casos)

Fecha: 2026-11-02. Fuente: archivos facilitados por el responsable del proyecto: `RUNQ_RESULTADOS_320.zip`, `run.json`, `report.md`. Este documento analiza resultados **sin repetir llamadas de pago**. La campaña se ejecutó en un worktree local; **no se ha verificado que el código del runner y del producto coincidan con el HEAD de este repositorio remoto**.

## Resumen verificable

- Modelo: Muse Spark 1.3 (Meta). Comparación A (contexto anterior) y D (contexto experto).
- SHA de origen declarado: `e179a0f72a258b21902b36d7d42cb4fbd58db12f35e0542ae3e3cbb11a420d4e`.
- 320 casos planificados; 319 COMPLETED (160 A, 159 D), 1 UNKNOWN (`large-04` D), 0 pendientes.
- Reserva conservadora de campaña: **15.192447 EUR / 60 EUR**, **no facturación**. Estimación de tokens conocidos: **1.733143 USD**, tampoco facturación.
- Esquema válido: 160/160 A y 159/159 D entre COMPLETED.
- Estado esperado: 133/160 A y 138/159 D.
- Referencias conocidas: 148/160 A y 154/159 D.
- Rúbricas completas deterministas: 35/50 A, 44/49 D, total 79/99. Otras respuestas son STATUS_AND_SHAPE_ONLY o fallos clasificados por el runner: **no contarlas como aciertos semánticos**.
- En los pares con oráculo completo: D mejora 11, empeora 2, empata 32. Esta comparación no es una calificación humana de utilidad.
- `semanticRating` es `NOT_RATED`; no se guardaron respuestas literales del modelo. No se pueden inferir calidad creativa, adecuación operativa, comprensión real ni utilidad de las explicaciones.

## Interpretación

**Señal positiva**: D reduce fallos de estado (27 A frente a 21 D si se incluye el resultado D no evaluable en el denominador de los 160; entre respuestas completas D tiene 17 fallos de estado y 4 estados sin puntuación), reduce referencias desconocidas (12 A a 5 D) y mejora los contratos evaluables. **No es prueba de superioridad universal**: la composición de casos evaluables difiere ligeramente por el UNKNOWN y por coberturas; hay dos regresiones emparejadas y muchos casos sin oráculo semántico.

**No confundir** `contractPass=false` en STATUS_AND_SHAPE_ONLY con fallo demostrado: el runner marca no aprobado incluso cuando no existe oráculo completo. Los 79/99 se refieren únicamente a rúbricas completas; no extrapolar 79/320.

**Limitación estructural**: no hay trazas literales completas para auditoría humana. Las pruebas de memoria usan contexto sintético, no una conversación real de 50 turnos. La batería no ejecuta GO/STOP ni muta proyectos. El UNKNOWN de `large-04 D` no debe repetirse sin revisión manual del ledger, idempotencia y autorización expresa.

## Backlog técnico priorizado

| Prioridad | Área | Hallazgo / hipótesis | Acción requerida | Criterio de aceptación |
|---|---|---|---|---|
| P0 | Seguridad de referencias | Se han observado referencias no reconocidas; la validación debe rechazar también `l9999` en minúsculas | Normalizar referencias Lxx de forma *case-insensitive* y validar existencia en el guion activo, sin fabricar líneas | Tests con `L9999`, `l9999`, espacios, Unicode, líneas válidas, duplicadas y cambio de guion; sin operaciones sobre líneas inexistentes |
| P0 | Estados / contrato | 27 A y 17 D respuestas completas con `expectedStatus=false`; cuatro D sin puntuación de estado | Auditar mapeo entre intención, estado del asistente y respuesta del modelo; aislar casos y reproducir offline | Suite determinista por estado esperado; no autorizar acciones ambiguas ni destructivas |
| P0 | Ledger de pago | `large-04 D` UNKNOWN por `MODEL_LINE_NOT_IN_CONTEXT` | Conservar UNKNOWN, no retry automático, no regenerar checkpoint ni duplicar reserva | Reinicio/resume offline idempotente; cero nuevas llamadas |
| P1 | Referencias / grounding | 12 A y 5 D referencias desconocidas | Restringir referencias a IDs del contexto suministrado; diagnosticar fallos por familia | Tests de citas válidas, ausencia de referencias inventadas, cambios de script |
| P1 | Memoria contextual | 3/8 A y 8/8 D contratos completos | Conservar ventajas de D, añadir pruebas de persistencia real, reset, aislamiento entre shows | Ningún dato de otro proyecto; recuperación de preferencias pertinentes |
| P1 | Diagnóstico técnico | 5/10 A y 9/10 D contratos completos | Convertir ejemplos fallidos en fixtures de diagnóstico | Explicaciones con requisitos y limitaciones correctos; sin afirmaciones de playback inexistente |
| P1 | Experiencia principiante | `beginner-02` falla A y D; `beginner-03` falla D | Revisar oráculos y rutas de ayuda; mejorar respuestas accionables | Tests de conceptos requeridos sin inventar capacidades |
| P1 | Identidad de cue | 4/4 A y D | Congelar comportamiento con tests de regresión | Identidad estable tras ordenación, edición, importación y persistencia |
| P2 | Evaluación semántica | `NOT_RATED` | Diseñar protocolo de evaluación humana ciega y almacenamiento seguro opt-in de respuestas futuras | Rúbrica explícita: exactitud, seguridad, utilidad, concreción, ES/EN; no usar datos de shows privados |
| P2 | UX / ejecución | La batería solo mide respuestas estructuradas | E2E offline de Studio/Stage, audio, voz, autopiloto, import/export y accesibilidad | Evidencia real con tests, no inferencias a partir de esta batería |

## Casos de regresión iniciales

`beginner-02` A/D; `beginner-03` D; `beginner-10` A/D; `ind-02` D; `ind-22` A/D; `large-04` D (UNKNOWN, solo diagnóstico offline). Ver `run.json` local para sus `grade`, `conceptMask`, `scenarioId`, `variant` y cobertura. **No se incluyen aquí prompts ni respuestas literales que no estén presentes en el material fuente**.

## Plan de implementación seguro

1. En el worktree local `C:\\Proyectos\\Hackaton 2026\\runq-assistant-expert-v3-2026-11-01`, comprobar `git status`, HEAD, AGENTS.md y estructura real. **No modificar el checkout principal con cambios sin commitear**.
2. Importar/leer `artifacts/qa-ai-battery-v1/report.md` y `run.json` solo localmente. Confirmar esquema y calcular denominadores por cobertura antes de atribuir defectos.
3. Buscar el validador de referencias en código real; escribir tests que reproduzcan minúsculas y líneas inexistentes **antes de corregirlo**. No alterar el runner histórico ni los resultados congelados.
4. Investigar estados erróneos mediante fixtures existentes, distinguir fallo del modelo de fallo del oráculo o de parseo. Corregir el punto de origen con tests.
5. Ejecutar pruebas offline de unidad, integración y E2E que existan realmente; publicar comandos, versión, resultados y fallos restantes. No afirmar que se ejecutaron tests desde esta revisión documental.
6. Comparar diffs, abrir PR **sin merge ni deploy**; revisar manualmente cualquier cambio que afecte a GO/STOP, audio, costes o seguridad.
7. Para futuras campañas: guardar outputs anonimizados y consentidos, registrar hashes de prompt/modelo/configuración, oráculos por caso, y separar puntuación determinista de revisión humana. Solicitudes de pago deshabilitadas por defecto.

## Condiciones de salida

- [ ] Validador de referencias corregido y probado.
- [ ] Estados fallidos triados por causa raíz.
- [ ] UNKNOWN conservado sin reintento.
- [ ] Tests offline ejecutados y evidencias adjuntas.
- [ ] Revisión semántica humana (si se dispone de outputs) sin inventar puntuaciones.
- [ ] PR revisado antes de merge.

**Alcance de esta entrega:** análisis documental de resultados facilitados, no corrección verificada del código de aplicación. Los artefactos originales permanecen en el worktree del operador; este documento no los publica ni los modifica.
