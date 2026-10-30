# RUNQ AI — Programa automático de pruebas (30 octubre 2026)

**Código:** PR #122 sobre PR #121. **Función principal:** `tools/runq-ai-campaign.mjs` / `npm run qa:ai:campaign`.
**Política:** SIN solicitudes de pago por defecto. No modifica proyectos ni controla GO/STOP/ARM, no entrena ni modifica prompts automáticamente y nunca fusiona `main`.

## 1. Instalación segura para la sesión de esta tarde

Desde cualquier PowerShell abierto en tu carpeta de RUNQ, cuando no haya cambios sin guardar:

```powershell
git fetch origin
git worktree add "..\runq-ai-campaign" origin/feat/runq-ai-campaign-orchestrator-2026-10-30
cd "..\runq-ai-campaign"
npm install
npm run qa:ai:campaign
```

Se crea una **copia independiente** para que ninguna rama de diseño/voz/sonido se altere. El worktree queda habitualmente en HEAD desacoplado; es correcto para ejecutar pruebas.

El último comando ejecuta **todo lo disponible sin gasto**: sintaxis, unitarias, integraciones, QA de Codex, 2.400 casos locales del agente, y planificadores Meta, Baseten, Agent y Systematic. Lee informes reales antiguos en esta copia, los clasifica y prepara un manifiesto de 40 solicitudes de IA (SIN enviarlas). Calcula sus escenarios ES/EN, SHA-256 y una lista priorizada de pruebas adicionales.

**Aviso:** las copias de trabajo no comparten automáticamente `.env`, `.runq-local` ni informes ignorados por Git. Esto afecta a los presupuestos persistentes. No copies ni borres un ledger para eludir restricciones: si cambias de worktree entre tandas deberás conciliar el historial. Lo más seguro es ejecutar **toda la campaña real en la misma copia**.

## 2. Resultados automáticos

Cada ejecución crea un directorio separado en `artifacts/ai-campaign/run-.../` con:

- `summary.md`: estado general, exactitud de solicitudes reales, evaluación ES/EN, errores de servidor, coincidencias A/B, otros sistemas IA y recomendaciones.
- `summary.json`: métricas estructuradas y manifiesto reproducible.
- `review-queue.csv`: fallos y consultas que requieren una persona; contiene IDs sintéticos y diagnósticos limitados, nunca prompts ni respuestas originales.

Los informes de proveedor del agente se guardan en `artifacts/agent-live-eval/eval-....json/md`; el presupuesto local persistente está en `.runq-local/agent-live-eval-budget.json`. **No borrar** el archivo, ni su `.lock` si otro proceso está funcionando.

Las pruebas pagadas del agente quedan identificadas por proveedor+seed+índice, y el coordinador:
1. no mezcla idiomas/categorías;
2. no repite IDs ya reservados;
3. compara solo casos iguales y detecta duplicados;
4. detecta registros pagados que no tienen resultado verificable;
5. detecta si se están mezclando commits distintos;
6. separa fallos HTTP y semánticos;
7. no puntúa consejos artísticos como aciertos objetivos;
8. detiene ante falta de prep, error grave, timeout o resultado remoto incierto.

## 3. Primera campaña REAL, una vez comprobados saldos/clave y preflight

**Comando para SOLO PLANIFICAR el primer lote (sin costes):**

```powershell
npm run qa:ai:campaign -- --cases 40 --providers meta,baseten --start-index 0 --seed 20261031 --budget-usd 30 --reserve-usd 0.15
```

Son 20 escenarios originales: 10 familias × dos idiomas, con 2 modelos = **40 peticiones reales cuando autorices**. Reserva teórica: 6 USD (no precio facturado).

Antes de autorizar: confirmar personalmente que **Meta** `muse-spark-1.3` y **Baseten** `meta-models/muse-spark-open-1026` están habilitados; `MODEL_API_KEY` y `BASETEN_API_KEY` disponibles en la sesión Node, saldo/créditos y facturación externa; ningún job SFX sin resolver; ledger sin reservas huérfanas. No compartir las claves, `.env` ni respuestas privadas.

**Solo si aceptas expresamente el gasto de ese lote**, añade ambos flags al mismo comando:
```powershell
npm run qa:ai:campaign -- --cases 40 --providers meta,baseten --start-index 0 --seed 20261031 --budget-usd 30 --reserve-usd 0.15 --live --ack-paid
```

La ejecución abre un servidor de inferencia en loopback, envía casos en secuencia, limita el total a 40 intentos con reservas locales, NO reintenta los fallidos, y cierra el servidor al finalizar. Se detiene si hay fallo de preflight, ausencia de credencial, respuesta anómala o bloqueo de proveedor. Puede facturarse aunque haya error/time-out; mirar Usage/Billing.

### Después de revisar los primeros resultados

**PLAN sin gasto de 160 solicitudes DISTINTAS:**
```powershell
npm run qa:ai:campaign -- --cases 160 --providers meta,baseten --start-index 20 --seed 20261031 --budget-usd 30 --reserve-usd 0.15
```

Si el primer tramo es sano y quieres autorizar ese segundo gasto, volver a ejecutar con `--live --ack-paid`. El segundo tramo reserva teóricamente 24 USD; el acumulado por estas 200 peticiones sería 30 USD, siempre sujeto al ledger y a la facturación real. **NO bajar el valor `--reserve-usd` para esquivar un límite.**

Si un proveedor no está disponible, **detén A/B**. Es posible lanzar una campaña independiente de un solo proveedor, pero no compares modelos diferentes ni informes no emparejados. Nuevos experimentos deben usar casos/semillas diferentes y un nuevo presupuesto explícitamente aprobado.

## 4. Reanalizar todo SIN nuevas llamadas

```powershell
npm run qa:ai:campaign -- --report-only
```

Lee informes del agente, Meta teatral, Baseten teatral, SFX Modal y ledger local, y genera un diagnóstico nuevo. No usa claves ni llama a los proveedores. Útil después de corregir documentación o anotar una incidencia.

## 5. Cómo interpreta la calidad

Estados posibles:

| Estado | Interpretación |
|---|---|
| `READY_FOR_OPERATOR_REVIEW` | Han terminado los tests offline y se puede revisar el plan de pago |
| `NEEDS_EVIDENCE` | No hay muestra real suficiente o no se ha ejecutado la fase |
| `NEEDS_FRESH_PREFLIGHT` | Hay informes reales, pero falta validar esta copia con el código actual |
| `AUTOMATED_GATES_PASS` | Muestra suficiente y métricas automáticas superiores a los umbrales; **no** certifica show ni audio |
| `QUALITY_GATES_FAIL` | Datos suficientes y métricas insuficientes; revisar familias más débiles |
| `BLOCKED` | Error crítico: preflight, resultados duplicados, mezcla de commits, reserva sin informe o situación remota incierta |
| `PRIOR_RESERVATIONS_NEED_RECONCILIATION` | Hay reservas sin evidencia local; no enviar más hasta aclararlo |
| `PAID_BATCH_STOPPED` | La campaña autorizada se detuvo sin completar todos sus intentos |
| `PREVIOUS_PAID_CAMPAIGN_INCIDENT` | Falló una tanda anterior con esa misma semilla; la automatización bloquea nuevas peticiones hasta revisar el incidente y crear un experimento distinto |

**Criterios automáticos iniciales del agente:** >=60 casos evaluados por proveedor, >=25 por idioma y >=4 intentos por categoría; >=95 % de exactitud semántica en el subconjunto evaluable y >=99 % de respuestas contractualmente válidas entre HTTP 200. Son **objetivos de aceptación internos**, no un estándar oficial.

Cada familia objetiva (todas salvo `audio`) necesita además al menos cuatro casos puntuados y superar esos mismos umbrales; una media global alta ya no puede ocultar una familia débil. `audio` permanece fuera del PASS semántico automático porque exige valoración humana.

La cifra de acierto no incluye respuestas sin HTTP 200 ni consejos artísticos pendientes de juicio humano. Los fallos se conservan por separado. El sistema presenta comparaciones pareadas y exige fuente/commit coherentes para no mezclar evaluaciones incompatibles.

## 6. Las demás IA: grado real de automatización

El coordinador **incorpora automáticamente los informes existentes**, si están presentes:
- Guion Meta: `artifacts/seminar-live/report.json`;
- Guion Baseten: `artifacts/seminar-baseten/report.json`;
- Modal SFX: última evidencia `.runq-local/sfx-latency-lab/report-*.json`.

Sólo considera experiencia REAL si esos informes lo declaran; jamás transforma un DRY RUN en un F1 real. El F1 de guion sigue siendo provisional mientras no haya validación humana del gold; los WAV generados requieren escucha.

Pruebas de pago específicas del guion tienen runners separados con aprobación propia (`qa:meta:live` y el runner Baseten); **no se encadenan automáticamente al asistente** porque utilizan ledgers/políticas diferentes. Para SFX comprobar primero `npm run sfx:doctor` y el journal Modal. No añadir flags de pago ocultos a CI.

Reconocimiento de voz real, Autopiloto armado, fidelidad de sonidos, calidad artística y hardware necesitan micrófono/altavoces y operador. La batería sintética puede probar su lógica, pero el informe los marca pendientes de aceptación y no promete precisión WER/CER ni falsos GO cero sin medirlos.

## 7. Qué hacer con los fallos

- Error de preflight: reproducirlo localmente, escribir test rojo, corregir, repetir preflight. **No gastar.**
- Error de credencial, 429 o HTTP 5xx: detener inmediatamente; verificar cuota y estado remoto. **No retry automático.**
- `UNKNOWN_REMOTE_OUTCOME`: el proveedor pudo cobrar. Conciliar con Dashboard y registro local.
- `RECONCILE_REQUIRED`: una reserva no tiene informe de resultado. Investigar antes de abrir otra campaña; no borrar ni editar el ledger.
- `MIXED_COMMIT`: comparar únicamente código, gold y prompts de una revisión fija.
- Fallo semántico: revisar gold y caso; modificar solo prompt/validador tras test rojo; ejecutar **nuevos** casos y un holdout.
- Valoración artística: revisar con regidor/técnico, escuchar el audio antes de aceptar y documentar observaciones.

## 8. Restricciones de entrega

Las PR #121 y #122 son borradores, sin fusionar `main`. GitHub Actions sigue sin autorizar llamadas pagadas y ejecuta análisis offline únicamente. La demostración de RUNQ no debe describirse como certificada para Directo profesional, ASIO, PFL, integración de hardware o TTS mientras esas funciones no estén implementadas y validadas.
