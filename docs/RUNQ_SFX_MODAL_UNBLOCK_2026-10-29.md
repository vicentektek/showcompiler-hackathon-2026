# RUNQ Sound Lab — desbloquear generación real sin quitar límites de gasto

**Prioridad P0 · 29-10-2026.** Ruta de ejecución actual: Node `tools/dev-server.mjs` → `/api/sfx` → web function Modal autenticada → GPU `stable-audio-3-small-sfx` → WAV validado → escucha/aceptación/importación local.

## Estado confirmado vs pendientes

- Implementados y probados SIN proveedor: UI, consentimiento por intento, journal/idempotencia, presupuesto local, rutas, decodificación/verificación WAV, escucha, importación y asociación a cue.
- El mensaje «No hay una política de coste válida» indica que `normalizeSfxCostPolicy` ha rechazado la configuración en Node; **no significa que Modal haya denegado el crédito**.
- Una copia `git worktree` **no comparte** archivos ignorados `.env` de otra carpeta. Cada directorio RC1 requiere configurar `.env` o variables de entorno propias.
- No está verificado desde el repositorio que la web function esté desplegada en tu workspace Modal, que el proxy token tenga permisos, que el modelo descargue pesos ni que una solicitud real termine. No confundir CI verde con generación GPU real.

## Paso 1 · Diagnóstico sin red ni costes (nuevo)

En `C:\Proyectos\Hackaton 2026\runq-rc1`:

```powershell
git fetch origin
git switch --detach origin/integration/runq-demo-2026-10-30
npm run sfx:doctor
```

El doctor imprime SOLO PASS/FAIL de habilitación, URL, proxy ID, proxy secret, política de coste y formato SHA, más límites NUMÉRICOS si son válidos. No imprime ni lee para presentar secretos, y NO efectúa llamadas de red. Si la copia RC1 está abierta en Chrome, el servidor puede seguir usando una configuración previa: cerrar `npm run dev` con Ctrl+C y reiniciar tras cualquier cambio.

## Paso 2 · Archivo local

Comprobar si existe `.env` en la copia RC1: `Test-Path .\.env`. Si no existe, crear a partir de `.env.example` con `Copy-Item .\.env.example .\.env`, y editarlo con `notepad .env`. NO pegar el contenido de `.env` en chats, GitHub, issues o logs.

Valores exigidos (operador debe introducir **su** dirección y secretos reales):

```dotenv
RUNQ_SFX_PILOT_ENABLED=1
MODAL_SFX_ENDPOINT=
MODAL_PROXY_TOKEN_ID=
MODAL_PROXY_TOKEN_SECRET=
RUNQ_SFX_ESTIMATED_MAX_COST_USD=
RUNQ_SFX_DAILY_BUDGET_USD=
RUNQ_SFX_MODEL_REVISION=
```

- `RUNQ_SFX_ESTIMATED_MAX_COST_USD`: estimación conservadora REAL de máximo por solicitud en USD, mayor que 0 y <=100. Verificar GPU y tiempo de uso: **no hay un precio predefinido seguro**.
- `RUNQ_SFX_DAILY_BUDGET_USD`: límite de reserva local positivo (<=1000), nunca inferior al valor anterior. Ejemplo **solo aritmético**, NO recomendación de coste de proveedor: estimación 0.05 / día 0.20. La factura de Modal puede variar y la cancelación no garantiza cero coste.
- `RUNQ_SFX_MODEL_REVISION`: commit SHA hexadecimal minúsculo 40 o 64 caracteres de pesos/modelo verificado; no usar `latest` ni una revisión inventada. Confirmar que el despliegue utiliza esa revisión antes de atribuirle procedencia exacta.
- `MODAL_SFX_ENDPOINT`: URL HTTPS raíz del despliegue de `modal/runq_sfx_pilot.py` cuyo host termina en `.modal.run`, sin ruta `/jobs`, query ni credenciales.
- `MODAL_PROXY_TOKEN_ID` y `MODAL_PROXY_TOKEN_SECRET`: credenciales del **proxy de Modal** `wk-` y `ws-`. NO son la API key de Modal `ak-`/`as-`, y jamás se guardan en código frontend.
- Si hay variables de entorno Windows NO VACÍAS con el mismo nombre, tienen precedencia sobre `.env`. El doctor lee la misma configuración que el servidor.

**Advertencia:** activar el flag no inicia ninguna inferencia. Cada intento requiere confirmación explícita del operador.

## Paso 3 · Validar workspace Modal sin crear trabajos

Antes de activar el piloto, comprobar con credenciales privadas en el PC y panel Modal:

- Saldo promocional y presupuesto externo real; workspace y entorno correctos.
- La app `runq-sfx-pilot` está desplegada, no solamente ejecutada localmente, y se conoce su URL final.
- El endpoint exige autenticación proxy; el ID y secreto siguen vigentes y tienen acceso al entorno.
- El secret de Modal `huggingface-secret` y acceso legal al modelo `stabilityai/stable-audio-3-small-sfx` permiten descargar pesos.
- Si no se ha desplegado, NO generar solicitudes a ciegas. Seguir el procedimiento oficial de Modal para un `modal deploy modal/runq_sfx_pilot.py` **solo después** de comprobar imagen GPU, posibles costes de despliegue, licencia y secrets. Evitar copiar tokens en pantallas o logs.

Herramientas oficiales: `modal workspace proxy-tokens list`, `modal workspace proxy-tokens create` (si procede; muestra el secreto **una sola vez** y no debe compartirse), y panel de Apps de Modal. Más información: https://modal.com/docs/cli/latest/workspace

## Paso 4 · Primera generación auténtica (requiere autorización por intento)

Solo cuando el doctor indique `LOCAL CONFIGURATION READY` y se hayan verificado crédito, despliegue y coste:

1. Reiniciar `npm run dev` de RC1.
2. Abrir Sound Lab / Generación de sonidos y comprobar que el generador aparece disponible.
3. Proponer un único SFX original corto (ej. golpe de campana, 2–3 s); revisar el coste estimado, marcar consentimiento y confirmar el envío.
4. Si devuelve `QUEUED/RUNNING`, pulsar `Comprobar resultado` o actualizar manualmente según la UI, sin repetir el envío.
5. WAV listo → preescucha → ajustar IN/OUT/fades → aceptar → `Importar + crear cue` → guardar ZIP del espectáculo y reabrir.
6. Documentar estado, latencia y coste realmente observado en Modal (no publicar secretos ni audio privado).

Si sale `SUBMISSION_UNKNOWN`, **NO reintentar** hasta investigar el job remoto; puede haberse cobrado aunque Node haya perdido la respuesta. La protección de journal debe conservarse.

## Bloqueo específico de RC1 y correcciones técnicas

- `.env.example` omitía `MODAL_PROXY_TOKEN_SECRET`; corregido.
- Existía aceptación laxa de `RUNQ_SFX_MODEL_REVISION` en `/api/sfx/status`; ahora requiere SHA hexadecimal verificable para declarar preparado el piloto.
- Nuevo `npm run sfx:doctor` más pruebas Node offline; no modifica motor de audio, no llama a Modal, Meta ni Baseten.

**Siguiente artefacto de evidencia:** salida SEGURA de `npm run sfx:doctor` (solo flags y caps) y confirmación de despliegue Modal sin URL privada ni claves. Hasta entonces no afirmar que está solucionada la generación real.
