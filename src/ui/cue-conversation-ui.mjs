/**
 * Contextual conversational Cue Editor. One selected cue only, one draft,
 * explicit approval and reversible commit. Remote AI and dictation require
 * separate, one-shot consents. No GO or playback transport in this module.
 */
import {stageCueConversationChange,parseLocalCueChat,validateCueChatModelReply}
 from '../core/cueConversation.mjs';
const $=id=>document.getElementById(id);
const es=()=>$('uiLocaleSelect')?.value==='es';
const t=(esText,enText)=>es()?esText:enText;
let pending=null,shownCueId=null,history=[],processing=false,undoAvailable=false,lastField=null;
let recorder=null,audioTake=null;
function context(){
 let data=null;
 document.dispatchEvent(new CustomEvent('runq:cue-chat-context',{
  detail:{respond:value=>{data=value;}}
 }));
 return data;
}
function fingerprint(show){return JSON.stringify(show);}
function notify(message,isError=false){
 const out=$('rqChatStatus');out.textContent=message;
 out.classList.toggle('is-error',isError);
}
function addMessage(role,text){
 history.push({role,text:String(text).slice(0,1500)});
 if(history.length>24)history=history.slice(-24);
 renderHistory();
}
function renderHistory(){
 const box=$('rqChatHistory');box.replaceChildren();
 if(!history.length){
  const empty=document.createElement('p');empty.className='rq-chat-empty';
  empty.textContent=t('Describe un cambio, revisa la propuesta y aplícala cuando estés conforme.',
    'Describe a change, review the proposal, then apply when ready.');
  box.append(empty);return;
 }
 for(const entry of history){
  const card=document.createElement('div');card.className='rq-chat-message '+entry.role;
  const label=document.createElement('small');
  label.textContent=entry.role==='operator'?t('TÚ','YOU'):t('RUNQ · PROPUESTA','RUNQ · PROPOSAL');
  const text=document.createElement('p');text.textContent=entry.text;
  card.append(label,text);box.append(card);
 }
 box.scrollTop=box.scrollHeight;
}
const names={
 gainDb:['Volumen','Gain'],fadeInMs:['Fundido de entrada','Fade in'],
 fadeOutMs:['Fundido de salida','Fade out'],startDelayMs:['Retardo','Start delay'],
 startAtMs:['Punto IN','IN point'],endAtMs:['Punto OUT','OUT point'],
 playbackRate:['Velocidad','Playback speed'],pan:['Panorama','Pan'],
 loop:['Bucle','Loop'],repeatCount:['Repeticiones','Repetitions'],
 label:['Nombre','Label'],trigger:['Pie hablado','Spoken trigger'],
 notes:['Notas','Notes'],
};
function format(field,value){
 if(value===null)return '—';
 if(typeof value==='boolean')return t(value?'Sí':'No',value?'Yes':'No');
 if(['fadeInMs','fadeOutMs','startDelayMs','startAtMs','endAtMs'].includes(field))
  return (value/1000).toLocaleString(es()?'es-ES':'en-US',{maximumFractionDigits:3})+' s';
 if(field==='gainDb')return value+' dB';
 if(field==='pan'||field==='playbackRate')return String(value);
 return String(value);
}
function renderDraft(){
 const box=$('rqChatProposal');box.hidden=!pending;
 const diff=$('rqChatDiff');diff.replaceChildren();
 if(pending){
  for(const row of pending.diff){
   const div=document.createElement('div');div.className='rq-chat-change';
   const name=document.createElement('strong');name.textContent=names[row.field]?.[es()?0:1]??row.field;
   const before=document.createElement('span');before.className='before';before.textContent=format(row.field,row.from);
   const arrow=document.createElement('span');arrow.className='arrow';arrow.textContent='→';
   const after=document.createElement('span');after.className='after';after.textContent=format(row.field,row.to);
   div.append(name,before,arrow,after);diff.append(div);
  }
  if(!pending.diff.length){
   const text=document.createElement('p');text.textContent=t('Sin cambios respecto al cue actual','No changes from current cue');diff.append(text);
  }
 }
 $('rqChatApply').disabled=processing||!pending?.diff?.length;
 $('rqChatDiscard').disabled=processing||!pending;
 $('rqChatUndo').disabled=processing||!undoAvailable;
 $('rqChatSubmit').disabled=processing;
 $('rqChatPrompt').disabled=processing;
}
function syncCue(){
 const state=context();
 if(!state||!state.cueId||!state.project){
  $('rqChatContext').textContent=t('Selecciona un cue para editar','Select a cue to edit');
  if(shownCueId!==null){shownCueId=null;pending=null;history=[];lastField=null;}
  renderHistory();renderDraft();return null;
 }
 const cue=state.project.cues.find(c=>c.id===state.cueId);
 if(!cue)return null;
 if(shownCueId!==state.cueId){
  pending=null;history=[];lastField=null;shownCueId=state.cueId;undoAvailable=false;
  renderHistory();
 }
 $('rqChatContext').textContent=String(cue.number).padStart(2,'0')+' · '+cue.label;
 renderDraft();
 return {state,cue};
}
function setOpen(open){
 if(!open&&recorder?.stream)finishRecording();
 $('rqCueChatPanel').hidden=!open;
 if(open){syncCue();$('rqChatPrompt').focus();}
}
async function submit(){
 if(processing)return;
 const val=$('rqChatPrompt').value.trim();
 if(val.length<3){notify(t('Escribe una instrucción concreta','Write a specific instruction'),true);return;}
 const selected=syncCue();
 if(!selected){notify(t('Selecciona un cue','Select a cue'),true);return;}
 const {state,cue}=selected;
 if(!state.canApply){
  notify(t('Detén el audio y guarda primero las ediciones manuales.',
    'Stop audio and save manual edits first.'),true);return;
 }
 if(pending&&pending.base!==fingerprint(state.project)){
  pending=null;renderDraft();notify(t('El espectáculo cambió. Vuelve a generar la propuesta.',
    'Show changed. Create a new proposal.'),true);return;
 }
 addMessage('operator',val);processing=true;renderDraft();
 const prior=pending?.changes??{};
 try{
  let changes=parseLocalCueChat(val,{lastField});
  let source='LOCAL';
  let replyMessage=t('Cambios interpretados localmente. Puedes corregirlos antes de aplicar.',
    'Changes parsed locally. You can revise them before applying.');
  if(changes){
   changes={...prior,...changes};
  }else{
   if(!$('rqChatAiConsent').checked)throw Error('AI_CONSENT_REQUIRED');
   const request={
    prompt:val,language:es()?'es':'en',
    cue:{id:cue.id,number:cue.number,label:cue.label,
      trigger:cue.trigger??'',notes:cue.notes??'',playback:cue.playback??{}},
    pendingChanges:Object.keys(prior).length?prior:null,lastField,
   };
   const response=await fetch('/api/cue-chat/interpret',{
    method:'POST',headers:{
     'Content-Type':'application/json','X-RunQ-Chat-Consent':'yes',
    },body:JSON.stringify(request),
   });
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'HTTP_'+response.status);
   const reply=validateCueChatModelReply(data);
   $('rqChatAiConsent').checked=false;
   if(reply.status!=='PATCH'){
    addMessage('assistant',reply.message||t('Necesito una aclaración','Clarification needed'));
    notify(reply.status==='CLARIFY'
      ?t('Aclara tu instrucción y vuelve a enviar.','Clarify the instruction and resubmit.')
      :t('Esa acción aún no está disponible.','That edit is not yet supported.'),true);
    return;
   }
   changes=reply.changes;source='META';
   replyMessage=reply.message||t('Propuesta de Meta preparada','Meta proposal ready');
  }
  // Detect intervening manual edits or a change in selected cue after await.
  const current=context();
  if(!current||current.cueId!==cue.id||fingerprint(current.project)!==fingerprint(state.project))
   throw Error('STALE_CUE_OR_PROJECT');
  const staged=stageCueConversationChange(state.project,cue.id,changes);
  pending={base:fingerprint(state.project),cueId:cue.id,
   changes:staged.changes,diff:staged.diff};
  const keys=Object.keys(changes);
  lastField=keys.length?keys.at(-1):lastField;
  addMessage('assistant',replyMessage+(staged.diff.length?'':' · '+t('Sin cambios nuevos','No new changes')));
  $('rqChatPrompt').value='';
  notify(source==='LOCAL'?t('Vista previa local · sin costes','Local preview · no provider costs'):
    t('Propuesta de Muse Spark · pendiente de aprobar','Muse Spark proposal · awaiting approval'));
 }catch(error){
  const message=error?.message==='AI_CONSENT_REQUIRED'
   ?t('Marca la autorización a Meta para interpretar esta instrucción compleja.',
     'Enable Meta consent to interpret this complex instruction.')
   :error?.message==='STALE_CUE_OR_PROJECT'
    ?t('Se modificó el cue o el espectáculo. Revisa antes de reintentar.',
      'The cue or show changed. Review before retrying.')
    :t('No se ha podido interpretar o validar: ','Could not interpret/validate: ')+String(error.message).slice(0,100);
  notify(message,true);addMessage('assistant',message);
 }finally{processing=false;renderDraft();}
}
function apply(){
 if(processing||!pending)return;
 const current=context();
 if(!current||current.cueId!==pending.cueId||fingerprint(current.project)!==pending.base){
  notify(t('El espectáculo ha cambiado; descarta y vuelve a proponer.',
    'The show changed; discard and propose again.'),true);return;
 }
 let answer=null;
 document.dispatchEvent(new CustomEvent('runq:cue-chat-apply',{
  detail:{cueId:pending.cueId,base:pending.base,changes:pending.changes,
   respond:result=>{answer=result;}},
 }));
 if(answer?.ok){
  addMessage('assistant',t('Cambios aplicados al cue. Puedes deshacer esta operación.',
   'Changes applied to the cue. You can undo this operation.'));
  pending=null;undoAvailable=true;renderDraft();
  notify(t('Aplicado · el GO no se ha ejecutado','Applied · no GO performed'));
  syncCue();
  undoAvailable=true;renderDraft();
 }else notify(t('No se pudo aplicar: ','Could not apply: ')+(answer?.error??'UNKNOWN'),true);
}
function undo(){
 let answer=null;
 document.dispatchEvent(new CustomEvent('runq:cue-chat-undo',{detail:{respond:x=>{answer=x;}}}));
 if(answer?.ok){
  addMessage('assistant',t('Última modificación deshecha.','Last change undone.'));
  pending=null;undoAvailable=false;syncCue();renderDraft();
  notify(t('Deshecho · sin ejecutar audio','Undone · no audio performed'));
 }else notify(t('No se puede deshacer: ','Undo unavailable: ')+(answer?.error??'UNKNOWN'),true);
}
function localized(){
 $('rqChatTitle').textContent=t('Editar cue conversando','Conversational cue editor');
 $('rqChatProposalTitle').textContent=t('Cambios propuestos · sin aplicar','Proposed changes · not applied');
 $('rqChatPromptLabel').textContent=t('¿Qué quieres cambiar?','What would you like to change?');
 $('rqChatPrompt').placeholder=t('Ej.: Baja el volumen a −9 dB y pon un fade in de 3 segundos.',
  'E.g. Set gain to -9 dB and a 3-second fade in.');
 $('rqChatAiConsentText').textContent=t('Autorizar una consulta a Meta si hace falta IA',
  'Authorize one Meta request if AI interpretation is needed');
 $('rqChatSubmit').textContent=t('Proponer cambios','Propose changes');
 $('rqChatApply').textContent=t('Aplicar cambios','Apply changes');
 $('rqChatDiscard').textContent=t('Descartar','Discard');
 $('rqChatUndo').textContent=t('Deshacer última aplicación','Undo last application');
 $('rqChatVoiceSummary').textContent=t('Dictado opcional · Muse Voice','Optional dictation · Muse Voice');
 $('rqChatVoiceConsentText').textContent=t('Autorizo enviar esta grabación a Meta para transcribirla',
  'I authorize this recording to be sent to Meta for transcription');
 $('rqChatRecord').textContent=recorder?.stream?t('Detener grabación','Stop recording'):
  t('Grabar instrucción (10 s)','Record instruction (10 s)');
 $('rqChatTranscribe').textContent=t('Transcribir grabación','Transcribe recording');
 if(!history.length)renderHistory();
 if(pending)renderDraft();
}
function makeWave(samples,rate){
 const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
 function ascii(offset,str){for(let i=0;i<str.length;i++)view.setUint8(offset+i,str.charCodeAt(i));}
 ascii(0,'RIFF');view.setUint32(4,36+samples.length*2,true);ascii(8,'WAVEfmt ',12);
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);
 view.setUint16(32,2,true);view.setUint16(34,16,true);
 ascii(36,'data');view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){
  const n=Math.min(1,Math.max(-1,samples[i]));
  view.setInt16(44+i*2,Math.round(n<0?n*32768:n*32767),true);
 }
 return new Blob([buffer],{type:'audio/wav'});
}
function finishRecording(){
 if(!recorder)return;
 const {stream,processor,source,gain,ctx,frames,size,rate}=recorder;
 recorder=null;
 try{processor.disconnect();source.disconnect();gain.disconnect();}catch{}
 stream.getTracks().forEach(track=>track.stop());
 void ctx.close().catch(()=>{});
 if(document.body?.dataset.runqVoiceCapture==='cue-chat')delete document.body.dataset.runqVoiceCapture;
 const samples=new Float32Array(size);let start=0;
 for(const frame of frames){samples.set(frame,start);start+=frame.length;}
 audioTake=size>=rate*.2?makeWave(samples,rate):null;
 $('rqChatTranscribe').disabled=!audioTake;
 $('rqChatVoiceStatus').textContent=audioTake
  ?t('Grabación lista. Autoriza y pulsa Transcribir.','Recording ready. Consent and press Transcribe.')
  :t('No se capturó suficiente voz.','Not enough speech was captured.');
 localized();
}
async function record(){
 if(recorder){finishRecording();return;}
 if(processing)return;
 if(document.body?.dataset.runqVoiceCapture){
  $('rqChatVoiceStatus').textContent=t('Otro micrófono está activo. Deténlo primero.',
   'Another microphone is active. Stop it first.');return;
 }
 if(!navigator.mediaDevices?.getUserMedia)return;
 document.body.dataset.runqVoiceCapture='cue-chat';
 let acquiringStream=null;
 try{
  const stream=await navigator.mediaDevices.getUserMedia({
   audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false,
  });
  acquiringStream=stream;
  const Ctx=window.AudioContext||window.webkitAudioContext;
  const ctx=new Ctx();await ctx.resume();
  const source=ctx.createMediaStreamSource(stream),processor=ctx.createScriptProcessor(2048,1,1);
  const gain=ctx.createGain();gain.gain.value=0;
  source.connect(processor);processor.connect(gain);gain.connect(ctx.destination);
  recorder={stream,ctx,source,processor,gain,frames:[],size:0,rate:ctx.sampleRate};
  audioTake=null;$('rqChatTranscribe').disabled=true;
  const live=recorder;
  processor.onaudioprocess=event=>{
   if(recorder!==live)return;
   const samples=event.inputBuffer.getChannelData(0);
   if(live.size+samples.length<=live.rate*10.1){
    live.frames.push(new Float32Array(samples));live.size+=samples.length;
   }
   if(live.size>=live.rate*10)finishRecording();
  };
  $('rqChatVoiceStatus').textContent=t('Grabando… di la instrucción y detén la grabación.',
   'Recording… say the instruction, then stop.');
  localized();
 }catch{
  acquiringStream?.getTracks().forEach(track=>track.stop());
  if(document.body?.dataset.runqVoiceCapture==='cue-chat')delete document.body.dataset.runqVoiceCapture;
  $('rqChatVoiceStatus').textContent=t('No se pudo acceder al micrófono','Microphone unavailable');
 }
}
async function transcribe(){
 if(!audioTake||processing)return;
 if(!$('rqChatVoiceConsent').checked){
  $('rqChatVoiceStatus').textContent=t('Autoriza primero este envío a Muse Voice.',
   'Authorize this individual Muse Voice upload first.');return;
 }
 processing=true;renderDraft();$('rqChatTranscribe').disabled=true;
 $('rqChatVoiceStatus').textContent=t('Transcribiendo…','Transcribing…');
 try{
  const response=await fetch('/api/voice/transcribe',{
   method:'POST',headers:{
    'Content-Type':'audio/wav','X-RunQ-Voice-Consent':'yes',
    'X-RunQ-Voice-Language':es()?'es':'en',
   },body:audioTake,
  });
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'HTTP_'+response.status);
  $('rqChatPrompt').value=String(data.transcript||'').slice(0,1200);
  $('rqChatVoiceStatus').textContent=t('Texto reconocido; revísalo y pulsa Proponer cambios.',
   'Speech recognized; review and click Propose changes.');
  $('rqChatPrompt').focus();
 }catch(error){
  $('rqChatVoiceStatus').textContent=t('Error al transcribir: ','Transcription failed: ')+error.message;
 }finally{
  processing=false;audioTake=null;$('rqChatVoiceConsent').checked=false;
  $('rqChatTranscribe').disabled=true;renderDraft();
 }
}
function mount(){
 if(!$('rqCueChatPanel'))return;
 $('rqChatClose').addEventListener('click',()=>setOpen(false));
 $('rqChatSubmit').addEventListener('click',()=>void submit());
 $('rqChatPrompt').addEventListener('keydown',event=>{
  if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void submit();}
 });
 $('rqChatApply').addEventListener('click',apply);
 $('rqChatDiscard').addEventListener('click',()=>{
  pending=null;renderDraft();
  addMessage('assistant',t('Propuesta descartada.','Proposal discarded.'));
  notify(t('No se ha modificado ningún cue.','No cue was modified.'));
 });
 $('rqChatUndo').addEventListener('click',undo);
 $('rqChatRecord').addEventListener('click',()=>void record());
 $('rqChatTranscribe').addEventListener('click',()=>void transcribe());
 document.addEventListener('runq:cue-chat-open',()=>setOpen(true));
 document.addEventListener('runq:cue-chat-selection',()=>{
  if(!$('rqCueChatPanel').hidden)syncCue();
 });
 $('uiLocaleSelect')?.addEventListener('change',localized);
 window.addEventListener('pagehide',()=>{if(recorder)finishRecording();});
 localized();renderHistory();renderDraft();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
