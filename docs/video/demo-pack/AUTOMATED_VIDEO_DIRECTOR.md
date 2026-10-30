# RUNQ · Automated Video Director — plan para implementación desde VS Code

**Estado: ESPECIFICACIÓN, NO EJECUTABLE.** Solicitud: una sola orden/botón desde Visual Studio Code debe poder abrir RUNQ, recorrer pantallas, reproducir las voces inglesas correctas, validar acciones reales y grabar escenas de vídeo repetibles. No ejecutar todavía: la interfaz nueva está en desarrollo y requiere aprobación antes de captura definitiva.

## Arquitectura recomendada

Un **orquestador externo**, sin modificar el motor ni fabricar datos de RUNQ:

- **Playwright + Node.js**: controlar Chrome/Edge visible en 1920x1080, importar archivos, navegar y hacer clic de manera verificable.
- **Servidor RUNQ real**: usar `createAppServer()` de `tools/dev-server.mjs`; conservar semántica real Selected ≠ NEXT ≠ GO, STOP ALL y armar Autopiloto solo tras aprobación del operador.
- **Audio de actores**: reproductor WAV externo → VB-CABLE u otra interfaz con loopback seleccionado como micrófono de RUNQ; los WAV de voces no deben inyectarse como eventos `speechComplete` de Playwright. Eso solo sería una prueba simulada de UI, no una grabación válida de ASR.
- **Voz de operador**: pista SEPARADA de actores; enviar al canal de reconocimiento de órdenes **solo si esta vía funciona realmente en la build**. Alternativa transparente: mantener la frase como locución editorial y el cambio se hace con clic real, rotulado como manual.
- **OBS Studio**: controlar inicio/parada de grabación mediante obs-websocket LOCAL con autenticación; capturar pantalla y pistas de voces y salida real de RUNQ por separado, evitar realimentar la salida al micrófono de ASR.
- **FFmpeg**: ensamblado y mezcla POSTERIOR, respetando fragmentos reales; no superponer un sonido añadido en post para fingir un GO.

### Referencias reales inspeccionadas en rama integración (30/10)

- `tools/browser-e2e.mjs` usa `playwright-core`, `createAppServer()`, `[data-workspace-nav="home"|"script"|"rehearsal"]` y `#homeDemoBtn`. Sus pruebas actuales usan **FakeAudioContext** y son pruebas sintéticas, no captura física de audio.
- `src/ui/voice-live-ui.mjs` usa `#rqLiveStart` / `#rqLiveStop` para escuchar el micrófono real.
- `src/ui/rehearsal-auto-ui.mjs`: `#rqLiveMode`, `#rqLiveArm`, `#rqLiveArmStatus`, `#rqLiveFocus`, `#rqLivePanicBtn`, `#rqLiveAutoHistory` y `#rqLiveCue`.
- El método de armado utiliza **`window.confirm` y una acción humana real** para desbloquear Web Audio. Nunca sobreescribir `window.confirm`, autoaceptar ARM ni usar una API interna para falsearlo. **El asistente del rodaje tiene una pausa de autorización manual.**
- `src/core/agentVoice.mjs` propone pies del guion, NO implementa ASR ni instrucciones de edición. `src/ui/runq-agent-ui.mjs` gestiona propuestas revisables del agente conversacional; la entrada **hablada** del operador requiere validación independiente antes de presentar la demo como voice editing.
- `AGENTS.md` y `docs/REHEARSAL_AUTOPILOT.md` prevalecen para seguridad.

## Diseño de un director por escenas (11 planos, masters separados)

| Escena | Acción de automatización | GATE que debe pasar |
|---|---|---|
| S01 0:00–0:10 | Cartela editorial con sonido propio | No es captura de producto |
| S02 0:10–0:26 | Mostrar guion original (sin cues promocionales) | Texto original íntegro |
| S03 0:26–0:35 | Abrir RUNQ y enfocar Home / proyecto | Versión/commit fijado |
| S04 0:35–0:55 | Importar TXT y enseñar L6/L7 y L14/L15; Meta real solo con consentimiento previo explícito | No afirmar IA si respuesta es fixture |
| S05 0:55–1:13 | Revisar un cue y aprobar/rechazar; opcional frase del operador `03_fade_in.wav` con diff real | 0 GO involuntarios; edición por voz real o rotulada manual |
| S06 1:13–1:34 | Biblioteca, waveform, preescucha, ajustes | Archivo WAV audible, mismo cue |
| S07 1:34–1:41 | Cambiar a Ensayo, mostrar AUTO GO desarmado | Ningún cue al navegar |
| S08 1:41–2:31 | **Fuente de actores a mic real**: probar desarmado; pausa para ARM manual; reproducir tomas linear/jump/rewind/repeat; grabar masters independientes | Transcripción real, pie correcto, GO audible, ningún disparo espurio |
| S09 2:31–2:47 | Modo Directo, Set NEXT, GO, STOP ALL con clicks | Ningún GO por seleccionar; parada audible |
| S10 2:47–2:55 | Montaje de fragmentos observados | No inventar acciones |
| S11 2:55–3:00 | Cartela de marca y frase final | Exportación final tras reglas verificadas |

Tiempo de S08 insuficiente para meter todos los casos completos: **grabar todos, seleccionar éxitos auténticos, rotular los cortes de toma**. No usar una única toma montada para representar varios ensayos sin indicar saltos editoriales.

## Configuración de rodaje sugerida

`docs/video/demo-pack/automation.scenes.json` (archivo de datos a implementar si se crea el orquestador):

- `id`, `title`, `mode` (`offline`, `manual_gate`, `actual_asr`, `paid_meta_opt_in`)
- `workspace` (real, no nombre visual inventado)
- `wav` (solo para actor/operador; ruta local configurable)
- `expected` (estado DOM/cues/acciones)
- `max_seconds` (timeout de detección, no timeout para forzar GO)
- `capture` (nombre de master OBS)
- `safety_gate` (`confirm_operator`, `not_armed`, `none`)

Los trabajos dependientes de una llamada pagada Meta/Voice **no se ejecutan** por el comando por defecto. Se deben autorizar individualmente y presupuestar según los controles ya presentes en RUNQ. No registrar claves, voz subida ni respuestas privadas en Git.

## Modos CLI (interfaz futura)

- `node tools/video/automated-director.mjs --check`: comprobación de dependencias, pantalla, audios, micro virtual, OBS y permisos; sin gasto ni GO.
- `node tools/video/automated-director.mjs --scene S06 --capture`: una toma real de audio/edit, sin IA.
- `node tools/video/automated-director.mjs --scene S08 --dry-run`: plan de tomas y validación de archivos WAV; NO conectar a proveedor ni armar.
- `node tools/video/automated-director.mjs --scene S08 --capture --require-human-arm`: vídeo auténtico de voz, con pausa de usuario y autorización de proveedor; abortar al faltar cualquiera.
- `node tools/video/automated-director.mjs --sequence safe`: solo escenas sin gasto ni Auto GO; el resto solicita acción humana.

Botón VS Code opcional: `.vscode/tasks.json` con tarea `RUNQ: video director` que llama al comando con `--check` o `--sequence safe`. **No iniciar navegador, micrófono ni OBS sin advertencia en consola.**

## Condiciones técnicas de aceptación

1. Cero GO al abrir el show, cambiar pantalla, seleccionar un cue o iniciar OBS.
2. Un GO por voz aparece **únicamente** en un clip en que Muse realmente transcribe el WAV que entra por micrófono virtual y RUNQ fue armado de forma expresa.
3. Las voces de operador, narrador y efectos nunca contaminan el ASR de actores; no doble captura de la salida del programa.
4. Un cambio conversacional se muestra primero como plan/diff, luego se acepta mediante UI real; si no hay voz, no atribuirlo a una orden hablada.
5. Al fallar ASR, UI, permisos o OBS, se aborta la toma y se conserva evidencia de fallo; **no simular un éxito** ni continuar a un plan que exige el paso anterior.
6. Cualquier aviso de `STOP ALL`, cambio de show, salida de Ensayo o cierre del navegador desarma la automatización; nunca rearmar automáticamente.
7. Cada master guarda: commit SHA, fecha, escena, fuente WAV, canal de entrada, autorización explícita, tipo de audio y resultado observado.
8. La herramienta no modifica el código de RUNQ, no hace merge a `main`, no requiere nuevas APIs ni ejecuta inferencias pagadas por defecto.

## Material de voz

- Actor: `docs/video/demo-pack/CUE_AND_VOICE_MATRIX.md` y `fixtures/demo/runq-the-last-go-en.txt`.
- Operador: `docs/video/demo-pack/OPERATOR_VOICE_CUES_EN.md` (17 frases y prompt de casting).
- Narrador: `docs/video/demo-pack/NARRATION_EN_V2.md`.
- Script de preparación de WAV: `tools/video/build_voice_kit.py`.
- Storyboard final: `docs/video/demo-pack/STORYBOARD_AND_CAPTURE.md`.

## Orden de implementación sugerido a Codex

1. Leer `AGENTS.md`, `tools/browser-e2e.mjs`, `src/ui/rehearsal-auto-ui.mjs` y este documento. Registrar rama/HEAD y verificar selectores en la build real (cambian con rediseño).
2. Construir `--check` y `--dry-run` SIN tocar RUNQ, y tests de rutas, manifiesto y ausencia de acciones inseguras.
3. Implementar primero S03 y S06 como clips con Playwright+OBS, probar inicio/parada y mezcla real.
4. Implementar S08 con enrutamiento de entrada REAL y gate manual para ARM, sin inyectar `speechComplete`; comprobar prevención de realimentación.
5. Añadir las tomas del operador solo después de validar por separado la vía de edición por voz; en caso negativo, edición manual honesta.
6. Añadir montaje FFmpeg y subtítulos tras revisar capturas; no ejecutar Meta live desde el director salvo habilitación expresa en política de coste.
7. Ejecutar `npm run check:syntax`, `npm test` y pruebas Windows/OBS/mic real. Documentar lo probado, lo pendiente y cualquier limitación; abrir PR **draft**, nunca merge automático.

**El objetivo del director es automatizar el rodaje, NO el resultado de reconocimiento.** Debe reaccionar a estados reales del software y abortar si no ocurre la acción esperada.
