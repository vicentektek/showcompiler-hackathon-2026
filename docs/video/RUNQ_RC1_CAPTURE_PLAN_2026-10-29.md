# RUNQ — Hoja de rodaje RC1 / Concurso Meta 2026

**Fecha:** 29-10-2026 · **Objetivo:** primer corte completo 31-10-2026.
**Rama candidata:** `integration/runq-demo-2026-10-30` (PR #111); registrar SHA exacto antes de capturar.
**Documento anterior:** `docs/video/PITCH_VIDEO_MASTER_2026-10-29.md` en PR #97, escrito cuando la referencia visual era V9. Esta hoja **sustituye esas referencias a V9** para grabación; la estructura de once escenas sigue siendo orientativa.
**Advertencia:** duración propuesta 03:00, pendiente confirmación de límite en las Official Rules autenticadas.

## Evidencia existente, sin exageración

- El operador reporta que **RUNQ RC1 funciona en Windows** y que la **demo española con cues/audio/pies funciona bien** (29/oct). Reporte cualitativo, no medición de latencia, tasa de detección ni falsos GO/hora.
- El workflow `Core tests` del PR #111 ha generado y verificado `demo/RUNQ_ENSAYO_ES.showcompiler.zip` (guion + 3 WAV originales + pies), incluidos tests sintéticos de motor y modo Ensayo.
- Las propuestas del ZIP llevan `source: MANUAL_MOCK`; **no son inferencias de Meta**. Nunca mostrarlas en una captura rotulada como respuesta real Muse Spark.
- El audio se sintetiza localmente en el proyecto y no acredita una ejecución real de Modal.
- La AI externa requiere verificación de saldo, permiso por solicitud y una captura auténtica del resultado; sin ella, narración condicional o demostración del flujo sin atribuir inferencia efectiva.

## Rodaje y planificación de 3 minutos

| Plano | Montaje | Recurso autentico | Prueba de veracidad |
|---|---|---|---|
| S01, 0:00–0:10 | apertura dramática, título | montaje abstracto + 1 WAV original | no simular producto |
| S02, 0:10–0:25 | problema del operador: pies, guion y multitud de cues | TXT original español `fixtures/demo/runq-ensayo-original-es.txt` | guion sin derechos externos |
| S03, 0:25–0:35 | RUNQ RC1, identidad visual | captura real de interfaz en 1920×1080 | commit visible en notas de rodaje |
| S04, 0:35–0:55 | importar guion y navegar L3, L9, L14 | proyecto de trabajo o importación TXT | L# originales intactos |
| S05, 0:55–1:15 | Meta propone y operador revisa | **solo inferencia Meta real autorizada** | capturar solicitud, fuente L#, aceptación; sino mostrar demo como manual |
| S06, 1:15–1:38 | biblioteca y edición de sonido | WAV `01_atmosphere.wav`, `02_clock_bell.wav`, `03_finale.wav` | onda, region IN/OUT, escucha verdadera |
| S07, 1:38–1:48 | pasar a Ensayo | pestaña real + frase de control | se ve ARM/DISARM |
| S08, 1:48–2:24 | **hero shot de voz**: pie → cue, salto, vuelta | ZIP español completo + micrófono REAL | capturar voz+interfaz+salida WAV en una toma, sin falsos GO editados |
| S09, 2:24–2:43 | Directo/manual, Set NEXT, GO, STOP ALL | control de cues y salida auditiva real | sin GO accidental; STOP ALL auténtico |
| S10, 2:43–2:54 | resumen de la transformación | montaje de capturas anteriores | etiquetas UNDERSTAND / REHEARSE / RUN |
| S11, 2:54–3:00 | logo y CTA final | identidad RUNQ y música original | no claims de PFL/ASIO/DMX |

Los timecodes son guion de montaje, no garantizan el límite oficial ni una duración de narración sincronizada.

## Orden de grabación eficiente

1. Crear directorio local de captura fuera del repositorio de fuentes; confirmar no mostrar claves, créditos, terminales ni cuentas.
2. Guardar ZIP demo, comprobar 3 cues con audio y pies al reabrir y anotar SHA mediante `git rev-parse HEAD`.
3. Configurar OBS a **1920×1080 / 30 fps**, capturar ventana RUNQ y mezcla audio de app + micrófono como pistas separadas si el software lo permite. Desactivar notificaciones.
4. Capturar 15 s sin ARM en Ensayo; pronunciar L3 y mostrar reconocimiento sin GO. Luego habilitar ARM con la intención visible.
5. Grabar de una sola vez L3 → L9 → L14 y otra toma L3 → L14 → L9 (salto y rewind). Pronunciar las frases tal como están escritas, a volumen regular. Conservar los errores reales para evaluación, aunque no se incluyan todos en montaje.
6. Grabar STOP ALL desde un cue activo y volver al estado seguro. Capturar entrada al modo Directo con Auto GO desarmado.
7. Capturar biblioteca, guion, revisión de propuestas y editor como secuencias independientes.
8. Si se dispone de autorización Meta, realizar una única solicitud real y grabarla con el resultado y referencia L#. No mezclar con la demo MANUAL_MOCK; crear copia del proyecto.
9. Montar primer corte completo antes de mejorar gráficos o añadir features. Exportar MP4 H.264 de revisión y comprobar audio/subtítulos al reproducir.

## Escena S08 — notas de operación y seguridad

**Pie cue 1:** “Antes de empezar, escucha cómo respira el teatro.” (L3; cue referenciado L4).

**Pie cue 2:** “Presta atención: ahora suena una sola campanada.” (L9; cue referenciado L10).

**Pie cue 3:** “Entonces deja que esta historia se abra por última vez.” (L14; cue referenciado L15).

Comprobar los siete casos VF-01…VF-07 de `docs/demo/RUNQ_REHEARSAL_ACCEPTANCE_ES_2026-10-30.md`. Anotar cada caso como PASS/FAIL/NO EJECUTADO. Si no puede demostrarse el seguimiento real de voz, montar el modo asistido **etiquetado como tal** y reescribir el claim de Autopiloto.

## Entregables y gates

- [ ] Archivo fuente OBS real (sin claves/pantallas personales).
- [ ] Toma S08 con micrófono y WAV auténticos.
- [ ] Evidencia de uso Meta real o etiqueta «manual example».
- [ ] Primer corte íntegro 31/oct.
- [ ] Narración inglesa y subtítulos revisados frente a acciones reales.
- [ ] Revisión de las Official Rules, duración y visibilidad exigida.
- [ ] MP4 final 3/nov, enlazado a SHA de build congelada.
- [ ] Verificación de reproducción, audio y formulario de envío.

**No publicado automáticamente:** un documento de rodaje no equivale a vídeo final ni crea grabaciones del PC del operador.
