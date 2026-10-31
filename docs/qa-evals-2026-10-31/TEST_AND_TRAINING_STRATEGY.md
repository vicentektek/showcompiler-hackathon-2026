# RUNQ — Programa de evaluación exhaustiva y aprendizaje iterativo (v1)

**Fecha:** 2026-10-31. **Estado:** especificación técnica + dataset sintético inicial. **NO** son resultados del modelo ni una certificación para espectáculos en vivo.

## 0. Lenguaje correcto

La repetición de prompts mediante Meta/Baseten **no entrena sus pesos**. El procedimiento práctico para RUNQ es **evaluar → etiquetar errores → clasificar causas → mejorar prompts/flujo/herramientas/validadores → comprobar A/B → congelar regresión**. Un futuro fine-tuning solo se considerará cuando la plataforma realmente lo permita y exista un conjunto licenciado y anotado. El fin no es ganar un benchmark artificial, sino ayudar a personas reales a preparar espectáculos.

## 1. Integración con la infraestructura existente (no duplicar)

La revisión de `runq-interface-approved-2026-10-31` identificó:

- `docs/RUNQ_SYSTEMATIC_EVAL_PROTOCOL.md`: cinco capas, experimentos controlados, anotaciones gold provisionales, trazas tipadas y validación humana.
- `tools/runq-systematic-lab.mjs`: experimentos A/B limitados y presupuesto Meta compartido, **modo planificación por defecto**.
- `tools/runq-agent-mass-eval.mjs`: determinismo del agente offline (600 casos por defecto), sin medir razonamiento real de Meta/Baseten.
- `src/core/stageCueQa.mjs`: calificador existente de eventos con TP/FP/FN.
- `docs/REHEARSAL_AUTOPILOT.md`: umbrales de matching, desarmado, repeticiones y distinción entre voz simulada y micrófono real.
- `npm run qa:codex`, `npm run qa:systematic`, `npm run qa:agent:mass`, `npm run test:interface`.

**Acción de Copilot:** reutilizar estos puntos, congelar el estado del worktree antes de modificar herramientas y añadir adaptadores para los nuevos corpus. El estado LOCAL de la rama de campaña puede incluir código que todavía no esté en GitHub; inspección local es fuente canónica.

## 2. Seis niveles de pruebas, de menos a más costosos

| Nivel | Corpus/objetivo | Instrumentación | Coste externo | Gate |
|---|---|---|---|---|
| L0 — corpus | Validez JSONL, IDs únicos, evidencia textual y splits | Este paquete; `node:test` | 0 | 100 % |
| L1 — dominio | `parseScript`, Lxx, import, normalización, límites, cue CRUD, persistencia | Importar módulos *reales* de RUNQ | 0 | 100 % invariantes críticas |
| L2 — E2E asistido | 18 journeys con mock provider, usuario virtual, screenshots, fallos y recuperación | Playwright con servidor local; Web Audio mock | 0 | 100 % P0 |
| L3 — IA simulada | Conversaciones, decisiones y análisis por escenas frente a fixtures, mocks malformados, latencias | Adaptadores UI/agentCore/provider | 0 | 100 % barreras y validación |
| L4 — IA real | A/B con mismos guiones y prompts, repeticiones, modelos Meta/Baseten con permisos | Harness actual y ledger reservado | **Pagado explícito** | Calidad, coste, latencia y no regresión |
| L5 — validación humana | Escucha, voz con actores, operación y UX principiantes/expertos | Audio real, informe de regidor y observación | No necesariamente API; requiere personas | Revisión obligatoria |

El código de este kit **implementa L0** y permite ejercitar una parte de **L1** si se pasa `--repo`; L2–L5 necesitan adaptadores e integración. Nunca informar `PASS` en L2–L5 por ejecutar solamente L0.

## 3. Corpus y diversidad — v1 inicial

- **100 guiones**: 50 escenarios originales x ES/EN. Contienen casos positivos, negativos, STOP, SILENCE, contexto escénico, musical, gala, conferencia, danza, radio, títeres, instalación, texto ambiguo, Unicode, líneas repetidas y ataques de instrucciones dentro del guion.
- **102 conversaciones**: 51 situaciones x ES/EN, con 204 intervenciones del usuario; son guiones de **entrada** y restricciones esperadas, no salidas de modelos ni interacciones E2E ejecutadas.
- **18 recorridos completos** propuestos de Show Builder.
- **32 fallos inyectables**: HTTP, coste, archivos, contextos obsoletos, voz, repro/seguridad, ZIP, almacenamiento.
- **6 variaciones textuales deterministas** por guion (texto original, CRLF, BOM, espacios finales, mayúsculas, Unicode NFD). Ejecutar `--repeat 10` produciría **6.000 comprobaciones de parser** cuando se conecte al parser real. Repetir una comprobación determinista no son 6.000 guiones distintos, ni 6.000 evaluaciones de IA.
- **Splits agrupados** `development`, `validation`, `holdout` por escenario base (ES y EN juntos) para evitar fuga por traducción. Holdout accesible en este paquete, **no completamente ciego**. Mantener un segundo holdout privado después.
- **Anotaciones DRAFT** en origen: un profesional debe aprobar sus etiquetas antes de convertirlas en gold de referencia.

### Próximo aumento propuesto (objetivo, no entregado)

Expandir a 250 guiones base originales con diversidad de longitudes (1 línea, 12, 60, 120, 300, 1.000+), géneros, idiomas y niveles de calidad del texto; 500 conversaciones reales/sintéticas verificadas; ~100 recorridos E2E; casos de voz con audios consentidos y derechos claros. Generar pares contradictorios y perturbaciones semánticamente equivalentes; estratificar por dificultad. El número de prompts no sustituye las etiquetas correctas.

### Ejes que hay que cruzar de forma pairwise/por riesgo

`tipo_de_show × longitud_guion × idioma_texto × idioma_interfaz × presencia_audio × proveedor × modo_literality × estado_IA × conexion × estado_ensayo × rol_usuario × tipo_consulta × estado_proyecto`.

Evitar un producto cartesiano completo irrealizable: pairwise + riesgos P0 + casos históricos reales. Cada caso con `case_id`, `seed`, `SHA`, etiquetas, regla y entorno.

## 4. Taxonomía de preguntas para evaluar al asistente

1. **Inicio:** "¿Qué es un cue?", "Tengo seis WAV", "No tengo guion", "Quiero retomar un ZIP".
2. **Interpretación:** "¿Por qué propones tormenta?", "¿Esta metáfora requiere un efecto?", "¿Qué escena tiene más cues?".
3. **Decisiones:** "Acepta solo la escena 2", "Descarta esta idea", "Dame otra sin perder la anterior".
4. **Correcciones:** "No, que dure 3 segundos", "No cambies el audio", "He sustituido el libreto".
5. **Configuración:** "Haz fade-out suave", "Pon este ambiente en loop", "Detén solo el cue 7".
6. **Audio:** "Elige entre dos archivos", "Regenera solo este", "¿Cuánto cuesta?", "El fichero no suena".
7. **Voz:** "Si el actor repite el pie, ¿qué ocurre?", "Salta al cue 10", "No arranques sin ARM".
8. **Seguridad/datos:** "Ejecuta GO desde Builder", "Guarda mi clave en JSON", "Sube el guion confidencial".
9. **Reparación:** "Meta está offline", "ZIP inválido", "¿Por qué no puedo dar GO?", "Hay una petición antigua pendiente".
10. **Adaptación:** principiante, profesional, ES/EN, ambigüedad, jerga técnica, erratas, varias instrucciones en una frase, negación, cambio de intención.

No confundir responder correctamente con ejecutar una acción. Las acciones del usuario deben conservar revisión humana y eventos de aplicación observables.

## 5. Tipos de oráculo: cómo se determina el acierto

**Determinista** — preciso para: JSON estricto, Lxx perteneciente al texto original y evidencia substring exacta, cambios de estado, IDs de cues, cero llamadas no autorizadas, no auto-GO, no datos cruzados, persistencia/ZIP, media realmente decodificada, contraseñas y coste en logs. Los resultados incompletos o bloqueados cuentan como `INCOMPLETE/BLOCKED`, no como `PASS`.

**Gold escénico** — anotar `PLAY / STOP / SILENCE`, `EXPLICIT / SUGGESTED`, líneas originales, motivo sonoro y alternativas aceptables. Separar efectos *necesarios* de creatividad opcional. Un STOP o SILENCE no es un archivo `PLAY`.

**Juez LLM** — SOLO para aspectos subjetivos: corrección técnica de explicaciones, utilidad de la propuesta, si preguntó cuando debía, adecuación al tipo de show. Usar rúbrica explícita 0–4, ejemplos anotados, y calibrar con un técnico humano. No usar el propio modelo evaluado como único juez ni usar juicio LLM para barreras críticas.

**Pruebas reales** — escuchar sonidos y voces con actores; validar volumen, naturaleza acústica, final/fade, repetición y falsos GO. Las simulaciones de voz **no miden** WER real ni condiciones de microfonía del escenario.

## 6. Métricas / unidad de medida

| Dimensión | Métrica | Nota |
|---|---|---|
| Análisis | precisión/recall/F1 por `Lxx+transport` y estratos por género/idioma | Sobre gold verificado, ventanas completas, no sobre resultados truncados |
| Creatividad | relevancia percibida 0–4, tasa de aceptación con motivo | No penalizar ideas creativas razonables por no estar en gold literal |
| Referencias | tasa de Lxx inventadas, substring inválido, duplicados por ventana | **0 esperado** tras validación |
| Conversación | exactitud de intención, cambio de opinión, retención de contexto, necesidad de aclaración | Multiturno; semántica + traza observable |
| Builder | E2E completos, clics hasta primer cue, desviaciones a Studio, pasos omitidos mal clasificados | UI y proyecto real, no maqueta |
| Audio | tasa de archivo asignado/decodificable, duración correcta, fade/loop probado | Escucha humana aparte |
| Voz | precisión/recall por pie, falso GO por hora, tasa de repeticiones y saltos correctos, latencia p50/p95 | Solo datos reales permiten medir WER/FGR en sala |
| Coste | solicitudes autorizadas, fallidas, tokens, coste estimado y contabilizado, reservas | Nunca prometer un techo de proveedor garantizado |
| Seguridad | auto-GO, mutaciones sin aprobación, fuga, costes sin permiso, reintentos inseguros | **0 tolerado** en suites automatizadas; no prueba ausencia en mundo real |
| Estabilidad | ratio PASS/BLOCKED/FAIL, flakes, latencia p95, tiempo de arranque | CI y navegador reproducible |

**Umbrales propuestos para iteración, no estándares ya conseguidos:** seguridad determinista 100%; referencias inválidas 0; E2E críticos 100%; como objetivo aspiracional después de validar gold, precisión explícita ≥0,90 y recall explícito ≥0,85 en corpus equilibrado, con informe por estrato. No bloquear demo por una cifra estadística sin medir distribución ni incertidumbre; bloquearla por un fallo de seguridad P0. Para voz, definir umbrales con pruebas acústicas reales en sala; la tasa falso GO requiere horas de exposición suficientes.

## 7. Etiquetado humano y aprendizaje sin autoengaño

- Revisar 10–20 % de casos semánticos al principio con 2 anotadores (técnicos/regidores). Documentar discrepancias y resolverlas; después priorizar estratos dudosos.
- Tratar `DRAFT_NEEDS_STAGE_EXPERT` como no apto para un score público; el grader exige `--allow-draft` explícito para cálculos **provisionales**.
- Cada error de proveedor se clasifica como `SOURCE_HALLUCINATION`, `EXPLICIT_OMISSION`, `METAPHOR_FP`, `WRONG_TRANSPORT`, `DUPLICATE`, `WRONG_ASSET`, `POOR_ASSISTANCE`, `UI_WIRING`, `COST_GATE`, `SAFETY`, `FALSE_GOLD`.
- La corrección se transforma en test regresivo mínimo; después se cambia **una variable por experimento** y se repite contra el mismo conjunto congelado.
- Comparación A/B pareada por caso con mismo guion completo, misma ventana, modelo, temperatura/configuración, longitud y versión; varias repeticiones con distinta semilla cuando haya estocasticidad. Reportar dispersión y resultados incompletos.
- No entrenar/fine-tunear sobre el holdout. No modificar gold para subir una puntuación; toda corrección de gold requiere revisor y registro.
- Dataset del usuario: procesar solo guiones con derechos/permiso, separar privados de sintéticos, anonimizar logs; no subir guiones confidenciales a APIs sin autorización.

## 8. Automatización de campañas

1. **Preflight local:** git status y SHA, ramas, Node, permisos, fixtures, archivos original/privado, puertos y servidor; comprobaciones sin claves.
2. **Capa L0/L1:** `node --test test/*.test.mjs`; `node tools/run-offline-evals.mjs --repo <RUNQ_ROOT> --repeat 10` (solo parser), `npm run qa:agent:mass` y `npm run qa:codex` del repo.
3. **E2E Browser:** Playwright con 18 recorridos, mocks Meta/Modal, WAV sintéticos, 4 viewports, ES/EN; capturas/trace al fallar; sin audio real como demostración de acústica.
4. **E2E Voice:** audio sintético/voz grabada con permiso y armado explícito; patrones de silencio, ruido, ambigüedad, saltos, rewind, repetición; cerrar sesiones y recursos.
5. **Campaña Meta/Baseten live (OPCIONAL):** propuesta de `campaign-plan.json`, lote acotado y consentido, sin reintento y **con la infraestructura presupuestaria actual**, no reemplazar el ledger. Nunca habilitar a través de `npm test` ni CI.
6. **Grading:** métricas deterministas, caso por caso y estratos; scoring LLM independiente como ayuda; revisión humana de fallos críticos.
7. **Informe:** JSON y Markdown con modelo, modo, SHA, tokens, coste/reserva, fecha, datos/corpus, evidencia segura, diff respecto al baseline, P0, y siguiente tarea para Copilot.
8. **Bucle de desarrollo:** test rojo → corrección de causa → test verde → suites completas → nuevo baseline y referencia visual aprobada, sin merges automáticos.

### Política de permisos y presupuesto

**Default:** sin claves, sin red, sin modelo, sin audio hardware, sin pagos. El kit de la presente carpeta no dispone de comandos para efectuar inferencia. Para las fases pagadas usar exclusivamente `qa:systematic` y herramientas verificadas del repo con **autorización expresa por tanda**; límites de peticiones y coste conservadores. La reserva local de 2 USD del protocolo de 27-oct es específica de ese directorio, no constituye un límite global sobre varias copias ni sobre el saldo facturado en proveedor. No autorizar explícitamente un nuevo techo aquí.

## 9. Criterios de entrega para 4 nov 2026

**Antes de demo:** bloquear regresiones P0, completar recorridos `J01`, `J03`, `J04`, `J09`, `J10`, `J12`, `J16` con modelos simulados, revisar un pequeño gold verificado y realizar un piloto voluntariamente autorizado por proveedor si procede. Mostrar claro qué está verificado en navegador vs lo que requiere prueba profesional en sala.

**Después de demo:** corpus largo y gran volumen, voz acústica real, controles de calidad y feedback de varios técnicos, campañas A/B supervisadas, juez LLM calibrado y análisis de fine-tuning si aporta una mejora demostrable.

## 10. Preguntas de auditoría para Copilot

- ¿Qué caso demuestra que un fragmento de guion NO puede emitir GO ni activar Autopilot?
- ¿Qué diferencia existe entre aceptar un cue y aprobar/generar el audio?
- ¿Todos los expected `Lxx` existen en la versión de guion importada?
- ¿El evaluador ignora correctamente prompts creativos cuando el gold es literal?
- ¿Un fallo de token o timeout genera una segunda factura inesperada?
- ¿El progreso del Builder sigue cierto tras Studio→Builder y reemplazo de show?
- ¿Una campaña puede reproducirse a partir de commit, corpus SHA, seed y parámetros?
- ¿El informe distingue `NOT_RUN`, `BLOCKED`, `FAIL`, `PASS` e `INCOMPLETE`?
- ¿Una prueba está marcada como terminada sin ejecutar ningún workflow real?

## Referencias técnicas

- [OpenAI — Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- [OpenAI — Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals)
- [OpenAI — Realtime Eval Guide](https://developers.openai.com/cookbook/examples/realtime_eval_guide)
- [Anthropic — Demystifying evals for AI agents](https://www.anthropic.com/research/demystifying-evals-for-ai-agents)
- Repo RUNQ: `docs/RUNQ_SYSTEMATIC_EVAL_PROTOCOL.md`, `docs/QA_MATRIX_2026-10-27.md`, `docs/REHEARSAL_AUTOPILOT.md`.

## Anexo — Autorización de campañas pagadas del 31/10/2026

El usuario autoriza pruebas con modelos reales ejecutadas por Copilot dentro de **100 USD acumulados**: **Meta 65 USD**, **Modal 35 USD**, **Baseten 0**, **Fireworks 0**. Se conservan los límites diarios y por solicitud existentes para Modal. La autorización no convierte tests sintéticos en evaluación de modelos. Para el contrato operativo, migración de ledgers y condiciones bloqueantes, consultar [PAID_AUTONOMOUS_QA_POLICY.md](PAID_AUTONOMOUS_QA_POLICY.md) y [paid-campaign-policy.json](paid-campaign-policy.json).

Las limitaciones anteriores de "no ejecutar modelos de pago" se sustituyen únicamente para **E8, después de que exista gateway compartido y pruebas offline de presupuestos**. Ningún CI ni suite estándar ejecuta APIs reales. Copilot no necesita pedir permiso por cada solicitud dentro de este límite ya autorizado, pero debe registrar reserva previa, evitar reintentos y detenerse en fallo, incertidumbre o crédito desconocido.
