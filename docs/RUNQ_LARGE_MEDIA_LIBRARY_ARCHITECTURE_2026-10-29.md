# RunQ — biblioteca y edición de audio profesional (decisión 29-10-2026)

Estado: auditoría y hoja de ruta técnica. **V11 corrige distribución/transporte/onda duplicada, NO elimina aún límites grandes de importación ni certifica audio en directo.**

## Evidencia y límites que NO debemos confundir

- `src/core/browserAudio.mjs`: `loadFile` acepta WAV/MP3/OGG/M4A/AAC/FLAC de **hasta 20.000.000 bytes** y **hasta 600 segundos**, y usa `file.arrayBuffer()` + `AudioContext.decodeAudioData()`. Cada sonido decodificado permanece en `buffers` en RAM. La librería es temporal.
- `src/core/audioBatchImport.mjs`: **20 MB por archivo**, 100 MB por lote, 100 audios, ZIP de 64 MB. `audioArchiveFormats.mjs` hereda los mismos topes para ZIP/RAR/7z, con extracción íntegra en memoria.
- `src/core/showArchive.mjs`: espectáculo portátil ZIP STORE, **64 MB totales** y **20 MB por archivo**. Requiere *todos* los audios en un mismo ZIP, lee todos los bytes y calcula SHA-256.
- `src/sfx/lab.mjs`: ahora abre fuentes locales de hasta 20 MB, con decodificación completa, y mantiene una segunda instancia AudioContext, pero V10 coordina su autorización con el show y STOP ALL.
- `src/ui/runq-stagecraft-rebuild.mjs` antes hacía una **segunda decodificación íntegra** por cada selección del visor. V11 usa el resumen de picos cacheado del backend; visualización agregada de canales (no medida de loudness).

Ejemplo: WAV estéreo PCM24 48 kHz 2 min = 34,56 MB (+ cabecera), ya supera el límite individual. 60 min = 1.036.800.000 bytes en disco; decodificado a float32 estéreo = 1.382.400.000 bytes ≈ 1,29 GiB de PCM solo para ese fichero. El riesgo crece con copias, concurrentes y importación ZIP.

`decodeAudioData` requiere **archivos completos** y resamplea a la tasa del AudioContext: no permite extraer un bloque arbitrario de un WAV grande de forma progresiva. Doc: https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData

## Experiencia final recomendada (dos herramientas, una pantalla)

- **Biblioteca**: lista densa con nombre, duración, canales, tamaño, formato, estado de enlace (cargado/no encontrado), cue(s) que lo utilizan, etiquetas y acciones discretas. Filtros / búsqueda / ordenación / lotes. Un clic = inspeccionar; Play independiente; STOP siempre visible.
- **Inspector de fuente**: metadatos + forma de onda **compacta, ~120–150 px** por defecto; botón ampliar. La onda es vista de una *fuente*, no un editor de espectáculos completo. Zoom para localizar IN/OUT cuando proceda.
- **Transporte universal**: Play y STOP en lugar invariable tanto en Biblioteca como en Crear con IA. PREVIEW nunca prepara NEXT ni ejecuta GO; teclado accesible; salida común etiquetada honestamente (todavía no PFL).
- **Edición de cue**: trim, fade, loop, ganancia, repetición, pan y automatización pertenecen al **cue**, no al fichero original. Una fuente puede alimentar varios cues con ajustes distintos.
- **Generación IA**: accesible junto a la biblioteca, con variantes/historial, estado/coste/consentimiento; transportar toma aceptada al editor y crear/asignar cues sin otro import manual innecesario.
- **Espacio**: biblioteca visible ~55%; inspector compacto ~45%. Generación/revisión es vista contextual, no segunda biblioteca ni página larga. Ventanas independientes futuras comparten un solo controlador y estado.

Referencias funcionales:
- QLab 5 Audio Cues: https://qlab.app/docs/v5/audio/audio-cues/ — target en disco, recorte, fades y preview independientes de GO; recomienda WAV/AIFF/CAF para timing.
- REAPER Media Explorer: https://dlx.reaper.fm/userguide/html/ — lista/búsqueda, preview, selección parcial e inserción.

## Arquitectura de archivos grandes: propuesta, no código aún

### 1. MediaCatalog / MediaStore (durable)

Registro por `mediaId`, nombre, tamaño entero 64-bit, formato/codec, sampleRate, channels, duration, fuente original, hash SHA-256 calculado por *stream* y referencias a cues. No colocar PCM/audioBytes dentro del JSON. El fichero sigue en disco, con permisos y rutas controladas por capa principal de Electron.

Dos tipos de show:
- **Trabajo vinculado**: proyecto pequeño (JSON + manifiesto + referencias relativas a carpeta `Media/`). Arranque rápido, avisos si falta audio, opción de *relocalizar* con verificación de hash, sin releer ficheros completos por cada apertura.
- **Entregable autosuficiente**: carpeta de espectáculo con media y manifiesto verificado; opcional paquete ZIP64 **streaming a disco**, sin cargar todo en RAM, en una futura implementación. Distinguir explícitamente «guardar proyecto» y «exportar show completo». No elevar el techo actual del ZIP STORE de 64 MB sin reescribir el empaquetado.

### 2. Doble ruta de audio: cortos precargados / largos streaming

- **Cortos SFX**: precarga limitada por **presupuesto agregado de memoria en bytes PCM**, no por capricho en MB comprimidos; Web Audio buffers permiten salida planificada con reloj de audio y fades.
- **Largos (música/ambientes)**: lector de disco por bloques + decodificación incremental + ring buffer PCM, con precarga anticipada de segundos suficientes, underrun explícito, seek/loop y fade con temporización comprobada en dispositivo real.
- Un `IAudioSource` con `prepare, startAt, stop, fade, seek, status, dispose` común; todas las voces y preview responden a STOP ALL. Nunca dejar GO en segundo motor no coordinado.
- **NO** asumir que `HTMLMediaElement` por sí solo alcanza requisitos profesionales de precisión de GO; puede servir para preview progresivo temporal, pero el motor final debe medirse y verificarse.
- Se puede evaluar backend nativo Windows (WASAPI; ASIO solo con backend licenciado/dispositivos) y probar alternativas. Electron usa APIs oficiales del proceso principal y protocolos locales acotados, sin exponer rutas arbitrarias a renderer.

### 3. Picos de forma de onda sin decodificar PCM completo

- Para WAV PCM compatible: leer solo cabecera RIFF/WAVE y chunks `fmt `/`data`; `File.slice` en lotes por ventanas, picos min/max por bloque. No es válido interpretar directamente bytes de 24 bits como float32 ni asumir que `data` empieza siempre en offset 44.
- Para formatos comprimidos: procesamiento en worker/decoder incremental y *peak cache* versionada por hash, con resolución múltiple según zoom; nunca una segunda copia de todo el audio.
- El render usa solo picos visibles, no PCM de minutos; zoom y scroll virtualizados. Cancelar lecturas antiguas al cambiar archivo, detener tareas por proyecto y limitar RAM/CPU de la precalculación.

### 4. Política de aceptación y pruebas

- No añadir límites «ilimitados». Probar primero archivos de 20, 100, 250 MB, 1 GB y después 2 GB; PCM 16/24/32, 44,1/48/96 kHz, mono/estéreo; WAV RIFF y RF64 en caminos separados.
- Medir tiempo de apertura, peak cache, RAM máxima, latencia GO, drift de loops, underrun, STOP ALL durante I/O, audio simultáneo y cambio de interfaz. PCs Windows reales, sin mocks.
- Pruebas de recuperación: archivo movido, ruta relativa, nombre duplicado, disco extraído, ZIP muy grande, WAV dañado, archivo truncado, disco lleno, permiso denegado, proyecto nuevo durante carga, cierre forzado.
- La reproducción **NO puede quedar READY** hasta que el motor confirme que el fichero objetivo está disponible y la precarga suficiente.
- El límite inicial de 20 MB/64 MB seguirá declarado y visible mientras se implementa y prueba la ruta streaming. Elevarlo en el UI sin cambios en `browserAudio`/`showArchive` es un fallo, no una solución.

## Hitos

1. **V11 inmediata (incluida)**: transporte visible en ambos contextos, biblioteca más densa, onda contextual compacta/ampliable, selección no reproduce, reutilizar waveform cache en lugar de decodificar de nuevo, navegación segura hacia Directo.
2. **MediaStore Windows POC**: importación referenciada de WAV grande y picos mediante chunks, sin intentar reproducir como GO todavía.
3. **Streaming backend**: un único dueño de estado, de archivos y de audio, integración y stress real; importar lotes grandes con progreso y cancelación, estados honestos.
4. **Paquete grande**: directorio de espectáculo por defecto; ZIP64 streaming como opción portátil después de test de compatibilidad.
5. **Validación de producto**: tests con reproducción real, transportes, edición y exportación, revisando impacto en vídeo del hackathon antes de fusionar a estable.
