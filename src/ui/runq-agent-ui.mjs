/**
 * RUNQ AI Agent Studio drawer. A plan is never applied by a provider response.
 * Model consultations use explicit one-shot permission and are never retried.
 */
import {buildAgentContext,prepareAgentPlan} from '../core/agentCore.mjs';
import {resolveAgentDialogue,boundedAgentConversation} from '../core/agentDialogue.mjs';
import {userFacingError} from './userFacingErrors.mjs';
import {createCommandDictation,commandDictationMessage} from './command-dictation.mjs';
import {parseScript,getScriptLine} from '../core/script.mjs';
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
let sessionProjectId=null,sessionGeneration=null;
let selectedBatch=null;
let displayPhase='idle',chromeCopies=[];
let requestEpoch=0,requestController=null,requestBase=null,dictation=null,dictationContext=null;
function state(){
 let result=null;
 document.dispatchEvent(new CustomEvent('runq:agent-read',{detail:{respond:value=>{result=value;}}}));
 return result;
}
function notify(text,error=false){
 const status=$('rqAgentStatus');
 if(status){status.textContent=text;status.classList.toggle('is-error',error);}
 if(error)displayPhase='error';
 renderReviewState();
}
function renderReviewState(){
 const drawer=$('rqAgentDrawer');if(!drawer)return;
 const phase=working?'working':selectedBatch?'review':displayPhase;
 drawer.dataset.phase=phase;drawer.setAttribute('aria-busy',String(working));
 const words={
  idle:['Próxima instrucción','Ready for instruction'],working:['Preparando propuesta','Preparing proposal'],
  review:['Pendiente de aprobación','Awaiting approval'],error:['Revisar error','Review error'],
  applied:['Lote aplicado','Batch applied'],
 };
 const label=$('rqAgentPhase');if(label)label.textContent=lang(...words[phase]);
 const count=selectedBatch?.enabled.filter(Boolean).length??0;
 const summary=$('rqAgentReviewSummary');
 if(summary)summary.textContent=lang('Cambios propuestos · '+count+' operaciones seleccionadas · Sin aplicar',
  'Proposed changes · '+count+' selected operations · Not applied');
}
function syncContext(s){
 const cue=s.project.cues.find(item=>item.id===s.selectedCueId),context=$('rqAgentContext');
 if(!context)return;
 const linked=cue?.actions.filter(action=>action.type==='PLAY').map(action=>({
  name:s.project.assets.find(asset=>asset.id===action.assetId)?.name??action.assetId,
  ready:assetReady(action.assetId,s)===true,
 }))??[];
 const lines=parseScript(s.project.scriptText);
 const sources=(cue?.sourceLineIds??[]).slice(0,2).map(id=>({
  id,text:getScriptLine(lines,id)?.text??null,
 }));
 const key=JSON.stringify([s.project.name,cue,linked,sources,es()]);
 if(context.dataset.snapshot===key)return;
 context.dataset.snapshot=key;
 $('rqAgentContextCue').textContent=cue?lang('Cue seleccionado · ','Selected cue · ')+cue.number+' · '+cue.label:
  lang('Sin cue seleccionado','No cue selected');
 $('rqAgentShowName').textContent=s.project.name;
 $('rqAgentContextSource').textContent=sources.length?sources.map(line=>
  line.id+' · '+(line.text?.slice(0,350)??lang('Fuente no disponible','Source unavailable'))).join('\n'):
  lang('Sin referencias del guion. No se inventarán líneas.','No script references. Source lines will not be invented.');
 $('rqAgentContextAudio').textContent=linked.length?linked.map(asset=>
  asset.name+' · '+(asset.ready?lang('LISTO','READY'):lang('NO DISPONIBLE','UNAVAILABLE'))).join(' · '):
  lang('Sin audio vinculado · configura un sonido antes de GO','No linked audio · configure a sound before GO');
 $('rqAgentViewSource').disabled=!sources[0]?.text;
 $('rqAgentOpenCue').disabled=!cue;
}
function renderChrome(){
 for(const [element,esText,enText] of chromeCopies)element.textContent=lang(esText,enText);
 if($('rqAgentPrompt'))$('rqAgentPrompt').placeholder=lang(
  'Ej.: propón un pie para el cue seleccionado; revisa el show…',
  'e.g. propose a trigger for the selected cue; audit the show…');
 renderReviewState();
}
function contextKey(){
 const s=state();
 return s?.canApply&&!['rehearsal','operation'].includes(s.workspace)
  ?JSON.stringify([s.project,s.generation,s.workspace,s.selectedCueId]):null;
}
function refreshControls(){
 $('rqAgentSubmit').disabled=working||Boolean(dictation?.busy);
 $('rqAgentAskAI').disabled=working||Boolean(dictation?.busy);
 $('rqAgentPrompt').disabled=working||Boolean(dictation?.busy);
 for(const button of document.querySelectorAll('.rq-agent-examples button'))
  button.disabled=working||Boolean(dictation?.busy);
 const cancel=$('rqAgentCancel');
 if(cancel)cancel.disabled=!working&&!dictation?.hasWork;
 $('rqAgentApply').disabled=!proposed||working||Boolean(dictation?.busy)||!state()?.canApply;
 renderReviewState();
 if(!dictation)return;
 $('rqAgentRecord').disabled=working||['acquiring','transcribing'].includes(dictation.phase);
 $('rqAgentRecord').textContent=dictation.phase==='recording'
  ?lang('Detener grabación','Stop recording'):lang('Grabar instrucción (10 s)','Record instruction (10 s)');
 $('rqAgentTranscribe').disabled=working||!dictation.canTranscribe;
 if(['idle','transcribing'].includes(dictation.phase))$('rqAgentVoiceConsent').checked=false;
}
function cancelPending(reason='cancelled'){
 dictation?.cancel(reason);
 if(!working){refreshControls();return;}
 requestEpoch++;requestController?.abort();requestController=null;requestBase=null;
 working=false;displayPhase='idle';$('rqAgentConsent').checked=false;showPlan(null);refreshControls();
 notify(lang('Consulta cancelada. Los resultados tardíos no se aplicarán.',
  'Request cancelled. Late results will not be applied.'));
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
 if(displayPhase==='applied'||displayPhase==='error')displayPhase='idle';
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
 refreshControls();
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
 syncContext(s);
 if((requestBase!==null&&requestBase!==contextKey())||contextKey()===null)cancelPending('context_changed');
 if(dictation?.hasWork&&dictationContext!==contextKey())dictation.cancel('context_changed');
 if(sessionProjectId!==s.project.id||sessionGeneration!==s.generation){
  if(sessionProjectId!==null){
   history=[];showPlan(null);
   if($('rqAgentSelectedSound'))$('rqAgentSelectedSound').value='';
   $('rqAgentMessages')?.replaceChildren();
   displayPhase='idle';
   addMessage('assistant',lang(
    'Contexto del nuevo show preparado. Consulta el guion o el audio del cue seleccionado; propón cambios y revisa el lote antes de aplicar.',
    'New show context ready. Inspect the selected cue’s script or audio; propose changes and review the batch before applying.'));
  }
  sessionProjectId=s.project.id;sessionGeneration=s.generation;
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
 cancelPending();
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
 if(working||dictation?.busy)return;
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
 const epoch=++requestEpoch;requestBase=contextKey();
 requestController=new AbortController();
 working=true;displayPhase='idle';lastPrompt=instruction;showPlan(null);
 refreshControls();
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
   },signal:requestController.signal,body:JSON.stringify({prompt:instruction,language:s.language,context,
     provider:$('rqAgentProvider')?.value??'meta',conversation})});
   const result=await response.json();
   if(epoch!==requestEpoch)return;
   if(!response.ok)throw new Error(result.error??'AGENT_PROVIDER_UNAVAILABLE');
   reply=result;
  }else{
   reply=resolveAgentDialogue(s.project,instruction,{
    history:conversation,assetAvailable:id=>assetReady(id,s),
    selectedCueId:s.selectedCueId??null,
    selectedAssetId:$('rqAgentSelectedSound').value||null});
  }
  // One-shot model permission, including error paths.
  const latest=state();
  if(epoch!==requestEpoch)return;
  if(!latest||requestBase!==contextKey()||JSON.stringify(latest.project)!==JSON.stringify(s.project)||
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
  if(epoch!==requestEpoch)return;
  addMessage('assistant',userFacingError(error,es()?'es':'en'));
  notify(lang('La operación ha fallado. No se han aplicado cambios.',
    'Request failed. No changes were applied.'),true);
 }finally{
  if(epoch!==requestEpoch)return;
  $('rqAgentConsent').checked=false;
  working=false;requestController=null;requestBase=null;refreshControls();
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
  displayPhase='applied';
  notify(lang('Cambios aplicados. Puedes deshacer el último lote.',
   'Changes applied. You may undo the last batch.'));
 }else notify(userFacingError(response?.error,es()?'es':'en'),true);
}
function undo(){
 if(working)return;
 let response=null;
 document.dispatchEvent(new CustomEvent('runq:agent-undo',{detail:{respond:value=>{response=value;}}}));
 if(response?.ok){
  showPlan(null);displayPhase='idle';addMessage('assistant',lang('Último lote deshecho.','Last batch undone.'));
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
 const phase=make('span','rq-agent-phase');phase.id='rqAgentPhase';title.append(phase);
 const context=make('section','rq-agent-context');context.id='rqAgentContext';
 context.setAttribute('aria-label',lang('Contexto actual del cue','Current cue context'));
 const contextHeading=make('div','rq-agent-context-heading');
 const selectedCue=make('strong','');selectedCue.id='rqAgentContextCue';
 const showName=make('small','');showName.id='rqAgentShowName';
 contextHeading.append(selectedCue,showName);
 const source=make('p','rq-agent-context-source');source.id='rqAgentContextSource';
 const audio=make('small','rq-agent-context-audio');audio.id='rqAgentContextAudio';
 const contextActions=make('div','rq-agent-actions');
 const viewSource=make('button','btn subtle small');viewSource.id='rqAgentViewSource';viewSource.type='button';
 const openCue=make('button','btn subtle small');openCue.id='rqAgentOpenCue';openCue.type='button';
 const library=make('button','btn subtle small');library.id='rqAgentOpenLibrary';library.type='button';
 contextActions.append(viewSource,openCue,library);context.append(contextHeading,source,audio,contextActions);
 const messages=make('div','rq-agent-messages');messages.id='rqAgentMessages';
 const proposals=make('section','rq-agent-proposal');proposals.id='rqAgentProposal';proposals.hidden=true;
 const reviewSummary=make('strong','');reviewSummary.id='rqAgentReviewSummary';proposals.append(reviewSummary);
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
 const soundLabel=make('label','rq-agent-selected-sound');
 const soundTitle=make('span','');
 soundLabel.append(soundTitle);
 soundLabel.htmlFor='rqAgentSelectedSound';
 const sound=make('select','');sound.id='rqAgentSelectedSound';soundLabel.append(sound);
 const examples=make('div','rq-agent-examples');
 const exampleCopies=[];
 for(const [esText,enText,esCommand,enCommand] of [
  ['Revisar show','Audit show','Revisa el show','Audit the show'],
  ['Pies de voz','Voice triggers','Pon pies de voz coherentes a todos los cues','Assign spoken triggers to all cues'],
  ['Preparar cierre','Prepare ending','Añade tres cues para rematar el show','Add three cues to finish the show'],
  ['Resumen','Summary','Resumen del proyecto','Show summary']
 ]){
  const b=make('button','btn subtle small',lang(esText,enText));b.type='button';
  exampleCopies.push([b,esText,enText]);
  b.addEventListener('click',()=>{const cmd=lang(esCommand,enCommand);input.value=cmd;void sendRequest(false,cmd);});examples.append(b);
 }
 const voice=make('details','rq-agent-ai-options');voice.id='rqAgentVoice';
 voice.append(make('summary','',lang('Dictar instrucción · revisión manual','Dictate instruction · manual review')));
 const voiceConsentLabel=make('label','rq-agent-consent');
 const voiceConsent=make('input','');voiceConsent.type='checkbox';voiceConsent.id='rqAgentVoiceConsent';
 voiceConsentLabel.append(voiceConsent,make('span','',lang(
  'Autorizo enviar esta grabación a Meta para transcribirla (puede tener coste).',
  'I authorize this recording to be sent to Meta for transcription (may incur a charge).')));
 const voiceActions=make('div','rq-agent-actions');
 const record=make('button','btn subtle small',lang('Grabar instrucción (10 s)','Record instruction (10 s)'));
 record.type='button';record.id='rqAgentRecord';
 const transcribe=make('button','btn subtle small',lang('Transcribir grabación','Transcribe recording'));
 transcribe.type='button';transcribe.id='rqAgentTranscribe';transcribe.disabled=true;
 voiceActions.append(record,transcribe);
 const voiceStatus=make('output','rq-agent-status');voiceStatus.id='rqAgentVoiceStatus';
 voiceStatus.setAttribute('role','status');
 voice.append(voiceConsentLabel,voiceActions,voiceStatus);
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
 const cancel=make('button','btn subtle small',lang('Cancelar pendiente','Cancel pending'));
 cancel.type='button';cancel.id='rqAgentCancel';cancel.disabled=true;
 actions.append(local,cloud,undoButton,cancel);
 const status=make('output','rq-agent-status',
  lang('Sin modificaciones pendientes.','No pending modifications.'));
 status.id='rqAgentStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 composer.append(label,input,soundLabel,examples,voice,aiOptions,actions,status);
 panel.append(head,context,messages,proposals,composer);
 document.body.append(panel);
 chromeCopies=[
  ...exampleCopies,
  [title.querySelector('strong'),'Asistente de proyecto','Project agent'],
  [title.querySelector('small'),'Solo diseño y revisión · Ningún GO automático','Design and review only · No automatic GO'],
  [viewSource,'Ver guion','View script'],[openCue,'Abrir Cue Editor','Open Cue Editor'],
  [library,'Abrir Biblioteca','Open Library'],[label,'¿Qué quieres cambiar en este espectáculo?','What would you like to change in this show?'],
  [local,'Proponer localmente','Plan locally'],[cloud,'Consultar IA','Ask AI'],[undoButton,'Deshacer lote','Undo batch'],
  [cancel,'Cancelar pendiente','Cancel pending'],[approve,'Aplicar lote seleccionado','Apply selected batch'],
  [discard,'Descartar','Discard'],[aiSummary,'Servicio de IA y permisos','AI service and permissions'],
  [soundTitle,'Sonido para crear un cue (elección explícita)','Sound for a configured cue (explicit selection)'],
  [voice.querySelector('summary'),'Dictar instrucción · revisión manual','Dictate instruction · manual review'],
  [providerLabel.querySelector('span'),'Proveedor para consulta opcional','Provider for optional request'],
  [consentLabel.querySelector('span'),'Autorizo una consulta con la instrucción y el contexto acotado del show al proveedor elegido (puede tener coste).',
   'I authorize one request with this instruction and bounded show context to the selected AI provider (may incur a charge).'],
  [consentDetails,'Incluye hasta 80 cues, 120 líneas originales del guion, nombres/estado de medios y hasta 8 mensajes recientes. No se envían archivos de audio.',
   'Includes up to 80 cues, 120 original script lines, media names/status and up to 8 recent messages. Audio files are never sent.'],
  [voiceConsentLabel.querySelector('span'),'Autorizo enviar esta grabación a Meta para transcribirla (puede tener coste).',
   'I authorize this recording to be sent to Meta for transcription (may incur a charge).'],
  [transcribe,'Transcribir grabación','Transcribe recording'],
 ];
 const navigate=workspace=>document.querySelector(`[data-workspace-nav="${workspace}"]`)?.click();
 viewSource.addEventListener('click',()=>{
  const s=state(),cue=s?.project.cues.find(item=>item.id===s.selectedCueId);
  if(cue?.sourceLineIds[0])document.dispatchEvent(new CustomEvent('runq:navigate-to-source',{detail:{lineId:cue.sourceLineIds[0]}}));
  close();
 });
 openCue.addEventListener('click',()=>{
  const s=state();
  if(s?.selectedCueId)document.dispatchEvent(new CustomEvent('runq:navigate-to-cue',{detail:{cueId:s.selectedCueId}}));
  close();
 });
 library.addEventListener('click',()=>{navigate('audio');close();});
 $('uiLocaleSelect')?.addEventListener('change',()=>{renderChrome();sync();refreshControls();});
 renderChrome();
 dictation=createCommandDictation({
  owner:'agent-command',contextKey,
  onTranscript:text=>{input.value=text;input.focus();},
  onStatus:(code,error)=>{
   voiceStatus.textContent=commandDictationMessage(code,es()?'es':'en');
   voiceStatus.classList.toggle('is-error',error);
  },onChange:refreshControls,
 });
 record.addEventListener('click',()=>{
  dictationContext=contextKey();void dictation.record();
 });
 transcribe.addEventListener('click',()=>void dictation.transcribe(voiceConsent.checked,es()?'es':'en'));
 cancel.addEventListener('click',()=>cancelPending());
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
 document.addEventListener('runq:operator-stop-all',()=>cancelPending());
 window.addEventListener('pagehide',()=>cancelPending());
 sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);
else mount();
