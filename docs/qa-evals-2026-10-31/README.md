> **ESTADO EN GITHUB (31/10/2026):** esta rama publica la documentación y contratos de la campaña. El corpus de 100 guiones, 102 conversaciones, 18 journeys, 32 fallos y los scripts del ZIP original **no están aún copiados al repositorio**. Por tanto, los comandos del kit que aparecen abajo son instrucciones para una fase posterior, no comandos que funcionen ya desde esta rama. Ver [START_HERE.md](START_HERE.md), [PROMPT_PARA_COPILOT.md](PROMPT_PARA_COPILOT.md) y [CORPUS_AND_REPORT_CONTRACT.md](CORPUS_AND_REPORT_CONTRACT.md) para reconstruir e integrar esos archivos sin descargar nada.

# RUNQ — Kit inicial de campaña QA/Evals para Show Builder

**Fecha:** 2026-10-31 · **Estado:** fixtures DRAFT y herramienta L0/L1 independiente. Este paquete no llama a IA, no ejecuta audio, no transforma pesos de ningún modelo y no modifica el repositorio RUNQ por sí mismo.

## Contenido

- `corpus/scripts.jsonl`: 100 guiones originales, español/inglés, con líneas Lxx y anotaciones **provisionales**.
- `corpus/dialogues.jsonl`: 102 conversaciones de dos turnos en ES/EN (204 intervenciones de usuario), con restricciones y resultados esperados.
- `corpus/journeys.json`: 18 recorridos E2E por implementar.
- `corpus/faults.jsonl`: 32 tipos de fallos para inyección, por implementar.
- `corpus/splits.json`: partición reproducible, agrupando traducciones.
- `tools/make-seed-corpus.py`: regenerador determinista de los guiones y conversaciones.
- `tools/make-splits.py`: genera las particiones.
- `tools/run-offline-evals.mjs`: valida los contratos de corpus y, al darle un repo, invoca el parser REAL `src/core/script.mjs` en sus variantes; recibe predicciones externas normalizadas con `--predictions` para scoring, pero nunca hace inferencia por su cuenta.
- `test/campaign-contract.test.mjs`: pruebas de coherencia del kit.
- `docs/TEST_AND_TRAINING_STRATEGY.md`: protocolo completo para integrar, evaluar y corregir.
- `docs/COPILOT_TASK.md`: prompt y fases de trabajo.
- `reports/offline-report.json`: muestra la validación local realizada al crear el paquete; **no es un resultado de RUNQ ni del modelo**.

## Ejecutar sin proveedores

Requiere Node 20+.

```powershell
node --test .\test\campaign-contract.test.mjs
node .\tools\run-offline-evals.mjs --repeat 10
```

Con una copia local de RUNQ (para comprobar el parser real):

```powershell
node .\tools\run-offline-evals.mjs --repo "C:\Proyectos\Hackaton 2026\showcompiler-hackathon-2026" --repeat 10
```

Si se ejecuta **sin** `--repo`, el informe identifica `FIXTURE_VALIDATION_ONLY` y `parserVariantChecks: 0`. Nunca proclamar que se han probado funcionalidades de RUNQ basándose solo en eso.

## Calificar predicciones reales ya grabadas (SIN llamar al modelo)

Normalizar cada salida a JSONL, una línea por caso, con este contrato mínimo:

```json
{"case_id":"SCR-door_hotel-ES","proposals":[{"lineId":"L2","intent":"PLAY"}],"tool_events":[]}
```

Después de revisión humana y cambio explícito de los estados de las etiquetas gold a `VERIFIED`:

```powershell
node .\tools\run-offline-evals.mjs --predictions .\reports\provider-results.jsonl
```

Solo para diagnóstico experimental de etiquetas todavía no verificadas, utilizar conscientemente `--allow-draft`; los scores estarán marcados como PROVISIONALES. `tool_events: []` **no prueba que un programa no haya ejecutado nada**; requiere trazas completas instrumentadas. El grading automático exacto por `Lxx+intent` no mide calidad artística ni respuestas conversacionales. Los códigos `STOP` y `SILENCE` son observaciones, no archivos WAV.

## Plan de implantación

Primero QA L0/L1 + CI sin costes. Después E2E con Playwright, mocks de proveedor y Web Audio. Por último pilotos **acotados y autorizados** de inferencia con la infraestructura y el ledger ya existentes de RUNQ. La parte más importante es integrar el corpus con las funciones reales y verificar un subconjunto por técnicos antes de usarlo como gold.

**No copiar este kit encima de una rama sucia ni ejecutar comandos de integración destructivos.** Consultar `AGENTS.md` y la versión vigente del checkout local. 