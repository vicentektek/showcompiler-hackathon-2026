import { compileSoundProposals, applyProposalEdits, recompileProposal } from '../core/soundPromptCompiler.mjs';
import { waveformPeaks, trimBounds, makeOfflineImpactDemoWav } from './waveform.mjs';

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
};
const $ = id => document.getElementById(id);
const text = (id,value) => { const element=$(id); if(element)element.textContent=value; };

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
  const ready=policy.perRequest!==null&&policy.daily!==null;
  element.classList.toggle('ready',ready);
  element.textContent=ready
    ? `Límite estimado por solicitud: ${money(policy.perRequest)}. Presupuesto diario: ${money(policy.daily)}. Son límites preventivos, no el importe facturado.`
    : 'No hay una política de coste válida; la generación está bloqueada.';
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
  const policy=costPolicy();
  const costReady=policy.perRequest!==null&&policy.daily!==null;
  const promptReady=$('soundPrompt').value.trim().length>0 && $('generateForm').checkValidity();
  const allowed=state.enabled&&!state.working&&costReady&&promptReady&&$('confirmRequest').checked;
  $('generateBtn').disabled=!allowed;
  $('generationHint').textContent=state.working?'Procesando la solicitud…':
    !state.enabled?'No disponible: '+connectionProblem(state.settings):
    !costReady?'Falta la política de coste del servidor.':
    !promptReady?'Escribe un prompt y comprueba la duración.':
    !$('confirmRequest').checked?'Marca la autorización de una única generación.':
    'Listo: puedes generar una toma.';
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
  $('importLibraryBtn').disabled=state.working||!canUseAcceptedSource()||typeof state.onImportReviewed!=='function';
  $('importCueBtn').disabled=$('importLibraryBtn').disabled;
}
function clearReviewedAudio(){
  stopSoundLabAudition();
  state.audio=null;state.sourceBytes=null;state.fileOrigin=null;state.peaks=null;
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
  text('jobState',job ? (STATUS_LABEL[job.status]??job.status?.replaceAll('_',' ')) : 'No job loaded');
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
  text('jobDetails',job ? `Toma ${job.durationSeconds}s · ${STATUS_LABEL[job.status]??job.status} · ${job.sourceLineId??'prompt libre'}` : 'Genera un sonido para obtener un resultado.');
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
  const source=state.source;
  state.source=null;
  if(source){source.onended=null;try{source.stop();}catch{}try{source.disconnect();}catch{}}
  if(state.gain){try{state.gain.disconnect();}catch{}state.gain=null;}
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
async function loadAudio(bytes,name,origin='local'){
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<44||bytes.byteLength>8_000_000)throw new Error('WAV file exceeds the 8 MB offline audition limit');
  stopSoundLabAudition();
  const context=await ensureContext();
  const decoded=await context.decodeAudioData(bytes.slice(0));
  if(![1,2].includes(decoded.numberOfChannels)||decoded.duration<=0||decoded.duration>600)throw new Error('Unsupported audio layout or duration');
  state.audio=decoded;state.sourceBytes=bytes.slice(0);state.fileOrigin=origin;
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
function currentJobId(){
  const id=$('requestId').value.trim();
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(id))throw new Error('Enter a valid request ID');
  return id;
}
async function action(operation){
  if(state.working)return;
  busy(true);
  try{await operation();}catch(error){inform('Action failed: '+(error?.message||'unknown error'),true);}
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
      if(!state.enabled||!$('confirmRequest').checked||policy.perRequest===null)throw new Error('Generator is disabled, unpriced or not confirmed');
      const source=$('sourceLine').value.trim();
      const requestData={
        requestId:'req-'+crypto.randomUUID(),authorizationId:'auth-'+crypto.randomUUID(),confirmed:true,
        sourceLineId:source||null,kind:$('soundKind').value,prompt:$('soundPrompt').value.trim(),
        durationSeconds:Number($('duration').value),seed:Number($('seed').value),
        acknowledgedMaxCostUsd:policy.perRequest,
      };
      if(!confirm(`Submit ONE external generation request with a configured maximum estimate of ${money(policy.perRequest)}? No automatic retries.`))return;
      const response=await request('/jobs',{method:'POST',data:requestData});
      viewJob(await response.json());$('confirmRequest').checked=false;
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
    viewJob(await response.json());inform('Remote status checked once. No sound was played.');
  }));
  $('cancelBtn').addEventListener('click',()=>void action(async()=>{
    if(!confirm('Request cancellation? Charges may already have occurred and cancellation is not guaranteed.'))return;
    const response=await request('/jobs/'+encodeURIComponent(currentJobId())+'/cancel',{method:'POST',data:{}});
    viewJob(await response.json());inform('Cancellation requested; verify the final state manually.');
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
    viewJob(await response.json());inform('Take accepted. The verified original can now be imported; no cue was changed.');
  }));
  $('rejectBtn').addEventListener('click',()=>void action(async()=>{
    if(!state.job||state.job.status!=='READY_FOR_REVIEW')throw new Error('Take is not available for review');
    if(!confirm('Reject this generated take? It will not be importable.'))return;
    const response=await request('/jobs/'+encodeURIComponent(state.job.requestId)+'/review',{method:'POST',data:{decision:'REJECT'}});
    viewJob(await response.json());inform('Take rejected. No asset or cue was created.');
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
    const context=await ensureContext();const source=context.createBufferSource();const gain=context.createGain();
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
    source.onended=()=>{if(state.source===source){state.source=null;gain.disconnect();state.gain=null;updateControls();}};
    source.start(0,state.inSeconds,state.outSeconds-state.inSeconds);
    if(state.fileOrigin==='remote')state.auditionedRemoteRequestId=state.loadedRemoteRequestId;
    updateControls();inform('Previewing the reviewed region through the default audio output.');
  }));
  $('stopBtn').addEventListener('click',()=>{stopSoundLabAudition();inform('Preview stopped.');});
  for(const id of ['inPoint','outPoint'])$(id).addEventListener('change',()=>{
    if(state.audio)updateTrim(Number($('inPoint').value),Number($('outPoint').value));
  });
  for(const id of ['sfxFadeIn','sfxFadeOut'])$(id).addEventListener('input',()=>{
    updateFades(Number($('sfxFadeIn').value),Number($('sfxFadeOut').value));
  });
  $('uiLocaleSelect')?.addEventListener('change',()=>{updateFades(state.fadeInSeconds,state.fadeOutSeconds);});
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
  $('importLibraryBtn').addEventListener('click',()=>void action(async()=>{
    if(!canUseAcceptedSource()||typeof state.onImportReviewed!=='function')throw new Error('Accepted generated source is not available for integrated import');
    if(!confirm('Import the verified original WAV into this show library? It will not be assigned to a cue automatically.'))return;
    const result=await state.onImportReviewed({
      job:structuredClone(state.job),audioBytes:new Uint8Array(state.sourceBytes.slice(0)),
      reviewedRegion:Object.freeze({inSeconds:state.inSeconds,outSeconds:state.outSeconds,fadeInSeconds:state.fadeInSeconds,fadeOutSeconds:state.fadeOutSeconds}),
    });
    inform(result?.message??'Accepted source imported to the local library. Assign it to a cue manually.');
  }));
  $('importCueBtn').addEventListener('click',()=>void action(async()=>{
    if(!canUseAcceptedSource()||typeof state.onImportReviewed!=='function')throw new Error('Accept and review a generated take first');
    if(!confirm('Import verified WAV AND create one manual cue? GO stays manual.'))return;
    const result=await state.onImportReviewed({
      createCue:true,job:structuredClone(state.job),
      audioBytes:new Uint8Array(state.sourceBytes.slice(0)),
      reviewedRegion:Object.freeze({inSeconds:state.inSeconds,outSeconds:state.outSeconds,
        fadeInSeconds:state.fadeInSeconds,fadeOutSeconds:state.fadeOutSeconds}),
    });
    inform(result?.message??'Created an editable sound cue.');
  }));
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
  text('engineBadge','Comprobando…');
  connectionCheck=(async()=>{
    try{
      const settings=await(await request('/status')).json();
      state.settings=settings;
      state.enabled=settings.enabled===true;
      showCost(settings);
      text('engineBadge',state.enabled?'Generador configurado':'Generador no disponible');
      $('engineBadge')?.classList.toggle('active',state.enabled);
      inform(state.enabled
        ? 'El servidor tiene la configuración necesaria. Puedes autorizar una solicitud; la conexión real se comprobará al enviarla.'
        : connectionProblem(settings),!state.enabled);
    }catch(error){
      state.enabled=false;state.settings=null;showCost(null);
      text('engineBadge','Sin conexión al servidor');
      $('engineBadge')?.classList.remove('active');
      inform('No se pudo consultar el generador local: '+(error?.message??'error de red'),true);
    }finally{updateControls();}
  })();
  try{await connectionCheck;}finally{connectionCheck=null;}
}
export async function initializeSoundLab({onImportReviewed}={}){
  if(!requiredDom())throw new Error('Sound Lab workspace is unavailable');
  if(typeof onImportReviewed==='function')state.onImportReviewed=onImportReviewed;
  if(!state.initialized){
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
      viewJob(await result.json());
    }catch{/* Old/missing local records are safely ignored. */}
  }
  updateControls();drawWave();
}
