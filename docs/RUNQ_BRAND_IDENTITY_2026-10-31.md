# RUNQ — Identidad visual aprobada (31 octubre 2026)

Estado: **dirección creativa aprobada; assets finales pendientes de producción y validación**.

## Concepto
Identidad industrial de software para producción técnica de espectáculos, inspirada en equipos de audio, flight cases y backstage. Profesional, precisa y sobria; evitar estética genérica de startups de IA.

## Marca
- Wordmark: **RUNQ** en mayúsculas, letras geométricas anchas, cortes técnicos y formas contundentes. **Preservar la silueta del logo 05 “Audio Profesional” que aprobó el usuario**, especialmente la R segmentada y la Q con cola angular. No sustituirla por una tipografía genérica.
- **RUN** en blanco cálido; **Q** en verde salvia, elemento identificativo e icono independiente.
- Eslogan aprobado: **FROM SCRIPT TO STAGE** (sustituye «AI-POWERED CUES»).
- Espaciado generoso para eslogan; nunca usarlo dentro de iconos pequeños.
- No introducir triángulos play, chispas IA, degradados violeta ni elementos ajenos a la identidad.
- Antes de finalizar, comprobar diferenciación respecto a QLab y legibilidad a 16/32 px. No se ha completado análisis jurídico de marcas.

## Colores de referencia
| Token | Hex | Uso |
|---|---|---|
| sage | `#A7B28F` | Q, acción primaria, foco |
| charcoal | `#0F110E` | Fondo principal |
| off-white | `#E8E6DD` | RUN, texto principal |
| stone | `#686F68` | Texto secundario, bordes |
| deep-green | `#1E2A21` | Superficies y fondos alternativos |

Los códigos proceden del último tablero visual y son **referencias de diseño**, sujetos a contraste WCAG y ajuste en implementación.

## Interfaz
- Modo oscuro por defecto. Jerarquía nítida: barra de navegación, paneles, listas de cues, waveform y controles de transporte.
- Botón primario salvia con texto oscuro; secundario delineado; terciario discreto; peligro rojo reservado para STOP/STOP ALL y acciones destructivas.
- Estados: hover, focus visible, active, disabled, loading, error, success. No depender exclusivamente del color.
- Botones GO/STOP de gran superficie y alto contraste para uso en directo. El fondo escénico nunca debe perjudicar la lectura.
- Iconografía lineal técnica, consistente, con áreas táctiles/clicables suficientes.
- Paneles grafito con bordes discretos, radios moderados, espaciado sistemático. Evitar efectos glassmorphism excesivos.
- Tipografía de interfaz: sans-serif legible; el lettering de marca es personalizado y no debe usarse para texto funcional.

## Pantalla de inicio
Concepto visual aprobado: escenario/backstage oscuro, haces de luz tenues, flight cases, ambiente verde carbón. Wordmark y eslogan en zona despejada, acciones «Crear proyecto», «Abrir proyecto», «Ver ejemplo». Fotografía/ilustración como fondo atenuado, con overlay para mantener contraste y rendimiento. Adaptar a distintas resoluciones; no incrustar texto de interfaz en la imagen.

## Assets a producir por separado
1. Logo vectorial maestro SVG, color, blanco, negro y monocromo; versiones con/sin eslogan.
2. Isotipo Q vectorial, app icon .ico multirresolución y PNG 16/32/64/128/256/512/1024.
3. Fondo de bienvenida sin textos ni botones (16:9, 1920×1080 y 2560×1440), versión reducida de peso.
4. Fondo abstracto/textura sutil repetible y variante para pantallas interiores.
5. Tokens de color, tipografía, espacios, radios, sombras y estados en CSS/JSON.
6. Componentes reutilizables: botones, campos, selectores, tabs, tarjetas, modal, toast, badges, navegación, controles de audio, waveform y cue rows.
7. Splash/loading, favicon, Open Graph/banner, material promocional.
8. Guía de tamaños mínimos, clearspace, contraste, accesibilidad y uso correcto/incorrecto.

## Criterios de aceptación
- Fidelidad al **logo 05 original** y a la Q verde; no reinterpretar silenciosamente la tipografía.
- Exportaciones reales individuales, no recortes de una lámina de presentación.
- SVG limpio/editable, transparencia correcta, textos y fondos separados.
- Contraste y legibilidad verificados en interfaz real, en especial modo Directo.
- No sustituir el diseño de producto existente sin revisión y aprobación.
- La imagen generada es un **moodboard de referencia**, no un kit de componentes listo para producción.

## Referencia visual
Último tablero aprobado en la conversación del 31-10-2026: «RUNQ brand-and-UI styleboard» con secciones logo, variantes, paleta, tipografía, iconos, pantalla de inicio, componentes, paneles, menú, fondos, promoción y splash. **La imagen no está incorporada todavía al repositorio**; agregar el PNG de referencia a `docs/brand/references/` cuando esté disponible en el entorno de desarrollo.
