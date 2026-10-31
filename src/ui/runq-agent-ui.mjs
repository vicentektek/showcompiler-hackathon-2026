/**
 * RUNQ AI Agent Studio drawer. A plan is never applied by a provider response.
 * Model consultations use explicit one-shot permission and are never retried.
 */
import {buildAgentContext,prepareAgentPlan,fitAgentContext} from '../core/agentCore.mjs';
import {humanizeAgentError,humanNeedsAiReply,formatHumanReply} from '../core/agentFallback.mjs';
import {resolveAgentDialogue,boundedAgentConversation} from '../core/agentDialogue.mjs';
import {classifyVoiceEditText,nextVoiceEditState,appendVoiceEditHistory} from '../core/voiceEditCommand.mjs';
import {encodeWavPcm16} from '../core/wavEncode.mjs';
const $=id=>document.getElementById(id);
const es=()=>$('uiLocaleSelect')?.value==='es';
const lang=(esText,enText)=>es()?esText:enText;
const make=(tag,cls='',text='')=>{
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(text)el.textContent=text;
 return el;
};
let proposed=null,working=false,history=[],lastPrompt='';
let sessionProjectId=null;
let selectedBatch=null;
// Voice edit state is local to this drawer: it never touches GO/STOP, foot-cue following or Autopilot.
let voiceState='idle',voiceOrigin=false,voiceTake=null,voiceRec=null,voiceHistory=[],voiceBusy=false;
const VOICE_MAX_SECONDS=10;
function voiceStatus(text){const el=$('rqAgentVoiceStatus');if(el)el.textContent=text;}
function voiceTransition(event){
 voiceState=nextVoiceEditState(voiceState,event);
 const root=$('rqAgentVoice');if(root)root.dataset.state=voiceState;
 const rec=$('rqAgentVoiceRecord');
 if(rec){
  rec.setAttribute('aria-pressed',String(voiceState==='recording'));
  rec.textContent=voiceState==='recording'?lang('Suelta para parar','Release to stop'):lang('Mantén para hablar','Hold to talk');
 }
 const tr=$('rqAgentVoiceTranscribe');if(tr)tr.disabled=!(voiceTake&&voiceState==='recorded')||voiceBusy;
}
function renderVoiceHistory(){
 const list=$('rqAgentVoiceHistory');if(!list)return;
 list.replaceChildren();
 for(const item of voiceHistory.slice().reverse()){
  list.append(make('li','',item.source+' · '+item.outcome+' · '+(item.code||item.status)+' · '+item.transcript));
 }
}
function recordVoiceOutcome(entry){
 voiceHistory=appendVoiceEditHistory(voiceHistory,{at:Date.now(),...entry});
 renderVoiceHistory();
}
function setVoiceOutcome(outcome){
 const last=voiceHistory.at(-1);
 if(last&&last.status==='PLAN'&&last.outcome==='PROPOSED'){
  voiceHistory=[...voiceHistory.slice(0,-1),{...last,outcome}];renderVoiceHistory();
 }
}
function stopVoiceCapture(){
 const rec=voiceRec;if(!rec)return;
 voiceRec=null;
 try{rec.processor.disconnect();rec.source.disconnect();rec.gain.disconnect();}catch{}
 rec.stream.getTracks().forEach(track=>track.stop());
 void rec.ctx.close().catch(()=>{});
 clearTimeout(rec.timer);
 if(document.body?.dataset.runqVoiceCapture==='agent-voice')delete document.body.dataset.runqVoiceCapture;
 const samples=new Float32Array(rec.size);let at=0;
 for(const frame of rec.frames){samples.set(frame,at);at+=frame.length;}
 voiceTake=rec.size>=rec.rate*.3?new Blob([encodeWavPcm16(samples,rec.rate)],{type:'audio/wav'}):null;
 voiceTransition(voiceTake?'stop':'fail');
 voiceStatus(voiceTake?lang('Grabación lista. Autoriza y pulsa Transcribir.','Recording ready. Authorize and press Transcribe.'):
  lang('No se capturó suficiente voz.','Not enough speech was captured.'));
}
async function startVoiceCapture(){
 if(voiceRec||voiceBusy||!['idle','recorded','review'].includes(voiceState))return;
 const s=state();
 if(!s||['operation','rehearsal'].includes(s.workspace)){voiceStatus(lang('La voz de edición solo funciona en Studio.','Voice editing works in Studio only.'));return;}
 if(document.body?.dataset.runqVoiceCapture){
  voiceStatus(lang('Otro micrófono está activo. Deténlo primero.','Another microphone is active. Stop it first.'));return;
 }
 if(!navigator.mediaDevices?.getUserMedia){voiceStatus(lang('Micrófono no disponible.','Microphone unavailable.'));return;}
 document.body.dataset.runqVoiceCapture='agent-voice';
 let stream=null;
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
  const Ctx=window.AudioContext||window.webkitAudioContext,ctx=new Ctx();await ctx.resume();
  const source=ctx.createMediaStreamSource(stream),processor=ctx.createScriptProcessor(2048,1,1),gain=ctx.createGain();
  gain.gain.value=0;source.connect(processor);processor.connect(gain);gain.connect(ctx.destination);
  const rec={stream,ctx,source,processor,gain,frames:[],size:0,rate:ctx.sampleRate,timer:0};
  voiceRec=rec;voiceTake=null;voiceTransition('record');
  processor.onaudioprocess=event=>{
   if(voiceRec!==rec)return;
   const data=event.inputBuffer.getChannelData(0);
   if(rec.size+data.length<=rec.rate*(VOICE_MAX_SECONDS+.1)){rec.frames.push(new Float32Array(data));rec.size+=data.length;}
  };
  rec.timer=setTimeout(stopVoiceCapture,VOICE_MAX_SECONDS*1000);
  voiceStatus(lang('Grabando… suelta para parar.','Recording… release to stop.'));
 }catch{
  stream?.getTracks().forEach(track=>track.stop());
  if(document.body?.dataset.runqVoiceCapture==='agent-voice')delete document.body.dataset.runqVoiceCapture;
  voiceStatus(lang('No se pudo acceder al micrófono.','Microphone unavailable or permission denied.'));
 }
}
async function transcribeVoice(){
 if(!voiceTake||voiceBusy||voiceState!=='recorded')return;
 if(!$('rqAgentVoiceConsent').checked){voiceStatus(lang('Autoriza primero este envío concreto.','Authorize this individual upload first.'));return;}
 voiceBusy=true;voiceTransition('transcribe');voiceStatus(lang('Transcribiendo…','Transcribing…'));
 try{
  const response=await fetch('/api/voice/transcribe',{method:'POST',headers:{
   'Content-Type':'audio/wav','X-RunQ-Voice-Consent':'yes','X-RunQ-Voice-Language':es()?'es':'en'},body:voiceTake});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'HTTP_'+response.status);
  // The transcript is a draft for human review; it is never sent anywhere automatically.
  $('rqAgentPrompt').value=String(data.transcript||'').slice(0,1600);
  voiceOrigin=true;voiceTake=null;voiceTransition('transcribed');
  voiceStatus(lang('Revisa y corrige el texto; después pulsa Proponer.','Review and correct the text, then press Plan.'));
  $('rqAgentPrompt').focus();
 }catch(error){
  voiceTransition('fail');
  voiceStatus(lang('Transcripción no disponible: ','Transcription unavailable: ')+String(error.message).slice(0,80));
 }finally{
  voiceBusy=false;$('rqAgentVoiceConsent').checked=false;voiceTransition('noop');
 }
}
function state(){
 let result=null;
 document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:value=>{result=value;}}}));
 return result;
}
function notify(text,error=false){
 const status=$('rqAgentStatus');
 if(status){status.textContent=text;status.classList.toggle('is-error',error);}
}
function addMessage(role,text){
 const box=$('rqAgentMessages');if(!box)return;
 history.push({role,text:String(text).slice(0,2400)});
 if(history.length>28)history=history.slice(-28);
 box.replaceChildren();
 for(const entry of history){
  const item=make('article','rq-agent-message '+entry.role);
  item.append(make('small','',entry.role==='user'?lang('TÚ','YOU'):'RUNQ AI'),
   make('p','',entry.text));
  box.append(item);
 }
 box.scrollTop=box.scrollHeight;
}
function showPlan(plan,baseProject=null,keepSelection=false){
 if(baseProject&&plan){
  selectedBatch={project:baseProject,operations:plan.operations,
   enabled:plan.operations.map(()=>true)};
 }else if(!keepSelection)selectedBatch=null;
 proposed=plan;
 const panel=$('rqAgentProposal'),list=$('rqAgentDiff'),selector=$('rqAgentOps');
 panel.hidden=!plan&&!selectedBatch;
 list.replaceChildren();selector.replaceChildren();
 if(selectedBatch){
  selectedBatch.operations.forEach((operation,index)=>{
   const li=make('li','rq-agent-op');
   const label=make('label','');
   const box=make('input','');box.type='checkbox';box.checked=selectedBatch.enabled[index];
   box.setAttribute('aria-label',lang('Incluir operación ','Include operation ')+(index+1));
   const cueId=operation.cueId??operation.afterCueId;
   const cue=selectedBatch.project.cues.find(c=>c.id===cueId);
   const summary=operation.op.replaceAll('_',' ').toLocaleLowerCase()+
    (cue?' · '+cue.number+' '+cue.label:operation.label?' · '+operation.label:'');
   label.append(box,make('span','',summary));
   box.addEventListener('change',()=>{
    const old=selectedBatch.enabled[index];selectedBatch.enabled[index]=box.checked;
    const picked=selectedBatch.operations.filter((_,i)=>selectedBatch.enabled[i]);
    if(!picked.length){showPlan(null,null,true);return;}
    try{showPlan(prepareAgentPlan(selectedBatch.project,picked),null,true);}
    catch(error){
     selectedBatch.enabled[index]=old;
     showPlan(proposed,null,true);
     notify(lang('Esta selección depende de otras operaciones: ',
       'This selection depends on other operations: ')+String(error.code??error.message),true);
    }
   });
   li.append(label);selector.append(li);
  });
 }
 $('rqAgentApply').disabled=!plan;
 if(!plan)return;
 // Every change in a proposed transaction must be reviewable, including
 // renumbering and indirect automation changes on other cues.
 for(const change of plan.changes){
  const item=make('li','rq-agent-diff-item');
  const summary=change.kind==='CREATED'?lang('Crear cue','Create cue')+' '+change.cueId:
   change.kind==='DELETED'?lang('Eliminar cue','Delete cue')+' '+change.cueId:
   lang('Modificar cue','Edit cue')+' '+change.cueId;
  item.append(make('strong','',summary));
  if(change.changes)for(const field of change.changes){
   const row=make('small','',field.field+': '+short(field.from)+' → '+short(field.to));
   item.append(row);
  }
  list.append(item);
 }
 if(plan.changes.length>75)list.prepend(make('li','rq-agent-diff-item',lang(
  'Este lote afecta a '+plan.changes.length+' cues. Revisa toda la lista desplazándote antes de aplicar.',
  'This batch affects '+plan.changes.length+' cues. Scroll through the entire preview before applying.')));
}
function short(value){
 if(value===null||value===undefined)return '—';
 const result=typeof value==='object'?JSON.stringify(value):String(value);
 return result.length>180?result.slice(0,177)+'…':result;
}
function renderAgentContext(s){
 const context=buildAgentContext(s.project,{
  focusLineId:s.project.cues.find(cue=>cue.id===s.selectedCueId)?.sourceLineIds[0]??null,
  assetAvailable:id=>assetReady(id,s),
 });
 $('rqAgentContext').setAttribute('aria-label',lang('Contexto actual del agente','Current agent context'));
 $('rqAgentContextTitle').textContent=lang('CONTEXTO DEL SHOW','SHOW CONTEXT');
 $('rqAgentContextBoundary').textContent=lang(
  'Lee texto, referencias y metadatos de audio; no envía los archivos de sonido. Propuestas pendientes de revisión: nunca ejecutan GO.',
  'Reads script text, references and audio metadata; audio files are not sent. Proposals require review and never execute GO.');
 const focusedCue=s.project.cues.find(cue=>cue.id===s.selectedCueId);
 const firstLine=context.lines[0]?.id,lastLine=context.lines.at(-1)?.id;
 const readyAssets=context.assets.filter(asset=>asset.available===true).length;
 $('rqAgentContextShow').textContent=s.project.name;
 $('rqAgentContextSummary').textContent=lang(
  `${context.lines.length}/${context.counts.scriptLines} líneas del guion · ${context.cues.length}/${context.counts.cues} cues · ${readyAssets}/${context.counts.assets} audios listos`,
  `${context.lines.length}/${context.counts.scriptLines} script lines · ${context.cues.length}/${context.counts.cues} cues · ${readyAssets}/${context.counts.assets} audio files ready`);
 $('rqAgentContextFocus').textContent=focusedCue
  ?lang(`Foco actual: cue ${String(focusedCue.number).padStart(2,'0')} · ${focusedCue.label} · ${focusedCue.sourceLineIds.join(', ')}`,
    `Current focus: cue ${String(focusedCue.number).padStart(2,'0')} · ${focusedCue.label} · ${focusedCue.sourceLineIds.join(', ')}`)
  :lang('Sin cue seleccionado · contexto desde el inicio del guion','No cue selected · context starts at the beginning of the script');
 const windowLabel=firstLine&&lastLine?`${firstLine}–${lastLine}`:lang('sin guion','no script');
 const limits=[];
 if(context.truncated.script)limits.push(lang('ventana de guion limitada','script window is limited'));
 if(context.truncated.cues)limits.push(lang('se limita a 80 cues','limited to 80 cues'));
 $('rqAgentContextWindow').textContent=lang(
  `Ventana de fuente: ${windowLabel}${limits.length?' · '+limits.join(' · '):''}`,
  `Source window: ${windowLabel}${limits.length?' · '+limits.join(' · '):''}`);
}
function translateAgentUi(){
 const setText=(id,esText,enText)=>{
  const element=$(id);if(element)element.textContent=lang(esText,enText);
 };
 setText('rqAgentHeaderTitle','RUNQ AI · Asistente global','RUNQ AI · Project agent');
 setText('rqAgentHeaderSubtitle','Solo Studio · Ningún GO automático','Studio only · No automatic GO');
 setText('rqAgentProposalTitle','Cambios propuestos · Sin aplicar','Proposed changes · Not applied');
 setText('rqAgentApply','Aplicar lote','Apply batch');
 setText('rqAgentDiscard','Descartar','Discard');
 setText('rqAgentPromptLabel','¿Qué quieres hacer en este espectáculo?','What would you like to change in this show?');
 setText('rqAgentProviderLabel','Proveedor para consulta opcional','Provider for optional request');
 setText('rqAgentConsentLabel','Autorizo una consulta externa al proveedor seleccionado con contexto acotado del proyecto (puede tener coste).',
  'I authorize one external request to the selected provider with bounded project context (may incur cost).');
 setText('rqAgentSubmit','Proponer localmente','Plan locally');
 setText('rqAgentAskAI','Consultar IA · 1 solicitud','Ask AI · 1 request');
 setText('rqAgentUndo','Deshacer lote','Undo batch');
 const drawer=$('rqAgentDrawer');
 drawer?.setAttribute('aria-label',lang('Agente RUNQ AI','RUNQ AI Agent'));
 $('rqAgentClose')?.setAttribute('aria-label',lang('Cerrar agente','Close agent'));
 const prompt=$('rqAgentPrompt');
 if(prompt)prompt.placeholder=lang('Ej.: elimina el cue 2; pon pies de voz; revisa el show...',
  'e.g. delete cue 2; assign spoken triggers; review the show...');
 const examples=[
  ['rqAgentExampleAudit','Revisar show','Audit show','Revisa el show','Audit the show'],
  ['rqAgentExampleVoice','Pies de voz','Voice triggers','Pon pies de voz coherentes a todos los cues','Assign spoken triggers to all cues'],
  ['rqAgentExampleEnding','Preparar cierre','Prepare ending','Añade tres cues para rematar el show','Add three cues to finish the show'],
  ['rqAgentExampleSummary','Resumen','Summary','Resumen del proyecto','Show summary'],
 ];
 for(const [id,esLabel,enLabel,esCommand,enCommand] of examples){
  const button=$(id);
  if(!button)continue;
  button.textContent=lang(esLabel,enLabel);
  button.dataset.command=lang(esCommand,enCommand);
 }
 for(const message of document.querySelectorAll('#rqAgentMessages .rq-agent-message')){
  const role=message.classList.contains('user')?'user':'assistant';
  const label=message.querySelector('small');
  if(label)label.textContent=role==='user'?lang('TÚ','YOU'):'RUNQ AI';
 }
 const welcomeEs='Puedo consultar el show, proponer cambios en varios cues, revisar errores y sugerir pies de voz con referencias del guion.';
 const welcomeEn='I can inspect the show, propose multi-cue edits, audit issues and suggest script-grounded spoken triggers. Review and approve each batch.';
 if(history.length===1&&history[0].role==='assistant'&&
   (history[0].text===welcomeEs||history[0].text===welcomeEn)){
  history[0].text=lang(welcomeEs,welcomeEn);
  const welcome=$('rqAgentMessages')?.querySelector('.rq-agent-message.assistant p');
  if(welcome)welcome.textContent=history[0].text;
 }
 const status=$('rqAgentStatus');
 if(status&&['Sin modificaciones pendientes.','No pending modifications.'].includes(status.textContent))
  status.textContent=lang('Sin modificaciones pendientes.','No pending modifications.');
}
function sync(){
 const s=state(),button=$('rqAgentToggle');
 if(!s||!button)return;
 translateAgentUi();
 renderAgentContext(s);
 if(sessionProjectId!==s.project.id){
  if(sessionProjectId!==null){
   history=[];showPlan(null);
   $('rqAgentMessages')?.replaceChildren();
   addMessage('assistant',lang('Nuevo espectáculo: conversación reiniciada.','New show: conversation reset.'));
  }
  sessionProjectId=s.project.id;
 }
 const blocked=['rehearsal','operation'].includes(s.workspace);
 button.hidden=blocked;
 const undoControl=$('rqAgentUndo');
 if(undoControl)undoControl.disabled=!s.undoAvailable||!s.canApply;
 if(blocked)close();
 if((proposed&&JSON.stringify(s.project)!==proposed.baseSnapshot)||
    (selectedBatch&&JSON.stringify(s.project)!==JSON.stringify(selectedBatch.project))){
  showPlan(null);notify(lang('El proyecto cambió. La propuesta anterior se ha descartado.',
   'The show changed. The previous plan was discarded.'),true);
 }
}
function positionDrawer(){
 const drawer=$('rqAgentDrawer');if(!drawer)return;
 const barBottom=document.querySelector('.topbar')?.getBoundingClientRect().bottom??70;
 drawer.style.top=Math.max(55,Math.min(window.innerHeight-160,barBottom+10))+'px';
}
function close(){
 $('rqAgentDrawer').hidden=true;
 $('rqAgentToggle')?.setAttribute('aria-expanded','false');
}
function open(){
 const s=state();
 if(!s||['rehearsal','operation'].includes(s.workspace))return;
 $('rqAgentDrawer').hidden=false;
 positionDrawer();
 $('rqAgentToggle').setAttribute('aria-expanded','true');
 $('rqAgentPrompt').focus();
}
function assetReady(id,s){return s.assets.find(a=>a.id===id)?.ready??null;}
async function sendRequest(forceAI=false,custom=null){
 if(working)return;
 const s=state();if(!s)return;
 if(['operation','rehearsal'].includes(s.workspace)){notify(lang('El agente solo está disponible en Studio.','Agent is available in Studio only.'),true);return;}
 const instruction=(custom??$('rqAgentPrompt').value).trim();
 if(instruction.length<3||instruction.length>1600){
  notify(lang('Escribe una instrucción de 3 a 1600 caracteres.','Enter 3–1600 characters.'),true);return;
 }
 if(forceAI&&!$('rqAgentConsent').checked){
  notify(lang('Autoriza explícitamente esta consulta a Meta.','Explicitly authorize this Meta request.'),true);return;
 }
 const source=voiceOrigin?'voice':'text';
 const verdict=classifyVoiceEditText(instruction,{source});
 if(!verdict.ok){
  addMessage('user',instruction);
  addMessage('assistant',lang('Rechazado: ','Rejected: ')+verdict.code+'. '+
   lang('La edición por voz no puede ejecutar GO/STOP ni cambiar las reglas del agente.',
    'Voice editing cannot run GO/STOP or change agent rules.'));
  if(voiceOrigin)recordVoiceOutcome({source,transcript:instruction,status:'REJECTED',code:verdict.code,outcome:'REJECTED'});
  notify(lang('Instrucción rechazada. No se han preparado cambios.','Instruction rejected. No changes were prepared.'),true);
  return;
 }
 const effective=source==='voice'?verdict.text:instruction;
 const conversation=boundedAgentConversation(history);
 working=true;lastPrompt=instruction;showPlan(null);
 $('rqAgentSubmit').disabled=true;$('rqAgentAskAI').disabled=true;
 addMessage('user',instruction);
 notify(forceAI?lang('Consultando proveedor de IA (una solicitud)...','Consulting AI provider (one request)...'):
  lang('Analizando proyecto localmente...','Analyzing local project...'));
 try{
  let reply;
  if(forceAI){
   const focus=s.project.cues.find(c=>c.id===s.selectedCueId)?.sourceLineIds[0];
   const context=fitAgentContext(buildAgentContext(s.project,{focusLineId:focus??null,
    assetAvailable:id=>assetReady(id,s)}));
   if(context.truncated.cues){
    const failure=new Error('CONTEXT_EXCEEDS_LIMIT');failure.reason='CONTEXT_EXCEEDS_LIMIT';throw failure;
   }
   const response=await fetch('/api/agent/interpret',{method:'POST',headers:{
    'Content-Type':'application/json','X-Runq-Agent-Consent':'yes'
   },body:JSON.stringify({prompt:effective,language:s.language,context,
     provider:$('rqAgentProvider')?.value??'meta',conversation})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok){
    const failure=new Error(result.error??'AGENT_PROVIDER_UNAVAILABLE');
    failure.reason=result.reason??result.error;failure.status=response.status;throw failure;
   }
   reply=result;
  }else{
   reply=resolveAgentDialogue(s.project,effective,{
    history:conversation,assetAvailable:id=>assetReady(id,s)});
   if(reply.status==='NEEDS_AI'){
    const human=humanNeedsAiReply({language:s.language,instruction:effective});
    reply={...reply,message:formatHumanReply(human)};
   }
  }
  // One-shot model permission, including error paths.
  const latest=state();
  if(!latest||JSON.stringify(latest.project)!==JSON.stringify(s.project)||
     ['operation','rehearsal'].includes(latest.workspace)){
   throw new Error(lang('El proyecto o el modo cambió durante el análisis. Repite la consulta.',
    'Show or workspace changed while planning. Submit again.'));
  }
  addMessage('assistant',reply.message);
  if(reply.report){
   const counts=new Map();
   for(const item of reply.report.issues)counts.set(item.code,(counts.get(item.code)??0)+1);
   addMessage('assistant',[...counts].map(([code,n])=>code+': '+n).join('\n')||lang('Sin incidencias.','No issues.'));
  }
  if(reply.skipped?.length){
   const counts=new Map();
   for(const item of reply.skipped)counts.set(item.reason,(counts.get(item.reason)??0)+1);
   addMessage('assistant',lang('Pendientes de revisión: ','Needs review: ')+
    [...counts].map(([reason,n])=>reason+': '+n).join(' · '));
  }
  if(reply.sound){
   const action=make('button','btn accent small',
    lang('Preparar alternativa en Sound Lab','Prepare alternative in Sound Lab'));
   action.type='button';
   action.addEventListener('click',()=>{
    document.dispatchEvent(new CustomEvent('runq:navigate-to-cue',{
     detail:{cueId:reply.sound.cueId}
    }));
    document.dispatchEvent(new CustomEvent('runq:open-contextual-ia',{
     detail:{mode:'sound',lineId:reply.sound.lineId,prompt:reply.sound.prompt}
    }));
    close();
   });
   $('rqAgentMessages').append(action);
  }
  if(reply.status==='PLAN'){
   const plan=prepareAgentPlan(s.project,reply.operations);
   showPlan(plan,s.project);
   if(voiceOrigin){recordVoiceOutcome({source,transcript:effective,status:'PLAN',operations:reply.operations.length});voiceTransition('propose');}
   notify(lang('Propuesta preparada: revisa los cambios antes de aplicar.',
    'Plan ready: review all changes before applying.'));
  }else{
   if(voiceOrigin)recordVoiceOutcome({source,transcript:effective,status:reply.status,outcome:'REJECTED'});
   notify(reply.status==='NEEDS_AI'?
    lang('Para solicitudes complejas puedes consultar la IA con consentimiento.',
      'For complex tasks, consult AI with consent.'):
    lang('Consulta finalizada. No se ha modificado el espectáculo.',
      'Completed. The show was not modified.'));
  }
 }catch(error){
  // Never surface raw codes: explain what happened and what to try next.
  const human=humanizeAgentError({reason:error.reason??error.message,status:error.status},
   {language:s.language,instruction:instruction});
  const stale=/cambió durante|changed while/.test(String(error.message));
  addMessage('assistant',stale?String(error.message):formatHumanReply(human));
  notify(lang('No se han aplicado cambios.','No changes were applied.'),false);
 }finally{
  $('rqAgentConsent').checked=false;
  voiceOrigin=false;
  working=false;
  $('rqAgentSubmit').disabled=false;$('rqAgentAskAI').disabled=false;
 }
}
function apply(){
 if(!proposed||working)return;
 let response=null;
 document.dispatchEvent(new CustomEvent('runq:agent-apply',{detail:{
  plan:proposed,respond:value=>{response=value;}
 }}));
 if(response?.ok){
  addMessage('assistant',lang('Cambios aplicados: ','Changes applied: ')+response.changes.length);
  showPlan(null);
  setVoiceOutcome('APPLIED');voiceTransition('apply');
  notify(lang('Cambios aplicados. Puedes deshacer el último lote.',
   'Changes applied. You may undo the last batch.'));
 }else notify(lang('No se han aplicado cambios: ','Changes not applied: ')+(response?.error??'UNKNOWN'),true);
}
function undo(){
 if(working)return;
 let response=null;
 document.dispatchEvent(new CustomEvent('runq:agent-undo',{detail:{respond:value=>{response=value;}}}));
 if(response?.ok){
  showPlan(null);addMessage('assistant',lang('Último lote deshecho.','Last batch undone.'));
  if(voiceHistory.at(-1)?.outcome==='APPLIED')voiceHistory=[...voiceHistory.slice(0,-1),{...voiceHistory.at(-1),outcome:'UNDONE'}];
  renderVoiceHistory();
  notify(lang('Operación revertida.','Operation reverted.'));
 }else notify(lang('No se puede deshacer: ','Cannot undo: ')+(response?.error??'UNKNOWN'),true);
}
function mount(){
 if($('rqAgentDrawer'))return;
 const anchor=document.querySelector('.top-actions');if(!anchor)return;
 const button=make('button','btn subtle','RUNQ AI');
 button.type='button';button.id='rqAgentToggle';button.setAttribute('aria-expanded','false');
 button.setAttribute('aria-controls','rqAgentDrawer');
 anchor.prepend(button);
 const panel=make('aside','rq-agent-drawer');
 panel.id='rqAgentDrawer';panel.hidden=true;panel.setAttribute('aria-label','RUNQ AI Agent');
 const head=make('header','rq-agent-head');
 const title=make('div','rq-agent-title');
 const titleText=make('strong','','RUNQ AI · '+lang('Asistente global','Project agent'));
 titleText.id='rqAgentHeaderTitle';
 const subtitle=make('small','',lang('Solo Studio · Ningún GO automático','Studio only · No automatic GO'));
 subtitle.id='rqAgentHeaderSubtitle';
 title.append(titleText,subtitle);
 const closeBtn=make('button','btn subtle small','×');
 closeBtn.id='rqAgentClose';closeBtn.type='button';
 closeBtn.setAttribute('aria-label',lang('Cerrar agente','Close agent'));
 head.append(title,closeBtn);
 const contextCard=make('section','rq-agent-context');
 contextCard.id='rqAgentContext';
 contextCard.setAttribute('aria-label',lang('Contexto actual del agente','Current agent context'));
 const contextTitle=make('small','',lang('CONTEXTO DEL SHOW','SHOW CONTEXT'));
 contextTitle.id='rqAgentContextTitle';
 const contextShow=make('strong','');contextShow.id='rqAgentContextShow';
 const contextSummary=make('p','');contextSummary.id='rqAgentContextSummary';
 const contextFocus=make('p','rq-agent-context-focus');contextFocus.id='rqAgentContextFocus';
 const contextWindow=make('small','rq-agent-context-window');contextWindow.id='rqAgentContextWindow';
 const contextBoundary=make('p','rq-agent-context-boundary',lang(
  'Lee texto, referencias y metadatos de audio; no envía los archivos de sonido. Propuestas pendientes de revisión: nunca ejecutan GO.',
  'Reads script text, references and audio metadata; audio files are not sent. Proposals require review and never execute GO.'));
 contextBoundary.id='rqAgentContextBoundary';
 contextCard.append(contextTitle,contextShow,contextSummary,contextFocus,contextWindow,contextBoundary);
 const messages=make('div','rq-agent-messages');messages.id='rqAgentMessages';
 const proposals=make('section','rq-agent-proposal');proposals.id='rqAgentProposal';proposals.hidden=true;
 const proposalTitle=make('strong','',lang('Cambios propuestos · Sin aplicar','Proposed changes · Not applied'));
 proposalTitle.id='rqAgentProposalTitle';
 proposals.append(proposalTitle);
 const ops=make('ol','rq-agent-ops');ops.id='rqAgentOps';
 const diff=make('ol','rq-agent-diff');diff.id='rqAgentDiff';
 const approve=make('button','btn accent small',lang('Aplicar lote','Apply batch'));
 approve.id='rqAgentApply';approve.type='button';
 const discard=make('button','btn subtle small',lang('Descartar','Discard'));
 discard.id='rqAgentDiscard';discard.type='button';
 const proposedActions=make('div','rq-agent-actions');proposedActions.append(approve,discard);
 proposals.append(ops,diff,proposedActions);
 const composer=make('section','rq-agent-compose');
 const label=make('label','',lang('¿Qué quieres hacer en este espectáculo?','What would you like to change in this show?'));
 label.id='rqAgentPromptLabel';
 label.htmlFor='rqAgentPrompt';
 const input=make('textarea','');input.id='rqAgentPrompt';input.rows=4;input.maxLength=1600;
 input.placeholder=lang('Ej.: elimina el cue 2; pon pies de voz; revisa el show...',
  'e.g. delete cue 2; assign spoken triggers; review the show...');
 const examples=make('div','rq-agent-examples');
 for(const [id,text,cmd] of [
  ['rqAgentExampleAudit',lang('Revisar show','Audit show'),lang('Revisa el show','Audit the show')],
  ['rqAgentExampleVoice',lang('Pies de voz','Voice triggers'),lang('Pon pies de voz coherentes a todos los cues','Assign spoken triggers to all cues')],
  ['rqAgentExampleEnding',lang('Preparar cierre','Prepare ending'),lang('Añade tres cues para rematar el show','Add three cues to finish the show')],
  ['rqAgentExampleSummary',lang('Resumen','Summary'),lang('Resumen del proyecto','Show summary')]
 ]){
  const b=make('button','btn subtle small',text);b.type='button';
  b.id=id;b.dataset.command=cmd;
  b.addEventListener('click',()=>{const command=b.dataset.command;input.value=command;void sendRequest(false,command);});
  examples.append(b);
 }
 const providerLabel=make('label','rq-agent-provider');
 const providerLabelText=make('span','',lang('Proveedor para consulta opcional','Provider for optional request'));
 providerLabelText.id='rqAgentProviderLabel';
 providerLabel.append(providerLabelText);
 const providerSelect=make('select','');providerSelect.id='rqAgentProvider';
 for(const [id,title] of [['meta','Meta Muse Spark'],['baseten','Baseten · Muse Spark Open']]){
  const option=make('option','',title);option.value=id;providerSelect.append(option);
 }
 providerLabel.append(providerSelect);
 const consentLabel=make('label','rq-agent-consent');
 const consent=make('input','');consent.type='checkbox';consent.id='rqAgentConsent';
 const consentText=make('span','',lang('Autorizo una consulta externa al proveedor seleccionado con contexto acotado del proyecto (puede tener coste).',
  'I authorize one external request to the selected provider with bounded project context (may incur cost).'));
 consentText.id='rqAgentConsentLabel';
 consentLabel.append(consent,consentText);
 const actions=make('div','rq-agent-actions');
 const local=make('button','btn accent small',lang('Proponer localmente','Plan locally'));
 local.id='rqAgentSubmit';local.type='button';
 const cloud=make('button','btn subtle small',lang('Consultar IA · 1 solicitud','Ask AI · 1 request'));
 cloud.id='rqAgentAskAI';cloud.type='button';
 const undoButton=make('button','btn subtle small',lang('Deshacer lote','Undo batch'));
 undoButton.id='rqAgentUndo';undoButton.type='button';
 actions.append(local,cloud,undoButton);
 const status=make('output','rq-agent-status',
  lang('Sin modificaciones pendientes.','No pending modifications.'));
 status.id='rqAgentStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const voice=make('section','rq-agent-voice');voice.id='rqAgentVoice';voice.dataset.state='idle';
 const voiceHead=make('strong','',lang('Dictar instrucción (voz de edición)','Dictate instruction (edit voice)'));
 const voiceRecord=make('button','btn subtle small',lang('Mantén para hablar','Hold to talk'));
 voiceRecord.id='rqAgentVoiceRecord';voiceRecord.type='button';voiceRecord.setAttribute('aria-pressed','false');
 const voiceTranscribeBtn=make('button','btn subtle small',lang('Transcribir','Transcribe'));
 voiceTranscribeBtn.id='rqAgentVoiceTranscribe';voiceTranscribeBtn.type='button';voiceTranscribeBtn.disabled=true;
 const voiceConsentLabel=make('label','rq-agent-consent');
 const voiceConsent=make('input','');voiceConsent.type='checkbox';voiceConsent.id='rqAgentVoiceConsent';
 voiceConsentLabel.append(voiceConsent,make('span','',lang('Autorizo enviar esta grabación a Meta para transcribirla.',
  'I authorize sending this recording to Meta for transcription.')));
 const voiceInfo=make('output','rq-agent-status',lang('Solo edita cues. No controla GO/STOP ni el Autopiloto.',
  'Edits cues only. Does not control GO/STOP or Autopilot.'));
 voiceInfo.id='rqAgentVoiceStatus';voiceInfo.setAttribute('role','status');
 const voiceList=make('ol','rq-agent-voice-history');voiceList.id='rqAgentVoiceHistory';
 const voiceRow=make('div','rq-agent-actions');voiceRow.append(voiceRecord,voiceTranscribeBtn);
 voice.append(voiceHead,voiceRow,voiceConsentLabel,voiceInfo,voiceList);
 voiceRecord.addEventListener('pointerdown',event=>{event.preventDefault();void startVoiceCapture();});
 for(const type of ['pointerup','pointerleave','pointercancel'])voiceRecord.addEventListener(type,stopVoiceCapture);
 voiceRecord.addEventListener('keydown',event=>{if((event.key===' '||event.key==='Enter')&&!event.repeat){event.preventDefault();void startVoiceCapture();}});
 voiceRecord.addEventListener('keyup',event=>{if(event.key===' '||event.key==='Enter')stopVoiceCapture();});
 voiceTranscribeBtn.addEventListener('click',()=>void transcribeVoice());
 composer.append(label,input,voice,examples,providerLabel,consentLabel,actions,status);
 panel.append(head,contextCard,messages,proposals,composer);
 document.body.append(panel);
 window.addEventListener('resize',positionDrawer);
 window.addEventListener('scroll',()=>{if(!panel.hidden)positionDrawer();},{passive:true});
 panel.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
 addMessage('assistant',lang(
  'Puedo consultar el show, proponer cambios en varios cues, revisar errores y sugerir pies de voz con referencias del guion. Revisa y aprueba cada lote.',
  'I can inspect the show, propose multi-cue edits, audit issues and suggest script-grounded spoken triggers. Review and approve each batch.'));
 button.addEventListener('click',()=>panel.hidden?open():close());
 closeBtn.addEventListener('click',close);
 local.addEventListener('click',()=>void sendRequest(false));
 cloud.addEventListener('click',()=>void sendRequest(true));
 approve.addEventListener('click',apply);
 discard.addEventListener('click',()=>{showPlan(null);setVoiceOutcome('CANCELLED');voiceTransition('cancel');notify(lang('Propuesta descartada.','Plan discarded.'));});
 undoButton.addEventListener('click',undo);
 input.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void sendRequest(false);}
 });
 document.addEventListener('runq:show-state-changed',sync);
 document.addEventListener('runq:cue-chat-selection',sync);
 $('uiLocaleSelect')?.addEventListener('change',sync);
 window.addEventListener('pagehide',stopVoiceCapture);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopVoiceCapture();});
 sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);
else mount();
