# RunQ — Protocolo operativo de campañas masivas (Meta / Baseten / Modal / Voz)
**v1 · 29 octubre 2026 · Hackathon Meta AI Developer 2026**

**ESTADO: PRESUPUESTO DE USD 30 APROBADO EN CONVERSACIÓN; SIN SOLICITUDES PAGADAS EJECUTADAS.** Este documento no puede lanzar API ni hacer que Codex ejecute pagos. Contrato de campaña: fixtures/qa/mass-campaign-manifest-v1.json. Preflight: tools/mass-campaign-preflight.mjs (sin red). Las métricas anteriores de V8 no certifican V9.

## 1. Para qué vamos a gastar créditos

Queremos medir la **fidelidad teatral y robustez** de RunQ, no solo volumen de peticiones: si identifica el sonido correcto en la línea correcta, evita sugerencias falsas, respeta la revisión humana, edita el cue indicado y ejecuta solo GO autorizado. El ensayo con actores que repiten o saltan líneas es la principal diferencia para el vídeo, por lo que merece un bloque propio de pruebas.

Separar siempre: A) errores de proveedor/modelo; B) validación JSON y referencias; C) transformación de propuestas en DRAFT; D) editor y transporte; E) ASR/matching/GO de ensayo.

## 2. Tamaño y reserva propuestos

| Proveedor | Solicitudes objetivo | Piloto | Calibración | Campaña | Reserva máxima PROPUESTA |
|---|---:|---:|---:|---:|---:|
| Meta Muse Spark 1.3 Standard | 160 (100 análisis, 60 instrucciones conversacionales) | 8 | 32 | 120 | USD 12 |
| Baseten Muse Spark Open | 100 (guiones en casos pareados) | 5 | 20 | 75 | USD 8 |
| Modal SFX | 20 (generación sonora) | 2 | 4 | 14 | USD 8 |
| Muse Voice Transcribe | 100 (transcripción ES/EN) | 10 | 20 | 70 | USD 2 |
| **Total** | **380** | **25** | **76** | **279** | **USD 30** |

Además: 40 comandos locales de edición conversacional y 20 recorridos de extremo a extremo con respuestas simuladas. Estos **no** suponen llamadas al proveedor.

USD 30 es una **propuesta** de autorización global, no un límite de facturación garantizado. La acción de aprobar un presupuesto, así como la ejecución, NO existe en el preflight y habrá que diseñarla tras confirmar tus topes. Todas las solicitudes, incluidas fallidas e inciertas, cuentan contra el máximo. Si hay menos datos nuevos o no hay tiempo para corregir, reducir volumen.

### Precios públicos verificados (29 oct 2026)

Meta: https://dev.meta.ai/docs/pricing-rate-limits
- Muse Spark 1.3 Standard: USD 1,25/M tokens de entrada, USD 0,15/M entrada cacheada, USD 4,25/M tokens de salida. Muse Voice Transcribe: USD 0,18/hora.
- No cambiar a Contributor sin autorización específica: su precio inferior implica permiso de utilizar contenido y respuestas para entrenar modelos futuros.

Baseten: https://www.baseten.co/pricing/
- Muse Spark Open: USD 1,25/M entrada, USD 0,15/M entrada cacheada, USD 4,25/M salida.

Modal: https://modal.com/pricing
- A10 GPU: USD 0,000306/s. Factura carga/ejecución y puede facturar contenedor caliente; CPU/memoria, región, salida de red y plan también pueden afectar. Los presupuestos por entorno difieren por plan.

**Ejemplo no vinculante**: 2500 tokens de entrada + 1000 de salida por solicitud = USD 0,007375. Así 160 solicitudes Meta ~USD 1,18 y 100 Baseten ~USD 0,7375. 30 min de voz ~USD 0,09. 20 tareas Modal A10 de 60 s ~USD 0,3672 SOLO GPU. NO tomar esas cifras como importe final: el límite pre-reservado puede ser bastante superior por tokens máximos, razonamiento, contenedor encendido, errores e incertidumbre. Panel del proveedor = referencia de facturación.

## 3. Puerta cero: NO empezar sin todo esto

1. **Congelar versión**: SHA exacto de RunQ en una copia aislada del repositorio. Sin cambiar la rama activa de V9 a mitad de la campaña.
2. **Validar suite local**: qa:codex, Chrome E2E relevante y tests del propio laboratorio.
3. **Aprobar gold**: el corpus actual son 9 guiones, 13 ventanas, 49 eventos PROVISIONALES. Revisar cada caso clave con operador, resolver dudas de sonido artístico y marcar gold humano. Separar holdout no usado para ajustar prompts, al menos un guion ES y uno EN.
4. **Límite por proveedor**: el usuario confirma importe total y sublímites en USD; también verifica saldos, límites y avisos en dashboards Meta, Baseten y Modal.
5. **Ledger ÚNICO entre clones**: fuera de Git, lock exclusivo de todos los procesos, reservas previas, registros append-only, límites globales. El registro Meta existente de USD 2 es **por carpeta**. Baseten no tiene aún ledger monetario centralizado. Modal limita llamadas en su laboratorio a 3 por ejecución y presupuesto estimado.
6. **No duplicar peticiones**: request ID y clave de idempotencia local. Un timeout o corte de conexión = estado UNKNOWN, no reintento automático; reconciliar factura/proveedor/journal primero.
7. **Privacidad**: claves en servidor local, nunca en navegador o logs. Guiones originales con derechos claros. Voz grabada con permiso y almacenamiento local seguro. Mantener modelo Meta Standard salvo decisión explícita.
8. **Aislamiento acústico**: campañas desatendidas NO pueden ARM ni disparar PA física; usan audio simulado o salida en silencio. Micrófono + GO real es una prueba manual supervisada.
9. **STOP ALL y parada**: probar que STOP ALL siempre silencia y desarma; el ejecutor debe poder detener toda la campaña sin corromper journal ni enviar nueva solicitud.
10. **Envío controlado**: un proveedor y una solicitud a la vez al inicio, límites de tasa, timeouts y presupuestos. No compensar fallos con peticiones adicionales sin revisión.

Hoy el preflight debe informar BLOQUEADO. No es un error: significa que la ejecución masiva no puede hacerse con seguridad todavía.

## 4. Diseño de muestras y comparación Meta–Baseten

- Misma línea L#, ventana de guion, idioma, escena, tipo de producción y modo de creatividad en cada pareja. La igualdad del texto final del prompt puede no ser completa porque Meta soporta JSON schema estricto y Baseten requiere instrucciones textuales de estructura; medir y documentar esa diferencia.
- Modos literal, balanced, expressive se analizan por separado. Mezclar varios modos en un F1 agregado puede falsear resultados.
- Dos personas anotan los casos P0. Evento gold: línea, transporte PLAY/STOP/CONTINUE/SILENCE, cueKind FX/AMBIENCE/MUSIC/VOICE/etc y basis EXPLICIT o SUGGESTED. Los opcionales artísticos tienen rúbrica separada; no castigar como obligatorio un efecto creativo.
- Métricas: TP/FP/FN, precisión, recall, F1 (micro y macro por guion), respuesta completa, JSON correcto, ausencia de IDs inventados, falsos PLAY en diálogos o negaciones, errores STOP/CONTINUE, latencia p50/p95, coste/token.
- Comparación solo con **casos pareados completos**. Rechazo, timeout, truncado, JSON inválido = INCOMPLETE, NO cero cues. No comparar una sola muestra A con otra B no equivalente.
- Versionar código, modelo, prompt, parámetros y gold. Aleatorizar o alternar orden de proveedores para neutralizar la carga temporal. Intervalo de confianza por remuestreo de **guiones/casos**: no tratar repeticiones del mismo guion como muestras independientes.
- La revisión de 10–20 discrepancias importantes tras calibración prevalece sobre maximizar cifras sintéticas. No tocar holdout para corregir un prompt antes de la medición final.

## 5. Edición conversacional: 100 instrucciones

40 casos locales sin IA + 60 llamadas Meta (30 español y 30 inglés). Deben incluir:
- gain, fade IN/OUT, retardo, trim, loop/repeticiones, notas y nombres;
- edición de varios campos, correcciones "mejor 4 segundos", aclaraciones, negaciones y solicitudes fuera de alcance;
- un cue seleccionado junto a otro cercano con nombre parecido;
- peticiones maliciosas de GO/STOP ALL directo o cambio de audio/hardware;
- respuestas inválidas, claves extra y parámetros fuera de límites.

Oráculo: status PATCH/CLARIFY/UNSUPPORTED, estado del cue ANTES y DESPUÉS, diff exacto, revisión del operador, ningún efecto en cues no seleccionados. La salida IA **nunca** ejecuta ni confirma el cambio por sí sola. Medir acierto exacto, aclaraciones correctas y tasa de mutación indebida.

## 6. Modal: 20 SFX con revisión perceptiva

20 casos distribuidos en impactos, ambientes, objetos, capas/espacios y variantes ES/EN. Comparar semilla repetida para cold/warm y prompts cambiantes.
- Validación automática: WAV/PCM, hash, frecuencia, canales, duración, peak/clipping, silencio indebido, procedencia y tasa de archivos aceptables.
- Revisión por dos humanos, a ciegas, con nota 1–5: correspondencia al prompt, naturalidad, artefactos, usabilidad teatral y continuidad para loop. **No atribuir calidad artística al mero éxito del checksum.**
- Registrar tiempo cold-load, cola, generación, WAV listo, coste estimado vs panel Modal. No reintentar timeout incierto. Audios rechazados no crean cue.
- La configuración actual del piloto limita trabajo paralelo/día. Reconciliar trabajos antiguos pendientes antes de subir volumen. Esta fase no debe afectar al rendering del vídeo.

## 7. Voz: 100 frases y seguridad de autopiloto

50 frases ES + 50 EN, con diferentes actores/acentos voluntarios, silencio, ruido, repeticiones, frases ambiguas, escenas saltadas y retrocedidas. El corpus se etiqueta con transcripción gold, pie objetivo y eventos esperados.
- ASR: WER, CER, latencia p50/p95, tasa de transcripciones finales válidas.
- Matcher: tasa de cue correcto, falsos GO por oportunidad y por hora, omisiones, dobles GO, reacción a parcial/stale/ambiguo, saltos sin reproducir intermedios.
- Player: sin ARM=0 GO; STOP ALL silencia y desarma; error de red devuelve al control manual.
- Para vídeo, diferenciar **micrófono real con ARM y sonido audible** de Chrome con ASR simulado. El resultado del segundo NO demuestra reconocimiento en directo.

## 8. Puertas GO / NO GO entre fases

**Piloto**: 25 solicitudes en total (8+5+2+10). No pasar si no vemos integridad de registros, coste real en dashboard, credenciales válidas, referencias correctas y cero P0. Detener y revisar todos los problemas de formato.

**Calibración**: 76 solicitudes (32+20+4+20). Revisar discrepancias con humanos; ajustar un único factor por PR y ejecutar regresiones. Reconfirmar presupuesto y latencia antes de aumentar volumen.

**Masiva**: 279 solicitudes (120+75+14+70). Solo si el vídeo tiene material principal protegido y la campaña aporta valor real adicional. Se puede cancelar sin perder la parte ya recogida.

**Parada P0 inmediata**: GO desarmado, STOP ALL no efectivo, script/prompt privado expuesto, referencia inexistente aceptada, cargo incierto/duplicado, journal o lock rotos, cambio de gold a mitad del experimento, dos respuestas consecutivas inválidas, presupuesto reservable superado, salida sonora hacia hardware sin autorización.

Objetivos preliminares de aceptación (sujetos a revisión humana tras piloto): 0 P0; 100% referencias L# aceptadas válidas; al menos 95% de respuestas de proveedor estructuralmente completas; 90% recall sobre efectos explícitos obligatorios; >=90% acierto exacto de edición conversacional; cero falso GO en la batería cerrada de seguridad. **No** extrapolar esos 0 fallos a fiabilidad perfecta en el mundo real.

## 9. Informes por corrida y trazabilidad

Cada ejecución tendrá directorio único, sin sobreescritura: SHA de programa/guion/gold; proveedor/modelo/versión/idioma; modos; timestamps monotónicos; duración; solicitud emitida/completada/incierta; parámetros no sensibles; tipo de error; resumen de tokens y coste estimado/real; resultados de scoring y decisión de revisión humana. Separar evidencias: UNIT_SIMULATED, REAL_PROVIDER, REAL_MIC, REAL_OPERATOR, CHROME_FAKE_AUDIO. Datos personales, scripts privados, tokens y audio crudo NO se suben a GitHub.

Reportar ratios con denominador, intervalos y N de casos independientes; comprobar calidad de gastos contra panel del proveedor. Nunca usar fixtures sintéticos para afirmar que Meta o Baseten ganaron un experimento real.

## 10. Calendario compatible con el vídeo

29 oct: protocolo/fixtures/primer guion audiovisual. 30 oct: tests mínimos, gold y materiales, piloto solo si se habilitan gates. 31 oct: **primer rough cut de vídeo completo**. 1 nov: SHA congelado y captura real de autopiloto. 2 nov: QA y fase masiva solo si no retrasa vídeo. 3 nov: solucionar P0 y export final. 4 nov: margen para entrega.

**Prioridad de entrega**: vídeo real y legible > seguridad del producto > fiabilidad del flujo > número máximo de peticiones.

## 11. Comandos disponibles en esta rama

  npm run eval:mass:plan

Genera artifacts/mass-campaign-prep/preflight.md y preflight.json sin red ni costes.

  npm run eval:mass:preflight

Contrato del ledger (offline): npm run eval:mass:test.

Preflight NO-LIVE con salida 2 si faltan gates (esto es lo esperado). Cualquier nombre eval:mass:live es deliberadamente **inexistente**. Ninguno de estos comandos autoriza o consume créditos.

No ejecutar 380 solicitudes copiando manualmente los scripts históricos para eludir los topes. La siguiente implementación deberá conectar todos los proveedores a un ledger central único, auditable y seguro.

### Prototipo del ledger central (todavía NO conectado a proveedores)

Se ha implementado de forma aislada src/qa/globalSpendLedger.mjs. Usa una ruta canónica por usuario fuera de los clones (Windows: %LOCALAPPDATA%\\RunQ\\Evaluation\\global-spend-v1.json), un lock exclusivo entre procesos, reserva previa en microdólares, límites por proveedor y control de IDs duplicados. Un importe en estado UNKNOWN sigue reservado: nunca se devuelve automáticamente. El prototipo se niega a crear un fichero de autorización por sí solo, y no puede llamar a una API. Se valida con test/global-spend-ledger.test.mjs; todavía falta enlazarlo con cada ejecutor de proveedor, presupuestar cada petición y aportar un procedimiento de aprobación local.

## 12. Referencias

NIST Generative AI Profile: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence
Meta pricing/rate limits/data modes: https://dev.meta.ai/docs/pricing-rate-limits
Baseten cloud pricing: https://www.baseten.co/pricing/
Modal GPU billing/idle: https://modal.com/pricing

**Este protocolo y su reserva propuesta no son factura ni pruebas ejecutadas.**
## 13. Piloto autorizado: implementación operativa separada

El usuario aprobó el 29/10/2026 el reparto exacto de **30 USD** (12 Meta / 8 Baseten / 8 Modal / 2 voz). El manifiesto versionado permanece deliberadamente en estado DRAFT: nunca se usa como autorización remota o local por sí solo. El operador crea una única autorización en su propio PC con `npm run eval:budget:init` y comprueba el estado con `npm run eval:budget:status`. Esto no consume créditos.

**Nuevo ejecutor piloto (NO campaña completa):** `npm run eval:pilot -- --provider meta --requests 1 --case hotel-door --live --ack-paid --dashboard-verified` (Baseten puede sustituirse por `--provider baseten`; Modal por `--provider modal` sin `--case`). Esos comandos **sí envían solicitudes reales** cuando las claves, el estado del proveedor, el presupuesto local y la comprobación del panel permiten hacerlo. El flag `--dashboard-verified` exige que el operador haya revisado facturación, saldo y límites reales; nunca sustituye los controles del proveedor.

La fase piloto limita acumulativamente 8 peticiones Meta, 5 Baseten y 2 Modal. Los 100 ensayos de voz siguen bloqueados hasta contar con corpus de grabaciones y ejecutor pagado instrumentado. Los módulos de seguridad guardan reservas fuera de Git, ejecutan una sola llamada por vez, bloquean presupuestos/casos duplicados y mantienen las reservas en caso de resultado incierto. Modal usa un journal por usuario compartido entre copias nuevas del laboratorio; los scripts antiguos independientes NO quedan protegidos de forma retroactiva.

**Guía exacta Windows:** `docs/RUNQ_PAID_PILOT_OPERATOR_RUNBOOK_2026-10-29.md`. No utilizar todavía los comandos de campaña masiva ni fusionar esta PR sin revisar el CI y el primer piloto real.
