import { parseScript, getScriptLine } from '../core/script.mjs';
import { serializeShowProject, deserializeShowProject, normalizeShowProject, MAX_PROJECT_JSON_BYTES } from '../core/projectPersistence.mjs';
import { createNewShow, addAudioReference, addMockProposal, addModelProposals, decideProposal, assignAudioToCue, setCueSoundResolution, nextAvailableId, linkLocalAudioToCue, updateCueOperatorDetails, updateCuePlayback, updateCueAutomation, replaceCueAudioAsset } from '../core/workspace.mjs';
import { stageCueStopTransitions } from '../core/cueStopFades.mjs';
import { setCueEntryPolicy,planEntryStops,normalizeCueEntryPolicy } from '../core/cueEntryPolicy.mjs';
import { insertManualCue, deleteOperatorCue, duplicateOperatorCue, moveOperatorCue, reorderOperatorCue } from '../core/manualCues.mjs';
import { stageAddCueTrack, stageChangeCueTrack, stageRemoveCueTrack } from '../core/cueTracks.mjs';
import { createBrowserAudioBackend } from '../core/audioBackend.mjs';
import { normalizeCuePlayback } from '../core/cuePlayback.mjs';
import { formatCueTime,parseCueTime,clampCueFade } from '../core/cueTimeEditing.mjs';
import { exportPortableShow, importPortableShow, MAX_PORTABLE_ZIP_BYTES } from '../core/showArchive.mjs';
import { planAudioLibraryBatch } from '../core/audioBatchImport.mjs';
import { extractAudioArchive } from '../core/audioArchiveFormats.mjs';
import { prepareReviewedSfxImport } from '../core/sfxImportCandidate.mjs';
import { createCueFromReviewedAudio } from '../core/reviewedSfxCue.mjs';
import {stageCueConversationChange} from '../core/cueConversation.mjs';
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
const metaWindowsPerRequest = 1; // Keep browser preview in sync with bounded server request.
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
let metaActivity = null;
let metaActivityTimer = null;
let metaCoverage = null;
let metaIndependentReview = null; // Transient, bounded operator-only hints; never saved in the show.
let metaProposalDetails = new Map();
let pendingAudioCueId = null;
let audioInFlight = false;
let bundleInFlight = false;
let originalAudioFiles = new Map();
/**
 * Read-only source bridge for the Stagecraft waveform view. It returns the
 * actual local File for a registered asset in the current project, never
 * synthesizes a waveform and never initiates playback or provider traffic.
 * The request/reply stays entirely in this browser document.
 */
document.addEventListener('runq:request-audio-source', event => {
  const { assetId, respond } = event.detail ?? {};
  if (typeof respond !== 'function' || typeof assetId !== 'string') return;
  const registered = show.assets.some(asset => asset.id === assetId);
  respond(registered ? (originalAudioFiles.get(assetId) ?? null) : null);
});

/** Read-only Voice Follow interface; never touches operator queue or playback. */
document.addEventListener('runq:voice-follow-read-project', event => {
  const respond=event.detail?.respond;
  if(typeof respond!=='function')return;
  respond({
    scriptText:show.scriptText,
    cues:show.cues.map(cue=>({
      id:cue.id,number:cue.number,label:cue.label,trigger:cue.trigger??'',
      sourceLineIds:[...cue.sourceLineIds],
    })),
  });
});
document.addEventListener('runq:voice-follow-highlight-line', event => {
  const lineId=event.detail?.lineId;
  if(typeof lineId!=='string'||!/^L[1-9]\d*$/.test(lineId))return;
  if(!parseScript(show.scriptText).some(line=>line.id===lineId))return;
  scriptFocusLineId=lineId;
  render(); // Source navigation only, never changes prepared queue.
  const target=[...$('scriptPreview').querySelectorAll('[data-script-line-id]')]
    .find(row=>row.dataset.scriptLineId===lineId);
  target?.scrollIntoView({block:'nearest'});
});

/**
 * Voice Follow never prepares or fires anything on ASR events. Only the explicit
 * operator click on Set as NEXT may modify the prepared cue. GO remains manual.
 */
document.addEventListener('runq:voice-follow-prepare-cue',event=>{
  const cueId=event.detail?.cueId,respond=event.detail?.respond;
  const done=ok=>{if(typeof respond==='function')respond(ok);};
  if(activeWorkspace!=='rehearsal'||typeof cueId!=='string'){done(false);return;}
  const cue=show.cues.find(c=>c.id===cueId);
  if(!cue||audioInFlight||bundleInFlight){done(false);return;}
  const status=player.getStatus();
  if(status.pendingGoCount||status.auditionPending){done(false);return;}
  try{
    operatorQueue=prepareOperatorCue(operatorQueue,show.cues,cueId);
    render();
    feedback('operator.preparedFeedback',{number:cue.number},'success');
    done(true);
  }catch(error){showError(error);done(false);}
});

let scriptFocusLineId = null;
let scriptMatchIndex = 0;
let preflightVisible = false;
let editingCueId = null;
let selectedCueId = null; // Selection inspects only; it never changes the GO queue.
let draggingCueId = null; // HTML5 drag source; only meaningful inside editable Cues.
let inspectorTab = 'audio';
let inspectorPendingChanges = false;
let activeWorkspace = 'home';
const availableWorkspaces = Object.freeze(['home', 'script', 'ai', 'cues', 'audio', 'soundlab', 'setup', 'rehearsal', 'operation']);
let operatorQueue = startOperatorQueue(show.cues);
let lastGoCueId = null;
let auditionAcknowledged = false;
const selectedModelProvider = () => $('modelProviderSelect').value === 'meta' ? 'meta' : 'baseten';
const expectedProviderId = p => p === 'meta' ? 'META_MODEL_API' : 'BASETEN_MUSE_SPARK_OPEN';
let player = createBrowserAudioBackend({ onStateChange: () => { refreshAudioControls(); refreshPreviewStudio(); } });
let soundLabModulePromise = null;
// V10 single show-controller preview lease. Sound Lab still has a temporary
// Web Audio context, but cannot overlap GO or a library/cue audition. The
// authoritative STOP ALL synchronously invalidates its pending/active preview.
let soundLabPreviewReserved = false;
let stopSoundLabPreview = () => {};
function reserveSoundLabPreview(){
  const status=player.getStatus();
  if(activeWorkspace!=='audio'||goTransportPending||audioInFlight||bundleInFlight||
     status.activeCueCount||status.pendingGoCount||status.auditionActive||
     status.auditionPending||soundLabPreviewReserved)return false;
  soundLabPreviewReserved=true;
  refreshAudioControls();
  return true;
}
function releaseSoundLabPreview(){
  soundLabPreviewReserved=false;
  refreshAudioControls();
}
// ON AIR is a transport *snapshot*, not a new independent cue player.
// Reuse existing stopCue and Web Audio clock; rows survive 250ms clock refreshes.
let runningCuesTicker=null;
function refreshRunningCues(){
  const panel=$('runqActiveCues'),list=$('runqActiveCuesList');
  if(!panel||!list||!player)return;
  const visible=activeWorkspace==='operation';
  panel.hidden=!visible;
  if(!visible){
    if(runningCuesTicker!==null)window.clearInterval(runningCuesTicker);
    runningCuesTicker=null;
    return;
  }
  const active=player.getActiveCues();
  $('runqActiveCuesCount').textContent=String(active.length);
  $('runqActiveCuesTitle').textContent=uiLocale==='es'?'EN DIRECTO · CUES SONANDO':'ON AIR · RUNNING CUES';
  const wanted=new Set(active.map(item=>item.cueId));
  for(const child of [...list.children]){
    if(child.dataset.runningCue && !wanted.has(child.dataset.runningCue))child.remove();
  }
  const empty=list.querySelector('.rq5-active-empty');
  if(active.length===0){
    if(!empty)list.append(node('p','rq5-active-empty',
      uiLocale==='es'?'No hay cues sonando. El próximo GO está preparado arriba.':
        'Nothing playing. The next GO is prepared above.'));
  } else empty?.remove();
  for(const state of active){
    const cue=show.cues.find(c=>c.id===state.cueId);
    let card=[...list.children].find(el=>el.dataset.runningCue===state.cueId);
    if(!card){
      card=node('div','rq5-active-row');
      card.dataset.runningCue=state.cueId;
      const left=node('div','rq5-active-ident');
      left.append(node('strong','rq5-active-label'),node('span','rq5-active-time'));
      const meter=node('div','rq5-active-progress');
      meter.setAttribute('role','progressbar');meter.setAttribute('aria-valuemin','0');
      meter.setAttribute('aria-valuemax','100');
      meter.append(node('span','rq5-active-progress-fill'));
      const actions=node('div','rq5-active-actions');
      for(const [action,english,spanish] of [
        ['stop','STOP','PARAR'],['fade','FADE','FUNDIR']
      ]){
        const btn=node('button','rq5-active-action '+action,uiLocale==='es'?spanish:english);
        btn.type='button';btn.dataset.activeAction=action;
        btn.addEventListener('click',()=>{
          const current=show.cues.find(c=>c.id===state.cueId);
          if(!current || !player.isPlaying(state.cueId) || player.isStopping(state.cueId))return;
          try{
            player.stopCue(state.cueId,action==='stop'?0:(current.playback?.fadeOutMs||1500));
            refreshRunningCues();
          }catch(error){showError(error);}
        });
        actions.append(btn);
      }
      card.append(left,meter,actions);
      list.append(card);
    }
    const stateText=state.stopping?'FADING':state.durationSeconds===null?'LOOP':'PLAYING';
    card.classList.toggle('is-fading',state.stopping);
    card.classList.toggle('is-looping',state.durationSeconds===null);
    card.querySelector('.rq5-active-label').textContent=
      (cue?String(cue.number).padStart(2,'0')+' · '+cue.label:state.cueId);
    const elapsed=Number.isFinite(state.elapsedSeconds)?Math.floor(state.elapsedSeconds):0;
    const remaining=state.remainingSeconds===null?'∞':
      Math.ceil(state.remainingSeconds)+'s';
    card.querySelector('.rq5-active-time').textContent=
      stateText+'  ·  '+String(Math.floor(elapsed/60)).padStart(2,'0')+':'+
      String(elapsed%60).padStart(2,'0')+'  ·  '+remaining;
    const meter=card.querySelector('.rq5-active-progress');
    const progress=state.progress;
    meter.setAttribute('aria-label','Playback timeline: '+(cue?.label??state.cueId));
    if(progress===null)meter.removeAttribute('aria-valuenow');
    else meter.setAttribute('aria-valuenow',String(Math.round(progress*100)));
    meter.querySelector('.rq5-active-progress-fill').style.width=
      (progress===null?100:Math.round(progress*100))+'%';
    for(const button of card.querySelectorAll('[data-active-action]')){
      button.disabled=state.stopping;
      button.textContent=uiLocale==='es'
        ?button.dataset.activeAction==='stop'?'PARAR':'FUNDIR'
        :button.dataset.activeAction==='stop'?'STOP':'FADE';
    }
  }
  if(active.length && runningCuesTicker===null){
    runningCuesTicker=window.setInterval(refreshRunningCues,250);
  }else if(!active.length && runningCuesTicker!==null){
    window.clearInterval(runningCuesTicker);runningCuesTicker=null;
  }
}

function refreshAudioControls() {
  const status = $('transportStatus');
  if (!status) return;
  const { activeCueCount: active, pendingGoCount: pending, auditionActive, auditionPending } = player.getStatus();
  const auditioning = auditionActive || auditionPending || soundLabPreviewReserved;
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
  $('importAudioBatchBtn').disabled = audioInFlight || bundleInFlight || auditioning || active>0 || pending>0;
  $('importAudioZipBtn').disabled = $('importAudioBatchBtn').disabled;
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
    const entry=normalizeCueEntryPolicy(prepared.entryPolicy);
    if(entry.mode==='STOP_PREVIOUS') effects.push((uiLocale==='es'?'PARAR ANTERIORES':'STOP PREVIOUS')+
      (entry.fadeOutMs?' · '+(entry.fadeOutMs/1000).toFixed(1)+'s fade':''));
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
  for (const button of document.querySelectorAll('[data-cue-quick-go]')) {
    const cue = show.cues.find(item=>item.id===button.dataset.cueQuickGo);
    const status = player.getStatus();
    button.disabled = !cue || audioInFlight || bundleInFlight || auditioning ||
      goTransportPending || status.pendingGoCount > 0 || status.auditionPending ||
      cue.actions.some(action=>action.type!=='PLAY'||!player.hasAsset(action.assetId)) ||
      (cue.audioTracks??[]).some(track=>!player.hasAsset(track.assetId)) ||
      player.isPlaying(cue.id) || player.isStopping(cue.id);
  }
  for (const button of document.querySelectorAll('[data-cue-action]')) {
    const cue = show.cues.find(item => item.id === button.dataset.cueId);
    if (!cue) continue;
    const playing = player.isPlaying(cue.id);
    const stopping = player.isStopping(cue.id);
    button.disabled = !playing || stopping;
  }
  refreshRunningCues();
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
  refreshRunningCues();
}

function setWorkspace(workspace) {
  if (!availableWorkspaces.includes(workspace)) throw new RangeError('Unknown workspace');
  if (workspace !== activeWorkspace && activeWorkspace === 'cues' && inspectorPendingChanges) {
    if (!confirmDiscardInspectorEdits()) return false;
    inspectorPendingChanges = false;
    renderCueInspector(); // Discard local form changes, not stored show data.
  }
  // Legacy deep links and old navigation enter the new unified audio desk.
  const legacySoundLab=workspace==='soundlab';
  if(legacySoundLab)workspace='audio';
  if (activeWorkspace === 'audio' && workspace !== 'audio') stopSoundLabPreview();
  activeWorkspace = workspace;
  renderWorkspaceShell();
  if(legacySoundLab)document.dispatchEvent(new CustomEvent('runq:sound-mode',{detail:{mode:'generate'}}));
  if (workspace === 'audio') void ensureSoundLabInitialized().catch(reportSoundLabBootstrapError);
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
function refreshMetaActivity() {
  const activity = $('aiAnalysisActivity');
  activity.hidden = !metaInFlight;
  $('analyzeMetaBtn').setAttribute('aria-busy', String(metaInFlight));
  if (!metaInFlight || !metaActivity) return;
  $('aiAnalysisActiveTitle').textContent = t('proposals.analysisRunning');
  $('aiAnalysisScope').textContent = metaActivity.provider === 'meta'
    ? t('proposals.analysisScopeMeta', {
        startWindow: metaActivity.startWindow,
        endWindow: metaActivity.endWindow,
        totalWindows: metaActivity.totalWindows,
        lineCount: metaActivity.lineCount,
      })
    : t('proposals.analysisScopeBaseten');
  $('aiAnalysisElapsed').textContent = t('proposals.analysisElapsed', {
    seconds: Math.max(0, Math.floor((Date.now() - metaActivity.startedAt) / 1000)),
  });
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
  $('analyzeMetaBtn').textContent = metaInFlight ? t('proposals.analysisButtonBusy')
    : t(baseten ? 'proposals.basetenButton'
      : metaCoverage?.complete ? 'proposals.metaRepeatButton'
        : metaCoverage?.nextWindowStart ? 'proposals.metaNextButton' : 'proposals.metaButton');
  $('metaDesignModeField').hidden = baseten;
  $('metaDesignMode').disabled = metaInFlight;
  $('metaProductionContext').hidden = baseten;
  $('metaProductionHelp').hidden = baseten;
  $('performanceKindSelect').disabled = metaInFlight;
  $('documentKindSelect').disabled = metaInFlight;
  refreshMetaActivity();
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
  const hintPanel = $('metaIndependentReview');
  hintPanel.hidden = baseten || metaIndependentReview === null;
  if (!hintPanel.hidden) {
    $('metaIndependentReviewSummary').textContent = t(
      metaIndependentReview.totalUnreviewed
        ? 'proposals.reviewHintsSummary' : 'proposals.reviewHintsNone',
      { count: metaIndependentReview.totalUnreviewed },
    );
    const target = $('metaIndependentReviewLines');
    target.replaceChildren();
    for (const lineId of metaIndependentReview.lineIds) {
      target.append(node('span', 'caption', lineId), sourceButton(lineId));
    }
    if (metaIndependentReview.totalUnreviewed > metaIndependentReview.lineIds.size) {
      target.append(node('span', 'caption', t('proposals.reviewHintsMore', {
        shown: metaIndependentReview.lineIds.size,
      })));
    }
  }
}

function resetMetaAnalysis() {
  metaCoverage = null;
  metaIndependentReview = null;
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
function applyMetaIndependentReview(value, coverage) {
  if (coverage.batchStartWindow === 0) metaIndependentReview = null;
  // Older mock or Baseten responses did not implement independent review.
  if (value === undefined) return;
  const allowed = new Set(coverage.analyzedLineIds);
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Array.isArray(value.reviewFlags) || value.reviewFlags.length > 16 ||
      !Number.isSafeInteger(value.totalUnreviewed) ||
      value.totalUnreviewed < value.reviewFlags.length ||
      value.totalUnreviewed > coverage.analyzedLines ||
      value.reviewFlags.some(id => typeof id !== 'string' || !/^L[1-9]\d*$/.test(id) || !allowed.has(id)) ||
      new Set(value.reviewFlags).size !== value.reviewFlags.length) {
    throw uiError('errors.metaResponse');
  }
  if (!metaIndependentReview) metaIndependentReview = { lineIds: new Set(), totalUnreviewed: 0 };
  for (const id of value.reviewFlags) metaIndependentReview.lineIds.add(id);
  metaIndependentReview.totalUnreviewed += value.totalUnreviewed;
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
  form.addEventListener('input', () => { inspectorPendingChanges = true; refreshPreviewStudio(); });
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
  document.dispatchEvent(new CustomEvent('runq:cue-chat-selection',{detail:{cueId}}));
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
    const cueNumber = node('span', 'cue-row-index', String(cue.number).padStart(2, '0'));
    const cueTitle = node('strong', 'cue-row-title', cue.label);
    cueTitle.title = cue.label;
    top.append(cueNumber, cueTitle);
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
    // Direct row controls are distinct from selection: ▶ executes this cue
    // without changing NEXT; ↦ prepares NEXT without playing. Both are
    // accessible by keyboard and always visible, especially in Live.
    const quick = node('div', 'rq9-row-actions');
    const dragHandle=node('span','rq9-cue-grip','⠿');
    dragHandle.title=uiLocale==='es'?'Arrastrar para reordenar (solo edición)':'Drag to reorder (editing only)';
    dragHandle.setAttribute('aria-hidden','true');
    // Pointer-based drag works consistently in Chrome and Electron, including
    // touch screens. It never activates the row's GO/NEXT/selection controls.
    dragHandle.tabIndex=0;
    dragHandle.setAttribute('role','button');
    dragHandle.setAttribute('aria-label',
      (uiLocale==='es'?'Reordenar cue ':'Reorder cue ')+cue.number+
      (uiLocale==='es'?' · flechas arriba/abajo':' · arrow up/down'));
    let pointerStart=null;
    let dragTarget=null;
    const clearDragMarkers=()=>{
      cueList.querySelectorAll('.rq9-drop-before,.rq9-drop-after,.rq9-dragging')
        .forEach(row=>row.classList.remove('rq9-drop-before','rq9-drop-after','rq9-dragging'));
    };
    dragHandle.addEventListener('pointerdown',event=>{
      if(activeWorkspace!=='cues'||event.button!==0)return;
      pointerStart={id:event.pointerId,x:event.clientX,y:event.clientY};
      dragTarget=null;
      dragHandle.setPointerCapture(event.pointerId);
    });
    dragHandle.addEventListener('pointermove',event=>{
      if(!pointerStart||event.pointerId!==pointerStart.id||activeWorkspace!=='cues')return;
      if(!draggingCueId&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)<6)return;
      draggingCueId=cue.id;
      card.classList.add('rq9-dragging');
      const row=document.elementFromPoint(event.clientX,event.clientY)?.closest('.cue-item');
      clearDragMarkers();
      card.classList.add('rq9-dragging');
      if(!row||!cueList.contains(row)||row===card){dragTarget=null;return;}
      const targetId=row.querySelector('[data-cue-select]')?.dataset.cueSelect;
      if(!targetId){dragTarget=null;return;}
      const after=event.clientY>=row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;
      row.classList.add(after?'rq9-drop-after':'rq9-drop-before');
      dragTarget={targetId,position:after?'after':'before'};
    });
    dragHandle.addEventListener('pointerup',event=>{
      if(!pointerStart||event.pointerId!==pointerStart.id)return;
      const sourceId=draggingCueId,drop=dragTarget;
      pointerStart=null;dragTarget=null;draggingCueId=null;clearDragMarkers();
      if(dragHandle.hasPointerCapture(event.pointerId))dragHandle.releasePointerCapture(event.pointerId);
      if(activeWorkspace==='cues'&&sourceId&&drop&&sourceId!==drop.targetId)
        editCueSequence(()=>({project:reorderOperatorCue(show,sourceId,drop.targetId,drop.position),cueId:sourceId}),{preserveQueue:true});
    });
    dragHandle.addEventListener('pointercancel',()=>{
      pointerStart=null;dragTarget=null;draggingCueId=null;clearDragMarkers();
    });
    dragHandle.addEventListener('keydown',event=>{
      if(activeWorkspace!=='cues'||event.altKey||event.ctrlKey||event.metaKey||
        !['ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();
      const direction=event.key==='ArrowUp'?-1:1;
      editCueSequence(()=>({project:moveOperatorCue(show,cue.id,direction),cueId:cue.id}),{preserveQueue:true});
    });
    const play=node('button','rq9-cue-play','▶');
    play.type='button';
    play.dataset.cueQuickGo=cue.id;
    play.setAttribute('aria-label',(uiLocale==='es'?'Ejecutar directamente cue ':'Run cue directly ')+cue.number+' · '+cue.label);
    play.title=uiLocale==='es'?'GO directo · no cambia NEXT':'Direct GO · does not change NEXT';
    play.disabled=true; // refreshAudioControls applies the real audio safety guards
    play.addEventListener('click',()=>{
      document.dispatchEvent(new CustomEvent('runq:rehearsal-auto-disarm',{detail:{reason:'manual_go'}}));
      void executeCueById(cue.id,{advancePrepared:false});
    });
    const prepare=node('button','rq9-cue-next','↦');
    prepare.type='button';
    prepare.dataset.cueQuickNext=cue.id;
    prepare.setAttribute('aria-label',(uiLocale==='es'?'Preparar como NEXT cue ':'Set as NEXT cue ')+cue.number+' · '+cue.label);
    prepare.title=uiLocale==='es'?'Set NEXT · no reproduce audio':'Set NEXT · does not play audio';
    prepare.disabled=operatorQueue.preparedCueId===cue.id;
    prepare.addEventListener('click',()=>{
      operatorQueue = prepareOperatorCue(operatorQueue, show.cues, cue.id);
      render();
      feedback('operator.preparedFeedback',{number:cue.number},'success');
    });
    quick.append(dragHandle,play,prepare);
    card.append(quick,select);
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
    // The per-row NEXT button is always visible in the left action rail.
    // STOP/FADE remain separate commands for an already-running cue.
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
  $('cueDeleteBtn').disabled = !selectedCueId || !show.cues.some(c => c.id === selectedCueId);
  $('cueInsertBtn').disabled = !selectedCueId || !show.cues.some(c => c.id === selectedCueId);
  $('cueDuplicateBtn').disabled = !selectedCueId || !show.cues.some(c => c.id === selectedCueId);
  $('cueMoveUpBtn').disabled = !selectedCueId || show.cues.findIndex(c => c.id === selectedCueId) < 1;
  $('cueMoveDownBtn').disabled = !selectedCueId || show.cues.findIndex(c => c.id === selectedCueId) >= show.cues.length - 1;
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
        if(soundLabPreviewReserved)throw new Error('Detén la escucha de Sound Lab antes de preescuchar otro archivo.');
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
  $('analyzeMetaBtn').disabled = !metaAvailable || metaInFlight || !show.scriptText.trim();
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

/** Read an editing snapshot without committing it or advancing the GO queue. */
function stagedAudioSettings(form, saved) {
  const next={...normalizeCuePlayback(saved)};
  if (!form) return normalizeCuePlayback(next);
  for (const input of form.querySelectorAll('input[name]')) {
    if (!Object.hasOwn(next,input.name)) continue;
    if (input.type==='checkbox') next[input.name]=input.checked;
    else if (input.name==='endAtMs' && input.value.trim()==='') next.endAtMs=null;
    else if (input.value.trim()!=='') next[input.name]=Number(input.value);
    else throw new TypeError('Numeric audio property cannot be empty');
  }
  if (next.loop) {next.repeatCount=1;next.fadeOutMs=0;}
  return normalizeCuePlayback(next);
}
function stagedPreviewCue(cue) {
  if (cue.id!==selectedCueId || inspectorTab!=='audio') return cue;
  const main=document.getElementById('cuePlaybackForm');
  const playback=stagedAudioSettings(main,cue.playback);
  const audioTracks=(cue.audioTracks??[]).map(track=>{
    const form=[...document.querySelectorAll('[data-track-settings]')]
      .find(item=>item.dataset.trackSettings===track.id);
    return {...track,playback:stagedAudioSettings(form,track.playback)};
  });
  return {...cue,playback,audioTracks};
}
let previewTicker=null;
function refreshPreviewStudio() {
  const preview=player.getPreviewStatus();
  const busy=player.getStatus();
  const locked=audioInFlight || bundleInFlight || busy.activeCueCount>0 ||
    busy.pendingGoCount>0 || busy.auditionActive || busy.auditionPending;
  for(const button of document.querySelectorAll('[data-preview-cue]')) {
    const cue=show.cues.find(c=>c.id===button.dataset.previewCue);
    button.disabled=locked || !cue || cue.actions.some(a=>a.type!=='PLAY') ||
      !cue.actions.every(a=>player.hasAsset(a.assetId)) ||
      !(cue.audioTracks??[]).every(t=>player.hasAsset(t.assetId));
  }
  for(const button of document.querySelectorAll('[data-preview-track]')) {
    button.disabled=locked || !player.hasAsset(button.dataset.previewAsset);
  }
  for(const button of document.querySelectorAll('[data-preview-stop]')) {
    button.disabled=!busy.auditionActive && !busy.auditionPending;
  }
  for(const status of document.querySelectorAll('[data-preview-status]')) {
    if(!preview) {
      status.textContent=t(inspectorPendingChanges?'preview.stagedReady':'preview.ready');
      status.dataset.playing='false';
    } else {
      const label=show.cues.find(c=>c.id===preview.cueId)?.label??preview.cueId;
      status.textContent=t('preview.playing',{
        label,elapsed:preview.elapsedSeconds.toFixed(1),
        total:preview.durationSeconds===null?'∞':preview.durationSeconds.toFixed(1),
      });
      status.dataset.playing='true';
    }
  }
  for(const marker of document.querySelectorAll('[data-preview-playhead]')) {
    const isSelected=preview && preview.cueId===marker.dataset.previewCueId &&
      preview.trackId===marker.dataset.previewTrackId &&
      Number.isFinite(preview.positionMs);
    marker.hidden=!isSelected;
    if(isSelected) marker.style.left=Math.max(0,Math.min(100,
      (preview.positionMs-Number(marker.dataset.viewStartMs||0)) / Number(marker.dataset.viewSpanMs||marker.dataset.durationMs)*100))+'%';
  }
  if(preview && previewTicker===null) {
    previewTicker=window.setInterval(()=>refreshPreviewStudio(),125);
  } else if(!preview && previewTicker!==null) {
    window.clearInterval(previewTicker);
    previewTicker=null;
  }
}
async function listenToCue(cueId,{trackId=null,fromMs=null}={}) {
  const cue=show.cues.find(c=>c.id===cueId);
  if(!cue || audioInFlight || bundleInFlight) return;
  if(!auditionAcknowledged) {
    if(!window.confirm(t('audio.auditionConfirm'))) return;
    auditionAcknowledged=true;
  }
  try {
    const snapshot=stagedPreviewCue(cue);
    await player.previewCue(snapshot,{trackId,fromMs});
    feedback(trackId===null?'preview.started':'preview.trackStarted',
      {number:cue.number},'success');
    refreshPreviewStudio();
  } catch(error) {showError(error);}
}
function stopCuePreview() {
  if(player.stopAudition()) feedback('preview.stopped',{},'success');
  refreshPreviewStudio();
}

/**
 * PCM waveform is a read-only display of decoded local audio.
 * Pointer edits change staged numeric fields; only Save persists them.
 * Canvas is never a transport or GO control.
 */
function cueWaveformTrim(assetId, inputs, { cueId = null, trackId = 'primary' } = {}) {
  const summary=assetId?player.getWaveform(assetId):null;
  const block=node('section','cue-waveform-editor is-clip-editor');
  block.append(node('strong','cue-waveform-title',t('waveform.heading')));
  if(!summary) {
    block.append(node('p','caption',t('waveform.unavailable')));
    return block;
  }
  const duration=summary.durationMs;
  const startField=inputs.get('startAtMs'),endField=inputs.get('endAtMs');
  const canvas=node('canvas','cue-waveform-canvas');
  canvas.width=800; canvas.height=144; canvas.tabIndex=0;
  canvas.setAttribute('role','slider');
  canvas.setAttribute('aria-label',t('waveform.dragHelp'));
  canvas.setAttribute('aria-valuemin','0');
  canvas.setAttribute('aria-valuemax',String(duration));
  const stage=node('div','cue-waveform-stage');
  const progress=node('span','cue-waveform-playhead');
  progress.hidden=true;
  progress.dataset.previewPlayhead='true';
  progress.dataset.previewCueId=cueId??'';
  progress.dataset.previewTrackId=trackId;
  progress.dataset.durationMs=String(duration);
  stage.append(canvas,progress);
  const times=node('div','cue-waveform-times');
  const toolbar=node('div','cue-waveform-toolbar');
  const zoomOut=node('button','btn wave-zoom','−');
  const zoomIn=node('button','btn wave-zoom','+');
  const fit=node('button','btn wave-zoom',t('preview.fit'));
  for(const button of [zoomOut,zoomIn,fit]) button.type='button';
  zoomOut.setAttribute('aria-label',t('preview.zoomOut'));
  zoomIn.setAttribute('aria-label',t('preview.zoomIn'));
  fit.setAttribute('aria-label',t('preview.fit'));
  const zoomReadout=node('span','wave-zoom-readout','1×');
  const pan=node('input','wave-pan');
  pan.type='range';pan.min='0';pan.max='0';pan.step='10';pan.value='0';
  pan.setAttribute('aria-label',t('preview.panWave'));
  pan.disabled=true;
  // All input data still lives in the cue/track's existing integer-ms fields.
  // Show timecodes and a scrub transport; keep old ms inputs under Advanced.
  const timing=node('div','cue-wave-timing');
  const readable=new Map();
  const fields=[
    ['startAtMs','IN'],['endAtMs','OUT'],
    ['fadeInMs',uiLocale==='es'?'ENTRADA':'FADE IN'],
    ['fadeOutMs',uiLocale==='es'?'SALIDA':'FADE OUT'],
  ];
  const advanced=node('details','cue-wave-ms-advanced');
  advanced.append(node('summary','',uiLocale==='es'
    ?'Precisión avanzada (milisegundos)':'Advanced precision (milliseconds)'));
  for(const [key,title] of fields){
    const label=node('label','',title);
    const input=node('input','cue-wave-timecode');
    input.type='text';input.inputMode='decimal';input.autocomplete='off';
    input.spellcheck=false;input.required=true;input.dataset.timecode=key;
    label.append(input);timing.append(label);readable.set(key,input);
    const raw=inputs.get(key);
    const rawLabel=raw.closest('label');
    if(rawLabel)advanced.append(rawLabel);
    input.addEventListener('input',()=>{
      try{
        parseCueTime(input.value);input.setCustomValidity('');
        input.removeAttribute('aria-invalid');
      }catch{
        input.setCustomValidity(uiLocale==='es'
          ?'Usa mm:ss.mmm o segundos (p. ej. 01:02.500)'
          :'Use mm:ss.mmm or seconds (e.g. 01:02.500)');
        input.setAttribute('aria-invalid','true');
      }
    });
    input.addEventListener('change',()=>{
      try{
        const millis=parseCueTime(input.value);
        const {start,end}=clip();
        if(key==='startAtMs'&&millis>=end)throw new RangeError('IN must precede OUT');
        if(key==='endAtMs'&&millis<=start)throw new RangeError('OUT must follow IN');
        if(key==='fadeOutMs'&&input.disabled)return;
        if(key==='fadeInMs'||key==='fadeOutMs'){
          const other=key==='fadeInMs'?'fadeOutMs':'fadeInMs';
          const max=Math.max(0,Math.min(10000,(end-start)/
            Math.max(.5,Number(inputs.get('playbackRate')?.value)||1) -
            Number(inputs.get(other)?.value||0)));
          if(millis>max)throw new RangeError('Fade exceeds usable clip duration');
        }
        raw.value=key==='endAtMs'&&millis===duration?'':String(millis);
        input.setCustomValidity('');input.removeAttribute('aria-invalid');
        raw.dispatchEvent(new Event('input',{bubbles:true}));
        inspectorPendingChanges=true;redraw();
      }catch{
        input.setCustomValidity(uiLocale==='es'?'Tiempo fuera del rango del cue'
          :'Time is outside the cue region');
        input.setAttribute('aria-invalid','true');
      }
    });
  }
  const readableHint=node('p','cue-timing-hint',uiLocale==='es'
    ?'Formato mm:ss.mmm · Los cambios son solo para este cue; pulsa Guardar.'
    :'MM:SS.mmm · Changes affect this cue only; press Save.');
  timing.append(readableHint);
  const scrubWrap=node('div','cue-wave-scrub');
  const scrub=node('input');
  scrub.type='range';scrub.min='0';scrub.max=String(duration);
  scrub.step='10';scrub.value='0';
  scrub.setAttribute('aria-label',uiLocale==='es'
    ?'Cursor de preescucha':'Audition position');
  const scrubTime=node('span','',formatCueTime(0));
  scrubWrap.append(scrub,scrubTime);
  const tools=node('div','cue-wave-tools');
  const markIn=node('button','btn subtle small',
    uiLocale==='es'?'IN ← cursor':'IN ← cursor');
  const markOut=node('button','btn subtle small',
    uiLocale==='es'?'OUT ← cursor':'OUT ← cursor');
  for(const button of [markIn,markOut])button.type='button';
  markIn.addEventListener('click',()=>place('in',cursorMs??clip().start));
  markOut.addEventListener('click',()=>place('out',cursorMs??clip().end));
  tools.append(markIn,markOut);
  const instruction=node('p','cue-wave-instruction',uiLocale==='es'
    ?'Parte superior de la onda: arrastra los tiradores violeta de FADE. Parte inferior: mueve IN/OUT. Preescucha por esta misma salida.'
    :'Upper waveform: drag violet FADE handles. Lower waveform: move IN/OUT. Audition uses this same audio output.');
  let zoom=1,viewStart=0,cursorMs=null,dragging=null;
  function syncTimecodes(){
    const selected=clip();
    for(const [key,input] of readable){
      if(document.activeElement===input)continue;
      const raw=inputs.get(key);
      const value=key==='endAtMs'&&raw.value===''?duration:Number(raw.value||0);
      input.value=formatCueTime(Math.max(0,Math.round(value)));
      input.setCustomValidity('');input.removeAttribute('aria-invalid');
      if(key==='fadeOutMs')input.disabled=raw.disabled;
    }
    const pos=cursorMs??selected.start;
    scrub.value=String(Math.max(0,Math.min(duration,Math.round(pos))));
    scrubTime.textContent=formatCueTime(Math.round(pos));
  }
  scrub.addEventListener('input',()=>{
    cursorMs=Number(scrub.value);redraw();
  });

  const clip=()=>({
    start:Math.max(0,Math.min(duration,Number(startField.value)||0)),
    end:endField.value.trim()===''?duration:
      Math.max(0,Math.min(duration,Number(endField.value)||0)),
  });
  const viewSpan=()=>duration/zoom;
  function refreshPan() {
    const max=Math.max(0,duration-viewSpan());
    viewStart=Math.min(viewStart,max);
    pan.max=String(Math.round(max));
    pan.value=String(Math.round(viewStart));
    pan.disabled=zoom===1;
    zoomReadout.textContent=zoom+'×';
    zoomOut.disabled=zoom===1;
    zoomIn.disabled=zoom===8;
  }
  function toX(milliseconds) {
    return (milliseconds-viewStart)/viewSpan()*canvas.width;
  }
  function point(e) {
    const rect=canvas.getBoundingClientRect();
    return Math.max(0,Math.min(duration,viewStart+
      ((e.clientX-rect.left)/Math.max(1,rect.width))*viewSpan()));
  }
  function redraw() {
    const {start,end}=clip();
    const ctx=canvas.getContext('2d');
    if(!ctx) return;
    const w=canvas.width,h=canvas.height,mid=h/2;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='#0b1620';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#29414b';ctx.lineWidth=1;
    ctx.beginPath();
    for(let i=0;i<=8;i++) {
      const x=i*w/8;ctx.moveTo(x,0);ctx.lineTo(x,h);
    }
    ctx.moveTo(0,mid);ctx.lineTo(w,mid);ctx.stroke();
    // Editing region is legible even when zoomed or partially off screen.
    const left=toX(start),right=toX(end);
    ctx.fillStyle='rgba(103,91,206,.14)';
    ctx.fillRect(Math.max(0,left),0,Math.max(0,Math.min(w,right)-Math.max(0,left)),h);
    const barWidth=w/(summary.peaks.length/zoom);
    for(let i=0;i<summary.peaks.length;i++) {
      const ms=i/summary.peaks.length*duration;
      if(ms<viewStart-viewSpan()/summary.peaks.length ||
          ms>viewStart+viewSpan()) continue;
      const x=toX(ms);
      const amplitude=Math.max(1,summary.peaks[i]*(mid-14));
      ctx.fillStyle=ms>=start&&ms<=end?'#52d7c1':'#466372';
      ctx.fillRect(x,mid-amplitude,Math.max(1,barWidth*.83),2*amplitude);
    }
    // Fade envelopes show the operator exactly what has been staged.
    const readMs=key=>Number(inputs.get(key)?.value)||0;
    const fadeIn=Math.max(0,readMs('fadeInMs'));
    const fadeOut=Math.max(0,readMs('fadeOutMs'));
    const rate=Math.max(.5,Number(inputs.get('playbackRate')?.value)||1);
    const fadeInX=toX(Math.min(end,start+fadeIn*rate));
    const fadeOutX=toX(Math.max(start,end-fadeOut*rate));
    // Visible editable linear envelope; these are not arbitrary DAW points.
    ctx.strokeStyle='#c3a6ff';ctx.lineWidth=2.8;ctx.beginPath();
    ctx.moveTo(toX(start),fadeIn>0?mid:15);
    ctx.lineTo(fadeInX,15);
    ctx.lineTo(Math.max(fadeInX,fadeOutX),15);
    ctx.lineTo(toX(end),fadeOut>0?mid:15);
    ctx.stroke();
    for(const [x,key] of [[fadeInX,'fadeIn'],[fadeOutX,'fadeOut']]){
      if(x>=0&&x<=w){
        ctx.beginPath();ctx.arc(x,15,7,0,Math.PI*2);
        ctx.fillStyle=key==='fadeIn'?'#e4baff':'#ffe3b2';
        ctx.fill();ctx.strokeStyle='#19212d';ctx.lineWidth=2;ctx.stroke();
      }
    }
    for(const [ms,color] of [[start,'#f6c65d'],[end,'#f18794']]) {
      const x=toX(ms);
      if(x>=0&&x<=w) {
        ctx.fillStyle=color;ctx.fillRect(x-2,0,4,h);
      }
    }
    if(cursorMs!==null) {
      const x=toX(cursorMs);
      if(x>=0&&x<=w) {
        ctx.setLineDash([4,4]);ctx.strokeStyle='#d7dcf1';
        ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    times.textContent=t('waveform.selection',{
      start:(start/1000).toFixed(2),end:(end/1000).toFixed(2),
      duration:((Math.max(0,end-start))/1000).toFixed(2),
    })+(cursorMs===null?'':t('preview.cursorAt',{time:(cursorMs/1000).toFixed(2)}));
    canvas.setAttribute('aria-valuenow',String(start));
    canvas.setAttribute('aria-valuetext',times.textContent);
    progress.dataset.viewStartMs=String(viewStart);
    progress.dataset.viewSpanMs=String(viewSpan());
    syncTimecodes();
    refreshPreviewStudio();
  }
  function place(handle,millis) {
    const {start,end}=clip();
    const value=Math.round(Math.max(0,Math.min(duration,millis))/10)*10;
    if(handle==='in') startField.value=String(Math.max(0,Math.min(value,end-10)));
    else if(handle==='out') {
      const out=Math.max(start+10,Math.min(duration,value));
      endField.value=out>=duration?'':String(out);
    }else{
      const key=handle==='fadeIn'?'fadeInMs':'fadeOutMs';
      const other=handle==='fadeIn'?'fadeOutMs':'fadeInMs';
      const loop=Boolean(startField.closest('form')?.querySelector('[name="loop"]')?.checked);
      const rate=Math.max(.5,Number(inputs.get('playbackRate')?.value)||1);
      const fade=clampCueFade({handle,positionMs:value,inMs:start,outMs:end,rate,
        otherFadeMs:Number(inputs.get(other).value||0),loop});
      if(inputs.get(key).disabled)return;
      inputs.get(key).value=String(fade);
    }
    inspectorPendingChanges=true;
    redraw();
  }
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    if(e.altKey) {
      const {start,end}=clip();
      cursorMs=Math.max(start,Math.min(end-10,Math.round(point(e)/10)*10));
      redraw();return;
    }
    const {start,end}=clip(),ms=point(e);
    const rect=canvas.getBoundingClientRect();
    const x=((e.clientX-rect.left)/Math.max(1,rect.width))*canvas.width;
    const y=((e.clientY-rect.top)/Math.max(1,rect.height))*canvas.height;
    const rate=Math.max(.5,Number(inputs.get('playbackRate')?.value)||1);
    const fin=toX(start+(Number(inputs.get('fadeInMs').value)||0)*rate);
    const fout=toX(end-(Number(inputs.get('fadeOutMs').value)||0)*rate);
    const distIn=Math.abs(x-fin),distOut=Math.abs(x-fout);
    if(y<40 && Math.min(distIn,distOut)<=24){
      dragging=distIn<=distOut?'fadeIn':'fadeOut';
    }else dragging=Math.abs(ms-start)<=Math.abs(ms-end)?'in':'out';
    canvas.setPointerCapture?.(e.pointerId);
    place(dragging,ms);
  });
  canvas.addEventListener('pointermove',e=>{if(dragging)place(dragging,point(e));});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])
    canvas.addEventListener(event,()=>{dragging=null;});
  canvas.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight'].includes(e.key))return;
    e.preventDefault();
    const {start,end}=clip(),handle=e.shiftKey?'out':'in';
    place(handle,(handle==='in'?start:end)+(e.key==='ArrowLeft'?-10:10));
  });
  for(const input of inputs.values())input.addEventListener('input',redraw);
  zoomOut.addEventListener('click',()=>{
    zoom=Math.max(1,zoom/2);
    refreshPan();redraw();
  });
  zoomIn.addEventListener('click',()=>{
    zoom=Math.min(8,zoom*2);
    const {start,end}=clip();
    viewStart=Math.max(0,Math.min(duration-viewSpan(),(start+end)/2-viewSpan()/2));
    refreshPan();redraw();
  });
  fit.addEventListener('click',()=>{
    zoom=1;viewStart=0;refreshPan();redraw();
  });
  pan.addEventListener('input',()=>{
    viewStart=Number(pan.value);redraw();
  });
  const listen=node('button','btn wave-listen',t('preview.track'));
  listen.type='button';listen.dataset.previewTrack=trackId;
  listen.dataset.previewAsset=assetId;
  listen.addEventListener('click',()=>listenToCue(cueId,{trackId}));
  const fromCursor=node('button','btn wave-cursor',t('preview.fromCursor'));
  fromCursor.type='button';
  fromCursor.addEventListener('click',()=>{
    const {start}=clip();
    listenToCue(cueId,{trackId,fromMs:cursorMs??start});
  });
  const stop=node('button','btn wave-stop',t('preview.stop'));
  stop.type='button';stop.dataset.previewStop='true';
  stop.addEventListener('click',stopCuePreview);
  toolbar.append(listen,fromCursor,stop,zoomOut,zoomIn,fit,zoomReadout);
  block.append(stage,times,timing,scrubWrap,tools,toolbar,pan,instruction,advanced);
  refreshPan();redraw();
  return block;
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
  const endAt = numericField('endAtMs', 1, 600000, 1, 'audioProps.endAtHelp');
  endAt.required=false;endAt.value=settings.endAtMs===null?'':String(settings.endAtMs);
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
  if(cue.actions.length===1 && cue.actions[0].type==='PLAY') {
    const gainField=inputs.get('gainDb').closest('label');
    form.insertBefore(cueWaveformTrim(cue.actions[0].assetId, inputs,
      {cueId:cue.id,trackId:'primary'}),gainField.nextSibling);
  }
  form.append(node('p', 'caption', t('audioProps.noAuto')));
  const save = node('button', 'btn primary small', t('audioProps.save'));
  save.type = 'submit';
  form.append(save);
  form.addEventListener('input', () => { inspectorPendingChanges = true; });
  form.addEventListener('change', () => { inspectorPendingChanges = true; refreshPreviewStudio(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const next = { loop: loop.checked };
    for (const [key, input] of inputs) {
      next[key] = key==='endAtMs' && input.value.trim()===''?null:Number(input.value);
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

  const policy=normalizeCueEntryPolicy(cue.entryPolicy);
  const policyForm=node('form','cue-overlap-policy');
  policyForm.id='cueEntryPolicyForm';
  policyForm.append(node('h4','inspector-section-heading',
    uiLocale==='es'?'Al entrar este cue':'When this cue starts'));
  const modeLabel=node('label','field',uiLocale==='es'?'Audio anterior':'Previous audio');
  const modeSelect=node('select');
  modeSelect.name='mode';modeSelect.id='cueEntryMode';
  for(const [value,en,es] of [
    ['OVERLAP','Allow sounds to overlap','Permitir solapar sonidos'],
    ['STOP_PREVIOUS','Stop all earlier cues','Detener todos los cues anteriores'],
  ]) {
    const option=node('option','',uiLocale==='es'?es:en);
    option.value=value;modeSelect.append(option);
  }
  modeSelect.value=policy.mode;
  modeLabel.append(modeSelect);
  const fadeLabel=node('label','field',uiLocale==='es'?'Fade al detener (segundos)':'Stop fade (seconds)');
  const fadeInput=node('input');fadeInput.type='number';fadeInput.name='fadeSeconds';
  fadeInput.min='0';fadeInput.max='10';fadeInput.step='0.1';
  fadeInput.value=String(policy.fadeOutMs/1000);
  const sync=()=>{fadeInput.disabled=modeSelect.value!=='STOP_PREVIOUS';};
  modeSelect.addEventListener('change',sync);sync();
  fadeLabel.append(fadeInput);
  const helper=node('p','caption',uiLocale==='es'
    ?'Se aplica solo al pulsar GO. La parada de cues específicos sigue disponible debajo.'
    :'Applied only on GO. Targeted cue stops remain configurable below.');
  const savePolicy=node('button','btn primary small',uiLocale==='es'?'Guardar política':'Save stop policy');
  savePolicy.type='submit';
  policyForm.append(modeLabel,fadeLabel,helper,savePolicy);
  policyForm.addEventListener('change',()=>{inspectorPendingChanges=true;});
  policyForm.addEventListener('submit',event=>{
    event.preventDefault();
    try {
      show=setCueEntryPolicy(show,cue.id,{
        mode:modeSelect.value,fadeOutMs:Math.round(Number(fadeInput.value)*1000),
      });
      inspectorPendingChanges=false;dirty=true;render();
      feedback('cueEditor.actionsSaved',{number:cue.number},'success');
    }catch(error){showError(error);}
  });
  pane.append(policyForm);
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
      ['startDelayMs',0,10000,1],['startAtMs',0,600000,1],['endAtMs',1,600000,1],
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
    const endAt = fields.get('endAtMs');
    endAt.required=false;endAt.value=settings.endAtMs===null?'':String(settings.endAtMs);
    form.insertBefore(cueWaveformTrim(track.assetId, fields,
      {cueId:cue.id,trackId:track.id}),form.firstChild);
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
      for(const [key,input] of fields) settingsNext[key]=key==='endAtMs' && input.value.trim()===''?null:Number(input.value);
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
  const chatButton=node('button','btn rq-chat-open','Editar con IA');
  chatButton.type='button';
  chatButton.textContent=uiLocale==='es'?'Editar conversando':'Edit with AI';
  chatButton.addEventListener('click',()=>{
    document.dispatchEvent(new CustomEvent('runq:cue-chat-open',{detail:{cueId:cue.id}}));
  });
  inspector.append(header);
  inspector.append(chatButton);
  inspector.append(node('p', 'cue-inspector-origin', cue.sourceLineIds.join(', ') + ' · ' +
    (cue.trigger || t('cueEditor.noTrigger'))));
  if(cue.actions.every(a=>a.type==='PLAY')) {
    const studio=node('section','cue-audition-studio');
    studio.dataset.cueAuditionStudio=cue.id;
    const kicker=node('span','studio-kicker',t('preview.kicker'));
    const controls=node('div','cue-preview-controls');
    const listen=node('button','btn cue-preview-play',t('preview.cue'));
    listen.type='button';
    listen.dataset.previewCue=cue.id;
    listen.addEventListener('click',()=>listenToCue(cue.id));
    const stop=node('button','btn cue-preview-stop',t('preview.stop'));
    stop.type='button';
    stop.dataset.previewStop='true';
    stop.addEventListener('click',stopCuePreview);
    const prepare=node('button','btn cue-preview-prepare',t('preview.prepare'));
    prepare.type='button';
    prepare.disabled=cue.id===operatorQueue.preparedCueId;
    prepare.addEventListener('click',()=>{
      operatorQueue = prepareOperatorCue(operatorQueue, show.cues, cue.id);
      render();
      feedback('operator.preparedFeedback',{number:cue.number},'success');
    });
    controls.append(listen,stop,prepare);
    const quickGain=node('label','studio-quick-gain');
    const gainLabel=node('span','',t('preview.quickGain'));
    const gainInput=node('input');
    gainInput.type='number';gainInput.min='-60';gainInput.max='0';
    gainInput.step='0.5';
    gainInput.value=String(normalizeCuePlayback(cue.playback).gainDb);
    gainInput.dataset.quickGainCue=cue.id;
    gainInput.setAttribute('aria-label',t('preview.quickGainAria'));
    gainInput.addEventListener('input',()=>{
      const main=document.querySelector('#cuePlaybackForm [name="gainDb"]');
      if(main) {
        main.value=gainInput.value;
        main.dispatchEvent(new Event('input',{bubbles:true}));
      }
      inspectorPendingChanges=true;
      refreshPreviewStudio();
    });
    quickGain.append(gainLabel,gainInput,node('span','', 'dB'));
    const state=node('p','studio-preview-status',t('preview.ready'));
    state.dataset.previewStatus='true';
    state.setAttribute('role','status');
    state.setAttribute('aria-live','off');
    const outputCompact=node('p','studio-output-compact',t('preview.outputCompact'));
    studio.append(kicker,controls,quickGain,state,
      node('p','studio-output-warning',t('preview.outputWarning')),outputCompact);
    inspector.append(studio);
  }

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
    // Keep essential playback controls visible on short desktop viewports.
    panel.append(cuePlaybackEditor(cue));
    panel.append(cueAudioSourceControls(cue));
    panel.append(node('p', 'caption', t('audioProps.currentLimits')));
  } else {
    panel.append(cueActionInspector(cue));
    panel.append(sourceButton(cue.sourceLineIds[0]));
  }
  inspector.append(panel);
  inspector.scrollTop = previousScrollTop;
  refreshPreviewStudio();
}

/**
 * Conversational editor is advisory. Project state is changed only when the
 * operator clicks Apply. This bridge reuses native cue validators, never GO.
 */
let cueChatUndo=null;
function safeCueChatEditState(){
 const status=player.getStatus();
 return activeWorkspace==='cues'&&!audioInFlight&&!bundleInFlight&&
  !status.activeCueCount&&!status.pendingGoCount&&!status.auditionActive&&!status.auditionPending&&
  !inspectorPendingChanges;
}
document.addEventListener('runq:cue-chat-context',event=>{
 const respond=event.detail?.respond;
 if(typeof respond!=='function')return;
 respond({project:show,cueId:selectedCueId,language:uiLocale,canApply:safeCueChatEditState(),
  undoAvailable:Boolean(cueChatUndo&&cueChatUndo.after===JSON.stringify(show))});
});
document.addEventListener('runq:cue-chat-apply',event=>{
 const respond=event.detail?.respond,request=event.detail;
 const answer=value=>{if(typeof respond==='function')respond(value);};
 if(!safeCueChatEditState()){answer({ok:false,error:'STOP_AUDIO_OR_SAVE_MANUAL_EDITS'});return;}
 if(typeof request?.cueId!=='string'||request.cueId!==selectedCueId||
    request?.base!==JSON.stringify(show)){answer({ok:false,error:'STALE_PROJECT_OR_SELECTION'});return;}
 try{
  const result=stageCueConversationChange(show,request.cueId,request.changes);
  if(!result.diff.length){answer({ok:false,error:'NO_CHANGES'});return;}
  const before=show;
  show=result.project;
  cueChatUndo={before,after:JSON.stringify(show),cueId:request.cueId};
  dirty=true;inspectorPendingChanges=false;render();
  answer({ok:true,changes:result.diff.length});
 }catch(error){answer({ok:false,error:'INVALID_CUE_CHANGE',detail:String(error.message).slice(0,120)});}
});
document.addEventListener('runq:cue-chat-undo',event=>{
 const respond=event.detail?.respond;
 const answer=value=>{if(typeof respond==='function')respond(value);};
 if(!safeCueChatEditState()){answer({ok:false,error:'STOP_AUDIO_OR_SAVE_MANUAL_EDITS'});return;}
 if(!cueChatUndo||cueChatUndo.after!==JSON.stringify(show)){
  cueChatUndo=null;answer({ok:false,error:'PROJECT_CHANGED'});return;
 }
 show=cueChatUndo.before;cueChatUndo=null;dirty=true;
 render();answer({ok:true});
});

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
  stopSoundLabPreview();
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
function editCueSequence(fn,{preserveQueue=false}={}) {
  if (inspectorPendingChanges && !confirmDiscardInspectorEdits()) return;
  const status = player.getStatus();
  if (audioInFlight || soundLabPreviewReserved || status.activeCueCount || status.pendingGoCount || status.auditionActive || status.auditionPending) {
    feedback('cueEditor.stopBeforeEdit', {}, 'error');
    return;
  }
  try {
    const result = fn();
    show = result.project ?? result;
    selectedCueId = result.cueId ?? (show.cues.some(c => c.id === selectedCueId) ? selectedCueId : show.cues[0]?.id ?? null);
    // Drag reorder changes sequence order, not the operator's prepared cue.
    // Structural add/delete/duplicate still use the established reset policy.
    if(!preserveQueue || (operatorQueue.preparedCueId &&
      !show.cues.some(c=>c.id===operatorQueue.preparedCueId))){
      operatorQueue = startOperatorQueue(show.cues);
      lastGoCueId = null;
    }
    inspectorPendingChanges = false;
    editingCueId = null;
    $('cueSearchInput').value = '';
    dirty = true;
    render();
    feedback('cueEditor.sequenceChanged', {}, 'success');
  } catch(error) { showError(error); }
}
$('cueAddBtn').addEventListener('click', () => editCueSequence(() => insertManualCue(show)));
$('cueInsertBtn').addEventListener('click', () => editCueSequence(() => insertManualCue(show,{afterCueId:selectedCueId})));
$('cueDuplicateBtn').addEventListener('click', () => editCueSequence(() => duplicateOperatorCue(show,selectedCueId)));
$('cueMoveUpBtn').addEventListener('click', () => editCueSequence(() => moveOperatorCue(show,selectedCueId,-1)));
$('cueMoveDownBtn').addEventListener('click', () => editCueSequence(() => moveOperatorCue(show,selectedCueId,1)));
$('cueDeleteBtn').addEventListener('click', () => {
  if (!selectedCueId || !window.confirm(t('cueEditor.confirmDelete'))) return;
  editCueSequence(() => deleteOperatorCue(show, selectedCueId));
});
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
// Row selection/double-click remains inspection-only. The explicit ▶ row
// control is a separate intentional GO gesture; it never mutates NEXT.

// Shared guarded path for manual GO and explicitly ARMED rehearsal auto-GO.
// Both use the same audio engine, cue entry policies and completion logic.
let goTransportPending=false;
async function executeCueById(id,{advancePrepared=false}={}){
 if(!id||goTransportPending||audioInFlight||bundleInFlight||soundLabPreviewReserved)return false;
 const generation=projectGeneration;
 const cue=normalizeShowProject(show).cues.find(item=>item.id===id);
 if(!cue||cue.actions.some(a=>a.type!=='PLAY'||!player.hasAsset(a.assetId))||
   (cue.audioTracks??[]).some(track=>!player.hasAsset(track.assetId)))return false;
 const status=player.getStatus();
 if(status.pendingGoCount||status.auditionActive||status.auditionPending||
    player.isPlaying(id))return false;
 goTransportPending=true;
 try{
   for(const stop of planEntryStops(show.cues,id,cue.entryPolicy,cue.automation?.stopCueIds??[])){
     player.stopCue(stop.cueId,stop.fadeMs);
   }
   for(const targetId of cue.automation?.stopCueIds??[]){
     const target=show.cues.find(item=>item.id===targetId);
     player.stopCue(targetId,cue.stopFadeOverrides?.[targetId]??target?.playback?.fadeOutMs??0);
   }
   await player.go(cue);
   if(generation!==projectGeneration)return false;
   lastGoCueId=id;
   if(advancePrepared&&operatorQueue.preparedCueId===id)
     operatorQueue=completePreparedCue(operatorQueue,show.cues,id);
   render();
   feedback('operator.goFeedback',{number:cue.number},'success');
   return true;
 }catch(error){showError(error);return false;}
 finally{goTransportPending=false;refreshAudioControls();}
}
function executePreparedGo(){
 return executeCueById(operatorQueue.preparedCueId,{advancePrepared:true});
}
$('operatorGoBtn').addEventListener('click',()=>{ 
 document.dispatchEvent(new CustomEvent('runq:rehearsal-auto-disarm',{detail:{reason:'manual_go'}}));
 void executePreparedGo();
});
/**
 * Deliberately scoped machine GO: only an actively streaming, manually ARMED
 * Rehearsal session may send an explicit cue ID. Never allowed in Operation.
 * This event does not bypass the real engine's guards and does not fire skipped cues.
 */
document.addEventListener('runq:rehearsal-auto-arm-audio',event=>{
 const respond=event.detail?.respond;
 if(typeof respond!=='function')return;
 if(activeWorkspace!=='rehearsal'||document.hidden||bundleInFlight||audioInFlight||soundLabPreviewReserved){
   respond({ok:false,reason:'REHEARSAL_NOT_READY'});return;
 }
 // Must be called synchronously from the operator's ARM gesture to unlock
 // the Web Audio output without producing any sound.
 void player.armAudioOutput().then(()=>respond({ok:true}),
   ()=>respond({ok:false,reason:'AUDIO_OUTPUT_SUSPENDED'}));
});
document.addEventListener('runq:rehearsal-auto-go',event=>{
 const cueId=event.detail?.cueId,respond=event.detail?.respond;
 const report=payload=>{if(typeof respond==='function')respond(payload);};
 if(activeWorkspace!=='rehearsal'||document.hidden||
   document.body?.dataset.runqVoiceCapture!=='live'||
   $('rqLiveArm')?.getAttribute('aria-pressed')!=='true'||
   typeof cueId!=='string'||goTransportPending||audioInFlight||bundleInFlight||soundLabPreviewReserved){
   report({ok:false,reason:'NOT_ARMED_OR_BUSY'});return;
 }
 const cue=show.cues.find(c=>c.id===cueId);
 if(!cue){report({ok:false,reason:'UNKNOWN_CUE'});return;}
 if(cue.actions.some(a=>a.type!=='PLAY'||!player.hasAsset(a.assetId))||
    (cue.audioTracks??[]).some(t=>!player.hasAsset(t.assetId))){
   report({ok:false,reason:'AUDIO_NOT_READY'});return;
 }
 const state=player.getStatus();
 if(state.pendingGoCount||state.auditionActive||state.auditionPending){
   report({ok:false,reason:'TRANSPORT_BUSY'});return;
 }
 const prior=operatorQueue,projectAtStart=projectGeneration;
 // Rehearsal REPEAT explicitly restarts the previous cue.
 // All other overlap/stop policies remain whatever the operator authored.
 if(player.isPlaying(cueId)){
   try{player.stopCue(cueId,0);}catch{report({ok:false,reason:'REPEAT_STOP_FAILED'});return;}
 }
 try{
   operatorQueue=prepareOperatorCue(operatorQueue,show.cues,cueId);
   refreshAudioControls();
   void executePreparedGo().then(ok=>{
     if(!ok&&projectAtStart===projectGeneration&&operatorQueue.preparedCueId===cueId){
       operatorQueue=prior;render();
     }
     report({ok,reason:ok?'FIRED':'GO_FAILED'});
   }).catch(()=>report({ok:false,reason:'GO_FAILED'}));
 }catch(error){operatorQueue=prior;report({ok:false,reason:'PREPARE_FAILED'});}
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
  let activityScope = { provider, startedAt: 0 };
  const isRepeat = provider === 'meta' && metaCoverage?.complete === true;
  const designMode = provider === 'meta' ? $('metaDesignMode').value : null;
  const performanceKind = provider === 'meta' ? $('performanceKindSelect').value : null;
  const documentKind = provider === 'meta' ? $('documentKindSelect').value : null;
  if (provider === 'meta') {
    const plan = planScriptAnalysis(show.scriptText);
    analysisWindowStart = metaCoverage?.nextWindowStart ?? 0;
    const batch = plan.windows.slice(analysisWindowStart, analysisWindowStart + metaWindowsPerRequest);
    if (!batch.length) { showError(uiError('errors.metaResponse')); return; }
    const lineCount = batch.reduce((sum, window) => sum + window.coreLines.length, 0);
    activityScope = {
      provider, startedAt: 0, lineCount,
      startWindow: analysisWindowStart + 1,
      endWindow: analysisWindowStart + batch.length,
      totalWindows: plan.windows.length,
    };
    if (!window.confirm(t('status.confirmMeta', {
      windowCount: batch.length,
      lineCount,
      startWindow: analysisWindowStart + 1,
      endWindow: analysisWindowStart + batch.length,
      totalWindows: plan.windows.length,
    }) + (isRepeat ? '\n\n' + t('status.confirmMetaRepeat') : ''))) return;
  } else if (!window.confirm(t('status.confirmBaseten'))) return;
  const generation = projectGeneration;
  metaActivity = { ...activityScope, startedAt: Date.now() };
  metaInFlight = true;
  if (metaActivityTimer !== null) window.clearInterval(metaActivityTimer);
  metaActivityTimer = window.setInterval(() => refreshMetaActivity(), 1000);
  render();
  feedback(provider === 'baseten' ? 'status.basetenInProgress' : 'status.metaInProgress');
  try {
    const response = await fetch('/api/' + provider + '/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: JSON.parse(snapshot),
        scriptLanguage,
        ...(provider === 'meta' ? { analysisWindowStart, designMode, performanceKind, documentKind } : {}),
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
      applyMetaIndependentReview(result.independentReview, result.coverage);
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
    if (metaActivityTimer !== null) window.clearInterval(metaActivityTimer);
    metaActivityTimer = null;
    metaActivity = null;
    metaInFlight = false;
    render();
  }
});

function emergencyStopAllAudio() {
  document.dispatchEvent(new CustomEvent('runq:rehearsal-auto-disarm',{detail:{reason:'stop_all'}}));
  stopSoundLabPreview();
  player.stopAll();
  feedback('status.panic', {}, 'success');
}
$('stopAllBtn').addEventListener('click', emergencyStopAllAudio);
$('operatorPanicBtn').addEventListener('click', emergencyStopAllAudio);
document.addEventListener('runq:sound-stop-preview',()=>stopSoundLabPreview());
$('stopAuditionBtn').addEventListener('click', () => {
  const hadLabPreview=soundLabPreviewReserved;
  stopSoundLabPreview();
  if (player.stopAudition()||hadLabPreview)feedback('audio.auditionStopped', {}, 'success');
});

/** Batch intake only modifies the library. No cues are linked or executed. */
function reportAudioImport(headline,items=[]){
  const panel=$('audioBatchReport');
  panel.hidden=false;
  $('audioBatchStatus').textContent=headline;
  const details=$('audioBatchDetails');
  details.replaceChildren();
  for(const item of items.slice(0,12)){
    const li=node('li','audio-batch-detail');
    li.textContent=item.name+' · '+item.reason;
    details.append(li);
  }
  if(items.length>12)details.append(node('li','audio-batch-more',
    '+ '+(items.length-12)+(uiLocale==='es'?' incidencias adicionales':' more issues')));
}
/** Show ZIP import is deliberately not here. This accepts ordinary archives
 * of audio files, without ever replacing an existing loaded shared asset.
 */
async function importAudioLibraryBatch(selected,{zip=false}={}){
  if(audioInFlight||bundleInFlight)return;
  const busy=player.getStatus();
  if(soundLabPreviewReserved||busy.activeCueCount||busy.pendingGoCount||busy.auditionActive||busy.auditionPending){
    reportAudioImport(t('audioBatch.busy'));return;
  }
  if(!selected.length)return;
  audioInFlight=true;refreshAudioControls();
  const generation=projectGeneration;
  let added=0,restored=0,issues=[];
  try{
    let files=selected;
    if(zip){
      const archive=selected[0];
      if(!archive)throw uiError('audioBatch.zipInvalid');
      reportAudioImport((uiLocale==='es'?'Leyendo archivo comprimido: ':'Opening archive: ')+archive.name);
      const extracted=await extractAudioArchive(archive);
      files=extracted.files;issues=[...extracted.skipped];
    }
    if(generation!==projectGeneration)throw uiError('errors.projectChanged');
    const assignment=planAudioLibraryBatch(files,show.assets,id=>player.hasAsset(id));
    issues.push(...assignment.skipped);
    const tasks=assignment.accepted;
    if(!tasks.length){
      reportAudioImport(t('audioBatch.complete',{added:0,restored:0,skipped:issues.length}),issues);
      return;
    }
    for(let index=0;index<tasks.length;index++){
      const entry=tasks[index];
      reportAudioImport(t('audioBatch.progress',{
        current:index+1,total:tasks.length,name:entry.file.name,
      }),issues);
      try{
        if(generation!==projectGeneration)throw uiError('errors.projectChanged');
        const current=show;
        if(!entry.assetId && current.assets.length>=500)
          throw new RangeError('Library limit: 500 audio references');
        const expectedId=entry.assetId??nextAvailableId('asset',current.assets.map(a=>a.id));
        // The decoder validates extension, ≤20 MB, channels and ≤10 min.
        await player.loadFile(entry.file,expectedId);
        if(generation!==projectGeneration)throw uiError('errors.projectChanged');
        if(!entry.assetId){
          const updated=addAudioReference(show,entry.file.name);
          if(updated.assets.at(-1)?.id!==expectedId)
            throw uiError('errors.staleAudioList');
          show=updated;added++;
        }else restored++;
        originalAudioFiles.set(expectedId,entry.file);
        dirty=true;
      }catch(error){
        if(generation!==projectGeneration)throw error;
        issues.push({name:entry.file.name,reason:error?.message??'Unable to decode audio'});
      }
    }
    render(); // Reuse the ordinary Stagecraft library list and asset picker.
    reportAudioImport(t('audioBatch.complete',{
      added,restored,skipped:issues.length,
    }),issues);
  }catch(error){
    reportAudioImport(t('audioBatch.errorTitle')+': '+
      (error?.uiKey?t(error.uiKey):error?.message??String(error)),issues);
  }finally{
    audioInFlight=false;
    refreshAudioControls();
  }
}
$('importAudioBatchBtn').addEventListener('click',()=>{
  if(audioInFlight||bundleInFlight)return;
  $('audioBatchFilesInput').value='';
  $('audioBatchFilesInput').click();
});
$('importAudioZipBtn').addEventListener('click',()=>{
  if(audioInFlight||bundleInFlight)return;
  $('audioBatchZipInput').value='';
  $('audioBatchZipInput').click();
});
$('audioBatchFilesInput').addEventListener('change',event=>{
  const files=[...(event.target.files??[])];
  event.target.value='';
  void importAudioLibraryBatch(files);
});
$('audioBatchZipInput').addEventListener('change',event=>{
  const files=[...(event.target.files??[])];
  event.target.value='';
  void importAudioLibraryBatch(files,{zip:true});
});

$('loadAudioBtn').addEventListener('click', () => pickAudioFile());
async function importSingleAudioFile(file, {
  cueId = null, provenance = undefined, refuseReplacement = false,
} = {}) {
  if (!file || audioInFlight) return null;
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
    if (provenance) {
      const alreadyImported = before.assets.find(asset =>
        asset.provenance?.origin === 'AI_GENERATED_SFX' &&
        asset.provenance.requestId === provenance.requestId);
      if (alreadyImported) throw new Error('This generated request is already in the library as ' + alreadyImported.name);
      if (existing.length || refuseReplacement && player.hasAsset(existing[0]?.id)) {
        throw new Error('Generated audio cannot replace an existing library asset');
      }
    }
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
      nextShow = existing.length ? before : addAudioReference(before, file.name,
        provenance === undefined ? {} : { provenance });
      if (nextShow.assets.at(-1)?.id !== assetId && !existing.length) {
        throw uiError('errors.staleAudioList');
      }
    }
    const transport = player.getStatus();
    if (soundLabPreviewReserved || transport.activeCueCount || transport.pendingGoCount || transport.auditionActive || transport.auditionPending) throw uiError('errors.audioWhilePlaying');
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
    return { assetId, info };
  } finally {
    audioInFlight = false;
    button.disabled = false;
    for (const picker of document.querySelectorAll('[data-cue-audio-pick]')) picker.disabled = false;
    refreshAudioControls();
  }
}
$('audioFileInput').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  const cueId = pendingAudioCueId;
  pendingAudioCueId = null;
  event.target.value = '';
  try { await importSingleAudioFile(file, { cueId }); }
  catch (error) { showError(error); }
});

async function importReviewedGeneratedSfx({job,audioBytes,reviewedRegion,createCue=false}={}){
  const candidate=await prepareReviewedSfxImport({job,audioBytes,reviewedRegion});
  const result=await importSingleAudioFile(candidate.file,{
    provenance:candidate.provenance,refuseReplacement:true,
  });
  if(!result)throw new Error('Generated WAV was not imported');
  if(createCue){
    // Human confirmed this additional edit; never changes or fires the GO queue.
    const next=createCueFromReviewedAudio(show,{
      assetId:result.assetId,job,reviewedRegion,
    });
    show=next.project;
    selectedCueId=next.cueId;
    dirty=true;
    render();
    setWorkspace('cues');
    return {assetId:result.assetId,cueId:next.cueId,
      message:'Generated WAV imported and editable audio cue created. GO is still manual.'};
  }
  setWorkspace('audio');
  return {assetId:result.assetId,
    message:'Generated WAV imported to library. No cue was changed.'};
}

function reportSoundLabBootstrapError(error) {
  // A missing ES module used to leave an apparently interactive Sound Lab
  // with all controls inert. Make the loading failure visible in that workspace.
  const reason=String(error?.message??'Error al cargar módulo').slice(0,220);
  const badge=document.getElementById('engineBadge');
  if(badge){badge.textContent='Error de carga';badge.classList.remove('active');}
  const hint=document.getElementById('generationHint');
  if(hint)hint.textContent='No se pudo iniciar Sound Lab. Revisa la consola y la ruta de los módulos.';
  const detail=document.getElementById('feedback');
  if(detail){detail.textContent='Sound Lab no se ha iniciado: '+reason;detail.classList.add('error');}
  showError(error);
}
async function ensureSoundLabInitialized() {
  if (!soundLabModulePromise) {
    soundLabModulePromise = import('../sfx/lab.mjs').catch(error => {
      soundLabModulePromise = null;
      throw error;
    });
  }
  const module = await soundLabModulePromise;
  stopSoundLabPreview=module.stopSoundLabAudition;
  await module.initializeSoundLab({
    onImportReviewed:importReviewedGeneratedSfx,
    onReservePreview:reserveSoundLabPreview,
    onPreviewReleased:releaseSoundLabPreview,
  });
}

$('uiLocaleSelect').value = uiLocale;
const requestedWorkspace = new URLSearchParams(window.location.search).get('workspace');
if (availableWorkspaces.includes(requestedWorkspace))
  activeWorkspace = requestedWorkspace==='soundlab'?'audio':requestedWorkspace;
translateDocument(document, uiLocale);
resetScriptLanguageHint();
render();
// The SFX status check is read-only. Eagerly bind the Sound Lab on page load
// instead of depending on a specific navigation event from alternative menus.
// No provider submission or paid generation can occur during initialization.
void ensureSoundLabInitialized().catch(reportSoundLabBootstrapError);
refreshMetaMessage();
feedback(statusState.key, statusState.values, statusState.tone);
refreshMetaStatus();
