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
 headingText.append(title,subtitle);
 const approveAll=el('button','btn accent small');
 approveAll.type='button';approveAll.id='rqScriptQuickApproveAll';
 heading.append(headingText,approveAll);
 const message=el('p','rq-script-quick-message');
 message.id='rqScriptQuickReviewMessage';
 message.setAttribute('role','status');
 message.setAttribute('aria-live','polite');
 const list=el('div','rq-script-quick-list');
 list.id='rqScriptQuickList';
 const footer=el('div','rq-script-quick-footer');
 const showMore=el('button','btn subtle small');
 showMore.type='button';showMore.id='rqScriptQuickShowMore';
 const advanced=el('button','btn subtle small');
 advanced.type='button';advanced.id='rqScriptQuickAdvanced';
 advanced.addEventListener('click',onAdvanced);
 footer.append(showMore,advanced);
 section.append(heading,message,list,footer);
 host.append(section);
 let expanded=false,lastProject=null,lastLocale=null;
 const MAX_PREVIEW=4;
 function decide(ids,decision){
  if(!ids.length)return;
  if(ids.length>1&&!window.confirm(copy(
   '¿'+(decision==='APPROVE'?'Aprobar':'Rechazar')+' las '+ids.length+' propuestas?',
   (decision==='APPROVE'?'Approve':'Reject')+' '+ids.length+' suggestions?')))return;
  const result=send('runq:proposal-batch-decision',{proposalIds:ids,decision,operationTriggers:false});
  if(!result.ok){
   message.textContent=copy('No se pudo completar: ','Could not finish: ')+(result.error??'');
  }else{
   message.textContent=copy('Propuestas revisadas: ','Suggestions reviewed: ')+result.count;
  }
  render(true);
 }
 function saveEdit(p,input,prompt){
  const result=send('runq:builder-review-edit',{
   op:'proposal',id:p.id,label:input.value,prompt:prompt?.value
  });
  message.textContent=result.ok
   ?copy('Cambios guardados; aún debes aprobar esta propuesta.','Changes saved; suggestion still needs approval.')
   :copy('No se pudo guardar: ','Could not save: ')+(result.error??'');
  if(result.ok)render(true);
 }
 function proposalRow(p,lines){
  const row=el('article','rq-script-quick-item');
  row.dataset.scriptProposal=p.id;
  const head=el('div','rq-script-quick-item-main');
  const identity=el('div','rq-script-quick-item-identity');
  identity.append(el('strong','',p.label));
  const line=p.sourceLineIds?.[0]??'';
  const excerpt=lines.get(line)?.text??'';
  identity.append(el('span','',line+(excerpt?' · '+excerpt:'')));
  const actions=el('div','rq-script-quick-item-actions');
  const accept=el('button','btn accent small',copy('Aprobar','Approve'));
  accept.type='button';accept.dataset.quickApprove=p.id;
  accept.addEventListener('click',()=>decide([p.id],'APPROVE'));
  const edit=el('button','btn subtle small',copy('Editar','Edit'));
  edit.type='button';edit.dataset.quickEdit=p.id;
  const reject=el('button','btn subtle small',copy('Descartar','Discard'));
  reject.type='button';reject.dataset.quickReject=p.id;
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
  title.textContent=pending.length
   ?copy('Revisa las propuestas de RUNQ','Review RUNQ suggestions')
   :copy('Propuestas revisadas','Suggestions reviewed');
  subtitle.textContent=pending.length
   ?copy(pending.length+' pendientes · '+reviewed+' revisadas. Decide aquí, sin cambiar de pantalla.',
     pending.length+' pending · '+reviewed+' reviewed. Decide here, without switching views.')
   :copy('Todas las propuestas tienen una decisión. Puedes seguir preparando el espectáculo.',
     'Every suggestion has a decision. You can continue preparing your show.');
  approveAll.textContent=copy('Aprobar todas ('+pending.length+')','Approve all ('+pending.length+')');
  approveAll.hidden=pending.length<2;
  list.replaceChildren();
  const lines=new Map(parseScript(project.scriptText).map(x=>[x.id,x]));
  const visible=expanded?pending:pending.slice(0,MAX_PREVIEW);
  for(const p of visible)list.append(proposalRow(p,lines));
  if(!pending.length){
   list.append(el('p','rq-script-quick-complete',copy(
     'Revisión completada. Abre Cues cuando quieras configurar pies y sonidos.',
     'Review complete. Open Cues whenever you want to set triggers or sound.')));
  }
  showMore.hidden=pending.length<=MAX_PREVIEW;
  showMore.textContent=expanded
   ?copy('Mostrar menos','Show less')
   :copy('Ver las '+(pending.length-MAX_PREVIEW)+' restantes',
     'Show '+(pending.length-MAX_PREVIEW)+' more');
  advanced.textContent=copy('Editor completo de cues','Full cue editor');
 }
 showMore.addEventListener('click',()=>{expanded=!expanded;render(true);});
 approveAll.addEventListener('click',()=>{
  const state=getState();
  decide(state.project.proposals.filter(p=>p.status==='PENDING').map(p=>p.id),'APPROVE');
 });
 document.addEventListener('runq:show-state-changed',()=>render());
 document.getElementById('uiLocaleSelect')?.addEventListener('change',()=>render(true));
 render(true);
 return {section,render};
}
