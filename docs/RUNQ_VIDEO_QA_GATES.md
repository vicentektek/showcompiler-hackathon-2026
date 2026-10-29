# RunQ — Test de aceptación audiovisual del hackathon

**Uso:** complemento de la PR de preproducción del vídeo (#97). No es el vídeo, no ejecuta capturas de negocio ni autoriza pagos.
**Objetivo de trabajo:** ~3 min; duración y formatos oficiales por comprobar en el portal del concurso.

## Matriz de planos y pruebas

| Plano | Evidencia que buscamos | Oráculo / test previsto | Bloqueo |
|---|---|---|---|
| S01 00:00–00:10 | Teatro y problema, recurso original | Revisión de derechos y legibilidad, no UI falsa | P1 |
| S02 00:10–00:30 | Guion original y trabajo manual | Texto original y sin datos personales | P1 |
| S03 00:30–00:38 | Branding RunQ V9 | Chrome layout 1920×1080, versión congelada | P0 |
| S04 00:38–01:02 | Import TXT, referencias L# y Meta | Captura de inferencia real aprobada O rotularla ilustrativa | P0 |
| S05 01:02–01:24 | Aprobar/rechazar y crear DRAFT | Log y estado sin ejecución de audio, fuente conservada | P0 |
| S06 01:24–01:45 | Biblioteca, waveform, trim, fade, preview | Archivo WAV original identificado y sonido reproducido | P0 |
| S07 01:45–01:53 | Transición a Ensayo | Navegación correcta, no preparar GO por cambiar pestaña | P1 |
| S08 01:53–02:25 | ARM, voz, salto y rewind | Prueba micrófono REAL con audio auditable; si falla, modo asistido + nueva locución | P0 |
| S09 02:25–02:40 | Operación manual GO/STOP ALL | Reproducción real, detención audible y sin double GO | P0 |
| S10 02:40–02:54 | Recapitulación | Todas las afirmaciones alineadas con evidencia anterior | P1 |
| S11 02:54–03:00 | Logo y llamada a la acción | 1080p nítido, no inventar claim de integración no probada | P0 |

### Dos tipos de material, prohibido mezclarlos

**A. Layout (automatizable ahora):** abrir app local, navegar sin tocar APIs, comprobar selector crítico y capturar PNG a 1920x1080. Script preparado: tools/video-layout-smoke.mjs, comando npm run eval:video:smoke. Resultado esperado únicamente VIDEO_LAYOUT_SMOKE_OK. Ese mensaje NO demuestra Meta, Modal, sonido ni ASR.

**B. Funcional (solo build congelado):** la grabación que aparece en el montaje debe recoger acciones REALES y pistas de audio/voz reales. Registrar SHA, origen de cada archivo, fecha, operador, modo de IA (real/simulación claramente identificada), duración y destino de la captura. La edición puede acelerar esperas o recortar pausas, pero **no crear una falsa cadena causa-efecto**.

### Condiciones de video en 29 oct

- Captura base: OBS Studio, escritorio 1920×1080, 30fps, sin notificaciones ni claves en pantalla. Si se usa reescalado, comprobar que L# y botones sean legibles a 1080p.
- Clip de audio: WAV con derechos claros y origen documentado. Mezclar la narración apartando el sonido solo cuando se enseñan fade/GO/STOP.
- Locución sintética en inglés y subtítulos sincronizados con el WAV final. No inventar tiempos a partir del texto escrito.
- V9 se sigue modificando: usar carpeta distinta o worktree con SHA fijo para el rodaje; no cambiar la rama de trabajo de implementación.
- Para demostrar velocidad de generación o tiempo de respuesta, usar marcas reales de tiempo, no animaciones ilustrativas.
- Si el piloto de voz no pasa una prueba real, eliminar el reclamo de auto GO y usar un test de sugerencia con GO humano.
- Duración máxima, entrega y restricciones de contenido: verificar en reglas oficiales/portal privado antes de exportar el MP4.

## Condiciones de cierre P0

- [ ] S04: procedencia inequívoca de propuestas mostradas.
- [ ] S05: el operador toma una decisión revisada, sin auto ejecución.
- [ ] S06: la onda y la preescucha son del mismo archivo real.
- [ ] S08: vídeo de micrófono en funcionamiento o edición de guion al Plan B honesto.
- [ ] S09: audio en GO y silenciamiento con STOP ALL.
- [ ] Sin credenciales, correos, datos privados ni material sin derechos.
- [ ] MP4 1080p y subtítulos revisados en reproductor independiente.
- [ ] Repo/código y demo coinciden con versión de rodaje.
- [ ] Reglas de vídeo comprobadas antes del envío.

Estos gates son verificaciones **pendientes**, no resultados superados.