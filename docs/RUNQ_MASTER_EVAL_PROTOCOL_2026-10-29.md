# RunQ — Protocolo maestro de validación V9

**29/10/2026. Estado: planificación, NO resultados de nuevas campañas.**

## Principios

El catálogo canónico está en test/fixtures/eval-campaign-catalog.json: **94 escenarios**. Los 94 son especificaciones, no tests superados. P0 es fallo de seguridad, pérdida de datos, ejecución accidental o evidencia crítica del vídeo; P1 cubre fidelidad/experiencia; P2 es mejora opcional. automation=existing significa que el repositorio tiene un test relacionado, NO que cubra todas las métricas. automation=planned y fixture=TO_AUTHOR son trabajo pendiente. Las etiquetas de evidencia futuras deben distinguir UNIT_SIMULATED, CHROME_FAKE_AUDIO, CHROME_REAL_WAV_SYNTHETIC_ASR, REAL_MIC, REAL_PROVIDER, REAL_OPERATOR y UNVERIFIED. Las 584/584 pruebas Node y los 4 smoke Chrome validados en logs locales pertenecen a V8, no certifican la rama V9.

## Fases y seguridad

| Etapa | Permitido | Aplazado |
|---|---|---|
| 29–31 oct, preparación | Tests, oráculos, fixtures, planificación, dry-run | Peticiones repetidas de pago |
| Por módulo terminado | Sintaxis, unit tests y Chrome sin API | Campaña completa |
| Congelación de vídeo | SHA fijo, recorrido reproducible, guiones gold revisados | Cambios de UX que invalidan capturas |
| Validación real autorizada | Meta, Baseten, Modal y micrófono con presupuesto | Sin consentimiento, reintentos ocultos |
| Entrega | Cero fallos P0 conocidos en recorrido de demo, MP4 revisado | Funciones nuevas no esenciales |

**Comandos de la rama de evaluación, todavía NO fusionada:**

| Comando | Comportamiento |
|---|---|
| npm run eval:offline | Plan gratuito, sin ejecutar |
| npm run eval:ai -- --provider meta --runs 100 | Solo plan de Meta |
| npm run eval:ai -- --provider baseten --runs 100 | Solo plan de Baseten |
| npm run eval:ai -- --provider modal --runs 20 | Solo plan de Modal |
| npm run eval:ai -- --provider voice --runs 20 | Solo plan de ASR |
| npm run eval:full -- --runs 20 | Solo plan de pruebas locales |
| npm run eval:video | Plan de pruebas de capturas |
| npm run eval:report | Inventario, no precisión real |
| npm run eval:cli:test | Tests unitarios del planificador |
| npm run eval:offline -- --execute-offline | Ejecuta qa:codex local explícitamente |
| npm run eval:full -- --runs 1 --execute-offline | qa:codex y siete Chrome E2E locales |
| npm run eval:video:smoke | Siete capturas de layout V9, no una demostración real |

El ejecutor nuevo **NO** admite live, ack-paid ni claves de proveedor. No toca los comandos separados de campañas existentes. El indicador de 100 peticiones planeadas debe llevar completed=0 y providerCalls=0.

## Gold para guiones y comparación Meta/Baseten

El log anterior registró 9 guiones originales, 13 ventanas y 49 eventos anotados en el corpus del seminario; el gold sigue siendo provisional. No mezclarlo con otros ocho escenarios de negativos acústicos.

1. Congelar SHA de cada guion, anotaciones y versión de las instrucciones. Utilizar textos con derechos claros.
2. Etiquetar eventos por referencia L#, transport PLAY/STOP/CONTINUE/SILENCE, tipo de cue y fundamento explícito/opcional; aceptar que no todo ambiente opcional tiene una única interpretación.
3. Dos revisores humanos en P0, resolución y versionado de discrepancias.
4. Separar corpus de desarrollo del holdout final; no ajustar prompts después de ver el holdout.
5. Ejecutar las mismas ventanas, contexto, idioma, recursos permitidos y gold con ambos proveedores. Solo comparar pares realmente completados.
6. Mantener respuestas inválidas, timeouts, truncados, rechazos y JSON malformado como NON_COMPLETED; no fingir que significan cero cues.
7. Prohibir que un modelo invente líneas L#, IDs de audio, acciones de transporte o llamadas a herramientas fuera del contrato.

**Métricas:** precision = TP/(TP+FP), recall = TP/(TP+FN), F1 armónico; exact event match por L#/transport/tipo/fundamento; false PLAY en diálogo o negaciones; alucinación L#; STOP confundido con PLAY; deduplicación; omisiones explícitas; completion rate; latencia p50/p95; tokens, estimación y gasto real. Reportar intervalos o dispersión entre repeticiones y casos pareados. No declarar ganadores por un solo F1 sintético.

**Objetivos P0, no resultados:** cero GO generado sin aprobación, cero referencias inválidas aceptadas, cero PLAY en el conjunto cerrado de negativos de seguridad. El umbral de calidad teatral requiere revisar el gold antes de fijar una cifra.

## Biblioteca, sonido y cue editor

| Familia | Escenarios | Oráculo |
|---|---|---|
| Archivos múltiples | WAV, MP3, OGG y ficheros corruptos mezclados | Los buenos se importan sin pisar archivos existentes |
| Comprimidos | ZIP deflate, 7z, RAR, rutas anidadas | Firma correcta, límites de expansión, no path traversal |
| Audio grande | WAV largo, estéreo, miles de recursos | Medir memoria RSS y carga; no asumir compatibilidad |
| Arrastrar audio | 1/2/20 archivos, zonas inválidas | Orden estable, nuevos cues correctos, nunca GO al soltar |
| Waveform | PCM conocido, estéreo, silencio | Picos y trims correspondientes a bytes reales |
| Edición | Fades, loops, repeats, trim, pan, multilayer | Tiempos exactos y fuente inmutable |
| Preview | Múltiples cues y STOP ALL | No modifica la cola preparada, no deja audio colgado |
| Persistencia | Exportar, reabrir, ZIP manipulado, JSON legacy | Rollback atómico y preservación de estado |
| Conversacional | ES/EN, corrección, aclaración, aceptación | Solo cambia el cue elegido con aprobación explícita |

Un E2E Chrome con AudioContext simulado no demuestra seguridad acústica real, niveles dB, ASIO ni latencia de salida de hardware.

## Voz y autopiloto de ensayo

Dividir el flujo en cuatro capas **independientes**: transcripción ASR, matcher con contexto, política de ARM/disarm y transporte GO protegido.

Fixturas a producir, con consentimiento: 50–100 frases ES/EN, variantes de acento, ambiente tranquilo y con ruido, solapamientos, homófonos, pausas; transcripción gold, timestamps y pie correcto. No registrar conversaciones privadas ni enviar audio sin permiso.

**Métricas:** WER/CER, precisión del pie seleccionado, falsos GO por hora, dobles disparos, aciertos en saltos/retrocesos, latencia pie→inicio de audio p50/p95, recuperación tras STOP/disconnect. Casos P0: OFF por defecto; sin ARM no hay GO; ASR parcial, tardío, duplicado o ambiguo no dispara; STOP ALL desarma y silencia; al cambiar proyecto se invalida el contexto. El test rehearsal-auto-browser-e2e utiliza WAV reales y ASR sintético: **no** certifica el micrófono real.

## Modal y proveedores

Meta/Baseten: generar sugerencias y, según implementación final, editar cues conversacionalmente; evaluar semántica contra gold pareado. Modal: generar audio, validar SHA-256/WAV/procedencia, cola, cancelación, idempotencia, duración, cold start y coste; la calidad artística requiere escucha humana ciega, no solo una firma RIFF. Voz: WER/CER y tasa de falsos GO, no solo transcripción correcta.

Los budgets deben estar acotados **entre clones**, no solo por copia del repositorio: el ledger Meta actual es por directorio y no garantiza límite global. Usar consentimiento explícito, límite de peticiones, presupuesto central y panel proveedor. Nunca reintentar cargos en estado incierto automáticamente.

## Evidencia de calidad

Por cada campaña ejecutada (más adelante): SHA de código/guion/gold, versión de Chrome/Node, proveedor+modelo+parámetros, caso, idioma, repetición, latencia monotónica, costes observados vs estimados, fallo tipado y autorización de origen. Informes append-only por run. No subir secretos, respuesta cruda del modelo ni guiones privados a GitHub. Un inventario de artefactos no significa que exista medición real de calidad.

## Validación del vídeo

Las 11 escenas S01–S11 están conectadas con los criterios del catálogo. El test eval:video:smoke guarda capturas V9 1920x1080 con etiqueta **UI_LAYOUT_ONLY_NOT_FUNCTIONAL_PROOF**. No presenta un mock como ejecución real. S04 exige Meta real autorizado o rotulación ilustrativa; S05 revisión humana; S06 WAV/onda real; S08 micrófono real con ARM y audio o cambiar narración a modo asistido; S09 GO/STOP ALL real audible; subtítulos y duración según reglas finales verificadas.

**Puerta de congelación:** guion → Meta → aceptación → audio → waveform → ensayo → GO. Solo entrar en vídeo con recorrido real reproducible.