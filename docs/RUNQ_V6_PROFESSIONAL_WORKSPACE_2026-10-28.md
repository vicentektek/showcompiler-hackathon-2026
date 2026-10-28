# RunQ V6 — Arquitectura UX de producción profesional
**Fecha:** 2026-10-28  
**Estado:** contrato de diseño para implementación; no modifica audio, IA, show, credenciales ni GO.  
**Base inspeccionada:** PR #90 editor conversacional, PR #88 Voz/Ensayo V5, PR #89 Sonido, PR #82 AI Studio. Estas ramas no constituyen todavía un único ejecutable validado.

## 0. Tesis
RunQ no debe organizarse como un menú de tecnologías (IA, Voz, Sound Lab, Cues), sino como la herramienta de un **regidor/técnico de playback**:
1) preparar un espectáculo sobre un proyecto y un guion,
2) ensayar sobre ese mismo espectáculo, incluyendo reconocimiento de pies opcional,
3) ejecutar el show con un entorno seguro, inequívoco y sin cambios creativos inesperados.

**IA transversal, operación determinista.** La IA contextual crea *propuestas o borradores* que el operador entiende, puede corregir, probar y aceptar; nunca opera GO directamente ni transforma una propuesta en cue/aprobación de audio sin acción humana.

## 1. Modelo de navegación — decisión

### Nivel 0: shell persistente
- **Barra global compacta:** RunQ | Proyecto activo (nombre y ubicación, dirty/saved, ZIP incompleto vs portable) | Guardar | Estado del audio/output real | Alertas/preflight resolubles | Idioma | Ajustes | **PARAR TODO** claramente separado.
- **Modos principales, tres únicamente:** **PREPARAR / PREPARE**, **ENSAYAR / REHEARSE**, **DIRECTO / SHOW**. Directo es un modo con bloqueo de edición; no simplemente otra pestaña con los mismos controles.
- Acceso a Inicio/Biblioteca de proyectos desde el selector de proyecto, no una décima pestaña.
- Barra inferior de estado: build/engine, provider *configured/not configured*, proyectos, audio activo, archivos pendientes; solo señales verificadas, sin métricas inventadas.
- Si no hay proyecto, landing de proyectos; ocultar menú de edición, abrir/crear/importar show.

### Preparar
Subnavegación (pestañas pequeñas o rail que no duplica el menú de app): **Guion / Script**, **Cues / Cues**, **Sonido / Sound**. Nada de Voz como tab superior y nada de AI como destino global competidor.
- Guion contiene el guion original con referencias Lxx, búsqueda, escenas, selección de tramo y **Propuestas IA / AI Suggestions** en un panel de revisión con evidencias.
- Cues contiene lista profesional + inspector editable + dock contextual **Asistente / Assistant** bajo demanda, también puede abrirse desde Guion y Sonido con su contexto.
- Sonido contiene **Biblioteca / Library** y **Crear y editar / Create & Edit**; dos contextos, un solo flujo de archivo/toma→biblioteca→cue, sin pantalla de Incorporación obligatoria.
- **Comprobación / Preflight** es botón global con indicador real de errores; configuración avanzada de audio, atajos y APIs se abre desde Ajustes.
- Acceso rápido contextual: `Ver en guion`, `Editar cue`, `Crear sonido para este cue`, `Usar este sonido…`.

### Ensayar
Una consola única: guion sincronizado, cola de cues, transporte, área *voice follow* de alta legibilidad. Selección de **Manual / Assisted / Autopilot** (el modo NO equivale a ARM).
- **Autopiloto / Rehearsal Autopilot** es opción de modo de Ensayo, no una pestaña.
- Configuración/detalle contextual desplegable: **Seguimiento por voz / Voice Follow** con `Micrófono`, `Pies`, `Pruebas`, `Diagnóstico`. No equiparar simulación con reconocimiento real.
- Estado permanente durante Ensayo: `MIC OFF/LIVE`, `Meta connected/error`, `ASSISTED / AUTO DISARMED / AUTO ARMED`, último texto FINAL, cue detectado, cue realmente ejecutado, motivo de descarte, fecha/hora de movimiento.
- Permitir retroceder, repetir, saltar hacia delante sin ejecutar cues intermedios; mantener disparo manual y desarme inmediato.

### Directo
Consola diferente, no Editor renombrado: **NEXT GO** grande e inequívoco, GO dominante, **ACTIVOS / ON AIR** con tiempo real y STOP/FADE individual, cola compacta con estado, texto de pie contextual, PARAR TODO permanente.
- Bloquear edición, AI, solicitudes remotas y autopiloto de ensayo; preflight accesible sin desviar la cola.
- Permitir selección visual y preparar un cue explícitamente, sin que seleccionar equivalga a preparar y sin doble clic para disparar sonido.
- Indicar backend/browser vs audio nativo/ASIO solo cuando existe de verdad. Ninguna promesa de PFL aislado, redundancia, hardware profesional o integración ChamSys sin prueba.
- La comprobación de capacidad audio, salida, disponibilidad de archivos y ZIP debe indicar errores por cue con `Ir a reparar`.

## 2. Jerarquía de UI y tamaños
**1366×768:** shell superior ≤100px; barra de modo ~40px; paneles desplazables independientes. Preparar/Cues: lista 40–45%, inspector 55–60%; dock de asistente **sustituye o divide inspector** de modo reversible, nunca overlay por encima de GO o lista. Ajustar divisor, recordar ancho por modo.
**1093×614:** dos paneles como máximo; menú/acción contextual; inspector y asistente con pestaña de alternancia o panel lateral desplazable sin ocultar cues y navegación. El diff puede mostrarse como una vista del propio inspector. Cualquier CTA primaria, PARAR TODO y NEXT permanecen visibles.
**≥1920:** tres paneles optativos: lista, inspector/forma de onda y asistente contextual.
**Zoom 200%:** una columna + inspector accesible mediante pestaña explícita; sin solapes ni scroll horizontal obligatorio; no reducir por debajo de 12px la información primaria.
**Interacciones teclado:** focos visibles; no GO cuando el cursor está en chat, texto o inputs; Escape cierra popover/preescucha según contexto sin borrar borradores; Tab razonable; atajos configurables; botones de seguridad distinguibles.

## 3. Fuente de verdad: cue, selección, preparado, ejecución y propuesta
La interfaz es una **vista de estado**, no su propietaria.
- `selectedCueId` (violeta, EDITANDO), `preparedNextCueId` (lima, PRÓXIMO GO), `activeCueInstances` (verde/tiempo + PARAR), `aiProposalIds` (violeta/turquesa PENDIENTE), `voiceCandidate` (detectado; no reproducido), `rehearsalArm` (ARMADO/DESARMADO) son entidades separadas.
- Uso de icono, texto y posición además de color; nunca estados solo por color.
- Una propuesta de IA no equivale a cue. Una toma de sonido no equivale a archivo del show. Un archivo de biblioteca no equivale a pista enlazada.
- Mostrar `Guardado`, `Sin guardar`, `Modificaciones pendientes de IA` y `Cambios manuales` por separado y con políticas de salida claras.

## 4. Editor de cues: superficie de trabajo principal
Izquierda: búsqueda, filtros por escena/tipo/estado, numeración estable, lista densa, columnas configurables (tipo, nombre, Lxx, salida, duración, estado, pie), grupos, cues vacíos/rotos, reordenar protegido y controles de preparar inequívocos.
Centro/derecha: inspector basado en tipo de cue con encabezado persistente `Cue Q014 · Cerradura · L37`; pestañas `General`, `Audio`, `Disparo`, `Acciones`, `Avanzado` **solo donde apliquen**. Forma de onda real en Audio; IN/OUT, fades arrastrables, loops, mezcla por pistas y transporte de audición del cue/pista/cursor. No números en ms como flujo primario; ofrecer timecode y precisión en avanzado.
- Ediciones manuales y propuestas IA deben mostrar los mismos campos. Cuando IA propone modificar gain/fade, se resaltan esos controles con valores actuales y propuestos; no se duplica un formulario distinto.
- `Escuchar` no cambia NEXT ni GO. Mostrar aviso de que usa salida sistema mientras no exista PFL de verdad.
- Doble clic nunca dispara GO; el número/flecha prepara NEXT, nombre selecciona, botón GO en transporte.
- Barra permanente contextual: `Guardar cambios` / `Descartar`; al cambiar de cue si hay borrador ofrece `Guardar`, `Mantener borrador` o `Descartar`; sin pérdidas silenciosas.

## 5. Asistente contextual de edición conversacional (PR #90) — cambio esencial
El asistente se inicia desde `Editar con IA` junto a propiedades del cue o desde una selección explícita en Guion/Sonido; **dock integrado**, no chat flotante fijo de 440px. Abre contexto verificable: `Q014 · Cerradura · L37`, versión del cue, capacidades actuales, idioma ES/EN, si hay una toma vinculada. Puede ocultarse sin desechar el borrador.
- La entrada libre y dictado 10s son **formas de ingresar instrucciones**, no dos asistentes separados. Transcribir ≠ enviar a IA ≠ aplicar.
- Soporte actual verificado: un cue; cambios locales gain/fades/delay/loop, y un request opt-in Muse Spark para otras propiedades validadas. NO fingir edición multi-cue, stop condicional ni generación de sonidos desde el editor si aún no están implementados.
- Salida de IA: `PROPOSICIÓN SIN APLICAR`, lista de propiedades (ANTES → DESPUÉS), validación y fuente LOCAL/MUSE, enlaces al control real, `Ajustar`, `Aplicar estos cambios`, `Descartar`, `Deshacer` (si es seguro). No reproducir ni mutar al proponer.
- Corrección: `Mejor cuatro segundos` actualiza fade sin perder gain previo. La IA no debe borrar otros cambios pendientes; si no puede resolver una referencia ambigua pregunta o devuelve UNSUPPORTED, no inventa campos.
- Estados del ciclo: `DRAFT`, `INTERPRETING`, `PROPOSED`, `CLARIFY`, `UNSUPPORTED`, `CONFLICT`, `APPLIED`, `UNDONE`, `ERROR`.
- **Conflictos:** cambio de proyecto, cue, propiedad manual, fuente de audio o versión durante llamada: conservar respuesta como no aplicable y mostrar `Revisar y volver a generar`. No aplicar contra cue recientemente seleccionado diferente.
- Historial de operaciones y deshacer: PR #90 solo trae deshacer de una aplicación; profesionalización exige operaciones versionadas con límites y comprobación de conflictos, no prometer historial infinito. Atajo Ctrl+Z contextual sin pisar el undo nativo de un textarea.
- Transparencia coste: `Interpretación local / 0 llamadas` o `Consulta remota: necesita autorización` y estado conexión; checkbox de consentimiento independiente del dictado. Nunca llamada implícita tras entrar en pantalla.

### Interacciones de referencia
A. En Q014: “Baja a -9 dB y entrada 3 segundos” → propuesta 2 cambios → “Mejor entrada 4 segundos” → diff persiste gain -9 → APLICAR → editar real + un undo seguro.
B. “Haz lo mismo en Q015–Q018”: UI explica `Edición múltiple todavía no disponible`; nunca edita solamente Q014 fingiendo cumplimiento. Futuro: vista comparativa completa, transacción atómica.
C. “Pon una tormenta de fondo en este cue”: no atribuir a Muse Spark generación SFX. Propone abrir Crear y editar con destino Q014; consentimiento **independiente** de gasto GPU, revisar WAV real y destino.
D. “Cuando diga ‘apagad las luces’ detén la música”: no agregar reglas inventadas; clasificar solicitud como función pendiente de disparos/relaciones, ofrecer edición manual existente solo si verificable.
E. Correcciones repetidas, idioma mixto, sin API, respuesta ambigua o inválida: siempre ruta manual y sin GO.

## 6. Guion → propuesta → cue → sonido → ejecución
**Un objeto seleccionable y un contexto que viaja entre herramientas.** Cada referencia conserva `showId`, `scriptRef`, `Lxx`, `proposalId`, `cueId`, `audioJobId`, `assetId`, `trackId` según existan; no inventar IDs.
1. Guion: seleccionar L37; `Analizar escena` con proveedor/ámbito/consentimiento claros.
2. Propuesta: mostrar acción y evidencia explícita/inferida, `Aceptar`, `Editar`, `Rechazar`, `Crear sonido primero`, `Crear cue sin sonido`.
3. Sonido: generar o importar archivo local, revisar muestras reales, forma de onda, IN/OUT/fades; `Usar este sonido…` en el mismo panel.
4. Destinos: `Solo biblioteca`, `Crear cue y añadir pista`, `Añadir a Q014`, `Sustituir pista X en Q014`. Confirmación solo para cambio destructivo o coste real; si falla asignar, conservar archivo seguro para reintento.
5. Editor de cues: muestra Lxx, pista, archivo y PREPARADO solo tras validación; selección no altera NEXT.
6. Ensayo/Directo: manual GO o ensayar con voz opt-in, sin que un error remoto bloquee GO manual.

Fuera de alcance actual: generación que retorna múltiples tomas ficticias, importación automática, PFL de auriculares sin motor específico, proyecto persistente remoto/cloud, sincronización multiusuario.

## 7. Sonido: una herramienta con dos entradas, mismo resultado
- **Biblioteca**: selección múltiple, archivos ZIP/RAR/7z admitidos y límites seguros, búsqueda, etiquetas, estado cargado/perdido, duración, preescucha, `Ver onda`, `Usar en cue…`.
- **Crear y editar**: prompt opcional desde guion/cue o independiente, fuente, duración admitida (piloto SFX 1–12 s), coste máximo sólo cuando verificable, consentimiento explícito, estado de trabajo honesto, resultado WAV verificable, escucha, recorte y fade, destino inline.
- Se conserva generación de un sonido sin guion ni cue obligatorio cuando el backend lo permita; jamás se inventa `L1`.
- Los ajustes avanzados de seed/modelo/request/log/códec son plegables. No duplicar `Aprobar` en varias etapas sin explicar qué se aprueba.

## 8. Ensayo y voz
- **Manual:** cola y guion, ningún micrófono ni servicio remoto automático.
- **Asistido por voz:** sugerencia de cue visible y acciones `Preparar sugerido`, `Ignorar`; GO sigue manual.
- **Autopiloto:** estado DESARMADO visible, consentimiento de streaming y `ARMAR GO AUTOMÁTICO` separado con advertencia. Solo pies finales inequívocos y proyecto vigente pueden solicitar GO por un guard central. STOP ALL, salir de Ensayo, ocultar, parar micro y cambiar show desarman.
- Línea superior de lectura humana: `Última frase reconocida`, `Pie coincidente`, `Resultado: ejecutado / ignorado / pendiente de armar` + retraso medido cuando disponible. Ningún porcentaje inventado.
- Diagnóstico de micro y simulación fuera del flujo principal; botón `Configurar seguimiento`.
- Modo de voz en Ensayo no debe entrar en Directo sin acción humana explícita y verificación de política.

## 9. Estados de operación y seguridad
- Colores semánticos coherentes con Stagecraft: violeta **seleccionado/propuesta**, lima **NEXT preparado**, cyan **fuente de audio/preescucha**, verde con PLAY **sonando**, ámbar **espera/advertencia**, rojo **STOP/errores**. Nunca solo color; usar iconos y etiquetas.
- `PARAR TODO` global siempre visible, con alcance preciso al motor actual; `Detener cue` y `Fundido` por instancia activa.
- `Show mode` bloquea edición y entrada de IA; preflight antes de entrar con errores bloqueantes y no bloqueantes vinculados a la reparación, pero permite emergencia.
- Previsualizar escucha sólo cuando salida segura, evitar auto-activar audio al entrar y separar rutas de audición de GO.

## 10. Proyecto, ayuda y robustez
- Inicio: crear, abrir archivo show ZIP completo, abrir JSON con advertencia de media no incluido, recuperar fuentes, cargar demo español completo; recientes solo cuando hay persistencia real.
- Guardado/autoguardado: jamás indicar `Guardado` si solo hay estado en memoria del navegador; mostrar destino, cambios sin guardar, ZIP autosuficiente y verificación de assets.
- Preferencias: general, idioma, tema y densidad, audio/salidas (solo conectables), teclado, modelos/credenciales (estado, nunca clave en UI pública), importación y diagnóstico.
- Contextual help con glosario `Cue / NEXT / GO / Fade / Pie`; scripts de prueba ES/EN sin llamadas obligatorias.
- Modo básico/expertos: **misma app y rutas**, densidad, campos avanzados y atajos progresivos. No dos motores ni dos modelos de show.

## 11. Pruebas de aceptación P0 para Codex: automatizables y observables
A. Navegación: PREPARAR→Guion→Propuesta→Cue→Sonido→Volver conserva contexto y Lxx; no GO; en ES y EN.
B. Barra global: proyecto activo, unsaved, fuente audio y STOP ALL real accesibles a 1366×768, 1093×614, 200% zoom.
C. Cues: seleccionar vs preparar vs escuchar vs ejecutar son operaciones diferentes, con colores/etiquetas diferentes.
D. Conversación: instrucción local → diff y campo real resaltado → corrección con pending previo → Apply → Undo seguro; 0 GO, 0 solicitudes pagadas.
E. Conflicto: cambia cue/proyecto mientras responde Muse → no Apply; conservar instrucción, explicación.
F. Dictado: escuchar 10s→transcribir por consentimiento→revisar texto→proponer distinto de transcribir→aplicar distinto de proponer.
G. Sonido: importación por lote y comprimidos, selección de archivo, editor de onda y retorno a cue, sin cambio de NEXT.
H. Generación simulada: coste/consentimiento explícitos; job UNKNOWN no reintento; un WAV = una toma; rechazar deja show intacto.
I. Ensayo Manual/Asistido/Autopiloto: mic OFF e invisible = no GO; arma explícitamente; pie detectado vs ejecutado diferentes.
J. Autopiloto: prueba ES/EN de repetir, retroceder, saltar sin ejecutar intermedios, STOP ALL desarma, cambia show desarma.
K. Directo: ningún diálogo de IA/mic/conversación puede ejecutar ni obstaculizar GO; NEXT y activos visibles.
L. Fallos de red, modelo y audición preservan playback manual y no pierden borrador de cambios.
M. Auditoría de accesibilidad: tab/foco, contraste, 200%, textos en estados, aria, lectores; evitar overlays que ocultan transporte.
N. Registro de sesión para QA: cueId, version, action, result, duration, warnings, provider *sin secretos/transcripciones personales*, formato exportable; comparar gold contra ejecuciones; no automatizar valoraciones subjetivas sin revisión.
O. Ensayos humanos: operadores novatos y especializados completan 8 tareas sin instrucción previa; medir errores críticos, intentos, tiempo de tarea y preguntas. Objetivos propuestos, no resultados medidos.

## 12. Plan de integración con ramas reales (NO hacer merge automático)
**Paso 0 — integración de ramas:** elegir base compatible y resolver PR #90 (conversación), #88 (voz), #89 (sonido), PR #89 ya supera CI #627 tras adaptar el smoke de Sound Lab a la nueva navegación; falta verificar la integración cruzada con #90 y #88 antes de introducir V6. Conservar PR separados y verificar CI en branch integrador.
**P0 — base profesional antes del 4/11:** nuevo shell 3 modos, separación real editor/ensayo/show, estado coherente, assistant dock contextual, sonido en una navegación, rutas de ida/vuelta, CSS responsive y harness de regresión. Conservar todas las funcionalidades ya verificadas.
**P1 — experiencia de producción:** diff anclado en campo y forma de onda, historial transaccional/undo, proyectos recientes reales, warnings con reparación, enfoque multi-cue solo tras soporte y pruebas.
**P2 — hardware / nivel industria:** audio nativo WASAPI/ASIO, salidas físicas y PFL independiente, redundancia, timecode, vídeo/luces, sincronización. Mostrar estos como futura capacidad, nunca afirmar que existen sin verificarlos.

## 13. Decisiones de nombre
Principales: `Preparar / Prepare`, `Ensayar / Rehearse`, `Directo / Show`.
Dentro de Preparar: `Guion / Script`, `Cues / Cues`, `Sonido / Sound`.
Dentro de Guion: `Texto / Script`, `Propuestas IA / AI Suggestions`.
Dentro de Cues: `Editor / Editor`, `Editar con IA / Edit with AI` como dock contextual.
Dentro de Sonido: `Biblioteca / Library`, `Crear y editar / Create & Edit`.
Dentro de Ensayar: `Manual / Manual`, `Asistido / Assisted`, `Autopiloto / Autopilot`, y drawer `Seguimiento por voz / Voice Follow`.
`Comprobación / Preflight` es herramienta global, no pestaña obligatoria.

## 14. Investigación de referencia — principios, no clones
- QLab 5 Workspace / Inspector / Show mode / Active Cues: https://qlab.app/docs/v5/fundamentals/workspace/ y https://qlab.app/docs/v5/fundamentals/inspector/
- QLab Workspace Status / warnings reparables: https://qlab.app/docs/v5/tools/workspace-status-window/
- Nielsen Norman Group Progressive Disclosure / Complex Application Design: https://www.nngroup.com/articles/progressive-disclosure/ y https://www.nngroup.com/articles/complex-application-design/
- Microsoft HAX, corrección, descarte y controles humanos: https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/
**Obligatorio:** ningún mockup cuenta como función desarrollada; cada cambio real debe enlazar con el backend que lo cumple, sus tests y un estado verificable.