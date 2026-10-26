# Investigación Meta Model API y especialización teatral — SHOWCOMPILER
Fecha: 26 de octubre de 2026.
**Tipo:** estudio para implementar. **No modifica runtime, no ejecuta inferencia real y no implica que se hayan comprobado credenciales de usuario.**

## Decisión

Para el MVP del Meta AI Hackathon: Meta Model API / Chat Completions / `muse-spark-1.3` en **modo Standard**, clave solo en servidor Node, esquemas estructurados, inferencia **fuera del directo**, ejecución determinista de audio a voluntad del operador. Baseten Muse Spark Open es fallback; **no comparte contrato JSON garantizado** con Meta. No se hará fine-tuning para la entrega. Se especializará con reglas teatrales, ejemplos pocos-shot, evaluación gold y validación.

Fuentes oficiales (verificadas el 26-oct-2026):
- [Meta Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions)
- [Meta structured output](https://dev.meta.ai/docs/structured-output)
- [Meta reasoning](https://dev.meta.ai/docs/reasoning)
- [Meta error handling](https://dev.meta.ai/docs/cookbook/error-handling-retry)
- [Meta pricing & privacy](https://dev.meta.ai/docs/pricing-rate-limits)
- [Meta prompt caching](https://dev.meta.ai/docs/prompt-caching)
- [Meta prompt engineering](https://dev.meta.ai/llama/docs/how-to-guides/prompting)
- [Muse Spark Open fine-tuning](https://dev.meta.ai/docs/muse-spark-open/post-training)

## 1. Auditoría del adaptador actual

Archivos: `src/core/metaCueProvider.mjs`, `tools/metaRoutes.mjs`, `src/core/workspace.mjs`, `src/core/projectPersistence.mjs`.

**Correcto y conservar**:
- `POST https://api.meta.ai/v1/chat/completions` con modelo `muse-spark-1.3`.
- `MODEL_API_KEY` exclusivamente en proceso Node y `Authorization: Bearer`; API de frontend solo localhost.
- Mensaje `developer` de alto nivel, `response_format.type=json_schema`, `json_schema.strict=true`; todos los objetos con `additionalProperties:false` y todos sus campos requeridos.
- `reasoning_effort:low` como baseline de extracción, `stream:false`, límite de propuestas, verificación de IDs en servidor y cliente; humana `APPROVE` produce `DRAFT`, jamás GO.
- Proyecto sin assets válido: `assetId:null`, `PLAN_AUDIO` no se reproduce.

**Riesgos identificados; no adjudicar como causa confirmada del error de usuario**:
1. **Salida de 1200 tokens**: incluye tokens de razonamiento; `finish_reason=length` puede dejar contenido incompleto. Registrar finish reason/usage y comparar con 4096 tokens, quizá 8192 si 8 cues son largos. Medir coste y latencia.
2. **Timeout 25 s**: posiblemente corto para 91 líneas y salida estructurada; registrar duración y decidir 45–60 s en ensayos, nunca durante GO.
3. **Calidad del prompt**: pide simultáneamente no inventar sonidos y proponer sonidos aún no existentes; la instrucción resulta ambigua. Aclarar que `soundPrompt` describe un sonido *no disponible*, pero anclado a una indicación, escena o necesidad técnicamente justificable. No inventar hechos del guion ni referencias.
4. **Primeras 120 líneas y 250 caracteres/línea**: silenciosa truncación de guiones largos y acotaciones; implementar selección/fragmentación por escena, contexto solapado, `sourceLineId` estable y cobertura visible.
5. **Máximo 8 propuestas globales**: insuficiente para obras completas. Usarlo como máximo **por escena o fragmento**, después deduplicar y pasar a revisión.
6. **Forma JSON estricta compatible**: verificar directamente la forma enviada, no improvisar migración a Responses API (que utiliza `text.format`). `assetId` debe poder ser `null`, `soundPrompt` requerido y acotado; nunca confiar en esquema como garantía semántica.
7. **Error pobre**: antes se mezclaban 400 de esquema/validación local, 429 de cuota, 502 transport y 422 de modelo. Clasificar por fase con `requestId` no sensible, códigos estables, duración, `finish_reason`, tokens de uso; no registrar API keys ni guiones completos.
8. **Modo privacidad**: Meta documenta Standard (prompts no usados para entrenar) y Contributor (permite usar contenido para entrenamiento). Los créditos gratis pueden añadir condiciones específicas y la pantalla de usuario avisa de uso para mejora; leer las condiciones del saldo antes de trabajar con obras de terceros. Mantener explícito modo Standard y consentimiento por envío.
9. **No hacer autorreintentos de pago sin control**: Meta recomienda reintentos solo 429/5xx/timeout con backoff; para una tarea que puede cobrar, máximo configurable y advertir que una petición con timeout puede haber consumido tokens. Durante fase diagnóstico, 0 reintentos automáticos.
10. **Fuentes**: la verificación actual confirma que línea y assetId existen, pero no que el texto justifique musicalmente el cue. Añadir validación semántica asistida y evaluación humana.

## 2. Pipeline especializado del diseñador de sonido

```text
TXT/guion intacto + configuración de producción
        ↓  parseo determinista
escenas, líneas, personajes, acotaciones, cambios de espacio y tiempo
        ↓  IA: extracción por escena (no ejecución)
necesidades de sonido con evidencia exacta L#, tipo, justificación
        ↓  IA: diseño sonoro
categoría, prompt acústico, duración orientativa, cue de entrada,
loop, salida/fade y prioridad, relación con otros cues
        ↓  validación determinista
línea existe, sonido coherente, prioridad, IDs, limites, no comandos
        ↓  revisión humana
aprobar/rechazar/editar + 3 rutas: biblioteca | después | preparar generación
        ↓  preflight
asignar audio, verificar archivo, volumen, salida, fade y loop
        ↓  GO MANUAL / MODO DIRECTO SIN IA
```

### Semántica teatral que debe conocer Muse

- Distinguir **acotaciones explícitas** (p.ej. «se oye un portazo») de **subtexto que puede sugerir atmósfera** (p.ej. «noche en el puerto»). El segundo debe ser sugestión creativa, no orden ni hecho del guion.
- Distinguir entrada instantánea (`ONE_SHOT`), ambiente continuo (`LOOP`), música (`MUSIC`), voz grabada (`VOICE`), transición (`TRANSITION`) y silencios intencionales (`SILENCE`). Iluminación futura `LIGHT` solo opcional.
- El `sourceLineId` es evidencia documental, no momento absoluto del GO: la acotación puede preceder una frase; el operador puede desplazar el cue.
- `soundPrompt`: detallar plano sonoro, intensidad, distancia, textura, evolución, variaciones y restricciones (sin voz si no la hay, sin golpes en bucle, duración orientativa). Ejemplo: «Lluvia fina exterior, goteo irregular cercano, viento suave, 45 s, bucle sin costura, sin voces ni música».
- Negativos: diálogos que mencionan un objeto no implican generar su sonido; no producir música porque aparece la palabra «música» en notas de producción; no sobrecargar con efectos permanentes; una escena explícitamente silenciosa no genera ambiente obligatorio.
- Evitar falsos positivos y duplicados: mismo efecto sostenido a través de varias líneas = **un cue con duración**, no un nuevo cue por línea.
- Modo montaje `minimal` o `full` **con criterios declarados**; no inferir cuántos recursos físicos tiene el operador.
- No traducir el guion; sí permitir nombres y prompts en español o idioma solicitado; interfaz inglesa independiente.

### Ejemplos expertos few-shot a crear y revisar

1. **Explícito**: L12 «(Suena una campana lejana)» → campana distante, one-shot, L12, evidencia directa.
2. **Ambiente**: L22 «Exterior. Calle mojada de madrugada» → tráfico distante/agua sutil, sugerencia creativa etiquetada, no certeza.
3. **No cue**: L31 «Recuerdo aquella tormenta de niño» → sin cue, solo recuerdo narrado.
4. **Negativo**: L40 «(Silencio absoluto. Se apaga la música)» → STOP/fade de un cue anterior como propuesta técnica, pero **no orden ejecutable sin aprobación**.
5. **Continuidad**: L50 «(La lluvia sigue mientras hablan)» → mantener ambiente, sin doble disparo.

Separar ejemplos de entrenamiento/evaluación. No copiar contenido de obras con derechos.

## 3. Esquema del resultado: versión de análisis, NO JSON de show

Diseñar un DTO `CueSuggestionV2` solo para el modelo; después la UI lo traduce a `proposal` y al `PLAN_AUDIO` provisional. No cambiar silenciosamente el esquema de proyecto v1.

Campos previstos (todavía NO implementados):
- `sourceLineId`: referencia `L123` conocida.
- `sourceEvidence`: fragmento corto de referencia (reverificar contra línea).
- `cueKind`: enum `FX|AMBIENCE|MUSIC|VOICE|SILENCE|TRANSITION`.
- `basis`: enum `EXPLICIT|SUGGESTED`.
- `label`: título breve.
- `soundPrompt`: descripción acústica.
- `assetId`: string o null, null si no encaja archivo registrado.
- `trigger`: enum `BEFORE_LINE|ON_LINE|AFTER_LINE`.
- `durationSeconds`: número o null (estimación).
- `loop`: boolean.
- `fadeInSeconds`, `fadeOutSeconds`: número no negativo.
- `confidence`: rango 0-1 estimado **no interpretar como probabilidad calibrada**.
- `reason`: explicación escénica corta.

Usar `required` para TODAS las propiedades y `additionalProperties:false` en todos los objetos; evitar `oneOf`/recursión; JSON Schema Meta limita profundidad. Mantener `null` explícito para opcionales. En la primera prueba de humo, usar **schema mínimo existente**, no este v2, para aislar el fallo.

## 4. Experimento real mínimo (con créditos y consentimiento)

- No hacer nuevas peticiones en la auditoría.
- Fase A: comprobar credencial en local `MODEL_API_KEY` sin imprimirla. Un `ping` de una palabra a la API solo si el usuario confirma que quiere consumir una petición.
- Fase B: mínimo strict JSON, guion sintético de 3 líneas, 1 salida, `assetId:null`. Registrar únicamente: HTTP, error.type/param (sanitizados), `finish_reason`, token usage y latencia; nunca respuesta de script real en log.
- Fase C: subir a 15–20 líneas y luego a 91 sin aumentar variables simultáneamente; probar `low` con 4096 tokens, comparar `medium` solo si mejora acierto.
- Fase D: probar cinco guiones originales de distintos estilos y un guion negativo («habla de sonidos sin producirlos»); guardar propuestas revisadas para corpus de evaluación.
- Un botón de **diagnóstico con permiso**, no auto-run al arrancar, modelo fijo, presupuestos y cero auto-retries por defecto.
- Comprobar que el error 400 del servidor Meta nunca se disfraza de `META_INVALID_PROJECT`: conservar fase y status original para decidir si falla input/schema/entitlement sin volcar contenido.

## 5. Métricas para enseñar al jurado

Crear gold set anotado por técnico de sonido. Definir tolerancia de línea ±1 cuando esté justificada, pero exigir evidencia original:
- Validez técnica de propuestas: 100% (no IDs inventados).
- Tasa de aciertos en necesidades explícitas (recall).
- Precisión de propuestas, especialmente falsos sonidos cuando el texto es narrativo.
- Precisión de localización al nivel de línea.
- Duplicados por escena.
- Idoneidad profesional del prompt acústico (rúbrica 0–5).
- Duración y coste/100 líneas; consumo `usage.prompt_tokens`, `usage.completion_tokens` y reasoning tokens.
- Tasa de aprobación y edición por el operador como feedback posterior, sin confundir aprobación con verdad ground truth.

Ablation tests (no cambiar múltiples cosas a la vez): prompt básico vs especializado, 0/3/5 ejemplos, `low` vs `medium`, 120 líneas vs fragmentación, montaje reducido vs completo. Registrar versión exacta de prompt y modelo para reproducir resultados.

## 6. Costes, privacidad y límites

Meta Standard Muse Spark 1.3 según guía oficial: **$1.25 / millón tokens entrada**, **$0.15 / millón entrada caché**, **$4.25 / millón tokens salida**. Ejemplo meramente orientativo de 5k entrada + 4k salida: $0.02325 por análisis. 150 USD cubren muchos experimentos pequeños, pero no es gasto cero ni garantía de tope. El panel de usuario tiene tarjeta y umbral de facturación; usar límites y alertas, nunca asumir que los avisos cortan gasto.

Por privacidad, la ficha general Standard especifica no usar el contenido para entrenar, Contributor sí; **el plan de créditos puede introducir condiciones adicionales**. La captura del usuario muestra una advertencia al usar los free credits; no enviar obras confidenciales hasta leer la modalidad activa.

Prompt caching automático: instrucciones y ejemplos fijos primero, guion variable después; medir `usage.prompt_tokens_details.cached_tokens`.

## 7. Orden concreto para Codex

1. Abrir PR independiente `fix/meta-adapter-diagnostics-and-schema` desde `feat/audio-planning-unbound-cues`; no tocar `main` ni repo anterior.
2. Tests aislados del HTTP real simulado (400 schema invalid, 401, 403, 404, 429, 500, timeout, truncado, schema inválido, `assetId:null`).
3. Instrumentar diagnóstico seguro y fases `LOCAL_VALIDATION|UPSTREAM_HTTP|UPSTREAM_PARSE|MODEL_FINISH|SEMANTIC_VALIDATION` + `requestId`; no persistir secretos.
4. Implementar smoke test minúsculo con aprobación explícita y API oficial, separado del análisis completo.
5. Hacer configurable budget `max_completion_tokens`, `reasoning_effort` y timeout desde allowlist local; valores iniciales recomendados a **evaluar**: `low`, 4096, 45 s.
6. Crear `CueSuggestionV2` y validadores independientes del proyecto persistido; no introducir campos JSON v2 sin migración.
7. Implementar análisis por escenas con ventanas acotadas, contexto solapado, anti-duplicados y progreso visible; siempre fuera de GO.
8. Crear gold set y pruebas automáticas de regresión comparables. Ejecutar con tokens reales solo después de revisar coste estimado y consentimiento.
9. Mantener intactos el motor Web Audio, el spike WASAPI, la aprobación humana, la seguridad local y el aislamiento entre repos.

**Criterio de finalización:** petición real produce propuesta válida para guion de 3 líneas; misma ruta analiza guion de 91 líneas sin referenciar activos inexistentes; JSON no se trunca; el técnico puede aprobar cue sin audio; `GO` nunca depende de internet ni del modelo; pruebas viejas y nuevas pasan y consumo queda visible.
