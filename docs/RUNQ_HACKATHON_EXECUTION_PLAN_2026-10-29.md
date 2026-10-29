# RUNQ · Plan maestro de ejecución y entrega (29 oct – 4 nov 2026)

> **REPLAN ACTIVO — 29/oct noche:** el operador ha suspendido grabación/edición del vídeo hasta aprobar la UI fiel a los cinco mockups. El orden y los gates de este plan quedan actualizados por [RUNQ_REPLAN_AI_VISUAL_DESKTOP_2026-10-29.md](RUNQ_REPLAN_AI_VISUAL_DESKTOP_2026-10-29.md): (1) validación real focalizada de IA Meta/Agent/voz, (2) rediseño visual, con spike de Electron en paralelo, (3) .exe Windows y QA, (4) vídeo real tras aprobación visual. Los plazos de vídeo del plan original son históricos, no instrucciones vigentes. No se autorizan pruebas pagadas mediante este cambio.

**Estado:** ACTIVO · propietario de integración: rama `integration/runq-demo-2026-10-30` · inicio: 2026-10-29.
**Base fijada:** V15 `daa3781656707ff85ef65d289d239731eef25652` (PR #110; CI GitHub Actions de esa revisión: SUCCESS).
**Ámbito:** Meta Global AI Developer Hackathon 2026. La rama `main` no es la candidata funcional.
**Política:** no fusionar automáticamente con `main`; no publicar, no gastar créditos, no borrar datos ni cambiar permisos de repositorio sin revisión/autorización explícitas.

## 0. Objetivo verificable

Entregar RUNQ como prototipo funcional de espectáculo con una historia demostrable:
**guion TXT original → análisis real de Meta Muse Spark → propuestas con evidencia L# → aprobación humana → cues editables con audio real → Ensayo con detección de pies / AUTO GO explícitamente ARMADO → Directo manual seguro → exportación/importación ZIP con medios**.

El éxito del hackathon depende del **impacto, integración de Meta, demostración honesta y calidad técnica**, no del número de controles en pantalla. No declarar soporte de hardware profesional, PFL, ASIO, iluminación real, ejecutable Windows ni generación SFX real si no se han validado. La IA nunca ejecuta GO ni decide de forma autónoma armar reproducción.

**Puertas de salida:**
- **RC1 (30/oct):** recorrido local básico repetible en Windows, ZIP íntegro, GO/NEXT/STOP/STOP ALL, sin fallos P0, código y tareas de integración rastreables.
- **Captura (1/nov):** una sesión real de voz con pies, saltos/retrocesos y audio audible documentada, o alternativa explícita en modo asistido si falla la prueba real.
- **Freeze (2/nov, objetivo 18:00 CET):** commit inmutable para vídeo y candidatura; solo hotfix P0 con nueva QA después.
- **Entrega interna (4/nov, objetivo 18:00 CET):** plataforma, demo, documentación, código y vídeo enviados y comprobados.

## 1. Normas del certamen y verificación externa

**Confirmado en comunicación del organizador (email del 26/oct):** evento 26/oct–4/nov; límite anunciado para reclamación de créditos Meta el 4/nov a las 9 PM ET; `https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details` y `https://dev.meta.ai/events/global-hackathon` son puntos de comprobación. **La fecha/hora exacta de entrega, modalidad, licencia y duración obligatoria del vídeo se tienen que confirmar en las Official Rules y portal de entrega autenticado; el calendario utiliza provisionalmente el cierre 4/nov 21:00 ET.**

**Rúbrica de trabajo procedente de investigación anterior, pendiente de cotejo con versión oficial vinculante:** impacto 30 %, uso de IA Meta 25 %, demostración 25 %, calidad/ejecución 20 %. No presentar esta distribución como contractual sin comprobar el documento original.

**Tarea administrativa P0:** conservar captura o nota de la fuente oficial vigente y verificar:
- modalidad elegida (Indie/Startup), elegibilidad y condiciones de equipos;
- fecha/hora exacta de SUBMISSION (distinta de claim de créditos);
- campos y formato del formulario, plataforma y accesibilidad para jueces;
- duración/resolución/subtítulos del vídeo y si exige enlace externo;
- si repositorio público es obligatorio, qué licencia y qué código del periodo del evento puede presentarse;
- posible prohibición/limitación de aportes anteriores, contenido de terceros, activos IA, IA externa;
- uso autorizado de marca Meta y derechos del proyecto.

**No publicar repositorio de desarrollo ni usar logos de Meta en materiales hasta revisión.** Dar prioridad al reglamento aceptado sobre contenido promocional o información de otros hackathons.

## 2. Fuente de verdad del código

| Referencia | Uso | Estado de integración |
|---|---|---|
| PR #102 V13 | base UX de estación técnica | ancestro de V15 |
| PR #107 V14 | Studio/Ensayo/Stage, journal, un motor | ancestro de V15 |
| PR #108 | agente global, plan multicue y aprobación | ancestro de V15 |
| PR #110 V15 | conversación, CSS, QA de 600 casos sintéticos | **base congelada** |
| PR #109 audit fix | previsualización completa (incluye cambios indirectos), E2E 81 cues, Windows preflight | **P0 incorporar selectivamente** |
| PR #104/#106 QA paid pilot | laboratorio Meta/Baseten/Modal con controles de coste | independiente; no integrar precipitadamente |
| PR #97 vídeo | storyboard y locución inglesa provisional | aprovechar artefactos; actualizar capturas a build final |

**Conflictos observados #109 vs #110:** `src/ui/runq-agent-ui.mjs` y `tools/runq-agent-browser-e2e.mjs`; el integrador debe preservar el diálogo V15 y añadir la vista previa completa de #109. `src/core/agentCore.mjs`, `test/agentCore.test.mjs` y `tools/runq-preflight.ps1` son candidatos de port selectivo; `README.md` requiere actualización, no un reemplazo descontextualizado.

## 3. Matriz de trabajo y responsables lógicos

Los responsables son **roles** de agente/operador, no personas asignadas. Todos los agentes trabajan en worktrees distintos; solo Integración cambia la rama de RC1.

| ID | P | Tarea y criterio de aceptación | Rol | Dependencia | Objetivo | Estado |
|---|---|---|---|---|---|---|
| T01 | P0 | rama única V15 + fixes #109; preview completo de cambios, sin truncar operaciones | Integración | V15 | 30/oct | EN CURSO |
| T02 | P0 | lint/sintaxis, Node, Chrome, 600 offline, demo ZIP; informe con SHA | QA | T01 | 30/oct | PENDIENTE |
| T03 | P0 | show español de prueba, cues/medios/pies correctos, escenarios de salto/retroceso | Demo/QA | ninguna | 30/oct | PENDIENTE |
| T04 | P0 | test humano del motor, dos cues simultáneos, NEXT vs selección, STOP ALL y reabrir ZIP | Operador | T01,T03 | 30/oct | PENDIENTE |
| T05 | P0 | Autopiloto real con micrófono y ARM deliberado; registrar aciertos, fallos, falsos GO y latencia | QA+Operador | T03,T04 | 1/nov | PENDIENTE |
| T06 | P0 | 1 análisis Meta real con fuente L# y aprobación, ES; caso EN adicional si presupuesto seguro | IA+Operador | créditos/saldo | 1/nov | PENDIENTE |
| T07 | P1 | Modal: revisar habilitación, endpoint, proxy y política de costes; 1 SFX real solo con permiso | Sonido | claves/créditos | 31/oct | PENDIENTE |
| T08 | P1 | arreglos UX exclusivamente bloqueantes (navegación, scroll, lectura, cue status) | UX | T01 | 2/nov | PENDIENTE |
| T09 | P0 | guion, voz, capturas reales, storyboard; montaje completo de vídeo | Vídeo | RC1, T03 | 31/oct | PENDIENTE |
| T10 | P0 | grabación final real de Autopiloto o alternativa asistida sin simular | Vídeo+Operador | T05 | 1/nov | PENDIENTE |
| T11 | P0 | auditoría de código/secretos/licencias y copia de entrega reproducible | Packaging | T01 | 2/nov | PENDIENTE |
| T12 | P0 | freeze de build, vídeo final/subtítulos, pruebas en instalación limpia, readme EN | Integración+Vídeo | T02-T11 | 3/nov | PENDIENTE |
| T13 | P0 | envío al portal, enlaces verificados, recibo/captura de confirmación | Operador | T12, reglas | 4/nov | PENDIENTE |
| T14 | P0 | verificación reglas oficiales y formato exacto de envío | Organización | acceso al portal | 30/oct | PENDIENTE |

**Tareas P2 pospuestas:** Electron/instalador, rutas físicas PFL/ASIO/DMX, ventanas independientes, streaming WAV/ZIP64, CSS global refactor, mezclador multibus, tests pagados de cientos de casos y nuevo motor de audio.

## 4. Secuencia diaria y gates

### Jue 29 — integración inicial
1. Aislar V15 por commit y abrir rama/worktree RC1.
2. Portar correcciones #109, con atención a `automation.stopCueIds` y vista previa de >75 cues.
3. Comprobar que no se pierde conversación V15, diff, consentimiento ni deshacer.
4. Ejecutar QA si hay entorno ejecutable y abrir PR **draft** dirigido a V15, no a `main`.
5. Preparar checklist humano y fixture de demostración de voz.

### Vie 30 — RC1 funcional
- `npm install --no-audit --no-fund`, `npm run qa:codex`, `npm run qa:agent:mass`, Chrome E2E, y prueba manual de sonido/Windows.
- Importar TXT, proponer/aceptar cues, reproducir WAV reales, editar IN/OUT, fade, exportar ZIP y reabrir.
- Validar que `Play` directo no cambia NEXT, `Set NEXT` no ejecuta GO y STOP ALL cancela audio/acciones pendientes.
- Congelar RC1 solo si criterios P0 cumplen. Si agente V15 falla, usar fallback estable V14 e informar las limitaciones.

### Sáb 31 — primer montaje de vídeo
- Capturar trayecto real; montaje íntegro incluso provisional (no solo guion/storyboard).
- Resolver configuración Modal si no interfiere en núcleo; fallback a WAV originales ya disponibles.

### Dom 1 — voz real y grabación final
- Pruebas de voz ES/EN, repeticiones/saltos/retrocesos, ARM/DISARM, falsos GO y latencia observable.
- Grabar Autopiloto real o demostrar modo asistido con narración ajustada.

### Lun 2 — freeze
- Corregir solo P0, QA, documentar límites; identificar SHA de captura y entrega.
- Auditar propiedad intelectual, secretos e historial; preparar la copia de exposición.

### Mar 3 — candidatura completa
- Vídeo MP4/subtítulos/voz, descripción técnica inglés, README, reproducibilidad, enlaces y prueba de instalación limpia.
- Simulación de envío del portal sin enviarlo si aún requiere revisión.

### Mié 4 — envío temprano
- Enviar antes de 18:00 CET, revisar recepción y guardar evidencias. No desarrollar funciones nuevas.

## 5. Gating de integración y seguridad

**Invariantes obligatorios:**
1. Selección de cue, NEXT y GO son operaciones diferentes.
2. Modelos externos solo proponen, nunca mutan antes de la aprobación ni tocan GO/STOP/ARM.
3. El Autopiloto solo hace GO cuando está expresamente armado en Ensayo; saliendo se desarma.
4. STOP ALL detiene show, preescucha y tareas diferidas, sin reanudación inesperada.
5. No medios ausentes reproducibles; misma salida física de escucha y GO, no fingir PFL.
6. JSON no incluye audio, ZIP de espectáculo sí; roundtrip con WAV comprobado.
7. Preview AI muestra todo campo persistido alterado, incluso referencias/automatizaciones indirectas.
8. Node/CI offline sin consumo de API; toda llamada real requiere autorización por solicitud, presupuesto y panel verificado.
9. No logs ni commits con claves, respuestas crudas, guiones privados, datos de cuenta o WAV sin derechos.

**QA mínima por commit:** cambios focalizados → `npm run check:syntax` → `npm test` → `npm run qa:codex` → `npm run qa:agent:mass` → Chrome smoke/E2E → pruebas humanas de la zona afectada. CI verde no equivale a escucha física ni precisión real de Muse.

**Severidad:**
- **P0 bloqueo:** GO accidental, STOP ALL fallido, ARMed Auto GO en Directo, datos corruptos, proyecto no arranca, diff de IA incompleto, pérdida de audios del ZIP, fuga de secretos.
- **P1 corregible:** importación normal bloqueada, UX que impide completar demo, traducciones críticas, IA remota sin alternativa, generación SFX no disponible si el vídeo la necesita.
- **P2 diferido:** mejoras cosméticas, perf optimizada grandes WAV, ventanas desacopladas, empaquetado nativo.

## 6. Trabajo paralelo y exclusividad

**En paralelo con ramas/worktrees dedicados:** QA sin cambios productivos, fixture de voz, configuración Modal aislada, vídeo, documentación, revisión de reglas, auditoría de publicación.

**Exclusivo del integrador:** commit/merge sobre RC1, cambios de `src/ui/app.mjs`, motor Web Audio, modelo de cues, `runq-agent-ui.mjs` y resolución de conflictos. No ejecutar dos agentes editando esos archivos en el mismo checkout.

**Exclusivo de operación:** pruebas de voz y audio reales sobre un solo servidor/port con volumen bajo; pruebas pagadas Meta/Baseten/Modal secuenciales, contadores y ledger compartidos. No usar scripts antiguos con presupuestos disjuntos sin conciliar.

## 7. Métricas y evidencia de aceptación

| Área | Evidencia | Umbral mínimo |
|---|---|---|
| Seguridad | manual+automatizada GO/NEXT/STOP/ARM | 0 incidentes P0 |
| Persistencia | ZIP export/reimport, bytes y referencias | 100 % de los medios del fixture |
| IA Meta | solicitud real autorizada y L# verificables | al menos 1 caso útil aprobado; sin falsos claims |
| Voz | prueba presencial de cues, saltos y retrocesos | comportamiento visible y resultado registrado; si falla, fallback asistido |
| Agente | diff completo y reversible, sin permisos de transporte | 100 % operaciones revisables |
| Vídeo | reproducción íntegra y auditable | corte completo al 31/oct, final al 3/nov |
| Reproducibilidad | clon limpio con README | sin pasos ocultos salvo claves opcionales |

No atribuir tasas de acierto a Meta/Baseten basadas en pruebas sintéticas; registrar denominadores reales. Sin métricas de latencia medidas, no afirmar cifras.

## 8. Estado y siguiente acción

- [x] Revisados PR y CI de V15 frente a la auditoría #109.
- [x] Rama de integración creada desde el commit V15 fijado.
- [x] Plan de entrega y gobernanza documentados.
- [ ] Port selectivo de seguridad #109 y tests.
- [ ] PR draft de integración y resultado CI.
- [ ] Fixture español con pies demostrables.
- [ ] Aceptación manual Windows y materiales del vídeo.

**Historial:** cada cambio de estado requiere SHA, fecha, pruebas y vínculo al PR. No marcar tareas terminadas solo por tener un componente o un test sintético.
