# RUNQ — Campaña larga de IA, usabilidad y mejora continua (1 nov 2026)

**Rama:** `feat/runq-long-campaign-2026-11-01` (worktree aislado; el checkout
original `feat/runq-ai-campaign-100-2026-10-31` @ `5fdb4d1` no se tocó).  
**Referencia fija de comparación:** `929c475`.  
**SHA de código medido al cierre:** `e3bdda6`.  
**Estado:** borrador para revisión humana. Sin merge, sin cambios en `main`,
sin release. Ninguna prueba aquí certifica uso profesional en directo.

**Revisión de evidencia:** las secciones 1–9 conservan la medición histórica.
La sección 10 contrasta sus registros, corrige un error de recuento y añade
Web Audio nativo con grabaciones verificables. La campaña no está validada
artísticamente ni mediante escucha humana.

## 1. Qué es real y qué es simulado

| Evidencia | Real | Simulado / no medido |
|---|---|---|
| Interfaz RUNQ | Chrome real, UI real, estado real leído del DOM y de la API interna | — |
| Meta Muse | Piloto F7: 5 solicitudes HTTP reales, contabilizadas en el ledger | Todas las suites offline y recorridos usan un Muse determinista simulado |
| Modal SFX | — (no se generó audio real en esta campaña) | Recorridos con generador simulado |
| Web Audio | Estado de transporte de la app (GO, STOP individual, STOP ALL) comprobado en cada recorrido | Salida de audio simulada en los recorridos; el audio no se escuchó; sin medida audible ni de dispositivos |
| Voz / micrófono | — | Desactivado (techo 0) |
| Baseten / Fireworks | Excluidos: 0 solicitudes, 0 pruebas de conexión, claves eliminadas del entorno de los runners | — |

Los recuentos altos de pruebas offline miden **regresiones y coherencia de
estados**, no la calidad artística ni la precisión semántica de Muse.

## 2. Método

1. **Diagnóstico y línea base** (`929c475`): inventario de módulos, suites y
   fallos; la línea base no cambió durante las comparaciones.
2. **Runner reanudable** `tools/runq-campaign.mjs` con estado y checkpoints en
   `artifacts/long-campaign/<id>/` (ignorado por git):
   `plan|offline|browser|all|resume|status|report|compare|live`.
   Reanudar: `node tools/runq-campaign.mjs resume --id <id> [--retry-failed]`.
3. **Operadores virtuales** `tools/runq-journeys-e2e.mjs`: 3 tipos de recorrido
   × 4 personas (principiante, intermedio, regidor, creativo) × 2 idiomas × 5
   viewports = 120 recorridos, con clics, diálogos, navegación, red prohibida,
   capturas y hallazgos de fricción.
4. **Máquina de estados** sembrada (edición + transporte) y experimentos de IA
   offline (contexto A/B, conversaciones con estado, compilador de prompts).
5. **Ciclo de mejora:** cada defecto → test rojo → corrección mínima → test verde
   → repetir suites relacionadas → conservar solo mejoras medidas.

## 3. Escenario integral pedido (preparar y ejecutar una obra sin conocimientos previos)

El recorrido `full-show` cubre cada paso, con comprobaciones de estado reales:

| Paso pedido | Paso del harness |
|---|---|
| Crear proyecto e importar guion | `create-show-import-script` |
| Solicitar propuestas de IA | `ai-pass-1` |
| Rechazar una, continuar el análisis, aceptar dos | `reject-and-pass-2`, `approve-two` |
| Generar sonido, escucharlo, convertirlo en cue | `sound-generate-listen-accept-*` (incluye cobertura del detalle aprobado en el prompt inglés, D16) |
| Editar fade, loop y pie de voz | `edit-fade-loop-trigger` |
| Ensayar, desarmar, pasar a Directo | `rehearsal-auto-arm-disarm-panic` |
| GO, STOP individual, STOP ALL | `operation-go-go-stop-stopall` (GO solapado, STOP individual deja el cue 2 sonando, STOP ALL) |
| Exportar, cerrar, reabrir, verificar | `export-zip`, `verify-zip-offline`, `close-reopen-verify` |

Resultado en `e3bdda6`: **40/40** recorridos full-show; mediana
de **55** acciones. `recovery` cubre 429 de Meta visible,
reintento manual, fallo de SFX sin asset fantasma, regeneración y ZIP manipulado
que no destruye el espectáculo. `manual-show` cubre cues desde líneas del guion,
audio local y añadir/mover/borrar cues.

Única fricción restante observada: `RESET_AFTER_REHEARSAL` (INFO, 40/40): tras
ensayar, el GO preparado queda en el siguiente cue y el operador vuelve al
principio de forma explícita. Es intencionado (leer o ensayar nunca mueve el GO
preparado); se deja a decisión humana junto con F1.

## 4. Defectos encontrados y corregidos

Severidad: P0 seguridad/coste/pérdida de datos; P1 bloquea un flujo principal;
P2 fricción o estado engañoso; P3 menor. Detalle completo, reproducción y
reevaluación en [defect-backlog.json](./qa-evals-2026-11-01/defect-backlog.json).

| ID | Sev. | Área | Commit |
|---|---|---|---|
| D1 | P0 | Baseten seleccionable y alcanzable por rutas de estado/propuestas/agente | `f7c190a` |
| D2 | P0 | Rutas de voz de pago sin reserva en ledger | `f7c190a` |
| D3 | P0 | Runner del seminario Baseten aceptaba `--live` y podía leer la clave antes de la política | `6e13ac9` |
| D4 | P2 | E2E de CI esperaba un botón eliminado | `37f8dde` |
| D5 | P0 | Re-GO de un AUTO_FOLLOW durante su retardo mantenía el temporizador antiguo | `20a9536` |
| D6 | P1 | Editar de modo que un follow quede último fallaba | `a63c6d9` |
| D7 | P2 | Aviso de GO incorrecto tras reordenar | `a63c6d9` |
| D8 | P3 | Auditoría de calidad con ENOENT sin evidencia live | `289e416` |
| D9 | P2 | Conversación de IA invisible al acoplar el panel | `db5e877` |
| D10–D12 | P2 | Cues sin sonido: marcador interno en inglés, pestaña Audio sin acción, panel de contexto desincronizado | `fbec082` |
| D13 | P3 | Texto que describía mal qué automatización se ejecuta | `faa068f` |
| D14 | P2 | Idea aprobada perdida cuando la línea nombraba otra fuente | `e2213c9` |
| D15 | P1 | Consulta de IA rechazada (contexto > 15000 caracteres) o sin evidencia de la instrucción | `e97eb24` |
| D16 | P2 | Prompt SFX en inglés perdía descriptores aprobados en silencio | `1c40001` |
| D17 | P1 | Un lugar («detrás de la puerta») sustituía al sonido («un teléfono suena») | `f4cdc45` |
| D18 | P2 | Singulares en consonante (explosión, reloj, cristal…) sin reconocer | `f4cdc45` |
| D19 | P3 | «repeats the event once» describía dos ocurrencias | `f4cdc45` |

Herramienta de campaña: `e3bdda6` permite pasar un snapshot externo verificado
al piloto de Meta (un archivo local sin seguimiento bloqueaba el piloto
fail-closed sin enviar ninguna solicitud).

### Abiertos

| ID | Sev. | Estado | Motivo |
|---|---|---|---|
| F1 | P2 | HUMAN_REVIEW_PENDING | Insertar/duplicar/borrar reinicia el GO preparado al primer cue (política de seguridad documentada; decisión del responsable del espectáculo) |
| F2 | P2 | OPEN_KNOWN_LIMITATION | AUTO_FOLLOW/AUTO_CONTINUE no conectados al GO del navegador; cambiarlo toca el camino de directo y requiere aprobación y ensayo con hardware |
| F3 | P2 | OPEN_NEEDS_REAL_AI | Gauntlet v2 con 107 turnos LOCAL_GAP que requieren razonamiento real y gold revisado por personas |

No hay P0 abiertos conocidos.

## 5. Mediciones de inteligencia (offline, con sus límites)

- **Contexto de IA (D15), A/B offline** — 2400 casos × 3 variantes, ES/EN,
  80–3000 líneas: aceptación del servidor 43,6 % → 100 %; evidencia utilizable
  33,2 % → 92,0 % (la ventana antigua daba 0 % a partir de 1200 líneas); la
  interfaz ya no bloquea ninguna consulta por tamaño. Límite visible: frases
  solo con sinónimos 44,1 % (recuperación léxica). Mide disponibilidad de
  evidencia, **no** la calidad de respuesta de Muse.
- **Fidelidad del prompt SFX (D16)** — falsas alarmas de «sin traducir» en
  acotaciones del seminario 8/8 → 0/8; conjunto *held-out* de 30 ideas escritas
  después de congelar el léxico: ideas compiladas con detalle sin traducir
  12/13 → 9/13 tras corregir modismos/morfología; 0 pérdidas silenciosas.
  El léxico es cerrado: los sustantivos desconocidos se muestran al usuario
  para escribirlos en inglés.
- **Fuente frente a lugar (D17)** — 18 frases límite: 9 salidas erróneas
  corregidas, 0 regresiones (el primer borrador rompía 3 aperturas y se revisó).
  267 líneas de 12 guiones compiladas con la versión antigua y la nueva:
  0 cambios atribuibles a D17.
- **Singulares (D18)** — sondeo de 20 frases: los singulares alcanzan la fuente
  y el espacio del plural. Corpus: 4 cambios; las 2 líneas de atrezo prohibidas
  por el gold que el primer borrador activaba vuelven a quedar en silencio.
  Residual: una línea de diálogo con «explosión» se compila si se pega
  directamente (como el plural antes); el escaneo del producto ignora el diálogo.

## 6. Piloto real de Meta Muse (F7)

- Comando: `node tools/runq-campaign.mjs live --provider meta --max-requests 5
  --verified-snapshot <dir externo> --live --ack-paid` → runner con ledger
  `tools/runq-agent-live-eval.mjs`, en serie, 0 reintentos, código `e3bdda6`
  verificado por snapshot (sha `14cc62a4…`).
- Primer intento: **bloqueado antes de cualquier solicitud** con
  `BLOCKED_SNAPSHOT_UNVERIFIED` (archivo demo sin seguimiento); corregido en
  `e3bdda6` con test.
- Resultado: **5/5 CORRECT**, 5/5 válidas, 4/5 resueltas, 0 errores, mediana
  2621 ms. Categorías: ediciones, preservación, conversación, ambigüedad, voz
  en ensayo (1 caso cada una; 3 ES, 2 EN; dificultad básica).
- Interpretación: n = 5 es un piloto de humo del camino real
  (producto → servidor → Muse → juez), **no** una medida de precisión
  (intervalo de Wilson 95 % para 5/5: 57–100 %). No cubre los turnos LOCAL_GAP
  de F3 ni casos difíciles. Gold provisional; la calidad artística requiere
  revisión humana.
- **Modal: NOT_RUN** por decisión: sin escucha humana no se puede evaluar el
  audio generado, así que el gasto no aportaba evidencia.

### Ledger compartido (reservas locales, no facturación del proveedor)

| Ámbito | Antes del piloto | Después | Techo |
|---|---|---|---|
| Global | 53,930091 USD | 54,680091 USD | 100 USD |
| Meta | 52,061546 USD · 375 solicitudes | 52,811546 USD · 380 solicitudes | 65 USD · 400 |
| Modal | 1,4 USD · 28 | sin cambios | 35 USD · 100 |
| Baseten | 0,468545 USD · 5 (histórico conservado) | sin cambios | 0 |
| Fireworks | 0 | 0 | 0 |

No se reseteó ni editó ningún ledger, no se leyó ni imprimió ninguna clave y
no se ejecutó `npm run qa:meta:live`. **Los créditos de GitHub Copilot son una
contabilidad separada** y no aparecen en este ledger.

## 7. Ejecución final de la campaña en `e3bdda6`

`node tools/runq-campaign.mjs all --id runq-2026-11-01-e3bdda6`

Suites: **29 PASS / 0 FAIL / 0 pendientes** (de 29). Comprobaciones offline:
**289 337**; comprobaciones de navegador: **90**; casos únicos: **4579**;
repeticiones: **41 199**; solicitudes HTTP a proveedores en estas suites: **0**.

| Bloque | Resultado |
|---|---|
| Sintaxis | 110/110 |
| Unitarios | 832/832 |
| Máquina de estados | 400 semillas, 31 920 pasos, 272 930 comprobaciones, 0 fallos |
| Agente masivo (simulado) | 600/600 |
| Gauntlet v2 | 164 turnos; 107 LOCAL_GAP (requieren IA real; no cuentan como acierto) |
| Contexto A/B | 2400 casos × 3 variantes: aceptación B 100 %, evidencia B 92,0 % vs A 33,2 % |
| Conversaciones con estado | 5 conversaciones × 30 repeticiones = 150/150 |
| Evals offline | 102/102 (gold humano no verificado) |
| cue-qa (fixtures ilustrativos) | 62,5 % / 71,4 % / 66,7 %; **no** mide Muse |
| 15 suites de navegador (Chrome real, proveedores simulados) | 15/15 PASS |
| Recorridos de operador | **120/120** (full-show 40/40, recovery 40/40, manual-show 40/40); 3410 comprobaciones, 4480 acciones (mediana 32), 280 diálogos de confirmación, 430 navegaciones (330 redundantes evitadas), 0 tráfico de red prohibido |

Comparado con F6 (`1c40001`, 29/29): +4 unitarios (D17–D19 y snapshot), sin
regresiones. La única diferencia de recuento es la de esos tests nuevos.

## 8. Incidencias de proceso

- Durante F6 una edición mía del compilador (un `String.replace` cuyo texto de
  reemplazo contenía `$'`) dejó `soundPromptCompiler.mjs` roto unos segundos y
  la suite `interface-browser` falló. Se revirtió con `git checkout` y
  `resume --retry-failed` dejó F6 en 29/29 PASS. Desde entonces: reemplazos con
  función y desarrollo paralelo en un worktree temporal, nunca editando `src/`
  mientras corren suites de navegador.
- `npm run test:interface` es intermitente bajo carga de CPU (timeout); pasa
  ejecutado de forma aislada.

## 9. Lo que queda para una persona

1. Escuchar el audio real (GO, fades, loops) en el equipo del espectáculo.
2. Decidir F1 (reinicio del GO preparado al editar) y `RESET_AFTER_REHEARSAL`.
3. Revisar el gold provisional y ampliar el piloto de Muse a casos difíciles si
   se quiere una medida de precisión (quedan 20 solicitudes y ~12,19 USD de Meta).
4. Aprobar o no la conexión de la automatización al GO (F2) con ensayo en hardware.

## 10. Reparación y contraste de la evidencia

### Registros contrastados, no solo resúmenes

Se leyeron los 29 logs, el manifiesto y los checkpoints de
`runq-2026-11-01-e3bdda6`, las 120 filas de `journeys.jsonl` y el JSON
sanitizado del piloto. El verificador
[`runq-evidence-audit.mjs`](../tools/runq-evidence-audit.mjs) comprueba
identidades, pasos, sumas, errores, red prohibida y correspondencia del piloto
con las reservas locales. Produce un índice con rutas, tamaños y SHA-256,
sin copiar claves, respuestas crudas ni el contenido del ledger.

- **120 registros únicos / 120 completos**, 3410 comprobaciones y 4480 acciones;
  cero pasos fallidos y cero solicitudes prohibidas.
- **5 respuestas Meta HTTP 200**, cero reintentos; las cinco tienen reserva
  coincidente por requestId, runId, proveedor e importe. Cuatro resuelven la
  petición y una ambigüedad no la resuelve: no se equiparan estas métricas.
- Las reservas siguen siendo reservas: no acreditan facturación ni precisión
  artística. Los 107 turnos LOCAL_GAP siguen sin evaluación real.
- Los comandos de esta reparación no hicieron llamadas de proveedor. El ledger
  compartido **cambió mientras se ejecutaban las pruebas offline**; no se
  atribuyen esas reservas a un actor sin evidencia. Lecturas de solo lectura:
  a las **20:45:14 UTC**, 54,680091 USD, Meta 380 y Modal 28; a las
  **20:57:46 UTC**, **54,936902 USD**, Meta **384/400**, Modal **29/100**.
  Baseten conserva cinco reservas históricas; Fireworks, cero.
  Quedaban **16**, no 20, solicitudes Meta en la última lectura: no usar una
  captura anterior para autorizar gasto. Copilot se contabiliza por separado.

Se encontraron y corrigieron dos defectos del evaluador, ambos reproducidos
con tests rojos antes del parche:

| Defecto | Antes | Después |
|---|---|---|
| D20, agregación de recorridos | Tomaba `checks=50` de la primera línea de progreso | Lee exclusivamente el resumen final: `checks=3410` |
| D21, resumen ilegible | Una excepción del parser se convertía en PASS con métricas vacías | FAIL explícito `SUITE_METRICS_INVALID` |

Por D20, el total histórico de comprobaciones de navegador publicado como
**90** debe leerse como **3450** (3410 recorridos + 40 de los otros adaptadores).
Los artefactos originales **no se reescribieron**: el contraste conserva esa
discrepancia. El agregado `unique` entre suites no demuestra casos globalmente
disjuntos; no debe usarse como recuento deduplicado de capacidades.

### Audio nativo, con señal y artefactos

El modo `--audio native` utiliza el AudioContext, decodificador, nodos, reloj
y `onended` reales de Chrome. Una rama silenciosa de instrumentación toma PCM
del grafo que llega al destino; no reemplaza la salida ni los nodos por mocks.
Los archivos de entrada son tonos sintéticos locales (1 s en loop y 4 s sin
loop), **no** generaciones Modal. Chrome headless no prueba altavoces físicos.

Muestra: **8/8** recorridos full-show, cuatro perfiles × ES/EN a 1366×768,
**794 comprobaciones**, **464 acciones**. Se comprueba:

- señal durante las dos preescuchas;
- rampa de amplitud del fade-in, no solo su configuración guardada;
- señal después de terminar la duración del archivo en loop;
- dos frecuencias en GO solapado;
- STOP individual elimina solo la frecuencia del cue parado;
- STOP ALL deja pico PCM **0** en los ocho recorridos;
- `onended` elimina el cue sin loop y mantiene el otro;
- FADE atraviesa amplitudes intermedias antes de llegar a silencio;
- exportar/cerrar/reabrir conserva el show y vuelve a producir señal con GO.

Se conservaron **88 WAV de salida**, **16 trazas** (antes y después del cierre),
**8 capturas** y **8 ZIP exportados**. El auditor vuelve a calcular el RMS
desde el PCM guardado, verifica sus hashes y exige los artefactos. La traza
del primer contexto se guarda **antes** de cerrarlo: antes se perdía.
Si una captura o traza solicitada no puede guardarse, el recorrido falla.

Evidencia local (ignorada por Git):

- [Contraste histórico](../artifacts/long-campaign/repair-evidence/evidence-audit.json).
- [Contraste del audio y artefactos](../artifacts/long-campaign/repair-evidence-native/evidence-audit.json).
- [Contraste de los 120 recorridos repetidos](../artifacts/long-campaign/repair-evidence-mock/evidence-audit.json).
- [Informe de audio con enlaces a cada WAV](../artifacts/long-campaign/repair-native-final/report.md).
- [Captura del show reabierto](../artifacts/long-campaign/repair-native-final/screens/full-show-beginner-es-1366x768.png).
- [Grabación del fade-in](../artifacts/long-campaign/repair-native-final/audio/full-show-beginner-es-1366x768-go-fade.wav).

Identidad de las fuentes de los recorridos finales:
`d58777b4c3812a99f5a6353b6f4b74ff135c919d0ab7cedd3c0b5005eb129128`
(hash de fuentes/harness registrado en `manifest.json`, no hash de commit).
Reanudar exige la misma identidad y modo de audio; no mezcla mocks con audio
nativo ni cambios de código. Se verificó una reanudación sin repetir recorridos.
`--retry-failed` llega también al ejecutor de recorridos.

### Comandos reproducibles

Desde el worktree de campaña, con `playwright-core` disponible (se restauró
localmente tras `ERR_MODULE_NOT_FOUND`, sin cambiar dependencias del proyecto):

```powershell
node tools\runq-evidence-audit.mjs --campaign artifacts\long-campaign\runq-2026-11-01-e3bdda6 --pilot artifacts\agent-live-eval\eval-1793563623792-7148-3533f79a-7d87-43ee-893d-c5cb11a6878c.json --out artifacts\long-campaign\repair-evidence
node tools\runq-journeys-e2e.mjs --audio native --only full-show --viewport 1366x768 --concurrency 2 --trace all --screens all --out artifacts\long-campaign\repair-native-final --resume
node tools\runq-evidence-audit.mjs --campaign artifacts\long-campaign\runq-2026-11-01-e3bdda6 --pilot artifacts\agent-live-eval\eval-1793563623792-7148-3533f79a-7d87-43ee-893d-c5cb11a6878c.json --journeys artifacts\long-campaign\repair-native-final --out artifacts\long-campaign\repair-evidence-native
node --test test\runqCampaign.test.mjs test\browserAudioProbe.test.mjs test\runqEvidenceAudit.test.mjs
npm run qa:codex
node tools\runq-journeys-e2e.mjs --out artifacts\long-campaign\repair-mock-final --concurrency 3 --resume
```

Resultados: regresiones focalizadas **15/15**; `qa:codex` completado, incluidas
sintaxis, **837/837 tests**, cue QA y nueve contratos de guiones del seminario.
Reejecución completa de los recorridos mock: **120/120**, las mismas 3410
comprobaciones y 4480 acciones que antes; no se suman como nuevos casos únicos.
Control negativo: el auditor rechazó `repair-native-02` por la traza ausente
del contexto original. Los 16 archivos de traza de la ejecución final sí se
verificaron, sin dar PASS a evidencia incompleta.
El log completo permanece en `artifacts/long-campaign/repair-codex.log`.
No se inició CI remota: **no hay URL de CI nueva**, push, PR ni merge de esta
reparación. Se preservó el checkout original y el ZIP demo sin seguimiento.

### Límites que no deben convertirse en PASS

**HUMAN_REVIEW_PENDING:** escuchar las grabaciones y los sonidos del espectáculo
en el dispositivo físico; valorar adecuación artística de Modal; revisar el
gold antes de evaluar los 107 turnos con Muse. No se consumieron créditos para
presentar otra prueba de humo como validación de estas capacidades.

**F4, cobertura parcial:** `reject-and-pass-2` rechaza una propuesta y solicita
la siguiente ventana/escena. **No regenera una alternativa de esa propuesta**.
La generación/reintento SFX sí tiene cobertura, pero no sustituye ese requisito.
Se corrigió la descripción histórica y se deja esta capacidad explícitamente
pendiente, en lugar de declarar satisfecho el escenario exacto del usuario.
