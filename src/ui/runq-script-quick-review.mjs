/** Lightweight human review next to the imported script; never invokes AI or GO. */
import {parseScript} from '../core/script.mjs';
const el=(tag,cls='',text='')=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text)node.textContent=text;
 return node;
};
const copy=(es,en)=>document.getElementById('uiLocaleSelect')?.value==='es'?es:en;
function send(name,detail){
 let answer;
 document.dispatchEvent(new CustomEvent(name,{detail:{...detail,respond:value=>{answer=value;}}}));
 return answer??{ok:false,error:'NO_RESPONSE'};
}
export function mountScriptQuickReview(host,{getState,onAdvanced}){
 const section=el('section','rq-script-quick-review');
 section.id='rqScriptQuickReview';
 section.hidden=true;
 const heading=el('div','rq-script-quick-review-heading');
 const title=el('h4');
 const subtitle=el('p');
 const headingText=el('div','rq-script-quick-review-heading-text');
 const progressSummary=el('span','rq-script-quick-progress-summary');
 progressSummary.id='rqScriptQuickProgressText';
 const reviewProgress=el('progress','rq-script-quick-progress');
 reviewProgress.id='rqScriptQuickProgress';
 reviewProgress.setAttribute('aria-label',copy('Propuestas revisadas','Suggestions reviewed'));
 headingText.append(title,subtitle,progressSummary,reviewProgress);
 const approveAll=el('button','btn accent small');
 approveAll.type='button';approveAll.id='rqScriptQuickApproveAll';
 heading.append(headingText,approveAll);
 const feedback=el('div','rq-script-quick-feedback');
 const message=el('p','rq-script-quick-message');
 message.id='rqScriptQuickReviewMessage';
 message.setAttribute('role','status');
 message.setAttribute('aria-live','polite');
 const undo=el('button','btn subtle small',copy('Deshacer','Undo'));
 undo.type='button';undo.id='rqScriptQuickUndo';
 undo.hidden=true;
 feedback.append(message,undo);
 const list=el('div','rq-script-quick-list');
 list.id='rqScriptQuickList';
 const footer=el('div','rq-script-quick-footer');
 const showMore=el('button','btn subtle small');
 showMore.type='button';showMore.id='rqScriptQuickShowMore';
 const advanced=el('button','btn subtle small');
 advanced.type='button';advanced.id='rqScriptQuickAdvanced';
 advanced.addEventListener('click',onAdvanced);
 footer.append(showMore,advanced);
 section.append(heading,feedback,list,footer);
 host.append(section);
 let expanded=false,lastProject=null,lastLocale=null,undoAvailable=false;
 const MAX_PREVIEW=1;
 function decide(ids,decision){
  if(!ids.length)return;
  if(ids.length>1&&!window.confirm(copy(
   '¿'+(decision==='APPROVE'?'Aprobar':'Rechazar')+' las '+ids.length+' propuestas?',
   (decision==='APPROVE'?'Approve':'Reject')+' '+ids.length+' suggestions?')))return;
  const result=send('runq:proposal-batch-decision',{proposalIds:ids,decision,operationTriggers:false});
  if(!result.ok){
   message.textContent=copy('No se pudo completar: ','Could not finish: ')+(result.error??'');
  }else{
   undoAvailable=true;
   message.textContent=decision==='APPROVE'
    ?copy(ids.length===1?'Cue aprobado.':'Cues aprobados: '+result.count,
      ids.length===1?'Cue approved.':'Cues approved: '+result.count)
    :copy(ids.length===1?'Propuesta descartada.':'Propuestas descartadas: '+result.count,
      ids.length===1?'Suggestion discarded.':'Suggestions discarded: '+result.count);
  }
  render(true);
  if(result.ok){
   const next=list.querySelector('[data-quick-approve]');
   if(next)next.focus({preventScroll:true});
   else title.focus({preventScroll:true});
  }
 }
 function saveEdit(p,input,prompt){
  const result=send('runq:builder-review-edit',{
   op:'proposal',id:p.id,label:input.value,prompt:prompt?.value
  });
  message.textContent=result.ok
   ?copy('Cambios guardados; aún debes aprobar esta propuesta.','Changes saved; suggestion still needs approval.')
   :copy('No se pudo guardar: ','Could not save: ')+(result.error??'');
  if(result.ok){
   undoAvailable=false;render(true);
   const edited=[...list.children].find(row=>row.dataset.scriptProposal===p.id);
   edited?.querySelector('[data-quick-approve]')?.focus({preventScroll:true});
  }
 }
 function proposalRow(p,lines){
  const row=el('article','rq-script-quick-item');
  row.dataset.scriptProposal=p.id;
  row.setAttribute('aria-label',copy('Propuesta para revisar','Suggestion to review')+' · '+p.label);
  const head=el('div','rq-script-quick-item-main');
  const identity=el('div','rq-script-quick-item-identity');
  identity.append(el('strong','',p.label));
  const line=p.sourceLineIds?.[0]??'';
  const excerpt=lines.get(line)?.text??'';
  const evidence=el('span','rq-script-quick-evidence');
  const lineRef=el('span','rq-script-quick-line-ref',line);
  if(line) evidence.append(lineRef);
  if(excerpt){
   const excerptText=el('span','rq-script-quick-excerpt',excerpt);
   excerptText.title=excerpt;
   evidence.append(excerptText);
  }
  identity.append(evidence);
  const actions=el('div','rq-script-quick-item-actions');
  const accept=el('button','btn accent small',copy('Aprobar','Approve'));
  accept.type='button';accept.dataset.quickApprove=p.id;
  accept.setAttribute('aria-label',copy('Aprobar propuesta: ','Approve suggestion: ')+p.label);
  accept.addEventListener('click',()=>decide([p.id],'APPROVE'));
  const edit=el('button','btn subtle small',copy('Editar','Edit'));
  edit.type='button';edit.dataset.quickEdit=p.id;
  edit.setAttribute('aria-label',copy('Editar propuesta: ','Edit suggestion: ')+p.label);
  const reject=el('button','btn subtle small rq-script-quick-reject',copy('Descartar','Discard'));
  reject.type='button';reject.dataset.quickReject=p.id;
  reject.setAttribute('aria-label',copy('Descartar propuesta: ','Discard suggestion: ')+p.label);
  reject.addEventListener('click',()=>decide([p.id],'REJECT'));
  actions.append(accept,edit,reject);
  head.append(identity,actions);
  const form=el('div','rq-script-quick-edit-form');
  form.hidden=true;
  const nameLabel=el('label','',copy('Nombre de la propuesta','Suggestion name'));
  const name=el('input');
  name.value=p.label;name.maxLength=200;
  nameLabel.append(name);form.append(nameLabel);
  const planned=p.actions?.find(a=>a.type==='PLAN_AUDIO');
  let prompt;
  if(planned){
   const description=el('label','',copy('Descripción del sonido','Sound description'));
   prompt=el('textarea');
   prompt.maxLength=500;prompt.rows=3;prompt.value=planned.prompt;
   description.append(prompt);form.append(description);
  }
  const formActions=el('div','rq-script-quick-item-actions');
  const save=el('button','btn accent small',copy('Guardar','Save'));
  save.type='button';save.addEventListener('click',()=>saveEdit(p,name,prompt));
  const cancel=el('button','btn subtle small',copy('Cancelar','Cancel'));
  cancel.type='button';cancel.addEventListener('click',()=>{form.hidden=true;edit.setAttribute('aria-expanded','false');});
  formActions.append(save,cancel);form.append(formActions);
  edit.setAttribute('aria-expanded','false');
  edit.addEventListener('click',()=>{
   form.hidden=!form.hidden;
   edit.setAttribute('aria-expanded',String(!form.hidden));
   if(!form.hidden)name.focus();
  });
  row.append(head,form);
  return row;
 }
 function render(force=false){
  const project=getState()?.project;
  const locale=document.getElementById('uiLocaleSelect')?.value==='es'?'es':'en';
  if(!project)return;
  if(!force&&lastProject===project&&lastLocale===locale)return;
  lastProject=project;lastLocale=locale;
  const pending=project.proposals.filter(p=>p.status==='PENDING');
  const reviewed=project.proposals.filter(p=>p.status!=='PENDING').length;
  section.hidden=!project.scriptText.trim()||project.proposals.length===0;
  if(section.hidden)return;
  title.tabIndex=-1;
  title.textContent=pending.length
   ?copy('Decide qué cues incorporar','Choose which cues to add')
   :copy('Revisión completada','Review complete');
  subtitle.textContent=pending.length
   ?copy('Las sugerencias no se añaden al show hasta que las apruebas.',
     'Suggestions are not added to your show until you approve them.')
   :copy('Ya puedes configurar sonidos y pies en Cues.',
     'You can now configure sounds and triggers in Cues.');
  const total=pending.length+reviewed;
  reviewProgress.setAttribute('aria-label',copy('Propuestas revisadas','Suggestions reviewed'));
  reviewProgress.max=Math.max(1,total);
  reviewProgress.value=reviewed;
  reviewProgress.setAttribute('aria-valuetext',reviewed+' / '+total);
  progressSummary.textContent=copy(
    'Revisadas '+reviewed+' de '+total+' · '+pending.length+' pendientes',
    'Reviewed '+reviewed+' of '+total+' · '+pending.length+' remaining');
  approveAll.textContent=copy('Aprobar las '+pending.length+' restantes',
    'Approve remaining '+pending.length);
  undo.hidden=!undoAvailable;
  approveAll.hidden=pending.length<2;
  list.replaceChildren();
  const lines=new Map(parseScript(project.scriptText).map(x=>[x.id,x]));
  const visible=expanded?pending:pending.slice(0,MAX_PREVIEW);
  for(const p of visible)list.append(proposalRow(p,lines));
  if(!pending.length){
   list.append(el('p','rq-script-quick-complete',copy(
     'Todas las propuestas están revisadas. Los cues aprobados ya están en tu espectáculo.',
     'All suggestions are reviewed. Approved cues are now part of your show.')));
  }
  showMore.hidden=pending.length<=MAX_PREVIEW;
  showMore.setAttribute('aria-expanded',String(expanded));
  showMore.setAttribute('aria-controls','rqScriptQuickList');
  showMore.textContent=expanded
   ?copy('Revisar una a una','Review one at a time')
   :copy('Ver todas las propuestas ('+pending.length+')',
     'View all suggestions ('+pending.length+')');
  advanced.textContent=pending.length
   ?copy('Herramientas avanzadas de cues','Advanced cue tools')
   :copy('Continuar: configurar cues','Continue: configure cues');
 }
 showMore.addEventListener('click',()=>{expanded=!expanded;render(true);});
 undo.addEventListener('click',()=>{
   const result=send('runq:proposal-batch-undo',{});
   undoAvailable=false;
   message.textContent=result.ok
    ?copy('Última decisión deshecha.','Last decision undone.')
    :copy('No se pudo deshacer esta decisión.','This decision could not be undone.');
   render(true);
 });
 approveAll.addEventListener('click',()=>{
  const state=getState();
  decide(state.project.proposals.filter(p=>p.status==='PENDING').map(p=>p.id),'APPROVE');
 });
 document.addEventListener('runq:show-state-changed',()=>render());
 document.getElementById('uiLocaleSelect')?.addEventListener('change',()=>render(true));
 render(true);
 return {section,render};
}
