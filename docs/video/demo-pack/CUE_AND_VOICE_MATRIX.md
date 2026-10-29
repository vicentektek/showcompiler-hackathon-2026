# THE LAST GO · matriz de cues y pruebas de voz

**Fuente única de líneas:** `fixtures/demo/runq-the-last-go-en.txt`. Las líneas cuentan **desde la primera línea del TXT**, incluida la cabecera. No agregar portadas ni líneas vacías al importarlo: cambiarían las referencias `L#`.

## Reparto y tono

| Personaje | Voz | Dirección |
|---|---|---|
| Ella | inglés neutro UK, adulta, articulación clara, cálida | curiosa, ligeramente irónica |
| James | inglés neutro UK, adulto, registro medio-grave | atento y algo nervioso |
| Maya | inglés neutro UK, adulta, registro medio, precisa | regidora tranquila, autoridad serena |
| Director (fuera de obra) | cuarta voz, distinguible, menos teatral | da indicaciones de ensayo, **no** es un personaje del TXT |

**La obra es original y no contiene «RUNQ», nombres comerciales, la palabra «cue» como comando ni instrucciones dirigidas a un modelo.** Las acotaciones son dramáticas y, por tanto, candidatas a propuestas; un evaluador debe revisar lo que realmente devuelve Meta.

## Diseño manual de cues para la demostración, NO resultado de Meta

| Cue propuesto | Fuente de acotación | Pie exacto de diálogo | Archivo de audio existente | Efecto y conducta esperados |
|---|---|---|---|---|
| Q01 · The breathing theatre | L7 | **L6** James: `Listen carefully. The theatre is holding its breath.` | `01_atmosphere.wav` | Iniciar atmósfera de fondo, ~7 s |
| Q02 · The single bell | L15 | **L14** Maya: `When the clock strikes once, open the envelope.` | `02_clock_bell.wav` | Una campanada, ~2.8 s |
| Q03 · The final decision | L24 | **L23** Ella: `When the red light comes on, we make our choice.` | `03_finale.wav` | Transición musical ~5.5 s |

Los WAV anteriores se construyen offline desde `src/core/demoShow.mjs` mediante `npm run demo:package`, pero **ese comando genera otra obra distinta**. No importar su ZIP como si perteneciera a «The Last GO». Para la nueva obra: cargar TXT, crear/asociar los tres cues manualmente, adjuntar los WAV con los nombres correspondientes, asignar pies L6/L14/L23 y exportar un ZIP nuevo desde RUNQ cuando se haya validado. Un constructor específico EN sigue pendiente.

### Política del motor y cuidado con el contexto

- El pie no es la acotación. **Las referencias L7/L15/L24 describen el sonido; los pies L6/L14/L23 son lo que oye el reconocedor.**
- Asociar tres triggers **distintivos de 8–10 palabras**, no palabras aisladas como «go», «light» o «clock».
- Comprobar que la UI usa la misma fuente original de líneas, sin traducción automática ni edición.
- **Asistido por defecto**. El Autopiloto requiere escuchar, permiso de micrófono y ARM AUTO GO con advertencia aceptada. Las acciones de IA de análisis no arman ni disparan cues.
- El motor solo evalúa eventos de voz **finalizados**. No debe disparar por parciales, eventos idénticos o sin ARM.
- Saltos discontinuos: coincidencia >=0.97, >=4 palabras distintivas; si no lo detecta, no falsear la captura. Las repeticiones requieren evento de voz nuevo y >=2500 ms desde el disparo previo.
- Salir de Ensayo, STOP ALL, ocultar la pestaña, cambiar show o intervención manual desarma según la implementación; rearmar explícitamente para otra toma.
- Repetir cue puede detener su instancia previa; retroceder en el guion **no garantiza detener otros sonidos activos**. Configurar política STOP PREVIOUS si procede, o usar STOP ALL entre tomas.
- Capturar audio audible de show por salida del sistema y **voz por entrada separada**, sin reenviar los WAV disparados al ASR.

## Secuencias exactas de archivos a producir

Todos los archivos de voces se preparan a partir de clips de actor limpios en inglés. Dejar 1.0–1.5 s antes del primer pie y 2–3 s entre líneas (más tiempo cuando se indica); no acelerar archivos durante la prueba principal.

| Archivo TTS / montaje | Orden de líneas pronunciadas | Resultado comprobable |
|---|---|---|
| `takes/01_linear_en.wav` | James L6 → Maya L14 → Ella L23 | Q01, Q02 y Q03 en ese orden; **0 cues inesperados** |
| `takes/02_jump_en.wav` | James L6 → Ella L23 | Q01 y Q03. **Q02 NO** se dispara al saltar |
| `takes/03_rewind_en.wav` | Ella L23 → James L6 | Q03 y Q01; sin activación intermedia de Q02 |
| `takes/04_repeat_en.wav` | Maya L14 → silencio >=3.5 s → Maya L14 (otro turno) | Q02 dos veces, si se respetan cooldown/confirmaciones; 0 disparos dobles por un mismo turno |
| `takes/05_disarmed_en.wav` | James L6 → Maya L14 | **0 GO** mientras no esté armado |
| `takes/06_negative_en.wav` | `The clock is somewhere above us.` → `Perhaps the light will turn on.` → `go` → `next` → `stop` | **0 AUTO GO** como pies de guion; estos comandos no se anuncian como soportados sin aceptación |
| `takes/07_director_en.wav` | Director: `Let's start from the first moment again.` → James L6 → Director: `Skip ahead to the decision.` → Ella L23 | La voz del director **no es un comando de transporte**; si la app interpreta instrucciones conversacionales, documentar su estado y permisos. Se espera Q01 y Q03 por pies reales |
| `takes/08_full_scene_en.wav` | Todos los diálogos de L5–L30, manteniendo turnos y pausas de la obra | Ensayo completo de naturalidad, posible **toma de respaldo**; no prometer que cabe en el montaje |

**Importante:** no unir dos locuciones dentro de un único «speechComplete» si se pretende probar repetición: el reconocedor debe producir dos eventos finales diferentes. El intervalo se mide de GO a GO, no solo entre clips; empezar con >=3.5 s es una precaución, no una garantía. Registrar resultados reales.

## Orden de tomas para el vídeo técnico

1. **Sin armar:** `05_disarmed_en.wav`. Mostrar claramente «DISARMED», transcripción y ningún GO.
2. **Armado explícito:** operador activa el micrófono, elige EN, solicita ARM y acepta advertencia; cámara registra el estado «ARMED».
3. **Pie y disparo:** `01_linear_en.wav` abre con James L6; se escucha Q01 y se ve cue activo. Continuar a campana L14 y final L23 si el tiempo de rodaje lo permite.
4. **Salto:** `02_jump_en.wav` en una nueva toma armada. Registrar que Q02 no sonó ni se ejecutó, sin cortar la porción relevante.
5. **Retroceso y repetición:** `03_rewind_en.wav` y `04_repeat_en.wav` como dos pruebas separadas; seleccionar solo éxitos medidos.
6. **Intervención humana:** STOP ALL y modo Directo MANUAL; selección ≠ NEXT ≠ GO, y se muestra audiblemente la parada.

Para un vídeo de 3 minutos se puede montar un subconjunto de tomas. **No unir partes dentro de una misma acción como si fueran un único proceso continuo**; cada prueba significativa debe conservar un master íntegro.

## Comandos de voz: apartado condicionado (NO equiparar con pies)

Preparar *aparte* clips `commands/go.wav`, `commands/stop.wav`, `commands/next.wav`, `commands/stop_all.wav`, `commands/cancel.wav`; cada clip solo pronuncia el comando, con 0.7 s de silencio de entrada y salida. **Solo probarlos con el modo concreto y su confirmación habilitada después de una inspección real de la build**. No se mezclan con el conjunto normal de pies de ensayo. Un «stop» pronunciado nunca debe considerarse la prueba de STOP ALL si ese comando de voz no existe.

## Registro de QA por toma

Una fila por **evento esperado**, no una fila por vídeo:

`build SHA | idioma EN | toma | dispositivo/canal de entrada | ARM sí/no | origen voz TTS | pie esperado + L# | texto reconocido final | cue esperado | cue realmente lanzado | cue omitido deliberadamente | t fin frase | t GO | latencia (ms) | falso GO | repetición | resultado | enlace a captura master`

Métricas reportables SOLO tras ejecución real: precisión de disparo, recall por pie, falsos GO por sesión, latencia mediana/p95 (con muestras suficientes), repetición reconocida, salto correcto, retroceso correcto, tasa de completitud. No transformar tests offline de `speechComplete` en métricas de ASR real.

**Condiciones de rechazo:** GO sin ARM, cue equivocado, GO por narrador/voz del director, saltos que reproducen cues intermedios, pérdida de STOP ALL, metadatos falsos, voz fuera de la fuente configurada o demo atribuida a Meta sin llamada real.
