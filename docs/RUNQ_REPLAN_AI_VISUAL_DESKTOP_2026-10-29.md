# RUNQ — Cambio de prioridades: QA de IA, diseño aprobado y ejecutable Windows

> **Actualización P0 29 octubre — RUNQ Audio recuperado y simplificado:** La generación Modal ya fue probada por el operador, y la evaluación subjetiva revela mejor calidad con prompts ingleses. PRs #113–#117 forman una pila **todavía sin fusionar** de sonido → historial seguro → flujo simple → inglés de interfaz → traducción/optimización Meta con revisión previa. La traducción mediante Meta no autoriza generación Modal: son solicitudes distintas. Ver [documentación funcional](SFX_ENGLISH_PROMPT_IMPLEMENTATION_2026-10-29.md).
>
> **Codex 30 octubre:** ejecutar [paquete acotado](CODEX_AI_QA_TOMORROW_2026-10-30.md) y `npm run qa:ai:tomorrow:offline` para pruebas offline y resumen automático; la CI ya hace las suites grandes. **No** ejecutar tests pagados ni dejar agentes con acceso libre a la API. La autorización de lotes reales de IA requiere aprobación separada.


**Decisión de producto:** 29-10-2026 · **Sustituye el orden de ejecución** de `RUNQ_HACKATHON_EXECUTION_PLAN_2026-10-29.md` en caso de conflicto.
**Solicitado por el operador:** no capturar ni editar todavía el vídeo porque el aspecto actual no cumple los mockups. Priorizar pruebas REALES de IA, fidelidad visual y app Windows.
**Base funcional:** PR #111 / rama `integration/runq-demo-2026-10-30`. No alterar motor estable, proyecto, secretos ni el comportamiento AutoGO/STOP ALL.

## Hallazgo verificado: UI V15 NO equivale a mockups aprobados

La guía de referencia original describe CINCO layouts: RUNQ Studio, Audio, Guion, Ensayo, Directo; paleta de base #14181F / paneles #1A1F27 / activo #202735, acentos de contexto azul/ámbar/verde/rojo; estructura profesional con navegador a izquierda, lista de cues central, inspector derecho, onda/editor inferior, transporte superior; tres densidades 28–30/36–38/44–46 px; splitters y persistencia, jerarquía operativa, estados reales y no decorativos.

Repositorio actual: `index.html` incluye hojas CSS superpuestas desde generaciones V7 a V15 además de base; `src/ui/runq-visual-freeze-v15.css` documenta que es únicamente acabado visual (sin layout reparenting ni JS) y utiliza tokens #101924, #15212c, #192734 y abundantes overrides `!important`. `src/ui/app.mjs` mantiene el único motor de cues y debe permanecer estable. El rediseño exige reorganización COMPONENTIZADA, no otro archivo de overrides. Los cinco PNG originales de mockups deben añadirse como referencias versionadas a `docs/design/reference/` o localizarse en archivos actuales **antes de evaluar fidelidad pixel a pixel**. La guía textual por sí sola no representa todos los detalles gráficos.

### Criterios de diseño irrenunciables

- Studio: navegador jerárquico + Cue List dominante + inspector + editor inferior, función activa perceptible.
- Audio: MediaBay profesional, tabla/árbol/filtros, preview y forma de onda, vincular audio/crear cue sin pérdida de contexto.
- Guion: líneas L#, cues vinculados, IA contextual, aceptar/rechazar/regenerar con trazabilidad.
- Ensayo: pie actual, oído, confianza solo si hay dato real, ARM explícito, acción manual, muestra real de salto/retroceso.
- Directo: NEXT, GO, audio actual, STOP individual y STOP ALL siempre visibles; edición/IA oculta.
- Tres densidades, 1920x1080 y 1366x768 primero; probar 1100x640 y 900x600.
- Ningún click de inspección debe hacer GO; conservar separación Selected / Set NEXT / GO; audio de preview NO se rotula PFL.

## Arquitectura Windows (decisión provisional: Electron)

Estado real: ES modules en navegador, Web Audio, servidor Node HTTP local `tools/dev-server.mjs`, adaptadores Meta/Modal/Baseten en Node, sin `main` de Electron ni empaquetado Windows. Para el hackathon elegir Electron frente a Tauri porque permite reutilizar Node/Chromium y reduce reescritura, aunque consumirá más RAM y tamaño de distribución.

### Prueba de viabilidad temprana, EN PARALELO al QA de IA

1. Crear rama aislada `feat/runq-electron-spike` desde PR #111; no fusionar en RC1 hasta aceptación.
2. Crear proceso principal que inicia `createAppServer()` en `127.0.0.1` con puerto efímero, espera a escucha y abre una sola BrowserWindow a ese origen local; al salir cierra servidor/streams; gestionar otra instancia sin duplicar audio.
3. Seguridad: `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`; navegación externa bloqueada, CSP restrictiva, permisos de micrófono por acción explícita, validación de IPC si hay bridge, sin exponer claves al renderer.
4. Materiales: empaquetar HTML, CSS, ES modules, WASM/archives y dependencias; recursos/Ruta de app empaquetada; directorio `userData` separado para settings, reports y ledger si aplica. No empaquetar `.env` ni tokens.
5. Probar en WIN: importación TXT, WAV + ZIP; lectura/escritura de archivos, show de voz con Muse, parada de micrófono, GO/STOP ALL, cierre completo, sin servidor residual; comprobar compatibilidad de Web Speech / streaming en Chromium de Electron. No asumir que Chrome ≡ Electron.
6. Generar inicialmente `portable.exe` de prueba con electron-builder o distribución desempaquetada. Firmado/instalador NSIS y rutas múltiples son posteriores; Windows SmartScreen puede advertir si no hay firma.
7. **Gate del spike**: app arranca sin `npm run dev`, sin navegador externo, sin requerir instalación de Node, permite import/export y transport seguro. Si falla voz o empaquetado, se mantiene RC1 navegador como fallback y se corrige aislado, sin sacrificar envío.

## IA — pruebas priorizadas, NO campaña masiva de todas las APIs

`npm run qa:codex`, `npm run qa:agent:mass` y CI son pruebas GRATIS con guiones sintéticos/mocks, **no miden la precisión del modelo**. La demo ZIP español también es de procedencia MANUAL_MOCK. El operador ha informado de funcionamiento general, pero no hay resultados medidos de pruebas reales exhaustivas.

**Principio:** primero inventario y muestras reales discriminativas; luego corrección focalizada + regresión; no 200 peticiones de cada proveedor sin diagnóstico. Se recomienda 30–60 casos humanos totales entre IA y voz; más solo si aparece un error sistémico o saldo/tiempo lo permite. Números objetivo de planificación, no ejecución autorizada.

| Bloque | Prioridad | Tamaño sugerido | Métricas / aceptación | Dependencias |
|---|---|---|---|---|
| Meta Muse Spark - guion -> propuesta | P0 | 10–15 peticiones reales de guiones ES/EN de los corpus originales | fuente L# exacta, no PLAY de negativos, omisiones, clasificación PLAY/STOP/CONTINUE, propuestas útiles revisadas por técnico; 0 fuentes fabricadas | autorización por lote, Modelo API key válida + saldo/coste |
| Agente conversacional Meta | P0 | 12–20 casos reales mixtos ES/EN (crear, mover, renombrar, borrar, negar, aclarar, auditar, undo) | validez JSON, intención correcta, revisión 100 % de cambios indirectos, sin ejecutar transporte; conservar presupuesto local | same + permisos |
| Voz Rehearsal ES/EN | P0 | al menos 3 secuencias completas ES, 2 EN, más casos negativos/ambiguos | sucesión, salto, retroceso, repetición, bloqueo sin ARM, 0 GO no autorizado, conteo falso GO y tiempos reales | micro Windows y consentimiento sesión; una prueba a la vez |
| Audio/Sound Lab Modal | P1 | 1–3 creaciones reales tras restaurar política | SFX se oye, revisión IN/OUT/fades, aceptar/rechazar, crear cue, ZIP roundtrip; registrar coste y revisión | habilitación Modal, endpoint, secret, límite coste |
| Baseten | P1 opcional | 5–10 comparativos solo si clave promocional queda recuperada | mismas entradas/gold, tasa utilidad y validez frente Meta | clave/cuenta/credito recuperados |
| IA multimedia no integral (Imagen, SAM, TTS, voz generativa) | P2 | 0 en este sprint | no construir sólo por completar servicios | posthackathon |

**Reglas:** no lanzar llamadas reales desde CI, no probar sin autorización explícita por lote/presupuesto, comprobar saldo real y alertas del proveedor, no borrar ledgers separados, no grabar claves ni respuestas privadas. Modal bloqueado por política se mantiene bloqueado hasta corregir explícitamente la configuración. Baseten clave de promoción rota es independiente del núcleo Meta.

### Plan de QA con evidencia

- Antes de enviar: congelar fixture y gold provisional, baseline SHA y escenarios de éxito/no éxito. `npm run qa:meta:plan`, `npm run qa:agent:live:plan` o comandos dry-run según protocolos; NUNCA `--live` por defecto.
- Autorizados: lotes pequeños, registros locales protegidos con ID, resultado válido, acierto, motivo error, latencia median/p95 y presupuesto reservado. Revisión artística manual con clips/guiones originales.
- Prioridad de fallos: transporte no autorizado > L# fabricada > cues negativos transformados en PLAY > pérdida de proyecto > intenciones conversacionales erróneas > falsos disparos de voz > SFX no generados.
- Fix por uno: test rojo → cambio mínimo → suite offline → una reevaluación real acotada; no reescribir todos los prompts a la vez.
- Gate IA P0: flujo real de Meta completo y comprendido, dialogo/edición y Undo sin pérdida, voice ARM/STOP seguro en Windows; los errores marginales se documentan para no bloquear el diseño. Las campañas masivas restantes se posponen.

## Nuevo orden y decisiones de tiempo

Fecha local CET; entrega oficial del proyecto **04-11-2026 21:00 ET = 05-11-2026 03:00 CET**, según página pública de Meta. Mantener meta interna de envío **04-11 18:00 CET** con margen, sujeto a reglas autenticadas.

| Fecha | Trabajo crítico | Paralelo permitido | Gate |
|---|---|---|---|
| 29 noche – 30/oct | inventario Meta/voz/agent/Modal y *dry runs*; pruebas REALES priorizadas solo autorizadas; corregir P0 | spike aislado Electron (sin tocar motor) + localizar PNG mockups | resultados/gaps medidos; base estable |
| 30–31/oct | segunda tanda focalizada IA si hubo defectos; cerrar P0 | comenzar sistema tokens y shell según mockups, sin modificar transporte | GO seguro + 5 layouts en progreso |
| 31/oct – 1/nov | UX profesional: Studio → Audio → Guion → Ensayo → Directo; densidades, estado, resizers; Chrome comparativas | preparar adaptación Electron con resultado del spike | capturas REALES comparadas con referencias; usuario aprueba estilo |
| 1–2/nov | UX y Electron portátil integrados; regresiones de mic/audio/ZIP/voz/IA | seguridad y documentación candidatura | freeze candidato ideal 02/nov por la tarde |
| 2–3/nov | **solo tras aprobación visual/funcional** capturar demo verdadera y montar vídeo; si packaging bloquea, grabar la versión estable | resumen, licencias, entrega | video final/reproducibilidad |
| 4/nov | subir y validar formulario, mantener margen | hotfix P0 solo con nueva QA | recibo verificado antes de 18:00 |

**Alerta de plazo:** fidelidad alta a cinco mockups + decenas de pruebas de IA + ejecutable + video en ~6 días es riesgo alto. Si el 1/nov no hay rediseño utilizable, recortar funciones P1/POC de Electron antes de sacrificar integridad de demo y entrega. El formato navegable validado sigue siendo fallback, NO objetivo del producto final.

## Trabajo paralelo sin conflictos

- **QA IA**: plan + tests y resultados, ramas/entornos aislados, NO tocar CSS o transporte.
- **Diseño**: referencias PNG, tokens, layouts y componentes; un solo integrador de HTML/CSS; respetar ids y eventos de app.mjs.
- **Electron**: rama aislada de shell/packaging; no reescribir core y no guardar secrets.
- **Integración**: único propietario RC1 que acepta PRs tras QA; no mezclar cambios parciales con la rama estable.
- **Vídeo**: planificación documental solamente hasta que el usuario apruebe el aspecto. **Captura y montaje en PAUSA explícita**.

## Criterios de aceptación finales

- P0: no GO accidental, ninguna IA muta/ejecuta sin aceptación, STOP ALL cancela pendientes, proyecto ZIP completo, voz con ARM exclusivamente Ensayo.
- IA: registrar resultados humanos verificables, NO presentar 600 mocks como accuracy; al menos un análisis Meta real y una edición agente real en la build final si los créditos están disponibles.
- Visual: screenshots reales Studio/Audio/Guion/Ensayo/Directo comparadas con PNG aprobados, tres perfiles densidad cuando exista tiempo, scroll y teclado seguros en 1920x1080/1366x768.
- Windows: .exe real portable solo si reproduce show y no falla permisos/voz/recursos; no anunciar «nativo» ni ASIO.
- Vídeo: esperar a aprobación visual, pero reservar una jornada antes de entregar; no imágenes falsas de RUNQ y verificar límite oficial de duración.

## Revisión de prioridades tras la prueba real de sonido (29 oct, noche)

**P0 — Fiabilidad funcional para demo (30 oct):** validar manualmente en Windows 1 prompt español → borrador inglés revisado → sonido generado REAL por Modal → escuchar → Usar sonido → crear cue; con recuperación de intento fallido. Pasa de 3 a 10 intentos diarios solo como máximo técnico; presupuesto USD original no cambia. Testear EN/ES interfaz y texto, sin opciones de QA en la vista habitual.

**P0 — Calidad de IA (30 oct):** entregar a Codex matriz estable, fixtures y guion de trabajo; CI offline automatizada. Real Meta cue/agent/chat y evaluación de calidad de prompts cuando el operador autorice solicitudes y máximo USD; NO 600 llamadas pagadas. Voice/autopilot con micrófono: prueba manual específica en Ensayo, no modo Directo.

**P0/P1 — Diseño aprobado (30–31 oct):** usar los cinco mockups como fuente de verdad; no continuar añadiendo opciones a Audio. Rehacer shell profesional Studio/Audio/Guion/Ensayo/Directo manteniendo motor. Inglés por defecto, español totalmente disponible, tamaños 1920/1366 y menor resolución.

**P1 — Windows exe en paralelo (30–31 oct):** spike Electron aislado; entregable portable solo después de comprobar voz, permisos, import/export, cierre del servidor y STOP ALL. No comprometer RC1 si falla el empaquetado.

**P1 — Entrega del concurso (1–4 nov):** integrar PRs probados en rama de demo estable, fijar build, elaborar instrucciones y vídeo SOLO tras aceptación visual. Hito interno de envío: 4 nov 18:00 CET.

**Gate de mañana:** revisar CI y una prueba REAL con usuario; Codex termina el día con informe corto de fallos priorizados y pruebas nuevas, NO con otra refactorización a ciegas. Si todo lo offline está verde, Codex prepara exclusivamente el plan de lotes reales y espera autorización.
