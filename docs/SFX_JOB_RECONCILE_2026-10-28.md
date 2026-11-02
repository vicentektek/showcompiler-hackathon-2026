# RunQ — conciliación auditada de registros SFX y primera generación real (28-10-2026)

## Problema

El piloto Modal devuelve `409` en `GET /jobs/{id}` cuando una llamada
`FunctionCall` ya terminó (cancelada o fallida). El cliente Node y las rutas
fallan cerrado y por diseño **nunca** interpretan un `409` como cancelación,
de modo que un registro local puede quedarse atrapado en `CANCEL_REQUESTED`
(aunque la señal de cancelación remota se aplicó). Ese registro consume el
único hueco activo y bloquea nuevas reservas (`SFX_ACTIVE_LIMIT`).

## Corrección mínima (no destructiva, auditada)

- `src/core/sfxJobStore.mjs`: nuevo método `reconcileCancelled(id, evidence)`.
  Solo transiciona `CANCEL_REQUESTED -> CANCELLED`, *una vez*, exigiendo
  evidencia externa estricta (`remoteJobId` coincidente, `terminalStatus`
  `CANCELLED`, `verifiedAt` dentro de la ventana del registro, `verifiedVia`,
  `verifiedBy`, `evidenceSha256`, nota opcional) y graba dentro del registro
  un objeto `reconciliation` inmutable; no borra historial ni reescribe
  campos previos. `internalEntry` valida registros reconciliados cargados.
- `tools/sfx-job-reconcile.mjs`: CLI solo-local (nunca contacta al proveedor):
  `--request-id`, `--evidence-file` (artefacto con logs del CLI Modal leído
  solo fuera de Band), `--verified-at`, `--verified-by`, `--note`,
  `--execute` (sin `--execute` = dry-run). Añade una línea al
  `journal-audit.jsonl` situado bajo el directorio real del journal. Desde la
  corrección P0 de recuperación SFX, ese directorio por defecto es el mismo
  `shared-modal-jobs-v1` usado por `tools/sfxRoutes.mjs` (junto al ledger
  global por usuario), no el antiguo `.runq-local/sfx-generation`; puede
  seguir sobrescribiéndose con `--store-dir`.
- Garantías conservadas: sin borrado; `409` No es cancelación; el registro
  reconciliado sigue contando para la cuota diaria (`startsToday`) y el
  presupuesto estimado; el WAV nunca existe en un trabajo cancelado.
- Test de regresión: `test/sfxJobReconcile.test.mjs` (7 pruebas, offline).
  `npm run check:syntax` actualizado con la herramienta.

## Procedimiento de evidencia (solo lectura)

1. `modal app list` → tareas `Tasks 0` (sin GPU activa).
2. `modal app logs runq-sfx-pilot --function-call fc-…` → prueba el mensaje
   `Received a cancellation signal` + `Successfully canceled input`.
3. Guardar el artefacto de evidencia y reconciliar con la herramienta.

## Ejecución registrada

- `probe-x-1` (/job fc-01M617ZYJX99QS17J30Z8BA4ZE): evidencia 12:42:26 UTC,
  `CANCEL_REQUESTED -> CANCELLED` a las 13:06:10 UTC;
  `evidenceSha256 311648bc0760f90c772b1399e873f48e6786ef9e999ec813f8c73484263d0ab4`,
  `verifiedBy operator-chat-authorization-2026-10-28`. Auditoría en
  `.runq-local/sfx-generation/audit/journal-audit.jsonl` (archivo local, no
  versionado).

## Primera generación real autorizada (misma sesión)

Parámetros exactos autorizados por el operador vía chat: modelo
`stabilityai/stable-audio-3-small-sfx` @ `05ca3857881c94a2b84026b1111c537d78f5f9f0`,
caso `door`, 8 s, seed `104729`, prompt fijado por el operador, máximo
estimado 0,05 USD, UNA petición, sin reintentos. Flujo normal con todos los
bloqueos (`/api/sfx/jobs` + sondeos `refresh` del mismo trabajo).

- Solicitud: `real-first-ai-door-8s` (fc-01M61A0Q30XP434T9G12XVKN61);
  `SUBMISSION -> READY_FOR_REVIEW` en 13:08:30 UTC -> 13:25:24 UTC
  (≈ 16 min 54 s de pared, de los cuales ≈ 4-7 min esperando GPU L4 en Modal
  según logs del sistema; carga de pesos ≈ 6-7 min; 8 pasos de difusión ≈ 1 s).
- WAV: PCM16 estéreo 44100 Hz, 8,00 s, tamaño 1.411.244 bytes,
  `sha256 9527017a5c63870508026d4e1dec5732045d18aaf7745a3f0644bbc4a42d89f6`;
  pico ~0 dBFS, RMS ~3,2 % (≈ -29,8 dB), cruce por cero ~1 883/s (no silencio).
  Ruta canónica en el journal:
  `.runq-local/sfx-generation/wav-30d27c0182a8131ec64bc1a22671a7604e6f108f4135cb144d3c2da509f228b4.wav`
  (copia amable: `.runq-local/sfx-generation/first-ai-generated-doorsfx-8s.wav`).
  Queda en `READY_FOR_REVIEW`; la importación y el binding a cue son manuales.
- Estado remoto tras el cierre: app desplegada con `Tasks 0` (sin GPU).
- `RUNQ_SFX_PILOT_ENABLED=0` en `.env` tras finalizar; los trabajos pendientes
  de reserva no se reintentan automáticamente nunca.

## Límites

- `actualBilledUsd` permanece `UNKNOWN` por diseño; el coste confirmado debe
  leerse del dashboard de Modal. Estimación por ventana GPU (tarifa L4 de
  lista 0,000222 USD/s): sonda previa ≈ 9,4 min ≈ ≈0,13 USD; primera
  generación ≈ 7,3 min ≈ ≈0,10 USD (límites superiores, sin CPU/almacenamiento).
- No certificamos calidad profesional ni multicanal fiable; la escucha humana
  en el Sound Lab (forma de onda + preescucha) es la única validación real.
