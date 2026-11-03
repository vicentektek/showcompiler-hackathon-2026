> **HISTORICAL MODAL PILOT — NOT ACTIVE IN FROZEN HACKATHON DEMO.** The standard RUNQ server blocks new sound generation (`SFX_PROMPT_ONLY`). Keep this file as technical experiment evidence only; no credentials or pilot deployment are needed for the submitted build. See [feature status](FEATURE_STATUS_AND_FUTURE_AUDIO_2026-11-03.md).

# RunQ — generador de efectos SFX (piloto técnico, 28-10-2026)

## Alcance real

En esta rama se ha preparado código ejecutable **pero no se ha desplegado** el modelo ni realizado inferencia ni gasto en Modal. La integración visual y el enlace a cues tampoco están implementados.

Base: rama de infraestructura IA/Modal de la PR #61. Esta rama se presenta por separado para facilitar revisión y evitar alteraciones del motor de audio en DIRECTO.

- src/core/audioGenerationPlan.mjs (existente): plan y autorización individual.
- src/core/modalSfxPilotClient.mjs (nuevo): solicitudes, cliente HTTPS autenticado, estado, cancelación y validación WAV.
- modal/runq_sfx_pilot.py (nuevo): web ASGI con proxy auth de Modal y trabajos GPU asíncronos.
- test/modalSfxPilotClient.test.mjs (nuevo): pruebas de aislamiento y seguridad offline.

## Flujo del producto

1. Meta AI interpreta una acotación del guion y propone un sonido con referencia Lxx.
2. El operador edita descripción, duración (1–12 s en este piloto) y variante/semilla.
3. El operador **autoriza expresamente un único intento** de generación.
4. Backend Node servidor llama a Modal con tokens protegidos; nunca desde navegador.
5. Modal devuelve ID de tarea. El editor muestra pendiente/en ejecución/terminado/error; sin reintentos automáticos.
6. Descarga WAV y verifica RIFF, PCM16, canales, frecuencia, duración y SHA-256.
7. El operador escucha, compara variantes y **decide si importa** el archivo.
8. Solo tras importar, editar y aprobar podrá asignar el asset al cue.
9. GO, STOP, STOP ALL, fades, loops, auto-GO y audio real permanecen en el motor existente, sin conexión de red.

## Contrato HTTP interno

Endpoint protegido mediante proxy auth de Modal:

- POST /jobs → jobId y estado QUEUED.
- GET /jobs/{jobId} → RUNNING o COMPLETED con metadatos de audio.
- GET /jobs/{jobId}/audio → audio/wav PCM16 tras finalizar.
- POST /jobs/{jobId}/cancel → CANCEL_REQUESTED; **no** confirmación de detención.

POST /jobs acepta únicamente requestId, authorizationId, sourceLineId, kind, modelCandidate, prompt, durationSeconds y seed. Solo SFX/ENVIRONMENT, modelo exacto stabilityai/stable-audio-3-small-sfx, prompt <=1000 caracteres, duración 1–12 s y semilla 0..2147483647. No admite URLs.

**Limitaciones importantes:** autorización consumida en Node solo en memoria; falta journal de idempotencia duradera, conciliación de pagos y cuotas. Por tanto NO es aún apto para explotación multiusuario ni debe conectarse directamente a una interfaz pública. ID de tarea temporal según Modal, WAV no persistente, cancelación best effort. No se ha probado GPU ni construido el contenedor.

## Validación sin coste

    node --check src/core/modalSfxPilotClient.mjs
    node --test test/modalSfxPilotClient.test.mjs
    python -m py_compile modal/runq_sfx_pilot.py

Condiciones previas a cualquier prueba de pago:

1. Verificar créditos, GPU y límites de gasto en dashboard Modal.
2. Revisar Stability AI Community License y obligaciones para uso comercial.
3. Fijar commit del repositorio stable-audio-3 y revisiones de pesos, no usar rama móvil.
4. Construir y perfilar imagen: consumo de VRAM, latencia y fallos de modelo, hoy no verificados.
5. Crear proxy token de Modal independiente del token API; solo en backend, nunca interfaz, repositorio ni logs.
6. Implementar journal duradero, bloqueo de concurrencia y presupuesto total antes de uso multiusuario.

Comando de **futuro despliegue manual, no ejecutado**:

    modal deploy modal/runq_sfx_pilot.py

Cliente Node: backend con MODAL_SFX_ENDPOINT, MODAL_PROXY_TOKEN_ID y MODAL_PROXY_TOKEN_SECRET. No se ejecutan trabajos de pago al arrancar; solo tras pulsación autorizada de Generar.

## Evaluación de la calidad

Comparar al menos cinco prompts originales y libres de derechos: portazo, tormenta lejana, pasos sobre grava, lluvia fina, murmullo de espectadores. En cada muestra:

- Fidelidad semántica: ¿corresponde realmente al evento del guion?
- Calidad de transitorios, inicio y cola; suitability para cue teatral.
- Artefactos/clipping y comportamiento con auriculares y PA.
- Duración, recorte, loop y posible repetición.
- Seed, modelo y revisión, tiempo total, GPU y VRAM, WAV y juicio humano 1–5.
- Gasto real confirmado en dashboard y **coste por WAV utilizable**.

No existe certificación de calidad real hasta escuchar muestras generadas.

## Siguientes capas, no incluidas

- UI de generación y biblioteca local, escuchas A/B, ondas y edición.
- Journal persistente de trabajos y deduplicación de solicitudes para reducir el riesgo de cargos.
- Ambientes largos, música, inpainting/continuación y adaptación de duración.
- Chatterbox Multilingual para voz con consentimiento y derechos de locución.
- Generador local CPU opcional cuando el hardware alcance calidad/latencia razonables.

Referencias:
- https://github.com/Stability-AI/stable-audio-3
- https://github.com/Stability-AI/stable-audio-3/blob/main/docs/workflows/inference.md
- https://modal.com/docs/sdk/py/latest/FunctionCall
- https://modal.com/docs/sdk/py/latest/asgi_app
- https://modal.com/docs/guide/webhook-proxy-auth
- https://stability.ai/license
