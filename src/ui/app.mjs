import { parseScript, getScriptLine } from '../core/script.mjs';
import { serializeShowProject, deserializeShowProject, normalizeShowProject, MAX_PROJECT_JSON_BYTES } from '../core/projectPersistence.mjs';
import { createNewShow, addAudioReference, addMockProposal, addModelProposals, decideProposal, nextAvailableId } from '../core/workspace.mjs';
import { createBrowserAudioBackend } from '../core/audioBackend.mjs';
import { normalizeScriptLanguageHint } from '../core/scriptLanguage.mjs';
import { readPreferredUiLocale, savePreferredUiLocale, translate, translateDocument, resolveErrorKey } from './i18n.mjs';

const $ = (id) => document.getElementById(id);
const sampleTexts = {
  en: 'SCENE 1. THE REHEARSAL BEGINS\n(Opening background music.)\nANNA: Is everything ready?\nLUKE: We are ready.\n(A bell rings in the distance.)\nANNA: Go ahead!\n',
  es: 'ESCENA 1. COMIENZA EL ENSAYO\n(Ambiente musical de apertura.)\nANA: ¿Está todo listo?\nLUIS: Preparados.\n(Suena una campana a lo lejos.)\nANA: ¡Adelante!\n',
};
const limitScriptBytes = 1_000_000;
const maximumShownLines = 300;
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
const selectedModelProvider = () => $('modelProviderSelect').value === 'meta' ? 'meta' : 'baseten';
const expectedProviderId = p => p === 'meta' ? 'META_MODEL_API' : 'BASETEN_MUSE_SPARK_OPEN';
const player = createBrowserAudioBackend({ onStateChange: () => refreshAudioControls() });
function refreshAudioControls() {
  const status = $('transportStatus');
  if (!status) return;
  const { activeCueCount: active, pendingGoCount: pending } = player.getStatus();
  status.textContent = active || pending
    ? t('status.transportRunning', { count: active, pending: pending ? t('status.transportPending', { count: pending }) : '' })
    : t('status.transportStopped');
  $('stopAllBtn').disabled = active === 0 && pending === 0;
  for (const label of document.querySelectorAll('[data-cue-state]')) {
    const cue = show.cues.find(item => item.id === label.dataset.cueState);
    if (!cue) continue;
    const ready = cue.actions.every(action => player.hasAsset(action.assetId));
    const playing = player.isPlaying(cue.id);
    const stopping = player.isStopping(cue.id);
    label.textContent = t(stopping ? 'status.soundStopping' : playing ? 'status.soundPlaying' : ready ? 'status.soundReady' : 'status.soundMissing');
  }
  for (const button of document.querySelectorAll('[data-cue-action]')) {
    const cue = show.cues.find(item => item.id === button.dataset.cueId);
    if (!cue) continue;
    const ready = cue.actions.every(action => player.hasAsset(action.assetId));
    const playing = player.isPlaying(cue.id);
    const stopping = player.isStopping(cue.id);
    button.disabled = button.dataset.cueAction === 'go' ? !ready || playing : !playing || stopping;
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
  $('analyzeMetaBtn').textContent = t(baseten ? 'proposals.basetenButton' : 'proposals.metaButton');
  $('modelProviderDisclaimer').textContent = t(baseten ? 'proposals.basetenDisclaimer' : 'proposals.metaDisclaimer');
}
function switchUiLocale(locale) {
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
    const next = operation();
    if (next) show = next;
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
function render() {
  const lines = parseScript(show.scriptText);
  $('showName').value = show.name;
  $('linesCount').textContent = show.scriptText ? String(lines.length) : '0';
  $('proposalsCount').textContent = String(show.proposals.length);
  $('cuesCount').textContent = String(show.cues.length);
  const preview = $('scriptPreview');
  preview.replaceChildren();
  if (!show.scriptText) {
    preview.append(node('p', 'empty', t('status.scriptEmpty')));
  } else {
    for (const line of lines.slice(0, maximumShownLines)) {
      const row = node('div', 'script-line');
      row.append(node('span', 'line-ref', line.id), node('span', 'line-text', line.text || ' '));
      preview.append(row);
    }
  }
  $('scriptLimitNote').textContent = lines.length > maximumShownLines ? t('status.showingLines', { shown: maximumShownLines, total: lines.length }) : '';

  const list = $('assetList');
  list.replaceChildren();
  if (show.assets.length === 0) list.append(node('span', 'caption', t('status.noAssets')));
  for (const asset of show.assets) {
    const state = t(player.hasAsset(asset.id) ? 'status.loaded' : 'status.missingAsset');
    list.append(node('span', 'tag', asset.id + ' · ' + asset.name + ' · ' + state));
  }

  replaceOptions($('lineSelect'), show.scriptText ? lines.slice(0, 1000).map(line => [line.id, `${line.id} · ${line.text.slice(0, 90) || t('status.emptyLine')}`]) : [], $('lineSelect').value);
  replaceOptions($('assetSelect'), show.assets.map(asset => [asset.id, `${asset.id} · ${asset.name}`]), $('assetSelect').value);
  $('createProposalBtn').disabled = !show.scriptText || show.assets.length === 0;
  $('analyzeMetaBtn').disabled = !metaAvailable || metaInFlight || !show.scriptText.trim() || show.assets.length === 0;
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
    card.append(node('p', 'item-detail', `PLAY → ${proposal.actions.map(action => action.assetId).join(', ')}`));
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
    proposalList.append(card);
  }

  const cueList = $('cueList');
  cueList.replaceChildren();
  if (show.cues.length === 0) cueList.append(node('p', 'empty', t('status.noCues')));
  for (const cue of show.cues) {
    const card = node('article', 'item cue-item');
    const top = node('div', 'item-head');
    top.append(node('strong', '', `${cue.number}. ${cue.label}`), node('span', 'state', t('status.draft')));
    const runtime = node('span', 'state', t('status.soundMissing'));
    runtime.dataset.cueState = cue.id;
    top.append(runtime);
    card.append(top, node('p', 'item-detail', t('cue.sourceLabel') + ': ' + cue.sourceLineIds.join(', ')), node('p', 'item-detail', 'PLAY → ' + cue.actions.map(action => action.assetId).join(', ')));
    const controls = node('div', 'item-actions');
    const commands = [['go', t('actions.go'), 'btn primary small'], ['stop', t('actions.stop'), 'btn subtle small'], ['fade', t('actions.fade'), 'btn subtle small']];
    for (const [action, title, style] of commands) {
      const button = node('button', style, title);
      button.type = 'button';
      button.dataset.cueAction = action;
      button.dataset.cueId = cue.id;
      button.addEventListener('click', async () => {
        try {
          if (action === 'go') {
            const checked = normalizeShowProject(show);
            const currentCue = checked.cues.find(item => item.id === cue.id);
            if (!currentCue) throw new Error('Cue not found');
            await player.go(currentCue);
            feedback('status.goStarted', { number: currentCue.number }, 'success');
          } else if (action === 'stop') {
            player.stopCue(cue.id);
            feedback('status.audioStopped', { number: cue.number }, 'success');
          } else {
            player.stopCue(cue.id, 1500);
            feedback('status.audioFaded', { number: cue.number }, 'success');
          }
        } catch (error) { showError(error, resolveErrorKey(error) === 'errors.generic' ? 'errors.invalidAudio' : undefined); }
      });
      controls.append(button);
    }
    card.append(controls);
    cueList.append(card);
  }
  refreshAudioControls();
}
function userAllowsReplacement() {
  if (!dirty && !show.scriptText && !show.proposals.length && !show.assets.length) return true;
  return window.confirm(t('status.replaceConfirm'));
}
function saveProject() {
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
  player.reset();
  show = project;
  dirty = true;
  resetScriptLanguageHint();
  render();
  feedback(statusKey, values, 'success');
}

$('uiLocaleSelect').addEventListener('change', event => switchUiLocale(event.target.value));
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
  if (!window.confirm(t(provider === 'baseten' ? 'status.confirmBaseten' : 'status.confirmMeta'))) return;
  const generation = projectGeneration;
  metaInFlight = true;
  render();
  feedback(provider === 'baseten' ? 'status.basetenInProgress' : 'status.metaInProgress');
  try {
    const response = await fetch('/api/' + provider + '/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: JSON.parse(snapshot), scriptLanguage }),
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
    show = addModelProposals(show, result.proposals, result.provider);
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

$('stopAllBtn').addEventListener('click', () => {
  player.stopAll();
  feedback('status.panic', {}, 'success');
});
$('loadAudioBtn').addEventListener('click', () => $('audioFileInput').click());
$('audioFileInput').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  const generation = projectGeneration;
  const button = $('loadAudioBtn');
  button.disabled = true;
  try {
    if (file.name.length > 200) throw uiError('errors.audioFilenameLong');
    const existing = show.assets.filter(asset => asset.name === file.name);
    if (existing.length > 1) throw uiError('errors.duplicateAudioName');
    const assetId = existing.length
      ? existing[0].id
      : nextAvailableId('asset', show.assets.map(asset => asset.id));
    feedback('status.decoding');
    const info = await player.loadFile(file, assetId);
    if (generation !== projectGeneration) throw uiError('errors.projectChanged');
    if (!existing.length) {
      const updated = addAudioReference(show, file.name);
      if (updated.assets.at(-1)?.id !== assetId) {
        player.reset();
        throw uiError('errors.staleAudioList');
      }
      show = updated;
    }
    dirty = true;
    render();
    feedback('status.audioLoaded', {
      name: file.name,
      duration: info.durationSeconds.toFixed(1),
      channels: info.channels,
    }, 'success');
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = false;
  }
});

$('uiLocaleSelect').value = uiLocale;
translateDocument(document, uiLocale);
resetScriptLanguageHint();
render();
refreshMetaMessage();
feedback(statusState.key, statusState.values, statusState.tone);
refreshMetaStatus();
