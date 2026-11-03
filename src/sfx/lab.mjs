import { compileSoundProposals, applyProposalEdits, recompileProposal, prepareCueSoundDraft } from '../core/soundPromptCompiler.mjs';
import { waveformPeaks, trimBounds, makeOfflineImpactDemoWav } from './waveform.mjs';
import { userFacingError } from '../ui/userFacingErrors.mjs';
const PROMPT_ONLY = true; // Final demo: Meta proposes cues; audio is imported locally.
const isSpanish = () => document.getElementById('uiLocaleSelect')?.value === 'es';
const ux = (es,en) => isSpanish() ? es : en;

export function createSfxResultWatcher({
  check, onStop, schedule = setTimeout, unschedule = clearTimeout,
  now = () => performance.now(),
}) {
  let epoch = 0, timer = null, deadlineTimer = null, active = false, controller = null;
  function stop(reason = 'cancelled', error = null) {
    if (!active) return;
    active = false; epoch++;
    if (timer !== null) unschedule(timer);
    if (deadlineTimer !== null) unschedule(deadlineTimer);
    deadlineTimer = null;
    timer = null; controller?.abort(); controller = null;
    onStop(reason, error);
  }
  function start() {
    if (active) return;
    active = true;
    const token = ++epoch, deadline = now() + 120000;
    deadlineTimer = schedule(() => stop('limit'), 120000);
    let checks = 0;
    async function tick() {
      timer = null;
      if (!active || token !== epoch) return;
      if (now() >= deadline || checks >= 24) { stop('limit'); return; }
      controller = new AbortController();
      try {
        checks++;
        const done = await check(controller.signal);
        if (!active || token !== epoch) return;
        if (done) { stop('complete'); return; }
        timer = schedule(tick, 5000);
      } catch (error) {
        if (active && token === epoch) stop('error', error);
      }
    }
    void tick();
  }
  return {start, stop, get active() { return active; }};
}

const api = '/api/sfx';
const STATUS_WITH_AUDIO = new Set(['READY_FOR_REVIEW','ACCEPTED_FOR_MANUAL_IMPORT']);
const ACTIVE_STATUS = new Set(['QUEUED','RUNNING','CANCEL_REQUESTED']);
const STATUS_LABEL = Object.freeze({
  SUBMISSION_UNKNOWN:'Envío incierto — no reintentar automáticamente',
  QUEUED:'En cola', RUNNING:'Esperando GPU o generando', READY_FOR_REVIEW:'Lista para escuchar',
  ACCEPTED_FOR_MANUAL_IMPORT:'Aceptada para guardar', REJECTED:'Descartada',
  CANCEL_REQUESTED:'Cancelación solicitada', CANCELLED:'Cancelada', FAILED:'Error',
});

export const SFX_ACCEPTANCE_CASES = Object.freeze({
  door:Object.freeze({
    kind:'SFX', durationSeconds:8, seed:104729,
    prompt:'A single heavy antique wooden door slowly creaks open on rusty iron hinges, pauses briefly, then swings shut with one solid wooden slam, dry theatrical sound effect, no music, no voices, no background ambience.',
  }),
  storm:Object.freeze({
    kind:'ENVIRONMENT', durationSeconds:12, seed:209759,
    prompt:'Steady rain and gusting wind outdoors during a storm, with one powerful thunderclap at medium distance around the middle of the sound, realistic theatrical ambience, no music, no voices.',
  }),
  audience:Object.freeze({
    kind:'ENVIRONMENT', durationSeconds:12, seed:314159,
    prompt:'A small seated theatre audience murmurs quietly before a performance, then the conversations gradually fade until the room becomes attentive and nearly silent, realistic indoor acoustics, no applause, no music.',
  }),
});

const STATUS_LABEL_EN = Object.freeze({
  SUBMISSION_UNKNOWN:'Status uncertain — check before retrying',
  QUEUED:'Queued', RUNNING:'Generating', READY_FOR_REVIEW:'Ready to listen',
  ACCEPTED_FOR_MANUAL_IMPORT:'Accepted', REJECTED:'Discarded',
  CANCEL_REQUESTED:'Cancellation requested', CANCELLED:'Cancelled', FAILED:'Failed',
});
const jobLabel = status => (isSpanish() ? STATUS_LABEL : STATUS_LABEL_EN)[status] ?? ux('Estado desconocido','Status unavailable');

const state = {
  initialized:false, enabled:false, working:false, job:null, audio:null,
  historyJobs:[],recoveredJob:false,preparingPreview:false,
  contextTask:null,
  sourceBytes:null, context:null, source:null, gain:null, monitorGain:null, peaks:null,
  fileOrigin:null, loadedRemoteRequestId:null,
  inSeconds:0, outSeconds:0, fadeInSeconds:0, fadeOutSeconds:0, dragStart:null, settings:null,
  onImportReviewed:null,
  onReservePreview:null, onPreviewReleased:null, previewReserved:false, previewEpoch:0,
  libraryAssetId:null, onCommitLibraryReview:null,
};
const $ = id => document.getElementById(id);
let preparationBusy = false;
const preparedReviews = new Map();
const reviewRegion = () => Object.freeze({
  inSeconds:state.inSeconds,outSeconds:state.outSeconds,
  fadeInSeconds:state.fadeInSeconds,fadeOutSeconds:state.fadeOutSeconds,
});
function rememberPreparedRegion(){
  if(state.fileOrigin!=='remote'||!state.contextTask?.cueId||
     state.loadedRemoteRequestId!==state.job?.requestId)return;
  for(const [id,review] of preparedReviews){
    if(review.taskContext.projectId!==state.contextTask.projectId||
       review.taskContext.generation!==state.contextTask.generation)preparedReviews.delete(id);
  }
  preparedReviews.set(state.job.requestId,{
    requestId:state.job.requestId,sha256:state.job.wav.sha256,
    taskContext:structuredClone(state.contextTask),reviewedRegion:reviewRegion(),
  });
}
const text = (id,value) => { const element=$(id); if(element)element.textContent=value; };
const resultWatcher=createSfxResultWatcher({
  check:async signal=>{
    const id=state.job?.requestId;
    if(!id||!ACTIVE_STATUS.has(state.job.status))return true;
    if(state.working)return false;
    const response=await request('/jobs/'+encodeURIComponent(id)+'/refresh',
      {method:'POST',data:{},signal});
    const job=await response.json();
    if(signal.aborted||state.job?.requestId!==id)return true;
    if(job.requestId!==id)throw new Error('Saved take identity mismatch');
    viewJob(job);
    return !ACTIVE_STATUS.has(job.status);
  },
  onStop:(reason,error)=>{
    const ready=state.job&&STATUS_WITH_AUDIO.has(state.job.status);
    const message=reason==='error'?userFacingError(error,isSpanish()?'es':'en','sound'):
      reason==='complete'?(ready?ux('Toma lista. Pulsa Escuchar; no suena automáticamente.',
        'Take ready. Choose Listen; playback never starts automatically.'):
        ux('La generación terminó: ','Generation ended: ')+jobLabel(state.job?.status)):
      reason==='limit'?ux('Seguimiento finalizado a los 2 minutos. Puedes comprobar el estado manualmente.',
        'Tracking ended after 2 minutes. You can check status manually.'):
      ux('Seguimiento detenido. No se ha solicitado cancelar la generación.',
        'Tracking stopped. The generation itself has not been cancelled.');
    text('sfxWatchStatus',message);
    inform(message,reason==='error'||(reason==='complete'&&!ready));
    updateControls();
    if(reason==='complete'&&ready&&state.contextTask?.cueId){
      void loadRemoteAudio().then(()=>{
        inform(ux('Toma lista. Puedes escucharla o aceptarla directamente.',
          'Take ready. Listen or accept it directly.'));
      }).catch(loadError=>{
        inform(userFacingError(loadError,isSpanish()?'es':'en','sound'),true);
      });
    }
  },
});

function requiredDom() {
  return Boolean($('generateForm') && $('waveCanvas') && $('importLibraryBtn'));
}
function inform(message,error=false) {
  const element=$('feedback');
  if(!element)return;
  element.textContent=message;
  element.classList.toggle('error',error);
}
function money(value) {
  return Number.isFinite(value) ? '$'+value.toFixed(4)+' USD' : 'unknown';
}
function costPolicy(settings=state.settings) {
  const policy=settings?.costPolicy??settings??{};
  const perRequest=Number(policy.estimatedMaxCostUsdPerRequest ?? policy.estimatedMaxUsdPerGeneration);
  const daily=Number(policy.dailyBudgetUsd ?? policy.maxDailyEstimatedCostUsd);
  return {
    perRequest:Number.isFinite(perRequest)&&perRequest>0?perRequest:null,
    daily:Number.isFinite(daily)&&daily>0?daily:null,
  };
}
function showCost(settings) {
  const element=$('costEstimate');
  const policy=costPolicy(settings);
  if(!element)return;
  if(settings?.budgetLimitsDisabled===true){
    element.classList.add('ready');
    element.textContent=ux('Sin topes locales de presupuesto. El proveedor factura el uso.', 'No local budget caps. Provider usage is billed.');return;
  }
  const ready=policy.perRequest!==null&&policy.daily!==null;
  element.classList.toggle('ready',ready);
  element.textContent=ready
    ? ux('Límite preventivo por generación: ','Estimated ceiling per generation: ')+money(policy.perRequest)+
      ux('. Límite diario: ','. Daily limit: ')+money(policy.daily)+
      ux('. No son cargos confirmados.','. These are safety ceilings, not billed amounts.')
    : ux('La generación no está configurada. Revisa la conexión y los límites en el servidor local.',
      'Generation is not configured. Check connection and spending limits in local server settings.');
}
async function request(path,{method='GET',data,signal}={}) {
  const options={method,cache:'no-store',...(signal?{signal}:{})};
  if(method==='POST'){
    options.headers={'Content-Type':'application/json'};
    options.body=JSON.stringify(data??{});
  }
  const response=await fetch(api+path,options);
  if(!response.ok){
    let code='HTTP '+response.status;
    try{code=(await response.json()).code??code;}catch{}
    throw new Error(code);
  }
  return response;
}
function busy(value){state.working=value;updateControls();}
function canUseAcceptedSource(){
  return state.fileOrigin==='remote' &&
    state.job?.status==='ACCEPTED_FOR_MANUAL_IMPORT' &&
    state.job.requestId===state.loadedRemoteRequestId &&
    state.sourceBytes instanceof ArrayBuffer;
}
function updateControls(){
  if(!requiredDom())return;
  const job=state.job;
  const activity=$('sfxActivityProgress');
  if(activity){
    activity.hidden=!(state.working||state.preparingPreview||ACTIVE_STATUS.has(job?.status));
    activity.querySelector('label').textContent=state.preparingPreview?ux('Cargando audio…','Loading audio…'):
      ACTIVE_STATUS.has(job?.status)?jobLabel(job.status):ux('Procesando sonido…','Processing sound…');
  }
  if($('sfxWatchBtn'))$('sfxWatchBtn').disabled=state.working||resultWatcher.active||
    !state.enabled||!job||!ACTIVE_STATUS.has(job.status);
  if($('sfxStopWatchBtn'))$('sfxStopWatchBtn').disabled=!resultWatcher.active;
  if($('sfxShortTakeBtn'))$('sfxShortTakeBtn').disabled=state.working;
  const remoteLoaded=Boolean(state.audio&&state.fileOrigin==='remote'&&
    state.loadedRemoteRequestId===job?.requestId);
  if($('sfxListenBtn'))$('sfxListenBtn').disabled=state.working||!job||!STATUS_WITH_AUDIO.has(job.status);
  if($('sfxStopPreviewBtn'))$('sfxStopPreviewBtn').disabled=!state.source&&!state.preparingPreview;
  text('sfxListenStatus',state.preparingPreview?ux('Preparando audio…','Preparing audio…'):
    state.source&&remoteLoaded?ux('Escuchando la toma.','Previewing this take.'):
    remoteLoaded?ux('Audio cargado. Puedes volver a escucharlo sin descargarlo.','Audio loaded. Listen again without downloading.'):
    job&&STATUS_WITH_AUDIO.has(job.status)?ux('Listo: pulsa Escuchar. No hace falta cargar el WAV primero.','Ready: choose Listen. No separate WAV loading step.'):
    job&&ACTIVE_STATUS.has(job.status)?ux('Aún no hay audio. Comprueba el estado cuando quieras; no se generan nuevas tomas.',
      'Audio is not ready. Check status when you wish; no new takes are generated.'):
    ux('Selecciona una toma lista para escuchar.','Select a ready take to listen.'));
  const policy=costPolicy();
  const costReady=state.settings?.budgetLimitsDisabled===true||(policy.perRequest!==null&&policy.daily!==null);
  const promptReady=$('soundPrompt').value.trim().length>0 && $('generateForm').checkValidity();
  const allowed=!preparationBusy&&state.enabled&&!state.working&&!resultWatcher.active&&
    !ACTIVE_STATUS.has(job?.status)&&costReady&&promptReady;
  $('generateBtn').disabled=!allowed;
  text('generateBtn',ux('Generar sonido', 'Generate sound')+(policy.perRequest!==null?' · '+money(policy.perRequest):''));
  $('generationHint').textContent=preparationBusy?ux('Lote en curso. Cancélalo antes de generar una toma individual.',
    'Batch running. Cancel it before generating an individual take.'):
    state.working?ux('Generando sonido…','Generating sound…'):
    resultWatcher.active?ux('Siguiendo la toma actual. No se enviará otra generación.',
      'Tracking the current take. No new generation will be submitted.'):
    ACTIVE_STATUS.has(job?.status)?ux('Hay una toma en curso. Puedes seguir su estado o revisarlo manualmente.',
      'A take is running. Track its readiness or check manually.'):
    !state.enabled?ux('La generación no está disponible. Puedes seguir editando audio.','Generation is unavailable. You can still edit audio.'):
    !costReady?ux('Revisa la configuración del servicio de IA.','Check the AI service settings.'):
    !promptReady?ux('Describe el sonido y elige su duración.','Describe your sound and choose its duration.'):
    ux('Listo para generar.','Ready to generate.');
  if (PROMPT_ONLY) {
    $('generateBtn').disabled = !$('soundPrompt').value.trim();
    text('generateBtn',ux('Copiar prompt','Copy prompt'));
    $('generationHint').textContent = ux('Descripción para uso externo; no se genera audio.','External-use description; no audio is generated.');
  }
  const reconnect=$('sfxReconnectBtn');
  if(reconnect) reconnect.disabled=state.working;
  const reviewButton=$('sfxCheckResultBtn');
  if(reviewButton)reviewButton.disabled=state.working||!job||
    !(ACTIVE_STATUS.has(job.status)||STATUS_WITH_AUDIO.has(job.status));
  $('openJobBtn').disabled=state.working;
  if($('sfxHistoryRefreshBtn'))$('sfxHistoryRefreshBtn').disabled=state.working;
  if($('sfxHistorySelect'))$('sfxHistorySelect').disabled=state.working||!state.historyJobs.length;
  $('refreshBtn').disabled=state.working||!state.enabled||!job||!ACTIVE_STATUS.has(job.status);
  $('cancelBtn').disabled=state.working||!state.enabled||!job||!['QUEUED','RUNNING'].includes(job.status);
  $('loadGeneratedBtn').disabled=state.working||!job||!STATUS_WITH_AUDIO.has(job.status);
  const taskCueId=state.contextTask?.cueId;
  const acceptButton=$('acceptBtn');
  if(acceptButton){
    const cueNumber=state.contextTask?.cueNumber;
    acceptButton.textContent=taskCueId
      ?job?.status==='ACCEPTED_FOR_MANUAL_IMPORT'
        ?ux(`Asignar toma aceptada al cue ${cueNumber??''}`.trim(),
          `Assign accepted take to cue ${cueNumber??''}`.trim())
        :ux(`Aceptar y asignar al cue ${cueNumber??''}`.trim(),
          `Accept and assign to cue ${cueNumber??''}`.trim())
      :ux('Aceptar sonido','Accept sound');
    acceptButton.disabled=preparationBusy||state.working||
      (taskCueId?!(job?.status==='READY_FOR_REVIEW'||job?.status==='ACCEPTED_FOR_MANUAL_IMPORT')
        :job?.status!=='READY_FOR_REVIEW');
  }
  $('rejectBtn').disabled=state.working||job?.status!=='READY_FOR_REVIEW';
  $('playBtn').disabled=!state.audio||state.working;
  $('stopBtn').disabled=!state.source;
  $('inPoint').disabled=!state.audio;
  $('outPoint').disabled=!state.audio;
  $('sfxFadeIn').disabled=!state.audio;
  $('sfxFadeOut').disabled=!state.audio;
  $('exportBtn').disabled=state.working||!canUseAcceptedSource();
  $('importLibraryBtn').disabled=preparationBusy||state.working||!canUseAcceptedSource()||typeof state.onImportReviewed!=='function';
  $('importCueBtn').disabled=$('importLibraryBtn').disabled;
  const assignGenerated=$('importAssignCueBtn');
  const exportPanel=$('exportBtn')?.closest('.sfx-export');
  if(exportPanel){
    exportPanel.hidden=Boolean(taskCueId);
    exportPanel.style.setProperty('display',taskCueId?'none':'','important');
  }
  if(assignGenerated)assignGenerated.disabled=preparationBusy||state.working||!canUseAcceptedSource()||
    typeof state.onImportReviewed!=='function'||!$('rq10TargetCue')?.value;
  const fromLibrary=state.fileOrigin==='library'&&typeof state.libraryAssetId==='string'&&!!state.audio;
  const libraryActions=$('rq10LibraryEditActions');
  const targetLabel=$('rq10TargetCue')?.closest('label');
  const targetContainer=fromLibrary?libraryActions?.querySelector('.rq10-local-buttons'):
    exportPanel?.querySelector('.sfx-buttons');
  if(targetLabel&&targetContainer&&targetLabel.parentElement!==targetContainer){
    targetContainer.insertBefore(targetLabel,fromLibrary?$('rq10AssignLibraryCue'):assignGenerated);
  }
  if(libraryActions)libraryActions.hidden=!fromLibrary;
  const create=$('rq10CreateLibraryCue');
  if(create)create.disabled=preparationBusy||state.working||!fromLibrary||typeof state.onCommitLibraryReview!=='function';
  const assign=$('rq10AssignLibraryCue');
  if(assign)assign.disabled=preparationBusy||state.working||!fromLibrary||typeof state.onCommitLibraryReview!=='function';
}
function clearReviewedAudio(){
  stopSoundLabAudition();
  state.audio=null;state.sourceBytes=null;state.fileOrigin=null;state.libraryAssetId=null;state.peaks=null;
  state.inSeconds=0;state.outSeconds=0;state.fadeInSeconds=0;state.fadeOutSeconds=0;
  text('audioName',ux('Ningún audio cargado','No audio loaded'));
  text('waveDuration','00:00.000');
  $('sfxWaveEmpty')?.removeAttribute('hidden');
  $('waveCanvas')?.classList.remove('sfx-has-audio');
  drawWave();
}
function viewJob(job){
  const changed=state.job?.requestId!==job?.requestId;
  if(changed)resultWatcher.stop('context_changed');
  if(changed)clearReviewedAudio();
  state.job=job;
  if(job){
    state.historyJobs=state.historyJobs.map(saved=>saved.requestId===job.requestId?job:saved);
    renderHistoryOptions();
  }
  if($('sfxHistoryNotice'))$('sfxHistoryNotice').hidden=!job||!state.recoveredJob;
  if(changed){
    state.loadedRemoteRequestId=null;
  }
  text('jobState',job ? jobLabel(job.status) : ux('Sin sonido generado','No sound generated yet'));
  const cost=job?.cost??{};
  const timing=job?.latencies??job?.timing??job?.timings??{};
  const detail=job ? [
    `${job.requestId} · ${job.kind} · ${job.sourceLineId??'no script reference'} · requested ${job.durationSeconds}s`,
    `model ${job.modelCandidate??job.model??'unknown'}${job.modelRevision?' @ '+job.modelRevision.slice(0,12):''} · seed ${job.seed}`,
    `reserved maximum ${money(Number(cost.estimatedMaxCostUsd??cost.estimatedMaxUsd??job.estimatedMaxCostUsd))} · actual billing ${cost.actualBilledUsd==null?'unknown':money(Number(cost.actualBilledUsd))}`,
    timing.generationMs?`generation ${timing.generationMs} ms · cold start ${timing.coldStartMs??'unknown'} ms`:null,
    job.prompt,
  ].filter(Boolean).join('\n') : 'No remote call is made when a saved record is opened.';
  text('jobTechnicalDetails',detail);
  text('jobDetails',job ? ux('Toma ','Take ')+job.durationSeconds+'s · '+jobLabel(job.status)+(job.sourceLineId?' · '+job.sourceLineId:'') : ux('Describe un sonido para comenzar.','Describe a sound to get started.'));
  if(job){
    $('requestId').value=job.requestId;
    try{localStorage.setItem('runq-sfx-last-id-v1',job.requestId);}catch{}
  }
  updateControls();
}
function formatTime(seconds){
  if(!Number.isFinite(seconds))return '--:--.---';
  const whole=Math.floor(seconds);
  return String(Math.floor(whole/60)).padStart(2,'0')+':'+String(whole%60).padStart(2,'0')+'.'+String(Math.floor((seconds-whole)*1000)).padStart(3,'0');
}
export function stopSoundLabAudition(){
  resultWatcher.stop('cancelled');
  // Invalidates a pending AudioContext.resume() before it can start sound.
  state.previewEpoch++;
  const source=state.source;
  state.source=null;
  if(source){source.onended=null;try{source.stop();}catch{}try{source.disconnect();}catch{}}
  if(state.gain){try{state.gain.disconnect();}catch{}state.gain=null;}
  if(state.monitorGain){try{state.monitorGain.disconnect();}catch{}state.monitorGain=null;}
  if(state.previewReserved){
    state.previewReserved=false;
    try{state.onPreviewReleased?.();}catch{}
  }
  updateControls();
}
function drawWave(){
  const canvas=$('waveCanvas');
  if(!canvas)return;
  const width=Math.max(1,canvas.getBoundingClientRect().width||900);
  const height=Math.max(1,canvas.getBoundingClientRect().height||245);
  const ratio=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  const context=canvas.getContext('2d');if(!context)return;
  context.scale(ratio,ratio);context.clearRect(0,0,width,height);
  const middle=height/2;
  context.strokeStyle='#36414e';context.lineWidth=1;
  context.beginPath();context.moveTo(0,middle);context.lineTo(width,middle);context.stroke();
  for(let part=1;part<5;part++){
    const x=Math.round(width*part/5)+.5;
    context.beginPath();context.moveTo(x,0);context.lineTo(x,height);context.stroke();
  }
  if(!state.peaks||!state.audio)return;
  const duration=state.audio.duration;
  const x1=width*state.inSeconds/duration,x2=width*state.outSeconds/duration;
  context.fillStyle='rgba(217,248,119,.09)';context.fillRect(x1,0,x2-x1,height);
  for(let index=0;index<state.peaks.length;index++){
    const x=index*width/state.peaks.length;
    const amplitude=Math.max(.5,state.peaks[index]*middle*.91);
    context.fillStyle=x>=x1&&x<=x2?'#d9f877':'#658497';
    context.fillRect(x,middle-amplitude,Math.max(1,width/state.peaks.length),amplitude*2);
  }
  const fadeStart=x1+width*state.fadeInSeconds/duration;
  const fadeEnd=x2-width*state.fadeOutSeconds/duration;
  context.strokeStyle='#8ad4f7';context.lineWidth=3;
  context.beginPath();context.moveTo(x1,height);context.lineTo(fadeStart,0);
  context.moveTo(fadeEnd,0);context.lineTo(x2,height);context.stroke();
  for(const x of [x1,x2,fadeStart,fadeEnd]){
    context.strokeStyle='#efffba';context.lineWidth=2;
    context.beginPath();context.moveTo(x,0);context.lineTo(x,height);context.stroke();
  }
  context.fillStyle='#d5e2bb';context.font='12px ui-monospace,monospace';
  context.fillText(formatTime(state.inSeconds),Math.min(width-85,x1+5),16);
  context.fillText(formatTime(state.outSeconds),Math.max(5,Math.min(width-85,x2-85)),height-10);
}
function updateFades(fadeIn,fadeOut){
 if(!state.audio)return;
 const duration=state.outSeconds-state.inSeconds;
 const max=Math.min(10,duration);
 const first=Math.max(0,Math.min(max,Number(fadeIn)||0));
 const last=Math.max(0,Math.min(max-first,Number(fadeOut)||0));
 state.fadeInSeconds=first;state.fadeOutSeconds=last;
 $('sfxFadeIn').max=String(max);$('sfxFadeOut').max=String(max);
 $('sfxFadeIn').value=String(first);$('sfxFadeOut').value=String(last);
 const spanish=$('uiLocaleSelect')?.value==='es';
 text('sfxFadeInLabel',(spanish?'Entrada gradual':'Fade in')+' · '+first.toFixed(2)+' s');
 text('sfxFadeOutLabel',(spanish?'Salida gradual':'Fade out')+' · '+last.toFixed(2)+' s');
 rememberPreparedRegion();
 drawWave();
}
function updateSfxEditorLocale(){
 const es=$('uiLocaleSelect')?.value==='es';
 // Product labels are translated without replacing their input/select children.
 for(const element of document.querySelectorAll('[data-sfx-en][data-sfx-es]')){
   element.textContent=es?element.dataset.sfxEs:element.dataset.sfxEn;
 }
 showCost(state.settings);
 text('sfxDragLabel',es?'Acción al arrastrar':'Waveform gesture');
 const modes=$('sfxDragMode').options;
 modes[0].textContent=es?'Seleccionar IN/OUT':'Select IN/OUT';
 modes[1].textContent=es?'Mover fundido de entrada':'Move fade-in edge';
 modes[2].textContent=es?'Mover fundido de salida':'Move fade-out edge';
 text('importCueBtn',es?'Importar y crear cue':'Import + create cue');
 text('importAssignCueBtn',es?'Guardar y asignar al cue':'Save + assign to cue');
 renderHistoryOptions();
 updateFades(state.fadeInSeconds,state.fadeOutSeconds);
}
function renderHistoryOptions(){
 const select=$('sfxHistorySelect');
 if(!select)return;
 const selected=select.value;
 const placeholder=document.createElement('option');
 placeholder.value='';placeholder.textContent=ux('Elige una toma guardada','Choose a saved take');
 select.replaceChildren(placeholder);
 for(const job of state.historyJobs){
  const option=document.createElement('option');
  option.value=job.requestId;
  option.textContent=job.createdAt.slice(0,16).replace('T',' ')+' · '+job.kind+' · '+
   job.durationSeconds+'s · '+jobLabel(job.status);
  select.append(option);
 }
 select.value=state.historyJobs.some(job=>job.requestId===selected)?selected:'';
}
function updateTrim(inSeconds,outSeconds){
  if(!state.audio)return;
  try{
    const bounds=trimBounds(inSeconds,outSeconds,state.audio.duration);
    state.inSeconds=bounds.inSeconds;state.outSeconds=bounds.outSeconds;
    $('inPoint').value=String(Number(bounds.inSeconds.toFixed(3)));
    $('outPoint').value=String(Number(bounds.outSeconds.toFixed(3)));
    updateFades(state.fadeInSeconds,state.fadeOutSeconds);
    inform(ux('Región seleccionada: ','Selected region: ')+formatTime(state.inSeconds)+' → '+formatTime(state.outSeconds)+ux('. El original no cambia.','. The original is unchanged.'));
  }catch{inform('Select at least 10 ms of sound.',true);}
}
async function ensureContext(){
  if(!state.context)state.context=new (window.AudioContext||window.webkitAudioContext)();
  if(state.context.state==='suspended')await state.context.resume();
  return state.context;
}
async function loadAudio(bytes,name,origin='local',libraryAssetId=null){
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<1||bytes.byteLength>20_000_000)
    throw new Error('Audio must be 1–20 MB and decodable by Chromium.');
  stopSoundLabAudition();
  const epoch=state.previewEpoch;
  const context=await ensureContext();
  const decoded=await context.decodeAudioData(bytes.slice(0));
  if(epoch!==state.previewEpoch)throw new Error('Preescucha cancelada.');
  if(![1,2].includes(decoded.numberOfChannels)||decoded.duration<=0||decoded.duration>600)throw new Error('Unsupported audio layout or duration');
  state.audio=decoded;state.sourceBytes=bytes.slice(0);state.fileOrigin=origin;
  state.libraryAssetId=origin==='library'?libraryAssetId:null;
  $('sfxWaveEmpty')?.setAttribute('hidden','');
  $('waveCanvas')?.classList.add('sfx-has-audio');
  state.loadedRemoteRequestId=origin==='remote'?state.job?.requestId:null;
  state.inSeconds=0;state.outSeconds=decoded.duration;state.fadeInSeconds=0;state.fadeOutSeconds=0;
  state.peaks=waveformPeaks(Array.from({length:decoded.numberOfChannels},(_,channel)=>decoded.getChannelData(channel)),600);
  text('audioName',`${name} · ${decoded.numberOfChannels} ch · ${decoded.sampleRate} Hz`);
  text('waveDuration',formatTime(decoded.duration));
  $('inPoint').max=String(decoded.duration);$('outPoint').max=String(decoded.duration);
  updateTrim(0,decoded.duration);updateControls();
  return epoch;
}
async function loadRemoteAudio(){
  const job=state.job;
  if(!job||!STATUS_WITH_AUDIO.has(job.status))throw new Error('Generated WAV is not ready');
  if(state.audio&&state.fileOrigin==='remote'&&state.loadedRemoteRequestId===job.requestId)return state.previewEpoch;
  const epoch=state.previewEpoch;
  const result=await request('/jobs/'+encodeURIComponent(job.requestId)+'/audio');
  const bytes=await result.arrayBuffer();
  if(epoch!==state.previewEpoch||state.job?.requestId!==job.requestId)
    throw new Error('Preescucha cancelada.');
  return loadAudio(bytes,ux('Generado','Generated')+' · '+job.requestId+'.wav','remote');
}
/** Open an already registered original from the persistent left library.
 * Playback is NOT triggered and the original remains unchanged.
 */
export async function openLibraryAudioSource(file,assetId){
  if(!file||typeof file.arrayBuffer!=='function'||typeof assetId!=='string')
    throw new TypeError('Choose a registered original sound');
  if(file.size<=0||file.size>20_000_000)
    throw new RangeError('Source audio must be at most 20 MB');
  await loadAudio(await file.arrayBuffer(),file.name,'library',assetId);
  inform(ux('Audio seleccionado. Ajusta el recorte y los fundidos sin alterar el original.','Audio selected. Adjust the trim and fades without changing the original.'));
}
function currentJobId(){
  const id=$('requestId').value.trim();
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(id))throw new Error('Enter a valid request ID');
  return id;
}
async function action(operation){
  if(state.working)return;
  busy(true);
  try{await operation();}catch(error){inform(userFacingError(error,isSpanish()?'es':'en','sound'),true);}
  finally{busy(false);}
}
function applyPreset(){
  const preset=SFX_ACCEPTANCE_CASES[$('acceptancePreset').value];
  if(!preset){inform('Choose one of the three prepared acceptance cases.',true);return;}
  $('soundKind').value=preset.kind;$('soundPrompt').value=preset.prompt;
  $('duration').value=String(preset.durationSeconds);$('seed').value=String(preset.seed);
  updateControls();
  inform(ux('Ejemplo cargado. Puedes editar la descripción antes de generar.','Example loaded. You can edit the description before generating.'));
}
const scriptProposalState={proposals:[],selected:0};
function showScriptProposal(){
  const p=scriptProposalState.proposals[scriptProposalState.selected];
  if(!p)return;
  $('scriptSfxSource').value=p.soundSource??'';
  $('scriptSfxAction').value=p.action??'';
  $('scriptSfxMaterial').value=p.material??'';
  $('scriptSfxSpace').value=p.acousticSpace?.id??'UNSPECIFIED';
  $('scriptSfxIntensity').value=p.intensity??'';
  $('scriptSfxDuration').value=String(p.suggestedDurationSeconds??8);
  $('scriptSfxPrompt').value=p.prompt;
  const evidence=[...(p.explicitElements??[]),...(p.inferences??[]).map(x=>'Inferencia: '+x),...(p.uncertainties??[]).map(x=>'Sin determinar: '+x)];
  $('scriptSfxEvidence').textContent=evidence.join(' · ')||'Revisión necesaria';
}
function bindScriptCompiler(){
  if(!$('scriptSfxCompile'))return;
  document.addEventListener('runq:sound-context-open',event=>{
    const taskContext=event.detail?.taskContext;
    if(!taskContext)return;
    const previousCueId=state.contextTask?.cueId;
    state.contextTask=structuredClone(taskContext);
    if(previousCueId!==taskContext.cueId&&state.job){
      state.recoveredJob=false;
      viewJob(null);
    }
    if(taskContext.cueId){
      const draft=prepareCueSoundDraft({
        cue:{
          id:taskContext.cueId,
          number:taskContext.cueNumber,
          label:taskContext.cueLabel??taskContext.title,
          sourceLineIds:taskContext.lineIds,
          actions:[{type:'PLAN_AUDIO',prompt:taskContext.brief||taskContext.cueLabel||taskContext.title}],
        },
        sourceLines:taskContext.sourceLines??[],
      });
      $('soundPrompt').value=draft.prompt;
      $('soundKind').value=draft.kind;
      $('duration').value=String(draft.durationSeconds);
      $('sourceLine').value=draft.sourceLineId??'';
      $('scriptSfxLine').value=draft.sourceLineId??'';
      const promptStatus=draft.requiresTranslation
        ?ux('la acotación necesita traducción al inglés antes de generar',
          'the script direction needs an English rewrite before generation')
        :ux('prompt preparado en inglés','English prompt prepared');
      text('sfxCueContext',ux(
        `Sonido para cue ${taskContext.cueNumber??''}${draft.sourceLineId?' · '+draft.sourceLineId:''} · ${promptStatus} · duración estimada: ${draft.durationSeconds} s.`,
        `Sound for cue ${taskContext.cueNumber??''}${draft.sourceLineId?' · '+draft.sourceLineId:''} · ${promptStatus} · estimated duration: ${draft.durationSeconds} s.`,
      ));
      $('sfxCueContext').hidden=false;
      $('rq10TargetCue').value=taskContext.cueId;
    }else{
      $('soundPrompt').value=taskContext.brief??'';
      $('sfxCueContext').hidden=true;
    }
    if(taskContext.sourceText){
      $('scriptSfxFragment').value=taskContext.sourceText.slice(0,800);
    }
    $('sfxAdvanced').open=false;
    $('sfxScriptDetails').open=false;
    $('soundPrompt').dispatchEvent(new Event('input',{bubbles:true}));
    updateControls();
    inform(ux(
      `Contexto fijado: ${taskContext.title}. Revisa el prompt y copia o importa un sonido.`,
      `Pinned context: ${taskContext.title}. Review the prompt, then copy or import audio.`,
    ));
  });
  $('scriptSfxCompile').addEventListener('click',()=>{
    try{
      const fragment=$('scriptSfxFragment').value.trim();
      const sourceLineId=$('scriptSfxLine').value.trim();
      const mode=$('scriptSfxMode').value;
      const proposals=compileSoundProposals({fragment,sourceLineId,projectId:'sound-lab-local',fragmentKind:'STAGE_DIRECTION',mode});
      scriptProposalState.proposals=proposals;
      scriptProposalState.selected=0;
      const select=$('scriptSfxSelect');select.replaceChildren();
      proposals.forEach((p,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=(i+1)+'. '+p.soundSource+' · '+(p.action??'acción por concretar');select.append(option);});
      $('scriptSfxResults').hidden=proposals.length===0;
      $('scriptSfxStatus').textContent=proposals.length?ux(proposals.length+' propuesta(s) preparadas',proposals.length+' suggestion(s) ready'):ux('No se han encontrado sonidos explícitos','No explicit sounds found');
      if(proposals.length)showScriptProposal();
    }catch(error){$('scriptSfxResults').hidden=true;$('scriptSfxStatus').textContent=ux('Revisa la acotación y vuelve a intentarlo.','Review the script direction and try again.');}
  });
  $('scriptSfxSelect').addEventListener('change',()=>{scriptProposalState.selected=Number($('scriptSfxSelect').value);showScriptProposal();});
  $('scriptSfxMode').addEventListener('change',()=>{
    if(!scriptProposalState.proposals.length)return;
    try{
      scriptProposalState.proposals=scriptProposalState.proposals.map(p=>recompileProposal(p,{mode:$('scriptSfxMode').value}));
      showScriptProposal();
    }catch(error){$('scriptSfxStatus').textContent=ux('Revisa los datos de la propuesta.','Review the suggestion fields.');}
  });
  for(const [id,key] of [['scriptSfxSource','soundSource'],['scriptSfxAction','action'],['scriptSfxMaterial','material'],['scriptSfxSpace','acousticSpace'],['scriptSfxIntensity','intensity'],['scriptSfxDuration','suggestedDurationSeconds']]){
    $(id).addEventListener('change',()=>{
      const index=scriptProposalState.selected,p=scriptProposalState.proposals[index];if(!p)return;
      try{const value=key==='suggestedDurationSeconds'?Number($(id).value):key==='intensity'?($(id).value||null):$(id).value;
        scriptProposalState.proposals[index]=applyProposalEdits(p,{[key]:value});
        showScriptProposal();}catch(error){$('scriptSfxStatus').textContent=ux('No se pudieron aplicar esos cambios.','Those changes could not be applied.');}
    });
  }
  $('scriptSfxPrompt').addEventListener('input',()=>{
    const p=scriptProposalState.proposals[scriptProposalState.selected];if(!p)return;
    try{scriptProposalState.proposals[scriptProposalState.selected]=applyProposalEdits(p,{prompt:$('scriptSfxPrompt').value});}
    catch{/* Editable draft may be temporarily empty; transfer checks final state. */}
  });
  $('scriptSfxRestore').addEventListener('click',()=>{
    const i=scriptProposalState.selected,p=scriptProposalState.proposals[i];if(!p)return;
    scriptProposalState.proposals[i]=recompileProposal(p,{mode:$('scriptSfxMode').value});showScriptProposal();
    $('scriptSfxStatus').textContent=ux('Propuesta restaurada','Suggestion restored');
  });
  $('scriptSfxTransfer').addEventListener('click',()=>{
    const p=scriptProposalState.proposals[scriptProposalState.selected];if(!p)return;
    if(p.category==='MUSIC'){$('scriptSfxStatus').textContent=ux('La música requiere un proveedor compatible.','Music requires a compatible AI provider.');return;}
    const finalPrompt=$('scriptSfxPrompt').value.trim();
    if(!finalPrompt||finalPrompt.length>1000){$('scriptSfxStatus').textContent=ux('Describe el sonido en un máximo de 1000 caracteres.','Describe the sound in up to 1000 characters.');return;}
    $('soundKind').value=p.category==='ENVIRONMENT'?'ENVIRONMENT':'SFX';
    $('sourceLine').value=p.scriptReference??'';
    $('soundPrompt').value=finalPrompt;
    $('duration').value=String(p.suggestedDurationSeconds??8);
    updateControls();
    $('scriptSfxStatus').textContent=ux('Prompt preparado. Puedes revisarlo y copiarlo.','Prompt ready. Review and copy it.');
    $('sfxScriptDetails').open=false;
    $('soundPrompt').focus();
  });
}
async function previewSelection({inline=false}={}){
  if(!state.audio)throw new Error('Generated WAV is not ready');
  stopSoundLabAudition();
  // Reserve the shared preview lease before awaiting device unlock.
  if(typeof state.onReservePreview!=='function'||state.onReservePreview({inline})!==true)
    throw new Error('Detén los cues activos o la preescucha antes de escuchar un sonido.');
  state.previewReserved=true;
  const epoch=state.previewEpoch;
  try{
    const context=await ensureContext();
    if(epoch!==state.previewEpoch||!state.previewReserved)
      throw new Error('Preescucha cancelada por PARAR TODO.');
    const source=context.createBufferSource(),gain=context.createGain(),monitorGain=context.createGain();
    source.buffer=state.audio;
    const level=Number($('monitorLevel').value)/100;
    const now=context.currentTime,length=state.outSeconds-state.inSeconds;
    gain.gain.cancelScheduledValues(now);
    monitorGain.gain.setValueAtTime(level,now);
    gain.gain.setValueAtTime(state.fadeInSeconds>0?0:1,now);
    if(state.fadeInSeconds>0)gain.gain.linearRampToValueAtTime(1,now+state.fadeInSeconds);
    if(state.fadeOutSeconds>0){
      gain.gain.setValueAtTime(1,now+length-state.fadeOutSeconds);
      gain.gain.linearRampToValueAtTime(0,now+length);
    }
    source.connect(gain);gain.connect(monitorGain);monitorGain.connect(context.destination);
    state.source=source;state.gain=gain;state.monitorGain=monitorGain;
    source.onended=()=>{
      if(state.source===source){
        state.source=null;
        try{gain.disconnect();}catch{}
        try{monitorGain.disconnect();}catch{}
        state.monitorGain=null;state.gain=null;
        if(state.previewReserved){
          state.previewReserved=false;
          try{state.onPreviewReleased?.();}catch{}
        }
        updateControls();
      }
    };
    source.start(0,state.inSeconds,length);
    if(state.fileOrigin==='remote'&&state.contextTask?.cueId){
      rememberPreparedRegion();
      const review=preparedReviews.get(state.loadedRemoteRequestId);
      document.dispatchEvent(new CustomEvent('runq:sfx-auditioned',{detail:structuredClone(review)}));
    }
    updateControls();inform(ux('Escuchando la selección por la salida de audio predeterminada.','Previewing through the default audio output.'));
  }catch(error){stopSoundLabAudition();throw error;}
}
function bindEvents(){
  document.addEventListener('runq:preparation-busy', event => {
    preparationBusy = event.detail?.busy === true;
    updateControls();
  });
  $('rq10TargetCue')?.addEventListener('change',updateControls);
  $('sfxShortTakeBtn')?.addEventListener('click',()=>{
    $('duration').value='3';
    updateControls();
    inform(ux('Duración preparada: 3 segundos. Pulsa Generar sonido para empezar. No se ha enviado nada.',
      'Duration set to 3 seconds. Choose Generate sound to start. Nothing was submitted.'));
  });
  $('sfxWatchBtn')?.addEventListener('click',()=>{
    if(state.working||!state.enabled||!state.job||!ACTIVE_STATUS.has(state.job.status))return;
    text('sfxWatchStatus',ux('Comprobando cada 5 segundos durante un máximo de 2 minutos…',
      'Checking every 5 seconds for up to 2 minutes…'));
    resultWatcher.start();updateControls();
  });
  $('sfxStopWatchBtn')?.addEventListener('click',()=>resultWatcher.stop());
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)resultWatcher.stop('hidden');
  });
  $('sfxHistoryRefreshBtn')?.addEventListener('click',()=>void action(async()=>{
    const result=await(await request('/jobs')).json();
    if(!result||!Array.isArray(result.jobs)||result.jobs.length>50||
      result.jobs.some(job=>!job||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(job.requestId??'')||
        typeof job.createdAt!=='string'||!Object.hasOwn(STATUS_LABEL_EN,job.status)||
        !['SFX','ENVIRONMENT'].includes(job.kind)||!Number.isFinite(job.durationSeconds))||
      new Set(result.jobs.map(job=>job.requestId)).size!==result.jobs.length)
      throw new Error('Invalid saved sound history');
    state.historyJobs=result.jobs;
    renderHistoryOptions();
    text('sfxHistoryStatus',result.jobs.length
      ?ux(result.jobs.length+' toma(s) locales. Escuchar antes de aceptar es opcional.',
        result.jobs.length+' local take(s). Listening before acceptance is optional.')
      :ux('No hay tomas guardadas en este historial local.','No saved takes in this local history.'));
  }));
  $('sfxHistorySelect')?.addEventListener('change',()=>void action(async()=>{
    const requestId=$('sfxHistorySelect').value;
    if(!requestId)return;
    if(!state.historyJobs.some(job=>job.requestId===requestId))
      throw new Error('Saved take is not in the loaded history');
    const job=await(await request('/jobs/'+encodeURIComponent(requestId))).json();
    if(job.requestId!==requestId)throw new Error('Saved take identity mismatch');
    state.recoveredJob=true;
    viewJob(job);
    inform(ux('Registro anterior abierto. Comprueba el WAV antes de aceptar.',
      'Earlier record opened. Check the WAV before accepting.'));
  }));
  $('generateForm').addEventListener('submit',event=>{
    event.preventDefault();
    if (PROMPT_ONLY) {
      const prompt = $('soundPrompt').value.trim();
      if (!prompt) { inform(ux('Escribe o prepara un prompt.','Enter or prepare a prompt.'),true); return; }
      const writeClipboard = navigator.clipboard?.writeText?.bind(navigator.clipboard);
      if (!writeClipboard) {
        $('soundPrompt').focus(); $('soundPrompt').select();
        inform(ux('Selecciona y copia el prompt manualmente.','Select and copy the prompt manually.'));
        return;
      }
      void writeClipboard(prompt).then(()=>{
        inform(ux('Prompt copiado. Importa después el archivo de sonido.','Prompt copied. Import the audio file afterwards.'));
      }).catch(()=>{
        $('soundPrompt').focus(); $('soundPrompt').select();
        inform(ux('Selecciona y copia el prompt manualmente.','Select and copy the prompt manually.'));
      });
      return;
    }
    void action(async()=>{
      const policy=costPolicy();
      if(preparationBusy||resultWatcher.active||ACTIVE_STATUS.has(state.job?.status))throw new Error('SFX_ACTIVE_LIMIT');
      if(!state.enabled||(state.settings?.budgetLimitsDisabled!==true&&(policy.perRequest===null||policy.daily===null)))throw new Error('SFX_NOT_CONFIGURED');
      const source=$('sourceLine').value.trim();
      const requestData={
        requestId:'req-'+crypto.randomUUID(),authorizationId:'auth-'+crypto.randomUUID(),confirmed:true,
        sourceLineId:source||null,kind:$('soundKind').value,prompt:$('soundPrompt').value.trim(),
        durationSeconds:Number($('duration').value),seed:Number($('seed').value),
        acknowledgedMaxCostUsd:policy.perRequest,
      };
      // Clicking Generate authorizes this request at the displayed cost cap.
      // The server journals submissions and prevents duplicates; never retry.
      const response=await request('/jobs',{method:'POST',data:requestData});
      const job=await response.json();
      state.recoveredJob=false;
      viewJob(job);
      if(state.contextTask?.cueId&&ACTIVE_STATUS.has(job.status)){
        text('sfxWatchStatus',ux('Generación enviada. RUNQ comprobará cuándo está lista; no iniciará la reproducción.',
          'Generation submitted. RUNQ will check when it is ready; playback will not start automatically.'));
        resultWatcher.start();
      }else if(state.contextTask?.cueId&&STATUS_WITH_AUDIO.has(job.status)){
        await loadRemoteAudio();
        inform(ux('Toma lista. Puedes escucharla o aceptarla directamente.',
          'Take ready. Listen or accept it directly.'));
      }else{
        inform(ux('Solicitud enviada. Puedes seguir trabajando. Cuando esté lista, pulsa Escuchar junto a la toma.',
          'Request submitted. Keep working. When ready, choose Listen beside the take.'));
      }
    });
  });
  $('rqPromptImportCue')?.addEventListener('click',()=>{
    const cueId=state.contextTask?.cueId??$('rq10TargetCue')?.value??null;
    document.dispatchEvent(new CustomEvent('runq:prompt-import-cue',{detail:{cueId}}));
  });
  $('rqPromptOpenLibrary')?.addEventListener('click',()=>{
    document.dispatchEvent(new CustomEvent('runq:sound-mode',{detail:{mode:'library'}}));
    inform(ux('Elige un archivo de la biblioteca y asígnalo al cue en el editor.','Choose a library file and assign it to the cue in the editor.'));
  });
  $('uiLocaleSelect')?.addEventListener('change',()=>{
    updateSfxEditorLocale();
    if(state.job)viewJob(state.job);
    updateControls();
  });
  $('sfxReconnectBtn')?.addEventListener('click',()=>void checkConnection());
  for(const id of ['soundPrompt','duration','seed','soundKind','sourceLine']){
    $(id).addEventListener('input',updateControls);
    $(id).addEventListener('change',updateControls);
  }
  $('loadPresetBtn').addEventListener('click',applyPreset);
  // One explicit check combines the two safe steps users previously had to
  // discover: refresh the remote status ONCE, then download WAV if ready.
  // It never triggers a new generation, never retries an uncertain submission
  // and never starts audio through the speakers automatically.
  $('sfxCheckResultBtn')?.addEventListener('click',()=>void action(async()=>{
    resultWatcher.stop('manual_check');
    if(!state.job)throw new Error('Todavía no hay una toma para revisar');
    let job=state.job;
    if(ACTIVE_STATUS.has(job.status)){
      const result=await request('/jobs/'+encodeURIComponent(job.requestId)+'/refresh',{method:'POST',data:{}});
      job=await result.json();
      viewJob(job);
    }
    if(STATUS_WITH_AUDIO.has(job.status)){
      await loadRemoteAudio();
      inform(ux('Sonido cargado. Escúchalo antes de aceptarlo.','Sound ready. Preview it before accepting.'));
    }else{
      inform(ux('Estado: ','Status: ')+jobLabel(job.status)+ux('. Puedes comprobarlo de nuevo.','. Check again when ready.'));
    }
  }));
  $('openJobBtn').addEventListener('click',()=>void action(async()=>{
    const job=await(await request('/jobs/'+encodeURIComponent(currentJobId()))).json();
    state.recoveredJob=true;
    viewJob(job);
    inform(ux('Resultado anterior cargado.','Previous result loaded.'));
  }));
  $('refreshBtn').addEventListener('click',()=>void action(async()=>{
    const response=await request('/jobs/'+encodeURIComponent(currentJobId())+'/refresh',{method:'POST',data:{}});
    viewJob(await response.json());inform(ux('Estado de la generación actualizado.','Generation status updated.'));
  }));
  $('cancelBtn').addEventListener('click',()=>void action(async()=>{
    resultWatcher.stop('cancelled');
    if(!confirm('Request cancellation? Charges may already have occurred and cancellation is not guaranteed.'))return;
    const response=await request('/jobs/'+encodeURIComponent(currentJobId())+'/cancel',{method:'POST',data:{}});
    viewJob(await response.json());inform(ux('Cancelación solicitada. Comprueba el estado final.','Cancellation requested. Check the final status.'));
  }));
  $('loadGeneratedBtn').addEventListener('click',()=>void action(async()=>{
    if(!state.job||!STATUS_WITH_AUDIO.has(state.job.status))throw new Error('Generated WAV is not ready');
    const result=await request('/jobs/'+encodeURIComponent(state.job.requestId)+'/audio');
    await loadAudio(await result.arrayBuffer(),'Generated · '+state.job.requestId+'.wav','remote');
    inform(ux('Audio generado cargado. Puedes escucharlo o aceptarlo directamente.','Generated audio loaded. Listen or accept it directly.'));
  }));
  $('acceptBtn').addEventListener('click',()=>void action(async()=>{
    const taskContext=state.contextTask?.cueId?structuredClone(state.contextTask):null;
    if(!state.job||!STATUS_WITH_AUDIO.has(state.job.status))throw new Error('SFX_NOT_REVIEWABLE');
    await loadRemoteAudio();
    if(taskContext&&(
      state.loadedRemoteRequestId!==state.job.requestId||state.fileOrigin!=='remote'||
      !(state.sourceBytes instanceof ArrayBuffer)||typeof state.onImportReviewed!=='function'
    ))throw new Error('Generated take is not loaded for assignment');
    if(taskContext&&$('rq10TargetCue').value!==taskContext.cueId)
      throw new Error('Selected cue differs from the pinned sound destination');
    let acceptedJob=state.job;
    if(state.job.status==='READY_FOR_REVIEW'){
      const response=await request('/jobs/'+encodeURIComponent(state.job.requestId)+'/review',{method:'POST',data:{decision:'ACCEPT'}});
      acceptedJob=await response.json();
      viewJob(acceptedJob);
    }
    if(taskContext){
      if(acceptedJob.status!=='ACCEPTED_FOR_MANUAL_IMPORT')
        throw new Error('Generated take was not accepted for manual import');
      const result=await state.onImportReviewed({
        job:structuredClone(acceptedJob),
        audioBytes:new Uint8Array(state.sourceBytes.slice(0)),
        reviewedRegion:Object.freeze({inSeconds:state.inSeconds,outSeconds:state.outSeconds,fadeInSeconds:state.fadeInSeconds,fadeOutSeconds:state.fadeOutSeconds}),
        targetCueId:taskContext.cueId,
        taskContext,
      });
      inform(result?.message??'Accepted sound assigned to its cue. GO and NEXT were not changed.');
      return;
    }
    inform(ux('Sonido aceptado. Puedes añadirlo a la biblioteca o crear un cue.','Sound accepted. Add it to the library or create a cue.'));
  }));
  $('rejectBtn').addEventListener('click',()=>void action(async()=>{
    if(!state.job||state.job.status!=='READY_FOR_REVIEW')throw new Error('Take is not available for review');
    if(!confirm('Reject this generated take? It will not be importable.'))return;
    const response=await request('/jobs/'+encodeURIComponent(state.job.requestId)+'/review',{method:'POST',data:{decision:'REJECT'}});
    viewJob(await response.json());inform(ux('Sonido descartado. No se ha creado ningún cue.','Sound discarded. No cue was created.'));
  }));
  $('demoAudioBtn').addEventListener('click',()=>void action(async()=>{
    const bytes=makeOfflineImpactDemoWav();await loadAudio(bytes.buffer,'Offline synthesized impact · NOT AI','local');
    inform(ux('Ejemplo de audio local cargado. No ha sido generado por IA.','Local audio example loaded. This is not AI-generated.'));
  }));
  $('localWav').addEventListener('change',()=>void action(async()=>{
    const file=$('localWav').files?.[0];if(!file)return;
    if(file.size>8_000_000)throw new Error('File is larger than 8 MB');
    await loadAudio(await file.arrayBuffer(),file.name,'local');
    inform(ux('Archivo local cargado. No se ha enviado a ningún proveedor de IA.','Local audio loaded. It was not sent to an AI provider.'));
  }));
  $('playBtn').addEventListener('click',()=>void action(previewSelection));
  $('sfxListenBtn')?.addEventListener('click',()=>void action(async()=>{
    state.preparingPreview=true;updateControls();
    try{
      const epoch=await loadRemoteAudio();
      if(epoch!==state.previewEpoch)throw new Error('Preescucha cancelada.');
      await previewSelection();
    }finally{state.preparingPreview=false;updateControls();}
  }));
  $('sfxStopPreviewBtn')?.addEventListener('click',()=>{
    stopSoundLabAudition();inform(ux('Escucha detenida.','Preview stopped.'));
  });
  for(const id of ['monitorLevel','sfxPreviewLevel'])$(id)?.addEventListener('input',()=>{
    const value=$(id).value;
    $('monitorLevel').value=value;
    if($('sfxPreviewLevel'))$('sfxPreviewLevel').value=value;
    if(state.monitorGain)state.monitorGain.gain.setTargetAtTime(Number(value)/100,state.context.currentTime,0.01);
  });
  $('stopBtn').addEventListener('click',()=>{stopSoundLabAudition();inform(ux('Escucha detenida.','Preview stopped.'));});
  for(const id of ['inPoint','outPoint'])$(id).addEventListener('change',()=>{
    if(state.audio)updateTrim(Number($('inPoint').value),Number($('outPoint').value));
  });
  for(const id of ['sfxFadeIn','sfxFadeOut'])$(id).addEventListener('input',()=>{
    updateFades(Number($('sfxFadeIn').value),Number($('sfxFadeOut').value));
  });
  $('uiLocaleSelect')?.addEventListener('change',updateSfxEditorLocale);
  const canvas=$('waveCanvas');
  canvas.addEventListener('pointerdown',event=>{
    if(!state.audio)return;const rectangle=canvas.getBoundingClientRect();
    state.dragStart=Math.max(0,Math.min(1,(event.clientX-rectangle.left)/rectangle.width));
    try{canvas.setPointerCapture(event.pointerId);}catch{}
  });
  canvas.addEventListener('pointerup',event=>{
    if(!state.audio||state.dragStart===null)return;const rectangle=canvas.getBoundingClientRect();
    const end=Math.max(0,Math.min(1,(event.clientX-rectangle.left)/rectangle.width));
    const start=state.dragStart;state.dragStart=null;
    const mode=$('sfxDragMode').value;
    if(mode==='fadeIn')updateFades(Math.max(0,end*state.audio.duration-state.inSeconds),state.fadeOutSeconds);
    else if(mode==='fadeOut')updateFades(state.fadeInSeconds,Math.max(0,state.outSeconds-end*state.audio.duration));
    else updateTrim(Math.min(start,end)*state.audio.duration,Math.max(start,end)*state.audio.duration);
  });
  $('exportBtn').addEventListener('click',()=>void action(async()=>{
    if(!canUseAcceptedSource())throw new Error('Only an accepted verified generated source can be downloaded');
    const url=URL.createObjectURL(new Blob([state.sourceBytes],{type:'audio/wav'}));
    try{const anchor=document.createElement('a');anchor.href=url;anchor.download='runq-sfx-'+state.job.requestId+'.wav';anchor.click();}
    finally{setTimeout(()=>URL.revokeObjectURL(url),1500);}
    inform(ux('Audio original descargado sin modificar.','Original audio downloaded without changes.'));
  }));
  $('importLibraryBtn').addEventListener('click',()=>void action(async()=>{
    if(!canUseAcceptedSource()||typeof state.onImportReviewed!=='function')throw new Error('Accepted generated source is not available for integrated import');
    if(!confirm('Import the verified original WAV into this show library? It will not be assigned to a cue automatically.'))return;
    const result=await state.onImportReviewed({
      job:structuredClone(state.job),audioBytes:new Uint8Array(state.sourceBytes.slice(0)),
      reviewedRegion:Object.freeze({inSeconds:state.inSeconds,outSeconds:state.outSeconds,fadeInSeconds:state.fadeInSeconds,fadeOutSeconds:state.fadeOutSeconds}),
      taskContext:state.contextTask?structuredClone(state.contextTask):null,
    });
    inform(result?.message??'Accepted source imported to the local library. Assign it to a cue manually.');
  }));
  // These buttons are contributed by the unified workspace. Unlike AI
  // acceptance, local sources are already registered; no additional upload.
  const reviewedRegion=()=>Object.freeze({
    inSeconds:state.inSeconds,outSeconds:state.outSeconds,
    fadeInSeconds:state.fadeInSeconds,fadeOutSeconds:state.fadeOutSeconds,
  });
  $('rq10CreateLibraryCue')?.addEventListener('click',()=>void action(async()=>{
    if(state.fileOrigin!=='library'||!state.libraryAssetId||!state.audio)
      throw new Error('Selecciona un archivo de la biblioteca');
    if(!confirm('Create a NEW cue from this source and the visible IN/OUT/fades? GO remains manual.'))return;
    const result=await state.onCommitLibraryReview({
      assetId:state.libraryAssetId,reviewedRegion:reviewedRegion(),targetCueId:null,
    });
    inform(result?.message??'Cue created from library source');
  }));
  $('rq10AssignLibraryCue')?.addEventListener('click',()=>void action(async()=>{
    if(state.fileOrigin!=='library'||!state.libraryAssetId||!state.audio)
      throw new Error('Selecciona un archivo de la biblioteca');
    const targetCueId=$('rq10TargetCue')?.value??'';
    if(!targetCueId)throw new Error('Elige el cue de destino.');
    if(!confirm('Replace/assign the primary sound for the selected cue? Existing cue IN/OUT/fades will be updated. No GO.'))return;
    const result=await state.onCommitLibraryReview({
      assetId:state.libraryAssetId,reviewedRegion:reviewedRegion(),targetCueId,
    });
    inform(result?.message??'Source and edits assigned to existing cue');
  }));
  $('importCueBtn').addEventListener('click',()=>void action(async()=>{
    if(!canUseAcceptedSource()||typeof state.onImportReviewed!=='function')throw new Error('Accept and review a generated take first');
    if(!confirm('Import verified WAV AND create one manual cue? GO stays manual.'))return;
    const result=await state.onImportReviewed({
      createCue:true,job:structuredClone(state.job),
      linkSource:!state.recoveredJob,
      audioBytes:new Uint8Array(state.sourceBytes.slice(0)),
      reviewedRegion:Object.freeze({inSeconds:state.inSeconds,outSeconds:state.outSeconds,
        fadeInSeconds:state.fadeInSeconds,fadeOutSeconds:state.fadeOutSeconds}),
      taskContext:state.contextTask?structuredClone(state.contextTask):null,
    });
    inform(result?.message??'Created an editable sound cue.');
  }));
  $('importAssignCueBtn')?.addEventListener('click',()=>void action(async()=>{
    const targetCueId=$('rq10TargetCue')?.value??'';
    const targetLabel=$('rq10TargetCue')?.selectedOptions?.[0]?.textContent?.trim()??targetCueId;
    if(!targetCueId)throw new Error('Elige el cue de destino.');
    if(!canUseAcceptedSource()||typeof state.onImportReviewed!=='function')
      throw new Error('Accept a ready take before assigning it.');
    if(!confirm(ux(
      `Guardar esta toma y asignar el audio principal a ${targetLabel}? GO y NEXT no cambiarán.`,
      `Save this take and assign its primary audio to ${targetLabel}? GO and NEXT will not change.`,
    )))return;
    const result=await state.onImportReviewed({
      job:structuredClone(state.job),audioBytes:new Uint8Array(state.sourceBytes.slice(0)),
      reviewedRegion:reviewedRegion(),targetCueId,
      taskContext:state.contextTask?structuredClone(state.contextTask):null,
    });
    inform(result?.message??'Generated sound saved and assigned to the selected cue.');
  }));
  window.addEventListener('resize',drawWave);
  window.addEventListener('pagehide',()=>{stopSoundLabAudition();if(state.context)void state.context.close();});
}

let connectionCheck=null;
export function assertSfxGenerationIdle() {
  if (preparationBusy || state.working || resultWatcher.active || ACTIVE_STATUS.has(state.job?.status))
    throw new Error('SFX_ACTIVE_LIMIT');
}

export async function assignPreparedTake({requestId,taskContext,isCurrent}){
  const saved=preparedReviews.get(requestId);
  const review=saved&&saved.taskContext.projectId===taskContext.projectId&&
    saved.taskContext.generation===taskContext.generation&&saved.taskContext.cueId===taskContext.cueId?saved:null;
  const check=()=>{if(!isCurrent())throw new Error('SHOW_CHANGED');};
  check();
  stopSoundLabAudition();
  let job=await(await request('/jobs/'+encodeURIComponent(requestId))).json();
  check();
  if(job.requestId!==requestId||!job.wav||review&&job.wav.sha256!==review.sha256||!STATUS_WITH_AUDIO.has(job.status))
    throw new Error('SFX_IDENTITY');
  const sha256=job.wav.sha256;
  const region=state.loadedRemoteRequestId===requestId&&state.fileOrigin==='remote'?reviewRegion():
    review?.reviewedRegion??{inSeconds:0,outSeconds:job.wav.durationSeconds,fadeInSeconds:0,fadeOutSeconds:0};
  const audioBytes=new Uint8Array(await(await request('/jobs/'+encodeURIComponent(requestId)+'/audio')).arrayBuffer());
  check();
  if(job.status==='READY_FOR_REVIEW'){
    job=await(await request('/jobs/'+encodeURIComponent(requestId)+'/review',{
      method:'POST',data:{decision:'ACCEPT'},
    })).json();
    check();
  }
  if(job.requestId!==requestId||job.wav?.sha256!==sha256||
     job.status!=='ACCEPTED_FOR_MANUAL_IMPORT')throw new Error('SFX_IDENTITY');
  const result=await state.onImportReviewed({
    job,audioBytes,reviewedRegion:region,targetCueId:taskContext.cueId,taskContext,isCurrent,navigate:false,
  });
  if(state.job?.requestId===requestId)viewJob(job);
  return result;
}

export async function previewPreparedTake(options){
  await openPreparedTake(options);
  if(!options.isCurrent())throw new Error('SHOW_CHANGED');
  await previewSelection({inline:true});
}

export async function openPreparedTake({ requestId, taskContext, isCurrent = () => true }) {
  assertSfxGenerationIdle();
  if (!isCurrent()) throw new Error('SHOW_CHANGED');
  const job = await (await request('/jobs/' + encodeURIComponent(requestId))).json();
  if (!isCurrent() || job.requestId !== requestId) throw new Error('SHOW_CHANGED');
  if (!STATUS_WITH_AUDIO.has(job.status)) throw new Error('SFX_NOT_REVIEWABLE');
  document.dispatchEvent(new CustomEvent('runq:sound-context-open', { detail: { taskContext } }));
  state.recoveredJob = true;
  viewJob(job);
  await loadRemoteAudio();
  if (!isCurrent()) { if(state.job?.requestId===requestId)viewJob(null); throw new Error('SHOW_CHANGED'); }
  inform(ux('Toma del lote cargada. Puedes escucharla o aceptarla; no se reproduce automáticamente.',
    'Batch take loaded. Listen or accept it; playback never starts automatically.'));
}

function connectionProblem(settings){
  const checks=settings?.configurationChecks;
  if(!checks)return 'El proveedor no está listo. Comprueba la configuración del servidor.';
  const messages={
    pilotEnabled:ux('Servicio no activado','Service not enabled'),
    endpointConfigured:ux('Falta configurar el servicio','Provider connection not configured'),
    proxyTokenIdConfigured:ux('Falta configurar el acceso','Provider access not configured'),
    proxyTokenSecretConfigured:ux('Falta configurar el acceso','Provider access not configured'),
    costPolicyValid:ux('Faltan límites de gasto','Spending limits not configured'),
    modelRevisionValid:ux('Falta seleccionar un modelo compatible','Compatible model not selected'),
  };
  const missing=Object.entries(messages).filter(([key])=>checks[key]===false).map(([,label])=>label);
  return missing.length?missing.join(' · '):'El proveedor no está listo. Comprueba su configuración.';
}
async function checkConnection(){
  if (PROMPT_ONLY) {
    state.enabled=false; state.settings={promptOnly:true};
    updateControls();
    return;
  }
  if(connectionCheck)return connectionCheck;
  text('engineBadge',ux('Comprobando…','Connecting…'));
  connectionCheck=(async()=>{
    try{
      const settings=await(await request('/status')).json();
      state.settings=settings;
      state.enabled=settings.enabled===true;
      showCost(settings);
      text('engineBadge',state.enabled?ux('IA disponible','AI ready'):ux('IA sin conexión','AI unavailable'));
      $('engineBadge')?.classList.toggle('active',state.enabled);
      text('sfxProviderDiagnostics',state.enabled?ux('Conexión local configurada.','Local AI connection configured.'):connectionProblem(settings));
      inform(state.enabled
        ? ux('Puedes crear un sonido nuevo.','Ready to create a new sound.')
        : ux('La generación no está disponible. Puedes importar y editar sonidos mientras tanto.',
          'Sound generation is unavailable. You can still import and edit sounds.'),!state.enabled);
    }catch(error){
      state.enabled=false;state.settings=null;showCost(null);
      text('engineBadge',ux('IA sin conexión','AI unavailable'));
      $('engineBadge')?.classList.remove('active');
      text('sfxProviderDiagnostics',userFacingError(error,isSpanish()?'es':'en'));
      inform(ux('No se puede conectar con el generador. La edición local sigue disponible.','Cannot connect to the generator. Local audio editing is still available.'),true);
    }finally{updateControls();}
  })();
  try{await connectionCheck;}finally{connectionCheck=null;}
}
export async function initializeSoundLab({onImportReviewed,onReservePreview,onPreviewReleased,onCommitLibraryReview}={}){
  if(!requiredDom())throw new Error('Sound Lab workspace is unavailable');
  if(typeof onImportReviewed==='function')state.onImportReviewed=onImportReviewed;
  if(typeof onReservePreview==='function')state.onReservePreview=onReservePreview;
  if(typeof onPreviewReleased==='function')state.onPreviewReleased=onPreviewReleased;
  if(typeof onCommitLibraryReview==='function')state.onCommitLibraryReview=onCommitLibraryReview;
  if(!state.initialized){
    const activity=document.createElement('div');activity.id='sfxActivityProgress';activity.hidden=true;
    const label=document.createElement('label');label.htmlFor='sfxActivityMeter';
    const meter=document.createElement('progress');meter.id='sfxActivityMeter';
    activity.append(label,meter);$('jobState').parentElement.append(activity);
    state.initialized=true;bindEvents();bindScriptCompiler();
    try{$('requestId').value=localStorage.getItem('runq-sfx-last-id-v1')??'';}catch{}
  }
  // Recheck on every workspace entry. A previous offline check must not
  // permanently disable generation after the user fixes local configuration.
  await checkConnection();
  // Reopen the last LOCAL journal record, without remote polling or payment.
  if(!state.job && $('requestId').value.trim()){
    try{
      const result=await request('/jobs/'+encodeURIComponent(currentJobId()));
      state.recoveredJob=true;
      viewJob(await result.json());
    }catch{/* Old/missing local records are safely ignored. */}
  }
  updateSfxEditorLocale();updateControls();drawWave();
}
