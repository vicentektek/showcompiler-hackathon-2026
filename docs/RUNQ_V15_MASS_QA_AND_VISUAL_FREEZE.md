# RUNQ V15 · entrega y pruebas masivas

Rama independiente: feat/runq-v15-agent-qa-visual-freeze-2026-10-29. PR #110. No fusionar automáticamente.

## Entregado
- Planificador local con contexto conversacional ES/EN. Genera propuestas de cierre con cues manuales pendientes de audio cuando el operador delega la elección.
- Contexto breve para el modelo: máximo ocho turnos, truncamiento de texto, cero cambios sin aceptación y undo.
- Acabado visual CSS: gris grafito, azul Studio, ámbar Ensayo, verde Stage y rojo de emergencia. No se modifica el motor de audio.
- QA masiva offline sintética: 600 casos, estados, previews, permisos, persistencia y undo.
- Evaluador real Meta/Baseten: misma entrada sintética por proveedor, 200 peticiones por defecto, validación y comparación por caso.

## Ejecutar YA en una copia independiente
git fetch origin
git worktree add ..\runq-v15 origin/feat/runq-v15-agent-qa-visual-freeze-2026-10-29
cd ..\runq-v15
npm install
npm run qa:codex
npm run qa:agent:mass
npm run qa:agent:live:plan

La opción de plan anterior NO envía ninguna solicitud. Para 200 solicitudes REALES, autorizadas explícitamente:
npm run qa:agent:live -- --live --ack-paid --cases 200 --providers meta,baseten --budget-usd 30 --reserve-usd 0.15

Si solo está disponible una API key:
npm run qa:agent:live -- --live --ack-paid --cases 100 --providers baseten --budget-usd 30 --reserve-usd 0.15

Necesitas claves MODEL_API_KEY y BASETEN_API_KEY en el entorno de PowerShell. No pegarlas aquí ni guardarlas en el código.

## Controles de gasto y seguridad
- Las peticiones se realizan en secuencia; ninguna prueba llama a GO/STOP/ARM.
- Cada solicitud reserva fondos localmente antes de contactar con el proveedor. Hay ledger persistente y bloqueo entre procesos: .runq-local/agent-live-eval-budget.json. No lo borres para repetir cargos.
- --budget-usd = límite de reservas acumuladas en ESTA carpeta, no una garantía del gasto que facture Meta/Baseten.
- --reserve-usd = cantidad conservadora que se reserva por solicitud. Comprueba precios y saldo en el proveedor para estimar el gasto real.
- Los dos mecanismos de gasto (viejo laboratorio Meta y nuevo agente) tienen ledgers separados. No usar simultáneamente otros programas de pago con la misma clave sin controlarlo.
- Errores de autorización o 429 paran el proveedor afectado; no hay reintentos automáticos.
- Informes en artifacts/agent-live-eval/ (JSON/MD), ignorados por Git. Incluyen solo ID sintético, tipo, proveedor, validez/acierto/latencia y código de error, no los textos de guion ni secretos.

## Diagnóstico de calidad
Medir precisión de operaciones, planes ejecutables, aclaraciones indebidas y tasa de respuesta válida. Revisión artística de al menos los casos creativos erróneos por técnico o regidor. Comparar mismos ID y misma semilla en A/B. La evaluación no modifica los pesos del modelo ni garantiza capacidad en directo. Nunca atribuir una mejora a los proveedores si solo han pasado pruebas offline.

## Aceptación visual y funcional
- Ejecución completa de CI, Chrome con mocks, ensayo y barra STOP ALL.
- Revisión manual en Windows 1920×1080 y 1366×768 del panel RUNQ AI, Guion, Editor, Sonido, Ensayo y Stage.
- Probar JSON/ZIP, cues de audio reales, atenuaciones/fades, trigger hablado y restauración.
- El acabado CSS es una versión coherente de presentación, no un rediseño de cada pantalla ni certificación de hardware.
