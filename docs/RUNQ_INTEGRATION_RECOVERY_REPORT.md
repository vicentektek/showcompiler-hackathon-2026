# RUNQ integration recovery

**Worktree:** `runq-integracion-final` · **branch:** `integration/runq-qa-visual-2026-10-30`  
**HEAD:** `90f89271a5b6b6f24f08b845aad613382f9f9b92` · Merge open toward `23d459d7da8b5184f785f117ff8073d629ba78f6`. No commit, push, PR, or index cleanup.

## Incidencias y correcciones

- **Shell/DOM:** buscaba `#topbar`/`#main`, inexistentes; además competía con `app.mjs` y un `MutationObserver` podía realimentar cambios. Ahora marca el DOM real y sincroniza por `runq:workspace-changed`, sin observar ni reconstruirlo.
- **Cues:** faltaban `status.play`/`status.unresolved` en EN/ES, interrumpiendo el render; un nodo de fuente también se convertía en `[object HTMLSpanElement]`. Se agregaron claves, nodos DOM y espaciado CSS. Demo visible con fuentes L2/L5/L8.
- **Diseño:** las hojas antiguas presuponen otra cuadrícula y reglas globales incompatibles; siguen desactivadas. Se conserva el diseño vigente V2/V15.

## Validación

- `npm run check:syntax`: **213 módulos**; `npm test`: **659/659** (referencia: 654; incluye las regresiones de integración y UX).
- Playwright: 8 workspaces visibles (Sound Lab oculto), 3/3 cues; filtro **3→1→0→3**; selección preserva NEXT y preparar cambia cues 2/3. Cien cambios en **5,144 ms**, sin duplicados ni errores/red fallida.
- Chrome: [1920×1080](../artifacts/integration-recovery/cues-1920x1080.png) y [1440×900](../artifacts/integration-recovery/cues-1440x900.png), tres cues visibles, cue 3 preparado, sin overflow.
- `npm run qa:ai:campaign`: **8/8 gates**, **659/659 tests**, **2400/2400** sintéticos, **0 pagos**. Estado `READY_FOR_OPERATOR_REVIEW / NEEDS_EVIDENCE`; no hubo evaluación en vivo.

Un primer registro mostró un 404 sin petición asociada; no se reprodujo sin caché ni en navegación limpia y su causa queda pendiente. `git diff --cached --check` también señala una línea vacía final en el README de referencias, ya staged; se dejó intacta. No se validaron GO/audio físico, hardware, modelos en vivo ni todas las vistas. Siguiente paso: revisión humana de diseño y ensayo/operación; merge abierto.

## Ajuste visual incremental frente al mockup A

- **Causa visual:** el reparto anterior de columnas daba demasiado peso al inspector y poco a la secuencia central. La estructura ya dispone de una lista y un inspector reales, por lo que bastaba ajustar su proporción sin reubicar ni duplicar controles.
- `src/ui/runq-visual-freeze-v15.css` ahora prioriza la secuencia (2.3fr) y conserva un inspector de al menos 390px en escritorio; por debajo de 800px vuelve a una columna. `test/runqShell.test.mjs` incluye la regresión del reparto y del fallback móvil.
- Playwright con Chrome local: 1920×1080 = secuencia 1193px / inspector 493px; 1440×900 = 816px / 390px. En ambas vistas, los 3/3 cues fueron visibles, búsqueda **3→1→0→3** funcionó, seleccionar no cambió NEXT, preparar el tercer cue sí lo cambió, GO/STOP ALL siguieron visibles, 100 cambios de workspace no duplicaron la estructura y no hubo errores de consola ni solicitudes externas. No se pulsó GO ni se hizo ninguna llamada de pago.
- Capturas nuevas: [1920×1080](../artifacts/integration-recovery/cues-mockup-pass-1920x1080.png) y [1440×900](../artifacts/integration-recovery/cues-mockup-pass-1440x900.png). A 800×720 también se comprobó la lista de una columna con los 3 cues visibles.
- **Pendiente para una réplica más fiel:** el mockup A tiene un árbol real de proyecto/biblioteca a la izquierda y una forma de onda en una bandeja inferior; esta pasada no los inventa ni mueve controles de otras vistas. El editor actual conserva su inspector funcional y la onda existente dentro de sus propiedades. La adaptación visual sigue siendo parcial, no una réplica completa ni una validación de audio físico.

## Cierre de esta iteración: editor y contexto del agente

- **Pestañas de workspace fuera de pantalla:** las reglas de la antigua barra lateral mantenían `width: 100%` en cada botón dentro de la navegación horizontal. Se fuerza ancho automático para conservar las ocho pestañas visibles y el desplazamiento del navegador en cero.
- **Cabecera de secuencia desalineada:** el encabezado conservaba el margen reservado para una columna lateral cuando ya era hijo del marco de secuencia. Ahora ocupa exactamente el ancho de la lista.
- **Explorador de medios recortado en portátiles:** el contenido natural de detalles y acciones excedía la altura de su panel flex. Se compactan detalles/acciones por debajo de 950 px de alto; los tres medios y las acciones quedan visibles, sin retirar sus funciones.
- **Contexto IA anticuado o mezclado de idioma:** el agente solo sincronizaba cambios de espectáculo, no el evento existente de cue inspeccionado, y las etiquetas dinámicas no se volvían a traducir al inicializar o cambiar idioma. Se sincronizan selección, idioma y textos estáticos; la tarjeta mantiene claro qué contexto lee y que nunca envía audio ni ejecuta GO.
- **403 de estado en consola:** la vista se abrió como `localhost`, pero los endpoints locales de Meta/SFX validan estrictamente `Host: 127.0.0.1:<puerto>`. No se relajó esa protección: la vista validada usa `http://127.0.0.1:5178/`. En esa navegación no hubo respuestas 4xx ni errores de consola.
- **Prueba estructural obsoleta:** esperaba que Stagecraft montara solo secuencia e inspector y falló tras incorporar el explorador. La aserción ahora exige la estructura real de tres paneles; la suite vuelve a pasar.

Validación final de esta iteración:

- Chrome/Playwright en **1920×1080** y **1440×900**: los 3/3 medios y 3/3 cues visibles, acciones dentro del explorador, cabecera alineada, sin overflow horizontal, errores de consola ni solicitudes remotas. Evidencia: [editor 1920×1080](../artifacts/integration-recovery/cues-final-1920x1080.png), [editor 1440×900](../artifacts/integration-recovery/cues-final-1440x900.png) y [contexto IA 1440×900](../artifacts/integration-recovery/ai-context-final-1440x900.png).
- **100 cambios reales** de workspace: 687 ms; ocho pestañas visibles, nueve nodos de pestaña contando Sound Lab oculto, una sola instancia de cada panel, sin bloqueo. Seleccionar cue 2 dejó NEXT en cue 1; preparar cue 3 cambió NEXT y no inició audio (cero audios reproduciéndose).
- `npm run check:syntax`: **213 módulos**. `npm test`: **659/659**. `npm run qa:ai:campaign`: **8/8 gates**, **659/659 tests**, **2400/2400** casos sintéticos; **0 solicitudes de pago**. Estado de campaña: `READY_FOR_OPERATOR_REVIEW / NEEDS_EVIDENCE`, no es evidencia de calidad medida con modelos en vivo.
- El navegador quedó abierto en español, en Cue Editor, con el explorador, los cues y el panel RUNQ AI. No se pulsó GO, no se reprodujo audio, no se consultó proveedor, y no se cerró ni publicó el merge.

**Pendiente:** validar ensayo/operación con revisión humana, escuchar audio en un dispositivo real y autorizar por separado cualquier evaluación de proveedor con coste. El parecido con los mockups es parcial; no se añadió una forma de onda inferior ni navegación a carpetas locales.

## Tanda live Meta autorizada (modo literal)
- 13 requests reales (muse-spark-1.3), coste estimado $0.1224 (ledger historico $2 en runq-seminar; facturacion real en el panel de Meta). Sin reintentos ni respuestas crudas guardadas.
- 9 casos puntuados contra gold PROVISIONAL (49 eventos): F1 exacto 91.8%, 0 FORBIDDEN_PLAY, 0 referencias alucinadas, 0 duplicados, 4 omitidos (gala-rundown L13/L15/L16 como alternativas semanticas pendientes de revision humana; conference-keynote L4 tipo erroneo).
- No certifica calidad de Muse (gold sin revision del operador). Pendiente: revisar gold de gala-rundown/keynote, un test rojo y un cambio de una variable antes de reiterar; E2E Chrome del agente requiere playwright-core.

## Campana live del agente (Meta, autorizada)
- Linea base (98 casos sinteticos): 78.7% correcto; fallo sistematico 100% en familias closing/followup. Causa: el modelo ancla varios CREATE_CUE al mismo afterCueId, lo que invertia el orden propuesto (confirmado con 1 peticion de diagnostico).
- Correccion unica y determinista en prepareAgentPlan (encadena CREATE_CUE con el mismo ancla) + test rojo->verde en test/agentCore.test.mjs; el evaluador ya no exige afterCueId null.
- Re-medicion (100 casos, seed 1): 98.9% correcto, 100% contrato valido, 0 errores; 10 respuestas creativas pendientes de revision humana. p50 2.5 s, p95 6.0 s.
- Baseten: HTTP 502 AI_PROVIDER_UNAVAILABLE en el primer caso; no reintentado (pendiente revisar despliegue/clave).
- Test aiCampaign hecho hermetico (ledgerAuditor inyectado); antes dependia del ledger real y fallaba tras gasto live.
- Verificacion: check:syntax 213 modulos, npm test 660/660, qa:ai:campaign 8/8 gates, GO/STOP intactos. El ledger local reserva el maximo, no es facturacion real.
