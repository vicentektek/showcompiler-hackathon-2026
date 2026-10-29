# RunQ — referencias visuales para el rediseño profesional

Este directorio contiene el **contrato visual** del rediseño. El paquete de imágenes `RUNQ_referencias_visuales_A-H.zip` debe subirse a este directorio y descomprimirse antes de modificar la interfaz. Las imágenes originales proceden de la conversación de diseño del 29/10/2026.

## Ocho referencias

| Archivo del ZIP | Función | Prioridad |
| --- | --- | --- |
| `A_RUNQ_STUDIO_CUE_EDITOR.png` | Studio, cue list, inspector, editor inferior | **Mockup aprobado** |
| `B_RUNQ_AUDIO_LIBRARY.png` | Biblioteca, Sound Lab, transporte y waveform | **Mockup aprobado** |
| `C_RUNQ_GUION.png` | Guion, navegación, cues asociados, IA contextual | **Mockup aprobado** |
| `D_RUNQ_ENSAYO.png` | Ensayo, reconocimiento, Autopiloto, GO manual | **Mockup aprobado** |
| `E_RUNQ_DIRECTO_STAGE.png` | Directo, NEXT, GO, progreso y eventos | **Mockup aprobado** |
| `F_REFERENCIA_MEDIABAY.png` | Densidad, tabla técnica, metadatos, preview inferior | Referencia funcional |
| `G_REFERENCIA_DENSITY_WORKSPACE.png` | Layout multipanel profesional, densidad y navegación | Referencia estructural |
| `H_REFERENCIA_MODERN_OPERATION.png` | Acabado oscuro, jerarquía y estados operativos | Referencia complementaria |

## Prioridades de implementación

1. **Fidelidad visual A–E:** comparar capturas de la aplicación real con cada imagen y corregir geometría, distribución, tipografía, densidad, barras, herramientas, paneles y colores. No limitarse a una reinterpretación.
2. **Conservar funciones:** cue stack canónico, Set NEXT distinto de GO, play por fila a la izquierda, STOP individual, STOP ALL, audio, importación, edición, IA conversacional, voz y Autopiloto de Ensayo.
3. **Biblioteca y editor de sonido:** explorador, tabla de archivos, inspector, waveform y transporte siempre accesible, importación masiva y drag/drop a cues.
4. **Studio / Ensayo / Directo:** superficies especializadas, con la misma instancia de proyecto y motor; nada de medidores falsos ni controles inertes.
5. **QA visual:** 1920×1080, 1600×900, 1366×768, 1100×640 y 900×600; sin controles inaccesibles ni solapamientos.
6. **Windows:** preparar UI para escritorio y DPI sin introducir un segundo motor de audio.

## Para el agente Codex

Antes de empezar, comprueba si existe `docs/design-references/RUNQ_referencias_visuales_A-H.zip`. Si existe, extráelo a una carpeta temporal o dentro de `docs/design-references/`, inspecciona las ocho imágenes y utiliza **A–E como especificación visual principal**. No las confundas con capturas de la versión anterior.

**Importante:** este README por sí solo no contiene las imágenes. No afirmes haberlas examinado hasta que el ZIP o los PNG estén realmente disponibles en el repositorio.
