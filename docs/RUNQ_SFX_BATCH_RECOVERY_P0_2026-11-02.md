# RUNQ — Recuperación P0 de generación masiva de audio (2026-11-02)

## Alcance

Esta corrección se aplica a **Generate audio for all** y a las filas de tomas
del lote de preparación. No cambia GO, STOP, NEXT, el motor de audio en
directo, la asignación manual ni realiza despliegues o llamadas de proveedor.

## Arquitectura

`src/core/sfxBatch.mjs` concentra una máquina de estado serial y recuperable:

- Fases visibles: `PENDING`, `SUBMITTED`, `GENERATING`, `READY`, `FAILED`,
  `UNCERTAIN`, `CANCEL_REQUESTED`, `CANCELLED` y `REJECTED`.
- Cada cue conserva `requestId`, estado duradero, fase derivada, hash WAV,
  `submittedAt`, `lastCheckedAt` y `lastErrorCode`.
- El historial de navegador sigue usando `runq.preparation.v1.<projectKey>`;
  el normalizador común evita registros contradictorios y limita el historial
  a 500 entradas.
- La UI convierte snapshots inmutables del núcleo en copias locales antes de
  abrir o asignar tomas; nunca muta directamente un snapshot del gestor.

## Reglas de seguridad

- Un cue con registro vivo o incierto nunca recibe otra autorización ni otro
  `POST /api/sfx/jobs`.
- La recuperación lee el trabajo local y, solo si sigue activo, llama a
  `refresh` con el mismo `requestId`.
- Superar el presupuesto de seguimiento en primer plano no declara fallido
  el trabajo remoto; queda `GENERATING` y recuperable.
- Un `FAILED` remoto queda aislado en su cue y los siguientes continúan.
- Límites diarios, presupuesto, campaña, duplicado, trabajo activo o falta de
  configuración detienen nuevos envíos; el trabajo anterior se conserva.
- `SFX_BUSY`, `SFX_SERVICE` y fallos de red durante el refresco se tratan como
  transitorios acotados. Reintentar significa repetir leer/refrescar, nunca
  volver a enviar una generación.
- **Detener lote** aborta el seguimiento local y nuevos envíos. **Solicitar
  cancelación** es una acción remota distinta, por toma (`/cancel`).
- Una respuesta tardía para un `requestId` que ya no existe en el estado del
  navegador se ignora localmente; no resucita el registro ni produce un error
  global. La reserva y el WAV, si existen, permanecen trazables en el journal
  del servidor.
- Las actualizaciones son monotónicas: `RUNNING`/`QUEUED` nunca sobrescriben
  `READY_FOR_REVIEW`, `ACCEPTED_FOR_MANUAL_IMPORT` o `CANCELLED`, ni una toma
  aceptada vuelve a lista. Aplicar dos veces la misma respuesta es idempotente.
- Al reconstruir desde `localStorage`, una respuesta solo se aplica si
  coinciden proyecto, generación del proyecto, cue, identidad del cue y
  `requestId`; cualquier divergencia se ignora sin autorizar otro envío.
- Las autorizaciones siguen siendo explícitas por solicitud; el servidor
  mantiene reserva previa, antiduplicados y validación de coste/diario.

## Recuperación operativa

- Cada fila no lista muestra **Comprobar estado**. Si el trabajo termina, la
  referencia WAV queda lista para escuchar/asignar sin duplicar gasto.
- **Generate audio for all** queda disponible cuando solo existen trabajos
  reanudables y reanuda su seguimiento en vez de crear duplicados.
- `tools/sfx-job-reconcile.mjs` usa por defecto el directorio real
  `shared-modal-jobs-v1`, el mismo que `tools/sfxRoutes.mjs`.
- `npm run sfx:doctor` añade una lectura offline y agregada del journal:
  ruta, total y número de trabajos activos/sin resolver. No imprime IDs,
  prompts, costes por trabajo ni credenciales, y no contacta Modal.

## Validación offline

Las pruebas nuevas cubren lotes de 5, 20, 50 y 100 cues; fallo del cue 2 con
éxito del cue 3; generaciones superiores a 120 segundos; reinicio simulado;
`SUBMISSION_UNKNOWN`; dos pestañas refrescando el mismo trabajo; cancelación
a mitad de lote; recuperación del hash WAV; duplicados; autorizaciones
inválidas y conservación del historial. También cubren, con promesas
diferidas resueltas manualmente, respuestas tardías sin registro local,
respuestas antiguas contra estados terminales, y reconstrucción desde
`localStorage` con proyecto, generación, cue, identidad o `requestId`
divergentes. El E2E de preparación usa un proveedor simulado y verifica
además la separación entre detener el lote y solicitar cancelación remota.
