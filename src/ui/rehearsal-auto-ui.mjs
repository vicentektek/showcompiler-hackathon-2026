/**
 * Operator-armed automatic GO for REHEARSAL ONLY. Muse ASR is provided by the
 * existing live module; the only player path is app.mjs guarded GO bridge.
 * This module has no audio engine, network endpoint, or credentials.
 */
import {makeProjectVoiceScenario} from '../core/voiceScenario.mjs';
import {initialRehearsalAutoState,decideRehearsalAutoGo,
 acknowledgeRehearsalAutoGo,discardRehearsalTurn,REHEARSAL_AUTO_POLICY} from '../core/rehearsalAutopilot.mjs';

const $=id=>document.getElementById(id);
const t=(en,es)=>$('uiLocaleSelect')?.value==='es'?es:en;
let listening=false,armed=false,busy=false,epoch=0;
let persistentWarning='';
let scenario=null,fingerprint='',autoState=initialRehearsalAutoState();
function currentShow(){
 let found=null;
 document.dispatchEvent(new CustomEvent('runq:voice-follow-read-project',{
  detail:{respond:value=>{found=value;}}
 }));
 return found;
}
const key=show=>JSON.stringify({script:show?.scriptText,cues:show?.cues});
function status(en,es){$('rqLiveArmStatus').textContent=t(en,es);}
function log(value){
 const item=document.createElement('li');
 item.textContent=new Date().toLocaleTimeString()+' · '+value;
 const list=$('rqLiveAutoHistory');list.prepend(item);
 while(list.children.length>7)list.lastChild.remove();
}
function display(){
 const button=$('rqLiveArm'),mode=$('rqLiveMode').value;
 const sessionMode=$('rqLiveSessionMode');
 sessionMode.value=mode;
 sessionMode.disabled=$('rqLiveMode').disabled||busy;
 const auto=mode==='auto';
 button.hidden=!auto;
 const quick=$('rqLiveAutoStart');
 if(quick){
  const starting=!listening&&$('rqLiveStart').disabled;
  quick.disabled=starting||busy;
  quick.dataset.state=starting?'starting':armed?'running':listening?'needs-arm':'idle';
  quick.textContent=starting?t('Connecting microphone…','Conectando micrófono…'):
   armed?t('■ STOP AUTOPILOT','■ DETENER AUTOPILOTO'):
   listening&&auto?t('ARM AUTOPILOT','ARMAR AUTOPILOTO'):
   listening?t('■ STOP LISTENING','■ DETENER ESCUCHA'):
   auto?t('▶ START AUTOPILOT','▶ INICIAR AUTOPILOTO'):t('▶ START LISTENING','▶ EMPEZAR A ESCUCHAR');
 }
 $('rqLivePanicBtn').hidden=!auto;
 $('rqLiveArmStatus').hidden=!auto;
 $('rqLiveAutoHelp').hidden=!auto;
 $('rqLiveAutoHistory').hidden=!auto;
 button.setAttribute('aria-pressed',String(armed));
 button.disabled=!armed&&(!listening||!scenario||!auto||busy);
 button.textContent=armed?t('DISARM AUTOMATIC GO','DESARMAR GO AUTOMÁTICO'):
  t('ARM AUTOMATIC GO','ARMAR GO AUTOMÁTICO');
 $('rqLivePanel').classList.toggle('rqlive-armed',armed);
 $('rqLivePanel').classList.toggle('rqlive-awaiting-arm',auto&&listening&&!armed);
 if(armed){$('rqLivePrepare').disabled=true;$('rqLiveDismiss').disabled=true;}
 const headline=armed?
  t('ARMED · SPEECH CAN PLAY AUDIO','ARMADO · LA VOZ PUEDE REPRODUCIR AUDIO'):
  !auto?t('ASSIST MODE · GO MANUAL','MODO ASISTENTE · GO MANUAL'):
  !listening?t('STEP 1 · START LISTENING','PASO 1 · INICIA LA ESCUCHA'):
  !scenario?t('NO SPOKEN CUES AVAILABLE','NO HAY PIES HABLADOS CONFIGURADOS'):
  t('STEP 2 · ARM AUTO GO TO PLAY CUES','PASO 2 · ARMA EL GO PARA REPRODUCIR CUES');
 status(persistentWarning||headline,persistentWarning||headline);
 const primary=$('rqvfPrimaryState');
 if(primary){
  primary.textContent=armed?t('AUTO GO ARMED · AUDIO ENABLED','GO AUTOMÁTICO ARMADO · AUDIO ACTIVO'):
   auto&&listening?t('LISTENING · AUTO GO NOT ARMED','ESCUCHANDO · GO AUTO SIN ARMAR'):
   auto?t('AUTO GO DISARMED','GO AUTOMÁTICO DESARMADO'):
   listening?t('LISTENING · MANUAL MODE','ESCUCHANDO · MODO MANUAL'):
   t('MICROPHONE STOPPED','MICRÓFONO DETENIDO');
  primary.dataset.state=armed?'armed':auto&&listening?'needs-arm':listening?'listening':'idle';
 }
}

function disarm(reason='operator'){
 if(armed)log(t('Disarmed: ','Desarmado: ')+reason);
 armed=false;epoch++;persistentWarning='';display();
}
// The operator confirms once per listening session; re-arming after a manual
// disarm does not repeat the warning.
let confirmedThisSession=false;
// Set by the one-click START AUTOPILOT button; consumed by the next ready event.
let pendingQuickArm=null;
function confirmAutoPlay(){
 if(confirmedThisSession)return true;
 confirmedThisSession=window.confirm(t(
  'REHEARSAL ONLY: allow voice-recognized cues to start SHOW AUDIO automatically? Cues may repeat, rewind and jump. No intermediate cues will play. STOP ALL disarms.',
  'SOLO ENSAYO: ¿permitir que los pies reconocidos disparen AUDIO DEL SHOW automáticamente? Se podrán repetir cues, retroceder o saltar. Los cues intermedios NO sonarán. PARAR TODO desarma.'
 ));
 return confirmedThisSession;
}
function unlockAudio(){
 // Dispatch synchronously within the operator click; Chrome can unlock the
 // Web Audio output only during user activation, not when ASR arrives later.
 return new Promise(resolve=>{
  document.dispatchEvent(new CustomEvent('runq:rehearsal-auto-arm-audio',{
   detail:{respond:resolve},
  }));
 });
}
async function arm(){
 if(armed){disarm('operator');return;}
 if(!listening||busy||$('rqLiveMode').value!=='auto')return;
 const show=currentShow();
 if(!scenario||key(show)!==fingerprint){disarm('show changed');return;}
 if(!confirmAutoPlay())return;
 await completeArm(unlockAudio());
}
async function completeArm(unlocked){
 const armEpoch=epoch;
 busy=true;display();
 const result=await unlocked;
 busy=false;
 if(epoch!==armEpoch||!listening||$('rqLiveMode').value!=='auto'){display();return;}
 if(!result?.ok){
  persistentWarning=t('Cannot arm audio: ','No se puede armar audio: ')+(result?.reason??'OUTPUT_ERROR');
  display();
  return;
 }
 const focus=Number($('rqLiveFocus').value);
 autoState=initialRehearsalAutoState({
  focusLine:Number.isInteger(focus)&&focus>0?focus:scenario.initialFocusLine,
 });
 armed=true;epoch++;persistentWarning='';
 display();
 log(t('Automatic GO ARMED · output unlocked','GO automático ARMADO · salida de audio activa'));
 $('rqLiveCue').textContent=t('Ready · say a configured cue trigger','Preparado · di un pie configurado');
}
function localized(){
 $('rqvfPrimaryTitle').textContent=t('VOICE FOLLOW · REHEARSAL','SEGUIMIENTO DE VOZ · ENSAYO');
 $('rqvfPrimarySubtitle').textContent=t('Live speech, cue recognition and optional automatic GO.',
  'Voz en directo, reconocimiento de pies y GO automático opcional.');
 $('rqvfAdvancedLabel').textContent=t('Diagnostic tools · microphone test and offline simulation',
  'Herramientas de diagnóstico · micrófono y simulación');
 $('rqLivePanicBtn').textContent=t('STOP ALL AUDIO','PARAR TODO EL AUDIO');
 $('rqLiveModeLabel').textContent=t('Cue follow mode','Modo de seguimiento de cues');
 $('rqLiveSessionModeLabel').textContent=t('Cue follow mode','Modo de seguimiento de cues');
 for(const selector of [$('rqLiveMode'),$('rqLiveSessionMode')]){
  selector.querySelector('option[value="assist"]').textContent=t('Assist · suggest NEXT','Asistente · sugerir NEXT');
  selector.querySelector('option[value="auto"]').textContent=t('Rehearsal autopilot · automatic GO','Autopiloto de ensayo · GO automático');
 }
 $('rqLiveAutoHelp').textContent=t(
  'Listening alone does NOT start cues. Click ARM AUTOMATIC GO to enable playback. STOP ALL disarms instantly. Repeats, rewinds and jumps are supported.',
  'Escuchar NO ejecuta cues. Pulsa ARMAR GO AUTOMÁTICO para permitir la reproducción. PARAR TODO desarma de inmediato. Puedes repetir, retroceder o saltar.'
 );
 $('rqLiveCueTitle').textContent=$('rqLiveMode').value==='auto'
  ?t('AUTOPILOT · DETECTION / GO','AUTOPILOTO · DETECCIÓN / GO')
  :t('SUGGESTED CUE · MANUAL GO','CUE SUGERIDO · GO MANUAL');
 $('rqLiveCueMapSummary').textContent=t('Show trigger phrases (','Pies hablados del espectáculo (')+
  String(scenario?.cues?.length??0)+')';
 $('rqLivePrivacy').textContent=t(
  'Only completed turns are considered. Automatic playback requires explicit arming in Rehearsal; never active in Operation.',
  'Solo se consideran frases finalizadas. La reproducción automática requiere armado explícito en Ensayo; nunca funciona en Directo.'
 );
 display();
}
function renderCueMap(){
 const list=$('rqLiveCueMap');
 list.replaceChildren();
 for(const cue of scenario?.cues??[]){
  const item=document.createElement('li');
  item.dataset.cueId=cue.id;
  const number=document.createElement('b');number.textContent=String(cue.number??'?').padStart(2,'0');
  const phrase=document.createElement('span');phrase.textContent=cue.trigger;
  const label=document.createElement('small');label.textContent=cue.lineId+' · '+cue.label;
  item.append(number,phrase,label);
  if(autoState?.lastCueId===cue.id)item.classList.add('is-current');
  list.append(item);
 }
 $('rqLiveCueMapSummary').textContent=t('Show trigger phrases (','Pies hablados del espectáculo (')+
  String(scenario?.cues?.length??0)+')';
}
function ready(){
 listening=true;
 const show=currentShow();
 fingerprint=key(show);
 scenario=makeProjectVoiceScenario(show,{maxCues:200,minimumWords:REHEARSAL_AUTO_POLICY.minimumWords});
 disarm('session started');
 renderCueMap();
 log(scenario?t('Loaded cue triggers: ','Pies de voz disponibles: ')+scenario.cues.length:
  t('No valid spoken cue triggers configured','No hay pies hablados configurados'));
 display();
 const quick=pendingQuickArm;pendingQuickArm=null;
 if(quick&&Date.now()<quick.expires&&scenario&&$('rqLiveMode').value==='auto')void completeArm(quick.unlocked);
}
function quickStart(){
 if(listening){
  if(armed||$('rqLiveMode').value!=='auto')$('rqLiveStop').click();
  else void arm();
  return;
 }
 const auto=$('rqLiveMode').value==='auto';
 if(auto&&!confirmAutoPlay())return;
 persistentWarning='';
 pendingQuickArm=auto?{unlocked:unlockAudio(),expires:Date.now()+60000}:null;
 $('rqLiveStart').click();
}async function finalTurn(detail){
 if(!armed||!listening)return;
 if(busy){
  const message=t('Phrase skipped: previous GO is still starting. Repeat after it starts.',
   'Frase omitida: el GO anterior sigue arrancando. Repite cuando haya empezado.');
  $('rqLiveCue').textContent=message;log(message);return;
 }
 if(key(currentShow())!==fingerprint){
  disarm('show changed');
  status('Show changed · autopilot disarmed','Guion cambiado · autopiloto desarmado');
  return;
 }
 const now=Date.now();
 const proposed=decideRehearsalAutoGo({
  cues:scenario?.cues??[],
  transcript:{text:detail.text,final:true,endMs:now},
  turnId:detail.turnId,atMs:now,state:autoState,armed,
 });
 const a=proposed.action;
 if(a.type!=='FIRE'){
  const messages={
   TOO_SHORT:t('No GO: use a trigger of at least two words.', 'Sin GO: usa un pie de al menos dos palabras.'),
   NO_MATCH:t('No GO: phrase does not match a loaded trigger. Check the trigger list below.',
    'Sin GO: la frase no coincide con un pie cargado. Revisa la lista de pies de abajo.'),
   AMBIGUOUS:t('No GO: more than one cue matches. Use distinct trigger phrases.',
    'Sin GO: coincide con varios cues. Usa pies distintos.'),
   SEEK_TOO_SHORT:t('No GO: short trigger is too far from the rehearsal focus. Set focus closer or use a longer trigger.',
    'Sin GO: el pie corto está lejos del foco del ensayo. Acerca el foco o usa un pie más largo.'),
   LOW_CONFIDENCE:t('No GO: uncertain phrase match. Repeat the configured trigger.',
    'Sin GO: coincidencia poco segura. Repite el pie configurado.'),
   REPEAT_COOLDOWN:t('No GO: repeat cooldown (2.5 seconds). Repeat after the pause.',
    'Sin GO: pausa entre repeticiones (2,5 segundos). Repite tras la pausa.'),
  };
  if(messages[a.reason]){$('rqLiveCue').textContent=messages[a.reason];log(messages[a.reason]);}
  return;
 }
 // Consume this turn before asynchronous player acknowledgement.
 autoState=discardRehearsalTurn(autoState,a.turnId);
 busy=true;const run=epoch;
 $('rqLiveCue').textContent=t('AUTO GO evaluating ','Evaluando GO automático ')+a.cueId+' · '+a.lineId;
 const outcome=await new Promise(resolve=>{
  let answered=false;
  const respond=result=>{if(!answered){answered=true;resolve(result);}};
  document.dispatchEvent(new CustomEvent('runq:rehearsal-auto-go',{
   detail:{cueId:a.cueId,respond},
  }));
  setTimeout(()=>respond({ok:false,reason:'GO_ACK_TIMEOUT'}),4500);
 });
 busy=false;
 if(!armed||run!==epoch)return;
 if(!outcome?.ok){
  // Nothing was started for these reasons, so stay armed for the next phrase.
  const benign=['NOT_ARMED_OR_BUSY','TRANSPORT_BUSY','AUDIO_NOT_READY','UNKNOWN_CUE'];
  if(benign.includes(outcome?.reason)){
   const skipped=t('Cue skipped (not started): ','Cue omitido (no iniciado): ')+outcome.reason;
   $('rqLiveCue').textContent=skipped;log(skipped);return;
  }
  disarm(outcome?.reason??'GO_FAILED');
  status('GO failed. Autopilot disarmed: '+(outcome?.reason??''),
   'GO fallido. Autopiloto desarmado: '+(outcome?.reason??''));
  return;
 }
 autoState=acknowledgeRehearsalAutoGo(autoState,a);
 $('rqLiveFocus').value=String(autoState.focusLine);
 const cue=scenario.cues.find(c=>c.id===a.cueId);
 const kind={
  FIRST:t('First','Primero'),ADVANCE:t('Next','Siguiente'),
  SKIP_FORWARD:t('Jump ahead','Salto adelante'),
  REWIND:t('Backwards','Retroceso'),REPEAT:t('Repeat take','Repetir toma'),
  REVISIT:t('Return','Volver'),
 }[a.movement]??a.movement;
 const message=kind+' · '+(cue?.number??a.cueId)+' '+(cue?.label??'')+
  ' · '+a.lineId+(a.skippedCount?' · '+a.skippedCount+' '+t('skipped','omitidos'):'');
 $('rqLiveCue').textContent=message;
 renderCueMap();
 log(message);
 document.dispatchEvent(new CustomEvent('runq:voice-follow-highlight-line',{
  detail:{lineId:a.lineId},
 }));
}
function mount(){
 if(!$('rqLiveMode'))return;
 $('rqLiveArm').addEventListener('click',()=>void arm());
 $('rqLiveAutoStart')?.addEventListener('click',quickStart);
 $('rqLiveSessionMode').addEventListener('change',()=>{
  $('rqLiveMode').value=$('rqLiveSessionMode').value;
  $('rqLiveMode').dispatchEvent(new Event('change',{bubbles:true}));
 });
 new MutationObserver(display).observe($('rqLiveStart'),{attributes:true,attributeFilter:['disabled']});
 new MutationObserver(display).observe($('rqLiveMode'),{attributes:true,attributeFilter:['disabled']});
 document.addEventListener('runq:operator-preferences-changed',display);
 $('rqLivePanicBtn').addEventListener('click',()=>{
  const emergency=$('stopAllBtn');
  if(emergency){emergency.click();disarm('STOP ALL');}
  else{disarm('STOP ALL unavailable');
   status('STOP ALL unavailable · use Operation emergency stop',
    'PARAR TODO no disponible · usa la parada de emergencia de Operación');}
 });
 $('rqLiveMode').addEventListener('change',()=>{
  pendingQuickArm=null;
  disarm('mode changed');
  $('rqLiveCue').textContent=$('rqLiveMode').value==='auto'
   ?t('Autopilot disarmed. Start listening, then ARM.','Autopiloto desarmado. Inicia escucha y después ARMA.')
   :t('Assist mode: recognized cues will be suggested.','Asistente: los cues reconocidos se sugerirán.');
  localized();
 });
 document.addEventListener('runq:voice-live-ready',ready);
 document.addEventListener('runq:voice-live-stopping',()=>{
  listening=false;pendingQuickArm=null;confirmedThisSession=false;disarm('microphone stopped');
 });
 document.addEventListener('runq:rehearsal-auto-disarm',event=>disarm(event.detail?.reason??'operator'));
 document.addEventListener('runq:voice-live-final',event=>{
  if(!armed)return;
  event.detail.handled=true; // No secondary MANUAL suggestion pipeline in auto mode.
  void finalTurn(event.detail);
 });
 $('rqLiveFocus').addEventListener('change',()=>disarm('focus changed'));
 $('uiLocaleSelect')?.addEventListener('change',localized);
 document.addEventListener('runq:locale-ready',localized);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)disarm('tab hidden');});
 const shell=document.querySelector('.shell');
 if(shell)new MutationObserver(()=>{
  if(shell.dataset.activeWorkspace!=='rehearsal')disarm('left rehearsal');
 }).observe(shell,{attributes:true,attributeFilter:['data-active-workspace']});
 localized();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
