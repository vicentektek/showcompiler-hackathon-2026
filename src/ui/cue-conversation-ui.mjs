/**
 * Contextual conversational Cue Editor. One selected cue only, one draft,
 * explicit approval and reversible commit. Sending or transcribing explicitly
 * starts one bounded request. No GO or playback transport in this module.
 */
import {stageCueConversationChange,parseLocalCueChat,validateCueChatModelReply,buildCueChatContext}
 from '../core/cueConversation.mjs';
import {userFacingError} from './userFacingErrors.mjs';
import {createCommandDictation,commandDictationMessage} from './command-dictation.mjs';
const $=id=>document.getElementById(id);
const es=()=>$('uiLocaleSelect')?.value==='es';
const t=(esText,enText)=>es()?esText:enText;
let pending=null,shownCueId=null,history=[],processing=false,undoAvailable=false,lastField=null;
let dictation=null,dictationContext=null,requestEpoch=0,requestController=null,requestBase=null;
let shownProjectId=null,shownGeneration=null;
function context(){
 let data=null;
 document.dispatchEvent(new CustomEvent('runq:cue-chat-context',{
  detail:{respond:value=>{data=value;}}
 }));
 return data;
}
function fingerprint(show){return JSON.stringify(show);}
function contextKey(){
 const current=context();
 return current?.canApply&&current.cueId&&!['rehearsal','operation'].includes(current.workspace)
  ?JSON.stringify([current.project,current.generation,current.cueId,current.workspace]):null;
}
function cancelPending(reason='cancelled'){
 dictation?.cancel(reason);
 if(!processing)return;
 requestEpoch++;requestController?.abort();requestController=null;requestBase=null;
 processing=false;renderDraft();
 notify(t('Consulta cancelada. Los resultados tardíos se descartarán.',
  'Request cancelled. Late results will be discarded.'));
}
function syncDictation(){
 $('rqChatRecord').disabled=processing||['acquiring','transcribing'].includes(dictation.phase);
 $('rqChatTranscribe').disabled=processing||!dictation.canTranscribe;
 $('rqChatCancel').disabled=!processing&&!dictation.hasWork;
 localized();renderDraft();
}
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
 const busy=processing||Boolean(dictation?.busy);
 $('rqChatApply').disabled=busy||!pending?.diff?.length;
 $('rqChatDiscard').disabled=busy||!pending;
 $('rqChatUndo').disabled=busy||!undoAvailable;
 $('rqChatSubmit').disabled=busy;
 $('rqChatPrompt').disabled=busy;
 if($('rqChatCancel'))$('rqChatCancel').disabled=!processing&&!dictation?.hasWork;
 if(dictation){
  $('rqChatRecord').disabled=processing||['acquiring','transcribing'].includes(dictation.phase);
  $('rqChatTranscribe').disabled=processing||!dictation.canTranscribe;
 }
}
function syncCue(){
 const state=context();
 const key=contextKey();
 if((requestBase!==null&&requestBase!==key)||key===null)cancelPending('context_changed');
 if(dictation?.hasWork&&dictationContext!==key)dictation.cancel('context_changed');
 if(!state||!state.cueId||!state.project||state.workspace!=='cues'){
  $('rqChatContext').textContent=t('Selecciona un cue para editar','Select a cue to edit');
  if(shownCueId!==null){shownCueId=null;pending=null;history=[];lastField=null;}
  renderHistory();renderDraft();return null;
 }
 const cue=state.project.cues.find(c=>c.id===state.cueId);
 if(!cue)return null;
 if(shownCueId!==state.cueId||shownProjectId!==state.project.id||shownGeneration!==state.generation){
  pending=null;history=[];lastField=null;shownCueId=state.cueId;undoAvailable=false;
  shownProjectId=state.project.id;shownGeneration=state.generation;
  renderHistory();
 }
 const cueContext=buildCueChatContext(state.project,cue.id,state.workspace);
 $('rqChatContext').textContent=[
  cueContext.showName,String(cue.number).padStart(2,'0')+' · '+cue.label,
  cueContext.sceneHeading?.text,
 ].filter(Boolean).join(' · ');
 renderDraft();
 return {state,cue};
}
function setOpen(open){
 if(!open)cancelPending();
 $('rqCueChatPanel').hidden=!open;
 if(open){syncCue();$('rqChatPrompt').focus();}
}
async function submit(){
 if(processing||dictation?.busy)return;
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
 const epoch=++requestEpoch;requestBase=contextKey();requestController=new AbortController();
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
   const request={
    prompt:val,language:es()?'es':'en',
    cue:{id:cue.id,number:cue.number,label:cue.label,
      trigger:cue.trigger??'',notes:cue.notes??'',playback:cue.playback??{}},
    context:buildCueChatContext(state.project,cue.id,state.workspace),
    pendingChanges:Object.keys(prior).length?prior:null,lastField,
   };
   const response=await fetch('/api/cue-chat/interpret',{
    method:'POST',headers:{
     'Content-Type':'application/json','X-RunQ-Chat-Consent':'yes',
    },body:JSON.stringify(request),signal:requestController.signal,
   });
   const data=await response.json();
   if(epoch!==requestEpoch)return;
   if(!response.ok)throw Error(data.error||'HTTP_'+response.status);
   const reply=validateCueChatModelReply(data);
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
  if(epoch!==requestEpoch)return;
  if(!current||requestBase!==contextKey()||current.cueId!==cue.id||fingerprint(current.project)!==fingerprint(state.project))
   throw Error('STALE_CUE_OR_PROJECT');
  const staged=stageCueConversationChange(state.project,cue.id,changes);
  pending={base:fingerprint(state.project),cueId:cue.id,
   changes:staged.changes,diff:staged.diff};
  const keys=Object.keys(changes);
  lastField=keys.length?keys.at(-1):lastField;
  addMessage('assistant',replyMessage+(staged.diff.length?'':' · '+t('Sin cambios nuevos','No new changes')));
  $('rqChatPrompt').value='';
  notify(source==='LOCAL'?t('Propuesta lista para revisar','Suggestion ready for review'):
    t('Propuesta de Muse Spark · pendiente de aprobar','Muse Spark suggestion · review before applying'));
 }catch(error){
  if(epoch!==requestEpoch)return;
  const message=error?.message==='STALE_CUE_OR_PROJECT'
    ?t('Se modificó el cue o el espectáculo. Revisa antes de reintentar.',
      'The cue or show changed. Review before retrying.')
    :userFacingError(error,es()?'es':'en');
  notify(message,true);addMessage('assistant',message);
 }finally{
  if(epoch===requestEpoch){
   processing=false;requestController=null;requestBase=null;
   renderDraft();
  }
 }
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
 $('rqChatAiConsentText').textContent=t(
  'Enviar consulta Meta si hace falta, sin topes locales de presupuesto, con este cue, la escena, sus líneas vinculadas, hasta dos líneas cercanas, el estado y los títulos del audio asociado. No se envían archivos de audio ni se aplican cambios automáticamente.',
  'Send consults Meta when needed, without local budget caps, with this cue, its scene, linked lines, up to two nearby script lines, linked audio status and linked audio titles. No audio files are sent and no changes are applied automatically.');
 $('rqChatSubmit').textContent=t('Proponer cambios','Propose changes');
 $('rqChatApply').textContent=t('Aplicar cambios','Apply changes');
 $('rqChatDiscard').textContent=t('Descartar','Discard');
 $('rqChatUndo').textContent=t('Deshacer última aplicación','Undo last application');
 $('rqChatVoiceSummary').textContent=t('Dictado opcional · Muse Voice','Optional dictation · Muse Voice');
 $('rqChatVoiceConsentText').textContent=t('Transcribir envía esta grabación a Meta sin topes locales de presupuesto.',
  'Transcribe sends this recording to Meta without local budget caps.');
 $('rqChatRecord').textContent=dictation?.phase==='recording'?t('Detener grabación','Stop recording'):
  t('Grabar instrucción (10 s)','Record instruction (10 s)');
 $('rqChatTranscribe').textContent=t('Transcribir grabación','Transcribe recording');
 $('rqChatCancel').textContent=t('Cancelar pendiente','Cancel pending');
 if(!history.length)renderHistory();
 if(pending)renderDraft();
}
function mount(){
 if(!$('rqCueChatPanel'))return;
 dictation=createCommandDictation({
  owner:'cue-chat',contextKey,
  onTranscript:text=>{$('rqChatPrompt').value=text.slice(0,1200);$('rqChatPrompt').focus();},
  onStatus:(code,error)=>{
   $('rqChatVoiceStatus').textContent=commandDictationMessage(code,es()?'es':'en');
   $('rqChatVoiceStatus').classList.toggle('is-error',error);
  },onChange:syncDictation,
 });
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
 $('rqChatRecord').addEventListener('click',()=>{
  dictationContext=contextKey();void dictation.record();
 });
 $('rqChatTranscribe').addEventListener('click',()=>void dictation.transcribe(
  true,es()?'es':'en'));
 $('rqChatCancel').addEventListener('click',()=>cancelPending());
 document.addEventListener('runq:cue-chat-open',()=>setOpen(true));
 document.addEventListener('runq:cue-chat-selection',()=>{
  if(!$('rqCueChatPanel').hidden)syncCue();
 });
 $('uiLocaleSelect')?.addEventListener('change',localized);
 document.addEventListener('runq:show-state-changed',()=>syncCue());
 document.addEventListener('runq:operator-stop-all',()=>cancelPending());
 window.addEventListener('pagehide',()=>cancelPending());
 localized();renderHistory();renderDraft();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
