# RUNQ Eval Report v1 — contrato

Reporte emitido como `artifacts/runq-evals/<run-id>/summary.json`, y resumen Markdown paralelo. No subir artefactos con datos privados.

```json
{
  "schemaVersion": 1,
  "runId": "local-20261031-001",
  "createdAt": "ISO-8601",
  "repoCommit": "SHA",
  "corpusRevision": "SHA256",
  "seed": 20261031,
  "executionMode": "OFFLINE",
  "provider": null,
  "model": null,
  "estimatedCostUsd": 0,
  "reservedCostUsd": 0,
  "counts": {
    "PASS": 0,
    "FAIL": 0,
    "INCOMPLETE": 0,
    "BLOCKED": 0,
    "NOT_RUN": 0
  },
  "metrics": {
    "verifiedGoldCases": 0,
    "precision": null,
    "recall": null,
    "f1": null,
    "invalidLineRefs": 0,
    "unauthorizedTransportEvents": 0,
    "unauthorizedPaidRequests": 0
  },
  "cases": [
    {
      "caseId": "SCR-door_hotel-ES",
      "status": "NOT_RUN",
      "layer": "MODEL_OUTPUT",
      "durationMs": null,
      "reason": "Not evaluated against a model",
      "evidence": []
    }
  ]
}
```

Reglas:
- Incluir denominadores, percentiles/estratos y listado de fallos; separar datos de proveedor de fixtures.
- `precision/recall/f1 = null` cuando no existe gold verificado y predicción real completa, o el estrato no es evaluable.
- `NOT_RUN` significa que no hubo ejecución; `BLOCKED` dependencia ausente; `INCOMPLETE` ejecución parcial; `FAIL` aserción efectivamente incumplida.
- L0 validación de fixtures NO equivale a L2 calidad de IA ni E2E de producto.
- Identificar claramente mocks, pruebas sintéticas y operaciones manuales.
- Cualquier comparación A/B usa casos idénticos y versión del corpus congelada; registrar cambios en prompts, parámetros y SHA.
- Nunca escribir secretos, cuerpos completos de guiones privados, clips de voz ni solicitudes íntegras a proveedores en el informe.
