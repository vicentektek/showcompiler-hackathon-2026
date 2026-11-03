# Corrección: importación ZIP / RAR / 7z desde Windows

**28 octubre 2026 · PR #81 (borrador; depende de #80).**

## Incidencia

En el cuadro «Abrir» de Windows/Chrome, el filtro personalizado podía ocultar un ZIP u otro archivo comprimido. Seleccionar «Todos los archivos» permitía elegirlo, pero el importador solo aceptaba archivos con extensión `.zip`, y devolvía un error genérico para otros formatos, archivos incompletos y paquetes por encima de 64 MB.

## Implementación

- Se elimina el atributo HTML `accept` del selector de archivos comprimidos: Windows muestra todos y el formato se verifica **después** mediante firma binaria.
- El botón visible dice «Importar ZIP / RAR / 7z». Compatibilidad ZIP (hardened parser existente), RAR4/RAR5 y 7z (libarchive.js WASM 2.0.2 instalado con npm).
- La detección de firma indica con precisión si el archivo no es ZIP/RAR/7z, está vacío, no tiene cabecera válida o excede 64 MB. Los formatos RAR/7z cifrados se rechazan con mensaje específico; archivos divididos en volúmenes no admitidos.
- WASM y worker se sirven **exclusivamente en localhost** desde `node_modules/libarchive.js/dist`. Sin subir el audio ni cargar scripts de CDN.
- CSP permite `'wasm-unsafe-eval'` para compilar solo WebAssembly sin desbloquear `unsafe-eval` de JavaScript. Sigue `worker-src 'self'`.
- Listado previo a la extracción, límite por audio de 20 MB, archivos de audio hasta 100 por lote, límite de memoria por archivos de origen de 100 MB, rechazo de rutas inseguras y nombres duplicados, ningún cambio automático de cues ni sobrescritura de sonidos cargados.

## Restricciones verificables

La versión actual **no** admite RAR/7z cifrados, paquetes multi-volumen, archivos comprimidos de más de 64 MB ni importación de audios individuales de más de 20 MB. Esto debe revisarse antes de utilizar grandes bibliotecas de obras profesionales.

La importación de ZIP normales sigue usando el parser ya validado. La prueba en Chrome ha descomprimido un **7z real de referencia** usando libarchive local, sin servicios externos. RAR tiene pruebas de reconocimiento de firmas RAR4/RAR5 y de flujo de importación con un extractor simulado; hace falta probar un RAR real de Windows con varios WAV antes de dar por cerrada la compatibilidad de todas sus variantes.

## Cómo probar esta revisión

~~~powershell
git fetch origin
git worktree add --detach "$HOME\runq-archives-review" origin/fix/audio-library-rar-7z-picker-and-errors-2026-10-28
cd "$HOME\runq-archives-review"
npm install
$env:PORT = "5187"
npm run dev
~~~

Abre `http://127.0.0.1:5187` → Biblioteca de audio → «Importar ZIP / RAR / 7z». Prueba con un archivo nuevo de ejemplo (por ejemplo, tres WAV en un 7z) y comprueba biblioteca, onda y preescucha. Para archivos comprimidos grandes, divide por actos o carpetas y comprueba límite de 64 MB. **No seleccionar «Abrir show ZIP completo»** para estos archivos: esa operación es un formato de proyecto independiente.
