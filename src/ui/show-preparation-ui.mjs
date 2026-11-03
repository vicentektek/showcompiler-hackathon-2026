import { planShowAudio, cueSoundIdentity, runPreparationQueue, limitAudioBatch } from '../core/showPreparation.mjs';
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
      BATCH_AUTHORIZATION_REQUIRED: tr('No hay un lote autorizado o Modal no está configurado. No se enviaron generaciones.',
        'No authorized batch or configured Modal connection. No generations were sent.'),
      BATCH_PROMPT_INVALID: tr('Revisa el prompt en inglés, tipo y duración (1–12 s) de cada cue.',
        'Review the English prompt, kind and duration (1–12 s) for each cue.'),
      SFX_WAIT_LIMIT: tr('La toma sigue pendiente tras dos minutos. Consulta el historial; no se enviará otro trabajo.',
        'Take still pending after two minutes. Check history; no new job will be sent.'),
      SFX_IDENTITY: tr('La respuesta no coincide con la toma solicitada. Lote detenido.',
        'Response does not match the requested take. Batch stopped.'),
      SFX_NOT_CONFIGURED: tr('Modal no está configurado. No se enviaron generaciones.',
        'Modal is not configured. No generations were sent.'),
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
        const saved = JSON.parse(raw);
        if (!Array.isArray(saved) || saved.length > 500 || saved.some(r =>
          !ID.test(r.requestId ?? '') || typeof r.cueId !== 'string' || typeof r.cueIdentity !== 'string' ||
          !['SUBMITTED', 'UNKNOWN', 'QUEUED', 'RUNNING', 'READY_FOR_REVIEW', 'ACCEPTED_FOR_MANUAL_IMPORT',
            'FAILED', 'CANCELLED', 'REJECTED'].includes(r.status)))
          throw new Error('INVALID_PREPARATION_HISTORY');
        records = saved;
      }
    } catch (error) { historyAvailable = false; message = tr('No se pudo recuperar el historial del lote. No se generará automáticamente.',
      'Batch history could not be recovered. Nothing will be generated automatically.'); status.classList.add('error'); }
  }
  const eligible = state => planShowAudio(state.project).items.filter(item =>
    !records.some(r => r.cueId === item.cueId && r.cueIdentity === item.cueIdentity &&
      !['FAILED', 'CANCELLED', 'REJECTED'].includes(r.status)));
  const recordStatus = record => ({
    SUBMITTED: tr('Enviada', 'Submitted'),
    UNKNOWN: tr('Sin confirmar: consulta el historial', 'Unconfirmed: check history'),
    QUEUED: tr('En cola', 'Queued'),
    RUNNING: tr('Generando', 'Generating'),
    READY_FOR_REVIEW: tr('Lista para escuchar', 'Ready to listen'),
    ACCEPTED_FOR_MANUAL_IMPORT: tr('Revisada', 'Reviewed'),
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
      tr('Preparar prompts', 'Prepare prompts'), tr('Asignar sonidos', 'Assign sounds')];
    stepNodes.forEach((node, i) => {
      node.textContent = stepLabels[i];
      if (node.dataset.stage === stage || (stage === 'review-audio' && i === 2)) node.setAttribute('aria-current', 'step');
      else node.removeAttribute('aria-current');
    });
    const prepareLabel = tr('Auto preparar show completo', 'Auto prepare entire show');
    labelButton(prepare, prepareLabel); labelButton(homePrepare, prepareLabel, prepare.id);
    labelButton(acceptAll, tr(`Aceptar todos los cues (${pending.length})`, `Accept all cues (${pending.length})`));
    const audioLabel = tr(`Planificar sonidos (${available.length})`, `Plan sounds (${available.length})`);
    labelButton(audioAll, audioLabel); labelButton(soundAll, audioLabel, audioAll.id);
    const reviewed = assignable(state), reviewedCount = reviewed.length;
    const assignLabel = tr(`Aceptar todos los sonidos (${reviewedCount})`, `Accept all sounds (${reviewedCount})`);
    labelButton(assignAll, assignLabel); labelButton(soundAssignAll, assignLabel, assignAll.id);
    assignAll.disabled = soundAssignAll.disabled = busy || planning || previewLoading || !(state.canAssign ?? state.canApply) || !reviewedCount;
    assignAll.title = soundAssignAll.title = tr('Acepta y asigna todas las tomas listas a sus cues. Escucharlas antes es opcional.',
      'Accept and assign all ready takes to their cues. Listening first is optional.');
    labelButton(editAudio, tr('Revisar prompts', 'Review prompts'));
    includeText.textContent = tr('Mostrar plan de sonidos tras analizar el show',
      'Show sound plan after analyzing the show');
    includeAudio.disabled = busy || planning;
    soundReview.textContent = tr('Ver tomas del lote', 'View batch takes');
    soundReview.hidden = !records.length;
    const cancelLabel = tr('Cancelar lote', 'Cancel batch');
    labelButton(cancel, cancelLabel); labelButton(soundCancel, cancelLabel, cancel.id);
    prepare.disabled = homePrepare.disabled = busy || planning || !state.canApply || !state.metaAvailable || !state.project.scriptText.trim();
    acceptAll.disabled = busy || planning || !state.canApply || pending.length === 0;
    audioAll.disabled = soundAll.disabled = busy || planning || !state.canApply || available.length === 0;
    editAudio.disabled = audioAll.disabled;
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
      'Analiza el guion, revisa los cues y prepara los sonidos mediante prompts. GO siempre manual.',
      'Analyze script, review cues and plan sounds with prompts. GO is always manual.');
    const excluded = planShowAudio(state.project).excluded.length;
    soundStatus.textContent = message || tr(`${available.length} cues necesitan audio · ${excluded} excluidos. Exporta prompts e importa archivos localmente.`,
      `${available.length} cues need audio · ${excluded} excluded. Export prompts and import files locally.`);
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
    cost.textContent = tr(
      `${count} descripciones preparadas. Se exportarán como un archivo TXT; no se generará ningún audio.`,
      `${count} sound descriptions ready. Export as TXT; no audio will be generated.`
    );
    startAudio.disabled = count === 0;
  }
  async function showAudioPlan(edit) {
    const revision = cancelRevision;
    if (!getState().canApply || busy) throw new Error('SHOW_CHANGED');
    if (revision !== cancelRevision) throw new Error('PREPARATION_CANCELLED');
    if (!getState().canApply) throw new Error('SHOW_CHANGED');
    prepareTriggers();
    planState = getState();
    identity = sourceIdentity(planState); expectedProject = JSON.stringify(planState.project);
    assertEditable();
    // Sound planning is local; it must not depend on Modal configuration.
    policy = { promptOnly: true };
    const plan = planShowAudio(planState.project);
    const items = eligible(planState);
    if (!items.length) throw new Error('NO_PENDING_SOUND_CUES');
    title.textContent = tr('Planificar sonidos pendientes', 'Plan pending sounds');
    help.textContent = tr(
      `${plan.excluded.length} cues con audio o acciones no sonoras quedan fuera. Revisa y copia estos prompts para buscar o generar audio externamente. Después importa el archivo al cue correspondiente.`,
      `${plan.excluded.length} cues with audio or non-sound actions are excluded. Review these prompts to find or create audio externally, then import the file into its cue.`);
    startAudio.textContent = tr('Exportar prompts TXT', 'Export prompts TXT');
    close.textContent = tr('Cerrar', 'Close');
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
        warning.textContent = tr('Revisa la traducción al inglés antes de utilizar este prompt.',
          'Review the English translation before using this prompt.'); row.append(warning);
      }
      for (const input of [selected, prompt, kind, duration]) input.addEventListener('input', updateCost);
      rows.append(row); planned.push({ item, selected, prompt, kind, duration });
    }
    updateCost();
    if (edit) { dialog.showModal(); startAudio.focus(); }
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
      let completed = 0;
      await runPreparationQueue(items, {
        signal, assertCurrent: assertEditable,
        async execute(item) {
          const record = { cueId: item.cueId, cueIdentity: item.cueIdentity,
            requestId: 'req-' + crypto.randomUUID(), status: 'SUBMITTED' };
          records.push(record); persist();
          message = tr(`Generando ${completed + 1}/${items.length}: ${item.label}. Sin reproducción automática.`,
            `Generating ${completed + 1}/${items.length}: ${item.label}. No automatic playback.`); render();
          try {
            let job = await request('/jobs', { signal, data: {
              requestId: record.requestId, authorizationId: 'auth-' + crypto.randomUUID(), confirmed: true,
              sourceLineId: item.draft.sourceLineId, kind: item.draft.kind, prompt: item.draft.prompt,
              durationSeconds: item.draft.durationSeconds, seed: 42,
              acknowledgedMaxCostUsd: policy.estimatedMaxCostUsdPerRequest,
            } });
            const deadline = Date.now() + 120000;
            for (;;) {
              if (job.requestId !== record.requestId || ![...ACTIVE, ...READY, 'FAILED', 'CANCELLED'].includes(job.status))
                throw new Error('SFX_IDENTITY');
              record.status = job.status;
              if (startKey === projectKey) { persist(); render(); }
              if (!ACTIVE.has(job.status)) break;
              if (Date.now() >= deadline) throw new Error('SFX_WAIT_LIMIT');
              await new Promise((resolve, reject) => {
                const abort = () => { clearTimeout(timer); reject(new Error('PREPARATION_CANCELLED')); };
                const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2000);
                signal.addEventListener('abort', abort, { once: true });
                if (signal.aborted) abort();
              });
              if (signal.aborted) throw new Error('PREPARATION_CANCELLED');
              assertEditable();
              job = await request('/jobs/' + encodeURIComponent(record.requestId) + '/refresh', { signal, data: {} });
            }
            if (!READY.has(job.status)) throw new Error('SFX_GENERATION_FAILED');
            return record;
          } catch (error) {
            if (!['FAILED', 'CANCELLED'].includes(record.status)) record.status = 'UNKNOWN';
            if (startKey === projectKey) persist();
            throw error;
          }
        },
        onComplete() { completed += 1; progressDone = completed; render(); },
      });
      stage = 'review-audio';
      message = tr(`${completed}/${items.length} tomas generadas. Puedes escucharlas aquí o aceptar todos los sonidos directamente. GO es manual.`,
        `${completed}/${items.length} takes generated. Listen here or accept all sounds directly. GO is manual.`);
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
        ? tr('Guion analizado. Revisa los cues y después prepara el plan de sonidos. No se genera audio.',
          'Script analyzed. Review cues, then prepare the sound plan. No audio is generated.')
        : tr('Guion analizado. Revisa y acepta las propuestas. Puedes planificar los sonidos después.',
          'Script analyzed. Review and accept proposals. You can plan sounds afterwards.');
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
    record.status = job.status; persist(); render();
    if (!READY.has(job.status)) throw new Error('SFX_NOT_REVIEWABLE');
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
    try { await showAudioPlan(true); }
    finally { planning = false; render(); }
  }
  for (const b of [audioAll, soundAll]) b.addEventListener('click', () => void openAudioPlan().catch(fail));
  editAudio.addEventListener('click', () => void openAudioPlan(true).catch(fail));
  soundReview.addEventListener('click', () => {
    openWorkspace('ai'); results.scrollIntoView({ block: 'center' });
  });
  startAudio.addEventListener('click', () => {
    try {
      assertEditable();
      const items = readSelected();
      if (!items.length) return;
      const content = items.map(item => [
        'Cue ' + item.number + ' · ' + item.label,
        'Guion / Script: ' + (item.draft.sourceLineId ?? '—'),
        'Tipo / Kind: ' + item.draft.kind,
        'Duración sugerida / Suggested duration: ' + item.draft.durationSeconds + ' s',
        'Prompt: ' + item.draft.prompt,
        item.draft.requiresTranslation ? 'REVISAR TRADUCCIÓN / REVIEW TRANSLATION' : '',
      ].filter(Boolean).join('\n')).join('\n\n---\n\n');
      const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
      try {
        const anchor = make('a');
        anchor.href = url;
        anchor.download = 'runq-sound-prompts.txt';
        anchor.click();
      } finally { URL.revokeObjectURL(url); }
      message = tr('Prompts exportados. Importa los archivos de sonido en sus cues.',
        'Prompts exported. Import sound files into their cues.');
      dialog.close(); render();
    } catch (error) { dialogError.textContent = errorText(error); }
  });
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
