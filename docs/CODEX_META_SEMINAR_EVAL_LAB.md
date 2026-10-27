# RunQ — banco de pruebas del taller Meta para Codex
**27 oct 2026 · Hackathon · ciclo evaluable, no autoentrenamiento**

## 1. Proveniencia y diseño

Tomamos de «Agents 101: Build a Multimodal AI Agent Pt. 1» (Meta / Ivan Porollo / Suraj Subramanian) y el ejemplo de agente de trabajo presentado como inspiración de ingeniería **un agente que separa plan, herramienta/acción, observación y verificación**, con contexto explícito y una decisión humana de cierre. No atribuir a la sesión cifras, precisión teatral, comportamiento de Muse Code ni algoritmos que el material aportado no demuestra.

**Nuestra adaptación propia a RunQ**:
1. Preparar una ventana de guion original, con personajes, acotaciones, roles y referencias exactas \`L#\`.
2. Pedir **JSON Schema estricto** a Muse Spark; validar \`finish_reason=stop\`, esquema, evidencias literales, referencias y activos.
3. Comprobar de manera **independiente** si se ignoraron directrices explícitas de SOUND/SONIDO/SFX/MÚSICA. El verificador de producción es heurístico y puede pasar por alto direcciones implícitas.
4. Separar PLAY ejecutable solo después de aprobación humana de STOP, CONTINUE y SILENCE, que son observaciones que requieren destino de sonido antes de convertirlas en órdenes.
5. Comparar con un corpus gold original, marcando la creatividad opcional como revisión humana, y entregar errores reproducibles a Codex. CI **no consume tokens**. La evaluación real de Muse es deliberadamente opt-in y **no entra en CI**.

Fuentes actuales: [precios Standard](https://dev.meta.ai/docs/pricing-rate-limits), [JSON Schema](https://dev.meta.ai/docs/structured-output), [recetas de agente GitHub](https://dev.meta.ai/docs/cookbook/github-agent). La receta GitHub agent es una fuente complementaria, no una afirmación de que todas sus funciones se mostraron en el seminario.

## 2. Corpus nuevo

\`fixtures/qa/seminar/corpus-v1.json\` define **nueve guiones originales** y metadatos, con **49 eventos exactos esperados y 43 líneas negativas para PLAY**. Abarca:
- \`delta-signal\`: sonido de base, sonar, grabación de voz, alarma, fundidos y continuidad entre escenas.
- \`hotel-door\`: nombres de personaje en líneas separadas, timbre reproducido, golpes realizados por actores frente a archivos.
- \`gala-rundown\`: escaleta, SONIDO/LX/VÍDEO, stings, cuñas y STOP.
- \`tide-dance\`: danza, cues GO frente a PREPARE, textura grabada frente a movimiento real.
- \`one-more-song\`: libreto musical, instrumentos/canto en directo frente a grabaciones.
- \`duo-multilingual\`: diálogo francés/español, static radio, silencio, falsas menciones.
- \`adversarial-prompt\`: instrucción maliciosa pronunciada por personaje; nunca obedecerla.
- \`conference-keynote\`: hoja de cues empresarial, GO AUDIO/VIDEO/LX, HOLD y STOP.
- \`umbra-long\`: escenas y ventanas >60 líneas, continuidad sonora a través del límite de extracción.

Los datos son íntegramente originales: se pueden distribuir en el repositorio. El gold es **provisional** y necesita supervisión de un regidor/diseñador sonoro antes de usarlo como referencia profesional. Ni una prueba offline aprobada ni una puntuación de estos guiones es garantía de comportamiento en directo.

## 3. Pruebas gratuitas en cada PR

\`\`\`powershell
npm run qa:codex
npm run qa:seminar
\`\`\`

\`qa:codex\` agrupa: sintaxis, pruebas unitarias e integración, ejemplos negativos del evaluador ya existente, banco de guiones nuevos y resumen para Codex. GitHub Actions adjunta resultados sintéticos y \`artifacts/seminar-qa/contract.{json,md}\`.

Los tests:
- Comprueban literalmente TODOS los \`L#\` esperados y prohíben referencias fantasma.
- Reconstruyen el reparto en ventanas con \`prepareTheatricalCueAnalysis\`: una sola ventana por llamada, texto original sin mutar, JSON estricto, ocho elementos máximo, \`reasoning_effort: low\`, \`store: false\`, sin GO.
- Simulan mensajes truncados, errores de salida, selección de música en directo, clasificación STOP/CONTINUE y el rechazo de instrucciones maliciosas del propio guion.
- Verifican en mocks el límite de gasto y que jamás haya reintentos en cadena.
- Separan el conjunto de casos y los errores del modelo de calidad creativa profesional.

**Si los eventos obligatorios de una ventana superan el límite de ocho elementos**, se marca saturación: el modelo no puede recuperar todos en una sola respuesta. Es una limitación de diseño del esquema, no del modelo.

## 4. Runner real con presupuesto

Por defecto NO hace llamadas. Primera comprobación:

\`\`\`powershell
npm run qa:meta:plan
\`\`\`

Usa \`MODEL_API_KEY\` solo en tu entorno local (nunca la pegues en chats, archivos JSON o Git). Para ejecutar una tanda real, el usuario ha autorizado hasta ~2 USD:

\`\`\`powershell
npm run qa:meta:live
\`\`\`

También se puede iniciar con límites menores, siempre opt-in:

\`\`\`powershell
node tools/run-meta-seminar-eval.mjs --live --ack-paid --budget-usd 0.50 --max-requests 5 --mode literal --case hotel-door
\`\`\`

**Medidas de seguridad:** no hay llamada al iniciar el servidor, en CI ni en el dry run. \`--live\` y \`--ack-paid\` deben estar presentes. **No se reintenta** tras error, timeout, respuesta truncada o JSON inválido. El runner reserva antes de cada solicitud el coste conservador calculado a partir del tamaño de la petición y del máximo de 8192 tokens de salida.

**Límite acumulado local:** el archivo ignorado por Git \`.runq-local/meta-eval-budget.json\` guarda reservas previas y un \`.lock\` exclusivo impide dos tandas simultáneas. Así **un segundo lanzamiento no repone los 2 USD**. Las reservas de respuestas fallidas también se conservan. El archivo **no registra llamadas realizadas antes de instalar este laboratorio**, como las anteriores pruebas manuales del usuario. No lo borres para "resetear" el presupuesto sin consultar antes el consumo real. Si queda un .lock tras un cierre forzado, asegúrate de que no hay otro proceso activo antes de gestionarlo.

**Limitación financiera:** esto es un techo de gasto **estimado por software local y solo para las solicitudes de este runner**; no es un límite de facturación impuesto por Meta. Las tarifas, tarifas adicionales, el uso del panel, y otras llamadas con la misma clave podrían sumar costes. Comprueba siempre el panel de facturación de Meta. Se usa \`muse-spark-1.3\` **Standard**, no Contributor: la documentación de Meta explica que Contributor autoriza uso del contenido para entrenar modelos; no activarlo por ahorro sin consentimiento.

Salida (nunca publicar informes de guiones privados): \`artifacts/seminar-live/report.md\`, \`report.json\`. Solo hay metadatos sanitizados, tipos de evento y líneas; no se almacenan respuestas completas, credenciales ni cuerpos HTTP. Se evalúan **únicamente los casos completados enteros** y una interrupción no se interpreta como resultado de precisión 0%.

## 5. Métricas antes de cambiar prompts

**Bloqueantes:** salida JSON completa y validada, 0 L# inventadas después de validación, 0 órdenes GO por el modelo, 0 PLAY sin aprobación del operador, protección de clave y STOP ALL operativo.

**Calidad del modelo:** precisión y recall de eventos \`EXPLICIT\`, falsos PLAY en menciones dialogadas, omisiones de STOP/CONTINUE, errores de departamento LX/VIDEO, continuidad entre ventanas, coste por propuesta, latencia y \`finish_reason\`. Un \`SUGGESTED\` lícito exige una valoración artística humana; no optimizar para maximizar el número de cues.

**A/B justo:** mantener el mismo corpus y el mismo gold y cambiar una sola opción entre rondas, por ejemplo \`--mode literal\` frente a \`--mode balanced\`. Cada ronda consume nuevas reservas del acumulado. No comparar 0,5 USD de datos parciales con 2 USD de datos completos como si fuesen la misma muestra.

## 6. Contrato de trabajo para Codex (VS Code)

> Lee \`AGENTS.md\`, \`docs/CODEX_AUTOMATED_TEST_PLAN_2026-10-27.md\` y **este archivo**. Ejecuta \`npm run qa:codex\` y revisa \`artifacts/seminar-qa/contract.md\`. Antes de intervenir, anota rama y SHA, y asegúrate de no editar otra copia local. No lances \`qa:meta:live\` ni accedas a \`MODEL_API_KEY\` por tu cuenta. Si el usuario te entrega el informe privado de un ensayo real, contrasta \`finish_reason\`, tokens, omisiones, tipos de evento y falsos PLAY contra el corpus provisional. Prioriza un solo fallo técnico, escribe primero un test que lo reproduzca, corrige una sola variable y repite todas las pruebas offline. Reporta precisión/recall solo si el ensayo real está completo y el gold revisado, y no atribuyas las cifras sintéticas a Muse. No modifiques ejecución en directo, no actives GO automático y no fusiones ramas sin revisión.

## 7. Decisiones posteriores

P0: si Muse devuelve \`length\`, diagnosticar \`completionTokens\` y \`reasoningTokens\` y **no** aceptar JSON parcial ni reintentar automáticamente.

P1: si el verificador encuentra una acotación omitida, elevar la observación a revisión humana. Nunca dejar que la heurística "rellene" a ciegas un PLAY.

P1: continuidad y STOP por identificador de pista/cue a través de ventanas; hoy la observación STOP **no enlaza automáticamente** con un cue activo.

P2: revisión humana de cues opcionales, ensayo con audio real en Windows, y métricas de aceptación/edición de propuestas.

**Estos cambios no entrenan los pesos de Meta.** Afinan el pipeline de análisis, la validación y los prompts mediante evaluaciones reproducibles, aplicando principios de separación de funciones y verificación independiente del taller.
