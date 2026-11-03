# RunQ V14 — implementacion, pruebas y limites

Fecha: 2026-10-29. Estado: rama experimental / PR #107, sin fusionar a main.

## Implementado
- Superficies Studio (azul), Ensayo (ambar) y Stage Directo (verde) con el nucleo actual compartido.
- El CueStack principal y el motor de audio son UNICOS: la vista Stage solo consulta el estado real.
- Stage: cue(s) activos, NEXT, posterior, tiempo/progreso, waveform original por picos PCM cacheados, GO/STOP y registro de eventos.
- Se conserva el inspector de navegacion V7 en Stage y su accion autentica Set NEXT, realojado dentro del monitor para no bloquear los cues.
- Ensayo: posicion, pie de voz y estado de ARM autentico; el motor de Autopiloto original no se modifica. Al salir se emite DISARM.
- IA contextual: elegir linea en guion ofrece revisar propuestas o precargar Sound Lab, buscar sin resultados ofrece generacion. No se envian solicitudes ni audio automaticamente.
- Densidades compacta / normal / comoda y persistencia de la preferencia existente.
- Historial tipado y acotado de operaciones confirmadas: GO, fin natural, NEXT, skip, STOP, FADE, STOP ALL, ARM/DISARM; sin transcripciones ni claves.
- Pruebas unitarias de privacidad, limites y aislamiento del registro, mas cobertura Chrome E2E de funciones y geometria de controles.

## Contratos de seguridad
- Seleccionar ≠ Preparar NEXT ≠ Ejecutar GO.
- La reproduccion directa por fila no altera NEXT.
- STOP ALL sigue siendo el control original, interrumpe audio en curso o pendiente y la preescucha.
- La IA contextual solo abre herramientas existentes y nunca confirma pagos, genera ni ejecuta cues por si misma.
- Auto GO sigue limitado a Ensayo y al armado deliberado.
- No se duplican listas de cues, proyectos ni motores Web Audio.

## Validacion de integracion
- Core tests, sintaxis, bateria de QA, voz, Autopiloto, Sound Lab, medios, Stagecraft y navegador Chrome, en GitHub CI.
- Las pruebas del navegador usan motor de audio simulado: NO acreditan latencia profesional ni compatibilidad con tarjetas de sonido Windows.
- Se ha corregido un conflicto legado V7: el inspector de Directo interceptaba clicks en la secuencia; ahora es un hijo del panel real de reproduccion.
- Aceptacion visual en escritorio y ventanas pequenas queda condicionada a inspeccion manual en Windows y prueba con audio real.

## Trabajo pendiente y exclusivo de siguientes fases
- Consolidar reglas antiguas CSS V4-V13 en estilos de componentes y eliminar overrides obsoletos tras pruebas visuales.
- Perfiles de docks persistentes y ventanas desacoplables; actualmente se reutiliza el splitter existente.
- Densidad general de toda la aplicacion y mejoras de accesibilidad tactile/responsive fuera de la CueStack.
- IA contextual mas profunda en el propio texto y revisiones multiseleccionadas sin redundancias.
- Analizadores de nivel REAL de salidas, ruteo de buses, mezclador, pausa/hold con semantica completa.
- Audio progresivo para WAV grandes, MediaStore persistente, exportacion ZIP64 en streaming.
- Pruebas hardware Windows, microfono, salidas y mas de un monitor.

## Condicion para fusion
La PR debe permanecer draft hasta CI verde, inspeccion visual de capturas y validacion de los recorridos completos. Cualquier regression de GO, NEXT, AUTO ARM, STOP ALL o importacion bloquea la fusion.