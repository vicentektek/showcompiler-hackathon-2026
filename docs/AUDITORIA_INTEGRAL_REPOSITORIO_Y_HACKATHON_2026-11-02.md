# RUNQ — Auditoría integral de repositorio, historial, QA y cumplimiento
**Fecha:** 2 de noviembre de 2026 · **Estado:** diagnóstico con comprobación remota; NO autoriza borrar, fusionar ni publicar.
**Repositorio privado:** https://github.com/vicentektek/showcompiler-hackathon-2026
**Versión funcional de referencia:** tag `verified-working-2026-11-02`, commit pelado `6d1d65d`.
**Rama de preparación:** `release/runq-hackathon-2026`; antes de este informe, `762e999802dc9af78cb660675b3e97ace0c65017`. Nuevos commits de documentación/auditoría no revalidan automáticamente la aplicación.

## 0. Dictamen ejecutivo
**NO PUBLICAR AÚN** este repositorio de desarrollo. La estrategia recomendada es:
1. Congelar la versión verificada como ancla y preservar un espejo privado completo.
2. Inventariar las 137 referencias de rama y sus PR asociados con el script de comparación de ancestros; no inferir seguridad de borrado por nombres.
3. Cerrar PR obsoletos documentando sus sucesores, tras confirmar que el trabajo está integrado o archivado.
4. Resolver un fallo de E2E visual detectado en CI; después ejecutar TODO el pipeline y Windows.
5. Auditar secretos en todos los refs y objetos alcanzables, comprobar derechos multimedia y confirmar la restricción de modelos IA en ejecución.
6. Crear preferentemente un **repositorio público nuevo, de historial limpio y snapshot revisado** para la entrega, preservando el repositorio actual y el backup como evidencia privada. Si las bases exigen historial más amplio, valorar historial filtrado DESPUÉS de revisión de riesgos.
7. Entregar vídeo real de máximo tres minutos, explicación en inglés, README ejecutable, evidencias de Meta real y pruebas; congelar commit y registrar resultado del formulario.

## 1. Inventario comprobado (GitHub API)
- Visibilidad: PRIVATE. Rama por defecto: `main`. Branch protection: `main` sin protección (GET /branches/main); el endpoint de rulesets devolvió 403 por plan/acceso, no equivale a una regla activa.
- 137 ramas después de crear `release/runq-hackathon-2026`; 2 tags anotados: `runq-interface-approved-2026-10-31` y `verified-working-2026-11-02`.
- 120 pull requests: **109 OPEN, 9 MERGED, 2 CLOSED sin merge**; hay PR contra ramas temporales y una larga cadena de PR heredados.
- La versión verificada incluye 443 ficheros rastreados: 125 en `src/`, 114 en `test/`, 95 en `docs/`, 69 en `tools/`, 19 en `fixtures/`, más activos, demo y configuración. Total del árbol Git: 472 entradas. No se ha realizado revisión del contenido de todos estos ficheros.
- Tamaños relevantes: `docs/design-references/RUNQ_referencias_visuales_A-H.zip` ~9,07 MiB; `assets/runq-backstage.png` ~1,69 MiB; `demo/RUNQ_ENSAYO_ES.showcompiler.zip` ~1,29 MiB. Están rastreados en el commit verificado; un `.gitignore` posterior no los elimina.
- `main` `08e80b4e2a` contiene esencialmente un README mínimo y documentación; frente al tag verificado está **1 commit por delante y 1205 por detrás**, con divergencia. No es la aplicación candidata.
- La rama de desarrollo `feat/runq-ai-campaign-100-2026-10-31` coincidía exactamente con el tag verificado en la comparación realizada (0/0).
- La rama release se creó desde la rama de documentación basada en el tag; antes del nuevo script de auditoría llevaba 14 commits documentales adicionales, sin pérdida de commits del tag.

## 2. Ramas — clasificación por evidencia, no por antigüedad
**Estados:** `ahead=0, behind>0` = rama es ancestro exacto del tag; la versión verificada contiene sus commits. `ahead>0, behind>0` = divergente y con commits exclusivos; NO borrar sin revisión. `ahead>0, behind=0` = descendiente, valorar como entrega. `0/0` = mismo commit.

### A. Conservar o fijar (NO borrar)
| Referencia | Decisión | Motivo |
| --- | --- | --- |
| `verified-working-2026-11-02` | Inmutable | Baseline declarado, 817 tests contabilizados en CI reciente; requiere completar E2E |
| `runq-interface-approved-2026-10-31` | Inmutable | Evidencia visual histórica |
| `feat/runq-ai-campaign-100-2026-10-31` | Conservar temporalmente | HEAD idéntico al baseline en consulta |
| `release/runq-hackathon-2026` | Candidata | Documentación y auditoría sobre versión funcional |
| `integrate/runq-full-consolidation-2026-11-02` | Revisar e integrar selectivamente | 13 commits exclusivos y 2 del baseline ausentes; 75 archivos de diferencia |
| `feat/runq-sfx-batch-recovery-p0-2026-11-02` / PR #133 | Revisar P0 | 15 exclusivos, 2 ausentes; 87 archivos, cambios de recuperación de generación |
| `feat/runq-assistant-expert-v3-2026-11-01` / PR #131 | Revisar P1 | 5 exclusivos, 2 ausentes; 59 archivos, contexto del asistente |
| `fix/runq-grounded-line-references-2026-11-02` | Revisar P0 | 7 exclusivos, 2 ausentes; trazabilidad L# |
| `feat/runq-long-campaign-2026-11-01` | Revisar QA, no integrar bloque | 21 exclusivos, 3 ausentes, 129 archivos |
| `docs/hackathon-submission-2026-11-02` | Conservar hasta absorberlo | 14 commits documentales anteriores al informe |

### B. Candidatas comprobadas a retirar DESPUÉS de archivado y revisión de PR
En la comparación remota todas las referencias siguientes dieron `ahead=0` frente al tag verificado: `feat/runq-v3-delivery-foundations-2026-10-27`, `feat/runq-v8-studio-stage-redesign-2026-10-29`, `feat/runq-v13-technical-workstation-2026-10-29`, `feat/runq-v14-studio-stage-functional-workspaces-2026-10-29`, `feat/runq-v15-agent-qa-visual-freeze-2026-10-29`, `feat/runq-ai-agent-global-2026-10-29`, `feat/meta-muse-reliable-cues`, `feat/voice-follow-synced-2026-10-28`, `stable/voice-autopilot-2026-10-28`, `feat/conversational-cue-editor-2026-10-28`, `feat/audio-library-batch-zip-import-2026-10-28`, `feat/runq-offline-eval-feedback-loop-2026-10-27`, `feat/cue-multi-audio-tracks`, `feat/cue-automation-runtime-2026-10-27`, `feat/runq-unified-modern-2026-10-27`, `feat/runq-unified-creative-manual-2026-10-27`, `feat/runq-systematic-eval-optimizer-2026-10-27` y `feat/runq-stagecraft-v4-integrated-2026-10-28`.

**Importante:** ser ancestro del tag no equivale a tener un PR cerrado, no certifica que no haya referencias externas ni implica autorización para borrar. El commit sigue preservado si el tag/descendientes lo alcanzan, pero una rama puede ser necesaria para PR, auditoría o trazabilidad. Eliminar refs solo después de: inventario completo, backup verificado, resolución documental del PR, confirmación de que no es dependencia de otra rama activa y decisión del propietario.

### C. Ramas divergentes; retener en cuarentena de revisión
Las comparaciones encontraron código exclusivo en, entre otras:
- `feat/runq-v8-drag-audio-to-cues-2026-10-29`: 9 exclusivos / 260 ausentes (8 archivos).
- `feat/runq-voice-v5-current-integrated-2026-10-28`: 29 / 323 (21 archivos).
- `feat/portable-show-archive-2026-10-27`: 44 / 976 (23 archivos).
- `feat/runq-ai-campaign-orchestrator-2026-10-30`: 38 / 66 (12 archivos).
- `feat/runq-studio-audio-dock-2026-10-30`: 13 / 66 (11 archivos).
- `feat/runq-ai-autonomous-qa-2026-10-30`: 47 / 66 (22 archivos).
- `feat/runq-rediseño-producción-2026-10-29`: 7 / 154 (21 archivos).
- `feat/runq-user-facing-ux-2026-10-31`: 1 / 43 (1 archivo).
- `feat/runq-sound-workspace-v5-2026-10-28`: 40 / 323.
- `feat/manual-cue-authoring-2026-10-27`: 23 / 845.
- `feat/per-cue-audio-controls-2026-10-27`: 44 / 976.
- `test/runq-v13-mass-eval-integration-2026-10-29`: 2 / 177.
- `integration/runq-qa-visual-2026-10-30`: 47 / 66.
- `spike/runq-electron-windows-2026-10-30`: 1 / 66.
- `docs/qa-battery-320-analysis-2026-11-02`: 2 / 1205; comparada contra `main` como base de PR, no contra release.

**No basta con `git diff` ni con el número de commits:** comparar archivos, contexto, tests y riesgo de regresión. En las ramas divergentes, los commits pueden representar intentos alternativos, NO mejoras acumulables. No hacer `git merge` masivo de 109 PR.

### D. Pendientes de clasificación individual
**No se ha ejecutado aún una comparación Git para todas las 137 ramas**. Hay un inventario por nombre y un muestreo dirigido arriba, pero no sería correcto dar una cifra exacta de ramas eliminables. El script `tools/audit-git-refs-readonly.ps1`, en esta rama release, produce un CSV/JSON para TODOS los refs en un espejo y marca `DeleteApproved=NO` en cada fila. Ese CSV + revisión de los PR será el inventario decisorio definitivo.

## 3. Estrategia para 109 PR abiertos
- NO fusionar o cerrar los 109 de una sola vez. Primero generar matriz: `PR | base | head | estado | SHA | commits únicos | test | sucesor | decisión | fecha`.
- **P0 de funcionalidad:** PR #133 recuperación SFX, #131 contexto del asistente (P1 funcional), correcciones L#; comprobar si ya están incluidas antes de cherry-pick.
- **UX y ensayo:** #128 experiencia IA/sonido; #125 waveform en dock, #124 foco de Studio, #129 borrador de entrega voz→cue. Revisar con pruebas de transporte/GO y condiciones de armado.
- **Infraestructura/QA:** #126 estabilidad, #122 campañas, #121 piloto pagado. Conservar evidencia y evitar que la QA de pago se ejecute involuntariamente desde CI.
- **Spike:** #123 Electron/Windows; retener como exploración, NO convertirlo en requisito a dos días de entregar.
- **Documentos:** #132 320 evaluaciones, #130 plan exhaustivo, #119 vídeo, #120 aceptación. Migrar resúmenes y evidencia útil al dossier, no todos los archivos ni la historia de pruebas.
- **PR históricos encadenados:** cerrar con comentario “superseded by verified baseline <SHA>” solo si se ha demostrado que están incorporados; si son divergentes, cerrar “archived / not selected for hackathon” después de respaldo e inventario. El cierre del PR conserva discusión y metadatos, no borra su rama por sí solo.
- No cambiar la base de todos los PR a `main`: crearía diferencias enormes e inútiles.

## 4. QA — evidencia real de GitHub Actions
En la ejecución `41534445281` (rama release, commit `762e999`):
- Instalación npm, checks de sintaxis, `npm run qa:codex`, evaluación sintética `600/600`, creación y `unzip -t` de demos original y español: **PASS**.
- Nodo reportó `# tests 817`, `# pass 814`, `# fail 0`. Tres tests no se contabilizaron como pass; registrar su estado exacto en el log antes de afirmar “817 passed”.
- Fallo en `npm run test:interface`, en `tools/interface-browser-e2e.mjs:434`: `Main AI action is above the fold on desktop (bottom=950.90625, viewport=900)`. Screenshot de fallo en `artifacts/interface-review/.../failure.png`.
- Pasos posteriores de navegador/voz/cue/historial/audio fueron **SKIPPED**, NO PASSED.
- PR #133 y #131 muestran la misma etapa de CI fallida, sin establecer que la causa sea idéntica hasta leer sus logs.
- Los artifacts de Actions tienen retención configurada de **14 días**; no sirven como archivo permanente de pruebas. Conservar manifiestos con SHA-256, resultados resumidos y evidencias depuradas en una ubicación durable. No publicar logs brutos con datos de usuarios/proveedores.
- No se han repetido pruebas locales completas sobre el último commit en esta auditoría; leer resultados de CI no equivale a ejecutar QA local.

**Plan de corrección:** reproducir Chrome 900px y 1080px con idioma ES/EN; ajustar disposición real sin ocultar acciones; mantener aserciones; volver a correr `npm run test:interface`, `npm run qa:codex`, pruebas de voz y audio, GO/STOP, ZIP roundtrip, y preflight Windows. Verificar también transiciones 1366×768 y accesibilidad con teclado.

**Reproducibilidad:** en el árbol verificado NO se encontró `package-lock.json`. `npm install`, en lugar de `npm ci` con lockfile, es menos determinista; generar y verificar un lockfile (respetando las licencias), sin actualizar dependencias sin motivo. El paquete directo `libarchive.js@2.0.2` es MIT y exige conservación del aviso correspondiente.

## 5. Seguridad y derechos — publicación bloqueada
**Hallazgos comprobados:**
- El repositorio está privado; publicar ESTE repositorio haría visibles ramas, commits y discusiones públicas asociadas, incluso obsoletas, no solo la candidata.
- En el snapshot existen `.env.example` (sin valores de API en las líneas revisadas), un ZIP de referencias visuales, una imagen de backstage y un ZIP de espectáculo. Los derechos y contenidos embebidos no se han revisado integralmente.
- `AGENTS.md` incluye políticas históricas de coste y correcciones posteriores; exportar toda la documentación interna puede confundir a los jueces.
- `src/core/voiceProviderCatalog.mjs` enumera modelos TTS ajenos a Meta para investigación futura; verificar que no se ejecutan en la candidatura. `tools/agentRoutes.mjs` mantiene una opción Baseten; su mera existencia no demuestra uso efectivo.
- La voz funcional usa endpoints y modelo Meta `muse-voice-transcribe-1.0` en `tools/voiceLiveRoutes.mjs` y `tools/voiceTranscribeRoutes.mjs`.
- La generación SFX usa **`stabilityai/stable-audio-3-small-sfx`**, explícito en `modal/runq_sfx_pilot.py` y `tools/sfxRoutes.mjs`; licencia de pesos “Stability AI Community License” y dependencias/condiciones asociadas que deben revisarse. Que el código del SDK pueda ser MIT NO hace libres los pesos.

**Pendiente (no afirmar como superado):** escaneo de secretos de TODOS los refs e historial, revisión de ZIP y metadatos, auditoría de todas las dependencias transitivas, licencias de imágenes y audios, guiones de prueba e identificadores personales, código reutilizado, disponibilidad real del vídeo y funcionamiento en clean checkout.

**Proceso:** si aparece una clave real, revocarla/rotarla primero. No basta con eliminar el archivo en el último commit; Git conserva versiones anteriores. Una reescritura del repositorio original, además de cambiar hashes, puede dejar datos en PR, forks, caches y clones. GitHub recomienda `git-filter-repo`, coordinación y asistencia de soporte para datos verdaderamente sensibles: https://docs.github.com/es/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository. Preferir un repositorio público nuevo creado desde snapshot revisado.

## 6. Cumplimiento del Meta Global AI Developer Hackathon 2026
**Fuentes:** página oficial de Meta https://dev.meta.ai/events/global-hackathon; página oficial Cerebral Valley https://cerebralvalley.ai/e/meta-ai-developer-hackathon; respuestas de cuenta verificada Cerebral Valley en Discord `#questions` (2 nov 2026). **No se ha obtenido el texto completo de las Official Rules vinculantes aceptadas en el portal**. Diferenciar lo verificado de las preguntas pendientes.

| Asunto | Estado | Acción |
| --- | --- | --- |
| Plazo | Oficial: **4 nov 2026, 21:00 Eastern (EST)** = **5 nov, 03:00 península española** | Entrega interna mucho antes; comprobar el portal |
| Track | Elegir uno: Indie Developer o Startup | Confirmar el inscrito; presentar RUNQ desde experiencia real en espectáculos |
| Temática | “Build for Your World” encaja con producción escénica | Demostrar problema, actor y ahorro de trabajo |
| Repositorio | Respuesta verificada: GitHub público, sin licencia OSI concreta obligatoria, `source-available` admisible | Derechos reservados, atribuciones claras y código ejecutable |
| Demo | Respuesta verificada: vídeo máx. **3:00**, comprensible en inglés, app real, modelos Meta y funcionamiento visible; no slides ni funciones inexistentes | Grabar flujo de RUNQ real; subtítulos/voz inglés |
| Hosting | No obligatorio según organizador; instrucciones ejecutables y ejemplos grabados si hay limitación de hardware/activos | Demo local offline y evidencia de Meta real, sin credenciales del juez |
| Modelos en ejecución | Respuesta de Cerebral Valley en Discord: los modelos de IA invocados en runtime deben ser Meta; prestaciones de SO/navegador pueden ser excepción | **P0: aclarar o deshabilitar generación en runtime con Stability AI** para candidatura |
| Autoría / periodo | Se exige trabajo original y cumplimiento de reglas de reutilización; la diferencia entre Indie y Startup respecto a código preexistente requiere cotejar texto vinculante | Línea temporal fechada, declaración precisa de trabajo previo y del periodo |
| Dependencias / medios | Deben respetar licencias y derechos | Third-party notices; no reutilizar material de terceros sin permiso |
| Propiedad | Respuesta sobre licencia del repo no elimina las licencias amplias de uso que pueden concederse a organizadores por el waiver | Leer waiver y Official Rules completos antes del envío |
| Confirmación | Un push NO es una candidatura presentada | Completar formulario de Cerebral Valley y conservar confirmación |

**Riesgo prioritario de IA:** Modal como proveedor de cómputo puede estar permitido, pero el modelo que RUNQ ejecuta allí para SFX es de **Stability AI, no de Meta**. No declarar automáticamente “incumplimiento” sin Official Rules; **no mostrar generación de ese modelo en el vídeo de concurso** hasta confirmación. Las tomas de audio ya existentes pueden tener derechos de uso distintos del modelo ejecutado en directo; deben validarse por separado. El catálogo TTS Qwen/Chatterbox/Orpheus debe quedar documentado como no activado si no existe ejecución.

**Rúbrica orientativa según waiver resumido en fuentes secundarias, pendiente de texto primario:** impacto 30%; Meta AI 25%; profundidad técnica 20%; demo 25%. Reforzar evidencia y evaluación de Muse, voz Meta y arquitectura de aprobación humana, no solo aspecto.

## 7. Historial de desarrollo y pruebas: cómo conservar las pruebas
**Dos capas complementarias:**
1. **Archivo privado completo e inmutable:** espejo Git con todas las refs, backup verificado, bundle `--all`, manifiesto de SHA, inventario de ramas/PR, copia de documentación de QA, logs y capturas privadas. Controlar acceso y cifrar backups según sensibilidad. Mantener la trazabilidad real y nunca recrear fechas ficticias.
2. **Dossier público depurado:** `PROJECT_HISTORY.md` por hitos fechados, `IMPLEMENTATION_EVIDENCE.md` con funciones→commit original→tests→captura, `TEST_RESULTS.md` con comando, entorno, SHA exacto, tests/skip/fail, `MODEL_USAGE.md` con modelo, proveedor, llamada real y límites, `THIRD_PARTY_NOTICES.md` con licencias, `KNOWN_LIMITATIONS.md` honesto. Enlaces a PR privados pueden figurar como referencias archivísticas pero **los jueces no podrán abrirlos**; publicar evidencia propia sanitizada.

Ejemplo de secuencia pública fiel: Oct 26 núcleo script/Meta → Oct 27 cues, revisión y audio → Oct 28 voz/ensayo y Modal experimental → Oct 29 estudio V13–V15 → Oct 30 interfaz/QA → Nov 2 versión verificada → candidato final. Cada hito requiere un commit/documento y evidencia real, no fechas reconstruidas ni afirmar que todo existía ya en el primer hito.

**Para evitar falsificar historial:** no backdatear commits, no importar ramas sin auditoría, no atribuir a Meta generación de audio de Stability, no declarar QA pagada como 817 tests de IA reales. Los 600 casos de CI son **sintéticos offline**, no llamadas a un modelo.

## 8. Procedimiento seguro de reorganización
### Fase 0 — inmovilizar y respaldar (SIN borrar)
Desde otra carpeta Windows, crear un espejo separado y un bundle de TODAS las referencias; registrar hashes:
```powershell
New-Item -ItemType Directory -Force 'C:\RUNQ-AUDIT' | Out-Null
git clone --mirror https://github.com/vicentektek/showcompiler-hackathon-2026.git 'C:\RUNQ-AUDIT\runq-mirror.git'
git -C 'C:\RUNQ-AUDIT\runq-mirror.git' bundle create 'C:\RUNQ-AUDIT\runq-full-history.bundle' --all
git -C 'C:\RUNQ-AUDIT\runq-mirror.git' bundle verify 'C:\RUNQ-AUDIT\runq-full-history.bundle'
Get-FileHash 'C:\RUNQ-AUDIT\runq-full-history.bundle' -Algorithm SHA256
```
No usar `push --mirror` sobre el servidor. El espejo está diseñado para copiar, NO para publicarse.

### Fase 1 — inventario repetible de todas las ramas
Guardar copia del script de `tools/audit-git-refs-readonly.ps1` y ejecutar fuera del checkout activo:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\audit-git-refs-readonly.ps1 -RepoPath 'C:\RUNQ-AUDIT\runq-mirror.git' -OutDirectory 'C:\RUNQ-AUDIT\reports'
```
Este script compara **cada rama** con el tag verificado y produce CSV/JSON; no modifica refs. Marcar después `OwnerDecision` en una copia del CSV, nunca automáticamente. Cruce con 120 PR y detectar refs usados por releases/tags/dependencias.

### Fase 2 — escáneres locales y derechos
Ejecutar Gitleaks con opciones de la versión instalada, cubriendo historia y árbol. Usar `--redact` cuando esté disponible. No subir informes de secretos ni artefactos sin filtrar. Ejecutar además `npm audit` y licencia de dependencias en checkout aislado, y revisar manualmente ZIP/imagen/fuentes/guiones.

### Fase 3 — consolidación controlada
Hacer una tabla de cambios exclusivos de PR #133, #131 y referencias L#; reproducir defectos con tests antes de portar cada arreglo; rama temporal `fix/release-*` desde release; PR pequeño; CI y Chrome/Windows. No portar modificaciones de presupuestos, rutas o UI que contradigan políticas ni cambiar modelos del concurso de manera encubierta.

### Fase 4 — organizar PR y ramas con criterio
Clasificación por fila:
- `KEEP_ACTIVE`: release, trabajo pendiente imprescindible, herramientas de entrega.
- `PRESERVE_TAG`: referencias históricas/hitos que se quieren citar; anotarlas, protegerlas.
- `CLOSE_PR_ARCHIVE_BRANCH`: PR no seleccionado con trabajo exclusivo, conservar rama en archivo privado hasta después del concurso.
- `CLOSE_PR_DELETE_BRANCH`: ancestro verificado, totalmente documentado, ninguna dependencia, espejo y bundle comprobados, autorización expresa.
- `NEEDS_REVIEW`: divergente, tests incompletos, dependencia desconocida o interés futuro.

Para archivar, conservar SHA y evidencia antes de cerrar PR; cerrar PR primero, eliminar rama después por lotes pequeños. Recontar refs y comparar bundle tras cada lote. Evitar cambios de default branch o force pushes durante la entrega.

### Fase 5 — publicación aislada
Crear repo nuevo `runq-hackathon-2026` (nombre orientativo), primero PRIVADO. Iniciar con snapshot limpio de release revisado, sin `.git` histórico, sin ZIP no autorizados, ni claves, ni documentación interna/confusa. Incluir fuentes necesarias, fixtures originales, pruebas, demo offline, instrucciones, atribuciones y dossier. Ejecutar pipeline exacto en el repo nuevo. **Solo entonces**, tras aprobación del propietario, cambiar visibilidad a público; conservar original privado y backup. GitHub permite al público ciertas funcionalidades de visualización/forking conforme a sus condiciones; “all rights reserved” no anula las licencias de terceros ni los términos del evento.

### Fase 6 — entrega y cierre
Grabar captura del commit final, versión/fecha, QA, vídeo público/unlisted accesible, URL repo, resultado del formulario. Crear tag final, changelog y copia verificable del envío. Después del evento limpiar PR/braches internos sin urgencia.

## 9. Prioridades y puertas de salida
| Nivel | Trabajo | Criterio de aceptación |
| --- | --- | --- |
| P0 | Resolver CI visual | `npm run test:interface` PASS, sin desactivar aserciones |
| P0 | Modelo SFX de Stability en el concurso | Confirmación escrita o modo concurso sin ejecución de IA no-Meta; descripción veraz |
| P0 | Scan completo + activos/licencias | Sin secretos activos ni materiales sin derecho para publicar |
| P0 | Publicación fuente reproducible | Clean checkout + offline QA completo en SHA final |
| P0 | Vídeo y formulario | <=3 min inglés, prueba real Meta, entrega confirmada antes de deadline |
| P1 | Revisar PR #133 y corrección referencias L# | Tests focalizados + regresión completa |
| P1 | Historial de contribuciones | Evidencias con hashes, fechas reales y resultados etiquetados |
| P1 | Lockfile, third party notices, políticas | Instalación determinista y atribución adecuada |
| P2 | Reducir 137 ramas y 109 PR | Tras cerrar entregas, en lotes y con respaldo |
| P2 | Electron, ASIO, funciones especulativas | Posponer, no inflar alcance |

**Gate final:** no publicar ni eliminar refs mientras falten revisión de reglas vinculantes, escaneo histórico, derechos, validación de los cambios seleccionados y aprobación expresa. No confundir el estado de la aplicación con que exista un documento que lo declare.

## 10. Evidencia y enlaces de auditoría
- Comparación base–release: https://github.com/vicentektek/showcompiler-hackathon-2026/compare/verified-working-2026-11-02...release/runq-hackathon-2026
- Ejecución fallida de CI: https://github.com/vicentektek/showcompiler-hackathon-2026/actions/runs/41534445281
- PR #133: https://github.com/vicentektek/showcompiler-hackathon-2026/pull/133
- PR #131: https://github.com/vicentektek/showcompiler-hackathon-2026/pull/131
- GitHub — eliminación de información sensible: https://docs.github.com/es/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
- Meta official: https://dev.meta.ai/events/global-hackathon
- Cerebral Valley official: https://cerebralvalley.ai/e/meta-ai-developer-hackathon
- Discord official questions: https://discord.com/channels/1557169028080869426/1564043204725182484
- Stability AI audio model/license: https://huggingface.co/stabilityai/stable-audio-3-small-sfx ; https://stability.ai/license

**Limitaciones de esta auditoría:** lectura remota de metadatos, árbol y ficheros clave, comparación dirigida de ramas y logs reales. NO se ha podido ejecutar todavía el escáner de todos los objetos Git ni inspeccionar el interior de todos los binarios; NO se dispone del PDF de Official Rules aceptadas, ni de un run integral verde del SHA final. Esas tareas son condición para cerrar el diagnóstico, no detalles opcionales.
