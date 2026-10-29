import { compileSoundProposals, applyProposalEdits, recompileProposal } from '../core/soundPromptCompiler.mjs';
import { waveformPeaks, trimBounds, makeOfflineImpactDemoWav } from './waveform.mjs';
import {inspectSfxHistory,explainSfxError,labelSfxHistory} from './jobRecovery.mjs';
import {suggestEnglishSfxPrompt} from './freeTextPrompt.mjs';
import {localizeSfxMarkup,sfxLocalizedText,localeCopy} from './sfxLocale.mjs';

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

const state = {
  initialized:false, enabled:false, working:false, job:null, audio:null,
  sourceBytes:null, context:null, source:null, gain:null, peaks:null,
  fileOrigin:null, loadedRemoteRequestId:null, auditionedRemoteRequestId:null,
  inSeconds:0, outSeconds:0, fadeInSeconds:0, fadeOutSeconds:0, dragStart:null, settings:null,
  onImportReviewed:null,
  onReservePreview:null, onPreviewReleased:null, previewReserved:false, previewEpoch:0,
  libraryAssetId:null, onCommitLibraryReview:null, history:null, originalPrompt:null,
};
const $ = id => document.getElementById(id);
const text = (id,value) => { const element=$(id); if(element)element.textContent=sfxLocalizedText(sfxUiLocale(),value); };
const copy=(en,es)=>localeCopy(sfxUiLocale(),en,es);

function requiredDom() {
  return Boolean($('generateForm') && $('waveCanvas') && $('importLibraryBtn'));
}
function inform(message,error=false) {
  const element=$('feedback');
  if(!element)return;
  element.textContent=sfxLocalizedText(sfxUiLocale(),message);
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
  const ready=policy.perRequest!==null&&policy.daily!==null;
  element.classList.toggle('ready',ready);
  element.textContent=ready
    ? copy(`Estimated cost cap: ${money(policy.perRequest)} per request. Daily budget: ${money(policy.daily)}. Provider charges may differ.`, `Límite estimado por solicitud: ${money(policy.perRequest)}. Presupuesto diario: ${money(policy.daily)}. Son límites preventivos, no el importe facturado.`)
    : copy('Cost policy missing. Generation is disabled.','No hay una política de coste válida; la generación está bloqueada.');
  text('confirmRequestLabel',ready
    ? `Autorizo UNA generación con un límite estimado de ${money(policy.perRequest)}.`
    : 'Autorizo una única solicitud con el límite indicado.');
}
async function request(path,{method='GET',data}={}) {
  const options={method,cache:'no-store'};
  if(method==='POST'){
    options.headers={'Content-Type':'application/json'};
    options.body=JSON.stringify(data??{});
  }
  const response=await fetch(api+path,options);
  if(!response.ok){
    let errorBody=null;
    try{errorBody=await response.json();}catch{}
    const code=typeof errorBody?.code==='string'?errorBody.code:'HTTP '+response.status;
    const error=new Error(code);
    error.code=code;
    if(typeof errorBody?.requestId==='string'&&/^req-[A-Za-z0-9-]{8,90}$/.test(errorBody.requestId))
      error.requestId=errorBody.requestId;
    throw error;
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
/**
 * Only an actually auditioned, downloaded remote WAV can be committed to a
 * show. Approval and import remain one explicit operator decision, never GO.
 */
export function canCommitReviewedSfx({status,requestId,loadedId,auditionedId,sourceOrigin,hasBytes,hasImporter}={}){
  return ['READY_FOR_REVIEW','ACCEPTED_FOR_MANUAL_IMPORT'].includes(status) &&
    typeof requestId==='string' && requestId.length>0 &&
    requestId===loadedId && requestId===auditionedId &&
    sourceOrigin==='remote' && hasBytes===true && hasImporter===true;
}
function canCommitCurrentSfx(){
  return canCommitReviewedSfx({
    status:state.job?.status,requestId:state.job?.requestId,
    loadedId:state.loadedRemoteRequestId,auditionedId:state.auditionedRemoteRequestId,
    sourceOrigin:state.fileOrigin,hasBytes:state.sourceBytes instanceof ArrayBuffer,
    hasImporter:typeof state.onImportReviewed==='function',
  });
}
export function nextSfxVariationSeed(input){
  const seed=Number(input);
  return Number.isSafeInteger(seed)&&seed>=0&&seed<=2147483647
    ? (seed+1)%2147483648 : 42;
}
export function assessSfxPrompt(prompt,duration,locale='es'){
  const value=String(prompt??'').trim();
  const t=(spanish,english)=>locale==='en'?english:spanish;
  if(!value)return t(
    'Describe qué suena, qué ocurre y cómo se escucha. El modelo SFX trabaja mejor con descripciones en inglés.',
    'Describe the source, action and recording character. Small-SFX works best with English descriptions.');
  if(/[áéíóúñ¿¡]/i.test(value) || /\b(?:puerta|campana|lluvia|pasos|sonido|ruido|golpe|madera|escenario)\b/i.test(value))
    return t('Este modelo fue entrenado principalmente en inglés. Reescribe la descripción en inglés antes de generar; no se traduce automáticamente.',
      'Small-SFX was trained mainly on English. Rewrite your description in English; no automatic translation occurs.');
  if(value.length<45)return t(
    'Para más precisión, describe fuente, acción, material, distancia del micrófono y acústica.',
    'For precision, describe the source, action, material, microphone distance and room character.');
  if(/\b(?:then|followed by|afterwards|after that)\b/i.test(value))
    return t('Este prompt contiene varios momentos. Para efectos concretos, prueba separar cada acción en una toma.',
      'This prompt describes multiple events. For precise effects, split each action into a separate take.');
  if(Number(duration)>=8 && /\b(?:single|one|short|hit|slams?|strikes?|snap|clap|chime)\b/i.test(value))
    return t('Para un golpe aislado, prueba 2–4 segundos; una duración excesiva puede añadir ruido o eventos.',
      'For an isolated impact, try 2–4 seconds; longer durations may add unwanted sounds.');
  return t('Prueba otra semilla si el efecto no convence. Cambiar la semilla NO envía otra solicitud ni acepta gastos.',
    'Try another seed if the take is poor. Changing the seed does NOT generate audio or authorize spending.');
}
function updateControls(){
  if(!requiredDom())return;
  const job=state.job;
  const policy=costPolicy();
  const costReady=policy.perRequest!==null&&policy.daily!==null;
  const promptReady=$('soundPrompt').value.trim().length>0 && $('generateForm').checkValidity();
  const activeJob=state.history?.active?.[0]??null;
  // The native confirmation is the one and only explicit per-request approval.
  // Do not require an additional consent checkbox for the same action.
  const allowed=state.enabled&&!state.working&&costReady&&promptReady&&!activeJob;
  $('generateBtn').disabled=!allowed;
  const variation=$('sfxAnotherVariationBtn');
  if(variation)variation.disabled=!allowed||!job||!STATUS_WITH_AUDIO.has(job.status);
  $('generationHint').textContent=state.working?copy('Processing…','Procesando la solicitud…'):
    !state.enabled?copy('Unavailable: ','No disponible: ')+connectionProblem(state.settings):
    !costReady?copy('Cost policy not configured.','Falta la política de coste del servidor.'):
    !promptReady?copy('Describe a sound and check the duration.','Escribe un prompt y comprueba la duración.'):
    activeJob?.status==='SUBMISSION_UNKNOWN'?copy('Previous submission unconfirmed. Open “Previous sounds” before generating.','No podemos confirmar el envío anterior. Abre «Mis otros sonidos» para revisarlo antes de generar.'):
    activeJob?.status==='CANCEL_REQUESTED'?copy('Previous cancellation unconfirmed. Check “Previous sounds”.','La cancelación anterior no está confirmada. Revisa «Mis otros sonidos».'):
    activeJob?copy('A generation is pending.','Hay una generación pendiente.')+' '+(job?.requestId===activeJob.requestId?copy('Select “View result”.','Pulsa «Ver resultado».'):copy('Open “Previous sounds”.','Abre «Mis otros sonidos».')):
    copy('Ready to generate. Each request needs approval.','Listo para generar. Cada intento pide confirmación del coste.');
  const openHistory=$('sfxOpenHistoryBtn');
  if(openHistory)openHistory.disabled=state.working||!$('sfxHistorySelect')?.value;
  const reconnect=$('sfxReconnectBtn');
  if(reconnect) reconnect.disabled=state.working;
  const reviewButton=$('sfxCheckResultBtn');
  if(reviewButton)reviewButton.disabled=state.working||!job||
    !(ACTIVE_STATUS.has(job.status)||STATUS_WITH_AUDIO.has(job.status));
  $('openJobBtn').disabled=state.working;
  $('refreshBtn').disabled=state.working||!state.enabled||!job||!ACTIVE_STATUS.has(job.status);
  $('cancelBtn').disabled=state.working||!state.enabled||!job||!['QUEUED','RUNNING'].includes(job.status);
  $('loadGeneratedBtn').disabled=state.working||!job||!STATUS_WITH_AUDIO.has(job.status);
  const listened=job?.requestId===state.auditionedRemoteRequestId;
  $('acceptBtn').disabled=state.working||job?.status!=='READY_FOR_REVIEW'||
    state.loadedRemoteRequestId!==job?.requestId||!listened;
  $('rejectBtn').disabled=state.working||job?.status!=='READY_FOR_REVIEW';
  $('playBtn').disabled=!state.audio||state.working;
  $('stopBtn').disabled=!state.source;
  $('inPoint').disabled=!state.audio;
  $('outPoint').disabled=!state.audio;
  $('sfxFadeIn').disabled=!state.audio;
  $('sfxFadeOut').disabled=!state.audio;
  $('exportBtn').disabled=state.working||!canUseAcceptedSource();
  const commitReady=canCommitCurrentSfx()&&!state.working;
  $('importLibraryBtn').disabled=!commitReady;
  $('importCueBtn').disabled=!commitReady;
  text('sfxPromptQualityHint',assessSfxPrompt($('soundPrompt').value,Number($('duration').value),$('uiLocaleSelect')?.value));
  const fromLibrary=state.fileOrigin==='library'&&typeof state.libraryAssetId==='string'&&!!state.audio;
  const libraryActions=$('rq10LibraryEditActions');
  if(libraryActions)libraryActions.hidden=!fromLibrary;
  const create=$('rq10CreateLibraryCue');
  if(create)create.disabled=state.working||!fromLibrary||typeof state.onCommitLibraryReview!=='function';
  const assign=$('rq10AssignLibraryCue');
  if(assign)assign.disabled=state.working||!fromLibrary||typeof state.onCommitLibraryReview!=='function';
}
function sfxUiLocale(){return $('uiLocaleSelect')?.value==='es'?'es':'en';}
function renderSfxHistory(){
  const select=$('sfxHistorySelect'),summary=$('sfxHistorySummary');
  if(!select||!summary)return;
  const history=state.history;
  const selected=select.value;
  select.replaceChildren();
  const placeholder=document.createElement('option');
  placeholder.value='';
  placeholder.textContent=history?.jobs.length?copy('Select previous sound…','Seleccionar toma anterior…'):copy('No previous sounds','Sin tomas registradas');
  select.append(placeholder);
  for(const job of history?.jobs??[]){
    const option=document.createElement('option');
    option.value=job.requestId;
    option.textContent=labelSfxHistory(job,sfxUiLocale());
    select.append(option);
  }
  if(history?.jobs.some(j=>j.requestId===selected))select.value=selected;
  else if(history?.active.length)select.value=history.active[0].requestId;
  $('sfxOpenHistoryBtn').disabled=!select.value||state.working;
  if(!history){summary.textContent=copy('Previous sounds unavailable. Your cost limits remain protected.','Historial no disponible. La seguridad del servidor sigue activa.');return;}
  summary.textContent=[
    copy(`${history.startedToday} requests today (UTC).`,`${history.startedToday} solicitud(es) iniciadas hoy (UTC).`),
    history.active.length?copy(`${history.active.length} pending; check them before generating.`,`${history.active.length} sin resolver: primero recuperar/actualizar.`):copy('No active jobs.','Sin trabajos activos.'),
    history.ready.length?copy(`${history.ready.length} sounds ready to listen.`,`${history.ready.length} toma(s) listas para recuperar y escuchar.`):'',
    history.truncated?copy('More jobs exist; cost rules are enforced by the server.','Historial truncado: los límites reales los decide el servidor.'):'',
  ].filter(Boolean).join(' ');
}
async function refreshSfxHistory(){
  const response=await request('/jobs');
  state.history=inspectSfxHistory(await response.json());
  renderSfxHistory();updateControls();
  return state.history;
}
async function loadSfxHistoryJob(id){
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(id))throw new Error('ID de toma inválido');
  const job=await(await request('/jobs/'+encodeURIComponent(id))).json();
  viewJob(job); // Never remote polling, submit or autoplay.
  if($('sfxHistorySelect'))$('sfxHistorySelect').value=id;
  renderSfxHistory();
  inform('Toma recuperada del registro local. Comprobar resultado consulta Modal solo si el trabajo sigue activo.');
}
function clearReviewedAudio(){
  stopSoundLabAudition();
  state.audio=null;state.sourceBytes=null;state.fileOrigin=null;state.libraryAssetId=null;state.peaks=null;
  state.inSeconds=0;state.outSeconds=0;state.fadeInSeconds=0;state.fadeOutSeconds=0;
  text('audioName','Ningún WAV cargado');
  text('waveDuration','00:00.000');
  $('sfxWaveEmpty')?.removeAttribute('hidden');
  $('waveCanvas')?.classList.remove('sfx-has-audio');
  drawWave();
}
function viewJob(job){
  const changed=state.job?.requestId!==job?.requestId;
  if(changed)clearReviewedAudio();
  state.job=job;
  if(changed){
    state.loadedRemoteRequestId=null;
    state.auditionedRemoteRequestId=null;
  }
  text('jobState',job ? (
    job.status==='ACCEPTED_FOR_MANUAL_IMPORT'?'Sonido listo para usar':
    job.status==='READY_FOR_REVIEW'?'Sonido generado':
    job.status==='QUEUED'?'Preparando tu sonido…':
    job.status==='RUNNING'?'Generando sonido…':
    job.status==='SUBMISSION_UNKNOWN'?'Comprobar solicitud pendiente':
    job.status==='FAILED'?'No se pudo generar':
    STATUS_LABEL[job.status]??job.status?.replaceAll('_',' ')
  ) : 'Todavía no hay ningún sonido');
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
  text('jobDetails',job ? (
    STATUS_WITH_AUDIO.has(job.status)?'Escúchalo y pulsa «Usar sonido» para guardarlo. Si no te convence, puedes probar otra versión.':
    ['QUEUED','RUNNING'].includes(job.status)?'Tu solicitud sigue en curso. Pulsa «Ver resultado» para comprobar si ha terminado.':
    job.status==='SUBMISSION_UNKNOWN'?'No repitas la generación: comprueba la solicitud pendiente en las opciones técnicas.':
    job.status==='REJECTED'?'Descartado. Puedes generar otro sonido cuando haya presupuesto y pruebas disponibles.':
    'Puedes crear otro sonido cuando el generador esté disponible.'
  ) : 'Describe un sonido y pulsa «Generar sonido».');
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
  // Invalidates a pending AudioContext.resume() before it can start sound.
  state.previewEpoch++;
  const source=state.source;
  state.source=null;
  if(source){source.onended=null;try{source.stop();}catch{}try{source.disconnect();}catch{}}
  if(state.gain){try{state.gain.disconnect();}catch{}state.gain=null;}
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
 drawWave();
}
function updateSfxEditorLocale(){
 const es=sfxUiLocale()==='es';
 text('sfxDragLabel',es?'Acción al arrastrar':'Waveform gesture');
 const modes=$('sfxDragMode').options;
 modes[0].textContent=es?'Seleccionar IN/OUT':'Select IN/OUT';
 modes[1].textContent=es?'Mover fundido de entrada':'Move fade-in edge';
 modes[2].textContent=es?'Mover fundido de salida':'Move fade-out edge';
 text('acceptBtn',es?'Solo aceptar (sin importar)':'Accept only (without importing)');
 text('sfxAnotherVariationBtn',es?'Probar otra versión':'Try another version');
 text('importLibraryBtn',es?'Usar sonido':'Use sound');
 text('importCueBtn',es?'Guardar y crear cue':'Save and create cue');
 updateFades(state.fadeInSeconds,state.fadeOutSeconds);
 localizeSfxMarkup(document.querySelector('.sfx-lab'),sfxUiLocale());
 updateControls();
}
function updateTrim(inSeconds,outSeconds){
  if(!state.audio)return;
  try{
    const bounds=trimBounds(inSeconds,outSeconds,state.audio.duration);
    state.inSeconds=bounds.inSeconds;state.outSeconds=bounds.outSeconds;
    $('inPoint').value=String(Number(bounds.inSeconds.toFixed(3)));
    $('outPoint').value=String(Number(bounds.outSeconds.toFixed(3)));
    updateFades(state.fadeInSeconds,state.fadeOutSeconds);
    inform(`Reviewed region ${formatTime(state.inSeconds)} → ${formatTime(state.outSeconds)}. The source WAV is unchanged.`);
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
  const context=await ensureContext();
  const decoded=await context.decodeAudioData(bytes.slice(0));
  if(![1,2].includes(decoded.numberOfChannels)||decoded.duration<=0||decoded.duration>600)throw new Error('Unsupported audio layout or duration');
  state.audio=decoded;state.sourceBytes=bytes.slice(0);state.fileOrigin=origin;
  state.libraryAssetId=origin==='library'?libraryAssetId:null;
  $('sfxWaveEmpty')?.setAttribute('hidden','');
  $('waveCanvas')?.classList.add('sfx-has-audio');
  state.loadedRemoteRequestId=origin==='remote'?state.job?.requestId:null;
  state.auditionedRemoteRequestId=null;
  state.inSeconds=0;state.outSeconds=decoded.duration;state.fadeInSeconds=0;state.fadeOutSeconds=0;
  state.peaks=waveformPeaks(Array.from({length:decoded.numberOfChannels},(_,channel)=>decoded.getChannelData(channel)),600);
  text('audioName',`${name} · ${decoded.numberOfChannels} ch · ${decoded.sampleRate} Hz`);
  text('waveDuration',formatTime(decoded.duration));
  $('inPoint').max=String(decoded.duration);$('outPoint').max=String(decoded.duration);
  updateTrim(0,decoded.duration);updateControls();
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
  inform('Original seleccionado. Edita IN/OUT y fades; los cambios son no destructivos. Puedes crear un cue o asignarlo a uno existente.');
}
function currentJobId(){
  const id=$('requestId').value.trim();
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(id))throw new Error('Enter a valid request ID');
  return id;
}
async function action(operation){
  if(state.working)return;
  busy(true);
  try{await operation();}
  catch(error){
    if(typeof error?.code==='string'&&error.code.startsWith('SFX_')){
      // A blocked or uncertain attempt never retains authorization for later.
      if($('confirmRequest'))$('confirmRequest').checked=false;
      try{await refreshSfxHistory();}catch{/* Existing journal still protects reservations. */}
      inform(explainSfxError(error.code,sfxUiLocale())+
        (error.requestId?' Registro: '+error.requestId:''),true);
    }else inform('Action failed: '+(error?.message||'unknown error'),true);
  }
  finally{busy(false);}
}
function applyPreset(){
  const preset=SFX_ACCEPTANCE_CASES[$('acceptancePreset').value];
  if(!preset){inform('Choose one of the three prepared acceptance cases.',true);return;}
  $('soundKind').value=preset.kind;$('soundPrompt').value=preset.prompt;
  $('duration').value=String(preset.durationSeconds);$('seed').value=String(preset.seed);
  $('confirmRequest').checked=false;updateControls();
  inform('Acceptance case loaded locally. No request has been sent.');
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
      $('scriptSfxStatus').textContent=proposals.length?proposals.length+' propuesta(s) · sin consumo':'No se detectaron sonidos explícitos';
      if(proposals.length)showScriptProposal();
    }catch(error){$('scriptSfxResults').hidden=true;$('scriptSfxStatus').textContent='Revisa la acotación: '+error.message;}
  });
  $('scriptSfxSelect').addEventListener('change',()=>{scriptProposalState.selected=Number($('scriptSfxSelect').value);showScriptProposal();});
  $('scriptSfxMode').addEventListener('change',()=>{
    if(!scriptProposalState.proposals.length)return;
    try{
      scriptProposalState.proposals=scriptProposalState.proposals.map(p=>recompileProposal(p,{mode:$('scriptSfxMode').value}));
      showScriptProposal();
    }catch(error){$('scriptSfxStatus').textContent=error.message;}
  });
  for(const [id,key] of [['scriptSfxSource','soundSource'],['scriptSfxAction','action'],['scriptSfxMaterial','material'],['scriptSfxSpace','acousticSpace'],['scriptSfxIntensity','intensity'],['scriptSfxDuration','suggestedDurationSeconds']]){
    $(id).addEventListener('change',()=>{
      const index=scriptProposalState.selected,p=scriptProposalState.proposals[index];if(!p)return;
      try{const value=key==='suggestedDurationSeconds'?Number($(id).value):key==='intensity'?($(id).value||null):$(id).value;
        scriptProposalState.proposals[index]=applyProposalEdits(p,{[key]:value});
        showScriptProposal();}catch(error){$('scriptSfxStatus').textContent=error.message;}
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
    $('scriptSfxStatus').textContent='Propuesta restaurada';
  });
  $('scriptSfxTransfer').addEventListener('click',()=>{
    const p=scriptProposalState.proposals[scriptProposalState.selected];if(!p)return;
    if(p.category==='MUSIC'){$('scriptSfxStatus').textContent='Música requiere un proveedor compatible; no se transfiere al piloto SFX';return;}
    const finalPrompt=$('scriptSfxPrompt').value.trim();
    if(!finalPrompt||finalPrompt.length>1000){$('scriptSfxStatus').textContent='El prompt debe tener entre 1 y 1000 caracteres';return;}
    $('soundKind').value=p.category==='ENVIRONMENT'?'ENVIRONMENT':'SFX';
    $('sourceLine').value=p.scriptReference??'';
    $('soundPrompt').value=finalPrompt;
    $('duration').value=String(p.suggestedDurationSeconds??8);
    $('confirmRequest').checked=false;updateControls();
    $('scriptSfxStatus').textContent='Transferido al formulario. No se ha enviado ninguna solicitud.';
    $('sfxScriptDetails').open=false;
    $('soundPrompt').focus();
  });
}
function bindEvents(){
  $('generateForm').addEventListener('submit',event=>{
    event.preventDefault();
    void action(async()=>{
      const policy=costPolicy();
      if(!state.enabled||policy.perRequest===null)throw new Error('Generator is disabled or unpriced');
      // Read-only journal check before creating a new paid request.
      const history=await refreshSfxHistory();
      if(history.active.length){
        await loadSfxHistoryJob(history.active[0].requestId);
        const error=new Error('Unresolved prior generation');
        error.code='SFX_ACTIVE_LIMIT';
        throw error;
      }
      const source=$('sourceLine').value.trim();
      const requestData={
        requestId:'req-'+crypto.randomUUID(),authorizationId:'auth-'+crypto.randomUUID(),confirmed:true,
        sourceLineId:source||null,kind:$('soundKind').value,prompt:$('soundPrompt').value.trim(),
        durationSeconds:Number($('duration').value),seed:Number($('seed').value),
        acknowledgedMaxCostUsd:policy.perRequest,
      };
      if(!confirm(copy(`Generate this sound? ONE Modal request with estimated limit ${money(policy.perRequest)}. Actual charges may differ. No automatic retries.`,`¿Generar este sonido? Se hará UNA solicitud a Modal con una estimación máxima de ${money(policy.perRequest)}. El gasto real puede diferir. No se repetirá automáticamente.`)))return;
      let response;
      try{response=await request('/jobs',{method:'POST',data:requestData});}
      catch(error){
        if(error?.code==='SFX_SUBMISSION_UNKNOWN'&&error.requestId){
          // The reservation exists; reopen it locally instead of losing ID.
          try{await loadSfxHistoryJob(error.requestId);}catch{}
        }
        throw error;
      }
      viewJob(await response.json());$('confirmRequest').checked=false;
      await refreshSfxHistory();
      inform('Submitted once. Refresh is manual; RunQ will not retry an uncertain request.');
    });
  });
  $('confirmRequest').addEventListener('change',updateControls);
  $('sfxReconnectBtn')?.addEventListener('click',()=>void checkConnection());
  for(const id of ['soundPrompt','duration','seed','soundKind','sourceLine']){
    $(id).addEventListener('input',()=>{$('confirmRequest').checked=false;updateControls();});
    $(id).addEventListener('change',()=>{$('confirmRequest').checked=false;updateControls();});
  }
  $('loadPresetBtn').addEventListener('click',applyPreset);
  $('sfxSuggestEnglishBtn')?.addEventListener('click',()=>{
    const suggestion=suggestEnglishSfxPrompt($('soundPrompt').value,$('sourceLine').value.trim());
    if(!suggestion){
      text('sfxPromptSuggestionStatus','No hay una traducción fiable mediante reglas locales para esta descripción. Conserva el original o prepara un prompt en inglés; no se han gastado créditos.');
      return;
    }
    state.originalPrompt=$('soundPrompt').value;
    $('soundPrompt').value=suggestion.prompt;
    $('soundKind').value=suggestion.kind;
    $('sfxRestoreOriginalPromptBtn').disabled=false;
    $('confirmRequest').checked=false;
    updateControls();
    text('sfxPromptSuggestionStatus','Sugerencia inglesa LOCAL, no traducción universal. Revisa que el efecto y la acción sigan siendo correctos antes de autorizar Modal. Confianza estimada: '+suggestion.confidence.toFixed(2)+'.');
  });
  $('sfxRestoreOriginalPromptBtn')?.addEventListener('click',()=>{
    if(state.originalPrompt===null)return;
    $('soundPrompt').value=state.originalPrompt;
    state.originalPrompt=null;
    $('sfxRestoreOriginalPromptBtn').disabled=true;
    $('confirmRequest').checked=false;
    updateControls();
    text('sfxPromptSuggestionStatus','Texto original restaurado. No se ha llamado a ningún proveedor.');
  });
  $('sfxHistorySelect')?.addEventListener('change',updateControls);
  $('sfxRefreshHistoryBtn')?.addEventListener('click',()=>void action(async()=>{
    await refreshSfxHistory();
    inform('Historial local actualizado. No se consultó al proveedor.');
  }));
  $('sfxOpenHistoryBtn')?.addEventListener('click',()=>void action(async()=>{
    await loadSfxHistoryJob($('sfxHistorySelect').value);
  }));
  $('sfxAnotherVariationBtn')?.addEventListener('click',()=>{
    if(state.working||!state.enabled||state.history?.active?.length)return;
    $('seed').value=String(nextSfxVariationSeed($('seed').value));
    updateControls();
    // One user click -> one cost confirmation -> one job reservation. The
    // same submit validation and safe one-shot logic are reused.
    $('generateForm').requestSubmit();
  });
  // One explicit check combines the two safe steps users previously had to
  // discover: refresh the remote status ONCE, then download WAV if ready.
  // It never triggers a new generation, never retries an uncertain submission
  // and never starts audio through the speakers automatically.
  $('sfxCheckResultBtn')?.addEventListener('click',()=>void action(async()=>{
    if(!state.job)throw new Error('Todavía no hay una toma para revisar');
    let job=state.job;
    if(ACTIVE_STATUS.has(job.status)){
      const result=await request('/jobs/'+encodeURIComponent(job.requestId)+'/refresh',{method:'POST',data:{}});
      job=await result.json();
      viewJob(job);
      await refreshSfxHistory();
    }
    if(STATUS_WITH_AUDIO.has(job.status)){
      const result=await request('/jobs/'+encodeURIComponent(job.requestId)+'/audio');
      await loadAudio(await result.arrayBuffer(),'Generado · '+job.requestId+'.wav','remote');
      inform('WAV cargado. Pulsa Play para escucharlo antes de aceptarlo.');
    }else{
      inform('Estado: '+(STATUS_LABEL[job.status]??job.status)+'. Vuelve a comprobar cuando quieras.');
    }
  }));
  $('openJobBtn').addEventListener('click',()=>void action(async()=>{
    viewJob(await(await request('/jobs/'+encodeURIComponent(currentJobId()))).json());
    inform('Loaded the persistent local record. No provider call was made.');
  }));
  $('refreshBtn').addEventListener('click',()=>void action(async()=>{
    const response=await request('/jobs/'+encodeURIComponent(currentJobId())+'/refresh',{method:'POST',data:{}});
    viewJob(await response.json());await refreshSfxHistory();
    inform('Remote status checked once. No sound was played.');
  }));
  $('cancelBtn').addEventListener('click',()=>void action(async()=>{
    if(!confirm('Request cancellation? Charges may already have occurred and cancellation is not guaranteed.'))return;
    const response=await request('/jobs/'+encodeURIComponent(currentJobId())+'/cancel',{method:'POST',data:{}});
    viewJob(await response.json());await refreshSfxHistory();
    inform('Cancellation requested; verify the final state manually.');
  }));
  $('loadGeneratedBtn').addEventListener('click',()=>void action(async()=>{
    if(!state.job||!STATUS_WITH_AUDIO.has(state.job.status))throw new Error('Generated WAV is not ready');
    const result=await request('/jobs/'+encodeURIComponent(state.job.requestId)+'/audio');
    await loadAudio(await result.arrayBuffer(),'Generated · '+state.job.requestId+'.wav','remote');
    inform('Verified generated WAV loaded. Listen before accepting.');
  }));
  $('acceptBtn').addEventListener('click',()=>void action(async()=>{
    if(!state.job||state.job.status!=='READY_FOR_REVIEW'||state.auditionedRemoteRequestId!==state.job.requestId)throw new Error('Listen to this generated take before accepting it');
    if(!confirm('Accept this listened take for local download and library import?'))return;
    const response=await request('/jobs/'+encodeURIComponent(state.job.requestId)+'/review',{method:'POST',data:{decision:'ACCEPT'}});
    viewJob(await response.json());await refreshSfxHistory();
    inform('Take accepted. The verified original can now be imported; no cue was changed.');
  }));
  $('rejectBtn').addEventListener('click',()=>void action(async()=>{
    if(!state.job||state.job.status!=='READY_FOR_REVIEW')throw new Error('Take is not available for review');
    if(!confirm('Reject this generated take? It will not be importable.'))return;
    const response=await request('/jobs/'+encodeURIComponent(state.job.requestId)+'/review',{method:'POST',data:{decision:'REJECT'}});
    viewJob(await response.json());await refreshSfxHistory();
    inform('Take rejected. No asset or cue was created.');
  }));
  $('demoAudioBtn').addEventListener('click',()=>void action(async()=>{
    const bytes=makeOfflineImpactDemoWav();await loadAudio(bytes.buffer,'Offline synthesized impact · NOT AI','local');
    inform('Synthetic test sound loaded locally. It cannot be imported as an AI result.');
  }));
  $('localWav').addEventListener('change',()=>void action(async()=>{
    const file=$('localWav').files?.[0];if(!file)return;
    if(file.size>8_000_000)throw new Error('File is larger than 8 MB');
    await loadAudio(await file.arrayBuffer(),file.name,'local');
    inform('Local WAV loaded. It was not uploaded and cannot masquerade as a generated result.');
  }));
  $('playBtn').addEventListener('click',()=>void action(async()=>{
    if(!state.audio)return;
    stopSoundLabAudition();
    // The show controller owns the global GO/preview lease. Reserve it
    // synchronously BEFORE awaiting device unlock to prevent a concurrent GO.
    if(typeof state.onReservePreview!=='function'||state.onReservePreview()!==true)
      throw new Error('Detén los cues activos o la preescucha antes de escuchar un sonido.');
    state.previewReserved=true;
    const epoch=state.previewEpoch;
    try{
    const context=await ensureContext();
    if(epoch!==state.previewEpoch||!state.previewReserved)
      throw new Error('Preescucha cancelada por PARAR TODO.');
    const source=context.createBufferSource();const gain=context.createGain();
    source.buffer=state.audio;
    const level=Number($('monitorLevel').value)/100;
    const now=context.currentTime;
    const length=state.outSeconds-state.inSeconds;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(state.fadeInSeconds>0?0:level,now);
    if(state.fadeInSeconds>0)gain.gain.linearRampToValueAtTime(level,now+state.fadeInSeconds);
    if(state.fadeOutSeconds>0){
      const fadeOutAt=now+length-state.fadeOutSeconds;
      gain.gain.setValueAtTime(level,fadeOutAt);
      gain.gain.linearRampToValueAtTime(0,now+length);
    }
    source.connect(gain);gain.connect(context.destination);state.source=source;state.gain=gain;
    source.onended=()=>{
      if(state.source===source){
        state.source=null;
        try{gain.disconnect();}catch{}
        state.gain=null;
        if(state.previewReserved){
          state.previewReserved=false;
          try{state.onPreviewReleased?.();}catch{}
        }
        updateControls();
      }
    };
    source.start(0,state.inSeconds,state.outSeconds-state.inSeconds);
    if(state.fileOrigin==='remote')state.auditionedRemoteRequestId=state.loadedRemoteRequestId;
    updateControls();inform('Previewing the reviewed region through the default audio output.');
    }catch(error){stopSoundLabAudition();throw error;}
  }));
  $('stopBtn').addEventListener('click',()=>{stopSoundLabAudition();inform('Preview stopped.');});
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
    inform('Original verified PCM16 WAV downloaded. The reviewed IN/OUT did not alter it.');
  }));
  async function commitReviewedSfx(createCue=false){
    if(!canCommitCurrentSfx())throw new Error('Escucha la toma generada antes de guardarla.');
    // "Usar sonido" is itself the operator's explicit acceptance/import action;
    // asking again was redundant. Additional cue creation still confirms.
    if(createCue && !confirm(copy('Save this sound and create ONE editable cue? GO stays manual.','¿Guardar el sonido y crear UN cue editable? GO seguirá siendo manual.')))return;
    if(state.job.status==='READY_FOR_REVIEW'){
      const accepted=await request('/jobs/'+encodeURIComponent(state.job.requestId)+'/review',{
        method:'POST',data:{decision:'ACCEPT'},
      });
      viewJob(await accepted.json());
      await refreshSfxHistory();
    }
    if(!canUseAcceptedSource())throw new Error('La toma no está aceptada; no se ha importado.');
    // Release the single audio-preview lease before the existing library
    // importer checks its transport safety gate. Without this, a sounding
    // prelisten blocks saving, even though the take has been reviewed.
    stopSoundLabAudition();
    const result=await state.onImportReviewed({
      createCue,job:structuredClone(state.job),
      audioBytes:new Uint8Array(state.sourceBytes.slice(0)),
      reviewedRegion:Object.freeze({inSeconds:state.inSeconds,outSeconds:state.outSeconds,
        fadeInSeconds:state.fadeInSeconds,fadeOutSeconds:state.fadeOutSeconds}),
    });
    // The exact reviewed original is now registered in THIS show. Switch
    // to the library source identity so a double-click cannot import twice.
    // Operators can still use the local 'create/assign cue' actions afterwards.
    if(typeof result?.assetId==='string' && result.assetId.length){
      text('jobState','Guardado en biblioteca');
      state.fileOrigin='library';
      state.libraryAssetId=result.assetId;
      updateControls();
    }
    inform(result?.message??(createCue?'WAV guardado y cue creado.':'WAV guardado en la biblioteca.'));
  }
  $('importLibraryBtn').addEventListener('click',()=>void action(()=>commitReviewedSfx(false)));
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
  $('importCueBtn').addEventListener('click',()=>void action(()=>commitReviewedSfx(true)));
  window.addEventListener('resize',drawWave);
  window.addEventListener('pagehide',()=>{stopSoundLabAudition();if(state.context)void state.context.close();});
}

let connectionCheck=null;
function connectionProblem(settings){
  const checks=settings?.configurationChecks;
  if(!checks)return 'El proveedor no está listo. Comprueba la configuración del servidor.';
  const messages={
    pilotEnabled:'El piloto está desactivado',
    endpointConfigured:'Falta la dirección del proveedor',
    proxyTokenIdConfigured:'Falta el identificador del proxy',
    proxyTokenSecretConfigured:'Falta el secreto del proxy',
    costPolicyValid:'Falta una política de coste válida',
    modelRevisionValid:'Falta una revisión válida del modelo',
  };
  const missing=Object.entries(messages).filter(([key])=>checks[key]===false).map(([,label])=>label);
  return missing.length?missing.join(' · '):'El proveedor no está listo. Comprueba su configuración.';
}
async function checkConnection(){
  if(connectionCheck)return connectionCheck;
  text('engineBadge','Checking…');
  connectionCheck=(async()=>{
    try{
      const settings=await(await request('/status')).json();
      state.settings=settings;
      state.enabled=settings.enabled===true;
      showCost(settings);
      text('engineBadge',state.enabled?'Generator ready':'Generator unavailable');
      $('engineBadge')?.classList.toggle('active',state.enabled);
      inform(state.enabled
        ? 'El servidor tiene la configuración necesaria. Puedes autorizar una solicitud; la conexión real se comprobará al enviarla.'
        : connectionProblem(settings),!state.enabled);
    }catch(error){
      state.enabled=false;state.settings=null;showCost(null);
      text('engineBadge','No connection to local server');
      $('engineBadge')?.classList.remove('active');
      inform('No se pudo consultar el generador local: '+(error?.message??'error de red'),true);
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
    state.initialized=true;bindEvents();bindScriptCompiler();
    try{$('requestId').value=localStorage.getItem('runq-sfx-last-id-v1')??'';}catch{}
  }
  // Recheck on every workspace entry. A previous offline check must not
  // permanently disable generation after the user fixes local configuration.
  await checkConnection();
  // App initialization is eager even when the operator is in Rehearsal or
  // Stage. Read the job journal ONLY when Audio is actually visible: an
  // unrelated workflow must not fetch project-private SFX history at startup.
  const workspace=document.querySelector('.shell')?.dataset.activeWorkspace;
  if(!workspace||workspace==='audio'){
    try{await refreshSfxHistory();}
    catch{inform('No se pudo leer el historial local. El servidor sigue protegiendo los límites de generación.',true);}
  }
  // Reopen the last LOCAL journal record, without remote polling or payment.
  if((!workspace||workspace==='audio') && !state.job && $('requestId').value.trim()){
    try{
      const result=await request('/jobs/'+encodeURIComponent(currentJobId()));
      viewJob(await result.json());
    }catch{/* Old/missing local records are safely ignored. */}
  }
  updateSfxEditorLocale();updateControls();drawWave();
}
