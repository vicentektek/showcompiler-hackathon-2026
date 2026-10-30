# RUNQ — Configuración de OBS para grabar la demostración real

## Diferencia entre prueba de escritorio y captura final

**Capturar VS Code sirve para comprobar OBS, pero no es el plano principal del vídeo.** Los jueces deben ver RUNQ en Chrome o en el ejecutable probado, sin la terminal, editor de código, secretos ni notificaciones. Visual Studio Code se usa únicamente para lanzar la automatización.

### Escena OBS «RUNQ · DEMO»

1. Abrir RUNQ en **Chrome visible** a 1920 × 1080. Preferir la ventana creada por `run-demo-director.mjs`, que usa tamaño fijo y carga real del proyecto.
2. En OBS, crear **Escena** `RUNQ · DEMO`.
3. Añadir **Captura de ventana** → seleccionar Chrome con título de RUNQ; usar captura de pantalla completa solo si la captura de ventana falla por gráficos acelerados.
4. Seleccionar un único monitor y ajustar «Transformar → Ajustar a la pantalla»; evitar deformar la interfaz. En caso de pantalla menor, grabar a 1920×1080 desde viewport del navegador, con escalado de OBS verificado por captura.
5. Ocultar cursor si distrae; conservarlo durante clics demostrativos. Evitar chat privado, claves, paneles de gastos y notificaciones.
6. En `Ajustes → Vídeo`, establecer lienzo y salida **1920×1080, 30 FPS**, si el ordenador lo soporta fluidamente. No confundir viewport CSS 1920×1080 con dimensiones físicas de ventana: revisar la captura de OBS.
7. En `Ajustes → Salida → Grabación`, usar **MKV** como grabación de seguridad y codificador H.264 por hardware si está disponible. Después `Archivo → Remultiplexar grabaciones` a MP4 si el editor lo necesita. Esto evita perder el archivo completo ante un cierre inesperado.
8. Desactivar notificaciones Windows (Asistente de concentración / No molestar) durante los masters.

## Audio: las tres pistas que importan

| Fuente | Entrada de OBS | Entrada de RUNQ | Uso |
|---|---|---|---|
| **Actor (James/Maya/Ella) o operador Arian** | Captura de audio del reproductor o pista original para edición, **sin duplicar** | Micrófono de RUNQ: WAV pregrabado por Chrome o dispositivo virtual VB-CABLE | Demostrar transcripción real |
| **RUNQ · sonido de espectáculo** | Captura de audio de aplicación (Chrome) o Audio de escritorio si es la única ruta disponible | **NUNCA** reinyectar la salida RUNQ en la entrada de voz | Demostrar que el cue realmente sonó |
| **Narrador Benedict** | Pista en edición, no es necesaria durante captura de RUNQ | **NO** al micrófono de RUNQ | Explicar fuera de S05/S08 |

**El audio simulado de micrófono de Chrome no tiene por qué sonar en los altavoces ni en OBS.** Por eso, para el montaje final se usa el WAV original de actor como pista de diálogo, **además de conservar la captura real del cue emitido por RUNQ**. No crear el efecto de GO en posproducción y después fingir que lo lanzó RUNQ.

Configuración simple de OBS:
- **Pista 1:** mezcla de referencia. Escuchar que la voz del actor y el WAV disparado se distinguen.
- **Pista 2:** salida real de RUNQ (Chrome/application audio).
- **Pista 3:** entrada de diálogo/reproductor (si se captura en directo, sin duplicarla).
- **Pista 4:** reservada opcionalmente para monitorización; el narrador final se mezclará en editor.
- Si no se puede capturar por aplicación en Windows, usar Captura de audio de escritorio con vigilancia para no captar notificaciones o otras aplicaciones. **No activar a la vez captura por aplicación y escritorio para el mismo sonido**, ya que lo duplicaría.

### Prueba rápida de 30 segundos antes de grabar las escenas

1. En RUNQ cargar `RUNQ_THE_LAST_GO_EN.showcompiler.zip` generado por `node tools/video/build-the-last-go.mjs`.
2. En **Audio/Directo**, reproducir un cue manualmente con GO y detenerlo. Observar el medidor de OBS y comprobar que se escucha su sonido en la grabación; bajar picos si saturan.
3. Reproducir un WAV inglés desde un reproductor aparte; si OBS recoge la voz por una pista, comprobar que no queda mezclada dos veces. No activar Auto GO durante esta prueba de niveles.
4. Parar grabación, reproducir el archivo real resultante y verificar: voz claramente entendible, WAV de RUNQ audible, cursor y referencias L# legibles, ninguna pantalla de VS Code.
5. Guardar la grabación como `OBS_AUDIO_VIDEO_TEST_01.mkv` para diagnóstico; no presentarla como evidencia de reconocimiento Muse.

## Automatización desde VS Code

Se han añadido tareas `RUNQ VIDEO · ...` a `.vscode/tasks.json` sin modificar las existentes. El comando básico:

```powershell
node tools/video/build-the-last-go.mjs
node tools/video/run-demo-director.mjs --check
node tools/video/run-demo-director.mjs --scene S06 --capture
```

El último comando abre RUNQ y guarda vídeo Playwright **SIN AUDIO**. Para grabar vídeo más audio desde OBS, se puede usar:

```powershell
$env:RUNQ_OBS_PASSWORD = Read-Host "OBS websocket password"
node tools/video/run-demo-director.mjs --scene S06 --capture --obs
Remove-Item Env:\RUNQ_OBS_PASSWORD
```

En OBS 28+ habilitar **Herramientas → Ajustes de servidor WebSocket**, servidor local en `127.0.0.1:4455`, contraseña activa. En VS Code, las tareas `... with OBS` piden contraseña por entrada en vez de escribirla en el repositorio.

**Importante:** el director OBS **solo inicia/detiene una grabación nueva que él mismo inició**, y aborta si OBS ya estaba grabando. No cambia fuentes ni escenas. Antes del comando, activar manualmente la escena correcta `RUNQ · DEMO`; revisa los medidores.

### Escena S08 con voz pregrabada real

Generar los WAV naturales `*_mic.wav` con `tools/video/prepare-natural-voice-takes.py`. Son WAV PCM mono 48 kHz/16-bit, con **18 s iniciales de silencio**: durante esa ventana puede iniciarse Muse Voice, confirmar autorización y armar Auto GO **manualmente**.

```powershell
node tools/video/run-demo-director.mjs --scene S08 --mic-wav "production/runq-video-kit/natural-voices/mic-ready/02_jump_en_mic.wav" --voice-opt-in --capture --obs
```

El proveedor Muse puede consumir crédito y debe existir consentimiento explícito en CLI y en RUNQ; no iniciamos ni armamos automáticamente. Chromium recibe el WAV por una entrada de micrófono virtual de prueba, pasa por el reconocedor real y ejecuta GO mediante su motor de audio normal, **si el reconocimiento y las reglas de seguridad pasan**.

**No confundir** el WAV del archivo `*_mic.wav` con el sonido de retorno del show ni con el narrador. Verificar entrada seleccionada en `#rqLiveDevice`.

## Inspección de calidad

- La grabación OBS NO debe mostrar Visual Studio Code salvo un plano voluntario de arquitectura/desarrollo, que no se ha previsto en el vídeo principal.
- Estado micrófono/ARM/ASR y el cue activo deben ser legibles en 1080p.
- START/STOP ALL y GO manual deben verse con cursor; no cortar dentro del instante de disparo.
- Pausas de voz deben sentirse naturales, no acelerar para fingir baja latencia.
- No incluir una toma de ASR fallida como ejemplo de éxito.
- La salida RUNQ en OBS no debe formar parte de la entrada de reconocimiento de RUNQ.
- Conservar masters OBS íntegros antes de editar, más CSV de pruebas de QA y commit SHA.

## Pregunta diagnóstica tras la prueba de VS Code

¿En tu grabación de prueba se ve la pantalla y **se oye el sonido del programa**, o solo has conseguido vídeo sin audio? Si falta el audio, revisar primero las fuentes de OBS y el dispositivo de salida de Chrome, antes de intentar el Autopiloto.
