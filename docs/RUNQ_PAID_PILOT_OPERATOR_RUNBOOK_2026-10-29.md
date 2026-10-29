# RunQ — Guía de piloto autorizado con tope de 30 USD

**29 octubre 2026.** El usuario ha aprobado en conversación el presupuesto global propuesto: Meta USD 12, Baseten USD 8, Modal USD 8 y transcripción USD 2 (total USD 30). El presupuesto se **crea en el PC del usuario** mediante una acción local explícita; no hay aprobación ni API key comprometida en GitHub.

**IMPORTANTE:** los 30 USD son reservas de software estimadas, no un límite duro ni una garantía de facturación de Meta, Baseten o Modal. Hay que comprobar paneles, límites y créditos antes de ejecutar.

## 1. Aislar copia QA y no interferir en V9

PowerShell:

    $base = "C:\Proyectos\Hackaton 2026"
    git -C "$base\runq-v9-test" fetch origin
    git -C "$base\runq-v9-test" worktree add --detach "$base\runq-paid-pilot" origin/test/runq-mass-campaign-protocol-2026-10-29
    Set-Location "$base\runq-paid-pilot"
    npm install

Si el worktree ya existe, NO sobrescribirlo ni eliminarlo: revisar primero su estado.

## 2. Pruebas sin gasto

    npm run eval:mass:test
    npm run eval:mass:plan
    npm run eval:pilot -- --provider meta --requests 1 --case hotel-door

Ese último comando no tiene --live, por lo que solo planifica; no hace llamadas externas.

## 3. Materializar el presupuesto ya aprobado

    npm run eval:budget:init
    npm run eval:budget:status

La primera orden crea una sola vez el presupuesto privado en %LOCALAPPDATA%\RunQ\Evaluation\global-spend-v1.json. Si existe, rechaza el reemplazo; nunca borrarlo para reiniciar cuota ni compensar consumo. No solicita claves ni ejecuta inferencia.

## 4. Comprobaciones de facturación y privacidad

Antes de escribir --dashboard-verified:
- Meta: saldo, cuotas, alertas y modelo Standard; no cambiar a modo Contributor.
- Baseten: consumo actual, límites de facturación y acceso al modelo fijado.
- Modal: consumo, arranque/idle GPU, cuotas, trabajos activos y cargos inciertos.
- No iniciar simultáneamente otras evaluaciones desde clones V8/V9: los scripts antiguos pueden tener ledgers independientes.
- No mostrar credenciales, guiones privados ni audio de terceros en consola o GitHub.

Si existen claves ya almacenadas en variables de entorno del usuario de Windows, cargarlas en la sesión sin revelar los valores:

    $env:MODEL_API_KEY = [Environment]::GetEnvironmentVariable("MODEL_API_KEY","User")
    $env:BASETEN_API_KEY = [Environment]::GetEnvironmentVariable("BASETEN_API_KEY","User")
    Write-Host "Meta configurado:" (-not [string]::IsNullOrWhiteSpace($env:MODEL_API_KEY))
    Write-Host "Baseten configurado:" (-not [string]::IsNullOrWhiteSpace($env:BASETEN_API_KEY))

Modal usa la configuración local del servidor RunQ y el endpoint SFX valida estado antes de crear trabajos.

## 5. Primera tanda: UNA solicitud por proveedor

SOLO cuando hayas comprobado paneles y los tests previos pasen:

Meta real, un caso original:

    npm run eval:pilot -- --provider meta --requests 1 --case hotel-door --live --ack-paid --dashboard-verified

Baseten real, mismo caso:

    npm run eval:pilot -- --provider baseten --requests 1 --case hotel-door --live --ack-paid --dashboard-verified

Modal SFX real, un audio (solo si la integración está configurada y no hay trabajos pendientes):

    npm run eval:pilot -- --provider modal --requests 1 --live --ack-paid --dashboard-verified

Esos comandos SÍ pueden facturar. Ejecutar por separado, comprobar cada informe, ledger y dashboard antes del siguiente. Sin reintentos automáticos.

## 6. Qué se comprueba

- Primero fase piloto: 8 Meta, 5 Baseten, 2 Modal como máximos acumulados; todavía NO se ha activado la carga masiva.
- El runner comprueba la cuota restante en el ledger antes de cada petición.
- Los artefactos se guardan en artifacts/pilot-... con SHA de código, diagnósticos tipados y gastos estimados; no se publican ni contienen respuesta cruda ni API keys.
- Las reservas de llamadas inciertas no se devuelven automáticamente.
- El gold de guiones sigue provisional; el piloto diagnostica la integración pero NO certifica la calidad de modelos.
- Voz todavía NO tiene runner pagado válido con 100 frases y gold: no consumir voz sin preparar grabaciones originales.
- Si falla un proveedor, detener el piloto; revisar facturación y jobs. No relanzar para conseguir un PASS.
- Ctrl+C no garantiza cancelar una generación Modal ya enviada. Si hay bloqueo .lock, inspeccionar procesos y conciliación antes de intervenir.
- No conectar GO automático a PA ni salida de hardware durante pruebas desatendidas.


## IMPORTANTE: npm puede consumir los flags del piloto

En al menos una instalación de npm/PowerShell, el comando `npm run eval:pilot -- --provider ...` ejecutó en realidad `node tools/runq-paid-pilot.mjs meta 1 hotel-door`, **sin los nombres de opciones ni los flags de autorización**. El parser falla antes de lanzar el piloto; no significa fallo de Meta. **No repetirlo sin confirmar las reservas.**

Primero, `npm run eval:budget:status`: verificar `reservedUsd=0`, `requestCount=0` para Meta. Revisar también `artifacts/pilot-*/pilot-result.json` y el panel Meta si hubiera reservas. Para evitar el parser de npm, invocar el CLI **directamente con Node**:

    node .\tools\runq-paid-pilot.mjs --provider meta --requests 1 --case hotel-door

La orden anterior solo planifica, NO gasta créditos. Con saldo y dashboard comprobados, ejecutar la misma orden con `--live --ack-paid --dashboard-verified` solo una vez:

    node .\tools\runq-paid-pilot.mjs --provider meta --requests 1 --case hotel-door --live --ack-paid --dashboard-verified

Si el proceso se detiene tras reservar, NO reintentar: conciliar el registro y el consumo real antes de cualquier nueva solicitud.

## 7. Calendario

Prioridad para el vídeo: obtener un rough cut el 31 de octubre y reservar del 1 al 3 de noviembre para capturas reales, correcciones y cierre. No ejecutar las 380 peticiones si desplazan vídeo o fiabilidad de demo.

**El usuario no necesita aprobar de nuevo USD 30.** Sí debe comprobar las credenciales y dashboards que no son accesibles desde este chat, y ejecutar los comandos de su PC para conectar las API reales.