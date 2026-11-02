import { planShowAudio, cueSoundIdentity, runPreparationQueue, limitAudioBatch } from '../core/showPreparation.mjs';
import {
  normalizeBatchRecords, reconcileRecoveredRecords, runSfxBatch,
} from '../core/sfxBatch.mjs';
import { showBuilderProjectKey } from '../core/showBuilder.mjs';
import { planScriptAnalysis } from '../core/sceneAnalysis.mjs';
import { parseScript } from '../core/script.mjs';
import { userFacingError } from './userFacingErrors.mjs';

const $ = id => document.getElementById(id);
const make = (tag, className = '') => Object.assign(document.createElement(tag), { className });
const ACTIVE = new Set(['QUEUED', 'RUNNING']);
const READY = new Set(['READY_FOR_REVIEW', 'ACCEPTED_FOR_MANUAL_IMPORT']);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

export function mountShowPreparation({ getState, analyzeNext, approve, prepareTriggers, ensureAudioIdle, reviewTake, previewTake, assignTake, stopPreview, openWorkspace }) {
  const panel = document.querySelector('.panel[data-workspaces~="ai"]');
  if (!panel || $('rqPrepareShow')) return;
  const tr = (es, en) => getState().language === 'es' ? es : en;
  const bar = make('section', 'rq-preparation');
  bar.setAttribute('aria-label', tr('Preparación por lotes', 'Batch preparation'));
  const heading = make('h2', 'rq-preparation-heading');
  const subtitle = make('p', 'caption');
  const steps = make('ol', 'rq-preparation-steps');
  const stepNodes = ['analysis', 'review-proposals', 'audio', 'assign'].map(value => {
    const node = make('li'); node.dataset.stage = value; steps.append(node); return node;
  });
  const actions = make('div', 'rq-preparation-actions');
  const icons = {
    rqPrepareShow: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
    rqAcceptAllCues: 'm4 12 5 5L20 6',
    rqGenerateAllAudio: 'M4 10v4m4-8v12m4-15v18m4-15v12m4-8v4',
    rqAssignAllSounds: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
    rqEditAudioBatch: 'M4 7h16M4 17h16M9 4v6m6 4v6',
    rqCancelPreparation: 'M6 6h12v12H6Z',
  };
  const labelButton = (b, label, iconId = b.id) => {
    b.replaceChildren();
    if (icons[iconId]) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', icons[iconId]); svg.append(path); b.append(svg);
    }
    const span = make('span'); span.textContent = label; b.append(span);
  };
  const button = (id, parent = actions) => {
    const b = make('button', 'btn accent small'); b.type = 'button'; b.id = id; parent.append(b); return b;
  };
  const prepare = button('rqPrepareShow');
  const acceptAll = button('rqAcceptAllCues');
  const audioAll = button('rqGenerateAllAudio');
  const assignAll = button('rqAssignAllSounds');
  const editAudio = button('rqEditAudioBatch');
  editAudio.className = 'btn subtle small';
  const includeLabel = make('label', 'rq-preparation-authorize');
  const includeAudio = make('input');
  includeAudio.id = 'rqIncludeShowAudio'; includeAudio.type = 'checkbox'; includeAudio.checked = true;
  const includeText = make('span'); includeLabel.append(includeAudio, includeText);
  const cancel = button('rqCancelPreparation');
  cancel.className = 'btn subtle small';
  const status = make('p', 'rq16-builder-task-help');
  status.id = 'rqPreparationStatus'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const results = make('div', 'rq-preparation-results'); results.id = 'rqPreparationResults';
  const triggerReview = make('details', 'rq-preparation-triggers'); triggerReview.id = 'rqPreparationTriggers';
  const preparationFeedback = make('div', 'rq-preparation-feedback'); preparationFeedback.append(status, triggerReview);
  const makeProgress = id => {
    const box = make('div', 'rq-preparation-progress');
    const label = make('label'); label.htmlFor = id;
    const meter = make('progress'); meter.id = id;
    box.append(label, meter); return { box, label, meter };
  };
  const progress = makeProgress('rqPreparationProgress');
  bar.append(heading, subtitle, steps, actions, includeLabel, progress.box, preparationFeedback, results); panel.prepend(bar);
  const placeToolbar = () => {
    const welcome = $('rq16AIWelcome');
    if (!welcome) return false;
    const description = welcome.querySelector('p');
    if (description) description.hidden = true;
    bar.dataset.integrated = 'true';
    welcome.after(bar);
    return true;
  };
  if (!placeToolbar()) {
    const observer = new MutationObserver(() => { if (placeToolbar()) observer.disconnect(); });
    observer.observe(panel, { childList: true, subtree: true });
  }
  const soundBar = make('div', 'rq-preparation rq16-builder-actions');
  const soundAll = button('rqSoundGenerateAllAudio', soundBar);
  const soundAssignAll = button('rqSoundAssignAllSounds', soundBar);
  const soundCancel = button('rqSoundCancelPreparation', soundBar);
  soundCancel.className = 'btn subtle small';
  const soundStatus = make('span', 'caption'); soundBar.append(soundStatus);
  const soundProgress = makeProgress('rqSoundPreparationProgress'); soundBar.append(soundProgress.box);
  const soundReview = button('rqSoundReviewBatch', soundBar);
  soundReview.className = 'btn subtle small';
  $('generateForm')?.before(soundBar);
  const home = document.querySelector('.home-panel');
  const homeBar = make('div', 'rq-preparation rq16-builder-actions');
  const homePrepare = button('rqHomePrepareShow', homeBar);
  home?.querySelector('.home-tiles')?.after(homeBar);

  const dialog = make('dialog', 'rq-preparation-dialog');
  dialog.setAttribute('aria-labelledby', 'rqPreparationTitle');
  const title = make('h2'); title.id = 'rqPreparationTitle';
  const help = make('p');
  const rows = make('div', 'rq-preparation-plan');
  const cost = make('p'); cost.id = 'rqBatchCost';
  const dialogError = make('p'); dialogError.id = 'rqBatchError'; dialogError.setAttribute('role', 'alert');
  const dialogActions = make('div', 'rq16-builder-actions');
  const startAudio = button('rqStartAudioBatch', dialogActions);
  const close = button('rqCloseAudioBatch', dialogActions); close.className = 'btn subtle small';
  dialog.append(title, help, rows, cost, dialogError, dialogActions); document.body.append(dialog);

  let controller = null, busy = false, planning = false, historyAvailable = true, stage = 'idle', message = '', projectKey = null;
  let records = [], planned = [], policy = null, planState = null, automatic = false;
  let expectedProject = null, identity = null;
  let cancelRevision = 0;
  let progressDone = 0, progressTotal = 0, progressKind = 'analysis';
  const listened = new Map();
  let previewRequestId = null, previewLoading = false;
  const key = state => showBuilderProjectKey(state.project);
  const sourceIdentity = state => JSON.stringify([state.generation, state.project.id, state.project.scriptText]);
  const currentSource = () => identity === sourceIdentity(getState());
  const errorText = error => {
    const messages = {
      PREPARATION_CANCELLED: tr('Lote detenido. Las solicitudes ya enviadas conservan su reserva; no se reintentan.',
        'Batch stopped. Submitted requests keep their reservation; no automatic retry.'),
      SHOW_CHANGED: tr('El espectáculo o su estado cambió. Lote detenido; las tomas anteriores siguen en el historial.',
        'Show or edit state changed. Batch stopped; previous takes remain in history.'),
      BATCH_EXCEEDS_DAILY_CEILING: tr('El lote supera el límite diario configurado. Deselecciona cues; no se ampliará el límite.',
        'Batch exceeds the configured daily ceiling. Deselect cues; the limit will not be raised.'),
      BATCH_AUTHORIZATION_REQUIRED: tr('No hay un lote válido o límites de gasto configurados. No se enviaron generaciones.',
        'No valid batch or configured spending limits. No generations were sent.'),
      BATCH_PROMPT_INVALID: tr('Revisa el prompt en inglés, tipo y duración (1–12 s) de cada cue.',
        'Review the English prompt, kind and duration (1–12 s) for each cue.'),
      SFX_WAIT_LIMIT: tr('La toma sigue generándose. Puedes comprobar su estado; no se enviará otro trabajo.',
        'The take is still generating. Check its status; no new job will be sent.'),
      SFX_IDENTITY: tr('La respuesta no coincide con la toma solicitada. Lote detenido.',
        'Response does not match the requested take. Batch stopped.'),
      SFX_NOT_CONFIGURED: tr('Modal no está configurado. No se enviaron generaciones.',
        'Modal is not configured. No generations were sent.'),
      SFX_GENERATION_FAILED: tr('Una generación falló. Los demás cues continúan; revisa el estado por cue.',
        'One generation failed. Other cues continue; review the status per cue.'),
      SFX_SUBMISSION_UNKNOWN: tr('El envío no pudo confirmarse. No se reenviará automáticamente; comprueba su estado.',
        'Submission could not be confirmed. It will not be resent automatically; check its status.'),
      SFX_BUSY: tr('El servicio local está ocupado con otra operación. Espera y comprueba el estado; no se ha creado un duplicado.',
        'The local service is busy with another operation. Wait and check status; no duplicate was created.'),
      SFX_SERVICE: tr('El servicio de sonido no respondió. El trabajo puede seguir en curso; comprueba su estado antes de actuar.',
        'The sound service did not respond. The job may still be running; check its status before acting.'),
      PREPARATION_STORAGE_UNAVAILABLE: tr('No se puede guardar el historial del lote. Generación bloqueada para evitar duplicar costes.',
        'Batch history cannot be saved. Generation blocked to avoid duplicate costs.'),
      NO_PENDING_SOUND_CUES: tr('No quedan cues de sonido pendientes sin una toma en el historial.',
        'No pending sound cues remain without a take in history.'),
      SFX_NOT_REVIEWABLE: tr('La toma aún no está lista para escuchar. Consulta su estado en el historial de Sonido.',
        'Take is not ready to listen. Check its status in Sound history.'),
    };
    return messages[error.message] ?? userFacingError(error, getState().language, 'sound');
  };
  function fail(error) { message = errorText(error); status.classList.add('error'); render(); }
  function persist() {
    try { localStorage.setItem('runq.preparation.v1.' + projectKey, JSON.stringify(records)); }
    catch { throw new Error('PREPARATION_STORAGE_UNAVAILABLE'); }
  }
  function loadRecords(state) {
    const nextKey = key(state);
    if (nextKey === projectKey) return;
    projectKey = nextKey; records = []; stage = 'idle'; message = ''; historyAvailable = true;
    listened.clear(); progressDone = progressTotal = 0;
    try {
      const raw = localStorage.getItem('runq.preparation.v1.' + projectKey);
      if (raw) {
        // Shared validation preserves phases, WAV hashes and tracking times
        // while remaining compatible with records written by the old loop.
        // The core returns immutable snapshots; the view owns editable copies.
        records = normalizeBatchRecords(JSON.parse(raw)).map(record => ({ ...record }));
      }
    } catch { historyAvailable = false; message = tr('No se pudo recuperar el historial del lote. No se generará automáticamente.',
      'Batch history could not be recovered. Nothing will be generated automatically.'); status.classList.add('error'); }
  }
  function syncRecords(next) {
    records = normalizeBatchRecords(next).map(record => ({ ...record }));
    persist();
  }
  const eligible = state => planShowAudio(state.project).items.filter(item =>
    !records.some(r => r.cueId === item.cueId && r.cueIdentity === item.cueIdentity &&
      !['FAILED', 'CANCELLED', 'REJECTED'].includes(r.status)));
  // The batch button also resumes tracking for live records. runSfxBatch
  // distinguishes them by requestId and never creates a second submission.
  const resumable = state => planShowAudio(state.project).items.some(item =>
    records.some(r => r.cueId === item.cueId && r.cueIdentity === item.cueIdentity &&
      ['SUBMITTED', 'QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(r.status)));
  const recordStatus = record => ({
    SUBMITTED: tr('Enviada', 'Submitted'),
    UNKNOWN: tr('Sin confirmar: consulta el historial', 'Unconfirmed: check history'),
    QUEUED: tr('En cola', 'Queued'),
    RUNNING: tr('Generando', 'Generating'),
    READY_FOR_REVIEW: tr('Lista para escuchar', 'Ready to listen'),
    ACCEPTED_FOR_MANUAL_IMPORT: tr('Revisada', 'Reviewed'),
    CANCEL_REQUESTED: tr('Cancelación remota solicitada', 'Remote cancellation requested'),
    FAILED: tr('Generación fallida', 'Generation failed'),
    CANCELLED: tr('Cancelada', 'Cancelled'),
    REJECTED: tr('Rechazada', 'Rejected'),
  })[record.status];
  const imported = (state, record) => state.project.cues.find(c => c.id === record.cueId)?.actions.some(a =>
    a.type === 'PLAY' && state.project.assets.some(asset => asset.id === a.assetId &&
      asset.provenance?.requestId === record.requestId));
  const assignable = state => records.filter(r => READY.has(r.status) && !imported(state, r) &&
    state.project.cues.some(c => c.id === r.cueId && cueSoundIdentity(c) === r.cueIdentity));
  function render() {
    const state = getState();
    if (!busy) loadRecords(state);
    triggerReview.replaceChildren(); triggerReview.hidden = state.project.cues.length === 0;
    const withTrigger = state.project.cues.filter(cue => cue.trigger?.trim()).length;
    const triggerTitle = make('summary');
    triggerTitle.textContent = tr(`Pies de operación: ${withTrigger}/${state.project.cues.length}. Editables en Cues.`,
      `Operation triggers: ${withTrigger}/${state.project.cues.length}. Editable in Cues.`);
    triggerReview.append(triggerTitle);
    const triggerHelp = make('p', 'caption');
    triggerHelp.textContent = tr('Los pies nuevos usan diálogo anterior de un actor. Sin frase fiable, revisión manual. Los pies existentes se conservan; revisa su idoneidad antes de armar Autopilot.',
      'New triggers use preceding actor dialogue. No reliable phrase means manual review. Existing triggers are preserved; check suitability before arming Autopilot.');
    triggerReview.append(triggerHelp);
    for (const cue of state.project.cues) {
      const foot = make('p', 'caption');
      foot.textContent = `${cue.number} · ${cue.label} · ${cue.sourceLineIds.join(', ') || tr('Sin L#', 'No L#')} · ` +
        (cue.trigger || tr('Pendiente de pie hablado: revisa diálogo, referencias L# o ambigüedad.', 'Spoken trigger pending: review dialogue, L# references or ambiguity.'));
      triggerReview.append(foot);
    }
    const pending = state.project.proposals.filter(p => p.status === 'PENDING');
    const available = eligible(state);
    heading.textContent = tr('Prepara tu show, paso a paso', 'Prepare your show, step by step');
    subtitle.textContent = tr('Cues, pies y sonidos del guion. Tú revisas; GO manual.',
      'Cues, triggers and sounds from script. You review; manual GO.');
    const stepLabels = [tr('Analizar guion', 'Analyze script'), tr('Aprobar cues', 'Approve cues'),
      tr('Generar y escuchar', 'Generate and listen'), tr('Asignar sonidos', 'Assign sounds')];
    stepNodes.forEach((node, i) => {
      node.textContent = stepLabels[i];
      if (node.dataset.stage === stage || (stage === 'review-audio' && i === 2)) node.setAttribute('aria-current', 'step');
      else node.removeAttribute('aria-current');
    });
    const prepareLabel = tr('Auto preparar show completo', 'Auto prepare entire show');
    labelButton(prepare, prepareLabel); labelButton(homePrepare, prepareLabel, prepare.id);
    labelButton(acceptAll, automatic && stage === 'review-proposals'
      ? tr(`Aceptar todos (${pending.length}) y generar sonidos`, `Accept all (${pending.length}) and generate sounds`)
      : tr(`Aceptar todos los cues (${pending.length})`, `Accept all cues (${pending.length})`));
    const audioLabel = tr(`Generar audio para todos (${available.length})`, `Generate audio for all (${available.length})`);
    labelButton(audioAll, audioLabel); labelButton(soundAll, audioLabel, audioAll.id);
    const reviewed = assignable(state), reviewedCount = reviewed.length;
    const assignLabel = tr(`Aceptar todos los sonidos (${reviewedCount})`, `Accept all sounds (${reviewedCount})`);
    labelButton(assignAll, assignLabel); labelButton(soundAssignAll, assignLabel, assignAll.id);
    assignAll.disabled = soundAssignAll.disabled = busy || planning || previewLoading || !(state.canAssign ?? state.canApply) || !reviewedCount;
    assignAll.title = soundAssignAll.title = tr('Acepta y asigna todas las tomas listas a sus cues. Escucharlas antes es opcional.',
      'Accept and assign all ready takes to their cues. Listening first is optional.');
    labelButton(editAudio, tr('Ajustar lote · opcional', 'Adjust batch · optional'));
    includeText.textContent = tr('Incluir todos los sonidos al preparar el show',
      'Include all sounds when preparing the show');
    includeAudio.disabled = busy || planning;
    soundReview.textContent = tr('Ver tomas del lote', 'View batch takes');
    soundReview.hidden = !records.length;
    const cancelLabel = tr('Detener lote', 'Stop batch');
    labelButton(cancel, cancelLabel); labelButton(soundCancel, cancelLabel, cancel.id);
    cancel.title = soundCancel.title = tr(
      'Detiene nuevos envíos y el seguimiento local. No solicita cancelar la generación ya enviada.',
      'Stops new submissions and local tracking. It does not request cancellation of an already submitted generation.');
    prepare.disabled = homePrepare.disabled = busy || planning || !state.canApply || !state.metaAvailable || !state.project.scriptText.trim();
    acceptAll.disabled = busy || planning || !state.canApply || pending.length === 0;
    audioAll.disabled = soundAll.disabled = busy || planning || !historyAvailable || !state.canApply ||
      (available.length === 0 && !resumable(state));
    editAudio.disabled = busy || planning || !historyAvailable || !state.canApply || available.length === 0;
    cancel.hidden = soundCancel.hidden = !busy;
    for (const p of [progress, soundProgress]) {
      p.box.hidden = !busy && !planning && !progressTotal;
      p.meter.max = Math.max(1, progressTotal);
      if (planning || (busy && !progressTotal)) p.meter.removeAttribute('value');
      else p.meter.value = progressDone;
      p.label.textContent = planning ? tr('Preparando lote…', 'Preparing batch…') :
        `${progressDone} / ${progressTotal} · ${progressKind === 'analysis' ? stepLabels[0] :
          progressKind === 'assign' ? stepLabels[3] : stepLabels[2]}`;
    }
    status.textContent = message || tr(
      'IA directa con límites de gasto. Revisa cues y tomas; GO siempre manual.',
      'Direct AI with spending limits. Review cues and takes; GO always manual.');
    const excluded = planShowAudio(state.project).excluded.length;
    soundStatus.textContent = message || tr(`${available.length} pendientes · ${excluded} excluidos (audio existente, música/voz o acciones no sonoras). En serie, sin reemplazos.`,
      `${available.length} pending · ${excluded} excluded (existing audio, music/voice or non-sound actions). Serial, no replacements.`);
    results.replaceChildren();
    const latest = records.filter(r => state.project.cues.some(c => c.id === r.cueId)).slice(-100);
    for (const r of latest) {
      const cue = state.project.cues.find(c => c.id === r.cueId);
      const row = make('div', 'rq-preparation-result');
      const label = make('span');
      const changed = cueSoundIdentity(cue) !== r.cueIdentity;
      const assigned = imported(state, r);
      row.dataset.state = assigned ? 'assigned' : listened.has(r.requestId) ? 'listened' : r.status.toLowerCase();
      label.textContent = `${cue.number} · ${cue.label} · ${assigned ? tr('Asignada', 'Assigned') : changed
        ? tr('Cue modificado', 'Cue changed') : recordStatus(r)}`;
      const controls = make('div', 'rq-preparation-take-actions');
      if (!READY.has(r.status)) {
        const check = make('button', 'btn subtle small'); check.type = 'button';
        check.dataset.batchCheck = r.requestId;
        check.textContent = tr('Comprobar estado', 'Check status');
        check.disabled = busy || planning || previewLoading || !(state.canAssign ?? state.canApply) ||
          ['FAILED', 'CANCELLED', 'REJECTED'].includes(r.status);
        check.addEventListener('click', () => void checkTake(r).catch(fail));
        controls.append(check);
        if (ACTIVE.has(r.status)) {
          const cancelRemote = make('button', 'btn subtle small'); cancelRemote.type = 'button';
          cancelRemote.dataset.batchCancelRemote = r.requestId;
          cancelRemote.textContent = tr('Solicitar cancelación', 'Request cancellation');
          cancelRemote.title = tr('Acción remota separada: pide cancelar esta generación; no detiene el resto del lote.',
            'Separate remote action: requests cancellation of this generation; it does not stop the rest of the batch.');
          cancelRemote.disabled = busy || planning || previewLoading || !(state.canAssign ?? state.canApply);
          cancelRemote.addEventListener('click', () => void cancelRemoteTake(r).catch(fail));
          controls.append(cancelRemote);
        }
      }
      const listen = make('button', 'btn subtle small'); listen.type = 'button'; listen.dataset.batchListen = r.requestId;
      listen.textContent = previewRequestId === r.requestId
        ? previewLoading ? tr('Cargando…', 'Loading…') : tr('Detener escucha', 'Stop preview')
        : tr('Escuchar', 'Listen');
      listen.disabled = busy || planning || (previewLoading && previewRequestId !== r.requestId) ||
        !(state.canAssign ?? state.canApply) || (changed && !assigned) || !READY.has(r.status);
      listen.addEventListener('click', () => void listenTake(r).catch(fail));
      const accept = make('button', 'btn accent small'); accept.type = 'button'; accept.dataset.batchAccept = r.requestId;
      accept.textContent = assigned ? tr('Asignada', 'Assigned') : tr('Aceptar y asignar', 'Accept and assign');
      accept.disabled = busy || planning || previewLoading || !(state.canAssign ?? state.canApply) || !reviewed.includes(r);
      accept.addEventListener('click', () => void assignReviewed(r).catch(fail));
      const review = make('button', 'btn subtle small'); review.type = 'button';
      review.textContent = tr('Editar toma', 'Edit take');
      review.dataset.batchReview = r.requestId;
      review.disabled = busy || planning || previewLoading || !state.canApply || changed;
      review.addEventListener('click', () => void openTake(r).catch(fail));
      controls.append(listen, accept, review); row.append(label, controls); results.append(row);
    }
  }
  function assertEditable() {
    const state = getState();
    if (!currentSource() || !state.canApply || (stage === 'analysis' && !state.metaAvailable))
      throw new Error('SHOW_CHANGED');
    if (expectedProject && JSON.stringify(getState().project) !== expectedProject) throw new Error('SHOW_CHANGED');
  }
  function setBusy(value) {
    busy = value;
    document.dispatchEvent(new CustomEvent('runq:preparation-busy', { detail: { busy: value } }));
    render();
  }
  function stop() {
    cancelRevision += 1;
    previewRequestId = null; previewLoading = false; stopPreview();
    controller?.abort(); automatic = false;
    if (busy || planning || dialog.open) message = errorText(new Error('PREPARATION_CANCELLED'));
    if (dialog.open) dialog.close();
    render();
  }
  async function request(path, { data, signal } = {}) {
    const response = await fetch('/api/sfx' + path, {
      method: data === undefined ? 'GET' : 'POST', cache: 'no-store', ...(signal ? { signal } : {}),
      ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.code ?? 'SFX_HTTP_' + response.status);
    return result;
  }
  function readSelected() {
    return planned.filter(p => p.selected.checked).map(p => ({
      ...p.item, draft: { ...p.item.draft, prompt: p.prompt.value.trim(), kind: p.kind.value,
        durationSeconds: Number(p.duration.value) },
    }));
  }
  function updateCost() {
    const count = readSelected().length;
    cost.textContent = tr(`Modal: ${count} solicitudes en serie. Máximo estimado del lote: $${(count * policy.estimatedMaxCostUsdPerRequest).toFixed(4)} USD. Límite diario: $${policy.dailyBudgetUsd}. Cada solicitud se reserva en el ledger; el saldo y los límites restantes se validan en el servidor.`,
      `Modal: ${count} serial requests. Estimated batch maximum: $${(count * policy.estimatedMaxCostUsdPerRequest).toFixed(4)} USD. Daily ceiling: $${policy.dailyBudgetUsd}. Each request is reserved in the ledger; remaining budget and limits are checked on the server.`);
    startAudio.disabled = count === 0;
  }
  async function showAudioPlan(edit) {
    const revision = cancelRevision;
    if (!historyAvailable) throw new Error('PREPARATION_STORAGE_UNAVAILABLE');
    if (!getState().canApply || busy) throw new Error('SHOW_CHANGED');
    await ensureAudioIdle();
    if (revision !== cancelRevision) throw new Error('PREPARATION_CANCELLED');
    if (!getState().canApply) throw new Error('SHOW_CHANGED');
    prepareTriggers();
    planState = getState();
    identity = sourceIdentity(planState); expectedProject = JSON.stringify(planState.project);
    const settings = await request('/status');
    if (revision !== cancelRevision) throw new Error('PREPARATION_CANCELLED');
    assertEditable();
    policy = settings;
    if (!settings.enabled || !Number.isFinite(settings.estimatedMaxCostUsdPerRequest) ||
        settings.estimatedMaxCostUsdPerRequest <= 0 || !Number.isFinite(settings.dailyBudgetUsd))
      throw new Error('SFX_NOT_CONFIGURED');
    const plan = planShowAudio(planState.project);
    const fresh = eligible(planState);
    const resumeOnly = fresh.length === 0 && resumable(planState);
    const items = resumeOnly ? plan.items.filter(item => records.some(r =>
      r.cueId === item.cueId && r.cueIdentity === item.cueIdentity &&
      ['SUBMITTED', 'QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(r.status))) : fresh;
    if (!items.length) throw new Error('NO_PENDING_SOUND_CUES');
    title.textContent = tr('Generar audio para todos los cues pendientes', 'Generate audio for all pending cues');
    help.textContent = tr(
      `${plan.excluded.length} cues con audio existente, acciones no sonoras o música/voz no compatibles quedan fuera. Revisa y edita los prompts en inglés. Puedes deseleccionar cues. Las tomas quedan pendientes de escucha y aceptación; cancelar detiene nuevos envíos, no revoca costes ya reservados.`,
      `${plan.excluded.length} cues with existing audio, non-sound actions or unsupported music/voice are excluded. Review and edit English prompts. You can deselect cues. Takes await listening and acceptance; cancel stops new submissions, not already reserved costs.`);
    startAudio.textContent = tr('Generar sonidos seleccionados', 'Generate selected sounds');
    close.textContent = tr('Volver sin generar', 'Back without generating');
    dialogError.textContent = ''; rows.replaceChildren(); planned = [];
    for (const item of items) {
      const row = make('fieldset', 'rq-preparation-row');
      const legend = make('legend'); legend.textContent = `${item.number} · ${item.label} · ${item.draft.sourceLineId ?? tr('Sin L#', 'No L#')}`;
      const selectLabel = make('label'); const selected = make('input'); selected.type = 'checkbox'; selected.checked = true;
      selectLabel.append(selected, document.createTextNode(tr(' Incluir', ' Include')));
      const promptLabel = make('label'); promptLabel.textContent = tr('Prompt en inglés', 'English prompt');
      const prompt = make('textarea'); prompt.value = item.draft.prompt; prompt.maxLength = 1000; prompt.rows = 3;
      prompt.setAttribute('aria-label', `${legend.textContent} · prompt`); promptLabel.append(prompt);
      const kind = make('select'); kind.setAttribute('aria-label', tr('Tipo de sonido', 'Sound kind'));
      for (const value of ['SFX', 'ENVIRONMENT']) {
        const option = make('option'); option.value = value; option.textContent = value; kind.append(option);
      }
      kind.value = item.draft.kind;
      const durationLabel = make('label'); durationLabel.textContent = tr('Duración (segundos)', 'Duration (seconds)');
      const duration = make('input'); duration.type = 'number'; duration.min = '1'; duration.max = '12'; duration.step = '1';
      duration.value = String(item.draft.durationSeconds); durationLabel.append(duration);
      row.append(legend, selectLabel, promptLabel, kind, durationLabel);
      if (item.draft.requiresTranslation) {
        const warning = make('p', 'error');
        warning.textContent = tr('Esta idea necesita revisión/traducción al inglés antes de generar.',
          'This idea needs an English rewrite/review before generation.'); row.append(warning);
      }
      for (const input of [selected, prompt, kind, duration]) input.addEventListener('input', updateCost);
      rows.append(row); planned.push({ item, selected, prompt, kind, duration });
    }
    updateCost();
    if (edit) { dialog.showModal(); startAudio.focus(); }
  }
  function batchTransport(signal) {
    return Object.freeze({
      async start(item, ids) {
        return request('/jobs', { signal, data: {
          requestId: ids.requestId, authorizationId: ids.authorizationId, confirmed: true,
          sourceLineId: item.draft.sourceLineId, kind: item.draft.kind, prompt: item.draft.prompt,
          durationSeconds: item.draft.durationSeconds, seed: 42,
          acknowledgedMaxCostUsd: policy.estimatedMaxCostUsdPerRequest,
        } });
      },
      read: requestId => request('/jobs/' + encodeURIComponent(requestId), { signal }),
      refresh: requestId => request('/jobs/' + encodeURIComponent(requestId) + '/refresh',
        { signal, data: {} }),
      cancel: requestId => request('/jobs/' + encodeURIComponent(requestId) + '/cancel',
        { signal, data: {} }),
    });
  }
  async function checkTake(record) {
    if (busy || planning) return;
    planning = true; render();
    try {
      const state = getState();
      const cue = state.project.cues.find(entry => entry.id === record.cueId);
      if (!cue || cueSoundIdentity(cue) !== record.cueIdentity) throw new Error('SHOW_CHANGED');
      const scope = Object.freeze({
        projectId: state.project.id, projectGeneration: state.generation,
        cueId: record.cueId, cueIdentity: record.cueIdentity,
        requestId: record.requestId,
      });
      const withScope = job => job && job.requestId === record.requestId ? {
        ...job, projectId: scope.projectId, projectGeneration: scope.projectGeneration,
        cueId: scope.cueId, cueIdentity: scope.cueIdentity,
      } : job;
      const transport = batchTransport(controller?.signal);
      const local = withScope(await transport.read(record.requestId));
      if (!local || local.requestId !== record.requestId) throw new Error('SFX_IDENTITY');
      let latest = local;
      if (['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(local.status)) {
        latest = withScope(await transport.refresh(record.requestId));
      }
      if (!latest || latest.requestId !== record.requestId) throw new Error('SFX_IDENTITY');
      const reconciled = reconcileRecoveredRecords(records, [latest], scope);
      const currentRecord = reconciled.records.find(entry => entry.requestId === record.requestId);
      syncRecords(reconciled.records);
      message = currentRecord?.status === 'READY_FOR_REVIEW'
        ? tr('Toma recuperada y lista para escuchar. No se ha creado ningún duplicado.',
          'Take recovered and ready to listen. No duplicate was created.')
        : tr('Estado actualizado sin reenviar la generación.',
          'Status updated without resubmitting the generation.');
      render();
    } finally { planning = false; render(); }
  }
  async function cancelRemoteTake(record) {
    if (busy || planning) return;
    if (!ACTIVE.has(record.status)) throw new Error('SFX_NOT_REVIEWABLE');
    planning = true; render();
    try {
      const state = getState();
      const cue = state.project.cues.find(entry => entry.id === record.cueId);
      if (!cue || cueSoundIdentity(cue) !== record.cueIdentity) throw new Error('SHOW_CHANGED');
      const result = await batchTransport(controller?.signal).cancel(record.requestId);
      if (!result || result.requestId !== record.requestId || result.status !== 'CANCEL_REQUESTED')
        throw new Error('SFX_IDENTITY');
      const reconciled = reconcileRecoveredRecords(records, [{
        ...result, projectId: state.project.id, projectGeneration: state.generation,
        cueId: record.cueId, cueIdentity: record.cueIdentity,
      }], Object.freeze({
        projectId: state.project.id, projectGeneration: state.generation,
        cueId: record.cueId, cueIdentity: record.cueIdentity,
        requestId: record.requestId,
      }));
      syncRecords(reconciled.records);
      message = tr('Cancelación remota solicitada para esta generación. No se ha detenido el resto del lote.',
        'Remote cancellation requested for this generation. The rest of the batch was not stopped.');
      render();
    } finally { planning = false; render(); }
  }

  async function generateAudio() {
    if (busy || planning) return;
    const revision = cancelRevision;
    planning = true; startAudio.disabled = true;
    try {
      const selected = readSelected();
      const { items, deferred } = limitAudioBatch(selected, policy);
      assertEditable(); await ensureAudioIdle(); assertEditable();
      if (revision !== cancelRevision) throw new Error('PREPARATION_CANCELLED');
      controller = new AbortController(); const signal = controller.signal;
      const startKey = projectKey;
      stage = 'audio'; progressKind = 'audio'; progressDone = 0; progressTotal = items.length;
      status.classList.remove('error'); dialog.close(); setBusy(true);
      const result = await runSfxBatch({
        items, records, transport: batchTransport(signal), signal,
        assertCurrent: assertEditable,
        createRequestIds: () => ({
          requestId: 'req-' + crypto.randomUUID(),
          authorizationId: 'auth-' + crypto.randomUUID(),
        }),
        onChange(state) {
          if (startKey !== projectKey) return;
          // Keep the render-facing list mutable without mutating core snapshots.
          records = state.records.map(record => ({ ...record })); persist();
          progressDone = state.summary.ready + state.summary.failed +
            state.summary.cancelled + state.summary.rejected;
          progressTotal = items.length;
          const active = state.records.find(record =>
            ['SUBMITTED', 'QUEUED', 'RUNNING'].includes(record.status));
          const item = active && items.find(entry => entry.cueId === active.cueId);
          message = item
            ? tr(`Generando: ${item.label}. Sin reproducción automática.`,
              `Generating: ${item.label}. No automatic playback.`)
            : tr('Actualizando el estado de las tomas. Sin reproducción automática.',
              'Updating take status. No automatic playback.');
          render();
        },
      });
      stage = 'review-audio';
      const summary = result.summary;
      message = tr(
        `Lote terminado: ${summary.ready} listas, ${summary.generating} generando, ${summary.failed} fallidas, ${summary.uncertain} inciertas. Puedes escuchar o aceptar las listas; GO es manual.`,
        `Batch finished: ${summary.ready} ready, ${summary.generating} generating, ${summary.failed} failed, ${summary.uncertain} uncertain. Listen to or accept ready takes; GO is manual.`);
      if (result.stopped) message = tr('Lote detenido. No se enviaron más cues; las generaciones ya enviadas conservan su referencia y pueden comprobarse.',
        'Batch stopped. No more cues were submitted; already submitted generations keep their reference and can be checked.');
      if (deferred) message += tr(` ${deferred} cues siguen pendientes por el límite diario; no se ha ampliado.`,
        ` ${deferred} cues remain pending due to the daily ceiling; it was not raised.`);
    } catch (error) {
      if (controller?.signal.aborted) throw new Error('PREPARATION_CANCELLED');
      throw error;
    } finally {
      controller = null;
      if (busy) setBusy(false);
      planning = false; startAudio.disabled = false; render();
    }
  }
  async function prepareShow() {
    if (busy || planning) return;
    const state = getState();
    if (!state.canApply || !state.metaAvailable || !state.project.scriptText.trim()) throw new Error('SHOW_CHANGED');
    prepareTriggers();
    const plan = planScriptAnalysis(state.project.scriptText);
    const start = state.coverage?.complete ? plan.windows.length : state.coverage?.nextWindowStart ?? 0;
    const count = Math.ceil((plan.windows.length - start) / state.windowsPerRequest);
    openWorkspace('ai'); identity = sourceIdentity(state); expectedProject = null;
    automatic = includeAudio.checked; stage = 'analysis'; controller = new AbortController();
    progressKind = 'analysis'; progressDone = 0; progressTotal = count;
    const signal = controller.signal; status.classList.remove('error'); setBusy(true);
    try {
      await runPreparationQueue(Array.from({ length: count }, (_, i) => i), {
        signal, assertCurrent: assertEditable,
        async execute(i) {
          message = tr(`Analizando guion ${i + 1}/${count}. Las propuestas aún no son cues.`,
            `Analyzing script ${i + 1}/${count}. Proposals are not cues yet.`); render();
          return analyzeNext({ confirmed: true, signal, isCurrent: () => currentSource() && !signal.aborted });
        },
        onComplete(i, coverage) {
          if (!coverage || (!coverage.complete && !Number.isSafeInteger(coverage.nextWindowStart)))
            throw new Error('META_COVERAGE_INVALID');
          progressDone += 1; render();
        },
      });
      stage = 'review-proposals';
      message = automatic
        ? tr('Guion analizado. Revisa los cues: «Aceptar todos y generar sonidos» continúa directamente con audio para todos. GO sigue siendo manual.',
          'Script analyzed. Review cues: “Accept all and generate sounds” continues directly with audio for all. GO remains manual.')
        : tr('Guion analizado. Revisa y acepta las propuestas; puedes generar todos los sonidos después.',
          'Script analyzed. Review and accept proposals; generate all sounds afterwards.');
    } catch (error) {
      if (signal.aborted) throw new Error('PREPARATION_CANCELLED');
      throw error;
    } finally { controller = null; setBusy(false); }
    if (automatic && !getState().project.proposals.some(p => p.status === 'PENDING') && eligible(getState()).length)
      await openAudioPlan();
  }
  async function acceptPending() {
    if (busy || !getState().canApply) throw new Error('SHOW_CHANGED');
    const pending = getState().project.proposals.filter(p => p.status === 'PENDING');
    if (!pending.length) return;
    approve(pending.map(p => p.id));
    if (automatic && stage === 'review-proposals') await openAudioPlan();
  }
  async function openTake(record) {
    const revision = cancelRevision;
    const state = getState(), cue = state.project.cues.find(c => c.id === record.cueId);
    if (!state.canApply || !cue || cueSoundIdentity(cue) !== record.cueIdentity) throw new Error('SHOW_CHANGED');
    const generation = state.generation, beforeKey = key(state);
    const isCurrent = () => {
      const now = getState(), currentCue = now.project.cues.find(c => c.id === record.cueId);
      return revision === cancelRevision && now.generation === generation && key(now) === beforeKey &&
        currentCue && cueSoundIdentity(currentCue) === record.cueIdentity;
    };
    const job = await request('/jobs/' + encodeURIComponent(record.requestId));
    if (!isCurrent() || job.requestId !== record.requestId) throw new Error('SFX_IDENTITY');
    const reconciled = reconcileRecoveredRecords(records, [{
      ...job, projectId: state.project.id, projectGeneration: generation,
      cueId: record.cueId, cueIdentity: record.cueIdentity,
    }], Object.freeze({
      projectId: state.project.id, projectGeneration: generation,
      cueId: record.cueId, cueIdentity: record.cueIdentity,
      requestId: record.requestId,
    }));
    const currentRecord = reconciled.records.find(entry => entry.requestId === record.requestId);
    syncRecords(reconciled.records);
    record.status = currentRecord?.status ?? record.status; render();
    if (!READY.has(record.status)) throw new Error('SFX_NOT_REVIEWABLE');
    const sourceLines = parseScript(state.project.scriptText).filter(line => cue.sourceLineIds.includes(line.id));
    await reviewTake({ requestId: record.requestId, isCurrent, taskContext: {
      projectId: state.project.id, generation, cueId: cue.id, cueNumber: cue.number, cueLabel: cue.label,
      title: `${cue.number} · ${cue.label}`, brief: cue.actions[0].prompt,
      lineIds: cue.sourceLineIds, sourceLines, sourceText: sourceLines.map(line => line.text).join('\n'),
    } });
  }
  async function listenTake(record) {
    if (busy || planning) return;
    if (previewRequestId === record.requestId) {
      previewRequestId = null; previewLoading = false; stopPreview(); render(); return;
    }
    stopPreview();
    const state = getState(), cue = state.project.cues.find(c => c.id === record.cueId);
    if (!state.canApply || !cue || (cueSoundIdentity(cue) !== record.cueIdentity && !imported(state, record)))
      throw new Error('SHOW_CHANGED');
    const cueIdentity = cueSoundIdentity(cue);
    const revision = cancelRevision, generation = state.generation, beforeKey = key(state);
    const isCurrent = () => {
      const now = getState();
      return revision === cancelRevision && previewRequestId === record.requestId &&
        generation === now.generation && beforeKey === key(now) && now.workspace === state.workspace &&
        now.project.cues.some(c => c.id === record.cueId && cueSoundIdentity(c) === cueIdentity);
    };
    previewRequestId = record.requestId; previewLoading = true; status.classList.remove('error'); render();
    try {
      await previewTake({ requestId: record.requestId, isCurrent, taskContext: {
        projectId: state.project.id, generation, cueId: cue.id, cueNumber: cue.number, cueLabel: cue.label,
        title: `${cue.number} · ${cue.label}`, brief: cue.actions[0].prompt, lineIds: cue.sourceLineIds,
        sourceLines: parseScript(state.project.scriptText).filter(line => cue.sourceLineIds.includes(line.id)),
      } });
      if (isCurrent()) message = tr(`Escuchando: ${cue.label}. Puedes aceptar sin escuchar antes. Salida compartida con GO.`,
        `Previewing: ${cue.label}. Listening before acceptance is optional. Same output as GO.`);
    } catch (error) {
      if (previewRequestId === record.requestId) previewRequestId = null;
      throw error;
    } finally {
      if (previewRequestId === record.requestId || previewRequestId === null) { previewLoading = false; render(); }
    }
  }
  async function assignReviewed(selected = null) {
    if (busy || planning || previewLoading) return;
    stopPreview();
    previewRequestId = null;
    const state = getState(), items = assignable(state).filter(r => !selected || r.requestId === selected.requestId);
    if (!state.canApply) throw new Error('SHOW_CHANGED');
    if (!items.length) throw new Error('SFX_NOT_REVIEWABLE');
    identity = sourceIdentity(state); expectedProject = JSON.stringify(state.project);
    controller = new AbortController(); const signal = controller.signal;
    const revision = cancelRevision;
    stage = 'assign'; progressKind = 'assign'; progressDone = 0; progressTotal = items.length;
    status.classList.remove('error'); setBusy(true);
    try {
      await runPreparationQueue(items, {
        signal, assertCurrent: assertEditable,
        async execute(record) {
          const cue = getState().project.cues.find(c => c.id === record.cueId);
          const isCurrent = () => !signal.aborted && revision === cancelRevision && currentSource() &&
            JSON.stringify(getState().project) === expectedProject &&
            getState().project.cues.some(c => c.id === record.cueId && cueSoundIdentity(c) === record.cueIdentity);
          message = tr(`Asignando ${progressDone + 1}/${items.length}: ${cue.label}. Sin ejecutar GO.`,
            `Assigning ${progressDone + 1}/${items.length}: ${cue.label}. No GO.`);
          render();
          await assignTake({ requestId: record.requestId, isCurrent, taskContext: {
            projectId: state.project.id, generation: state.generation, cueId: cue.id,
          } });
          expectedProject = JSON.stringify(getState().project);
          record.status = 'ACCEPTED_FOR_MANUAL_IMPORT'; persist();
        },
        onComplete() { progressDone += 1; render(); },
      });
      message = tr(`${progressDone}/${items.length} sonidos aceptados y asignados. GO y NEXT no han cambiado.`,
        `${progressDone}/${items.length} sounds accepted and assigned. GO and NEXT were not changed.`);
    } catch (error) {
      if (signal.aborted) throw new Error('PREPARATION_CANCELLED');
      throw error;
    } finally { controller = null; setBusy(false); }
  }
  document.addEventListener('runq:sfx-auditioned', event => {
    const state = getState(), detail = event.detail;
    const record = records.find(r => r.requestId === detail?.requestId && r.cueId === detail?.taskContext?.cueId);
    if (!record || detail.taskContext.projectId !== state.project.id || detail.taskContext.generation !== state.generation) return;
    const cue = state.project.cues.find(c => c.id === record.cueId);
    if (cue && cueSoundIdentity(cue) === record.cueIdentity) {
      listened.set(record.requestId, JSON.stringify([state.generation, record.cueIdentity])); render();
    }
  });
  for (const b of [assignAll, soundAssignAll]) b.addEventListener('click', () => void assignReviewed().catch(fail));
  for (const b of [prepare, homePrepare]) b.addEventListener('click', () => void prepareShow().catch(fail));
  acceptAll.addEventListener('click', () => void acceptPending().catch(fail));
  async function openAudioPlan(edit = false) {
    if (planning || busy) return;
    planning = true; render();
    stage = 'planning';
    try { await showAudioPlan(edit); }
    finally { planning = false; render(); }
    if (!edit) await generateAudio();
  }
  for (const b of [audioAll, soundAll]) b.addEventListener('click', () => void openAudioPlan().catch(fail));
  editAudio.addEventListener('click', () => void openAudioPlan(true).catch(fail));
  soundReview.addEventListener('click', () => {
    openWorkspace('ai'); results.scrollIntoView({ block: 'center' });
  });
  startAudio.addEventListener('click', () => void generateAudio().catch(error => {
    if (dialog.open) dialogError.textContent = errorText(error);
    fail(error);
  }));
  close.addEventListener('click', () => dialog.close());
  cancel.addEventListener('click', stop);
  soundCancel.addEventListener('click', stop);
  document.addEventListener('runq:operator-stop-all', stop);
  window.addEventListener('pagehide', stop);
  document.addEventListener('runq:show-state-changed', () => {
    if (busy && (!currentSource() || (stage === 'audio' && JSON.stringify(getState().project) !== expectedProject)))
      controller?.abort();
    if (!busy && dialog.open && sourceIdentity(getState()) !== identity) dialog.close();
    render();
  });
  document.addEventListener('runq:audio-state-change', () => {
    if (!getState().previewActive && !previewLoading) previewRequestId = null;
    if (busy && stage === 'audio' && !getState().canApply) controller?.abort();
    render();
  });
  $('uiLocaleSelect')?.addEventListener('change', render);
  render();
}
