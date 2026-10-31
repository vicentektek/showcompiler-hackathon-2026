# RUNQ — THE LAST GO: inventario de materiales para Copilot
Fecha de comprobación: 2026-10-31. Esta es una lista de fuentes REALES confirmadas en GitHub/Descript. No asumir que una referencia demuestra que el archivo binario local existe, está integrado o ha pasado QA.

## 1. Material presente en ESTA rama Hero
- `fixtures/demo/runq-the-last-go-en.txt` — **original 31 líneas**. L6 James, L14 Maya, L20 Ella ("And what happens if we skip straight to the decision?"), L23 Ella. Importar tal cual, sin encabezados ni numeración añadida; las referencias L# dependen de ello.
- `tools/video/build-the-last-go.mjs` — genera **offline** el show en inglés a partir de `src/core/demoShow.mjs`, `src/core/showArchive.mjs`, y módulos actuales; se configura inicialmente con tres cues y tres WAV. **Las propuestas incluidas son manuales de fixture, NO resultados auténticos de Muse Spark**.
- `tools/video/prepare-natural-voice-takes.py` — ensambla cinco tomas de micrófono a partir de **James_L06.wav, Maya_L14.wav, Ella_L23.wav** proporcionados aparte; requiere mono 48 kHz PCM16. No sintetiza voces.
- `src/core/heroCue.mjs` — parser local/validador para la orden nueva, aislado del motor y UI.
- `test/heroCue.test.mjs` — 9 pruebas definidas sobre el guion original (antes apuntaban a un archivo ausente; ahora el TXT ha sido copiado a esta rama).
- `docs/RUNQ_HERO_OPERATOR_IMPLEMENTATION_2026-10-31.md` — arquitectura, alcance, criterios H01–H12 y alcance propuesto VT01–VT05.
- `docs/RUNQ_HERO_OPERATOR_COPILOT_PROMPT_2026-10-31.md` — orden de implementación para Copilot.
- Fuentes ya existentes: `src/core/demoShow.mjs`, `src/core/showArchive.mjs`, `src/core/workspace.mjs`, `src/core/projectPersistence.mjs`. Verificar compatibilidad de la versión final antes de usar.

## 2. Resto de preproducción EN OTRA RAMA de GitHub
**Rama:** `docs/runq-video-production-kit-2026-10-29` (NO fusionar la rama en bloque).
- [README](https://github.com/vicentektek/showcompiler-hackathon-2026/blob/docs/runq-video-production-kit-2026-10-29/docs/video/demo-pack/README.md) — índice completo, estado de grabación, material disponible.
- [CUE_AND_VOICE_MATRIX.md](https://github.com/vicentektek/showcompiler-hackathon-2026/blob/docs/runq-video-production-kit-2026-10-29/docs/video/demo-pack/CUE_AND_VOICE_MATRIX.md) — pies y planificación de tomas.
- [demo_manifest.json](https://github.com/vicentektek/showcompiler-hackathon-2026/blob/docs/runq-video-production-kit-2026-10-29/docs/video/demo-pack/demo_manifest.json) — plan estructurado, puede contener estados provisionales antiguos; corroborar con README.
- [STORYBOARD_AND_CAPTURE.md](https://github.com/vicentektek/showcompiler-hackathon-2026/blob/docs/runq-video-production-kit-2026-10-29/docs/video/demo-pack/STORYBOARD_AND_CAPTURE.md) — plan de escenas.
- [PRODUCTION_RUNBOOK.md](https://github.com/vicentektek/showcompiler-hackathon-2026/blob/docs/runq-video-production-kit-2026-10-29/docs/video/demo-pack/PRODUCTION_RUNBOOK.md) — controles de prueba y evidencia.
- [OBS_CAPTURE_SETUP.md](https://github.com/vicentektek/showcompiler-hackathon-2026/blob/docs/runq-video-production-kit-2026-10-29/docs/video/demo-pack/OBS_CAPTURE_SETUP.md) — configuración.
- `tools/video/run-demo-director.mjs` y `tools/video/obs-control.mjs` — utilidades de grabación, solo en esa rama.
- Otros documentos de narración `docs/video/demo-pack/NARRATION_EN_V3_FILM_SCRIPT.md` y de voces `VOICE_GENERATION_PROMPTS.md`.

## 3. Audio que EXISTE, pero NO está confirmado como archivo del repositorio
**A efectos de ejecución automática no está disponible por el hecho de que exista un enlace**:
- Operador Arian, orden Hero (~8,4 s): [Descript](https://web.descript.com/64447897-f516-4c76-8464-7275c97e8f2f/4fd1c); [audio publicado con acceso privado](https://share.descript.com/view/LzKKWM9L27v). Debe descargarse como archivo y verificarse por escucha.
- Operador Arian, instrucciones fade previas: [Descript](https://web.descript.com/4d0882c0-5aa0-4903-a6fc-330ab8691679).
- James/Maya/Ella, casting: [Descript](https://web.descript.com/f1e6a0c1-d10a-4b30-86cb-c5f2915ce530). Se requiere disponer de archivos separados `James_L06.wav`, `Maya_L14.wav`, `Ella_L23.wav`; el casting publicado como una mezcla NO es equivalente a esos tres originales separados.
- Narrador Benedict: [Descript](https://web.descript.com/c9b27c2d-b505-40b1-a327-b1f8b6df9d5d).
- En Biblioteca personal ChatGPT `/Hackaton 2026/`: `RUNQ_Video_Demo_Material_Natural_Voces_2026-10-31.zip`, `RUNQ_Casting_EN_4_Voces.zip`, `RUNQ_Ensayo_EN_Lineal_voces_naturales.wav`, `RUNQ_English_Voice_QA_Kit.zip`. Se verificaron sus registros, **no se pudieron extraer los bytes desde la sesión**. No asumir acceso desde Copilot ni afirmar que se han subido al repositorio.
- Los **tres efectos WAV** `01_atmosphere.wav`, `02_clock_bell.wav`, `03_finale.wav` se generan localmente con `src/core/demoShow.mjs` mediante el constructor mencionado. No confundirlos con las voces o con una generación pagada con Modal.

## 3 bis. Casting recuperado de carga directa del usuario (31/10/2026)

El usuario ha proporcionado el archivo `RUNQ_Casting_EN_4_Voces(1).zip`. Los bytes se han leído y comprobado, **a diferencia de los respaldos de Biblioteca previamente inaccesibles**:

- `James_L06.wav` — 4,90 s; diálogo real de James L6.
- `Maya_L14.wav` — 4,00 s; diálogo real de Maya L14.
- `Ella_L23.wav` — 3,90 s; diálogo real de Ella L23.
- `Narrador_S03.wav` — 7,00 s; locución de presentación, no introducir en el micrófono del Autopiloto.
- También contiene `cortes.json` y `LEEME.txt`, con textos esperados y procedencia.
- Los cuatro WAV son mono/PCM16/48 kHz. SHA-256 del ZIP origen: `a7830127d36c4e6106cff6de1a31c50bca433d53b7209529033f39b9b07fe09d`.

**Derivado creado y validado (descarga en la conversación, no en GitHub):** `RUNQ_The_Last_GO_5_Tomas_Voces_Naturales_2026-10-31.zip` con `actors/`, `narration/`, `takes/`, `mic-ready/`, manifiesto y cinco tomas: lineal, salto, retroceso, repetición y desarmado. Las tomas `mic-ready` incluyen 18 s iniciales de silencio, para Chromium. Los WAV se han verificado mediante lector WAV y el ZIP superó la verificación de integridad.

**IMPORTANTE:** no están incorporados como archivos binarios versionados a esta rama de GitHub. Copilot necesita que el usuario copie/descomprima el paquete descargable en su ordenador (carpeta local de producción). Un enlace en esta documentación NO es un archivo binario accesible automáticamente desde VS Code.

**Importación sugerida desde PowerShell, con el archivo previamente descargado:**

```powershell
$zip = 'C:\RUTA\RUNQ_The_Last_GO_5_Tomas_Voces_Naturales_2026-10-31.zip'
$dest = 'production\runq-video-kit\natural-voices'
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force
```

**Nueva carencia localizada:** L20, pie del nuevo Q03 Hero (*"And what happens if we skip straight to the decision?"*) **NO está en el casting**. Se necesita grabar/generar una toma auténtica adicional `Ella_L20.wav` si se quiere demostrar el GO de ese cue a partir de la voz de la actriz. No sustituirla por `Ella_L23.wav`, pues no contiene el pie L20. La orden del operador **Arian Hero** sigue en Descript y tampoco forma parte de este ZIP. No presentar clips QA como pruebas de ASR superadas.

## 4. Qué puede ejecutar Copilot una vez incorporados los archivos
1. Confirmar repositorio, rama y worktree sin sobrescribir el trabajo en paralelo.
2. `node --test test/heroCue.test.mjs` — tests offline del intérprete con su TXT ya copiado; **confirmar resultado real**.
3. `node tools/video/build-the-last-go.mjs` — genera `production/runq-video-kit/RUNQ_THE_LAST_GO_EN.showcompiler.zip` y `production/runq-video-kit/sfx/` si las dependencias lo permiten; **comprobar éxito y roundtrip**, no darlo por hecho.
4. Solo tras obtener los tres WAV de actores **separados**, `python tools/video/prepare-natural-voice-takes.py --source-dir RUTA_CON_JAMES_MAYA_ELLA` (en Windows normalmente `py -3`).
5. Probar show base de 3 cues, importar copia para Hero y registrar diferencias. La copia Hero añade el nuevo Q03/L20 y renumera al antiguo Q03 como Q04.
6. Audio/ASR real y producción con OBS requieren Windows y permisos explícitos; las pruebas sintéticas no certifican reconocimiento, latencia ni transporte por voz.
7. Nunca añadir al repo público/privado WAV de voz con licencia dudosa, tokens, logs de micrófono ni exportaciones privadas. Para transferencia, usar carpeta local controlada; Documentar hashes y origen, no secretos.

## 5. Estado real, sin asumir funciones
- LISTO: guion TXT, generador del show, scripts de preparación, referencias y parser Hero en GitHub.
- POR CONFIRMAR LOCALMENTE: ejecución de 9 tests en la rama ya corregida y creación efectiva del ZIP inglés.
- NO INTEGRADO: operación CREATE_CONFIGURED_CUE en el agente UI/CORE, dictado Hero con Muse Voice, roundtrip del show de 4 cues.
- NO ACREDITADO: comando hablado GO/ARM/STOP ALL end-to-end o ensayos reales ingleses con reconocimiento.
- NO DISPONIBLE COMO BYTES EN ESTA RAMA: voces individuales Arian/James/Maya/Ella/Benedict.

**En la grabación mostrar únicamente las funciones validadas de forma reproducible.**
