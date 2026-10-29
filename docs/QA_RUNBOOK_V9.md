# RunQ QA V9 — Guía de uso, sin ZIP ni costes

Esta rama de evaluación es **independiente** de V9 y no afecta tu carpeta de desarrollo.
**No ejecutar campañas masivas hasta congelar el build y aprobar presupuesto.**

## 1. Acceso cuando quieras revisar la rama

En PowerShell desde cualquier carpeta (NO cambiar la copia V9 activa):

    $base = "C:\Proyectos\Hackaton 2026"
    git -C "$base\runq-v9-test" fetch origin
    git -C "$base\runq-v9-test" worktree add --detach "$base\runq-qa-lab" origin/test/runq-v9-eval-cli-offline-2026-10-29
    Set-Location "$base\runq-qa-lab"
    npm install

No dependes de descargar un ZIP desde ChatGPT. No uses estos comandos de evaluación dentro de runq-v8-test o runq-v9-test hasta que se integren.

## 2. Qué está listo ahora (NO ejecuta pruebas)

    npm run eval:offline
    npm run eval:ai -- --provider meta --runs 100
    npm run eval:ai -- --provider baseten --runs 100
    npm run eval:ai -- --provider modal --runs 20
    npm run eval:ai -- --provider voice --runs 20
    npm run eval:full -- --runs 20
    npm run eval:video
    npm run eval:report

Todo lo anterior es **planificación o inventario**; muestra 0 ejecuciones y cero peticiones. Los artefactos JSON y Markdown se guardan localmente bajo artifacts/eval-qa; NO son resultados de calidad real.

## 3. Solo si se decide probar el propio laboratorio

    npm run eval:cli:test

25 tests previstos en dos archivos: 12 del CLI/catálogo, 8 del auditor del vídeo y 5 del editor conversacional. No ejecutan campañas masivas ni proveedores.

## 4. Solo al congelar una versión (QA local, no IA)

    npm run eval:offline -- --execute-offline

Esto ejecuta qa:codex. Para Chrome, instalar playwright-core por separado en la carpeta QA:

    npm install --no-save --package-lock=false playwright-core@1.56.1
    npm run eval:full -- --runs 1 --execute-offline

La batería completa Chrome puede tardar y NO prueba el micrófono real ni genera muestras de Modal. 20 repeticiones siguen siendo locales, pero no conviene ejecutarlas durante desarrollo activo.

## 5. Para el vídeo (sin representación engañosa)

    npm run eval:video

Solo muestra qué falta capturar. Opcional, cuando quieras validar el layout en Chrome:

    npm run eval:video:smoke

Genera hasta siete PNG de los módulos de V9 (1920x1080) bajo artifacts/video-smoke y un manifest.json etiquetado UI_LAYOUT_ONLY_NOT_FUNCTIONAL_PROOF. No son capturas válidas para demostrar la inferencia o el autopiloto; se deben grabar las acciones reales del producto.

Auditor de evidencias (solo cuando existan capturas reales):

    npm run eval:video:audit

El auditor comienza en NOT_READY. Utiliza como plantilla test/fixtures/video-evidence-template.json; la evidencia real se rellena en artifacts/video-captures/evidence.json, con SHA, revisor, tipo de evidencia y fichero local de cada escena. Comprueba los once planos, hashes, límite oficial, variante de locución y MP4 final. No puede certificar automáticamente el contenido artístico: debe revisarse manualmente.

## 6. Salvaguardas

- Este CLI no admite --live ni --ack-paid.
- eval:ai NUNCA llama modelos reales, aunque pidas 100 o 1.000 repeticiones.
- Los tests locales ejecutados con --execute-offline eliminan variables conocidas de credenciales del proceso hijo.
- Los comandos históricos de proveedor del producto siguen existiendo, pero quedan fuera de esta rama de orquestación. Ejecutarlos sin revisar presupuesto no es parte del protocolo.
- La mera presencia de report.json no demuestra calidad real.
- No se fusiona la rama hasta revisar los tests mínimos y la compatibilidad con el SHA final de V9.
- Si la rama V9 ha avanzado, reconstruir el worktree QA desde un SHA nuevo antes de congelar; no copiar manualmente archivos ni forzar merges.

## 7. Entregables preparados

- tools/eval-commands.mjs — planificador, CLI, guardas, inventario de reportes.
- test/fixtures/eval-campaign-catalog.json — 94 escenarios.
- test/eval-commands.test.mjs — tests del planificador y rutas de fixtures.
- tools/video-layout-smoke.mjs — capturas V9 para revisión de layout.
- tools/video-evidence-audit.mjs — revisión fail-closed de evidencia del vídeo (pendiente hasta capturas reales).
- test/fixtures/video-evidence-template.json — ficha vacía S01–S11, NO prueba final.
- test/video-evidence-audit.test.mjs — 8 tests de falsificación/mismatch/claims.
- test/fixtures/eval-conversational-cue-local-v1.json — 17 instrucciones ES/EN originales con oráculo.
- test/eval-conversational-cue.test.mjs — 5 tests de parser local, rechazo de GO y aclaración.
- docs/RUNQ_MASTER_EVAL_PROTOCOL_2026-10-29.md — metodología y métricas.
- docs/RUNQ_VIDEO_QA_GATES.md — prueba audiovisual y claims.
- docs/QA_RUNBOOK_V9.md — este documento.

**Estado: preparados y pendientes de validación en CI. No hay resultados de nuevas campañas.**