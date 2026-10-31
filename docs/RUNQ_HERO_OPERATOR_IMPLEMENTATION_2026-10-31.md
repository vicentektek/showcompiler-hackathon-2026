# RUNQ · Hero Operator — creación completa de cue por voz
**Fecha:** 31 octubre 2026  
**Estado:** intérprete offline y 9 tests unitarios preparados; **integración RUNQ, ASR real, UX y export/import aún pendientes**.  
**Rama de entrega:** docs/runq-hero-operator-handoff-2026-10-31 (desde integration/runq-demo-2026-10-30). Esta rama NO es la candidata final ni debe mezclarse automáticamente con las ramas visuales.

## Visión de producto, problema y motivo de esta implementación

**RUNQ es una estación de preparación y operación de espectáculos en directo, enfocada inicialmente en teatro, galas y ensayos.** Convierte un guion en una secuencia de señales (cues) reproducibles y controlables. Integra herramientas profesionales de biblioteca y edición de audio, referencias verificables al texto original, propuestas asistidas por IA, ensayos con reconocimiento de pies y transporte manual para el operador.

**Problema real:** el técnico de sonido suele leer el guion, identificar acotaciones, localizar archivos, construir cues, asociar pies y ajustar su orden/propiedades manualmente. Durante un ensayo los actores repiten, retroceden, saltan escenas o cambian los pies, lo que obliga al operador a localizar y reconfigurar señales continuamente. El producto debe reducir operaciones repetitivas **sin quitar al técnico la decisión final sobre reproducción y seguridad**.

**Por qué implementamos Hero Operator ahora:** necesitamos una demostración del Meta Global AI Developer Hackathon 2026 que haga visible una mejora tangible del flujo real, no una sucesión de botones ni una colección de funciones inacabadas. Crear en una sola orden hablada un cue con **posición, nombre, sonido existente y pie original de guion** es una prueba más expresiva de utilidad operativa que cambiar solamente un fade. Permite mostrar creación contextual, comprensión de la petición, resolución de recursos, trazabilidad, revisión y ejecución posterior en el espectáculo. Es, además, una capacidad reutilizable para otros proyectos, no un truco exclusivo de The Last GO.

### Narrativa que queremos enseñar al jurado (objetivo del vídeo ~3 minutos; duración por verificar)
1. **Entender:** importar The Last GO desde TXT, mantener las 31 líneas L#, realizar y revisar **una sugerencia auténtica de Meta Muse Spark** sobre acotaciones y sonido (según presupuesto/permiso).
2. **Construir:** reproducir/importar WAV reales y editar cues; el operador dicta la orden Hero y RUNQ transcribe mediante **Muse Voice real** (autorizado). **Un parser local determinista**, no Muse Spark, interpreta esta frase concreta; mostrar la propuesta, revisar cambios, aceptar o descartar.
3. **Ensayar:** en la copia adecuada, un personaje pronuncia el pie y el Autopiloto preparado ejecuta el cue correcto; mostrar también salto de escena sin cues intermedios si está verificado. Mantener el show base de tres cues intacto para la demostración principal del Autopiloto.
4. **Operar:** mostrar NEXT / GO / STOP ALL realmente funcionando. Si existen y pasan pruebas, incluir órdenes explícitas por voz de operador como "Arm Auto GO", "GO" y "STOP ALL" desde el modo autorizado; si no, mostrar sus controles manuales sin fingir voz.
5. **Confiar:** demostrar que toda sugerencia de edición es revisable, los cambios son reversibles, la salida de audio no contamina el micrófono y un cue no se dispara por el simple hecho de crearlo.

**Éxito real:** una persona que nunca ha utilizado RUNQ debe entender qué problema elimina, qué trabajo hace la IA, qué hace el intérprete local, por qué el operador continúa al mando y cómo verificar visual y auditivamente el resultado. No optimizar únicamente para capturas: el flujo debe funcionar también en un show nuevo y tras exportar/importar.

### Criterios que deben dirigir las decisiones de Copilot
- Priorizar **funcionamiento completo y demostrable de The Last GO** frente a ampliar alcance o añadir proveedores, nuevas pestañas y rediseños.
- Separar lógica estable de cues/agente y presentación UI: necesitamos poder modernizar el aspecto sin rehacer el motor.
- Mantener distinción entre **voz del operador (órdenes explícitas)**, **voz del actor (pies de guion)** y **audio de salida del show**; cada uno tiene reglas y permisos diferentes.
- Evitar confundir IA generativa con reglas locales: **Meta Muse Spark** propone a partir del guion; **Muse Voice** transcribe voz; **HeroCue** transforma una transcripción validada mediante reglas deterministas; el motor de RUNQ valida, almacena y reproduce bajo control autorizado.
- Una demo con datos preparados solo se etiqueta como preparada. No falsificar inferencias, ASR, latencias, comandos hablados ni disparos GO. Conservar evidencias reproducibles y distinguir pruebas offline de pruebas reales.
- **No rehacer el Autopiloto que funciona**, no alterar contratos del motor audio ni arriesgar la build candidata por intentar dar una imagen más espectacular.
- Limitar el cambio a esta capacidad transversal; completar sus tests, QA y accesibilidad básica antes de añadir nuevas órdenes complejas.

## Alcance de la demo
Orden inglesa exacta de Arian:
> Insert a cue before cue three. Name it Decision Tension. Use the selected sound. Set the voice trigger to line twenty.

En una **COPIA** de The Last GO de 3 cues, con un WAV importado y seleccionado previamente, la operación propone:
- Q03 nuevo: **Decision Tension**, DRAFT, origin=MANUAL.
- Antiguo Q03 pasa a Q04 con su ID, audio y trigger intactos.
- Audio: el assetId del WAV READY seleccionado explícitamente en Studio; no adivinar audio.
- Pie: **L20**, Ella: *And what happens if we skip straight to the decision?* (texto literal original).
- Preview legible **antes** de Apply. Se permite Discard y Undo exacto. La orden de **creación/edición** no dispara GO ni arma el Autopiloto como efecto colateral. Los **comandos de transporte por voz explícitos** son un flujo distinto y sí podrán ejecutar funciones operativas tras una autorización específica.

**La muestra usa Muse Voice para transcripción autorizada y parser local determinista para interpretar. NO atribuir el parser a Muse Spark.** La muestra de análisis de guion con Muse Spark se graba como toma separada y auténtica.

## Contrato de operación estable
Nueva operación estrictamente validada: CREATE_CONFIGURED_CUE con exactamente estos campos:

    {
      "op": "CREATE_CONFIGURED_CUE",
      "afterCueId": "<ID del cue 2>",
      "label": "Decision Tension",
      "assetId": "<ID de WAV READY seleccionado>",
      "sourceLineId": "L20",
      "trigger": "And what happens if we skip straight to the decision?"
    }

afterCueId es ID persistente, nunca número visual. El insertManualCue actual usa null para APPEND, por eso antes del primer cue se rechaza en la versión inicial. Es una operación atómica que nunca deja un cue parcial sin audio si una validación falla.

## Separación para permitir rediseños de la interfaz
- CORE src/core/heroCue.mjs: puro, offline, sin DOM, audio, transporte ni inferencia; devuelve PLAN o CLARIFY. validateHeroCueOperation es fail-closed si no hay callback de disponibilidad real.
- AGENT src/core/agentCore.mjs: extender allowlist + transacción prepare/commit/undo. Resolver origen, WAV y línea EN PREVIEW y revalidar EN COMMIT contra estado actual; si show cambió, descartar plan obsoleto. Conservar API de operaciones antiguas.
- CONTROLLER/UI: convertir audio del micrófono en texto editable; seleccionar un solo WAV READY del show actual; pasar la orden al parser local; renderizar diff y aprobar/rechazar. El cambio visual futuro toca esta capa, no el contrato de operación.
- REHEARSAL/STAGE: preservar la lógica de Autopiloto, GO, STOP ALL, clock y audio. El motor ya existente seguirá siendo la única autoridad para ejecutar transporte. Una futura capa de comandos de voz del operador puede invocar ese transporte a través de los mismos guardas, nunca mediante modificaciones directas del show o respuestas libres del modelo.

## Cambios de integración esperados para Copilot
1. Inspeccionar primero AGENTS.md, ramas, worktrees, status y commits; localizar candidata más reciente, proteger cambios locales/untracked; crear otro worktree de implementación. NO usar main por defecto ni fusionar PRs en bloque.
2. Integrar src/core/heroCue.mjs y test/heroCue.test.mjs si no están; **en esta rama Hero** también se ha incorporado `fixtures/demo/runq-the-last-go-en.txt` desde la rama de vídeo, junto a `tools/video/build-the-last-go.mjs` y `tools/video/prepare-natural-voice-takes.py`. El fixture NO estaba en la rama de integración original, por lo que se debe copiar expresamente al worktree de implementación y verificar los tests.
3. En agentCore.validateAgentOperations admitir CREATE_CONFIGURED_CUE con forma estricta. En prepareAgentPlan y commitAgentPlan aceptar contexto de disponibilidad/assetReady. Crear mediante insertManualCue, después transformar solo el nuevo cue a PLAY+assetId+sourceLineIds L20+trigger como una **única transacción** en una copia normalizada. El undo debe conservar snapshot exacto. El diff de cue CREATED actual solo muestra label/number: ampliarlo a audio, trigger, sourceLineIds y renumeraciones para que el operador pueda revisar todo.
4. Conectar interpretHeroCueCommand antes del intérprete de comandos genérico en el agente local. Si devuelve CLARIFY no iniciar proveedor ni modificar; si devuelve PLAN validarlo, preparar preview y pedir aprobación.
5. UI del agente en Studio: dropdown solo de WAV READY, invalidación ante cambio de show/asset, campo dictado editable; Record/Stop/Transcribe reutilizando patrón de src/ui/cue-conversation-ui.mjs y POST /api/voice/transcribe con consentimiento individual y lenguaje EN. Nunca transcribir automáticamente al montar UI ni auto-submit/auto-apply desde una orden de edición; **NO** convertir accidentalmente ese dictado en GO/ARM. Los comandos expresos de transporte de operador se consideran en su propio flujo (véase siguiente sección). Gestionar exclusividad del micrófono con voz de ensayos.
6. Mantener modo teclado totalmente funcional para pruebas sin coste; la respuesta Meta en tools/agentRoutes.mjs hoy solo admite CREATE_CUE sin sonido/trigger: NO fingir que genera esta operación ni ampliar esa ruta por obligación. La versión inicial usa intérprete local explícito.
7. Export/import ZIP de la COPIA de show de 4 cues, validar 3 WAV reales, cue nuevo y pie L20. Conservar base de 3 cues para test del Autopiloto.
8. Tests, smoke Chrome Windows, seguridad, Undo y documentación; crear PR DRAFT a la verdadera rama de integración; no auto-merge.

## Criterios de aceptación H01-H12
- **H01/H02:** preview correcto Q03/Q04, nombre, asset, L20, trigger, sin GO; Apply solo tras confirmación.
- **H03/H04:** Discard sin mutación; Undo restaura todo el show.
- **H05:** audio ausente/no READY/selección ambigua aborta.
- **H06:** referencia destino inexistente, antes de Q01, Lxx no diálogo o inexistente aborta.
- **H07:** trigger duplicado o fabricado aborta.
- **H08:** edición bloqueada si Rehearsal/Operation, AUTO GO armado, GO/pending, audio/preview activo, inspector dirty, importación en curso.
- **H09:** cambio de show, audio o estado durante preview invalida Apply.
- **H10:** roundtrip ZIP con WAV reales conserva estructura y L20.
- **H11:** voz Arian real -> Muse Voice EN autorizado -> texto editable -> PLAN -> Apply; latencia y transcripción reportadas únicamente si se miden.
- **H12:** show original 3 cues intacto; las pruebas de Autopiloto y STOP ALL siguen pasando.

## Recursos originales y cómo usarlos

**Inventario detallado de materiales, estado por rama y archivos que todavía hay que descargar:** `docs/RUNQ_THE_LAST_GO_ASSET_INVENTORY_2026-10-31.md`. No afirmar que el show ZIP EN o los WAV de voces están en el repositorio solo por tener un constructor y enlaces a Descript.
- Audio Arian Hero (~8,4 s) Descript: https://web.descript.com/64447897-f516-4c76-8464-7275c97e8f2f/4fd1c
- Publicación de audio con acceso privado: https://share.descript.com/view/LzKKWM9L27v
- Audio original de Arian para fade (fallback): https://web.descript.com/4d0882c0-5aa0-4903-a6fc-330ab8691679
- Actor James/Maya/Ella: https://web.descript.com/f1e6a0c1-d10a-4b30-86cb-c5f2915ce530
- Narrador Benedict: https://web.descript.com/c9b27c2d-b505-40b1-a327-b1f8b6df9d5d
- Kit de vídeo, constructor ZIP EN y tomas de voces: rama docs/runq-video-production-kit-2026-10-29, especialmente docs/video/demo-pack/README.md y tools/video/build-the-last-go.mjs.
- Los ZIP/WAV anteriores existen en la Biblioteca personal, pero no se ha podido materializar su contenido directamente desde la Biblioteca en esta sesión. No subir binarios de voz, claves ni logs privados al repositorio.

## Puertas de calidad
Comprobar en el worktree de implementación: node --test test/heroCue.test.mjs; npm run check:syntax; npm test; browser E2E y aceptación manual real con voz inglesa WAV en Windows. Pruebas automatizadas offline nunca llaman API pagada. El código aquí subido NO significa que la función esté integrada; actualmente solo demuestra el parser/validador.

La locución nueva fue creada por Agent Underlord en Descript; antes de grabar revisar por oído pronunciación y pausas. Las peticiones reales a Muse Voice requieren consentimiento y política de coste válida en RUNQ.


## Control por voz del operador: diseño compatible y futura escena demostrativa

**Aclaración de alcance:** prohibir GO y ARM como *consecuencia de crear/editar un cue* no significa prohibirlos como **órdenes expresas de operador**. RUNQ debe poder mostrar ambos tipos de interacción en el vídeo, en tomas diferenciadas. Este PR implementa primero CREATE_CONFIGURED_CUE; no declarar que el transporte por voz ya está disponible sin probar la versión real.

- **Modo Edición/Agente (Studio):** "Insert a cue..." → transcripción → PLAN → vista previa → Apply. Ninguna frase de creación inicia transporte ni cambia el estado ARM.
- **Modo Ensayo / control por voz de operador (habilitado explícitamente):** "Arm Auto GO" → solicitud de confirmación del operador en UI → ARM solo si guardas y permisos lo permiten; "GO" → el mismo transporte y las mismas comprobaciones que el botón manual para el cue preparado; "STOP ALL" → parada de emergencia prioritaria cuando el canal de órdenes de operador está autorizado.
- **Pies de actor:** las frases L6/L14/L23 (y L20 en la COPIA) se procesan por el motor de Autopiloto solo si este está armado. Las órdenes del operador no deben interpretarse como pies de actor y viceversa.
- **Seguridad:** elegir fuente/canal de operador o push-to-talk en lugar de escuchar cualquier voz; idioma explícito; reconocimiento final y antirrepetición; no activar GO por palabras dentro del guion, transcripción parcial, retorno de audio RUNQ, narrador ni voz del director. No iniciar GO en Studio, por indicación no autorizada de un modelo ni por acciones automáticas del controlador de captura.
- **Excepción STOP ALL:** ante una orden de emergencia explícita de un canal de operador autorizado, permitir detención inmediata sin una confirmación que la retrase. Mantener botón STOP ALL físico/visual en todo caso.
- **Control de alcance:** si la candidata actual carece de comandos de transporte por voz, documentar los huecos y realizar su implementación en una tarea/PR separada y acotada, después de aprobar la creación de cue, sin alterar Autopiloto ni motor audio.

### Escenas adicionales de vídeo que quisiéramos grabar
1. Dictado **create** y Apply visible, sin GO accidental.
2. En Ensayo: orden explícita **"Arm Auto GO"** con confirmación, estado ARMED observable; actor dice pie válido, cue se lanza realmente.
3. Toma separada en modo operador: orden **"GO"** en canal autorizado y cue NEXT reproducido; orden **"STOP ALL"** con sonido real deteniéndose. Solo si se valida E2E; de lo contrario se muestra GO/STOP ALL manual, sin afirmar soporte hablado.

### Criterios de aceptación futuros VT01–VT05
- VT01: "Insert a cue..." no cambia ARM ni transport y nunca dispara GO.
- VT02: "Arm Auto GO" exige modo adecuado, sesión habilitada y confirmación; desarmado por seguridad al salir o cerrar show.
- VT03: "GO" solo desde canal de control autorizado, en estado compatible, una ejecución por orden final, sin duplicados ni disparos de frases semejantes.
- VT04: "STOP ALL" desde canal de operador habilitado interrumpe inmediatamente; el botón manual siempre funciona incluso si el reconocedor falla.
- VT05: no contaminación cruzada entre voces de actores, narrador, operador y salida de audio de RUNQ; reproducibilidad medida en Windows/OBS antes de grabación oficial.

Las grabaciones de comandos del operador pueden producirse como WAV independientes con Arian, pero los WAV no prueban que el motor de reconocimiento y transporte esté integrado hasta superar una sesión real de captura.
