# RunQ — Biblioteca de audio: importación por lotes

28 octubre 2026 · Draft PR #80, dependiente de Stagecraft PR #79.

## Experiencia

El espacio anterior «Audio» se llama **Biblioteca de audio**. Conserva la forma de onda del archivo seleccionado, la preescucha y el botón «Añadir un audio». La biblioteca ahora dispone de dos acciones principales:

- **Seleccionar varios audios**: selector nativo con selección múltiple de WAV, MP3, OGG, M4A, AAC y FLAC. Selecciona 2, 10 o 50 sonidos y pulsa Abrir una sola vez.
- **Importar ZIP de audio**: un ZIP convencional (STORE sin compresión o DEFLATE), con archivos en la raíz o distribuidos en subcarpetas. No requiere construir ni modificar un proyecto de RunQ.

Una tarjeta de resultados muestra archivos nuevos, referencias previamente registradas que han sido recuperadas, y los omitidos con motivo, sin tapar la lista de sonidos ni el visor de ondas. El importador procesa localmente: no llama a Meta, Modal, Baseten ni a servicios externos.

## Decisiones conservadoras

1. **No enlazar automáticamente sonidos a cues.** La biblioteca acumula recursos; la asignación sigue siendo consciente y reversible desde el Cue Editor.
2. **No reemplazar referencias cargadas por nombre.** Reimportar `intro.wav` no cambia inesperadamente el sonido que comparten varios cues. Si existe una referencia a `intro.wav` registrada pero **sin** audio cargado, se rellena esa referencia manteniendo su ID y los enlaces del guion.
3. **No abortar todo por un archivo incompatible.** Un WAV dañado se informa individualmente mientras los demás se incorporan. Solo un ZIP estructuralmente corrupto o inseguro se rechaza completo.
4. **No confundir ZIP de sonido con ZIP de espectáculo.** Los paquetes `project.json` + `manifest.json` se siguen abriendo exclusivamente mediante «Abrir show» para conservar el modelo y sus cues.
5. **La biblioteca no se vuelve un gestor de archivos físico.** Los originales viven en memoria del navegador. El ZIP portátil del show existente permite exportarlos junto al guion, sujeto al límite de 64 MB de ese formato. Guardar solo JSON no guarda los bytes del audio.

## Límites y seguridad

- Cada archivo audio: máximo 20 MB, duración decodificada máxima 10 minutos, mono o estéreo.
- ZIP de origen: máximo 64 MB; hasta 140 entradas (incluidas carpetas), como máximo 100 audios importados y un presupuesto de 100 MB de datos de origen descomprimidos.
- El lector revisa directorio ZIP, cabeceras local y central, límites, nombres y rutas, checksums CRC, descriptores de datos y rechaza rutas relativas maliciosas, symlinks, cifrado, ZIP64 y estructuras solapadas u ocultas.
- DEFLATE se descomprime por streaming con límite para impedir que una entrada declare 100 KB y expanda cientos de MB.
- Archivos auxiliares comunes dentro del ZIP, como documentos, carpetas ocultas y `__MACOSX`, se omiten con recuento.
- No se importa audio mientras GO, pendiente GO, preview o envío de paquete estén activos.

## QA

Pruebas de Node: ZIP estándar y con descriptor, carpetas, STORE y DEFLATE, CRC alterado, nombres duplicados en carpetas diferentes, prevención de escapes de rutas, ZIP del show y asignación de referencias existentes.

Prueba real de Chrome (AudioContext sintético): multiselección, fallo aislado de decodificación, repetición no destructiva, completado de referencia existente, ZIP con audio comprimido en carpetas y rechazo de paquete del show.

## Verificación manual

En una copia aislada del repositorio:

~~~powershell
git fetch origin
git worktree add --detach "$HOME\runq-audio-library-test" origin/feat/audio-library-batch-zip-import-2026-10-28
cd "$HOME\runq-audio-library-test"
$env:PORT = "5186"
npm run dev
~~~

Abrir http://127.0.0.1:5186 y visitar **Biblioteca de audio**. Probar multiselección de 5 WAV reales y un ZIP comprimido con subcarpetas. Revisar que los nombres, duraciones y ondas aparecen; guardar como ZIP completo y volver a abrir para comprobar persistencia del audio.

No fusionar con `main` ni declarar audio certificado hasta validar el hardware de Windows y las distintas configuraciones de sonido.

## Continuación RC v3 - 31 octubre 2026

La biblioteca incluye una zona de arrastre **visible en la lista principal**, sin abrir «Más opciones». Recibe varios archivos de audio, o un único ZIP/RAR/7z de biblioteca, y reutiliza el importador anterior y sus límites. Los selectores nativos siguen disponibles con teclado.

- Un drop solo incorpora/recupera archivos; no asigna cues, prepara GO, reproduce ni contacta proveedores.
- Después de abrir JSON sin bytes, arrastrar los WAV originales por su nombre recupera sus IDs y enlaces. Repetir el drop omite las fuentes ya cargadas, sin sustituirlas.
- Un drop durante reproducción, preview o importación se rechaza con un estado visible, sin detener ni cambiar la salida existente.
- Archivos incompatibles se informan individualmente. Un paquete de espectáculo se rechaza en esta zona; debe abrirse desde «Abrir show». No se recorren carpetas arrastradas.
- `npm run test:last-go` prueba WAVs originales decodificados, JSON sin audio, drop real mediante `DataTransfer`, recuperación no destructiva y protección durante GO. `node tools/stagecraft-audio-batch-e2e.mjs` cubre además archivos comprimidos y ES/EN con hardware simulado.

## Arrastre directo al show - 31 octubre 2026

En **Studio, Ensayo y Live**, arrastrar uno o varios archivos de audio al espacio principal crea **un cue MANUAL / DRAFT por cada archivo válido**, con una sola acción PLAY y el nombre del archivo. Los cues se añaden al final en el orden recibido del navegador; no se ordenan por nombre ni se configura avance automático. Son editables después, sin guion ni propuestas de IA.

Cada archivo recibe una referencia independiente, incluso si comparte nombre con otro archivo: no se sustituyen sonidos existentes. Los fallos de formato, decodificación o límites se muestran en el espacio de cues y no crean cues vacíos. Se mantienen los límites de 100 archivos por lote, 500 referencias y 2000 cues.

El NEXT y la selección existentes no cambian. Solo si el show estaba vacío se prepara el primer cue, sin ejecutarlo. La importación se bloquea durante reproducción, GO pendiente, preescucha, otra importación o cambios sin guardar del inspector. La biblioteca **Sonido** mantiene su comportamiento anterior: importar recursos sin crear cues y recuperar referencias sin bytes. El arrastre directo al show recibe archivos de audio, no carpetas ni paquetes de espectáculo.

La lista de cues muestra siempre una franja con borde discontinuo: **«Arrastra tus archivos de audio aquí»**, con la explicación del Explorador de Windows, un archivo por cue y reproducción solo con GO. Permanece visible con el show vacío o con cues en Studio, Ensayo y Live. Se resalta durante el arrastre y vuelve a su aspecto normal al salir, soltar, cancelar el arrastre o cambiar de espacio. Los resultados aparecen junto a esta franja.

Regresión offline: `node --test test/manualCues.test.mjs test/audioBatchImport.test.mjs` y `node tools/audio-cue-drop-browser-e2e.mjs`. La prueba de navegador usa WAV sintético original y no llama a proveedores; no certifica la salida física de Windows.
