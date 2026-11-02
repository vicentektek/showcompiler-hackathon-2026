# RUNQ — Matriz completa de clasificación de 137 ramas

**Fecha:** 2026-11-02. **Base:** tag `verified-working-2026-11-02` (commit `6d1d65d`).
**Procedimiento:** comparación `base...branch` mediante GitHub API para **cada una de las 137 ramas**. Clasifica por relación de ancestros y commits exclusivos; **no autoriza eliminaciones**.

| Clase Git | Ramas | Decisión provisional |
| --- | ---: | --- |
| Antecesoras exactas del tag | **67** | Candidatas a retirar, únicamente tras cruzar PR y bundle privado |
| Mismo commit | **1** | Conservar hasta sustituir la rama de desarrollo por release |
| Descendientes | **2** | Conservar rama release; docs hasta terminar la entrega |
| Divergentes (commits exclusivos) | **67** | NO BORRAR; revisar, archivar o integrar selectivamente |
| **TOTAL** | **137** | |

## I. Antecesoras del tag: candidatas a eliminación supervisada (67)

Sus commits están contenidos en la referencia verificada. Eliminar su referencia no elimina esos commits mientras permanezca el tag, pero primero se deben auditar PR, referencias externas y backups.

- `docs/codex-qa-playbook-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `docs/runq-v6-professional-workspace-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `docs/runq-v7-product-workstation-rfc-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/ai-provider-eval-infra-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/audio-cue-properties-panic-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/audio-library-batch-zip-import-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/audio-planning-unbound-cues` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/baseten-muse-open-fallback` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/baseten-seminar-benchmark-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/compact-cue-editor-usability-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/conversational-cue-editor-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/cue-automation-persistence-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/cue-automation-plan-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/cue-automation-runtime-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/cue-direct-local-audio-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/cue-editor-operator-notes-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/cue-multi-audio-tracks` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/cue-properties-editor-model-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/hackathon-script-core` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/i18n-en-es-2026-10-26` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/integrated-safe-browser-demo-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/local-audio-audition-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/manual-operator-queue-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/meta-independent-audio-review-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/meta-model-cue-proposals` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/meta-muse-reliable-cues` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/meta-theatrical-prompt-evals` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/modal-sfx-generation-pilot-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/operator-preflight-script-navigation-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-ai-agent-global-2026-10-29` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-ai-creative-progress-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-editor-audio-ux-v2-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-interface-rework-2026-10-31` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-offline-eval-feedback-loop-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-seminar-eval-lab-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-show-document-context-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-stagecraft-v4-integrated-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-stagecraft-v4-workspace-rebuild-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-structural-drama-context-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-systematic-eval-optimizer-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-unified-creative-manual-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-unified-modern-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-v10-unified-sound-workspace-2026-10-29` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-v11-audio-library-transport-and-large-media-plan-2026-10-29` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-v12-sound-library-accessibility-2026-10-29` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-v13-technical-workstation-2026-10-29` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-v14-studio-stage-functional-workspaces-2026-10-29` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-v15-agent-qa-visual-freeze-2026-10-29` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-v3-delivery-foundations-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-v7-professional-workbench-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-v8-studio-stage-redesign-2026-10-29` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-v9-dark-cue-workflow-2026-10-29` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/runq-visual-shell-v1-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/sfx-headless-workbench-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/sfx-standalone-lab-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/single-go-operator-flow-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/stagecraft-cue-audio-safety-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/stagecraft-modal-sfx-integration-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/stagecraft-running-cues-wave-handles-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/voice-follow-synced-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `feat/workspace-navigation-inspector-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `fix/audio-library-rar-7z-picker-and-errors-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `fix/audition-ci-contract-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `fix/meta-theatre-output-truncation-2026-10-27` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `fix/stagecraft-cue-controls-keymapping-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `integration/runq-demo-2026-10-30` — **CANDIDATA**, pendiente de PR/backup y aprobación.
- `stable/voice-autopilot-2026-10-28` — **CANDIDATA**, pendiente de PR/backup y aprobación.

## II. Igualdad exacta (1)

- `feat/runq-ai-campaign-100-2026-10-31` — **MANTENER** como ancla de desarrollo.

## III. Descendientes del tag (2)

- `docs/hackathon-submission-2026-11-02` — **MANTENER** durante preparación de entrega.
- `release/runq-hackathon-2026` — **MANTENER** durante preparación de entrega.

## IV. Divergentes con trabajo exclusivo (67)

En estas referencias hay commits que NO están en el tag. No significan 67 funciones valiosas: pueden ser experimentos alternativos, reverts, docs, tests o correcciones parciales. Requieren inspección de contenidos y PR antes de decidir.

- `docs/qa-battery-320-analysis-2026-11-02` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `docs/runq-ai-studio-ux-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `docs/runq-evals-exhaustive-2026-10-31` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `docs/runq-hero-operator-handoff-2026-10-31` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `docs/runq-paid-ai-acceptance-2026-10-31` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `docs/runq-video-preproduction-2026-10-29` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `docs/runq-video-production-kit-2026-10-29` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/audio-natural-end-events-2026-10-27` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/cue-audition-studio-ux-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/dual-provider-live-campaign-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/dual-provider-offline-planner-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/level1-corpus-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/level1-corpus-hardening-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/manual-cue-authoring-2026-10-27` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/per-cue-audio-controls-2026-10-27` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/portable-show-archive-2026-10-27` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/progressive-curriculum-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/real-waveform-out-trim-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-agent-seminar-theatre-evals-2026-10-27` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-ai-autonomous-qa-2026-10-30` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-ai-campaign-orchestrator-2026-10-30` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-ai-studio-dual-entry-functional-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-assistant-expert-v3-2026-11-01` — **REVISIÓN PRIORITARIA P0/P1**.
- `feat/runq-eval-metrics-2026-10-27` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-long-campaign-2026-11-01` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-rediseño-producción-2026-10-29` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-sfx-batch-recovery-p0-2026-11-02` — **REVISIÓN PRIORITARIA P0/P1**.
- `feat/runq-sound-workspace-v5-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-studio-audio-dock-2026-10-30` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-studio-pane-focus-2026-10-30` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-user-facing-ux-2026-10-31` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-v3-integrated-editor-2026-10-27` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-v3-one-click-cue-prepare-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-v3-waveform-in-trim-2026-10-27` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-v3-waveform-preview-2026-10-27` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-v8-drag-audio-to-cues-2026-10-29` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-voice-console-rehearsal-ux-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/runq-voice-v5-current-integrated-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/scenic-interpretation-v2-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/scenic-v2-review-bridge-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/sfx-auto-english-review-qa-ready-2026-10-29` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/sfx-meta-prompt-assistant-2026-10-29` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/sfx-review-one-step-prompt-guidance-2026-10-29` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/stage-event-interpretation-core-2026-10-27` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/target-stop-fade-editor` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/three-case-quality-review-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `feat/voice-follow-core-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `fix/manual-meta-modal-unlimited-2026-11-02` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `fix/runq-grounded-line-references-2026-11-02` — **REVISIÓN PRIORITARIA P0/P1**.
- `fix/runq-v13-paid-pilot-issue-105` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `fix/runq-v14-agent-audit-2026-10-29` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `fix/sfx-demo-en-i18n-qa-gating-2026-10-29` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `fix/sfx-job-recovery-and-prompt-2026-10-29` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `fix/sfx-simple-one-screen-2026-10-29` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `integrate/runq-full-consolidation-2026-11-02` — **REVISIÓN PRIORITARIA P0/P1**.
- `integration/runq-qa-visual-2026-10-30` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `main` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `qa/50-theatre-works-corpus` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `qa/fireworks-specialization-foundation` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `qa/specialization-eval-2026-10-31` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `spike/native-wasapi-2026-10-26` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `spike/runq-electron-windows-2026-10-30` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `test/runq-agent-paid-eval-hardening-2026-10-30` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `test/runq-mass-campaign-protocol-2026-10-29` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `test/runq-v13-mass-eval-integration-2026-10-29` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `test/runq-v3-full-user-journeys-2026-10-28` — **CUARENTENA / REVISAR Y ARCHIVAR**.
- `test/runq-v9-eval-cli-offline-2026-10-29` — **CUARENTENA / REVISAR Y ARCHIVAR**.

## Reglas de aplicación

1. Inventariar cada PR con base, head, fecha, estado, commit, artefactos y sucesor. Existen 120 PR, de los cuales 109 están abiertos.
2. Crear espejo Git y `git bundle --all`; registrar SHA-256 y verificar el bundle.
3. Auditar secretos y derechos en todos los refs y objetos; no convertir automáticamente el repositorio actual en público.
4. Antes de borrar cada rama antecesora, comprobar que no está siendo utilizada como base por un PR activo y cerrar el PR apropiadamente, con comentario que documente su sucesor.
5. Ramas divergentes: evaluar diferencias de código, pruebas y valor del cambio; si se descartan, conservar antes el SHA, el motivo y el respaldo.
6. No eliminar por lotes sin inventario ni hacer `git push --mirror` a producción; no hacer `force push` ni cambiar `main` sin proceso separado.
7. Revalidar esta clasificación inmediatamente antes de cualquier eliminación, porque el desarrollo sigue activo. El script `tools/audit-git-refs-readonly.ps1` genera una nueva matriz local completa sin modificar refs.

**Limitación explícita:** esta matriz es exhaustiva en el grafo de referencias y sus relaciones de ancestros, **no** una auditoría exhaustiva del contenido semántico, secretos, tests, licencias o importancia del trabajo de cada rama. Una clasificación `antecesora` NO es una orden de borrado.