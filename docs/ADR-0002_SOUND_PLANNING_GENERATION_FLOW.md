# ADR-0002 — Guion primero, audio después (26 octubre 2026)

**Estado:** MVP de planificación implementado en rama aislada, sujeto a CI y pruebas manuales. **No hay motor generativo de archivos de audio integrado.**

## Regla de producto

Un diseñador de sonido debe poder importar el guion, obtener propuestas, aprobar cues y preparar el espectáculo **sin tener ninguna biblioteca de sonidos cargada**. El cue describe un acontecimiento escénico y un sonido requerido; el archivo es su recurso de ejecución, no su identidad.

```text
Guion original → análisis Meta/Baseten (máx. 8 propuestas)
      ↓
Cue sugerido: L18 · Trueno lejano · prompt acústico
      ↓ aprobación expresa del humano
DRAFT / Audio pendiente → [1 Biblioteca] / [2 Decidir después] / [3 Generar audio IA]
     1: elegir asset         2: conservar prompt             3: marcar generación pendiente
     ↓                            ↓                                  ↓
 cargar WAV real              no sonido                      futuro proveedor/variantes
     ↓                            ↓                                  ↓
 preflight OK → GO            GO bloqueado                   seleccionar candidato y asignar WAV → GO
```

### Tres rutas, una misma semántica

1. **Biblioteca propia:** elegir un archivo preexistente, buscar por nombre/etiqueta en fases posteriores, preescuchar. Vincular su ID al cue aprobado; debe estar decodificado localmente antes de GO. El proyecto JSON no embebe los bytes.
2. **Decidir después:** se crea un `PLAN_AUDIO` con `prompt` y `resolution: DEFER`. El operador puede aprobar el cue incluso sin audio. Se conserva en JSON; no provoca llamadas de red; GO permanece desactivado.
3. **Preparar generación:** el operador selecciona `GENERATE`. Solo se marca la intención en JSON. **No se genera ni factura nada automáticamente**. En una integración futura, debe haber editor de prompt, selección de proveedor, duración, loop, variantes, costes anticipados, consentimiento y preescucha; solo tras elegir resultado se materializa un asset y se asigna.

### Contrato experimental en esta rama

- Acción reproducible actual: `{ "type": "PLAY", "assetId": "asset-1" }`.
- Acción no reproducible nueva: `{ "type": "PLAN_AUDIO", "prompt": "Distant thunder", "resolution": "DEFER" }`, o `resolution: "GENERATE"`.
- Toda propuesta pasa por validación; aprobación humana crea un cue `DRAFT` con la acción provisional, sin reproducir.
- `assignAudioToCue(project,cueId,assetId)` transforma de manera atómica el cue y su propuesta original en `PLAY`, preservando referencia de línea y trazabilidad. No copia el binario.
- `setCueSoundResolution(project,cueId,"DEFER"|"GENERATE")` cambia solamente la intención, sin invocar un servicio.
- El motor Web Audio acepta exclusivamente `PLAY` con AudioBuffer cargado. `PLAN_AUDIO` no llega nunca a reproducirse.
- El análisis AI admite bibliotecas vacías. Cuando el modelo no encuentra un sonido que encaje, debe devolver `assetId: null` y una descripción del efecto `soundPrompt`.
- Para asegurar bajo riesgo, no se implementa autoaprobación ni carga silenciosa de audio.

### Diseño del generador posterior

La generación debe ser una fase **asíncrona de preparación**, nunca parte de GO ni del callback de audio:

1. La IA propone `soundPrompt`, categoría (`FX`, `AMBIENCE`, `MUSIC`, `VOICE`), duración tentativa, loop y contexto; el operador revisa y ajusta.
2. Mostrar proveedor compatible, precios/rango estimados, límites, licencias y texto exacto que se enviará. Pedir consentimiento **por generación**.
3. Crear trabajo idempotente (`generationJobId`), registrar `QUEUED` / `RUNNING` / `FAILED` / `SUCCEEDED` / `CANCELLED`, nunca en el hilo RT. Limitar peticiones y reintentos para evitar cargos dobles.
4. Guardar **todas las variantes descargadas en el proyecto local**, con hash, licencia/proveedor/modelo, prompt, fecha, duración, sample rate, nombre, tamaño. Nunca sustituir el cue original sin aprobación.
5. Permitir escuchar A/B, rechazar, solicitar otra versión o asociar el resultado; tras seleccionar un archivo, validar WAV/MP3 y asignar `assetId` al cue. Entonces, y solo entonces, habilitar GO.
6. Ofrecer libremente sustituir más tarde el sonido IA por un archivo propio. El cue no queda cautivo del proveedor.
7. Para versiones de escritorio, empaquetar fuentes de audio de manera portable con rutas relativas y hash, no solo IDs en JSON.
8. Avisar de voces clonadas, letras comerciales y derechos del material. No asumir que todos los pesos «abiertos» son de uso comercial.

### Proveedores a evaluar, no integrados

| Necesidad | Ruta técnica | Limitaciones |
|---|---|---|
| Foley, impacto, ambiente corto | ElevenLabs Sound Effects API | Documenta controles de duración (hasta 30 s para su endpoint estándar) y loop; revisar tarifa/licencia vigente |
| Música, ambientes largos, transiciones | Stability AI Stable Audio | Endpoint de audio más largo, consumo por generación y licencia API distinta |
| Investigación local Meta AudioCraft (AudioGen/MusicGen) | Modelos descargables | Los pesos oficiales se publican como CC-BY-NC 4.0: **no asumir distribución/comercialización** sin alternativa de licencia |

Fuentes oficiales consultadas: https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert , https://platform.stability.ai/pricing , https://platform.stability.ai/ , https://github.com/facebookresearch/audiocraft .

### Evaluación de usabilidad

- En la pantalla de propuestas no debe exigirse selector de audio: por defecto «Decidir después».
- El panel de cues debe mostrar claramente **AUDIO PENDIENTE** / **GENERACIÓN PREPARADA** / **LISTO** (una vez asignado y cargado).
- No mezclar `PENDING` (aprobación) con `DEFER` (resolución de audio). Un cue aprobado puede seguir pendiente de recurso.
- No ejecutar nunca peticiones generativas a un proveedor al importar TXT, aprobar un cue ni entrar en directo.
- A futuro: vista «Pendientes de sonido» agrupada por escena, estimación de tiempo y presupuesto, candidatos, y asignación masiva confirmada.

### Compatibilidad y límites

Se ha extendido la acción permitida por el esquema experimental JSON v1. **Los lectores actuales de esta rama aceptan proyectos viejos con solo `PLAY`**; versiones anteriores de SHOWCOMPILER **no necesariamente podrán abrir proyectos que contengan `PLAN_AUDIO`**. Antes de distribución estable, actualizar a esquema v2 con migración explícita, garantía de importación de v1 y exportación/versión definida. No ocultar esta incompatibilidad direccional.

Limitaciones actuales: un cue `PLAN_AUDIO` solo soporta un bloque de sonido pendiente y una biblioteca básica de nombres; no hay efectos multiaudio con combinaciones de cue pendiente y cue listo, editor de prompts avanzado, audio AI generado, preescucha profesional ni backups ZIP portables todavía. **Nada de lo anterior debe anunciarse como implementado.**

Este módulo es código nuevo en `feat/audio-planning-unbound-cues`, separado del proyecto previo y de la rama de demo publicada.
