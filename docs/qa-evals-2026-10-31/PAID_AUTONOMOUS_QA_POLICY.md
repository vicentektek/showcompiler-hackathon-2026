# Política de QA de IA pagada y autónoma — RUNQ (31/10/2026)

**Estado: AUTORIZACIÓN DEL USUARIO REGISTRADA / EJECUCIÓN CONDICIONADA A GUARDAS TÉCNICAS.**

## 1. Autorización y alcance

El usuario autorizó el 31/10/2026 una campaña de **100 USD acumulados**, que sustituye a la anterior de 30 USD:

| Proveedor | Techo acumulado USD | Máximo de solicitudes de campaña | Permiso |
|---|---:|---:|---|
| Meta Model API / Muse | 65 | 400 | Permitido con guardas |
| Modal / SFX | 35 | 100 | Permitido con guardas y límites SFX vigentes |
| Baseten | 0 | 0 | Prohibido (sin crédito verificado) |
| Fireworks | 0 | 0 | Prohibido para solicitudes de pago |
| Voz u otros | 0 | 0 | Fuera de esta campaña |
| **TOTAL** | **100** | **500** | **Techo, no obligación de consumir** |

El usuario permite que **Copilot/Codex ejecute los lotes pagados autorizados sin volver a solicitar confirmación por cada solicitud**, exclusivamente en los runners de laboratorio especificados y tras cumplir los criterios de inicio. Esta autorización **no cubre suscripciones, compras, cambio de plan, servicios nuevos, el uso de datos de terceros sin derecho ni modificar credenciales**.

Los máximos de 400/100 son límites superiores de campaña, no exigencias de gastar ni de completar el número total. Solo se permite probar con guiones sintéticos o con guiones autorizados para transferencia al proveedor.

## 2. Previas OBLIGATORIAS antes del primer --live (fail closed)

1. Leer AGENTS.md, el estado de Git y la campaña previa existente. No cambiar de rama ni resetear trabajo sin respaldar los archivos modificados/no rastreados.
2. Inventariar **todos** los ledgers de la campaña anterior: .runq-local/meta-eval-budget.json, .runq-local/agent-live-eval-budget.json, cualquier ledger Modal/SFX y los registros de pagos del proveedor. Incluir reservas anteriores realizadas bajo la misma autorización. Una copia nueva del repo no significa saldo nuevo.
3. Verificar saldo de créditos en Meta y Modal y los términos de cobro. Si el saldo es desconocido, **no ejecutar** hasta verificarlo. Registrar manualmente el saldo o evidencia localmente, sin secretos.
4. Implementar **un único libro mayor persistente compartido por todos los runners de pago de la campaña** y por todas las copias/worktrees que puedan ejecutar peticiones. Debe bloquear concurrentemente, registrar reserva ANTES de cada envío, registrar resultado o incertidumbre después y conservar el historial de reservas sin reembolsar operaciones de resultado dudoso.
5. Verificar total reservado acumulado <= 100 USD, sublímite Meta <= 65 USD, Modal <= 35 USD y contadores Meta <= 400 y Modal <= 100. Rechazar cualquier proveedor no listado y cualquier presupuesto ausente/inválido.
6. Usar como límite efectivo el menor entre las cuotas globales, cuotas del proveedor, límites diarios/por solicitud vigentes, límites reales de crédito y controles de la API. **No elevar de forma tácita los límites SFX de Modal**; distinguir campaña QA de generación interactiva.
7. Pruebas offline negativas: ledger ausente/corrupto, lock concurrente, saldo insuficiente, reserva excedida, 429/401/402, timeout, desconexión, Ctrl+C, fallo después de enviar, reinicio, dos worktrees, cambios de proveedor, nuevos días. Ante incertidumbre, no repetir ni recuperar reserva automáticamente.
8. Publicar **solo código, tests y reportes sanitizados**. Los ledgers, claves, capturas privadas, prompts originales de terceros y consumos detallados quedan locales. No insertar claves en el frontend ni en comandos visibles.
9. La primera invocación real solo puede comenzar tras un dry-run verificable del mismo plan, con resumen de peticiones esperadas, estimación conservadora de reserva y saldo restante; Copilot puede avanzar sin nueva confirmación humana si el plan está dentro de ESTA autorización.
10. Mantener GO, STOP, STOP ALL, armado de Autopiloto y audio directo fuera del alcance de las respuestas del modelo. Las propuestas siguen requiriendo revisión humana.

## 3. Cambios necesarios al código existente

El código histórico no implementa todavía esta autorización de forma uniforme:

- \`AGENTS.md\` y \`docs/RUNQ_SYSTEMATIC_EVAL_PROTOCOL.md\` contenían prohibiciones absolutas a agentes y un techo de 2 USD para Muse. La excepción de esta política es *solo* para la campaña autorizada y **no** permite saltar la validación de presupuesto.
- \`tools/runq-systematic-lab.mjs\`: opciones de \`--max-requests <= 20\`, \`--budget-usd <= 2\` y ledger local Meta de 2 USD. Adaptar el runner para ventanas/lotes **secuenciales**, sin desactivar límites defensivos por petición. El objetivo 400 puede dividirse en lotes de máximo 20, siempre utilizando el gateway compartido.
- \`tools/metaBudgetLedger.mjs\`: no eliminar ni reiniciar su historial. Migrarlo al libro mayor unificado o sincronizarlo mediante una interfaz atómica. No crear un segundo presupuesto permisivo independiente.
- \`tools/runq-agent-live-eval.mjs\` y \`tools/agentLiveBudget.mjs\`: hoy usan otro ledger de hasta 30 USD y admiten Meta + Baseten. Impedir Baseten en esta campaña y contabilizar cada gasto Meta contra el mismo sublímite de 65 USD, incluyendo Muse por guion.
- \`tools/sfxRoutes.mjs\` y Modal: respetar las cuotas del generador, en especial las de coste por solicitud, cuota diaria, concurrencia y reintentos. Las campañas masivas de Modal requieren un runner explícito que **no** multiplique llamadas mediante el navegador o efectos de carga.
- \`package.json\`: añadir \`qa:paid:plan\`, \`qa:paid:status\` y \`qa:paid:run\` cuando el gateway esté conectado y probado. Por defecto \`npm test\`, \`qa:codex\`, \`qa:agent:mass\` y CI permanecerán offline.
- Agregar pruebas de coste y seguridad que fallen si alguna función de laboratorio llega a Meta/Modal sin pasar por el gateway. Toda ruta no interceptada queda bloqueada.

No cambiar ninguna constante solo para que una prueba pase: primero crear tests que demuestren el cierre del presupuesto.

## 4. Criterios para continuar y parar

Copilot puede continuar de manera autónoma mientras:

- Solo use Meta/Modal con autorización, guiones sintéticos y límites efectivos vigentes.
- Todas las llamadas pasen por la reserva compartida previa y generen rastro trazable.
- No haya facturas pendientes de conciliación o desconocimiento del cobro que pueda superar la reserva.
- Los resultados estén bien tipados: PASS/FAIL/ERROR/BLOCKED/NOT_RUN; no inventar precisión de modelos.
- Ejecute peticiones serialmente; cero reintentos automáticos.
- Detenga la campaña si el saldo, los límites, el proveedor, el host o el ledger no están claros.

Al llegar a techo o bloqueo, **parar, informar del consumo, dejar pruebas offline funcionando y no solicitar más dinero automáticamente**.

## 5. Informes de la campaña

Guardar localmente un \`campaign-status.json\` con: ID de campaña, commit, runner, proveedor, modelo, cantidad de peticiones planificadas/completadas/bloqueadas, reservas previas/nuevas/acumuladas, crédito verificado, errores tipados, distribución por guion, métricas de precisión/F1 cuando haya gold revisado, y hora de verificación. Nunca loguear claves, contenido privado, respuestas crudas ni prompt completo.

El techo de 100 USD es una **autorización de gasto, no una garantía de facturación**. El coste real depende del proveedor. Una solicitud incierta se trata como consumida hasta conciliación. Los créditos promocionales se descuentan únicamente si el proveedor los confirma; un balance promocional expirado no se presupone disponible.

## 6. Fuente de verdad y prioridad

\`docs/qa-evals-2026-10-31/paid-campaign-policy.json\` es el manifiesto de cifras, y este documento define sus condiciones. Esta excepción prevalece sobre el veto histórico general de agentes **solo después de integrar y verificar el gateway central de gastos**; nunca sustituye las invariantes de AGENTS.md relativas a datos, control de escena, secretos y CI.

La rama \`docs/runq-evals-exhaustive-2026-10-31\` es documental. **Tener estos archivos en GitHub no equivale a que los runners ejecutables estén modificados o seguros.** No iniciar un \`--live\` solo por leer la autorización.
