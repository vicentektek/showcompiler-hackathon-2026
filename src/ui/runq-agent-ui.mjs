/**
 * RUNQ AI Agent Studio drawer. A plan is never applied by a provider response.
 * Model consultations use explicit one-shot permission and are never retried.
 */
import {buildAgentContext,prepareAgentPlan} from '../core/agentCore.mjs';
import {resolveAgentDialogue,boundedAgentConversation} from '../core/agentDialogue.mjs';
import {userFacingError} from './userFacingErrors.mjs';
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
    try{showPlan(prepareAgentPlan(selectedBatch.project,picked,{
     assetAvailable:id=>assetReady(id,state()),
    }),null,true);}
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
  if(change.kind==='CREATED'&&change.after.trigger){
   const assetIds=change.after.actions.filter(action=>action.type==='PLAY').map(action=>action.assetId);
   const assetNames=assetIds.map(id=>selectedBatch?.project.assets.find(asset=>asset.id===id)?.name??id);
   item.append(make('small','',lang('Audio: ','Audio: ')+assetNames.join(', ')),
    make('small','',lang('Fuente: ','Source: ')+change.after.sourceLineIds.join(', ')),
    make('p','',lang('Pie hablado: ','Spoken trigger: ')+change.after.trigger));
  }
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
function sync(){
 const s=state(),button=$('rqAgentToggle');
 if(!s||!button)return;
 if(sessionProjectId!==s.project.id){
  if(sessionProjectId!==null){
   history=[];showPlan(null);
   if($('rqAgentSelectedSound'))$('rqAgentSelectedSound').value='';
   $('rqAgentMessages')?.replaceChildren();
   addMessage('assistant',lang('Nuevo espectáculo: conversación reiniciada.','New show: conversation reset.'));
  }
  const sound=$('rqAgentSelectedSound');
  const soundOptions=s.project.assets.map(asset=>({
   id:asset.id,name:asset.name,ready:assetReady(asset.id,s)===true,
  }));
  const soundKey=JSON.stringify(soundOptions);
  if(sound&&sound.dataset.options!==soundKey){
   const selected=sound.value;
   sound.replaceChildren();
   const none=make('option','',lang('Ningún sonido seleccionado','No sound selected'));none.value='';
   sound.append(none);
   for(const asset of soundOptions){
    const option=make('option','',asset.name+(asset.ready?'':lang(' · no disponible',' · unavailable')));
    option.value=asset.id;option.disabled=!asset.ready;sound.append(option);
   }
   sound.value=soundOptions.some(asset=>asset.id===selected&&asset.ready)?selected:'';
   sound.dataset.options=soundKey;
  }
  sessionProjectId=s.project.id;
 }
 const blocked=['rehearsal','operation'].includes(s.workspace);
 button.hidden=blocked;
 const drawer=$('rqAgentDrawer'),host=$('rqAgentWorkspace');
 const docked=s.workspace==='ai'&&host;
 if(docked){
  if(drawer.parentElement!==host)host.append(drawer);
  drawer.hidden=false;button.setAttribute('aria-expanded','true');
 }else if(host&&drawer.parentElement===host){
  document.body.append(drawer);close();
 }
 $('rqAgentClose').hidden=Boolean(docked);
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
 if(drawer.parentElement===$('rqAgentWorkspace'))return;
 const barBottom=document.querySelector('.topbar')?.getBoundingClientRect().bottom??70;
 drawer.style.top=Math.max(55,Math.min(window.innerHeight-160,barBottom+10))+'px';
}
function close(){
 if(state()?.workspace==='ai'){
  $('rqAgentPrompt')?.focus();return;
 }
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
  const settings=$('rqAgentAiOptions');if(settings)settings.open=true;
  $('rqAgentConsent')?.focus();
  notify(lang('Autoriza el envío de la instrucción y el contexto del show antes de consultar IA.',
   'Authorize sending the instruction and show context before using AI.'),true);return;
 }
 const conversation=boundedAgentConversation(history);
 working=true;lastPrompt=instruction;showPlan(null);
 $('rqAgentSubmit').disabled=true;$('rqAgentAskAI').disabled=true;
 addMessage('user',instruction);
 notify(forceAI?lang('Preparando propuesta con IA…','Preparing an AI suggestion…'):
  lang('Analizando proyecto localmente...','Analyzing local project...'));
 try{
  let reply;
  if(forceAI){
   const focus=s.project.cues.find(c=>c.id===s.selectedCueId)?.sourceLineIds[0];
   const context=buildAgentContext(s.project,{focusLineId:focus??null,
    workspace:s.workspace,mode:'design-manual',selectedCueId:s.selectedCueId??null,
    assetAvailable:id=>assetReady(id,s)});
   if(context.truncated.cues){
    throw new Error(lang('El proyecto supera el contexto seguro de 80 cues. Divide la tarea por escena.',
     'Show exceeds the safe 80-cue context. Narrow the task by scene.'));
   }
   const response=await fetch('/api/agent/interpret',{method:'POST',headers:{
    'Content-Type':'application/json','X-Runq-Agent-Consent':'yes'
   },body:JSON.stringify({prompt:instruction,language:s.language,context,
     provider:$('rqAgentProvider')?.value??'meta',conversation})});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error??'AGENT_PROVIDER_UNAVAILABLE');
   reply=result;
  }else{
   reply=resolveAgentDialogue(s.project,instruction,{
    history:conversation,assetAvailable:id=>assetReady(id,s),
    selectedAssetId:$('rqAgentSelectedSound').value||null});
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
   const plan=prepareAgentPlan(s.project,reply.operations,{assetAvailable:id=>assetReady(id,s)});
   showPlan(plan,s.project);
   notify(lang('Propuesta preparada: revisa los cambios antes de aplicar.',
    'Plan ready: review all changes before applying.'));
  }else{
   notify(reply.status==='NEEDS_AI'?
    lang('Si lo necesitas, puedes pedir una propuesta con IA.',
      'You can ask AI for another suggestion when needed.'):
    lang('Consulta finalizada. No se ha modificado el espectáculo.',
      'Completed. The show was not modified.'));
  }
 }catch(error){
  addMessage('assistant',userFacingError(error,es()?'es':'en'));
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
 }else notify(userFacingError(response?.error,es()?'es':'en'),true);
}
function undo(){
 if(working)return;
 let response=null;
 document.dispatchEvent(new CustomEvent('runq:agent-undo',{detail:{respond:value=>{response=value;}}}));
 if(response?.ok){
  showPlan(null);addMessage('assistant',lang('Último lote deshecho.','Last batch undone.'));
  notify(lang('Operación revertida.','Operation reverted.'));
 }else notify(userFacingError(response?.error,es()?'es':'en'),true);
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
  make('small','',lang('Solo diseño y revisión · Ningún GO automático','Design and review only · No automatic GO')));
 const closeBtn=make('button','btn subtle small','×');
 closeBtn.id='rqAgentClose';
 closeBtn.type='button';closeBtn.setAttribute('aria-label',lang('Cerrar agente','Close agent'));
 head.append(title,closeBtn);
 const messages=make('div','rq-agent-messages');messages.id='rqAgentMessages';
 const proposals=make('section','rq-agent-proposal');proposals.id='rqAgentProposal';proposals.hidden=true;
 proposals.append(make('strong','',lang('Cambios propuestos · Sin aplicar','Proposed changes · Not applied')));
 const ops=make('ol','rq-agent-ops');ops.id='rqAgentOps';
 const diff=make('ol','rq-agent-diff');diff.id='rqAgentDiff';
 const approve=make('button','btn accent small',lang('Aplicar lote','Apply batch'));
 approve.id='rqAgentApply';approve.type='button';
 const discard=make('button','btn subtle small',lang('Descartar','Discard'));
 discard.type='button';
 const proposedActions=make('div','rq-agent-actions');proposedActions.append(approve,discard);
 proposals.append(ops,diff,proposedActions);
 const composer=make('section','rq-agent-compose');
 const label=make('label','',lang('¿Qué quieres hacer en este espectáculo?','What would you like to change in this show?'));
 label.htmlFor='rqAgentPrompt';
 const input=make('textarea','');input.id='rqAgentPrompt';input.rows=4;input.maxLength=1600;
 input.placeholder=lang('Ej.: elimina el cue 2; pon pies de voz; revisa el show...',
  'e.g. delete cue 2; assign spoken triggers; review the show...');
 const soundLabel=make('label','rq-agent-selected-sound',lang(
  'Sonido para crear un cue configurado (elección explícita)',
  'Sound for a configured cue (explicit selection)'));
 soundLabel.htmlFor='rqAgentSelectedSound';
 const sound=make('select','');sound.id='rqAgentSelectedSound';soundLabel.append(sound);
 const examples=make('div','rq-agent-examples');
 for(const [text,cmd] of [
  [lang('Revisar show','Audit show'),lang('Revisa el show','Audit the show')],
  [lang('Pies de voz','Voice triggers'),lang('Pon pies de voz coherentes a todos los cues','Assign spoken triggers to all cues')],
  [lang('Preparar cierre','Prepare ending'),lang('Añade tres cues para rematar el show','Add three cues to finish the show')],
  [lang('Resumen','Summary'),lang('Resumen del proyecto','Show summary')]
 ]){
  const b=make('button','btn subtle small',text);b.type='button';
  b.addEventListener('click',()=>{input.value=cmd;void sendRequest(false,cmd);});examples.append(b);
 }
 const aiOptions=make('details','rq-agent-ai-options');
 aiOptions.id='rqAgentAiOptions';
 const aiSummary=make('summary','',lang('Servicio de IA y permisos','AI service and permissions'));
 aiOptions.append(aiSummary);
 const providerLabel=make('label','rq-agent-provider');
 providerLabel.append(make('span','',lang('Proveedor para consulta opcional','Provider for optional request')));
 const providerSelect=make('select','');providerSelect.id='rqAgentProvider';
 for(const [id,title] of [['meta','Meta Muse Spark'],['baseten','Baseten · Muse Spark Open']]){
  const option=make('option','',title);option.value=id;providerSelect.append(option);
 }
 providerLabel.append(providerSelect);
 const consentLabel=make('label','rq-agent-consent');
 const consent=make('input','');consent.type='checkbox';consent.id='rqAgentConsent';
 consentLabel.append(consent,make('span','',lang(
  'Autorizo una consulta con la instrucción y el contexto acotado del show al proveedor elegido (puede tener coste).',
  'I authorize one request with this instruction and bounded show context to the selected AI provider (may incur a charge).')));
 const consentDetails=make('small','rq-agent-consent-disclosure',lang(
  'Incluye hasta 80 cues, 120 líneas originales del guion, nombres/estado de medios y hasta 8 mensajes recientes. No se envían archivos de audio.',
  'Includes up to 80 cues, 120 original script lines, media names/status and up to 8 recent messages. Audio files are never sent.'));
 consentDetails.id='rqAgentConsentDisclosure';
 aiOptions.append(providerLabel,consentLabel,consentDetails);
 const actions=make('div','rq-agent-actions');
 const local=make('button','btn accent small',lang('Proponer localmente','Plan locally'));
 local.id='rqAgentSubmit';local.type='button';
 const cloud=make('button','btn subtle small',lang('Pedir ayuda a la IA','Ask AI'));
 cloud.id='rqAgentAskAI';cloud.type='button';
 const undoButton=make('button','btn subtle small',lang('Deshacer lote','Undo batch'));
 undoButton.id='rqAgentUndo';undoButton.type='button';
 actions.append(local,cloud,undoButton);
 const status=make('output','rq-agent-status',
  lang('Sin modificaciones pendientes.','No pending modifications.'));
 status.id='rqAgentStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 composer.append(label,input,soundLabel,examples,aiOptions,actions,status);
 panel.append(head,messages,proposals,composer);
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
