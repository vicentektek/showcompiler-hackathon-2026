# RUNQ AI — Preparación ejecutable para 31/10/2026
**Rama:** test/runq-agent-paid-eval-hardening-2026-10-30 (PR #121, draft).
**Base:** integration/runq-demo-2026-10-30.
**Estado:** software de preflight/evaluación preparado; **ninguna inferencia facturada durante estos cambios**.

## 1. Qué se ha endurecido

- El evaluador real cruza cada uno de los 10 grupos de intención con **es y en**, en lugar de probar cada grupo siempre en un solo idioma. Cada idioma lleva un guion sintético propio.
- `--start-index` separa tandas de casos y el identificador del escenario se mantiene entre proveedores de un par A/B.
- El ledger bloqueado `.runq-local/agent-live-eval-budget.json` registra claves únicas de reserva por **semilla + índice + proveedor**. Si una solicitud ya tuvo fondos reservados, no se vuelve a enviar en otro intento con la misma identidad, incluso cuando se desconoce si el proveedor facturó.
- Un resultado remoto de red incierto detiene el lote. Los errores de autenticación/cuota deshabilitan el proveedor afectado.
- Las respuestas de resumen se comparan con los nombres reales de los cues. Los consejos artísticos de audio no se puntúan automáticamente: `ARTISTIC_REVIEW_REQUIRED`.
- El reporte agrega denominadores evaluados (excluye consultas que requieren evaluación humana), resultados por idioma y percentil p95 de latencia.
- Nuevo comando `npm run qa:ai:preflight` agrupa pruebas/simulaciones offline en entorno sin claves de inferencia.

## 2. Preparación gratuita recomendada en Windows

En una COPIA de trabajo independiente, sin cambios pendientes:
```powershell
git fetch origin
git worktree add "..\runq-agent-qa" origin/test/runq-agent-paid-eval-hardening-2026-10-30
cd "..\runq-agent-qa"
npm install
npm run qa:ai:preflight
```

El comando ejecuta sintaxis, Node, Codex, 2.400 pruebas sintéticas del agente y planes de los proveedores SIN inferencia. Resumen en `artifacts/ai-preflight/summary.json`.

Además, comprobar **sin inferencia** en la misma copia:
```powershell
npm run sfx:doctor
```
El doctor puede declarar la generación SFX bloqueada por configuración. Esto requiere una actuación independiente; no se arregla modificando arbitrariamente el presupuesto estimado.

## 3. DRY RUN del agente, sin gastos

Para inspeccionar la cobertura del **primer tramo de 40 solicitudes** (20 escenarios únicos × 2 proveedores, cubre las 10 categorías en ambos idiomas):
```powershell
npm run qa:agent:live -- --cases 40 --providers meta,baseten --start-index 0 --seed 20261031 --budget-usd 30 --reserve-usd 0.15
```
Para el segundo tramo de **160 solicitudes diferentes**:
```powershell
npm run qa:agent:live -- --cases 160 --providers meta,baseten --start-index 20 --seed 20261031 --budget-usd 30 --reserve-usd 0.15
```

**Importante:** Estos comandos son planes (sin `--live --ack-paid`). El primero reserva teóricamente 6 USD y el segundo 24 USD, total 30 USD si se autorizan las dos tandas. La reserva es conservadora y no equivale a precio/cargo real.

## 4. Únicamente después de los gates, autorización de pago

No utilizar comandos de pago desde agentes o CI. Un operador humano revisa antes el saldo y las credenciales de cada proveedor, modelo correcto, presupuesto, estado de los jobs externos, ausencia de incidencias P0 y el manifiesto del lote. Si da autorización **expresa por tramo**, puede volver a ejecutar el comando de planificación correspondiente añadiendo `--live --ack-paid`.

**No ejecutar automáticamente al leer este documento.** El propio `--live --ack-paid` da autorización a nivel de CLI pero no sustituye comprobar manualmente facturación ni permisos.

El sistema distingue:
- Meta Model API: `muse-spark-1.3`, clave `MODEL_API_KEY`.
- Baseten: `meta-models/muse-spark-open-1026`, clave `BASETEN_API_KEY`.
- Modal SFX: política/journal independientes; **NO** usar `--start-index` del agente para Modal.

Si Baseten no da acceso al modelo esperado, ejecutar A/B se bloquea; no sustituir por otro modelo e interpretar el resultado como comparable.

## 5. Interpretar y continuar de forma segura

- **Preflight falla:** corregir primero; no hacer prueba masiva pagada.
- **CASE_ALREADY_RESERVED:** revisar archivo de ledger y resultados. El mismo índice/semilla/proveedor NO se reenvía. Para un nuevo experimento explícito usar nuevos índices.
- **UNKNOWN_REMOTE_OUTCOME:** verificar facturación/estado remoto antes de cualquier campaña adicional, no reintentar esa solicitud.
- **CUMULATIVE_BUDGET_CAP_REACHED:** revisar reservas acumuladas y facturas reales. No borrar el ledger para obtener más cupo.
- **ARTISTIC_REVIEW_REQUIRED:** escuchar/valorar por humano; no contar como acierto automático.
- **La API responde:** todavía falta aceptación en Studio (diff, aprobación, undo, ZIP), reconocimiento de voz real, ensayo armado y escucha física.
- Los prompts/guiones sintéticos son originales. No enviar material confidencial a proveedores sin permiso.

## 6. Límites actuales que siguen pendientes

Este endurecimiento NO incorpora por sí mismo la evaluación de **jornadas conversacionales de 4–8 turnos aplicados a estado real**, corpus ASR 50+50+20, 30 ensayos físicos, escucha artística SFX, medición de factura real ni un panel unificado de QA. Se encuentran planificados en `docs/RUNQ_PAID_AI_ACCEPTANCE_2026-10-31.md` de PR #120 y requieren trabajo adicional. No confundir el éxito del primer lote con aceptación total.
