# RUNQ — Evidencia y preparación de release candidate

**Corte de verificación:** 1 de noviembre de 2026  
**Estado:** candidato local para demo controlada; **no congelado ni aprobado para publicación**.  
**Rama observada:** `feat/runq-ai-campaign-100-2026-10-31`  
**HEAD observado:** `5fdb4d1b5cd3f4fd5ca65771ca822b18d1731ad1`

Este corte no sustituye el [runbook de demo y release](./DEMO_AND_RELEASE_RUNBOOK_V1.md)
ni la [hoja de rodaje RC1](./video/RUNQ_RC1_CAPTURE_PLAN_2026-10-29.md).
Registra resultados observados en el checkout actual; no convierte pruebas
offline en evidencia de uso real de modelos, micrófonos o hardware.

## Decisión y protección del trabajo

- Se conservó la rama y todo el trabajo local. No hubo `reset`, checkout
  destructivo, staging, commit, merge ni push.
- El árbol de trabajo ya contenía muchas modificaciones y archivos nuevos de
  varias líneas de desarrollo. Git no permite atribuir cada cambio a un autor
  o sesión; la clasificación por tema es orientativa.
- Al cierre: 61 archivos rastreados modificados, 33 archivos no rastreados y
  0 archivos preparados en el índice.
- Los diffs preexistentes en política/ledger y herramientas de presupuesto se
  preservaron sin editarlos durante esta continuación; tampoco se ejecutaron
  comandos de campaña en vivo.
- No se ha creado una etiqueta, rama ni commit de RC. El HEAD no representa
  necesariamente todas las modificaciones sin confirmar.
- No se ejecutó ninguna solicitud pagada; no se leyó ninguna clave ni se
  modificó el ledger.
- Los dos ZIP existentes se comprobaron por SHA-256 sin reconstruirlos:
  - `demo/RUNQ_ENSAYO_ES.showcompiler.zip`:
    `2a4f3a4acf6f8a7ef768286e69079258dcd82bdd9eda6d9c5bb3a9c741e99973`
  - `demo/SHOWCOMPILER_SHOW_DEMO.showcompiler.zip`:
    `a2e3917a936c3bae1be3b51551a0f24882d8927f5875c0d17fba94597730febe`
- **No ejecutar `npm run demo:rehearsal` sobre este checkout sin cambiar antes
  el destino:** el generador escribe sobre el primer ZIP.

La decisión es **NO-GO para una RC pública o una afirmación de uso profesional**
hasta completar las comprobaciones manuales de este documento y seleccionar
un commit limpio/revisado. Los E2E reducen riesgo de regresión, pero no
certifican la operación de un espectáculo.

## Corrección de Ensayo verificada

La lista del espacio Ensayo se quedaba sin altura asignada: el layout tenía
420 px mientras sus paneles y la zona de voz competían por el espacio. En el
caso reproducido, `#cueList` medía 0 px y el panel de voz interceptaba el
puntero sobre STOP. En escritorio se amplió la altura mínima del layout a
580 px; la lista vuelve a tener área desplazable y el panel de voz fluye debajo
en vez de cubrir los controles.

Las pruebas desplazan el cue con scroll normal, verifican el hit-test del
puntero y después hacen `.click()` sin `force` ni activación DOM programática.
En Last GO se añadió el mismo scroll previo a la medición del hit-test: el
control estaba fuera de la zona visible antes del scroll que una interacción
normal también necesita. No se alteró la semántica de GO, NEXT, STOP o STOP
ALL.

En pantallas compactas, Ensayo puede requerir scroll vertical. Directo a
900×600 mantiene GO y STOP ALL a la vista. Esto no resuelve la diferencia
visual apreciable frente a los mockups aprobados, en particular en Biblioteca
y Ensayo.

## Validación reproducible

Entorno observado: Windows, Node.js `v22.16.0`, npm `10.9.2` y Chrome
`156.0.8078.74`. El proyecto declara Node `>=20` y es una aplicación web local
con módulos ES y Web Audio.

| Comando | Resultado observado | Alcance / límite |
|---|---|---|
| `npm run qa:codex` | PASS; 783/783 tests; sintaxis, Windows-syntax, QA de cues y seminario offline | Las predicciones de cue son ilustrativas, no miden Muse. QA de seminario: 9 guiones, 13 ventanas y 49 eventos anotados; cero llamadas a proveedor. |
| `npm run test:interface` | PASS; navegación, controles, ES/EN, accesibilidad básica y flujo funcional | Chrome real, rutas externas bloqueadas; el test cubre varios espacios y tamaños. |
| `node tools/rehearsal-auto-browser-e2e.mjs` | PASS; GO automático supervisado, salto/vuelta/repetición, STOP individual y STOP ALL | Web Audio reproduce WAV local; entradas de reconocimiento de voz sintéticas. |
| `npm run test:last-go` | PASS; importación original, revisión offline, edición, transporte, exportar/reabrir y STOP real | WAV real en el navegador; voz/ASR sintéticos. No mide acústica ni precisión de ASR. |
| `npm run test:sfx-history` | PASS; importación/revisión local y round-trip | Fixtures WAV sintéticos; historial original intacto; cero llamadas a proveedor. |
| `npm run test:ai-review` | PASS; revisión, aplicar/deshacer y estados de cancelación | Solo modo offline; sin proveedor ni micrófono. |
| `npm run test:dictation` | PASS; cancelación y resultados tardíos | PCM/ASR sintéticos; sin micrófono ni proveedor. |

El comando `npm run qa:codex` incluye `npm run check:windows-syntax`. No se
ejecutó `npm run test:windows-package`: requiere construir y extraer un paquete
Windows con checksum/licencia de Node verificados. Los resultados actuales
verifican la app web en Windows, no el EXE empaquetado.

## Escenario de demo preparado

Usar el show existente `demo/RUNQ_ENSAYO_ES.showcompiler.zip`, basado en el
guion original `fixtures/demo/runq-ensayo-original-es.txt`. Incluye tres cues,
tres WAV locales y pies ligados a referencias L# originales. Las propuestas
del archivo son `MANUAL_MOCK`: material preparado por código local, **no**
salida de Muse ni generación pagada. El idioma del guion no se traduce ni se
reescribe.

### Ejecución segura

1. En un checkout controlado, usar Node.js 20 o posterior e instalar las
   dependencias documentadas en [README](../README.md).
2. Ejecutar `npm run qa:codex` y `npm run test:interface`; para las regresiones
   especializadas, ejecutar también `npm run test:last-go`,
   `npm run test:sfx-history`, `npm run test:ai-review` y
   `npm run test:dictation`.
3. Ejecutar `npm run dev` y abrir la URL local que imprime el servidor
   (en la configuración por defecto, `http://127.0.0.1:5173`).
4. Importar `demo/RUNQ_ENSAYO_ES.showcompiler.zip` desde la interfaz. Comprobar
   el guion fuente, los tres pies, los WAV disponibles y la etiqueta/procedencia
   manual de las propuestas.
5. Revisar y modificar una propuesta; mantener el control humano de aprobación.
   Para una demostración sin inferencia, identificarla verbalmente como
   propuesta local de ejemplo.
6. Inspeccionar las propiedades de cue y la forma de onda. En un ensayo
   supervisado, comprobar IN/OUT, fade y loop sin cambiar el comportamiento
   del transporte.
7. En Ensayo, dejar Autopiloto desarmado al principio. Si se demuestra voz real,
   hacerlo solo con micrófono y salida física comprobados y supervisión del
   operador. NEXT solo posiciona; GO ejecuta; STOP individual detiene el cue
   seleccionado y STOP ALL detiene el transporte local.
8. Exportar el show, reabrir el ZIP en el navegador y comprobar texto original,
   cues y archivos de audio. Repetir GO/STOP con la red desconectada si se
   realiza la aceptación manual.

La batería automatizada no reemplaza los pasos que exigen micrófono, escucha o
intervención física. No mostrar como verificada la salida acústica, el
seguimiento de voz real ni la latencia.

## Inventario honesto de capacidades

**Comprobado automáticamente en este corte**

- Navegación entre los espacios y cambio de idioma ES/EN.
- Importación/reapertura de show ZIP con texto original, fuentes L# y bytes de
  audio preservados.
- Revisión offline de propuestas, edición, persistencia y operaciones de
  deshacer/cancelar comprobadas por sus E2E específicos.
- Decodificación y reproducción de WAV con Web Audio en Chrome; NEXT no inicia
  sonido, GO sí, STOP individual detiene el cue y STOP ALL limpia las
  instancias activas.
- Assistant/revisión/dictado en rutas offline y protección contra resultados
  tardíos según las pruebas listadas.

**Disponible, pero no medido como servicio real en esta ejecución**

- Análisis externo con modelo: requiere autorización explícita y una prueba
  real separada. No se hizo aquí.
- Audio generado externamente: no se generó en esta ejecución.
- Reconocimiento de voz y Autopiloto con micrófono: los tests inyectan
  transcripciones sintéticas; no validan ASR en vivo ni falsos GO por hora.
- Operación sonora física: el navegador usa la salida predeterminada del
  sistema. No existe monitor PFL aislado acreditado.
- Enrutamiento multicanal/ASIO, instalador nativo y certificación para
  espectáculos profesionales: no acreditados.

## Capturas y revisión visual

La corrida visual más reciente está en
`artifacts/interface-review/run-1793532790307/`; contiene capturas de los
espacios, incluida Ensayo y Directo, en `1920×1080`, `1366×768` y `900×600`
(también tamaños intermedios). La corrida funcional está en
`artifacts/interface-review/functional-1793532825140/`, con capturas del show
en esas tres resoluciones. Ambas carpetas son evidencia local ignorada por Git,
no forman parte de un paquete público.

- En Directo `900×600`, GO y STOP ALL son visibles en la captura.
- Ensayo `900×600` necesita desplazamiento vertical para alcanzar el panel de
  voz y parte del contenido. En `1366×768`, la lista permanece desplazable y
  STOP individual se comprueba por hit-test y clic real.
- Las capturas son de la interfaz actual. La similitud con los mockups
  aprobados no está certificada y sigue siendo una brecha visual conocida.

## Guion de vídeo de tres minutos

No presentar propuestas `MANUAL_MOCK` como inferencia real. Confirmar primero
duración y reglas oficiales de envío; si no se completa la prueba física de voz,
omitir el claim de reconocimiento en vivo.

| Tiempo | Plano y acción | Voz / afirmación permitida |
|---|---|---|
| 0:00–0:15 | Título y guion original | “RUNQ ayuda a convertir un guion en un plan de cues revisable.” |
| 0:15–0:40 | Importar el show y recorrer L# | “Las referencias se conservan sobre el texto fuente.” |
| 0:40–1:05 | Abrir las propuestas del ejemplo | “Estas propuestas son un ejemplo local etiquetado; no son una respuesta de modelo.” |
| 1:05–1:30 | Revisar, cambiar y aprobar/rechazar | “El operador revisa antes de crear cues.” |
| 1:30–1:55 | Biblioteca, onda y propiedades | Mostrar el WAV local, IN/OUT y fade; no atribuirlo a generación externa. |
| 1:55–2:20 | Ensayo supervisado | Solo usar voz real si micrófono, ASR y salida se validan en una toma auténtica; de lo contrario mostrar controles desarmados. |
| 2:20–2:40 | Directo: NEXT, GO, STOP individual, STOP ALL | “NEXT posiciona; GO y STOP son controles manuales locales.” Incluir escucha real solo tras aceptación física. |
| 2:40–2:55 | Exportar y reabrir el ZIP | “El show exportado conserva proyecto y audio para reabrirlo localmente.” |
| 2:55–3:00 | Cierre | “Prototipo de navegador; la salida física requiere comprobación del operador.” |

## Aceptación manual pendiente antes de congelar

- [ ] Fresh clone del SHA que se seleccione; instalación y arranque sin claves.
- [ ] Importar guion y comprobar visualmente que no cambia texto ni líneas L#.
- [ ] Revisar el estado y procedencia `MANUAL_MOCK`; aceptar, rechazar y modificar
      sin presentar un resultado simulado como IA real.
- [ ] Probar un archivo de audio conocido a volumen bajo; confirmar salida,
      latencia percibida y silencio efectivo después de STOP/STOP ALL.
- [ ] Comprobar IN/OUT, fade y loop por cue; validar el resultado escuchando.
- [ ] Probar NEXT y selección sin GO; verificar GO explícito, STOP individual y
      STOP ALL bajo supervisión, sin otro dispositivo activo.
- [ ] Con micrófono real, medir falsos positivos/negativos en varios niveles de
      ruido antes de mostrar seguimiento o Autopiloto como función operativa.
- [ ] Interrumpir/reanudar el ensayo y comprobar que error, cancelación, cambio
      de proyecto y STOP ALL no reinician audio automáticamente.
- [ ] Exportar/importar el ZIP y repetir la comprobación de medios desconectado
      de red.
- [ ] Probar los dispositivos, permisos y volumen en el PC de demostración.
- [ ] Revisar de nuevo GO/NEXT/STOP ALL, teclado, scroll y legibilidad en las
      resoluciones de grabación; revisar visualmente frente a los mockups.
- [ ] Verificar el paquete Windows extraído si se decide distribuirlo; el test
      del paquete no forma parte de este corte.
- [ ] Confirmar reglas, duración, licencias, privacidad y destino de publicación.

## Cambios de este corte

- `src/ui/runq-interface.css`: área mínima suficiente en Ensayo de escritorio
  para evitar que la lista de cues se quede a 0 px.
- `tools/rehearsal-auto-browser-e2e.mjs`: diagnóstico de hit-test, scroll real
  al STOP y comprobación de que la lista tiene altura; captura local en fallo.
- `tools/last-go-browser-e2e.mjs`: desplaza el STOP a la vista antes de medir
  su hit-test; el clic posterior sigue siendo real.

Durante esta continuación no se modificaron ledger, presupuestos, semántica del
transporte, archivos ZIP de demo ni configuración de llamadas externas.
