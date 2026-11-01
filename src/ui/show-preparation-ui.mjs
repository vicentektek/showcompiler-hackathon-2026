import { planShowAudio, cueSoundIdentity, runPreparationQueue, validateAudioBatch } from '../core/showPreparation.mjs';
import { showBuilderProjectKey } from '../core/showBuilder.mjs';
import { planScriptAnalysis } from '../core/sceneAnalysis.mjs';
import { parseScript } from '../core/script.mjs';
import { userFacingError } from './userFacingErrors.mjs';

const $ = id => document.getElementById(id);
const make = (tag, className = '') => Object.assign(document.createElement(tag), { className });
const ACTIVE = new Set(['QUEUED', 'RUNNING']);
const READY = new Set(['READY_FOR_REVIEW', 'ACCEPTED_FOR_MANUAL_IMPORT']);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

export function mountShowPreparation({ getState, analyzeNext, approve, ensureAudioIdle, reviewTake, openWorkspace }) {
  const panel = document.querySelector('.panel[data-workspaces~="ai"]');
  if (!panel || $('rqPrepareShow')) return;
  const tr = (es, en) => getState().language === 'es' ? es : en;
  const bar = make('section', 'rq-preparation');
  bar.setAttribute('aria-label', tr('Preparación por lotes', 'Batch preparation'));
  const actions = make('div', 'rq-preparation-actions');
  const button = (id, parent = actions) => {
    const b = make('button', 'btn accent small'); b.type = 'button'; b.id = id; parent.append(b); return b;
  };
  const prepare = button('rqPrepareShow');
  const acceptAll = button('rqAcceptAllCues');
  const audioAll = button('rqGenerateAllAudio');
  const cancel = button('rqCancelPreparation');
  cancel.className = 'btn subtle small';
  const status = make('p', 'rq16-builder-task-help');
  status.id = 'rqPreparationStatus'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const results = make('div', 'rq-preparation-results'); results.id = 'rqPreparationResults';
  bar.append(actions, status, results); panel.prepend(bar);
  const placeToolbar = () => {
    const welcome = $('rq16AIWelcome');
    if (!welcome) return false;
    const description = welcome.querySelector('p');
    if (description) description.hidden = true;
    bar.dataset.integrated = 'true';
    welcome.append(bar);
    return true;
  };
  if (!placeToolbar()) {
    const observer = new MutationObserver(() => { if (placeToolbar()) observer.disconnect(); });
    observer.observe(panel, { childList: true, subtree: true });
  }
  const soundBar = make('div', 'rq-preparation rq16-builder-actions');
  const soundAll = button('rqSoundGenerateAllAudio', soundBar);
  const soundCancel = button('rqSoundCancelPreparation', soundBar);
  soundCancel.className = 'btn subtle small';
  const soundStatus = make('span', 'caption'); soundBar.append(soundStatus);
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
  const authorizationLabel = make('label', 'rq-preparation-authorize');
  const authorization = make('input'); authorization.type = 'checkbox'; authorization.id = 'rqBatchAuthorize';
  const authorizationText = make('span'); authorizationLabel.append(authorization, authorizationText);
  const cost = make('p'); cost.id = 'rqBatchCost';
  const dialogError = make('p'); dialogError.id = 'rqBatchError'; dialogError.setAttribute('role', 'alert');
  const dialogActions = make('div', 'rq16-builder-actions');
  const startAudio = button('rqStartAudioBatch', dialogActions);
  const close = button('rqCloseAudioBatch', dialogActions); close.className = 'btn subtle small';
  dialog.append(title, help, rows, cost, authorizationLabel, dialogError, dialogActions); document.body.append(dialog);

  let controller = null, busy = false, planning = false, historyAvailable = true, stage = 'idle', message = '', projectKey = null;
  let records = [], planned = [], policy = null, planState = null, automatic = false;
  let expectedProject = null, identity = null;
  let cancelRevision = 0;
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
      BATCH_AUTHORIZATION_REQUIRED: tr('Revisa los prompts y autoriza el importe antes de generar.',
        'Review prompts and authorize the amount before generating.'),
      BATCH_PROMPT_INVALID: tr('Revisa el prompt en inglés, tipo y duración (1–12 s) de cada cue.',
        'Review the English prompt, kind and duration (1–12 s) for each cue.'),
      SFX_WAIT_LIMIT: tr('La toma sigue pendiente tras dos minutos. Consulta el historial; no se enviará otro trabajo.',
        'Take still pending after two minutes. Check history; no new job will be sent.'),
      SFX_IDENTITY: tr('La respuesta no coincide con la toma solicitada. Lote detenido.',
        'Response does not match the requested take. Batch stopped.'),
      SFX_NOT_CONFIGURED: tr('Modal no está configurado con límites de gasto. No se enviaron generaciones.',
        'Modal is not configured with spending limits. No generations were sent.'),
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
  function render() {
    const state = getState();
    if (!busy) loadRecords(state);
    const pending = state.project.proposals.filter(p => p.status === 'PENDING');
    const available = eligible(state);
    prepare.textContent = homePrepare.textContent = tr('Auto preparar show completo', 'Auto prepare entire show');
    acceptAll.textContent = automatic && stage === 'review-proposals'
      ? tr(`Aceptar todos (${pending.length}) y continuar`, `Accept all (${pending.length}) and continue`)
      : tr(`Aceptar todos los cues (${pending.length})`, `Accept all cues (${pending.length})`);
    audioAll.textContent = soundAll.textContent = tr(`Generar audio para todos (${available.length})`,
      `Generate audio for all (${available.length})`);
    cancel.textContent = soundCancel.textContent = tr('Cancelar lote', 'Cancel batch');
    prepare.disabled = homePrepare.disabled = busy || planning || !state.canApply || !state.metaAvailable || !state.project.scriptText.trim();
    acceptAll.disabled = busy || planning || !state.canApply || pending.length === 0;
    audioAll.disabled = soundAll.disabled = busy || planning || !historyAvailable || !state.canApply || available.length === 0;
    cancel.hidden = soundCancel.hidden = !busy;
    status.textContent = message || tr(
      'Una acción inicia la preparación. Revisa las propuestas antes de aceptarlas y escucha cada toma antes de incorporarla. Nada ejecuta GO.',
      'One action starts preparation. Review proposals before accepting them and listen to each take before importing. Nothing executes GO.');
    soundStatus.textContent = busy ? status.textContent : tr('En serie · sin reemplazar audio existente · revisión antes de incorporar',
      'Serial · no replacement of existing audio · review before import');
    results.replaceChildren();
    const latest = records.filter(r => state.project.cues.some(c => c.id === r.cueId)).slice(-100);
    for (const r of latest) {
      const cue = state.project.cues.find(c => c.id === r.cueId);
      const row = make('div', 'rq-preparation-result');
      const label = make('span');
      const changed = cueSoundIdentity(cue) !== r.cueIdentity;
      label.textContent = `${cue.number} · ${cue.label} · ${changed
        ? tr('Cue modificado o toma incorporada', 'Cue changed or take imported') : recordStatus(r)}`;
      const review = make('button', 'btn subtle small'); review.type = 'button';
      review.textContent = tr('Escuchar / revisar toma', 'Listen / review take');
      review.dataset.batchReview = r.requestId;
      review.disabled = busy || !state.canApply || changed;
      review.addEventListener('click', () => void openTake(r).catch(fail));
      row.append(label, review); results.append(row);
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
    authorization.checked = false;
    cost.textContent = tr(`Modal: ${count} solicitudes en serie. Máximo estimado del lote: $${(count * policy.estimatedMaxCostUsdPerRequest).toFixed(4)} USD. Límite diario: $${policy.dailyBudgetUsd}. Cada solicitud se reserva en el ledger; el saldo y los límites restantes se validan en el servidor.`,
      `Modal: ${count} serial requests. Estimated batch maximum: $${(count * policy.estimatedMaxCostUsdPerRequest).toFixed(4)} USD. Daily ceiling: $${policy.dailyBudgetUsd}. Each request is reserved in the ledger; remaining budget and limits are checked on the server.`);
    startAudio.disabled = count === 0;
  }
  async function showAudioPlan() {
    const revision = cancelRevision;
    if (!historyAvailable) throw new Error('PREPARATION_STORAGE_UNAVAILABLE');
    if (!getState().canApply || busy) throw new Error('SHOW_CHANGED');
    await ensureAudioIdle();
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
    const items = eligible(planState);
    if (!items.length) throw new Error('NO_PENDING_SOUND_CUES');
    title.textContent = tr('Generar audio para todos los cues pendientes', 'Generate audio for all pending cues');
    help.textContent = tr(
      `${plan.excluded.length} cues con audio existente, acciones no sonoras o música/voz no compatibles quedan fuera. Revisa y edita los prompts en inglés. Puedes deseleccionar cues. Las tomas quedan pendientes de escucha y aceptación; cancelar detiene nuevos envíos, no revoca costes ya reservados.`,
      `${plan.excluded.length} cues with existing audio, non-sound actions or unsupported music/voice are excluded. Review and edit English prompts. You can deselect cues. Takes await listening and acceptance; cancel stops new submissions, not already reserved costs.`);
    authorizationText.textContent = tr('He revisado los prompts seleccionados y autorizo las solicitudes y el máximo estimado indicado.',
      'I reviewed the selected prompts and authorize these requests and the displayed estimated maximum.');
    startAudio.textContent = tr('Generar lote autorizado', 'Generate authorized batch');
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
    updateCost(); dialog.showModal(); authorization.focus();
  }
  async function generateAudio() {
    if (busy || planning || !dialog.open) return;
    const revision = cancelRevision;
    planning = true; startAudio.disabled = true;
    try {
      const items = readSelected();
      validateAudioBatch(items, policy, authorization.checked);
      assertEditable(); await ensureAudioIdle(); assertEditable();
      if (revision !== cancelRevision) throw new Error('PREPARATION_CANCELLED');
      controller = new AbortController(); const signal = controller.signal;
      const startKey = projectKey;
      stage = 'audio'; status.classList.remove('error'); dialog.close(); setBusy(true);
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
        onComplete() { completed += 1; },
      });
      stage = 'review-audio';
      message = tr(`${completed}/${items.length} tomas generadas. Escucha y acepta cada una para su cue. El show sigue en borrador; GO es manual.`,
        `${completed}/${items.length} takes generated. Listen and accept each for its cue. Show remains a draft; GO is manual.`);
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
    const plan = planScriptAnalysis(state.project.scriptText);
    const start = state.coverage?.complete ? plan.windows.length : state.coverage?.nextWindowStart ?? 0;
    const count = Math.ceil((plan.windows.length - start) / state.windowsPerRequest);
    if (!window.confirm(tr(
      `Preparar este show con Meta Muse: hasta ${count} solicitudes para las ventanas pendientes del guion. El servidor reserva cada solicitud y bloquea al alcanzar los límites. No se reintentará un error. Después revisarás los cues; el audio necesitará autorización por importe y escucha. No se ejecutará GO.`,
      `Prepare this show with Meta Muse: up to ${count} requests for remaining script windows. The server reserves each request and blocks at the limits. No error retries. Then review cues; audio requires amount-specific authorization and listening. GO will not run.`))) return;
    openWorkspace('ai'); identity = sourceIdentity(state); expectedProject = null;
    automatic = true; stage = 'analysis'; controller = new AbortController();
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
        },
      });
      stage = 'review-proposals';
      message = tr('Guion analizado. Revisa las propuestas y pulsa «Aceptar todos y continuar» o acepta/rechaza individualmente. Aún no se ha generado audio.',
        'Script analyzed. Review proposals and choose “Accept all and continue” or decide individually. No audio generated yet.');
    } catch (error) {
      if (signal.aborted) throw new Error('PREPARATION_CANCELLED');
      throw error;
    } finally { controller = null; setBusy(false); }
  }
  async function acceptPending() {
    if (busy || !getState().canApply) throw new Error('SHOW_CHANGED');
    const pending = getState().project.proposals.filter(p => p.status === 'PENDING');
    if (!pending.length) return;
    if (!window.confirm(tr(`¿Aceptar las ${pending.length} propuestas pendientes revisadas? Se crearán cues DRAFT; no se reproducirá audio.`,
      `Accept all ${pending.length} reviewed pending proposals? DRAFT cues will be created; no audio will play.`))) return;
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
  for (const b of [prepare, homePrepare]) b.addEventListener('click', () => void prepareShow().catch(fail));
  acceptAll.addEventListener('click', () => void acceptPending().catch(fail));
  async function openAudioPlan() {
    if (planning || busy) return;
    planning = true; render();
    try { await showAudioPlan(); }
    finally { planning = false; render(); }
  }
  for (const b of [audioAll, soundAll]) b.addEventListener('click', () => void openAudioPlan().catch(fail));
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
    if (busy && stage === 'audio' && !getState().canApply) controller?.abort();
    render();
  });
  $('uiLocaleSelect')?.addEventListener('change', render);
  render();
}
