# RunQ SFX — prueba de latencia y uso (28-10-2026)

## Alcance
Dos generaciones consecutivas de **4 segundos**, con el mismo prompt y la misma seed:
primera invocación en frío y segunda con el contenedor reutilizable. Tercera prueba
opcional (tormenta de 5 s). No hay concurrencia, reintentos ni proveedores alternativos
automáticos. No se altera la biblioteca ni los cues. **No equivale a una prueba
de calidad acústica**: revisar los WAV después desde Sound Lab.

## Ejecutar en PowerShell
Antes: comprobar en la consola Modal que las solicitudes antiguas están completadas
o canceladas realmente. No iniciar otro trabajo sobre una solicitud de estado incierto.

```powershell
cd "C:\Proyectos\Hackaton 2026\showcompiler-hackathon-2026-modal-integration"
git pull --ff-only
node --test test/modalSfxDeploymentContract.test.mjs test/sfxLatencyLab.test.mjs
modal deploy -e main modal/runq_sfx_pilot.py
modal function info runq-sfx-pilot/generate_sfx -e main
node tools/sfx-latency-lab.mjs
node tools/sfx-latency-lab.mjs --live --ack-paid --max-calls 2 --budget-usd 0.20 --timeout-seconds 90
```

**Costes:** la confirmación `--live --ack-paid` permite como máximo 2 intentos
remotos, reservados localmente al coste estimado configurado en `.env`
(normalmente 0,05 USD/solicitud). El presupuesto indicado es una
**barrera sobre estimaciones**, NO un límite global de facturación Modal:
también se factura el tiempo de contenedor inactivo durante `scaledown_window`,
CPU, memoria y transferencias. Mantener un límite de gasto en el dashboard de Modal.

En caso de timeout, el laboratorio solicita **cancelación**, deja la evidencia
en el registro local y detiene la batería. **No significa que Modal confirme
una cancelación definitiva**. No volver a lanzar sin verificar el estado en Modal.

Si hay una generación anterior pendiente en el diario local, el laboratorio
se bloqueará de forma deliberada y mostrará su ID y estado. No borrar el diario:
verificar en Modal y reconciliar mediante `tools/sfx-job-reconcile.mjs`.

## Qué se mide automáticamente
- Latencia HTTP de envío, desde la app local.
- Latencia de extremo a extremo hasta WAV verificado y guardado.
- Tiempo hasta solicitud de cancelación, si hay atasco.
- Número de llamadas autorizadas, coste estimado reservado, estado y hash WAV.
- Salida JSON: `.runq-local/sfx-latency-lab/report-*.json`.

## Medición real en Modal (lectura, sin coste de inferencia)
```powershell
modal function calls runq-sfx-pilot/generate_sfx --tail 10 --json -e main
modal function stats runq-sfx-pilot/generate_sfx --since 2h --json -e main
```

El código desplegado emite `RUNQ_SFX_TIMING` en Logs: GPU realmente utilizada,
si el modelo estaba cargado, duración de carga, inferencia y escritura WAV.
La diferencia entre hora de encolado y de comienzo de ejecución procede de
**Modal**, no del endpoint RunQ, que todavía agrupa `QUEUED/RUNNING`.
El **coste facturado real** solo se verifica en Usage/Credits de Modal.

El código fuente reside en la rama
`feat/stagecraft-modal-sfx-integration-2026-10-28`.
