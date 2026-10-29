# RunQ — checklist de capturas y plan de rodaje

## Regla esencial

**No modificar la copia de V9 en desarrollo.** Para rodaje, crear otra carpeta / worktree separada desde un SHA fijado. Guardar el SHA en el manifiesto de capturas. Ningún recurso de IA genera capturas falsas de la interfaz.

## Tomas obligatorias (clips separados, 1080p a 30fps)

| Archivo | Toma | Criterio de aceptación |
|---|---|---|
| `01-home.mp4` | Inicio y marca RunQ | Versión congelada, menús visibles y sin overlays de desarrollo |
| `02-script-import.mp4` | Cargar guion TXT y señalar referencias L## | Archivo original y trazabilidad reconocible |
| `03-meta-proposals.mp4` | Inferencia Muse Spark | Llamada real explícitamente autorizada o material anterior verificado y rotulado, sin secretos |
| `04-review.mp4` | Aprobar/rechazar una propuesta | Queda DRAFT; no auto-GO |
| `05-waveform.mp4` | Cargar WAV, recortar, fades y preescuchar | Audio reproducible; forma de onda corresponde al archivo |
| `06-rehearsal-auto.mp4` | Pie de voz, ARM, reproducción, salto y rewind | Transcripción y cue reales con audio audible, sin cortar partes críticas |
| `07-operation.mp4` | Set Next, GO, STOP y STOP ALL | Acción y sonido sincronizados |
| `08-show-package.mp4` | Exportar/reabrir proyecto portable | Sin pérdida de cues ni audio |

## Rehearsal hero shot — decisiones

**Plan A:** voz real por micrófono, reconocimiento activo, operador autoriza ARM, dispara cue de audio real, repite una frase, salta y retrocede. Captura continua de los eventos relevantes.

**Plan B (alternativa honesta):** modo de seguimiento asistido: el reconocimiento **sugiere** un cue, el operador prepara y pulsa GO. Cambiar la narración para decir exactamente esto. No rotular como disparo autónomo.

## Grabación y privacidad

- OBS Studio: 1920×1080, 30fps, sonido de sistema capturado; no usar datos personales, API keys ni repositorios expuestos.
- Misma versión fijada para todas las escenas funcionales. Registrar SHA, hora local, origen del audio y si la inferencia es real o simulada.
- Dejar 2 s quietos antes y después de cada interacción. Cursor lento; textos legibles.
- Dejar respirar sonido de muestra y STOP ALL; no taparlos con narración.
- Si falla una función, **se recorta la escena y se adapta el guion**, no se recrea artificialmente.
- El texto de voz está en `voiceover_en_v1.txt`. Los subtítulos se sincronizan a la locución definitiva, no a este storyboard provisional.

## Puertas de aceptación antes del montaje final

- [ ] S04: propuesta Muse Spark real con evidencia del guion y sin clave visible.
- [ ] S05: aceptación/rechazo sin reproducción implícita.
- [ ] S06: waveform/trim/fade/preescucha fieles a un WAV real.
- [ ] S08: real autopilot con ARM y audio, o Plan B honesto aprobado.
- [ ] S09: GO/STOP ALL audible.
- [ ] El vídeo no incluye funciones futuras presentadas como disponibles.
- [ ] Se ha consultado el límite oficial de duración en el portal del participante.
