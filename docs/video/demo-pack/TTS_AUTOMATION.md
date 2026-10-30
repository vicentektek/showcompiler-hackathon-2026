# Generador reproducible de voces RUNQ — vídeo y QA

## Estado y seguridad

Esta herramienta **no realiza llamadas de red** ni inicia generación de pago; no necesita claves. Produce trabajos de voz, archivos SSML de Azure Neural TTS y, bajo demanda, voces robóticas eSpeak **solo para QA**. También puede convertir **audio de calidad profesional obtenido por el usuario con licencia** y montar automáticamente las tomas correctas para la demostración de reconocimiento.

**Requisitos:** Python 3.10+; para audio, FFmpeg en PATH; para generar placeholders, eSpeak instalado (es opcional, y no suele venir con Windows). Se puede ejecutar el modo PLAN en Windows sin instalar eSpeak, FFmpeg, dependencias Python ni APIs de pago.

## Paso 1 — generar todos los textos y SSML, GRATIS

Desde la raíz del repositorio, en Windows PowerShell:

\`\`\`powershell
py -3 tools/video/build_voice_kit.py --engine plan --scope hero
\`\`\`

Se creará \`production/runq-voice-kit/\` con \`jobs.json\` y \`ssml/<personaje>/*.ssml\`. **No habrá audio todavía**.

- \`--scope hero\` (**predeterminado**) crea **14 trabajos**: 3 pies de actores, una segunda versión del pie de Maya para repetición y 10 segmentos de narrador. Permite sintetizar el material imprescindible sin generar 43 clips.
- \`--scope all\` crea **43 trabajos**: diálogos completos de la obra, director, negativos, cinco comandos condicionales y narraciones. Permite producir ocho tomas más completas.
- Las frases salen **exactamente** de \`fixtures/demo/runq-the-last-go-en.txt\` y \`docs/video/demo-pack/NARRATION_EN_V2.md\`. Se valida que el guion tenga 31 líneas y pies en L6, L14 y L23.

## Paso 2A — sintetizar muestras offline eSpeak (NO PARA EL VÍDEO FINAL)

Si eSpeak y FFmpeg están instalados:

\`\`\`powershell
py -3 tools/video/build_voice_kit.py --engine espeak --scope hero
\`\`\`

Esto genera de forma local 14 clips fuente, cinco tomas de ensayo y diez segmentos de narrador: **29 WAV PCM16 mono 48 kHz**. Son claramente voces **robóticas de prueba**. No se atribuyen a un modelo neuronal ni se recomiendan para el vídeo público.

Para todos los escenarios de pruebas, incluyendo saltos, retroceso, repetición, negativos, voz de director y comandos separados:

\`\`\`powershell
py -3 tools/video/build_voice_kit.py --engine espeak --scope all
\`\`\`

Produce **43 clips fuente, ocho tomas, cinco comandos y diez segmentos de narrador = 66 WAV**. No hay consumo de APIs ni conexión con proveedores.

## Paso 2B — generar voces inglesas profesionales (para la presentación)

Recomendación de prueba: Azure Speech Studio con voces **Neural UK**. El programa prepara un SSML por frase. El motor SSML ofrece controles de velocidad de locución; antes de una generación real, comprobar región, plan, coste y derechos de uso del servicio.

Asignación sugerida:

| Actor | Voz Azure sugerida | Texto |
|---|---|---|
| James | \`en-GB-RyanNeural\` | Pie Q01 L6 |
| Maya | \`en-GB-SoniaNeural\` | Pie Q02 L14 y repetición |
| Ella | \`en-GB-LibbyNeural\` | Pie Q03 L23 |
| Director (solo pruebas ampliadas) | \`en-GB-AlfieNeural\` | Instrucciones que no son pies |
| Narrador | \`en-GB-OliverNeural\` | S01–S07 y S09–S11; S08 sin locución |

**Fuentes del catálogo y SSML:** [Microsoft Learn — Voice support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts) y [SSML syntax](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-structure). La disponibilidad de voces puede cambiar.

1. Ejecutar \`--engine plan --scope hero\`.
2. Abrir cada \`.ssml\` en el estudio de voz del proveedor compatible, seleccionar exportación WAV preferiblemente sin música ni reverberación y revisar la pronunciación de “RunQ” como “run cue”.
3. Guardar los WAV o MP3 producidos con el **mismo nombre del trabajo** en una carpeta, por ejemplo \`C:\RUNQ\tts-high-quality\`:
   - \`james_l06.wav\`
   - \`maya_l14.wav\` y \`maya_l14_repeat.wav\`
   - \`ella_l23.wav\`
   - \`narrator_s01.wav\` … \`narrator_s07.wav\`, \`narrator_s09.wav\` … \`narrator_s11.wav\`.
4. Si se desea la **escena completa**, ejecutar en cambio \`--scope all\` y producir cada entrada de \`jobs.json\` con el nombre correspondiente. El importador exige **todos los clips del scope seleccionado**, para no producir tomas incompletas de forma engañosa.
5. Guardar fuera de GitHub las pruebas de licencia/uso comercial, proveedor, fecha/modelo y selección de voces. **No subir claves al repositorio**.

También se puede sintetizar con ElevenLabs u otro proveedor: lo único que necesita el importador son archivos WAV/MP3/FLAC/M4A con esos nombres exactos, de voces con licencia válida. No se ha probado ni autorizado ningún coste.

## Paso 3 — normalizar y montar las tomas automáticamente

Con FFmpeg en PATH:

\`\`\`powershell
py -3 tools/video/build_voice_kit.py --engine import --scope hero --source-dir "C:\RUNQ\tts-high-quality"
\`\`\`

Crea:
- \`clips/\`: fuentes normalizadas mono PCM16/48 kHz (originales externos intactos).
- \`takes/01_linear_en.wav\`: James → Maya → Ella.
- \`takes/02_jump_en.wav\`: James → Ella, sin campanada intermedia.
- \`takes/03_rewind_en.wav\`: Ella → James.
- \`takes/04_repeat_en.wav\`: Maya → silencio >=4 s → Maya (segunda toma).
- \`takes/05_disarmed_en.wav\`: las frases correctas sin autorizar el GO.
- \`narrator/S01.wav\` ... \`S11.wav\` (excepto S08).
- \`audio_manifest.json\`: nombre y hash SHA-256 de cada WAV, procedencia de motor y aviso de licencia.

Con \`--scope all\` añade \`takes/06_negative_en.wav\`, \`07_director_en.wav\`, \`08_full_scene_en.wav\` y \`commands/go.wav\`, \`stop.wav\`, \`next.wav\`, \`stop_all.wav\`, \`cancel.wav\`.

**Importante:** los comandos de voz quedan preparados como audios, pero NO se afirma que RUNQ los soporte hasta probar la versión concreta. El motor de voz evalúa eventos **finalizados**; aunque el WAV incluya pausas, hay que comprobar que el reconocedor detecta dos turnos separados, especialmente en \`04_repeat_en.wav\`.

## Paso 4 — reproducir el WAV en RUNQ para probar el reconocedor

Unir salida del reproductor externo con la **entrada virtual elegida como micrófono de RUNQ**, por ejemplo VB-CABLE en Windows, si está instalado y es compatible. La salida de efectos de RUNQ debe ir a otro dispositivo lógico (altavoces/auriculares) para evitar realimentación de sus propios cues.

1. En Ensayo seleccionar EN; permitir micrófono de forma explícita.
2. Comenzar en ASSIST / DISARMED y comprobar que no ocurre ningún GO.
3. Armar AUTO GO mediante control y confirmación real del operador.
4. Reproducir \`takes/01_linear_en.wav\` desde otro programa y observar la transcripción real, L6/L14/L23 y Q01–Q03 en la aplicación.
5. Probar jump/rewind/repeat y registrar falsos GO y latencias medidos **solo** con captura real.
6. Durante vídeo, **silenciar narrador en S08** para que se oiga la frase del actor y el sonido ejecutado por RUNQ.

La captura de un evento sintético \`speechComplete\` inyectado en tests NO es prueba de precisión de voz real. El reconocedor puede fallar con voces robóticas, sin que eso invalide su comportamiento con voces naturales.

## Comprobaciones ejecutadas por preparación técnica

- \`--engine plan --scope all\`: 43 trabajos y documentos SSML sin peticiones de red.
- \`--engine espeak --scope all\`: 66 WAV finales, aproximadamente 44 MB sin comprimir.
- \`--engine espeak --scope hero\`: 29 WAV, cinco tomas de prueba y diez locuciones robóticas.
- \`--engine import --scope all\` con voces de prueba como fuente: normalización y ocho tomas generadas.
- WAV normalizados verificados con encabezados PCM mono 48 kHz/16-bit.
- **No se ha realizado una prueba real de ASR de RUNQ ni se ha sintetizado voz neuronal.**

## Organización y seguridad

Los binarios de voz se conservan localmente bajo \`production/\` y **no deben añadirse automáticamente a Git**. Guardar un ZIP de respaldo y el \`audio_manifest.json\` para reproducibilidad. Antes de grabar vídeo, comprobar la política de uso de voces TTS, el límite oficial del vídeo y la aprobación visual del programa.

Documentación superior: \`docs/video/demo-pack/README.md\`, \`CUE_AND_VOICE_MATRIX.md\`, \`VOICE_GENERATION_PROMPTS.md\`, \`STORYBOARD_AND_CAPTURE.md\`.
