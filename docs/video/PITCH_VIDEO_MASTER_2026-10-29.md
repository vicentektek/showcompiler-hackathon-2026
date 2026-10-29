# RunQ — presentación para Meta Global AI Developer Hackathon 2026

**Versión:** preproducción v1, 29 octubre. **No es un vídeo renderizado.**

## Objetivo y formato

- **Concepto:** *From script to sound on cue.*
- **Tesis:** Meta Muse Spark interpreta las necesidades sonoras del guion; un operador decide, edita y ejecuta. El seguimiento de pies por voz permite ensayar de forma no lineal.
- **Objetivo de montaje:** 03:00, sujeto al límite de las reglas oficiales todavía no verificado para este vídeo.
- **Medio:** 1920×1080, 16:9, 30fps, locución IA en inglés, subtítulos en inglés, sin presentador.
- **Imagen:** aprox. 80% capturas REALES de RunQ, 12% tipografía/diagramas, 8% ilustración audiovisual generada; NUNCA interfaz falsa generada por IA.
- **Narración:** véase [voiceover_en_v1.txt](./voiceover_en_v1.txt), 264 palabras; ritmo sugerido 125–145 palabras/min y pausas para escuchar el sonido real.

## Guion técnico / storyboard 03:00

| ID | Timecode | Pantalla / montaje | Locución | Comprobación |
|---|---|---|---|---|
| S01 | 00:00–00:10 | Insert abstracto de escenario y golpe sonoro; título THE MOMENT MATTERS | Párr. 1 | Ilustración, no demo |
| S02 | 00:10–00:30 | Guion real, acotaciones y lista de cues, sin fingir producto competidor | Párr. 2 | Guion original, sin licencias ajenas |
| S03 | 00:30–00:38 | Captura real de RunQ V9, logo y tagline | Párr. 3 | Usar build de rodaje |
| S04 | 00:38–01:02 | Importar TXT; L# visibles; ejecutar análisis Meta autorizado | Párr. 4 | Solo inferencia real o material verificado claramente identificado |
| S05 | 01:02–01:24 | Sugerencias L#; aprobar una, rechazar otra, DRAFT | Párr. 5 | Cero GO automático de IA |
| S06 | 01:24–01:45 | Biblioteca, adjuntar archivo, forma de onda, IN/OUT y fades; escuchar audio | Párr. 6 | Audio real y origen correcto; no afirmar generación Modal sin verificar |
| S07 | 01:45–01:53 | Cambio a Ensayo; línea y pie visibles | Párr. 7 | Transición sobria |
| S08 | 01:53–02:25 | **Hero shot:** activar reconocimiento, ARM explícito; repetir, saltar, retroceder; audio real | Párr. 8 | Si no pasa prueba de micrófono real, sustituir por modo asistido y cambiar locución |
| S09 | 02:25–02:40 | Operación manual: Set Next / GO / STOP / STOP ALL | Párr. 9 | Mostrar comportamiento real con sonido audible |
| S10 | 02:40–02:54 | Montaje rápido: guion → propuestas → waveform → ensayo → operación | Párr. 10 | Texto: UNDERSTAND / REHEARSE / RUN |
| S11 | 02:54–03:00 | Logo RunQ sobre fondo oscuro, claim FROM SCRIPT TO SOUND ON CUE | Párr. 11 | Fade musical; sin claims nuevos |

Los tiempos son **provisionales**: ajustar después de grabar la voz. No inventar subtítulos definitivos sin sincronizarlos con el WAV de narración real.

## Claims y límites que debe respetar el montaje

**Demostrable en tests de V8, pero volver a grabar en un build V9 congelado:**
- Importación de TXT, conservación del texto y navegación L#.
- Propuestas de Meta con referencias, aceptación/rechazo y creación de DRAFT sin disparo.
- Biblioteca local, forma de onda, trimming, fades y preescucha.
- Cues manuales GO/STOP ALL; proyecto ZIP completo.

**Condicionado a captura manual real:**
- Ensayo por voz con disparo automático autorizado, salto de cues, rewind y repetición: el repositorio tiene módulo y pruebas offline, y el operador ha reportado éxito, pero el vídeo debe mostrar una ejecución auténtica.
- Generación de sonido por Modal: NO atribuirle el audio del vídeo sin comprobar una ejecución y procedencia reales.

**Excluido:** native Windows EXE, ruteo físico ASIO, DMX, automatización de iluminación, hardware profesional y certificación de directo no demostrados.

## Dirección creativa

- Narración con voz IA inglesa neutra, calmada, de criterio técnico y sin grandilocuencia.
- Diseñar un sonido original de suspenso breve (ambiente + impacto + silencio), sin música protegida.
- Primera aparición de sonido en S01; fragmento real de preescucha S06; reconocimiento+GO S08; contraste de STOP ALL en S09.
- Pantalla en modo oscuro de V9, acentos cian y ámbar; tipografía grande, overlays discretos.
- Captura OBS; edición DaVinci Resolve; revisión export H.264 MP4 + WAV/MP3 narración por separado.
- Proteger claves, scripts privados, datos personales y terminales en capturas.
- La demostración real es el centro: prohibido sustituirla por una falsa interfaz generada.

## Plan de producción

| Fecha | Entregable |
|---|---|
| 29 oct | Guion EN v1, storyboard, lista de planos, pruebas necesarias |
| 30 oct | Primera voz sintética, sonido original, grabación inicial de app |
| 31 oct | Primer montaje íntegro (rough cut), incluso con marcadores |
| 1 nov | Captura definitiva de autopiloto real y congelación del build de vídeo |
| 2 nov | Primer MP4 completo con subtítulos y mezcla |
| 3 nov | Correcciones y validación final, preparación de la entrega |
| 4 nov | Día de margen; envío antes del cierre oficial (9 PM ET, según portal) |

**No usar el 4 de noviembre como objetivo para editar por primera vez.**

## Verificaciones pendientes de concurso

Las páginas públicas de Meta/Cerebral Valley confirman la fecha límite del 4 nov 2026, 9 PM ET; **no he podido confirmar allí el límite máximo del vídeo**. Antes de exportar, revisar el portal privado del participante y las Official Rules aceptadas. No aplicar reglas de otros hackathons.

- https://dev.meta.ai/events/global-hackathon
- https://cerebralvalley.ai/e/meta-ai-developer-hackathon
