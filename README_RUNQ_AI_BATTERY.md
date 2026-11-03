> **ARCHIVED EVALUATION EXPERIMENT — NOT PART OF THE FINAL SUBMISSION.** This document describes an earlier 320-request live Meta QA campaign. Running the launcher can incur real API charges and must not be done to validate or record the frozen RUNQ demo. The selected build is `b4e7df724d569c1d5af7682540c206ff3fb97701`; see [final release notes](docs/SUBMISSION_RELEASE_2026-11-03.md) and [experiment history](docs/DEVELOPMENT_HISTORY_INDEX_2026-11-03.md). No historical scripts or evidence have been deleted.

> **2026-11-02: Meta y Modal sin topes locales de presupuesto**, tanto en uso manual/demo como en baterias CLI. Las cifras anteriores son historicas. Ver [cambio y verificacion](docs/META_MODAL_UNLIMITED_2026-11-02.md).

# RUNQ AI Battery v1 — 320 solicitudes reales con un solo comando

**Destinado a:** RUNQ Assistant Expert V3, rama de la PR #131 (`feat/runq-assistant-expert-v3-2026-11-01`). El paquete no sirve en `main` ni en la rama antigua. Usa el modelo y el esquema reales del producto, no un chat genérico.

## Instalación una sola vez

1. Abre en VS Code la rama de la PR #131 en tu ordenador. **No hagas merge.** Verifica que exista `src/qa/assistantV3Evaluation.mjs`.
2. Extrae el ZIP dentro de la carpeta raíz del repositorio, conservando los directorios `tools/`, `fixtures/qa/` y `test/`, junto con `RUNQ_AI_BATTERY.ps1`.
3. La variable `MODEL_API_KEY` debe estar disponible en el entorno del terminal. El script no imprime ni guarda la clave.

## Ejecutar toda la campaña: UN SOLO COMANDO

```powershell
powershell -ExecutionPolicy Bypass -File .\RUNQ_AI_BATTERY.ps1
```

El script ejecuta primero una comprobación sin coste y luego, si pasa, **320 llamadas reales a Meta Muse Spark 1.3**, siempre en serie. Se reutilizan las funciones del asistente real para construir contextos, crear mensajes, validar JSON y puntuar los resultados. No requiere Copilot, no realiza GO/STOP, no modifica espectáculos y no usa Baseten, Modal, Fireworks ni voz remota.

### Cobertura

- **106 casos pendientes** del Gauntlet anterior × A/D = 212 solicitudes. Se evita `beginner-01`, que Copilot ya había evaluado con 6 llamadas.
- **48 preguntas independientes** redactadas específicamente para esta batería × A/D = 96 solicitudes, de ayuda integral, diagnósticos, estado real, memoria, ambigüedad, seguridad y límites del producto. En español e inglés.
- **12 solicitudes adicionales** de escenarios sintéticos de la suite V3 (siempre A/D).

**A = asistente anterior**, **D = asistente experto**. Cada pareja recibe el mismo problema bajo una ventana y modelo controlados. Son respuestas independientes, no verdaderas conversaciones de 50 turnos: la memoria larga real necesitaría otra fase con turnos encadenados.

### Control de solicitudes

El propietario retiró el tope monetario local de Meta para esta batería el **2 de noviembre de 2026**. El registro incremental conserva las estimaciones y los estados `RESERVED`, `COMPLETED` y `UNKNOWN`, pero no impone un máximo en euros. El ledger histórico (`global-spend-v1.json`) no se modifica; la batería toma el mismo lock compartido para evitar carreras entre procesos.

Se mantienen los límites técnicos de **40.000 bytes por payload**, 4096 tokens de margen de entrada y 2200 tokens de salida. Las estimaciones se guardan como referencia local; no son facturas ni crédito verificado. Las llamadas siguen siendo explícitas, seriales y sujetas al `--live` de la herramienta, con protección contra duplicados y parada ante un resultado incierto o error del proveedor. No se hacen reintentos automáticos.

### Qué mide, y qué NO

Cada respuesta se analiza para comprobar estructura, operaciones permitidas, referencias Lxx observadas, aciertos de identidad de cue, conceptos requeridos, seguridad y consistencia de memoria cuando existe evidencia. Se registran latencia y tokens. Los tests con **solo estructura y estado no se presentan como calidad semántica**. Toda calidad artística y de conversación que no tenga un oráculo independiente queda marcada `NOT_RATED`.

**Limitación importante:** los grupos de memoria utilizan una decisión confirmada en el contexto sintético, pero no demuestran conversación encadenada real en 50 turnos. Tampoco se escucha audio ni se evalúan proveedores de sonido.

### Reanudar y comprobar

Volver a ejecutar el mismo comando tras una parada segura **continúa con los casos no enviados** si el código/selección siguen idénticos. Nunca reintenta un envío cuyo resultado sea incierto. Si cambia el código o los escenarios, detiene la reanudación para evitar mezclar resultados de dos versiones.

Estado con:

```powershell
node tools/runq-ai-battery.mjs --status
```

Comprobación previa sin pagar:

```powershell
node tools/runq-ai-battery.mjs --dry-run --count 320
```

Los checkpoints quedan en `artifacts/qa-ai-battery-v1/run.json` y el informe legible en `artifacts/qa-ai-battery-v1/report.md` (local). No contienen respuestas crudas, guiones privados ni claves. No añadas ese directorio a Git.

**No se han efectuado solicitudes de pago al crear este paquete.** Hay que ejecutarlo desde tu ordenador con la variable `MODEL_API_KEY` configurada.
