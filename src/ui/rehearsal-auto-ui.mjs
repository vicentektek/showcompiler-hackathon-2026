/**
 * Operator-armed automatic GO for REHEARSAL ONLY. Muse ASR is provided by the
 * existing live module; the only player path is app.mjs guarded GO bridge.
 * This module has no audio engine, network endpoint, or credentials.
 */
import {makeProjectVoiceScenario} from '../core/voiceScenario.mjs';
import {initialRehearsalAutoState,decideRehearsalAutoGo,
 acknowledgeRehearsalAutoGo,discardRehearsalTurn} from '../core/rehearsalAutopilot.mjs';

const $=id=>document.getElementById(id);
const t=(en,es)=>$('uiLocaleSelect')?.value==='es'?es:en;
let listening=false,armed=false,busy=false,epoch=0;
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
 button.setAttribute('aria-pressed',String(armed));
 button.disabled=!armed&&(!listening||!scenario||mode!=='auto'||busy);
 button.textContent=armed?t('DISARM AUTO GO','DESARMAR GO AUTO'):t('ARM AUTO GO','ARMAR GO AUTOMÁTICO');
 $('rqLivePanel').classList.toggle('rqlive-armed',armed);
 if(armed){$('rqLivePrepare').disabled=true;$('rqLiveDismiss').disabled=true;}
 if(!armed)status('DISARMED · VOICE CANNOT START AUDIO','DESARMADO · LA VOZ NO PUEDE DISPARAR AUDIO');
 else status('ARMED · SPOKEN CUES CAN START AUDIO','ARMADO · LOS PIES DE VOZ PUEDEN DISPARAR AUDIO');
}
function disarm(reason='operator'){
 if(armed)log(t('Disarmed: ','Desarmado: ')+reason);
 armed=false;epoch++;display();
}
async function arm(){
 if(armed){disarm('operator');return;}
 if(!listening||busy||$('rqLiveMode').value!=='auto')return;
 const show=currentShow();
 if(!scenario||key(show)!==fingerprint){disarm('show changed');return;}
 const accepted=window.confirm(t(
  'REHEARSAL ONLY: allow voice-recognized cues to start SHOW AUDIO automatically? Cues may repeat, rewind and jump. No intermediate cues will play. STOP ALL disarms.',
  'SOLO ENSAYO: ¿permitir que los pies reconocidos disparen AUDIO DEL SHOW automáticamente? Se podrán repetir cues, retroceder o saltar. Los cues intermedios NO sonarán. PARAR TODO desarma.'
 ));
 if(!accepted)return;
 // Dispatch synchronously within the operator click; Chrome can unlock the
 // Web Audio output only during user activation, not when ASR arrives later.
 const armEpoch=epoch;
 const unlocked=new Promise(resolve=>{
  document.dispatchEvent(new CustomEvent('runq:rehearsal-auto-arm-audio',{
   detail:{respond:resolve},
  }));
 });
 busy=true;display();
 const result=await unlocked;
 busy=false;
 if(epoch!==armEpoch||!listening||$('rqLiveMode').value!=='auto')return;
 if(!result?.ok){
  status('Cannot arm audio: '+(result?.reason??'OUTPUT_ERROR'),
   'No se puede armar audio: '+(result?.reason??'OUTPUT_ERROR'));
  display();return;
 }
 const focus=Number($('rqLiveFocus').value);
 autoState=initialRehearsalAutoState({
  focusLine:Number.isInteger(focus)&&focus>0?focus:scenario.initialFocusLine,
 });
 armed=true;epoch++;
 display();
 log(t('Automatic GO ARMED','GO automático ARMADO'));
}
function localized(){
 $('rqLiveModeLabel').textContent=t('Cue follow mode','Modo de seguimiento de cues');
 $('rqLiveMode').options[0].textContent=t('Assist · suggest NEXT','Asistente · sugerir NEXT');
 $('rqLiveMode').options[1].textContent=t('Rehearsal autopilot · automatic GO','Autopiloto de ensayo · GO automático');
 $('rqLiveAutoHelp').textContent=t(
  'Rehearsal only. Arm after starting the microphone. A unique completed cue phrase can replay, jump ahead, or rewind. STOP ALL disarms. GO uses the show audio output.',
  'Solo ensayo. Arma después de activar el micrófono. Un pie inequívoco y finalizado puede repetir, avanzar o retroceder. PARAR TODO desarma. GO usa la salida de audio del espectáculo.'
 );
 $('rqLiveCueTitle').textContent=$('rqLiveMode').value==='auto'
  ?t('AUTOPILOT · LAST CUE','AUTOPILOTO · ÚLTIMO CUE')
  :t('SUGGESTED CUE · MANUAL GO','CUE SUGERIDO · GO MANUAL');
 $('rqLivePrivacy').textContent=t(
  'Only completed turns are considered. Automatic playback requires explicit arming in Rehearsal; never active in Operation.',
  'Solo se consideran frases finalizadas. La reproducción automática requiere armado explícito en Ensayo; nunca funciona en Directo.'
 );
 display();
}
function ready(){
 listening=true;
 const show=currentShow();
 fingerprint=key(show);
 scenario=makeProjectVoiceScenario(show,{maxCues:200});
 disarm('session started');
 log(scenario?t('Loaded cue triggers: ','Pies de voz disponibles: ')+scenario.cues.length:
  t('No valid spoken cue triggers configured','No hay pies hablados configurados'));
 display();
}
async function finalTurn(detail){
 if(!armed||!listening||busy)return;
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
  if(['AMBIGUOUS','SEEK_TOO_SHORT','LOW_CONFIDENCE'].includes(a.reason)){
   log(t('Skipped uncertain phrase: ','Frase dudosa ignorada: ')+a.reason);
  }
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
 log(message);
 document.dispatchEvent(new CustomEvent('runq:voice-follow-highlight-line',{
  detail:{lineId:a.lineId},
 }));
}
function mount(){
 if(!$('rqLiveMode'))return;
 $('rqLiveArm').addEventListener('click',()=>void arm());
 $('rqLiveMode').addEventListener('change',()=>{
  disarm('mode changed');localized();
 });
 document.addEventListener('runq:voice-live-ready',ready);
 document.addEventListener('runq:voice-live-stopping',()=>{listening=false;disarm('microphone stopped');});
 document.addEventListener('runq:rehearsal-auto-disarm',event=>disarm(event.detail?.reason??'operator'));
 document.addEventListener('runq:voice-live-final',event=>{
  if(!armed)return;
  event.detail.handled=true; // No secondary MANUAL suggestion pipeline in auto mode.
  void finalTurn(event.detail);
 });
 $('rqLiveFocus').addEventListener('change',()=>disarm('focus changed'));
 $('uiLocaleSelect')?.addEventListener('change',localized);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)disarm('tab hidden');});
 const shell=document.querySelector('.shell');
 if(shell)new MutationObserver(()=>{
  if(shell.dataset.activeWorkspace!=='rehearsal')disarm('left rehearsal');
 }).observe(shell,{attributes:true,attributeFilter:['data-active-workspace']});
 localized();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
