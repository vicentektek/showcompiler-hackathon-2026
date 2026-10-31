# RUNQ · Hero Operator — creación completa de cue por voz
**Fecha:** 31 octubre 2026  
**Estado:** intérprete offline y 9 tests unitarios preparados; **integración RUNQ, ASR real, UX y export/import aún pendientes**.  
**Rama de entrega:** docs/runq-hero-operator-handoff-2026-10-31 (desde integration/runq-demo-2026-10-30). Esta rama NO es la candidata final ni debe mezclarse automáticamente con las ramas visuales.

## Alcance de la demo
Orden inglesa exacta de Arian:
> Insert a cue before cue three. Name it Decision Tension. Use the selected sound. Set the voice trigger to line twenty.

En una **COPIA** de The Last GO de 3 cues, con un WAV importado y seleccionado previamente, la operación propone:
- Q03 nuevo: **Decision Tension**, DRAFT, origin=MANUAL.
- Antiguo Q03 pasa a Q04 con su ID, audio y trigger intactos.
- Audio: el assetId del WAV READY seleccionado explícitamente en Studio; no adivinar audio.
- Pie: **L20**, Ella: *And what happens if we skip straight to the decision?* (texto literal original).
- Preview legible **antes** de Apply. Se permite Discard y Undo exacto. Ningún GO ni ARM.

**La muestra usa Muse Voice para transcripción autorizada y parser local determinista para interpretar. NO atribuir el parser a Muse Spark.** La muestra de análisis de guion con Muse Spark se graba como toma separada y auténtica.

## Contrato de operación estable
Nueva operación estrictamente validada: CREATE_CONFIGURED_CUE con exactamente estos campos:

    {
      "op": "CREATE_CONFIGURED_CUE",
      "afterCueId": "<ID del cue 2>",
      "label": "Decision Tension",
      "assetId": "<ID de WAV READY seleccionado>",
      "sourceLineId": "L20",
      "trigger": "And what happens if we skip straight to the decision?"
    }

afterCueId es ID persistente, nunca número visual. El insertManualCue actual usa null para APPEND, por eso antes del primer cue se rechaza en la versión inicial. Es una operación atómica que nunca deja un cue parcial sin audio si una validación falla.

## Separación para permitir rediseños de la interfaz
- CORE src/core/heroCue.mjs: puro, offline, sin DOM, audio, transporte ni inferencia; devuelve PLAN o CLARIFY. validateHeroCueOperation es fail-closed si no hay callback de disponibilidad real.
- AGENT src/core/agentCore.mjs: extender allowlist + transacción prepare/commit/undo. Resolver origen, WAV y línea EN PREVIEW y revalidar EN COMMIT contra estado actual; si show cambió, descartar plan obsoleto. Conservar API de operaciones antiguas.
- CONTROLLER/UI: convertir audio del micrófono en texto editable; seleccionar un solo WAV READY del show actual; pasar la orden al parser local; renderizar diff y aprobar/rechazar. El cambio visual futuro toca esta capa, no el contrato de operación.
- REHEARSAL/STAGE: no tocar lógica Autopiloto, GO, STOP ALL, clock ni ruta de audio.

## Cambios de integración esperados para Copilot
1. Inspeccionar primero AGENTS.md, ramas, worktrees, status y commits; localizar candidata más reciente, proteger cambios locales/untracked; crear otro worktree de implementación. NO usar main por defecto ni fusionar PRs en bloque.
2. Integrar src/core/heroCue.mjs y test/heroCue.test.mjs si no están; el fixture inglés original ya vive en fixtures/demo/runq-the-last-go-en.txt en la rama base.
3. En agentCore.validateAgentOperations admitir CREATE_CONFIGURED_CUE con forma estricta. En prepareAgentPlan y commitAgentPlan aceptar contexto de disponibilidad/assetReady. Crear mediante insertManualCue, después transformar solo el nuevo cue a PLAY+assetId+sourceLineIds L20+trigger como una **única transacción** en una copia normalizada. El undo debe conservar snapshot exacto. El diff de cue CREATED actual solo muestra label/number: ampliarlo a audio, trigger, sourceLineIds y renumeraciones para que el operador pueda revisar todo.
4. Conectar interpretHeroCueCommand antes del intérprete de comandos genérico en el agente local. Si devuelve CLARIFY no iniciar proveedor ni modificar; si devuelve PLAN validarlo, preparar preview y pedir aprobación.
5. UI del agente en Studio: dropdown solo de WAV READY, invalidación ante cambio de show/asset, campo dictado editable; Record/Stop/Transcribe reutilizando patrón de src/ui/cue-conversation-ui.mjs y POST /api/voice/transcribe con consentimiento individual y lenguaje EN. Nunca transcribir automáticamente al montar UI, nunca auto-submit, auto-apply, GO o ARM. Gestionar exclusividad del micrófono con voz de ensayos.
6. Mantener modo teclado totalmente funcional para pruebas sin coste; la respuesta Meta en tools/agentRoutes.mjs hoy solo admite CREATE_CUE sin sonido/trigger: NO fingir que genera esta operación ni ampliar esa ruta por obligación. La versión inicial usa intérprete local explícito.
7. Export/import ZIP de la COPIA de show de 4 cues, validar 3 WAV reales, cue nuevo y pie L20. Conservar base de 3 cues para test del Autopiloto.
8. Tests, smoke Chrome Windows, seguridad, Undo y documentación; crear PR DRAFT a la verdadera rama de integración; no auto-merge.

## Criterios de aceptación H01-H12
- **H01/H02:** preview correcto Q03/Q04, nombre, asset, L20, trigger, sin GO; Apply solo tras confirmación.
- **H03/H04:** Discard sin mutación; Undo restaura todo el show.
- **H05:** audio ausente/no READY/selección ambigua aborta.
- **H06:** referencia destino inexistente, antes de Q01, Lxx no diálogo o inexistente aborta.
- **H07:** trigger duplicado o fabricado aborta.
- **H08:** edición bloqueada si Rehearsal/Operation, AUTO GO armado, GO/pending, audio/preview activo, inspector dirty, importación en curso.
- **H09:** cambio de show, audio o estado durante preview invalida Apply.
- **H10:** roundtrip ZIP con WAV reales conserva estructura y L20.
- **H11:** voz Arian real -> Muse Voice EN autorizado -> texto editable -> PLAN -> Apply; latencia y transcripción reportadas únicamente si se miden.
- **H12:** show original 3 cues intacto; las pruebas de Autopiloto y STOP ALL siguen pasando.

## Recursos originales y cómo usarlos
- Audio Arian Hero (~8,4 s) Descript: https://web.descript.com/64447897-f516-4c76-8464-7275c97e8f2f/4fd1c
- Publicación de audio con acceso privado: https://share.descript.com/view/LzKKWM9L27v
- Audio original de Arian para fade (fallback): https://web.descript.com/4d0882c0-5aa0-4903-a6fc-330ab8691679
- Actor James/Maya/Ella: https://web.descript.com/f1e6a0c1-d10a-4b30-86cb-c5f2915ce530
- Narrador Benedict: https://web.descript.com/c9b27c2d-b505-40b1-a327-b1f8b6df9d5d
- Kit de vídeo, constructor ZIP EN y tomas de voces: rama docs/runq-video-production-kit-2026-10-29, especialmente docs/video/demo-pack/README.md y tools/video/build-the-last-go.mjs.
- Los ZIP/WAV anteriores existen en la Biblioteca personal, pero no se ha podido materializar su contenido directamente desde la Biblioteca en esta sesión. No subir binarios de voz, claves ni logs privados al repositorio.

## Puertas de calidad
Comprobar en el worktree de implementación: node --test test/heroCue.test.mjs; npm run check:syntax; npm test; browser E2E y aceptación manual real con voz inglesa WAV en Windows. Pruebas automatizadas offline nunca llaman API pagada. El código aquí subido NO significa que la función esté integrada; actualmente solo demuestra el parser/validador.

La locución nueva fue creada por Agent Underlord en Descript; antes de grabar revisar por oído pronunciación y pausas. Las peticiones reales a Muse Voice requieren consentimiento y política de coste válida en RUNQ.
