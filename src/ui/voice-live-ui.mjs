/**
 * Live rehearsal listening. Browser capture is local; authorized PCM frames go
 * to the loopback server, which owns the Meta session and secret.
 * Final transcripts suggest cue candidates; neither this file nor the API can GO.
 */
import {suggestVoiceCue} from '../core/voiceFollow.mjs';
import {makeLivePcmEncoder} from '../core/livePcm.mjs';
import {makeProjectVoiceScenario} from '../core/voiceScenario.mjs';

const $=id=>document.getElementById(id);
const local=(en,es)=>$('uiLocaleSelect')?.value==='es'?es:en;
const API='/api/voice/live/';
let session=null,stream=null,context=null,source=null,processor=null,silence=null;
let polling=null,stopping=false,starting=false,active=false,queue=Promise.resolve();
let transcriptHistory=[],consumedIds=new Set(),focusLine=1;
let pcmEncoder=null,queuedFrames=0;
let scenario=null,showFingerprint='',startedAt=0;
let suggestedCueId=null;
const CHUNK_SAMPLES=2560,MAX_SECONDS=180;
function report(en,es){$('rqLiveStatus').textContent=local(en,es);}
function safeResponse(res){return res.json().then(data=>{if(!res.ok)throw Error(data.error||'HTTP '+res.status);return data;});}
async function endpoint(action,{method='GET',body,contentType,token=session}={}){
 const headers={...(token?{'X-RunQ-Voice-Session':token}:{}),...(contentType?{'Content-Type':contentType}:{})};
 const response=await fetch(API+action,{method,headers,body,cache:'no-store'});
 return safeResponse(response);
}
function inspectShow(){
 let show=null;
 document.dispatchEvent(new CustomEvent('runq:voice-follow-read-project',{detail:{respond:data=>{show=data;}}}));
 return show;
}
function refreshShow(){
 const show=inspectShow();
 scenario=makeProjectVoiceScenario(show,{maxCues:50});
 showFingerprint=JSON.stringify({script:show?.scriptText,cues:show?.cues});
 const value=Number($('rqLiveFocus').value);
 focusLine=Number.isInteger(value)&&value>0?value:(scenario?.initialFocusLine??1);
 $('rqLiveFocus').value=String(focusLine);
 consumedIds.clear();
 suggestedCueId=null;
 $('rqLivePrepare').disabled=true;$('rqLiveDismiss').disabled=true;
 $('rqLiveCue').textContent=scenario
  ?local('Ready to follow '+scenario.cues.length+' configured spoken cues.',
    'Preparado para seguir '+scenario.cues.length+' pies hablados configurados.')
  :local('No matching cue triggers configured; transcription will still work.',
    'Sin pies hablados configurados; la transcripción seguirá funcionando.');
}
function currentMatches(text){
 if(!scenario||!text)return null;
 const live=inspectShow(),identity=JSON.stringify({script:live?.scriptText,cues:live?.cues});
 if(identity!==showFingerprint){
  report('Show changed. Stop listening and restart.','El espectáculo ha cambiado. Detén la escucha y reinicia.');
  return null;
 }
 try{return suggestVoiceCue({
  cues:scenario.cues,transcript:{text,final:true,endMs:Date.now()},
  focusLine,consumedIds:[...consumedIds],nowMs:Date.now(),maxLookahead:25,
 });}catch{return null;}
}
function presentFinal(text,turnId){
 if(!text?.trim())return;
 const last=transcriptHistory.at(-1);
 if(last?.turnId===turnId&&last?.text===text)return;
 transcriptHistory.push({text,turnId});
 transcriptHistory=transcriptHistory.slice(-12);
 $('rqLiveTranscript').replaceChildren();
 for(const value of transcriptHistory.slice(-4)){
  const line=document.createElement('p');line.textContent=value.text;
  $('rqLiveTranscript').append(line);
 }
 $('rqLivePartial').textContent='';
 const result=currentMatches(text);
 if(result?.status==='SUGGEST_PREPARE'){
  suggestedCueId=result.cueId;
  $('rqLivePrepare').disabled=false;$('rqLiveDismiss').disabled=false;
  consumedIds.add(result.cueId);
  focusLine=Number(result.lineId.slice(1));
  $('rqLiveFocus').value=String(focusLine);
  const cue=scenario.cues.find(item=>item.id===result.cueId);
  $('rqLiveCue').textContent=local('Suggested (GO remains manual): ','Sugerido (GO sigue manual): ')+
    String(cue?.number??cue?.id)+' · '+String(cue?.label||cue?.trigger||'')+
    ' · '+result.lineId+' · '+Math.round(result.score*100)+'%';
  document.dispatchEvent(new CustomEvent('runq:voice-follow-highlight-line',{detail:{lineId:result.lineId}}));
 }else{
  suggestedCueId=null;
  $('rqLivePrepare').disabled=true;$('rqLiveDismiss').disabled=true;
  $('rqLiveCue').textContent=result?.status==='AMBIGUOUS'
   ?local('Ambiguous cues: operator decision required.','Cues ambiguos: decide el operador.')
   :local('No confident match; operator remains in control.','Sin coincidencia fiable; el operador mantiene el control.');
 }
}
function acceptEvent(event){
 if(event.type==='transcript'&&typeof event.transcript==='string'){
  if(!event.final)$('rqLivePartial').textContent=event.transcript; // ENDPOINTING commits only on speechComplete.
 }else if(event.type==='speechComplete'&&typeof event.transcript==='string'){
  presentFinal(event.transcript,event.turnId);
 }else if(event.type==='speaker'){
  $('rqLiveSpeaker').textContent=local('Speaker: ','Hablante: ')+(event.label??'—');
 }else if(event.type==='sessionEnd'){
  void stop(false,event.reason);
 }
}
function teardownMic(){
 try{processor?.disconnect();source?.disconnect();silence?.disconnect();}catch{}
 stream?.getTracks().forEach(track=>track.stop());
 stream=null;source=null;processor=null;silence=null;
 if(context){const old=context;context=null;void old.close().catch(()=>{});}
 pcmEncoder=null;
}
function controls(){
 const busy=starting||active||stopping;
 $('rqLiveStart').disabled=busy;
 $('rqLiveStop').disabled=!busy||stopping;
 $('rqLiveLang').disabled=busy;
 $('rqLiveDevice').disabled=busy;
 $('rqLiveRefresh').disabled=busy;
 $('rqLiveConsent').disabled=busy;
 $('rqLiveFocus').disabled=busy;
 $('rqLiveMeter').value=active?$('rqLiveMeter').value:0;
}
async function devices(){
 if(!navigator.mediaDevices?.enumerateDevices)return;
 try{
  const list=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput');
  const select=$('rqLiveDevice'),old=select.value;
  select.replaceChildren(new Option(local('System default','Predeterminado del sistema'),''));
  list.forEach((d,i)=>select.add(new Option(d.label||local('Microphone ','Micrófono ')+(i+1),d.deviceId)));
  if([...select.options].some(x=>x.value===old))select.value=old;
 }catch{ /* Browser may hide device names until permission granted. */ }
}
/** Resamples each input sample with a persistent phase to prevent chunk gaps. */
function capture(event){
 const input=event.inputBuffer.getChannelData(0);
 let energy=0;for(let i=0;i<input.length;i++)energy+=input[i]*input[i];
 $('rqLiveMeter').value=Math.min(100,Math.round(Math.sqrt(energy/input.length)*350));
 for(const frame of pcmEncoder.push(input)){
  if(queuedFrames>=8){void stop(true,'audio_backpressure');break;}
  queuedFrames++;
  queue=queue.then(()=>active?endpoint('chunk',{
   method:'POST',body:frame,contentType:'application/octet-stream'
  }):null).catch(error=>{
   report('Audio transport stopped: '+error.message,'Transporte de audio detenido: '+error.message);
   void stop(true,'transport_error');
  }).finally(()=>{queuedFrames=Math.max(0,queuedFrames-1);});
 }
}
async function poll(){
 if(!session)return;
 try{
  const response=await endpoint('poll');
  response.events?.forEach(acceptEvent);
  $('rqLiveElapsed').textContent=String(response.audioSeconds??0)+' / '+MAX_SECONDS+' s';
  if(response.state==='stopped'&&!stopping)await stop(false,'provider_closed');
 }catch(error){
  report('Live status unavailable: '+error.message,'Estado de escucha no disponible: '+error.message);
  await stop(true,'status_error');
 }
}
async function start(){
 if(active||starting||stopping)return;
 if(!$('rqLiveConsent').checked){report('Authorize microphone streaming first.',
  'Autoriza primero el envío del micrófono.');return;}
 starting=true;controls();refreshShow();
 transcriptHistory=[];$('rqLiveTranscript').replaceChildren();$('rqLivePartial').textContent='';
 const lang=$('rqLiveLang').value;
 try{
  const device=$('rqLiveDevice').value;
  stream=await navigator.mediaDevices.getUserMedia({audio:{
   ...(device?{deviceId:{exact:device}}:{}),channelCount:1,
   echoCancellation:true,noiseSuppression:true,
  },video:false});
  await devices();
  const show=inspectShow();
  const keywords=$('rqLiveContextHints').checked
   ?(show?.cues||[]).flatMap(c=>String(c.label||'').split(/[^\p{L}\p{N}'-]+/u))
     .filter(x=>x.length>=3&&x.length<=32).slice(0,12)
   :[];
  const response=await fetch(API+'start',{
   method:'POST',
   headers:{'Content-Type':'application/json','X-RunQ-Voice-Consent':'yes'},
   body:JSON.stringify({language:lang,keywords}),
  });
  const payload=await safeResponse(response);
  session=payload.session;
  const AC=window.AudioContext||window.webkitAudioContext;
  context=new AC();await context.resume();
  source=context.createMediaStreamSource(stream);
  processor=context.createScriptProcessor(4096,1,1);
  silence=context.createGain();silence.gain.value=0;
  source.connect(processor);processor.connect(silence);silence.connect(context.destination);
  pcmEncoder=makeLivePcmEncoder(context.sampleRate);
  startedAt=performance.now();active=true;starting=false;
  processor.onaudioprocess=event=>{if(active)capture(event);};
  polling=setInterval(()=>void poll(),400);
  report('Listening with Muse. Stop at any time; maximum 3 minutes.',
    'Escuchando con Muse. Puedes detenerlo en cualquier momento; máximo 3 minutos.');
  controls();
 }catch(error){
  report('Live transcription could not start: '+error.message,
    'No se pudo iniciar la transcripción: '+error.message);
  starting=false;
  await stop(true,'startup_failed');
 }
}
async function stop(force=false,reason='manual'){
 if(stopping)return;
 if(!active&&!starting&&!session){teardownMic();controls();return;}
 stopping=true;active=false;teardownMic();
 if(polling!==null){clearInterval(polling);polling=null;}
 try{await queue;}catch{}
 if(session){
  try{
   if(!force)await endpoint('stop',{method:'POST'});
   // Keep collecting finalized utterances while the upstream flushes.
   if(!force){
    for(let i=0;i<15;i++){
     await new Promise(resolve=>setTimeout(resolve,400));
     const response=await endpoint('poll');
     response.events?.forEach(event=>{if(event.type!=='sessionEnd')acceptEvent(event);});
     if(response.state==='stopped')break;
    }
   }else await endpoint('stop',{method:'POST'});
  }catch{}
 }
 session=null;stopping=false;starting=false;queue=Promise.resolve();queuedFrames=0;
 $('rqLiveConsent').checked=false;
 report(reason==='manual'?'Session finished. No GO performed.':'Session ended safely: '+reason,
  reason==='manual'?'Sesión finalizada. Sin ejecutar GO.':'Sesión finalizada de forma segura: '+reason);
 controls();
}
function localized(){
 $('rqLiveTitle').textContent=local('LIVE VOICE FOLLOW · MUSE','SEGUIMIENTO DE VOZ EN DIRECTO · MUSE');
 $('rqLiveStart').textContent=local('Start listening','Empezar escucha');
 $('rqLiveStop').textContent=local('Stop listening','Detener escucha');
 $('rqLivePrepare').textContent=local('Set as NEXT','Preparar como NEXT');
 $('rqLiveDismiss').textContent=local('Ignore','Ignorar');
 $('rqLiveRefresh').textContent=local('Refresh microphones','Actualizar micrófonos');
 $('rqLiveLangLabel').textContent=local('Spoken language','Idioma hablado');
 $('rqLiveDeviceLabel').textContent=local('Input','Entrada');
 $('rqLiveContextHintsText').textContent=local('Optional: share up to 12 cue-name words to improve proper-name recognition.',
  'Opcional: compartir hasta 12 palabras de nombres de cues para mejorar su reconocimiento.');
 $('rqLiveConsentText').textContent=local('I authorize sending my microphone to Meta Muse for this session (max 3 min).',
  'Autorizo enviar mi micrófono a Meta Muse durante esta sesión (máximo 3 min).');
 $('rqLiveFocusLabel').textContent=local('Script focus line','Línea de referencia');
 $('rqLivePartialTitle').textContent=local('RECOGNIZING','RECONOCIENDO');
 $('rqLiveFinalTitle').textContent=local('FINAL TRANSCRIPT','TRANSCRIPCIÓN FINAL');
 $('rqLiveCueTitle').textContent=local('SUGGESTED CUE · MANUAL GO','CUE SUGERIDO · GO MANUAL');
 $('rqLivePrivacy').textContent=local('Only finalized speech can suggest cues. Partials never execute anything. No automatic GO.',
 'Solo las frases finalizadas sugieren cues. Los parciales no ejecutan nada. Sin GO automático.');
 $('rqLiveLang').options[0].textContent='Español';
 $('rqLiveLang').options[1].textContent='English';
 $('rqLiveLang').options[2].textContent=local('Spanish + English','Español + inglés');
}
function mount(){
 if(!$('rqLivePanel'))return;
 $('rqLiveStart').addEventListener('click',()=>void start());
 $('rqLiveStop').addEventListener('click',()=>void stop());
 $('rqLiveRefresh').addEventListener('click',()=>void devices());
 $('rqLivePrepare').addEventListener('click',()=>{
  if(!suggestedCueId)return;
  let ok=false;
  document.dispatchEvent(new CustomEvent('runq:voice-follow-prepare-cue',{
   detail:{cueId:suggestedCueId,respond:answer=>{ok=answer===true;}}
  }));
  if(ok){
   $('rqLivePrepare').disabled=true;
   $('rqLiveCue').textContent+=local(' · Prepared by operator. GO still manual.',
     ' · Preparado por el operador. GO sigue manual.');
  }else report('Cue could not be prepared. Check the current show.',
    'No se ha podido preparar el cue. Comprueba el espectáculo.');
 });
 $('rqLiveDismiss').addEventListener('click',()=>{
  suggestedCueId=null;
  $('rqLivePrepare').disabled=true;$('rqLiveDismiss').disabled=true;
  $('rqLiveCue').textContent=local('Ignored by operator.','Ignorado por el operador.');
 });
 $('rqLiveFocus').addEventListener('change',()=>{
  const value=Number($('rqLiveFocus').value);
  if(Number.isInteger(value)&&value>=1&&value<=100000){focusLine=value;consumedIds.clear();}
 });
 $('uiLocaleSelect')?.addEventListener('change',()=>{localized();void devices();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)void stop();});
 window.addEventListener('pagehide',()=>{if(active)void stop(true,'navigation');});
 const shell=document.querySelector('.shell');
 if(shell)new MutationObserver(()=>{
  if(shell.dataset.activeWorkspace!=='rehearsal'&&active)void stop();
 }).observe(shell,{attributes:true,attributeFilter:['data-active-workspace']});
 localized();refreshShow();void devices();controls();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
