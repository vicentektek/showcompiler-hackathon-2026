# RUNQ — Escenario de aceptación del Autopiloto (español)

**Fecha:** 29 oct 2026 · **Estado:** fixture original de prueba, NO validación real de ASR/Autopiloto.
**Fuente:** `fixtures/demo/runq-ensayo-original-es.txt` (18 líneas, archivo original y sin derechos de terceros).
**Objetivo:** crear un show real de ensayo con tres WAV y tres pies hablados que permita demostrar repetición, salto y retroceso. No subir guiones privados ni grabaciones sin consentimiento.

## Mapa de los 3 cues

| Cue | Línea de acotación | Pie hablado anterior | Audio recomendado | Comportamiento |
|---|---|---|---|---|
| 1 · Ambiente | L4 | **L3**: "Antes de empezar, escucha cómo respira el teatro." | `01_atmosphere.wav` | Entrar un ambiente tenue |
| 2 · Campana | L10 | **L9**: "Presta atención: ahora suena una sola campanada." | `02_clock_bell.wav` | Reproducir un golpe aislado |
| 3 · Transición | L15 | **L14**: "Entonces deja que esta historia se abra por última vez." | `03_finale.wav` | Lanzar transición corta |

Los nombres de audio coinciden con el **espectáculo de demostración** generado por `npm run demo:package`; la coincidencia de nombres NO significa que este TXT esté ya incluido en ese ZIP ni que las referencias se asignen automáticamente.

## Preparación manual del show (operador)

1. Abrir una copia de RC1 en Windows; volumen de sistema y salida inicial bajos.
2. Crear proyecto de prueba nuevo, importar el TXT y verificar L3/L4, L9/L10 y L14/L15.
3. Importar los tres WAV de la demo o sonidos originales equivalentes, sin cargarlos desde una obra privada.
4. Crear cues en la secuencia, vincularlos a L4/L10/L15; asignar `PLAY` y los medios correctos.
5. Configurar pies explícitos con el texto exacto de L3/L9/L14, revisar que el modo `ASSIST` detecta cada frase.
6. Guardar el espectáculo completo como ZIP con archivos; reabrir en otra sesión y confirmar medios/pies.
7. Solo después: elegir Ensayo, permitir micrófono, pasar a modo Autopiloto, pulsar ARM explícito. Salir de Ensayo debe desarmar; nunca ensayar Auto GO desde Directo.

Si la secuencia de importación TXT/medios no conserva alguna propiedad, documentar el síntoma y corregir el flujo antes de producir el ZIP definitivo; no dar por completada la integración automáticamente.

## Matriz reproducible de voz

| Caso | Secuencia hablada | Resultado esperado | Resultado real |
|---|---|---|---|
| VF-01 normal | L3 → L9 → L14 | cues 1,2,3 en orden solo con ARM | PENDIENTE |
| VF-02 salto | L3 → L14 | lanzar 1 y saltar a 3 según política de Auto GO | PENDIENTE |
| VF-03 retroceso | L3 → L9 → L14 → L9 | volver al cue 2 cuando la coincidencia es concluyente | PENDIENTE |
| VF-04 repetición | L9 → L9 | no provocar duplicación insegura; observar política real | PENDIENTE |
| VF-05 no armado | L3, sin ARM | detectar/sugerir, pero 0 GO | PENDIENTE |
| VF-06 fuera de Ensayo | L9 en Directo | Auto GO desarmado e inactivo | PENDIENTE |
| VF-07 emergencia | ARM, pronunciar pie y pulsar STOP ALL | detener audio y cancelar pendientes | PENDIENTE |

**Los resultados son expectativas sujetas a la semántica real y a la validación manual.** No se afirma que todos los casos vayan a pasar.

### Mediciones

Registrar hora, idioma, dispositivo, salida, nivel, resultado de cada caso, número de GO no solicitados, transcripción reconocida (solo si se permite conservarla localmente), falsos positivos y latencia observable. Para el vídeo, conservar captura auténtica, audio local y versión/commit de RC1. Si la sesión real falla, usar en el vídeo modo asistido y cambiar la narración: nunca inventar Auto GO.

## Fallbacks

- Sin Modal: usar WAV de la demo y documentar su origen.
- Sin Meta Voice en ese momento: enseñar modo asistido de forma honesta, no simular reconocimiento real.
- Sin voz: Directo manual GO/STOP/STOP ALL seguro con la misma secuencia, diferenciando claramente las capacidades.
