# Reproducción real de audio — MVP local (26 octubre 2026)

Esta versión **sí reproduce archivos de audio** desde Chrome o Edge con la API Web Audio. El motor se ha escrito durante el hackathon y está separado de las propuestas generadas manualmente.

## Prueba de aceptación en Windows

Desde PowerShell, en la rama `feat/hackathon-script-core`:

```powershell
git pull --ff-only
npm test
npm run dev
```

Abre **http://127.0.0.1:5173**, recarga la página con `Ctrl+F5` y sigue estos pasos:

1. Pulsa **Ejemplo**. Se carga un pequeño guion nuevo.
2. Pulsa **Cargar WAV/MP3 real** y selecciona un archivo propio compatible, preferiblemente corto. No se sube al servidor.
3. Escribe un nombre de cue, selecciona la línea deseada y el audio que figura como **CARGADO**.
4. Pulsa **Crear propuesta simulada** y después **Aprobar**.
5. En la columna de cues, pulsa **GO**: ahora **se oye el audio real** del archivo cargado.
6. Prueba **STOP** y vuelve a pulsar GO. Prueba **FADE 1,5 s** para oír el fundido.
7. Crea otro cue, ejecútalo y pulsa el botón rojo **PARAR TODO** para silenciar todas las reproducciones.

Si el puerto 5173 está ocupado, detén el servidor con Ctrl+C y ejecuta `$env:PORT=5174; npm run dev`. Usa http://127.0.0.1:5174.

## Restricciones conocidas

- Las propuestas siguen siendo **SIMULADAS**. No hay todavía inferencia de Meta AI.
- **GO requiere acción humana explícita** sobre un cue previamente aprobado.
- La ganancia inicial de cada reproducción es del 50 % (aprox. –6 dB); comprueba volumen de altavoces/salida.
- Se decodifican archivos WAV, MP3 y otros formatos si el navegador los soporta, máximo **20 MB**, **10 minutos**, **mono o estéreo**.
- Cada GO reproduce el audio una vez; el módulo admite varios cues sonando a la vez.
- STOP para inmediatamente y FADE programa una rampa de salida de 1,5 segundos.
- PARAR TODO silencia las ganancias y cancela GO pendientes.
- No hay salida ASIO, buses de hardware, ruteo de canales profesional, timecode, MagicQ ni garantías de latencia.
- El audio decodificado reside **solo en la memoria del navegador** y no se guarda en JSON. Tras recargar la página, crear un nuevo espectáculo o abrir un JSON, vuelve a cargar el archivo **con el mismo nombre** para recuperar su vínculo.
- No uses este MVP para un espectáculo real con público ni para control de seguridad.

## Criterio de verificación

Las pruebas automatizadas validan estados, programación de fuentes Web Audio mediante adaptadores simulados y cancelaciones. **No certifican por sí solas salida audible, compatibilidad de códecs ni latencia.** Comprobar manualmente con auriculares o altavoces el recorrido de GO, STOP, FADE y PARAR TODO en Windows es obligatorio antes de declarar superada la aceptación de usuario.

Código: `src/core/browserAudio.mjs`. Pruebas: `test/browserAudio.test.mjs`.
