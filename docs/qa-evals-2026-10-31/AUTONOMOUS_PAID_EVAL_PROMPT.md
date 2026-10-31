# Prompt para Copilot — habilitar y ejecutar evaluación pagada autónoma RUNQ

## Continuación tras la batería offline verde (01/11/2026)

La última ejecución del usuario muestra `npm test` 736/736, `npm run check:syntax` correcto, `qa:meta:plan` con 0 solicitudes y `creditVerified:false`. **No repitas solamente las pruebas offline para terminar la tarea**; su propósito ahora es desbloquear prudentemente una evaluación real, sin ejecutar pagos si falta evidencia.

1. Protege el trabajo sin commit con backup externo, snapshot reproducible y hashes, o ejecuta sobre un worktree aislado que refleje exactamente el código nuevo. No exijas checkout limpio como condición absoluta. Sustituye la comprobación del runner por una prueba real de versión/snapshot; nunca la desactives sin alternativa.
2. Separa los gates de crédito de Meta y Modal. Investiga si Meta tiene crédito verificado independientemente de Modal; un crédito Modal desconocido NO tiene por qué impedir Meta. Si ambos son desconocidos, reporta qué evidencia oficial y actual necesita el usuario, sin afirmar aprobación ni saldo.
3. No confundir reserva restante de 58,502676 USD con saldo facturable real. Lee de nuevo el ledger y confirma el techo Meta de 65 USD y Modal de 35 USD, contando todas las reservas previas.
4. Si Meta o Modal queda en estado `READY` por evidencia, gateway, presupuesto y snapshot: realiza piloto de 1–2 llamadas bajo la autorización ya existente, serializado y sin reintentos. Si ninguno está listo, entrega diagnóstico técnico preciso y continúa con integración del corpus y E2E del Builder.
5. Mantén CI y pruebas habituales offline y sin cambios. No hacer merge automático ni exponer claves.


Trabajo actual: RUNQ / Meta Global AI Developer Hackathon 2026.

**Autorización económica vigente del usuario:** campaña TOTAL **100 USD** con **Meta Model API (Muse) máximo 65 USD y 400 solicitudes** y **Modal máximo 35 USD y 100 solicitudes**. Baseten, Fireworks y voz pagada: **cero**. Esta autorización permite a Copilot ejecutar solicitudes reales **sin pedirme aprobación por cada una**, una vez integrados los controles técnicos. No hay obligación de agotar el presupuesto.

Primero lee:
- AGENTS.md del checkout y de la rama de documentación.
- docs/qa-evals-2026-10-31/PAID_AUTONOMOUS_QA_POLICY.md
- docs/qa-evals-2026-10-31/paid-campaign-policy.json
- docs/qa-evals-2026-10-31/COPILOT_TASK.md
- docs/RUNQ_SYSTEMATIC_EVAL_PROTOCOL.md
- docs/qa-evals-2026-10-31/TEST_AND_TRAINING_STRATEGY.md

Los ficheros están en la rama remota \`docs/runq-evals-exhaustive-2026-10-31\`. Léalos con git fetch + git show, **sin sobrescribir mi worktree ni cambiar de rama**. La excepción económica nueva prevalece sobre el veto antiguo a los agentes solo dentro de esta campaña y solo cuando esté listo el gateway presupuestario. Sigue obedeciendo todas las demás protecciones de AGENTS.md.

OBJETIVO: **no limitarte a cambiar textos**. Implementa las guardas necesarias y después ejecuta los tests reales autorizados.

1. Inspecciona rama y cambios sin confirmar, respalda estado sin perder trabajo, establece tests base.
2. Inventaría reservas ya registradas, créditos Meta/Modal disponibles, ejecuciones previas y límites SFX efectivos. Nunca borres ledgers ni crees saldo nuevo por cambiar de worktree.
3. Construye un gateway persistente **único, atómico, compartido entre runners y worktrees**, con reserva previa en USD y contadores por proveedor, historial y lock. Meta máximo 65 USD, Modal máximo 35 USD, conjunto 100 USD, 400 y 100 llamadas; Baseten/Fireworks/Voice se bloquean.
4. Conecta el gateway a todas las rutas de inferencia pagada utilizadas en esta campaña, en especial runq-systematic-lab, runq-agent-live-eval y el runner QA específico de Modal. No admitas rutas sin control ni solicitudes ocultas. No desactives protecciones diarias, por solicitud, de concurrencia y sin-reintentos del generador Modal.
5. Implementa tests negativos del ledger (dos procesos, corrupción, exceder subpresupuesto, interrupción, timeout incierto, error 401/402/429, un segundo worktree, fallo después del envío). Todos deben funcionar offline.
6. Primero ejecuta dry-run y validación de presupuesto/saldo; si todo pasa, **YA ESTÁS AUTORIZADO A HACER LAS SOLICITUDES PAGADAS**, siempre secuenciales, con los flags --live --ack-paid, dentro del presupuesto y los máximos. Comienza con un piloto corto, evalúa calidad y solo escala los lotes cuando el resultado y el saldo estén claros.
7. Registra resultados por proveedor/guion/escenario y comparación de modelos, precisiones/errores, metadatos sanitizados, coste reservado y coste real si está disponible. STOP ALL, GO y Autopiloto nunca se ejecutan por decisiones de IA. Aprobación de cues siempre humana.
8. Detente automáticamente ante límite alcanzado, saldo desconocido, cuotas no comprobables, cobro incierto, proveedores excluidos o conflicto de código, y continúa realizando tests offline sin coste.
9. CI y npm test siguen estrictamente offline; no imprimir claves ni enviar scripts privados sin derechos. No cambiar main, no auto-merge ni publicar artefactos confidenciales.

**NO ME PIDAS QUE AUTORICE CADA REQUEST**: ya existe autorización hasta 100 USD dentro de esta campaña. Pero **no ejecutes nada de pago si el gateway, los límites de crédito o el plan de llamadas no están verificados**. Primero programa y prueba; después ejecuta lo permitido. Informa periódicamente de casos medidos, número de peticiones y reserva restante. Deja un informe final reproducible por SHA, seed y conjunto de pruebas.
