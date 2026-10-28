# SFX Workbench API v1 — implementación independiente del editor (28 octubre 2026)

**Estado:** API local funcional con pruebas offline; modo remoto DESACTIVADO por defecto. No se han hecho generaciones reales, despliegues de Modal, llamadas de pago, asignaciones a cues ni cambios de interfaz. Rama hija del piloto Modal de PR #71, no de main.

## Por qué esta separación

El nuevo generador es un servicio headless. Las pantallas Script, AI, Cues, Audio y Operation pueden rediseñarse en paralelo sin tocar su API. Ninguna llamada de generación se enlaza a GO, STOP, STOP ALL, auto-GO o Web Audio. El guion permanece intacto y se conserva Lxx.

## Contrato HTTP (127.0.0.1)

- GET /api/sfx/status — capacidades, configuración, tipos, duración 1–12 segundos. No hace solicitudes externas.
- POST /api/sfx/jobs — solicitud **explícita** con JSON: requestId, authorizationId, confirmed:true, sourceLineId (Lxx), kind (SFX/ENVIRONMENT), prompt, durationSeconds y seed opcional. El servidor elige por contrato Stable Audio 3 Small SFX. 202 con registro local QUEUED.
- GET /api/sfx/jobs/{requestId} — consulta al registro local. No llama a Modal.
- POST /api/sfx/jobs/{requestId}/refresh con {} — consulta estado real a Modal; si se completa, descarga, verifica y guarda un WAV local. No asigna asset.
- GET /api/sfx/jobs/{requestId}/audio — entrega WAV PCM16 comprobado solamente en READY_FOR_REVIEW o ACCEPTED_FOR_MANUAL_IMPORT.
- POST /api/sfx/jobs/{requestId}/review con {"decision":"ACCEPT"} o REJECT — aprobación humana, nunca GO.
- POST /api/sfx/jobs/{requestId}/cancel con {} — solicita cancelación, no presume que ya ocurrió.

POST exige Origin idéntico al servidor loopback, Content-Type JSON y límite 4 KB. Errores usan códigos sin claves, respuestas del proveedor ni stacks. API deshabilitada para crear, revisar o consultar al proveedor salvo RUNQ_SFX_PILOT_ENABLED=1 y credenciales válidas en backend.

## Seguridad, costes, persistencia

- Registros en .runq-local/sfx-generation, **excluida de Git**. Un bloqueo exclusivo protege cada mutación y falla cerrado ante cierre inesperado, hasta investigación manual.
- Primer registro persistido ANTES del acceso remoto. Una solicitud ambigua nunca se reintenta automáticamente. requestId y authorizationId no pueden reutilizarse tras reiniciar; journal incluye huella SHA-256 de la autorización, no el identificador legible.
- Máximo tres solicitudes por día UTC y una tarea activa o incierta por instalación, incluso tras reinicio; parámetro de test permite reducir límites. Esto es límite de número de trabajos, **no** un límite monetario efectivo de Modal.
- WAV guardado localmente solo si es PCM16, tiene duración/frecuencia/canales y hash concordantes. Nunca se persiste en el proyecto automáticamente.
- No multiusuario: no hay cuentas, cuotas monetarias, control de concurrencia distribuida ni mecanismo de limpieza de registros caducados; sin demostrar éstos el piloto no debe ofrecerse públicamente.
- No hay botón de generación en la interfaz. La API por sí sola no pone un proveedor al alcance de un usuario sin configuración explícita.

## Puente hacia el futuro Cue Editor

src/core/sfxImportCandidate.mjs permite preparar un objeto File navegable **solo** si el trabajo tiene estado ACCEPTED_FOR_MANUAL_IMPORT y el SHA-256 del WAV coincide. Devuelve File, sourceLineId, requestId, kind y targetCueId:null; no llama a funciones de reproducción ni altera el show.

La futura pantalla de sonidos puede mostrar lista de versiones y generar con un botón independiente. Al pulsar "Usar en cue", deberá exigir una selección de cue explícita y usar las funciones existentes de importación y asignación de audio. El Cue Editor seguirá siendo quien establezca fades, loops, stops y comportamiento de directo. No asumir buses de preescucha aislados.

## Pruebas offline

- node --test test/sfxRoutes.test.mjs test/sfxImportCandidate.test.mjs
- npm run qa:codex
- La CI de PR ejecuta también los tests y smoke existentes.

## Pendiente

1. Resolver cualquier fallo de CI y probar la ruta con navegador/local sin credenciales.
2. Comprobar versión exacta e instalación Python Stable Audio 3 en una imagen Modal (NO desplegar automáticamente).
3. Implementar límites monetarios duraderos y comprobación manual de créditos; obtener autorización explícita antes del primer trabajo facturable.
4. Integrar el panel Sound Generator en la nueva UI sin modificar el contrato v1; escuchar muestras A/B y permitir importación a un cue seleccionado.
5. Verificar sonido real con auriculares y sistema PA. Ninguna prueba de Node certifica la calidad acústica.
