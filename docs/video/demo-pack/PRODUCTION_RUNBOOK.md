# RUNQ · plan operativo de producción, pruebas y recuperación

**Objetivo:** convertir los documentos de esta carpeta en una demostración inglesa **real**, reproducible y técnicamente honesta. Esta guía no cambia el programa, no ejecuta modelos, no genera binarios ni sustituye las verificaciones del operador. El rodaje final está en pausa hasta aprobar la interfaz (ver `docs/RUNQ_REPLAN_AI_VISUAL_DESKTOP_2026-10-29.md`).

## Fase A — inventario y congelación de fuentes

1. Abrir el repositorio privado y trabajar en una copia/worktree independiente de `integration/runq-demo-2026-10-30` o de la futura rama final aprobada; **no** tocar otros worktrees ni fusionar a `main`.
2. Mantener `fixtures/demo/runq-the-last-go-en.txt` como texto original. SHA-256 local y recuento de líneas; **31 líneas** sin línea inicial vacía, numeradas L1–L31. Verificar específicamente L6/L7, L14/L15 y L23/L24. UTF-8.
3. Construir los WAV originales del demo mediante `npm run demo:package` solo si se necesitan; dicho comando no crea el show inglés. Extraer/copiar únicamente los 3 WAV originales con sus nombres, conservando su procedencia; no subir binarios sin necesidad.
4. Registrar en una hoja local el identificador de commit de código, commits de material y cualquier cambio local no confirmado; la versión filmada debe ser idéntica entre pruebas/capturas.
5. Importar el TXT limpio; asignar Q01/Q02/Q03 y pies por `CUE_AND_VOICE_MATRIX.md`; adjuntar WAV, validar duración y audibilidad. Si se guardan cues manuales, se etiquetan **MANUAL**, no «propuesta Meta». Las sugerencias Meta reales se prueban aparte y pueden no coincidir con el mapa ideal.
6. Guardar proyecto de show portátil **como nuevo ZIP**, exportar/reabrir y comprobar 3 cues, 3 archivos, triggers y referencias. El ZIP español `demo/RUNQ_ENSAYO_ES.showcompiler.zip` se mantiene intacto.

## Fase B — generar las voces sintéticas

1. Revisar TTS y licencia: la prioridad es que el vídeo pueda exhibirse públicamente ante jurado; **no crear cuenta, comprar créditos ni automatizar gastos sin autorización**.
2. Generar un sample del narrador y muestras breves de James, Maya y Ella con `VOICE_GENERATION_PROMPTS.md`. Comparar claridad, consistencia y entendibilidad para ASR.
3. Elegir las voces y registrar voice ID/modelo/fecha/licencia. Generar los **tres pies literales** L6, L14, L23 individualmente (WAV mono, sin música) antes de producir escenas completas.
4. Generar una toma alternativa de Maya L14 para repetición, y un director separado, solo si se usan.
5. Ensamblar `01_linear_en.wav` a `07_director_en.wav` mediante editor local sin cambios de pitch/tiempo; insertar silencios; conservar fuentes y marcas de tiempo.
6. Producir las secciones de narrador en **archivos por escena**, excepto S08, que se queda sin narración. Crear un provisional de subtítulos solo cuando exista audio TTS real.
7. Revisar por oído y, opcionalmente, transcripción ASR de control independiente. No contar esa verificación como acierto de Meta Muse Voice.

## Fase C — llevar audios grabados al reconocimiento real de RUNQ (Windows)

### Ruta A recomendada: audio virtual controlado

**Esquema:**

`WAV actor en reproductor → dispositivo virtual de reproducción → entrada virtual como MIC de RUNQ → Muse Voice Follow`

En paralelo: `RUNQ Web Audio → altavoces/auriculares → captura OBS de salida de show`.

Un controlador virtual de audio (por ejemplo VB-CABLE) puede exponer el audio reproducido como entrada de micrófono. **Debe seleccionarse como fuente de entrada de RUNQ** en el navegador/sistema y mantenerse EXCLUIDO el sonido que RUNQ reproduce. Confirmar cómo selecciona el dispositivo la build concreta. Los nombres de dispositivos dependen de Windows/controladores; no dar por supuesto que el cambio se aplica automáticamente.

- Verificar que **solo** se transcriben las voces de actores, sin narrador ni campana.
- Probar niveles moderados, sin clipping. No mandar altavoces de RUNQ al circuito de entrada.
- Mantener OBS capturando pantalla, voz de entrada (si legal/permisos correctos) y salida real, idealmente en pistas separadas para mezcla.
- **No usar WAV→evento `speechComplete` artificial como plano del producto**. Ese atajo solo serviría para tests offline del motor, no para demostrar ASR.
- Si un navegador/Electron no permite seleccionar la entrada virtual o falla el permiso, validar una fuente externa física (otro dispositivo reproduciendo WAV hacia un micro) o una interfaz de audio con loopback independiente. Documentar ruido, latencia y limitaciones; no afirmar calidad equivalente.
- En Chrome/Edge o Electron, comprobar permiso de micrófono explícito; no copiar la configuración de otro perfil si no funciona.

### Ensayo sin gasto accidental

- `VOICE FOLLOW` necesita proveedor remoto autorizado/configurado para reconocer audio real; su uso puede implicar API y transferencia de voz. **No probar proveedores de pago desde estos documentos**, consultar política de coste y autorización por llamada/lote, términos y privacidad.
- Primero comprobar audio local, carga del show y exportación sin IA; luego probar con una secuencia corta y permiso explícito.
- Activar idioma EN en la sesión (no ES/mixed por conveniencia sin validar).
- Ensayo empieza **ASSIST / DISARMED**. Comprobar que reconocer una frase no hace GO.
- ARM AUTO GO es una acción deliberada del operador con advertencia. Cada nueva toma requiere verificar el estado. No armar en Directo.
- STOP ALL, salida de Ensayo o pestaña oculta deben desarmar; para repetir, reiniciar el escenario conscientemente.

### Captura de pantalla y salida

OBS: formato horizontal 1920×1080/30 fps; capturar ventana de RUNQ real; desactivar notificaciones y esconder API keys/tokens, cuentas, paneles de gastos y terminales con datos privados. Salida H.264 con pista de programa, conservar master original local. No añadir falsos indicadores en post. Una pista de cámara no es necesaria.

**Latencia:** registrar fin de frase y comienzo real del audio de GO en master crudo, no inferir latencia desde el montaje. La latencia de un audio virtual difiere de voz humana en micrófono; identificar la fuente en la presentación QA.

## Fase D — protocolo de aceptación por escenarios

| Prueba | Preparación | Resultado PASA |
|---|---|---|
| T01 — desarmado | MIC escucha; reproducir L6; AUTO GO OFF | Transcripción final si ASR funciona; **0 cues disparados** |
| T02 — pie 1 | Armar con confirmación; L6 | Q01 suena, estado visible y L6 reconocido |
| T03 — avance | L6→L14→L23 | Q01→Q02→Q03 (si cada evento es final), sin GO espurios |
| T04 — salto | L6→L23 | Solo Q01 y Q03; NO Q02 |
| T05 — retroceso | L23→L6 | Q03 y luego Q01; no intermedios |
| T06 — repetición | L14→intervalo suficiente→L14 otro final | Un disparo por turno; repetición no duplicada automáticamente |
| T07 — negativo | frases parecidas/no pie/«go» | 0 disparos automáticos |
| T08 — STOP ALL | cue sonando/cola pendiente | Audio y callbacks pendientes detenidos; AUTO GO desarmado según regla |
| T09 — Directo manual | seleccionar, Set NEXT, GO | Selección no mueve NEXT ni hace GO; GO manual sí |
| T10 — persistencia | export ZIP, nueva importación | 3 audios reales y cues/pies intactos |
| T11 — fuente IA | análisis explícito de TXT con Meta | Propuesta con L# verdadero y aprobación humana; sin ejecución automática |
| T12 — edición conversacional (si en build) | voz/texto sobre cue | Diff revisable, aceptar/rechazar/undo reales; jamás GO por la IA |

**Condiciones de bloqueo P0:** GO sin ARM; STOP ALL ineficaz; audio ausente que se reproduce; edición o IA que dispara sonido; captura atribuida a Meta sin llamada real. **P1:** una función de vídeo no funciona → cambiar guion/presentación, documentar o usar modo asistido; no simular.

### Evidencia y estadísticas

Crear localmente `production/reports/voice-test-log.csv` con columnas:

`timestamp,build_sha,take,input_device,language,asr_provider,auto_go_armed,expected_line,expected_cue,recognized_final,actual_cue,expected_skip,actual_skip,end_of_utterance_ms,go_audio_start_ms,pass,notes,master_video`

En cada toma anotar aciertos/fallos realmente observados y transcripción real, sin copiar logs privados a Git. Para «latencia media» se requieren varios casos válidos; para «p95» un conjunto con muestra significativa y especificación de método. No llamar 100% accuracy a 3 aciertos.

## Fase E — montar la presentación

1. Comprobar reglas oficiales y duración real antes de cerrar montaje. El objetivo 3:00 es provisional.
2. Aprobar UI y congelar commit del vídeo, navegador/dispositivo y versión de cues.
3. Capturar masters de `STORYBOARD_AND_CAPTURE.md`, sin manipular el significado de controles.
4. Componer secuencias S01–S11 con `NARRATION_EN_V2.md`, dejando S08 sin narrador.
5. Añadir únicamente títulos/etiquetas editoriales veraces. Usar nombres de fuentes de grabación y de personaje en el metraje QA, no claves de API.
6. Hacer subtítulos EN desde el WAV final, incluyendo la transcripción de actores durante S08. Etiquetar speakers si se solapan voces.
7. Mezclar para que la campanada y el STOP ALL se oigan claramente; revisar en sistema doméstico, no solo en estudio.
8. Exportar MP4 y preservar `production/video/masters` con tomas originales y stems; comparar claims del vídeo contra checklist.
9. Congelar hash final y enlaces de reproducción; no enviar hasta revisión de reglas y usuario.

## Manifiesto de evidencia a rellenar antes de entrega

| Campo | Valor |
|---|---|
| Build RUNQ vídeo / commit | PENDIENTE |
| Nombre y hash TXT importado | `runq-the-last-go-en.txt` / PENDIENTE |
| ZIP de show inglés reabierto | PENDIENTE |
| TTS proveedor / derechos revisados | PENDIENTE |
| Metadatos reales de los tres WAV | PENDIENTE |
| Meta live analysis autorizado y capturado | PENDIENTE |
| Muse Voice entrada EN verificada | PENDIENTE |
| Autopiloto ARM y AUTO GO real | PENDIENTE |
| Salto / rewind / repeat | PENDIENTE |
| STOP ALL audiblemente confirmado | PENDIENTE |
| UI cinco mockups aprobada | PENDIENTE |
| Duración permitida según portal | PENDIENTE |
| Máster de vídeo, subtítulos y checksum | PENDIENTE |

## Fuente única de recuperación

Con esta rama y el índice `README.md`, cualquier agente con acceso a GitHub puede retomar el trabajo sin conversaciones anteriores. Antes de modificar el software deberá leer `AGENTS.md` y la documentación de integración; esta carpeta **no autoriza** iniciar APIs pagadas, fusionar PRs ni publicar el repositorio.
