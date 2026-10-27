import { parseScript, getScriptLine } from '../core/script.mjs';
import { serializeShowProject, deserializeShowProject, normalizeShowProject, MAX_PROJECT_JSON_BYTES } from '../core/projectPersistence.mjs';
import { createNewShow, addAudioReference, addMockProposal, addModelProposals, decideProposal, assignAudioToCue, setCueSoundResolution, nextAvailableId, linkLocalAudioToCue, updateCueOperatorDetails, updateCuePlayback, updateCueAutomation, replaceCueAudioAsset } from '../core/workspace.mjs';
import { stageCueStopTransitions } from '../core/cueStopFades.mjs';
import { stageAddCueTrack, stageChangeCueTrack, stageRemoveCueTrack } from '../core/cueTracks.mjs';
import { createBrowserAudioBackend } from '../core/audioBackend.mjs';
import { normalizeCuePlayback } from '../core/cuePlayback.mjs';
import { exportPortableShow, importPortableShow, MAX_PORTABLE_ZIP_BYTES } from '../core/showArchive.mjs';
import { buildDemoPackage } from '../core/demoShow.mjs';
import { normalizeScriptLanguageHint } from '../core/scriptLanguage.mjs';
import { planScriptAnalysis } from '../core/sceneAnalysis.mjs';
import { inspectShowReadiness } from '../core/showPreflight.mjs';
import { newOperatorQueue, startOperatorQueue, previousOperatorCue, prepareOperatorCue, completePreparedCue, skipPreparedCue } from '../core/operatorQueue.mjs';
import { findScriptMatches, scriptWindow } from '../core/scriptNavigation.mjs';
import { readPreferredUiLocale, savePreferredUiLocale, translate, translateDocument, resolveErrorKey } from './i18n.mjs';

const $ = (id) => document.getElementById(id);
const sampleTexts = {
  en: 'SCENE 1. THE REHEARSAL BEGINS\n(Opening background music.)\nANNA: Is everything ready?\nLUKE: We are ready.\n(A bell rings in the distance.)\nANNA: Go ahead!\n',
  es: 'ESCENA 1. COMIENZA EL ENSAYO\n(Ambiente musical de apertura.)\nANA: ¿Está todo listo?\nLUIS: Preparados.\n(Suena una campana a lo lejos.)\nANA: ¡Adelante!\n',
};
const limitScriptBytes = 1_000_000;
const maximumShownLines = 300;
const metaWindowsPerRequest = 2;
let uiStorage;
try { uiStorage = window.localStorage; } catch { uiStorage = null; }
let uiLocale = readPreferredUiLocale(uiStorage);
const t = (key, values) => translate(uiLocale, key, values);
let statusState = { key: 'status.initial', values: {}, tone: 'info' };
let metaConnection = { state: 'checking', model: '' };
let show = createNewShow({ name: t('script.showNamePlaceholder') });
let dirty = false;
let projectGeneration = 0;
let metaAvailable = false;
let metaInFlight = false;
let metaCoverage = null;
let metaProposalDetails = new Map();
let pendingAudioCueId = null;
let audioInFlight = false;
let bundleInFlight = false;
let originalAudioFiles = new Map();
let scriptFocusLineId = null;
let scriptMatchIndex = 0;
let preflightVisible = false;
let editingCueId = null;
let selectedCueId = null; // Selection inspects only; it never changes the GO queue.
let inspectorTab = 'audio';
let inspectorPendingChanges = false;
let activeWorkspace = 'home';
const availableWorkspaces = Object.freeze(['home', 'script', 'ai', 'cues', 'audio', 'setup', 'operation']);
let operatorQueue = startOperatorQueue(show.cues);
let lastGoCueId = null;
let auditionAcknowledged = false;
const selectedModelProvider = () => $('modelProviderSelect').value === 'meta' ? 'meta' : 'baseten';
const expectedProviderId = p => p === 'meta' ? 'META_MODEL_API' : 'BASETEN_MUSE_SPARK_OPEN';
let player = createBrowserAudioBackend({ onStateChange: () => refreshAudioControls() });
function refreshAudioControls() {
  const status = $('transportStatus');
  if (!status) return;
  const { activeCueCount: active, pendingGoCount: pending, auditionActive, auditionPending } = player.getStatus();
  const auditioning = auditionActive || auditionPending;
  status.textContent = auditioning
    ? t('audio.auditionStatus')
    : active || pending
      ? t('status.transportRunning', { count: active, pending: pending ? t('status.transportPending', { count: pending }) : '' })
      : t('status.transportStopped');
  // Emergency stop must always be reachable, including pending asynchronous GO.
  $('stopAllBtn').disabled = false;
  $('operatorPanicBtn').disabled = false;
  $('stopAuditionBtn').disabled = !auditioning;
  $('loadAudioBtn').disabled = audioInFlight || auditioning || bundleInFlight;
  $('openBundleBtn').disabled = bundleInFlight || audioInFlight;
  $('saveBundleBtn').disabled = bundleInFlight || audioInFlight;
  for (const button of document.querySelectorAll('[data-asset-audition]')) {
    button.disabled = !player.hasAsset(button.dataset.assetAudition) || audioInFlight || auditioning || active > 0 || pending > 0;
  }
  for (const button of document.querySelectorAll('[data-cue-audio-pick]')) {
    button.disabled = audioInFlight || auditioning;
  }
  for (const label of document.querySelectorAll('[data-cue-state]')) {
    const cue = show.cues.find(item => item.id === label.dataset.cueState);
    if (!cue) continue;
    const unresolved = cue.actions.find(action => action.type === 'PLAN_AUDIO');
    const ready = !unresolved && cue.actions.every(action => player.hasAsset(action.assetId)) &&
      (cue.audioTracks ?? []).every(track => player.hasAsset(track.assetId));
    const playing = player.isPlaying(cue.id);
    const stopping = player.isStopping(cue.id);
    label.textContent = t(unresolved ? (unresolved.resolution === 'GENERATE' ? 'soundPlan.generationQueued' : 'soundPlan.unresolved') : stopping ? 'status.soundStopping' : playing ? 'status.soundPlaying' : ready ? 'status.soundReady' : 'status.soundMissing');
  }
  const prepared = show.cues.find(cue => cue.id === operatorQueue.preparedCueId);
  const preparedIndex = show.cues.findIndex(cue => cue.id === operatorQueue.preparedCueId);
  $('preparedCueStatus').textContent = prepared
    ? t('operator.nextCue', { number: prepared.number, label: prepared.label })
    : t(show.cues.length ? 'operator.sequenceFinished' : 'operator.noCues');
  const source = prepared?.sourceLineIds[0]
    ? getScriptLine(parseScript(show.scriptText), prepared.sourceLineIds[0])?.text ?? ''
    : '';
  $('operatorTrigger').textContent = prepared
    ? t('operator.triggerText', { trigger: (prepared.trigger?.trim() || source || t('operator.noTrigger')).slice(0, 240) })
    : '';
  const effects = [];
  if (prepared) {
    if (prepared.audioTracks?.length) effects.push(t('operator.effectTracks', {count:prepared.actions.length + prepared.audioTracks.length}));
    const settings = normalizeCuePlayback(prepared.playback);
    if (settings.loop) effects.push(t('operator.effectLoop'));
    else if (settings.repeatCount > 1) effects.push(t('operator.effectRepeat', { count: settings.repeatCount }));
    if (settings.startDelayMs) effects.push(t('operator.effectDelay', { ms: settings.startDelayMs }));
    if (settings.fadeInMs) effects.push(t('operator.effectFadeIn', { ms: settings.fadeInMs }));
    const stopTargets = (prepared.automation?.stopCueIds ?? []).map(id => {
      const target = show.cues.find(cue => cue.id === id);
      const duration = prepared.stopFadeOverrides?.[id] ?? target?.playback?.fadeOutMs ?? 0;
      return (target ? target.number + ' ' + target.label : id) + ' (' +
        t('cueEditor.fadeSeconds', { seconds: (duration / 1000).toFixed(1) }) + ')';
    });
    if (stopTargets.length) effects.push(t('operator.effectStops', { targets: stopTargets.join(', ') }));
  }
  $('operatorEffectSummary').textContent = prepared ? effects.join(' · ') : '';
  $('operatorProgress').textContent = prepared
    ? t('operator.progress', { current: preparedIndex + 1, total: show.cues.length })
    : show.cues.length ? t('operator.progressFinished', { total: show.cues.length }) : '';
  const last = show.cues.find(cue => cue.id === lastGoCueId);
  $('operatorLastGo').textContent = last
    ? t('operator.lastGo', { number: last.number, label: last.label })
    : t('operator.noLastGo');
  $('operatorGoBtn').disabled = !prepared || audioInFlight || auditioning || pending > 0 ||
    prepared.actions.some(action => action.type !== 'PLAY' || !player.hasAsset(action.assetId)) ||
    (prepared.audioTracks ?? []).some(track => !player.hasAsset(track.assetId)) ||
    player.isPlaying(prepared.id);
  $('operatorBackBtn').disabled = !show.cues.length || audioInFlight || pending > 0 ||
    preparedIndex === 0;
  $('operatorSkipBtn').disabled = !prepared || audioInFlight || pending > 0;
  $('operatorResetBtn').disabled = !show.cues.length || audioInFlight || pending > 0 ||
    (preparedIndex === 0 && !operatorQueue.completedCueIds.length && !operatorQueue.skippedCueIds.length);
  for (const button of document.querySelectorAll('[data-cue-action]')) {
    const cue = show.cues.find(item => item.id === button.dataset.cueId);
    if (!cue) continue;
    const playing = player.isPlaying(cue.id);
    const stopping = player.isStopping(cue.id);
    button.disabled = !playing || stopping;
  }
}

function renderWorkspaceShell() {
  document.querySelector('.shell').dataset.activeWorkspace = activeWorkspace;
  for (const panel of document.querySelectorAll('[data-workspaces]')) {
    panel.hidden = !panel.dataset.workspaces.split(' ').includes(activeWorkspace);
  }
  for (const button of document.querySelectorAll('[data-workspace-nav]')) {
    const selected = button.dataset.workspaceNav === activeWorkspace;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('is-current', selected);
  }
  $('workspaceTitle').textContent = t('workspace.' + activeWorkspace);
  $('workspaceDescription').textContent = t('workspace.description.' + activeWorkspace);
  $('activeShowTitle').textContent = show.name;
  $('saveState').textContent = t(dirty ? 'workspace.unsaved' : 'workspace.saved');
}

function setWorkspace(workspace) {
  if (!availableWorkspaces.includes(workspace)) throw new RangeError('Unknown workspace');
  if (workspace !== activeWorkspace && activeWorkspace === 'cues' && inspectorPendingChanges) {
    if (!confirmDiscardInspectorEdits()) return false;
    inspectorPendingChanges = false;
    renderCueInspector(); // Discard local form changes, not stored show data.
  }
  activeWorkspace = workspace;
  renderWorkspaceShell();
  return true;
}

function renderSetupReadiness() {
  const report = inspectShowReadiness(show, assetId => player.hasAsset(assetId), { audioLoading: audioInFlight });
  $('setupReadinessSummary').textContent = t(report.ready ? 'preflight.ready' : 'preflight.blocked', {
    ready: report.readyCues, total: report.totalCues,
    blockers: report.blockerCount, warnings: report.warningCount,
  });
  const issues = $('setupReadinessIssues');
  issues.replaceChildren();
  if (!report.issues.length) issues.append(node('li', '', t('preflight.noIssues')));
  for (const issue of report.issues.slice(0, 12)) {
    const name = show.assets.find(asset => asset.id === issue.assetId)?.name ?? issue.assetId ?? '';
    issues.append(node('li', issue.severity === 'BLOCKER' ? 'preflight-blocker' : 'preflight-warning',
      t('preflight.issue.' + issue.code, { number: issue.cueNumber ?? '', id: issue.proposalId ?? '', name })));
  }
  if (report.issues.length > 12) {
    issues.append(node('li', '', t('workspace.moreIssues', { count: report.issues.length - 12 })));
  }
}

function node(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = String(value);
  return element;
}
function feedback(key, values = {}, tone = 'info') {
  statusState = { key, values, tone };
  const target = $('statusMessage');
  target.textContent = t(key, values);
  target.dataset.tone = tone;
}
function showError(error, key) {
  feedback(key ?? resolveErrorKey(error), error?.uiValues ?? {}, 'error');
}
function refreshMetaMessage() {
  const provider = selectedModelProvider();
  const baseten = provider === 'baseten';
  $('metaStatus').textContent = metaConnection.state === 'configured'
    ? t(baseten ? 'status.basetenConfigured' : 'status.metaConfigured', { model: metaConnection.model })
    : t(metaConnection.state === 'unavailable'
      ? (baseten ? 'status.basetenUnavailable' : 'status.metaUnavailable')
      : metaConnection.state === 'error'
        ? (baseten ? 'status.basetenOffline' : 'status.metaOffline')
        : (baseten ? 'status.basetenChecking' : 'proposals.metaChecking'));
  $('analyzeMetaBtn').textContent = t(baseten ? 'proposals.basetenButton'
    : metaCoverage?.complete ? 'proposals.metaCompleteButton'
      : metaCoverage?.nextWindowStart ? 'proposals.metaNextButton' : 'proposals.metaButton');
  $('modelProviderDisclaimer').textContent = t(baseten ? 'proposals.basetenDisclaimer' : 'proposals.metaDisclaimer');
  $('metaCoverage').hidden = baseten;
  if (!baseten) {
    $('metaCoverage').textContent = !metaCoverage
      ? t('proposals.coverageNone')
      : t(metaCoverage.complete ? 'proposals.coverageComplete' : 'proposals.coverageProgress', {
          lines: metaCoverage.lineIds.size,
          totalLines: metaCoverage.totalLines,
          windows: metaCoverage.windowIds.size,
          totalWindows: metaCoverage.totalWindows,
          scenes: metaCoverage.sceneCount,
          observations: metaCoverage.observations,
          duplicates: metaCoverage.duplicates,
        });
  }
}

function resetMetaAnalysis() {
  metaCoverage = null;
  metaProposalDetails = new Map();
}

function safeProposalDetail(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const allowed = {
    cueKind: ['FX', 'AMBIENCE', 'MUSIC', 'VOICE', 'SILENCE', 'TRANSITION'],
    basis: ['EXPLICIT', 'SUGGESTED'],
    transport: ['PLAY', 'CONTINUE', 'STOP', 'SILENCE'],
  };
  if (!allowed.cueKind.includes(value.cueKind) || !allowed.basis.includes(value.basis) ||
      !allowed.transport.includes(value.transport) || typeof value.reason !== 'string' ||
      !value.reason.trim() || value.reason.length > 300) return null;
  return {
    cueKind: value.cueKind,
    basis: value.basis,
    transport: value.transport,
    reason: value.reason.trim(),
  };
}

function applyMetaCoverage(value, observations, duplicates) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Number.isSafeInteger(value.totalLines) || value.totalLines < 1 ||
      !Number.isSafeInteger(value.sceneCount) || value.sceneCount < 1 ||
      !Number.isSafeInteger(value.totalWindows) || value.totalWindows < 1 ||
      !Number.isSafeInteger(value.batchStartWindow) || value.batchStartWindow < 0 ||
      !Number.isSafeInteger(value.batchEndWindowExclusive) ||
      value.batchEndWindowExclusive <= value.batchStartWindow ||
      !Array.isArray(value.analyzedWindowIds) || !Array.isArray(value.analyzedLineIds) ||
      value.analyzedWindowIds.some(id => typeof id !== 'string') ||
      value.analyzedLineIds.some(id => typeof id !== 'string') ||
      !(value.nextWindowStart === null || (Number.isSafeInteger(value.nextWindowStart) && value.nextWindowStart >= 0)) ||
      typeof value.complete !== 'boolean') {
    throw uiError('errors.metaResponse');
  }
  if (!metaCoverage || value.batchStartWindow === 0) {
    metaCoverage = {
      totalLines: value.totalLines,
      sceneCount: value.sceneCount,
      totalWindows: value.totalWindows,
      windowIds: new Set(),
      lineIds: new Set(),
      nextWindowStart: 0,
      complete: false,
      observations: 0,
      duplicates: 0,
    };
  }
  if (metaCoverage.totalLines !== value.totalLines || metaCoverage.totalWindows !== value.totalWindows ||
      value.batchStartWindow !== metaCoverage.nextWindowStart) throw uiError('errors.metaResponse');
  for (const id of value.analyzedWindowIds) metaCoverage.windowIds.add(id);
  for (const id of value.analyzedLineIds) metaCoverage.lineIds.add(id);
  metaCoverage.nextWindowStart = value.nextWindowStart;
  metaCoverage.complete = value.complete;
  metaCoverage.observations += observations;
  metaCoverage.duplicates += duplicates;
}
function switchUiLocale(locale) {
  if (inspectorPendingChanges && !confirmDiscardInspectorEdits()) {
    $('uiLocaleSelect').value = uiLocale;
    return;
  }
  inspectorPendingChanges = false;
  const nameFieldValue = $('showName').value; // Never discard an unsaved edit.
  uiLocale = savePreferredUiLocale(uiStorage, locale);
  $('uiLocaleSelect').value = uiLocale;
  translateDocument(document, uiLocale);
  render();
  $('showName').value = nameFieldValue;
  refreshMetaMessage();
  feedback(statusState.key, statusState.values, statusState.tone);
}
function safeOperation(operation, successKey, values = {}) {
  try {
    const beforeCount = show.cues.length;
    const next = operation();
    if (next) show = next;
    // First approved cue becomes the NEXT GO automatically, not an audio action.
    if (!beforeCount && show.cues.length && !operatorQueue.preparedCueId) {
      operatorQueue = startOperatorQueue(show.cues);
    }
    dirty = true;
    render();
    feedback(successKey, values, 'success');
  } catch (error) {
    showError(error);
  }
}
function replaceOptions(select, entries, oldValue) {
  select.replaceChildren();
  for (const [value, label] of entries) {
    const option = node('option', '', label);
    option.value = value;
    select.append(option);
  }
  if (entries.some(([value]) => value === oldValue)) select.value = oldValue;
  select.disabled = entries.length === 0;
}
function describeCueActions(actions) {
  return actions.map(action => action.type === 'PLAY'
    ? 'PLAY → ' + (show.assets.find(asset => asset.id === action.assetId)?.name ?? action.assetId)
    : t(action.resolution === 'GENERATE' ? 'soundPlan.generationQueued' : 'soundPlan.unresolved') + ': ' + action.prompt
  ).join(' | ');
}
function pickAudioFile(cueId = null) {
  if (audioInFlight) return;
  pendingAudioCueId = cueId;
  $('audioFileInput').value = '';
  $('audioFileInput').click();
}

function cueAudioPicker(cueId, translationKey) {
  const button = node('button', 'btn accent small', t(translationKey));
  button.type = 'button';
  button.disabled = audioInFlight;
  button.dataset.cueAudioPick = cueId;
  button.addEventListener('click', () => pickAudioFile(cueId));
  return button;
}

function jumpToScriptLine(lineId) {
  if (!lineId) return;
  scriptFocusLineId = lineId;
  if (!setWorkspace('script')) return;
  render();
  const target = [...$('scriptPreview').querySelectorAll('[data-script-line-id]')]
    .find(item => item.dataset.scriptLineId === lineId);
  target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function moveScriptMatch(direction) {
  const matches = findScriptMatches(parseScript(show.scriptText), $('scriptSearchInput').value);
  if (!matches.length) return;
  scriptMatchIndex = (scriptMatchIndex + direction + matches.length) % matches.length;
  jumpToScriptLine(matches[scriptMatchIndex]);
}

function sourceButton(lineId) {
  const button = node('button', 'btn subtle small', t('script.viewSource'));
  button.type = 'button';
  button.addEventListener('click', () => jumpToScriptLine(lineId));
  return button;
}

function renderPreflight() {
  const report = $('preflightReport');
  report.hidden = !preflightVisible;
  if (!preflightVisible) return;
  const audit = inspectShowReadiness(show, assetId => player.hasAsset(assetId), { audioLoading: audioInFlight });
  $('preflightSummary').textContent = t(audit.ready ? 'preflight.ready' : 'preflight.blocked', {
    ready: audit.readyCues, total: audit.totalCues,
    blockers: audit.blockerCount, warnings: audit.warningCount,
  });
  const issues = $('preflightIssues');
  issues.replaceChildren();
  if (audit.issues.length === 0) issues.append(node('li', '', t('preflight.noIssues')));
  for (const issue of audit.issues) {
    const name = show.assets.find(asset => asset.id === issue.assetId)?.name ?? issue.assetId ?? '';
    issues.append(node('li', issue.severity === 'BLOCKER' ? 'preflight-blocker' : 'preflight-warning',
      t('preflight.issue.' + issue.code, { number: issue.cueNumber ?? '', id: issue.proposalId ?? '', name })));
  }
}

function cueDetailsEditor(cue) {
  const form = node('form', 'cue-details-editor');
  const labelCaption = node('label', 'field', t('cue.editorTitle'));
  const labelInput = node('input', '', '');
  labelInput.type = 'text';
  labelInput.maxLength = 200;
  labelInput.value = cue.label;
  labelInput.required = true;
  labelCaption.append(labelInput);
  const triggerCaption = node('label', 'field', t('cue.trigger'));
  const triggerInput = node('input', '', '');
  triggerInput.type = 'text';
  triggerInput.maxLength = 300;
  triggerInput.value = cue.trigger ?? '';
  triggerInput.placeholder = t('cue.triggerPlaceholder');
  triggerCaption.append(triggerInput);
  const notesCaption = node('label', 'field', t('cue.notes'));
  const notesInput = node('textarea', 'cue-notes-input');
  notesInput.maxLength = 1500;
  notesInput.rows = 3;
  notesInput.value = cue.notes ?? '';
  notesCaption.append(notesInput);
  const controls = node('div', 'item-actions');
  const save = node('button', 'btn primary small', t('cue.saveDetails'));
  save.type = 'submit';
  const cancel = node('button', 'btn subtle small', t('cue.cancelDetails'));
  cancel.type = 'button';
  cancel.addEventListener('click', () => { inspectorPendingChanges = false; editingCueId = null; render(); });
  controls.append(save, cancel);
  form.append(labelCaption, triggerCaption, notesCaption, controls);
  form.addEventListener('input', () => { inspectorPendingChanges = true; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      show = updateCueOperatorDetails(show, cue.id, {
        label: labelInput.value, trigger: triggerInput.value, notes: notesInput.value,
      });
      dirty = true;
      inspectorPendingChanges = false;
      editingCueId = null;
      render();
      feedback('status.cueDetailsSaved', { number: cue.number }, 'success');
    } catch (error) { showError(error); }
  });
  return form;
}


/** Only the row selection changes on ordinary mouse/keyboard navigation.
 * It cannot change GO position, start audio, or regenerate the page.
 */
function updateCueSelectionVisual() {
  const rows = [...$('cueList').querySelectorAll('[data-cue-select]')];
  const selectedIsVisible = rows.some(button => button.dataset.cueSelect === selectedCueId);
  rows.forEach((button, index) => {
    const selected = button.dataset.cueSelect === selectedCueId;
    button.setAttribute('aria-pressed', String(selected));
    button.tabIndex = selectedIsVisible ? (selected ? 0 : -1) : (index === 0 ? 0 : -1);
    button.closest('.cue-item')?.classList.toggle('cue-selected', selected);
  });
}

function confirmDiscardInspectorEdits() {
  return !inspectorPendingChanges || window.confirm(t('cueEditor.discardChanges'));
}

function selectCueForInspection(cueId) {
  if (!show.cues.some(cue => cue.id === cueId)) return false;
  if (cueId === selectedCueId) return true;
  if (!confirmDiscardInspectorEdits()) return false;
  selectedCueId = cueId;
  editingCueId = null;
  // Keep the same property section when reviewing consecutive cues;
  // only fall back if the newly selected cue has no playable audio.
  if (inspectorTab === 'audio' && !show.cues.find(cue => cue.id === cueId).actions.some(a => a.type === 'PLAY')) {
    inspectorTab = 'details';
  }
  inspectorPendingChanges = false;
  updateCueSelectionVisual();
  renderCueInspector();
  return true;
}

function renderCueList({ resetScroll = false } = {}) {
  const cueList = $('cueList');
  const priorScrollTop = cueList.scrollTop;
  cueList.replaceChildren();
  const cueQuery = $('cueSearchInput').value.trim().toLocaleLowerCase();
  const visibleCues = !cueQuery ? show.cues : show.cues.filter(cue => {
    const matchingAssets = cue.actions.map(action =>
      show.assets.find(asset => asset.id === action.assetId)?.name ?? '').join(' ');
    const searchable = [cue.number, cue.label, cue.trigger, cue.notes,
      cue.sourceLineIds.join(' '), matchingAssets].join(' ').toLocaleLowerCase();
    return searchable.includes(cueQuery);
  });
  $('cueSearchStatus').textContent = t('workspace.matchCount', { visible: visibleCues.length, total: show.cues.length });
  if (!show.cues.length) cueList.append(node('p', 'empty', t('status.noCues')));
  else if (!visibleCues.length) cueList.append(node('p', 'empty', t('workspace.noCueMatches')));
  for (const cue of visibleCues) {
    const card = node('article', 'item cue-item');
    if (cue.id === selectedCueId) card.classList.add('cue-selected');
    if (cue.id === operatorQueue.preparedCueId) card.classList.add('cue-prepared');
    const select = node('button', 'cue-row-select');
    select.type = 'button';
    select.dataset.cueSelect = cue.id;
    select.setAttribute('aria-label', t('cueEditor.selectCue', { number: cue.number, label: cue.label }));
    select.setAttribute('aria-pressed', String(cue.id === selectedCueId));
    const top = node('div', 'item-head cue-row-heading');
    top.append(node('strong', 'cue-row-title', cue.number + ' · ' + cue.label));
    const runtime = node('span', 'state', t('status.soundMissing'));
    runtime.dataset.cueState = cue.id;
    top.append(runtime);
    const detail = node('span', 'cue-row-meta', cue.sourceLineIds.join(', ') + ' · ' + describeCueActions(cue.actions));
    select.append(top, detail);
    if (cue.trigger) select.append(node('span', 'cue-row-trigger', t('cue.trigger') + ': ' + cue.trigger));
    if (cue.id === operatorQueue.preparedCueId) {
      select.append(node('span', 'cue-row-next', t('cueEditor.nextGo')));
    }
    select.addEventListener('click', () => selectCueForInspection(cue.id));
    select.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
      const index = visibleCues.findIndex(item => item.id === cue.id);
      const destination = event.key === 'ArrowDown' ? Math.min(index + 1, visibleCues.length - 1)
        : event.key === 'ArrowUp' ? Math.max(index - 1, 0)
        : event.key === 'Home' ? 0
        : event.key === 'End' ? visibleCues.length - 1 : -1;
      if (destination < 0) return;
      event.preventDefault();
      const next = visibleCues[destination];
      if (!next || !selectCueForInspection(next.id)) return;
      const target = [...cueList.querySelectorAll('[data-cue-select]')][destination];
      target?.focus();
      target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    card.append(select);
    const sourceActions = node('div', 'item-actions cue-edit-actions');
    sourceActions.append(sourceButton(cue.sourceLineIds[0]));
    card.append(sourceActions);
    // Editing belongs to the inspector, not to the scrolling cue list.
    const plan = cue.actions.find(action => action.type === 'PLAN_AUDIO');
    if (plan) {
      const resolve = node('div', 'item-actions cue-audio-tools');
      const deferred = node('button', 'btn subtle small', t('soundPlan.defer'));
      deferred.type = 'button';
      deferred.disabled = plan.resolution === 'DEFER';
      deferred.addEventListener('click', () => safeOperation(
        () => setCueSoundResolution(show, cue.id, 'DEFER'), 'soundPlan.deferredFeedback'
      ));
      const generate = node('button', 'btn accent small', t('soundPlan.prepareGeneration'));
      generate.type = 'button';
      generate.disabled = plan.resolution === 'GENERATE';
      generate.addEventListener('click', () => safeOperation(
        () => setCueSoundResolution(show, cue.id, 'GENERATE'), 'soundPlan.generationFeedback'
      ));
      resolve.append(cueAudioPicker(cue.id, 'soundPlan.loadFile'), deferred, generate);
      if (show.assets.length) {
        const library = node('select', '', '');
        library.setAttribute('aria-label', t('soundPlan.libraryLabel'));
        replaceOptions(library, show.assets.map(asset => [asset.id, asset.name]));
        const assign = node('button', 'btn primary small', t('soundPlan.assign'));
        assign.type = 'button';
        assign.addEventListener('click', () => safeOperation(
          () => assignAudioToCue(show, cue.id, library.value), 'soundPlan.assignedFeedback'
        ));
        resolve.append(library, assign);
      }
      card.append(resolve);
    } else if (cue.actions.length === 1 && cue.actions[0].type === 'PLAY') {
      const replaceAudio = node('div', 'item-actions cue-audio-tools');
      replaceAudio.append(cueAudioPicker(cue.id, 'soundPlan.replaceFile'));
      card.append(replaceAudio);
    }
    const controls = node('div', 'item-actions cue-operation-actions');
    const prepare = node('button', 'btn accent small', t('operator.setNext'));
    prepare.type = 'button';
    prepare.disabled = operatorQueue.preparedCueId === cue.id;
    prepare.addEventListener('click', () => {
      operatorQueue = prepareOperatorCue(operatorQueue, show.cues, cue.id);
      render();
      feedback('operator.preparedFeedback', { number: cue.number }, 'success');
    });
    controls.append(prepare);
    // Only the global prepared-sequence GO can start playback. Row buttons stop
    // an already-running cue or intentionally reposition the next GO.
    const commands = [['stop', t('actions.stop'), 'btn subtle small'], ['fade', t('actions.fade'), 'btn subtle small']];
    for (const [action, title, style] of commands) {
      const button = node('button', style, title);
      button.type = 'button';
      button.dataset.cueAction = action;
      button.dataset.cueId = cue.id;
      button.addEventListener('click', async () => {
        try {
          if (action === 'stop') {
            player.stopCue(cue.id);
            feedback('status.audioStopped', { number: cue.number }, 'success');
          } else {
            player.stopCue(cue.id, cue.playback?.fadeOutMs || 1500);
            feedback('status.audioFaded', { number: cue.number }, 'success');
          }
        } catch (error) { showError(error, resolveErrorKey(error) === 'errors.generic' ? 'errors.invalidAudio' : undefined); }
      });
      controls.append(button);
    }
    card.append(controls);
    cueList.append(card);
  }

  updateCueSelectionVisual();
  cueList.scrollTop = resetScroll ? 0 : priorScrollTop;
}

function render() {
  const lines = parseScript(show.scriptText);
  if (!show.cues.some(cue => cue.id === selectedCueId)) selectedCueId = show.cues[0]?.id ?? null;
  if (!show.cues.some(cue => cue.id === editingCueId)) editingCueId = null;
  $('showName').value = show.name;
  $('linesCount').textContent = show.scriptText ? String(lines.length) : '0';
  $('proposalsCount').textContent = String(show.proposals.length);
  $('cuesCount').textContent = String(show.cues.length);
  const preview = $('scriptPreview');
  preview.replaceChildren();
  const matches = findScriptMatches(lines, $('scriptSearchInput').value);
  if (scriptMatchIndex >= matches.length) scriptMatchIndex = 0;
  if (!show.scriptText) {
    preview.append(node('p', 'empty', t('status.scriptEmpty')));
  } else {
    const { start, visible } = scriptWindow(lines, scriptFocusLineId, maximumShownLines);
    for (const line of visible) {
      const row = node('div', 'script-line');
      row.dataset.scriptLineId = line.id;
      if (line.id === scriptFocusLineId) row.classList.add('script-line-focus');
      if (matches.includes(line.id)) row.classList.add('script-line-match');
      row.append(node('span', 'line-ref', line.id), node('span', 'line-text', line.text || ' '));
      preview.append(row);
    }
    if (start > 0 && !scriptFocusLineId) scriptFocusLineId = visible[0]?.id ?? null;
  }
  $('scriptLimitNote').textContent = lines.length > maximumShownLines ? t('script.windowNotice', { shown: Math.min(maximumShownLines, lines.length), total: lines.length }) : '';
  $('scriptSearchStatus').textContent = $('scriptSearchInput').value.trim()
    ? t('script.searchCount', { current: matches.length ? scriptMatchIndex + 1 : 0, total: matches.length })
    : '';
  $('scriptSearchPrevBtn').disabled = matches.length === 0;
  $('scriptSearchNextBtn').disabled = matches.length === 0;

  const list = $('assetList');
  list.replaceChildren();
  if (show.assets.length === 0) list.append(node('span', 'caption', t('status.noAssets')));
  for (const asset of show.assets) {
    const state = t(player.hasAsset(asset.id) ? 'status.loaded' : 'status.missingAsset');
    const row = node('div', 'asset-list-row');
    const label = node('span', 'tag', asset.id + ' · ' + asset.name + ' · ' + state);
    const audition = node('button', 'btn subtle small', t('audio.audition'));
    audition.type = 'button';
    audition.dataset.assetAudition = asset.id;
    audition.disabled = !player.hasAsset(asset.id);
    audition.addEventListener('click', async () => {
      if (!auditionAcknowledged) {
        if (!window.confirm(t('audio.auditionConfirm'))) return;
        auditionAcknowledged = true;
      }
      try {
        await player.auditionAsset(asset.id);
        feedback('audio.auditionStarted', { name: asset.name }, 'success');
      } catch (error) { showError(error); }
    });
    row.append(label, audition);
    list.append(row);
  }

  replaceOptions($('lineSelect'), show.scriptText ? lines.slice(0, 1000).map(line => [line.id, `${line.id} · ${line.text.slice(0, 90) || t('status.emptyLine')}`]) : [], $('lineSelect').value);
  replaceOptions($('assetSelect'), [['', t('soundPlan.defer')], ...show.assets.map(asset => [asset.id, `${asset.id} · ${asset.name}`])], $('assetSelect').value);
  $('createProposalBtn').disabled = !show.scriptText;
  $('analyzeMetaBtn').disabled = !metaAvailable || metaInFlight || !show.scriptText.trim() ||
    (selectedModelProvider() === 'meta' && metaCoverage?.complete === true);
  $('modelProviderSelect').disabled = metaInFlight;

  const proposalList = $('proposalList');
  proposalList.replaceChildren();
  if (!show.proposals.length) proposalList.append(node('p', 'empty', t('status.noProposals')));
  for (const proposal of show.proposals) {
    const card = node('article', 'item');
    const top = node('div', 'item-head');
    top.append(node('strong', '', proposal.label), node('span', 'state', t('status.' + proposal.status.toLowerCase())));
    top.append(node('span', 'state', t(proposal.source === 'META_MODEL_API' ? 'status.sourceMeta' :
      proposal.source === 'BASETEN_MUSE_SPARK_OPEN' ? 'status.sourceBaseten' : 'status.sourceManual')));
    card.append(top);
    const line = getScriptLine(lines, proposal.sourceLineIds[0]);
    card.append(node('p', 'item-detail', `${proposal.sourceLineIds.join(', ')} · ${line?.text ?? t('status.noSourceLine')}`));
    card.append(node('p', 'item-detail', describeCueActions(proposal.actions)));
    const modelDetail = metaProposalDetails.get(proposal.id);
    if (modelDetail) card.append(node('p', 'item-detail', t('proposals.analysisDetail', {
      kind: modelDetail.cueKind,
      basis: modelDetail.basis,
      transport: modelDetail.transport,
      reason: modelDetail.reason,
    })));
    if (proposal.status === 'PENDING') {
      const controls = node('div', 'item-actions');
      const approve = node('button', 'btn primary small', t('actions.approve'));
      approve.type = 'button';
      approve.addEventListener('click', () => safeOperation(() => decideProposal(show, proposal.id, 'APPROVE'), 'status.proposalApproved', { id: proposal.id }));
      const reject = node('button', 'btn subtle small', t('actions.reject'));
      reject.type = 'button';
      reject.addEventListener('click', () => safeOperation(() => decideProposal(show, proposal.id, 'REJECT'), 'status.proposalRejected', { id: proposal.id }));
      controls.append(approve, reject);
      card.append(controls);
    }
    const proposalSource = node('div', 'item-actions');
    proposalSource.append(sourceButton(proposal.sourceLineIds[0]));
    card.append(proposalSource);
    proposalList.append(card);
  }

  renderCueList();
  renderCueInspector();
  renderSetupReadiness();
  renderWorkspaceShell();
  refreshMetaMessage();
  refreshAudioControls();
  renderPreflight();
}

/**
 * Operator audio settings are persisted and actually executed by Web Audio.
 * This form is only mounted in the Cue Editor inspector; operation has one GO.
 */
function cuePlaybackEditor(cue) {
  const settings = normalizeCuePlayback(cue.playback);
  const form = node('form', 'cue-playback-editor');
  form.id = 'cuePlaybackForm';
  const heading = node('h4', 'inspector-section-heading', t('audioProps.heading'));
  form.append(heading);
  const inputs = new Map();
  function numericField(key, min, max, step, description) {
    const label = node('label', 'field', t('audioProps.' + key));
    const input = node('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.required = true;
    input.value = String(settings[key]);
    input.name = key;
    label.append(input);
    if (description) label.append(node('span', 'caption', t(description)));
    form.append(label);
    inputs.set(key, input);
    return input;
  }
  numericField('gainDb', -60, 0, 0.5, 'audioProps.gainHelp');
  numericField('fadeInMs', 0, 10000, 1);
  const fadeOut = numericField('fadeOutMs', 0, 10000, 1);
  numericField('startDelayMs', 0, 10000, 1);
  numericField('startAtMs', 0, 600000, 1, 'audioProps.startAtHelp');
  numericField('playbackRate', 0.5, 2, 0.05, 'audioProps.rateHelp');
  numericField('pan', -1, 1, 0.05, 'audioProps.panHelp');
  const repeats = numericField('repeatCount', 1, 20, 1, 'audioProps.repeatHelp');
  const loopLabel = node('label', 'cue-loop-field');
  const loop = node('input');
  loop.type = 'checkbox';
  loop.name = 'loop';
  loop.checked = settings.loop;
  loopLabel.append(loop, node('span', '', t('audioProps.loop')));
  form.append(loopLabel);
  function syncLoop() {
    if (loop.checked) {
      repeats.value = '1';
      fadeOut.value = '0';
    }
    repeats.disabled = loop.checked;
    fadeOut.disabled = loop.checked;
  }
  loop.addEventListener('change', syncLoop);
  syncLoop();
  form.append(node('p', 'caption', t('audioProps.noAuto')));
  const save = node('button', 'btn primary small', t('audioProps.save'));
  save.type = 'submit';
  form.append(save);
  form.addEventListener('input', () => { inspectorPendingChanges = true; });
  form.addEventListener('change', () => { inspectorPendingChanges = true; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const next = { loop: loop.checked };
    for (const [key, input] of inputs) {
      next[key] = Number(input.value);
    }
    if (loop.checked) { next.repeatCount = 1; next.fadeOutMs = 0; }
    try {
      show = updateCuePlayback(show, cue.id, next);
      inspectorPendingChanges = false;
      dirty = true;
      render();
      feedback('audioProps.saved', { number: cue.number }, 'success');
    } catch (error) { showError(error); }
  });
  return form;
}

function cueActionInspector(cue) {
  const pane = node('div', 'cue-actions-inspector');
  pane.append(node('h4', 'inspector-section-heading', t('cueEditor.assetSection')));
  for (const action of cue.actions) {
    const label = action.type === 'PLAY'
      ? 'PLAY · ' + (show.assets.find(asset => asset.id === action.assetId)?.name ?? action.assetId)
      : t(action.resolution === 'GENERATE' ? 'soundPlan.generationQueued' : 'soundPlan.unresolved');
    pane.append(node('div', 'inspector-action', label));
  }
  const plan = cue.actions.find(action => action.type === 'PLAN_AUDIO');
  const audioTools = node('div', 'cue-inspector-audio-tools');
  if (plan) {
    audioTools.append(cueAudioPicker(cue.id, 'soundPlan.loadFile'));
    const deferred = node('button', 'btn subtle small', t('soundPlan.defer'));
    deferred.type = 'button';
    deferred.disabled = plan.resolution === 'DEFER';
    deferred.addEventListener('click', () => safeOperation(
      () => setCueSoundResolution(show, cue.id, 'DEFER'), 'soundPlan.deferredFeedback'));
    const generate = node('button', 'btn accent small', t('soundPlan.prepareGeneration'));
    generate.type = 'button';
    generate.disabled = plan.resolution === 'GENERATE';
    generate.addEventListener('click', () => safeOperation(
      () => setCueSoundResolution(show, cue.id, 'GENERATE'), 'soundPlan.generationFeedback'));
    audioTools.append(deferred, generate);
    if (show.assets.length) {
      const library = node('select');
      library.setAttribute('aria-label', t('soundPlan.libraryLabel'));
      replaceOptions(library, show.assets.map(asset => [asset.id, asset.name]));
      const assign = node('button', 'btn primary small', t('soundPlan.assign'));
      assign.type = 'button';
      assign.addEventListener('click', () => safeOperation(
        () => assignAudioToCue(show, cue.id, library.value), 'soundPlan.assignedFeedback'));
      audioTools.append(library, assign);
    }
  } else if (cue.actions.length === 1 && cue.actions[0].type === 'PLAY') {
    audioTools.append(cueAudioPicker(cue.id, 'soundPlan.replaceFile'));
  }
  pane.append(audioTools);

  const otherCues = show.cues.filter(item => item.id !== cue.id);
  if (otherCues.length) {
    const form = node('form', 'cue-target-stop-editor');
    form.id = 'cueTargetStopForm';
    form.append(node('h4', 'inspector-section-heading', t('audioProps.stopTargets')));
    form.append(node('p', 'caption', t('audioProps.stopTargetsHelp')));
    const options = node('div', 'cue-stop-options');
    for (const item of otherCues) {
      const label = node('label', 'cue-stop-option');
      const check = node('input');
      check.type = 'checkbox';
      check.value = item.id;
      check.dataset.stopTarget = item.id;
      check.checked = (cue.automation?.stopCueIds ?? []).includes(item.id);
      const fadeWrap = node('span', 'cue-stop-fade');
      const fadeLabel = node('span', 'caption', t('cueEditor.stopFadeSeconds'));
      const fade = node('input');
      fade.type = 'number';
      fade.step = '0.1';
      fade.min = '0';
      fade.max = '10';
      fade.required = true;
      fade.dataset.stopFade = item.id;
      const existingMs = cue.stopFadeOverrides?.[item.id] ?? item.playback?.fadeOutMs ?? 0;
      fade.value = (existingMs / 1000).toFixed(1);
      fade.disabled = !check.checked;
      check.addEventListener('change', () => { fade.disabled = !check.checked; });
      fadeWrap.append(fadeLabel, fade);
      label.append(check, node('span', 'cue-stop-name', item.number + ' · ' + item.label), fadeWrap);
      options.append(label);
    }
    form.append(options);
    const save = node('button', 'btn primary small', t('cueEditor.saveActions'));
    save.type = 'submit';
    form.append(save);
    form.addEventListener('change', () => { inspectorPendingChanges = true; });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const transitions = [...form.querySelectorAll('input:checked')].map(input => {
        const fadeInput = [...form.querySelectorAll('[data-stop-fade]')]
          .find(element => element.dataset.stopFade === input.value);
        return { targetCueId: input.value, fadeMs: Math.round(Number(fadeInput.value) * 1000) };
      });
      try {
        show = normalizeShowProject(stageCueStopTransitions(show, cue.id, transitions));
        inspectorPendingChanges = false;
        dirty = true;
        render();
        feedback('cueEditor.actionsSaved', { number: cue.number }, 'success');
      } catch (error) { showError(error); }
    });
    pane.append(form);
  }
  if (cue.automation && cue.automation.mode !== 'MANUAL') {
    pane.append(node('p', 'inspector-warning', t('workspace.autoNotWired')));
  }
  return pane;
}


function cueAudioSourceControls(cue) {
  const block = node('div', 'cue-source-controls');
  const playable = cue.actions.filter(action => action.type === 'PLAY');
  if (cue.actions.length === 1 && playable.length === 1) {
    const asset = show.assets.find(item => item.id === playable[0].assetId);
    block.append(node('p', 'caption', t('cueEditor.currentAudio', {
      name: asset?.name ?? playable[0].assetId,
    })));
    block.append(cueAudioPicker(cue.id, 'cueEditor.replaceAudio'));
    if (show.assets.length > 1) {
      const pick = node('select');
      pick.id = 'cueReplaceLibrary';
      pick.setAttribute('aria-label', t('cueEditor.chooseLibraryAudio'));
      replaceOptions(pick, show.assets.map(item => [item.id, item.name]), playable[0].assetId);
      const assign = node('button', 'btn subtle small', t('cueEditor.useLibraryAudio'));
      assign.type = 'button';
      assign.addEventListener('click', () => {
        const status = player.getStatus();
        if (status.activeCueCount || status.pendingGoCount || status.auditionActive ||
            status.auditionPending || audioInFlight) {
          feedback('errors.audioWhilePlaying', {}, 'error');
          return;
        }
        safeOperation(() => replaceCueAudioAsset(show, cue.id, pick.value),
          'cueEditor.libraryReplaced', {number:cue.number});
      });
      block.append(pick, assign);
    }
  } else {
    block.append(node('p', 'caption', t('cueEditor.trackEditorPending')));
  }
  block.append(cueAdditionalTracksEditor(cue));
  return block;
}

function cueAdditionalTracksEditor(cue) {
  const group = node('section', 'extra-audio-tracks');
  group.append(node('h4', '', t('cueTracks.heading')));
  group.append(node('p', 'caption', t('cueTracks.explanation')));
  function commit(change, key) {
    const state = player.getStatus();
    if (audioInFlight || state.activeCueCount || state.pendingGoCount ||
        state.auditionActive || state.auditionPending) {
      feedback('errors.audioWhilePlaying', {}, 'error');
      return;
    }
    safeOperation(() => normalizeShowProject(change()), key, { number:cue.number });
  }
  const tracks = cue.audioTracks ?? [];
  for (const track of tracks) {
    const asset = show.assets.find(item => item.id === track.assetId);
    const wrapper = node('div', 'cue-extra-track');
    wrapper.dataset.extraTrack = track.id;
    const header = node('div', 'cue-track-header');
    header.append(node('strong', '', track.id + ' · ' + (asset?.name ?? track.assetId)));
    const remove = node('button', 'btn subtle small', t('cueTracks.remove'));
    remove.type = 'button';
    remove.addEventListener('click', () => {
      if (window.confirm(t('cueTracks.removeConfirm'))) {
        commit(() => stageRemoveCueTrack(show,cue.id,track.id),'cueTracks.removed');
      }
    });
    header.append(remove);
    wrapper.append(header);
    const chooser = node('div', 'cue-track-library');
    const select = node('select');
    select.setAttribute('aria-label', t('cueTracks.replace'));
    select.dataset.trackAsset = track.id;
    replaceOptions(select, show.assets.map(item => [item.id,item.name]), track.assetId);
    const replace = node('button', 'btn subtle small', t('cueTracks.replace'));
    replace.type = 'button';
    replace.addEventListener('click', () => commit(() =>
      stageChangeCueTrack(show,cue.id,track.id,{assetId:select.value}),'cueTracks.changed'));
    chooser.append(select, replace);
    wrapper.append(chooser);
    const details = node('details', 'cue-track-details');
    const summary = node('summary', '', t('cueTracks.properties'));
    details.append(summary);
    const form = node('form', 'cue-track-form');
    form.dataset.trackSettings = track.id;
    const settings = normalizeCuePlayback(track.playback);
    const fields = new Map();
    for (const [key,min,max,step] of [
      ['gainDb',-60,0,.5],['fadeInMs',0,10000,1],['fadeOutMs',0,10000,1],
      ['startDelayMs',0,10000,1],['startAtMs',0,600000,1],
      ['playbackRate',.5,2,.05],['pan',-1,1,.05],['repeatCount',1,20,1],
    ]) {
      const label = node('label', 'field', t('audioProps.'+key));
      const input = node('input');
      input.type='number';
      input.name=key;
      input.min=String(min); input.max=String(max); input.step=String(step);
      input.value=String(settings[key]); input.required=true;
      fields.set(key,input); label.append(input); form.append(label);
    }
    const loopLabel = node('label','cue-loop-field');
    const loop = node('input');
    loop.type='checkbox'; loop.name='loop'; loop.checked=settings.loop;
    loopLabel.append(loop,node('span','',t('audioProps.loop')));
    form.append(loopLabel);
    function syncLoop() {
      if (loop.checked) {
        fields.get('repeatCount').value='1';
        fields.get('fadeOutMs').value='0';
      }
      fields.get('repeatCount').disabled=loop.checked;
      fields.get('fadeOutMs').disabled=loop.checked;
    }
    loop.addEventListener('change',syncLoop);
    syncLoop();
    const save=node('button','btn primary small',t('cueTracks.saveProperties'));
    save.type='submit';
    form.append(save);
    form.addEventListener('input',()=>{inspectorPendingChanges=true;});
    form.addEventListener('change',()=>{inspectorPendingChanges=true;});
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const settingsNext={loop:loop.checked};
      for(const [key,input] of fields) settingsNext[key]=Number(input.value);
      if(loop.checked){settingsNext.repeatCount=1;settingsNext.fadeOutMs=0;}
      try {
        commit(()=>stageChangeCueTrack(show,cue.id,track.id,{playback:settingsNext}),'cueTracks.savedProperties');
        inspectorPendingChanges=false;
      } catch(error){showError(error);}
    });
    details.append(form);
    wrapper.append(details);
    group.append(wrapper);
  }
  if (cue.actions.every(action=>action.type==='PLAY') && tracks.length < 11 && show.assets.length) {
    const addRow = node('div','cue-track-library');
    const select = node('select');
    select.id = 'cueAddTrackSelect';
    select.setAttribute('aria-label',t('cueTracks.choose'));
    replaceOptions(select,show.assets.map(asset=>[asset.id,asset.name]));
    const add = node('button','btn accent small',t('cueTracks.add'));
    add.id='cueAddTrackBtn'; add.type='button';
    add.addEventListener('click',()=>commit(
      ()=>stageAddCueTrack(show,cue.id,select.value),'cueTracks.added'));
    addRow.append(select,add);
    group.append(addRow);
  }
  if (!show.assets.length) group.append(node('p','caption',t('cueTracks.libraryEmpty')));
  return group;
}

function renderCueInspector() {
  const inspector = $('cueInspector');
  const previousScrollTop = inspector.scrollTop;
  inspector.replaceChildren();
  const cue = show.cues.find(item => item.id === selectedCueId);
  if (!cue) {
    inspector.append(node('h3', '', t('workspace.inspector')));
    inspector.append(node('p', 'empty', t('workspace.noSelection')));
    return;
  }
  const header = node('div', 'inspector-title');
  header.append(node('strong', '', cue.number + ' · ' + cue.label),
    node('span', 'state', cue.id === operatorQueue.preparedCueId
      ? t('workspace.prepared') : t('workspace.selected')));
  inspector.append(header);
  inspector.append(node('p', 'cue-inspector-origin', cue.sourceLineIds.join(', ') + ' · ' +
    (cue.trigger || t('cueEditor.noTrigger'))));
  const available = cue.actions.some(a => a.type === 'PLAY')
    ? ['details', 'audio', 'actions'] : ['details', 'actions'];
  if (!available.includes(inspectorTab)) inspectorTab = available[0];
  const tabs = node('div', 'cue-inspector-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', t('cueEditor.inspectorSections'));
  const panelId = 'cueInspectorPanel';
  function changeTab(next) {
    if (next === inspectorTab || !available.includes(next) || !confirmDiscardInspectorEdits()) return;
    inspectorTab = next;
    inspectorPendingChanges = false;
    renderCueInspector();
    inspector.scrollTop = 0;
    inspector.querySelector('[data-inspector-tab="' + next + '"]')?.focus();
  }
  for (const [index, name] of available.entries()) {
    const tab = node('button', 'cue-inspector-tab', t('cueEditor.tab.' + name));
    tab.type = 'button';
    tab.dataset.inspectorTab = name;
    tab.id = 'cueInspectorTab-' + name;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panelId);
    tab.setAttribute('aria-selected', String(name === inspectorTab));
    tab.tabIndex = name === inspectorTab ? 0 : -1;
    tab.addEventListener('click', () => changeTab(name));
    tab.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      changeTab(available[(index + delta + available.length) % available.length]);
    });
    tabs.append(tab);
  }
  inspector.append(tabs);
  const panel = node('div', 'cue-inspector-panel');
  panel.id = panelId;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', 'cueInspectorTab-' + inspectorTab);
  if (inspectorTab === 'details') {
    panel.append(cueDetailsEditor(cue));
    panel.append(sourceButton(cue.sourceLineIds[0]));
  } else if (inspectorTab === 'audio') {
    panel.append(cueAudioSourceControls(cue));
    panel.append(cuePlaybackEditor(cue));
    panel.append(node('p', 'caption', t('audioProps.currentLimits')));
  } else {
    panel.append(cueActionInspector(cue));
    panel.append(sourceButton(cue.sourceLineIds[0]));
  }
  inspector.append(panel);
  inspector.scrollTop = previousScrollTop;
}

function userAllowsReplacement() {
  if (inspectorPendingChanges && !window.confirm(t('cueEditor.discardChanges'))) return false;
  if (!dirty && !show.scriptText && !show.proposals.length && !show.assets.length) return true;
  return window.confirm(t('status.replaceConfirm'));
}
function saveProject() {
  if (inspectorPendingChanges) throw uiError('cueEditor.saveEditsFirst');
  const name = $('showName').value.trim();
  const serialized = serializeShowProject({ ...show, name });
  show = deserializeShowProject(serialized);
  const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'showcompiler-' + show.id + '.json';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  dirty = false;
  render();
  feedback('status.saveDone', {}, 'success');
}
async function readTextFile(file, maxBytes) {
  if (!file) return null;
  if (file.size > maxBytes) throw uiError('errors.fileTooLarge', { limit: maxBytes });
  const buffer = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { throw uiError('errors.invalidUtf8'); }
}
function uiError(key, values = {}) {
  const error = new Error(key);
  error.uiKey = key;
  error.uiValues = values;
  return error;
}

function resetScriptLanguageHint() {
  $('scriptLanguageSelect').value = 'auto';
  $('scriptLanguageCustom').value = '';
  $('scriptLanguageCustom').hidden = true;
}

function currentScriptLanguageHint() {
  const choice = $('scriptLanguageSelect').value;
  if (choice === 'other' && !$('scriptLanguageCustom').value.trim()) throw uiError('errors.languageHint');
  return normalizeScriptLanguageHint(choice === 'other' ? $('scriptLanguageCustom').value : choice);
}

function setNewShow(project, statusKey, values = {}) {
  projectGeneration += 1;
  scriptFocusLineId = null;
  scriptMatchIndex = 0;
  preflightVisible = false;
  editingCueId = null;
  selectedCueId = null;
  inspectorTab = 'audio';
  inspectorPendingChanges = false;
  operatorQueue = startOperatorQueue(project.cues);
  lastGoCueId = null;
  $('scriptSearchInput').value = '';
  player.reset();
  originalAudioFiles.clear();
  show = project;
  resetMetaAnalysis();
  dirty = true;
  resetScriptLanguageHint();
  render();
  feedback(statusKey, values, 'success');
}

$('uiLocaleSelect').addEventListener('change', event => switchUiLocale(event.target.value));
$('cueSearchInput').addEventListener('input', () => { renderCueList({ resetScroll:true }); refreshAudioControls(); });
for (const button of document.querySelectorAll('[data-workspace-nav]')) {
  button.addEventListener('click', () => setWorkspace(button.dataset.workspaceNav));
}
$('setupOpenOperationBtn').addEventListener('click', () => setWorkspace('operation'));
$('homeNewBtn').addEventListener('click', () => $('newShowBtn').click());
$('homeOpenZipBtn').addEventListener('click', () => $('openBundleBtn').click());
$('homeImportScriptBtn').addEventListener('click', () => $('scriptFileInput').click());
$('homeDemoBtn').addEventListener('click', () => $('audibleExampleBtn').click());
$('scriptSearchInput').addEventListener('input', () => {
  scriptMatchIndex = 0;
  const matches = findScriptMatches(parseScript(show.scriptText), $('scriptSearchInput').value);
  scriptFocusLineId = matches[0] ?? null;
  render();
  const first = $('scriptPreview').querySelector('.script-line-focus');
  first?.scrollIntoView({ block: 'nearest' });
});
$('scriptSearchInput').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    moveScriptMatch(event.shiftKey ? -1 : 1);
  }
});
$('scriptSearchPrevBtn').addEventListener('click', () => moveScriptMatch(-1));
$('scriptSearchNextBtn').addEventListener('click', () => moveScriptMatch(1));
$('checkPreflightBtn').addEventListener('click', () => {
  preflightVisible = !preflightVisible;
  renderPreflight();
});
$('operatorGoBtn').addEventListener('click', async () => {
  const id = operatorQueue.preparedCueId;
  if (!id || audioInFlight) return;
  const generation = projectGeneration;
  const cue = normalizeShowProject(show).cues.find(item => item.id === id);
  if (!cue) return;
  try {
    // Operator-authored stop targets execute before this cue's PLAY; an AI
    // proposal cannot insert stop targets or start automatic following.
    for (const targetId of cue.automation?.stopCueIds ?? []) {
      const target = show.cues.find(item => item.id === targetId);
      player.stopCue(targetId, cue.stopFadeOverrides?.[targetId] ?? target?.playback?.fadeOutMs ?? 0);
    }
    await player.go(cue);
    if (generation !== projectGeneration) return; // The previous show must not move the new playhead.
    lastGoCueId = id;
    if (operatorQueue.preparedCueId === id) {
      operatorQueue = completePreparedCue(operatorQueue, show.cues, id);
    }
    render();
    feedback('operator.goFeedback', { number: cue.number }, 'success');
  } catch (error) { showError(error); }
});
$('operatorSkipBtn').addEventListener('click', () => {
  if (!operatorQueue.preparedCueId || audioInFlight) return;
  const cue = show.cues.find(item => item.id === operatorQueue.preparedCueId);
  if (!cue) return;
  try {
    operatorQueue = skipPreparedCue(operatorQueue, show.cues);
    render();
    feedback('operator.skippedFeedback', { number: cue.number }, 'success');
  } catch (error) { showError(error); }
});
$('operatorBackBtn').addEventListener('click', () => {
  operatorQueue = previousOperatorCue(operatorQueue, show.cues);
  render();
});
$('operatorResetBtn').addEventListener('click', () => {
  const transport = player.getStatus();
  if (transport.pendingGoCount || audioInFlight) return;
  // Restart is a position reset, not a hidden STOP; require silence first.
  if (transport.activeCueCount || transport.auditionActive || transport.auditionPending) {
    feedback('operator.stopBeforeRestart', {}, 'error');
    return;
  }
  operatorQueue = startOperatorQueue(show.cues);
  lastGoCueId = null;
  render();
  feedback('operator.resetFeedback', {}, 'success');
});
$('scriptLanguageSelect').addEventListener('change', event => {
  const custom = event.target.value === 'other';
  $('scriptLanguageCustom').hidden = !custom;
  if (custom) $('scriptLanguageCustom').focus();
});

$('exampleBtn').addEventListener('click', () => {
  if (!userAllowsReplacement()) return;
  setNewShow(
    createNewShow({
      name: uiLocale === 'es' ? 'Escena de prueba' : 'Sample scene',
      scriptText: sampleTexts[uiLocale],
    }),
    'status.exampleLoaded'
  );
});

$('newShowBtn').addEventListener('click', () => {
  if (!userAllowsReplacement()) return;
  setNewShow(createNewShow({ name: t('script.showNamePlaceholder') }), 'status.newShow');
  dirty = false;
  setWorkspace('script');
});
$('importScriptBtn').addEventListener('click', () => $('scriptFileInput').click());
$('scriptFileInput').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !userAllowsReplacement()) return;
  try {
    if (!file.name.toLowerCase().endsWith('.txt')) throw uiError('errors.onlyTxt');
    const text = await readTextFile(file, limitScriptBytes);
    const name = file.name.replace(/\.txt$/i, '').slice(0, 120).trim() || t('script.showNamePlaceholder');
    setNewShow(createNewShow({ name, scriptText: text }), 'status.scriptImported', { name: file.name });
    setWorkspace('script');
  } catch (error) { showError(error); }
});
$('assetForm').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('assetName');
  const name = input.value;
  safeOperation(() => addAudioReference(show, name), 'status.assetAdded');
  if (show.assets.some(asset => asset.name === name.trim())) input.value = '';
});
$('proposalForm').addEventListener('submit', event => {
  event.preventDefault();
  const label = $('proposalLabel').value;
  safeOperation(
    () => addMockProposal(show, {
      label, lineId: $('lineSelect').value, assetId: $('assetSelect').value,
    }),
    'status.mockAdded'
  );
  if (show.proposals.some(proposal => proposal.label === label)) $('proposalLabel').value = '';
});
$('showName').addEventListener('change', () => safeOperation(
  () => normalizeShowProject({ ...show, name: $('showName').value.trim() }),
  'status.nameChanged'
));
$('saveProjectBtn').addEventListener('click', () => {
  try { saveProject(); }
  catch (error) { showError(error); }
});
/**
 * Save a real self-contained ZIP. JSON Save remains available as a lightweight
 * interchange format, but is NOT presented as a full audio-inclusive backup.
 */
$('saveBundleBtn').addEventListener('click', async () => {
  if (bundleInFlight || audioInFlight) return;
  if (inspectorPendingChanges) {
    feedback('cueEditor.saveEditsFirst', {}, 'error');
    return;
  }
  const before = show;
  const generation = projectGeneration;
  bundleInFlight = true;
  audioInFlight = true; // Prevent GO/loading while reading the original files.
  refreshAudioControls();
  feedback('bundle.saving');
  try {
    const canonical = normalizeShowProject({ ...before, name: $('showName').value.trim() });
    const zip = await exportPortableShow(canonical, originalAudioFiles);
    if (generation !== projectGeneration || show !== before) throw uiError('errors.projectChanged');
    const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'showcompiler-' + canonical.id.replace(/[^A-Za-z0-9._-]/g, '-') + '.showcompiler.zip';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    show = canonical;
    dirty = false;
    render();
    feedback('bundle.saved', { count: canonical.assets.length }, 'success');
  } catch (error) {
    feedback('bundle.failed', { reason: String(error?.message ?? 'Invalid package').slice(0, 180) }, 'error');
  } finally {
    bundleInFlight = false;
    audioInFlight = false;
    render();
  }
});
$('openBundleBtn').addEventListener('click', () => {
  if (bundleInFlight || audioInFlight) return;
  $('bundleFileInput').click();
});
async function loadCompleteZip(inputBytes) {
  const before = show;
  const generation = projectGeneration;
  const previousPlayer = player;
  const stage = createBrowserAudioBackend({ onStateChange: () => refreshAudioControls() });
  const decoded = new Map();
  let committed = false;
  bundleInFlight = true;
  audioInFlight = true;
  refreshAudioControls();
  feedback('bundle.importing');
  try {
    const beforeTransport = player.getStatus();
    if (beforeTransport.activeCueCount || beforeTransport.pendingGoCount ||
        beforeTransport.auditionActive || beforeTransport.auditionPending) {
      throw uiError('bundle.busy');
    }
    const archive = await importPortableShow(inputBytes);
    // Stage all audio decoding without touching the playing engine or project.
    for (const item of archive.audioFiles) {
      const restoredFile = new File([item.bytes], item.name, { type: 'application/octet-stream' });
      await stage.loadFile(restoredFile, item.assetId);
      decoded.set(item.assetId, restoredFile);
    }
    if (generation !== projectGeneration || show !== before || player !== previousPlayer) {
      throw uiError('errors.projectChanged');
    }
    const status = player.getStatus();
    if (status.activeCueCount || status.pendingGoCount ||
        status.auditionActive || status.auditionPending) throw uiError('bundle.busy');
    setNewShow(archive.project, 'bundle.opened', {
      name: archive.project.name, count: archive.audioFiles.length,
    });
    player = stage;
    originalAudioFiles = decoded;
    committed = true;
    dirty = false;
    setWorkspace('cues');
    render();
    feedback('bundle.opened', { name: show.name, count: decoded.size }, 'success');
    void previousPlayer.dispose().catch(() => {});
  } catch (error) {
    feedback('bundle.failed', { reason: String(error?.message ?? 'Invalid package').slice(0, 180) }, 'error');
  } finally {
    if (!committed) {
      try { await stage.dispose(); } catch {}
    }
    bundleInFlight = false;
    audioInFlight = false;
    render();
  }
}

$('bundleFileInput').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || bundleInFlight || audioInFlight || !userAllowsReplacement()) return;
  if (!file.name.toLowerCase().endsWith('.zip') ||
      file.size < 22 || file.size > MAX_PORTABLE_ZIP_BYTES) {
    showError(uiError('bundle.invalidFile'));
    return;
  }
  try {
    await loadCompleteZip(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    feedback('bundle.failed', { reason: String(error?.message ?? 'Invalid package').slice(0, 180) }, 'error');
  }
});

$('audibleExampleBtn').addEventListener('click', async () => {
  if (bundleInFlight || audioInFlight || !userAllowsReplacement()) return;
  const before = show;
  const generation = projectGeneration;
  try {
    feedback('bundle.preparingDemo');
    const { archive } = await buildDemoPackage(); // Original sound synthesis in this browser.
    if (show !== before || generation !== projectGeneration) throw uiError('errors.projectChanged');
    await loadCompleteZip(archive);
  } catch (error) {
    feedback('bundle.failed', { reason: String(error?.message ?? 'Unable to create demo').slice(0, 180) }, 'error');
  }
});

$('openProjectBtn').addEventListener('click', () => $('projectFileInput').click());
$('projectFileInput').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !userAllowsReplacement()) return;
  try {
    if (!file.name.toLowerCase().endsWith('.json')) throw uiError('errors.onlyJson');
    const text = await readTextFile(file, MAX_PROJECT_JSON_BYTES);
    const restored = deserializeShowProject(text);
    setNewShow(restored, 'status.projectOpened', { name: restored.name });
    dirty = false;
    setWorkspace(restored.cues.length ? 'cues' : 'script');
  } catch (error) { showError(error); }
});

async function refreshMetaStatus() {
  const provider = selectedModelProvider();
  metaAvailable = false;
  metaConnection = { state: 'checking', model: '' };
  refreshMetaMessage();
  render();
  try {
    const response = await fetch('/api/' + provider + '/status', { cache: 'no-store' });
    if (!response.ok) throw uiError('errors.metaService');
    const status = await response.json();
    if (selectedModelProvider() !== provider) return; // Discard stale status.
    metaAvailable = status.provider === expectedProviderId(provider) && status.configured === true;
    metaConnection = {
      state: metaAvailable ? 'configured' : 'unavailable',
      model: typeof status.model === 'string' ? status.model : '',
    };
  } catch {
    if (selectedModelProvider() !== provider) return;
    metaAvailable = false;
    metaConnection = { state: 'error', model: '' };
  } finally {
    if (selectedModelProvider() === provider) {
      refreshMetaMessage();
      render();
    }
  }
}

const remoteErrors = Object.freeze({
  META_AUTH: 'errors.metaAuth',
  META_RATE: 'errors.metaRate',
  META_BAD_REQUEST: 'errors.metaBadRequest',
  META_NOT_CONFIGURED: 'errors.metaUnconfigured',
  META_BUSY: 'errors.metaBusy',
  META_INVALID_PROJECT: 'errors.metaInvalidProject',
  META_TOO_LARGE: 'errors.metaTooLarge',
  META_SERVICE: 'errors.metaService',
  META_SCHEMA_INCOMPATIBLE: 'errors.metaSchemaIncompatible',
  META_TIMEOUT: 'errors.metaTimeout',
  META_TRANSPORT: 'errors.metaTransport',
  META_UPSTREAM_ENVELOPE: 'errors.metaUpstreamEnvelope',
  META_BILLING: 'errors.metaBilling',
  META_MODEL_NOT_FOUND: 'errors.metaModelNotFound',
  META_UPSTREAM_TIMEOUT: 'errors.metaUpstreamTimeout',
  META_UPSTREAM_HTTP: 'errors.metaUpstreamHttp',
  META_OUTPUT_TRUNCATED: 'errors.metaOutputTruncated',
  META_OUTPUT_NOT_JSON: 'errors.metaOutputNotJson',
  META_OUTPUT_SCHEMA: 'errors.metaOutputSchema',
  META_OUTPUT_EMPTY_OR_OVERSIZED: 'errors.metaOutputEmpty',
  META_OUTPUT_REFUSED: 'errors.metaOutputRefused',
  META_OUTPUT_FINISH_REASON: 'errors.metaOutputFinish',
  META_OUTPUT_SEMANTIC: 'errors.metaOutputSemantic',
  META_BAD_REFERENCES: 'errors.metaBadReferences',
  BASETEN_AUTH: 'errors.basetenAuth',
  BASETEN_RATE: 'errors.basetenRate',
  BASETEN_MODEL: 'errors.basetenModel',
  BASETEN_UNCONFIGURED: 'errors.basetenUnconfigured',
  BASETEN_BUSY: 'errors.basetenBusy',
  BASETEN_INVALID: 'errors.basetenInvalid',
  BASETEN_TOO_LARGE: 'errors.basetenTooLarge',
  BASETEN_SERVICE: 'errors.basetenService',
  BASETEN_OUTPUT_TRUNCATED: 'errors.basetenOutputTruncated',
  BASETEN_OUTPUT_NOT_JSON: 'errors.basetenOutputNotJson',
  BASETEN_OUTPUT_SCHEMA: 'errors.basetenOutputSchema',
  BASETEN_OUTPUT_EMPTY_OR_OVERSIZED: 'errors.basetenOutputEmpty',
  BASETEN_BAD_REFERENCES: 'errors.basetenBadReferences',
});
$('modelProviderSelect').addEventListener('change', () => {
  refreshMetaStatus();
});
$('analyzeMetaBtn').addEventListener('click', async () => {
  if (metaInFlight || !metaAvailable) return;
  let snapshot;
  let scriptLanguage;
  try {
    snapshot = serializeShowProject(show);
    scriptLanguage = currentScriptLanguageHint();
  } catch (error) { showError(error); return; }
  const provider = selectedModelProvider();
  let analysisWindowStart;
  if (provider === 'meta') {
    const plan = planScriptAnalysis(show.scriptText);
    analysisWindowStart = metaCoverage?.nextWindowStart ?? 0;
    const batch = plan.windows.slice(analysisWindowStart, analysisWindowStart + metaWindowsPerRequest);
    if (!batch.length) { showError(uiError('errors.metaResponse')); return; }
    const lineCount = batch.reduce((sum, window) => sum + window.coreLines.length, 0);
    if (!window.confirm(t('status.confirmMeta', {
      windowCount: batch.length,
      lineCount,
      startWindow: analysisWindowStart + 1,
      endWindow: analysisWindowStart + batch.length,
      totalWindows: plan.windows.length,
    }))) return;
  } else if (!window.confirm(t('status.confirmBaseten'))) return;
  const generation = projectGeneration;
  metaInFlight = true;
  render();
  feedback(provider === 'baseten' ? 'status.basetenInProgress' : 'status.metaInProgress');
  try {
    const response = await fetch('/api/' + provider + '/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: JSON.parse(snapshot),
        scriptLanguage,
        ...(provider === 'meta' ? { analysisWindowStart } : {}),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw uiError(remoteErrors[result.code] ?? 'errors.metaService');
    if (selectedModelProvider() !== provider || generation !== projectGeneration || serializeShowProject(show) !== snapshot) {
      throw uiError('errors.projectChanged');
    }
    if (result.provider !== expectedProviderId(provider) || !Array.isArray(result.proposals)) {
      throw uiError('errors.metaResponse');
    }
    const count = result.proposals.length;
    const previousProposalCount = show.proposals.length;
    const nextShow = addModelProposals(show, result.proposals, result.provider);
    if (provider === 'meta') {
      const details = result.proposalDetails === undefined ? [] : result.proposalDetails;
      const observations = result.observations === undefined ? [] : result.observations;
      const duplicates = result.duplicatesRemoved === undefined ? 0 : result.duplicatesRemoved;
      if (!Array.isArray(details) || (details.length && details.length !== count) ||
          !Array.isArray(observations) || !Number.isSafeInteger(duplicates) || duplicates < 0) {
        throw uiError('errors.metaResponse');
      }
      const created = nextShow.proposals.slice(previousProposalCount);
      const normalizedDetails = details.map(safeProposalDetail);
      if (normalizedDetails.some(detail => !detail)) throw uiError('errors.metaResponse');
      applyMetaCoverage(result.coverage, observations.length, duplicates);
      created.forEach((proposal, index) => {
        if (normalizedDetails[index]) metaProposalDetails.set(proposal.id, normalizedDetails[index]);
      });
    }
    show = nextShow;
    dirty = true;
    render();
    feedback(provider === 'baseten' ? 'status.basetenImported' : 'status.metaImported', { count }, 'success');
  } catch (error) {
    showError(error);
  } finally {
    metaInFlight = false;
    render();
  }
});

function emergencyStopAllAudio() {
  player.stopAll();
  feedback('status.panic', {}, 'success');
}
$('stopAllBtn').addEventListener('click', emergencyStopAllAudio);
$('operatorPanicBtn').addEventListener('click', emergencyStopAllAudio);
$('stopAuditionBtn').addEventListener('click', () => {
  if (player.stopAudition()) feedback('audio.auditionStopped', {}, 'success');
});
$('loadAudioBtn').addEventListener('click', () => pickAudioFile());
$('audioFileInput').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  const cueId = pendingAudioCueId;
  pendingAudioCueId = null;
  event.target.value = '';
  if (!file || audioInFlight) return;
  audioInFlight = true;
  refreshAudioControls();
  const generation = projectGeneration;
  const before = show;
  const button = $('loadAudioBtn');
  button.disabled = true;
  try {
    if (file.name.length > 200) throw uiError('errors.audioFilenameLong');
    const existing = before.assets.filter(asset => asset.name === file.name);
    if (existing.length > 1) throw uiError('errors.duplicateAudioName');
    let nextShow;
    let assetId;
    if (cueId) {
      const linked = linkLocalAudioToCue(before, cueId, file.name);
      nextShow = linked.project;
      assetId = linked.assetId;
    } else {
      assetId = existing.length
        ? existing[0].id
        : nextAvailableId('asset', before.assets.map(asset => asset.id));
      nextShow = existing.length ? before : addAudioReference(before, file.name);
      if (nextShow.assets.at(-1)?.id !== assetId && !existing.length) {
        throw uiError('errors.staleAudioList');
      }
    }
    const transport = player.getStatus();
    if (transport.activeCueCount || transport.pendingGoCount || transport.auditionActive || transport.auditionPending) throw uiError('errors.audioWhilePlaying');
    // Reusing an already-decoded file reference changes playback for every
    // cue sharing that asset ID. Require explicit confirmation before doing so.
    const shared = before.cues.some(cue => cue.id !== cueId &&
      cue.actions.some(action => action.type === 'PLAY' && action.assetId === assetId));
    if (player.hasAsset(assetId) && shared &&
        !window.confirm(t('soundPlan.sharedAudioConfirm', { name: file.name }))) return;
    feedback('status.decoding');
    const info = await player.loadFile(file, assetId);
    if (generation !== projectGeneration || show !== before) throw uiError('errors.projectChanged');
    show = nextShow;
    originalAudioFiles.set(assetId, file);
    dirty = true;
    render();
    feedback(cueId ? 'soundPlan.fileAttachedFeedback' : 'status.audioLoaded', {
      name: file.name,
      duration: info.durationSeconds.toFixed(1),
      channels: info.channels,
    }, 'success');
  } catch (error) {
    showError(error);
  } finally {
    audioInFlight = false;
    button.disabled = false;
    for (const picker of document.querySelectorAll('[data-cue-audio-pick]')) picker.disabled = false;
    refreshAudioControls();
  }
});

$('uiLocaleSelect').value = uiLocale;
translateDocument(document, uiLocale);
resetScriptLanguageHint();
render();
refreshMetaMessage();
feedback(statusState.key, statusState.values, statusState.tone);
refreshMetaStatus();
