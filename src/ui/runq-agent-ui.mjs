/**
 * RUNQ AI Agent Studio drawer. A plan is never applied by a provider response.
 * Model consultations use explicit one-shot permission and are never retried.
 */
import {buildAgentContext,prepareAgentPlan} from '../core/agentCore.mjs';
import {interpretLocalAgentRequest} from '../core/agentIntent.mjs';
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
function showPlan(plan){
 proposed=plan;
 const panel=$('rqAgentProposal'),list=$('rqAgentDiff');
 panel.hidden=!plan;
 list.replaceChildren();
 if(!plan)return;
 const items=plan.changes.slice(0,75);
 for(const change of items){
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
 $('rqAgentApply').disabled=false;
 if(plan.changes.length>75)list.append(make('li','',lang('Hay más cambios; lote demasiado extenso para vista completa.','More changes; batch exceeds preview capacity.')));
}
function short(value){
 if(value===null||value===undefined)return '—';
 const result=typeof value==='object'?JSON.stringify(value):String(value);
 return result.length>180?result.slice(0,177)+'…':result;
}
function sync(){
 const s=state(),button=$('rqAgentToggle');
 if(!s||!button)return;
 const blocked=['rehearsal','operation'].includes(s.workspace);
 button.hidden=blocked;
 if(blocked)close();
 if(proposed&&JSON.stringify(s.project)!==proposed.baseSnapshot){
  showPlan(null);notify(lang('El proyecto cambió. La propuesta anterior se ha descartado.',
   'The show changed. The previous plan was discarded.'),true);
 }
}
function close(){
 $('rqAgentDrawer').hidden=true;
 $('rqAgentToggle')?.setAttribute('aria-expanded','false');
}
function open(){
 const s=state();
 if(!s||['rehearsal','operation'].includes(s.workspace))return;
 $('rqAgentDrawer').hidden=false;
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
 working=true;lastPrompt=instruction;showPlan(null);
 $('rqAgentSubmit').disabled=true;$('rqAgentAskAI').disabled=true;
 addMessage('user',instruction);
 notify(forceAI?lang('Consultando Meta (una solicitud)...','Consulting Meta (one request)...'):
  lang('Analizando proyecto localmente...','Analyzing local project...'));
 try{
  let reply;
  if(forceAI){
   const focus=s.project.cues.find(c=>c.id===s.selectedCueId)?.sourceLineIds[0];
   const context=buildAgentContext(s.project,{focusLineId:focus??null,
    assetAvailable:id=>assetReady(id,s)});
   if(context.truncated.cues){
    throw new Error(lang('El proyecto supera el contexto seguro de 80 cues. Divide la tarea por escena.',
     'Show exceeds the safe 80-cue context. Narrow the task by scene.'));
   }
   const response=await fetch('/api/agent/interpret',{method:'POST',headers:{
    'Content-Type':'application/json','X-Runq-Agent-Consent':'yes'
   },body:JSON.stringify({prompt:instruction,language:s.language,context})});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error??'AGENT_PROVIDER_UNAVAILABLE');
   reply=result;
  }else{
   reply=interpretLocalAgentRequest(s.project,instruction,{
    assetAvailable:id=>assetReady(id,s)});
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
   showPlan(plan);
   notify(lang('Propuesta preparada: revisa los cambios antes de aplicar.',
    'Plan ready: review all changes before applying.'));
  }else{
   notify(reply.status==='NEEDS_AI'?
    lang('Para solicitudes complejas utiliza Consultar Meta con consentimiento.',
      'For complex tasks, use Consult Meta with consent.'):
    lang('Consulta finalizada. No se ha modificado el espectáculo.',
      'Completed. The show was not modified.'));
  }
 }catch(error){
  addMessage('assistant',lang('No se pudo preparar la operación: ','Unable to prepare operation: ')+
   String(error.message).slice(0,240));
  notify(lang('La operación ha fallado. No se han aplicado cambios.',
    'Request failed. No changes were applied.'),true);
 }finally{
  $('rqAgentConsent').checked=false;
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
 title.append(make('strong','','RUNQ AI · '+lang('Asistente global','Project agent')),
  make('small','',lang('Solo Studio · Ningún GO automático','Studio only · No automatic GO')));
 const closeBtn=make('button','btn subtle small','×');
 closeBtn.type='button';closeBtn.setAttribute('aria-label',lang('Cerrar agente','Close agent'));
 head.append(title,closeBtn);
 const messages=make('div','rq-agent-messages');messages.id='rqAgentMessages';
 const proposals=make('section','rq-agent-proposal');proposals.id='rqAgentProposal';proposals.hidden=true;
 proposals.append(make('strong','',lang('Cambios propuestos · Sin aplicar','Proposed changes · Not applied')));
 const diff=make('ol','rq-agent-diff');diff.id='rqAgentDiff';
 const approve=make('button','btn accent small',lang('Aplicar lote','Apply batch'));
 approve.id='rqAgentApply';approve.type='button';
 const discard=make('button','btn subtle small',lang('Descartar','Discard'));
 discard.type='button';
 const proposedActions=make('div','rq-agent-actions');proposedActions.append(approve,discard);
 proposals.append(diff,proposedActions);
 const composer=make('section','rq-agent-compose');
 const label=make('label','',lang('¿Qué quieres hacer en este espectáculo?','What would you like to change in this show?'));
 label.htmlFor='rqAgentPrompt';
 const input=make('textarea','');input.id='rqAgentPrompt';input.rows=4;input.maxLength=1600;
 input.placeholder=lang('Ej.: elimina el cue 2; pon pies de voz; revisa el show...',
  'e.g. delete cue 2; assign spoken triggers; review the show...');
 const examples=make('div','rq-agent-examples');
 for(const [text,cmd] of [
  [lang('Revisar show','Audit show'),lang('Revisa el show','Audit the show')],
  [lang('Pies de voz','Voice triggers'),lang('Pon pies de voz coherentes a todos los cues','Assign spoken triggers to all cues')],
  [lang('Resumen','Summary'),lang('Resumen del proyecto','Show summary')]
 ]){
  const b=make('button','btn subtle small',text);b.type='button';
  b.addEventListener('click',()=>{input.value=cmd;void sendRequest(false,cmd);});examples.append(b);
 }
 const consentLabel=make('label','rq-agent-consent');
 const consent=make('input','');consent.type='checkbox';consent.id='rqAgentConsent';
 consentLabel.append(consent,make('span','',lang('Autorizo una consulta a Meta con el contexto visible del proyecto (posible coste).',
  'I authorize one Meta request with bounded project context (may incur cost).')));
 const actions=make('div','rq-agent-actions');
 const local=make('button','btn accent small',lang('Proponer localmente','Plan locally'));
 local.id='rqAgentSubmit';local.type='button';
 const cloud=make('button','btn subtle small',lang('Consultar Meta · 1 solicitud','Ask Meta · 1 request'));
 cloud.id='rqAgentAskAI';cloud.type='button';
 const undoButton=make('button','btn subtle small',lang('Deshacer lote','Undo batch'));
 undoButton.id='rqAgentUndo';undoButton.type='button';
 actions.append(local,cloud,undoButton);
 const status=make('output','rq-agent-status',
  lang('Sin modificaciones pendientes.','No pending modifications.'));
 status.id='rqAgentStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 composer.append(label,input,examples,consentLabel,actions,status);
 panel.append(head,messages,proposals,composer);
 document.body.append(panel);
 addMessage('assistant',lang(
  'Puedo consultar el show, proponer cambios en varios cues, revisar errores y sugerir pies de voz con referencias del guion. Revisa y aprueba cada lote.',
  'I can inspect the show, propose multi-cue edits, audit issues and suggest script-grounded spoken triggers. Review and approve each batch.'));
 button.addEventListener('click',()=>panel.hidden?open():close());
 closeBtn.addEventListener('click',close);
 local.addEventListener('click',()=>void sendRequest(false));
 cloud.addEventListener('click',()=>void sendRequest(true));
 approve.addEventListener('click',apply);
 discard.addEventListener('click',()=>{showPlan(null);notify(lang('Propuesta descartada.','Plan discarded.'));});
 undoButton.addEventListener('click',undo);
 input.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void sendRequest(false);}
 });
 document.addEventListener('runq:show-state-changed',sync);
 sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);
else mount();
