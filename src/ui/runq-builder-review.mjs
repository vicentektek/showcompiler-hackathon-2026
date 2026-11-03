/** Unified proposal/cue review. No hidden playback, provider requests or automatic approval. */
import {parseScript} from '../core/script.mjs';
import {proposeAgentVoiceTriggers,MAX_VOICE_BATCH} from '../core/agentVoice.mjs';
const E=(tag,cls='',value='')=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value)n.textContent=value;return n;};
const S=(es,en)=>document.getElementById('uiLocaleSelect')?.value==='es'?es:en;
const B=(value,fn,cls='btn subtle small')=>{const b=E('button',cls,value);b.type='button';b.addEventListener('click',fn);return b;};
function send(name,payload){let answer;document.dispatchEvent(new CustomEvent(name,{detail:{...payload,respond:value=>{answer=value;}}}));return answer??{ok:false,error:'NO_RESPONSE'};}
export function mountUnifiedCueReview(host,{getState,onSuggest}){
 if(!host||host.querySelector('#rqUnifiedCueReview'))return;
 const root=E('section','rq-unified-review');root.id='rqUnifiedCueReview';
 const title=E('h4','rq-review-title');
 const count=E('span','rq-review-count');
 const header=E('div','rq-review-head');header.append(title,count);
 const controls=E('div','rq-review-controls');
 const filter=E('select');filter.id='rqReviewFilter';
 for(const [v,es,en]of[['all','Todos','All'],['pending','Pendientes','Pending'],['approved','Cues aprobados','Approved cues']]){
  const o=E('option','',S(es,en));o.value=v;filter.append(o);
 }
 const search=E('input');search.type='search';search.id='rqReviewSearch';search.setAttribute('aria-label',S('Buscar cues y propuestas','Search cues and proposals'));
 const pickAll=B(S('Seleccionar visibles','Select visible'),()=>{
  for(const row of shown(getState().project))selection.add(row.kind+':'+row.id);
  list.querySelectorAll('[data-review-select]').forEach(c=>{c.checked=selection.has(c.dataset.reviewSelect);});
  selectionText();
 });
 const clear=B(S('Quitar selección','Clear selection'),()=>{
  selection.clear();
  list.querySelectorAll('[data-review-select]').forEach(c=>{c.checked=false;});
  selectionText();
 });
 controls.append(filter,search,pickAll,clear);
 const toolbar=E('div','rq-review-bulk');
 const approve=B('',()=>review('APPROVE'),'btn accent small');
 const reject=B('',()=>review('REJECT'));
 const undo=B('',()=>{const a=send('runq:proposal-batch-undo',{});status.textContent=a.ok?S('Revisión deshecha','Review undone'):S('No se puede deshacer tras editar el espectáculo','Cannot undo after editing the show');render();});
 const undoFeet=B('',()=>{
  const a=send('runq:builder-trigger-undo',{});
  status.textContent=a.ok?S('Pies restaurados','Triggers restored'):S('No hay cambios recientes de pies que deshacer','No recent trigger edits to undo');
  if(a.ok)render();
 });
 const suggest=B('',()=>onSuggest());
 const suggestSelected=B('',()=>{
  const state=getState(),ids=selectedCues();
  if(!ids.length){status.textContent=S('Selecciona cues para mejorar','Select cues to improve');return;}
  const selected=state.project.cues.filter(c=>ids.includes(c.id));
  document.dispatchEvent(new CustomEvent('runq:show-builder-ask-ai'));
  const prompt=document.getElementById('rqAgentPrompt');
  if(prompt){
   const items=selected.map(c=>'Q'+c.number+' '+c.label+' ('+c.sourceLineIds.join(', ')+')').join('; ');
   prompt.value=S('Propón mejoras revisables de nombre, pie de operación y diseño sonoro para los cues seleccionados: ',
     'Suggest reviewable name, operator trigger and sound-design improvements for these selected cues: ')+items+
     S('. No apliques cambios ni ejecutes GO.','. Do not apply changes or execute GO.');
   prompt.dispatchEvent(new Event('input',{bubbles:true}));
   prompt.focus();
  }
 });
 const foot=B('',()=>suggestFeet());
 const wav=B('',()=>{const ids=selectedCues();if(ids.length!==1){status.textContent=S('Selecciona un solo cue','Select one cue');return;}document.dispatchEvent(new CustomEvent('runq:prompt-import-cue',{detail:{cueId:ids[0]}}));});
 const approveAll=B('',()=>review('APPROVE',getState().project.proposals.filter(p=>p.status==='PENDING').map(p=>p.id)));
 const mainActions=E('div','rq-review-main-actions');
 const selectionActions=E('div','rq-review-selected-actions');
 const more=E('details','rq-review-more-tools');
 more.id='rqReviewMoreTools';
 const moreLabel=E('summary','',S('Más herramientas','More tools'));
 more.append(moreLabel,undo,undoFeet);
 mainActions.append(approveAll,suggest,foot);
 selectionActions.append(approve,reject,suggestSelected,wav);
 toolbar.append(mainActions,selectionActions,more);
 const status=E('p','rq-review-message');status.id='rqReviewMessage';status.setAttribute('role','status');
 const list=E('div','rq-review-list');list.id='rqReviewList';
 const footPreview=E('section','rq-review-foot-preview');footPreview.id='rqReviewTriggerPreview';footPreview.hidden=true;
 root.append(header,controls,toolbar,status,list,footPreview);
 host.prepend(root);
 const selection=new Set();let previousProject=null,planned=null;
 let lastPaintedProject=null,lastPaintedLocale=null;
 function all(project){return[
  ...project.proposals.filter(p=>p.status==='PENDING').map(p=>({kind:'proposal',id:p.id,data:p})),
  ...project.cues.map(c=>({kind:'cue',id:c.id,data:c}))
 ];}
 function shown(project){
  const query=search.value.trim().toLocaleLowerCase();
  return all(project).filter(x=>(filter.value==='all'||(filter.value==='pending'?x.kind==='proposal':x.kind==='cue'))&&
    (!query||[x.data.label,x.data.trigger??'',...(x.data.sourceLineIds??[])].join(' ').toLocaleLowerCase().includes(query)));
 }
 const selectedCues=()=>[...selection].filter(x=>x.startsWith('cue:')).map(x=>x.slice(4));
 function review(decision,ids=null){
  const candidates=ids??[...selection].filter(k=>k.startsWith('proposal:')).map(k=>k.slice(9));
  const project=getState()?.project;
  const pending=new Set(project?.proposals.filter(p=>p.status==='PENDING').map(p=>p.id));
  const valid=candidates.filter(id=>pending.has(id));
  if(!valid.length){status.textContent=S('Selecciona propuestas pendientes','Select pending proposals');return;}
  if(valid.length>1&&!window.confirm(S('¿Revisar '+valid.length+' propuestas?','Review '+valid.length+' proposals?')))return;
  const result=send('runq:proposal-batch-decision',{proposalIds:valid,decision,operationTriggers:false});
  status.textContent=result.ok?S('Propuestas revisadas: ','Reviewed proposals: ')+result.count:S('No se pudo completar la revisión','Review failed')+' '+(result.error??'');
  if(result.ok)for(const id of valid)selection.delete('proposal:'+id);
  render();
 }
 function edit(op,values){
  const r=send('runq:builder-review-edit',{op,...values});
  status.textContent=r.ok?S('Guardado sin ejecutar GO','Saved without GO'):S('Edición no aplicada','Edit not applied')+' '+(r.error??'');
  if(r.ok)render();
  return r;
 }
 function selectedCheckbox(key,label){
  const c=E('input');c.type='checkbox';c.checked=selection.has(key);c.dataset.reviewSelect=key;
  c.setAttribute('aria-label',S('Seleccionar ','Select ')+label);
  c.addEventListener('change',()=>{c.checked?selection.add(key):selection.delete(key);selectionText();});
  return c;
 }
 function editor(parent,build){
  const details=E('details','rq-review-details');
  details.append(E('summary','',S('Revisar / editar','Review / edit')));
  details.addEventListener('toggle',()=>{if(details.open&&details.childElementCount===1)build(details);});
  parent.append(details);
 }
 function proposalCard(p,lines){
  const card=E('article','rq-review-card');card.dataset.reviewProposal=p.id;
  const row=E('div','rq-review-card-top'),desc=E('div','rq-review-identity');
  const line=p.sourceLineIds[0];const excerpt=lines.get(line)?.text??'';
  desc.append(E('strong','',p.label),E('small','',line+' · '+excerpt));
  row.append(selectedCheckbox('proposal:'+p.id,p.label),desc,E('span','rq-review-pill pending',S('PROPUESTA','SUGGESTION')));
  const actions=E('div','rq-review-row-actions');
  actions.append(B(S('Aprobar','Approve'),()=>review('APPROVE',[p.id]),'btn accent small'),
    B(S('Rechazar','Reject'),()=>review('REJECT',[p.id])));
  card.append(row,actions);
  editor(card,target=>{
    const form=E('div','rq-review-edit');
    const label=E('label','',S('Nombre','Name'));const input=E('input');input.maxLength=200;input.value=p.label;label.append(input);form.append(label);
    const plan=p.actions.find(a=>a.type==='PLAN_AUDIO');let prompt;
    if(plan){const wrap=E('label','',S('Descripción sonora','Sound description'));prompt=E('textarea');prompt.maxLength=500;prompt.rows=3;prompt.value=plan.prompt;wrap.append(prompt);form.append(wrap);}
    form.append(E('p','rq-review-evidence',line+' · '+excerpt));
    form.append(B(S('Guardar propuesta','Save proposal'),()=>edit('proposal',{id:p.id,label:input.value,prompt:prompt?.value}),'btn accent small'));
    target.append(form);
  });
  return card;
 }
 function soundText(c,project){
  const a=c.actions[0];
  if(a?.type==='SILENT')return S('SILENCIO · GO listo','SILENCE · GO ready');
  if(a?.type==='PLAN_AUDIO')return S('Audio pendiente','Audio pending');
  if(a?.type==='PLAY')return project.assets.find(x=>x.id===a.assetId)?.name??S('Archivo ausente','Missing file');
  return S('Acción no definida','Unknown action');
 }
 function cueCard(c,project,lines){
  const card=E('article','rq-review-card');card.dataset.reviewCue=c.id;
  const row=E('div','rq-review-card-top'),identity=E('div','rq-review-identity');
  identity.append(E('strong','',String(c.number).padStart(2,'0')+' · '+c.label),
    E('small','',(c.sourceLineIds.join(', ')||'—')+' · '+(c.trigger||S('Sin pie','No trigger'))+' · '+soundText(c,project)));
  row.append(selectedCheckbox('cue:'+c.id,c.label),identity,E('span','rq-review-pill',c.actions[0]?.type==='SILENT'?S('SILENCIO','SILENCE'):'CUE'));
  const actions=E('div','rq-review-row-actions');
  const acceptsAudio=c.actions.length===1&&!(c.audioTracks?.length);
  const load=B(S('Importar WAV','Import WAV'),()=>document.dispatchEvent(new CustomEvent('runq:prompt-import-cue',{detail:{cueId:c.id}})));
  load.disabled=!acceptsAudio;
  const silent=B(S('Silencio','Silence'),()=>{
    if(!window.confirm(S('¿Convertir este cue a SILENCIO?','Mark this cue SILENCE?')))return;
    edit('silent',{id:c.id});
  });
  silent.disabled=!acceptsAudio||c.actions[0]?.type==='SILENT';
  actions.append(load,silent);
  card.append(row,actions);
  editor(card,target=>{
    const form=E('div','rq-review-edit');
    const label=E('label','',S('Nombre','Name')),name=E('input');
    name.value=c.label;name.maxLength=200;label.append(name);
    const trigger=E('label','',S('Pie de operación','Operator trigger')),footInput=E('input');
    footInput.value=c.trigger??'';footInput.maxLength=300;trigger.append(footInput);
    form.append(label,trigger);
    const line=c.sourceLineIds[0];
    if(line)form.append(E('p','rq-review-evidence',line+' · '+(lines.get(line)?.text??'')));
    form.append(B(S('Guardar nombre y pie','Save name and trigger'),()=>edit('cue',{id:c.id,label:name.value,trigger:footInput.value}),'btn accent small'));
    const audio=E('label','',S('Audio de biblioteca','Library audio')),options=E('select');
    const first=E('option','',S('Selecciona audio','Select sound'));first.value='';options.append(first);
    for(const asset of project.assets){const o=E('option','',asset.name);o.value=asset.id;options.append(o);}
    audio.append(options);form.append(audio);
    const assign=B(S('Asignar sonido','Assign sound'),()=>edit('asset',{id:c.id,assetId:options.value}));
    assign.disabled=!acceptsAudio||project.assets.length===0;form.append(assign);
    const source=B(S('Ver en guion','View in script'),()=>document.dispatchEvent(new CustomEvent('runq:builder-open-script-line',{detail:{lineId:line}})));
    source.disabled=!line;form.append(source);
    target.append(form);
  });
  return card;
 }
 function selectionText(){
  const p=[...selection].filter(x=>x.startsWith('proposal:')).length,c=selectedCues().length;
  count.textContent=S(p+' propuestas · '+c+' cues seleccionados',p+' proposals · '+c+' cues selected');
  approve.disabled=reject.disabled=p===0;
  foot.disabled=(getState()?.project?.cues.length??0)===0;
  wav.disabled=c!==1;
  clear.disabled=selection.size===0;
  clear.hidden=selection.size===0;
  selectionActions.hidden=p+c===0;
  approve.hidden=reject.hidden=p===0;
  suggestSelected.hidden=c===0;
  wav.hidden=c!==1;
  suggestSelected.disabled=c===0;
 }
 function suggestFeet(){
  const state=getState();if(!state?.project)return;
  const chosen=selectedCues();
  const ids=(chosen.length?chosen:state.project.cues.filter(c=>!c.trigger?.trim()).map(c=>c.id)).slice(0,200);
  if(!ids.length){status.textContent=S('Todos los cues ya tienen pie','Every cue already has a trigger');return;}
  const suggestions=[],skipped=[];
  for(let i=0;i<ids.length;i+=MAX_VOICE_BATCH){
    const r=proposeAgentVoiceTriggers(state.project,{cueIds:ids.slice(i,i+MAX_VOICE_BATCH),max:MAX_VOICE_BATCH,onlyMissing:true});
    suggestions.push(...r.suggestions);skipped.push(...r.skipped);
  }
  planned={base:JSON.stringify(state.project),suggestions,skipped};
  drawFeet();
 }
 function drawFeet(){
  footPreview.replaceChildren();footPreview.hidden=!planned;
  if(!planned)return;
  footPreview.append(E('p','',S('Pies propuestos: ','Suggested triggers: ')+planned.suggestions.length+' · '+S('sin coincidencia: ','without match: ')+planned.skipped.length));
  const fields=[];
  for(const item of planned.suggestions){
    const wrap=E('label','rq-review-foot-line'),check=E('input'),input=E('input');
    check.type='checkbox';check.checked=true;input.value=item.trigger;input.maxLength=300;
    wrap.append(check,E('span','', 'Q'+item.cueNumber+' · '+item.evidenceLineId+' · '+item.speaker),input);
    fields.push({cueId:item.cueId,check,input});footPreview.append(wrap);
  }
  const buttons=E('div','rq-review-row-actions');
  buttons.append(B(S('Aplicar pies revisados','Apply reviewed triggers'),()=>{
    const changes=fields.filter(f=>f.check.checked).map(f=>({cueId:f.cueId,trigger:f.input.value.trim()}));
    if(!changes.length)return;
    const r=edit('triggers',{base:planned.base,changes});
    if(r.ok){planned=null;footPreview.hidden=true;}
  },'btn accent small'),B(S('Cancelar','Cancel'),()=>{planned=null;footPreview.hidden=true;}));
  footPreview.append(buttons);
 }
 function render(){
  const state=getState();if(!state?.project)return;
  if(previousProject!==state.project.id+'|'+state.project.scriptText+'|'+state.project.cues.length+'|'+state.project.proposals.length){
    previousProject=state.project.id+'|'+state.project.scriptText+'|'+state.project.cues.length+'|'+state.project.proposals.length;
    selection.clear();planned=null;footPreview.hidden=true;
  }
  title.textContent=S('Prepara los cues','Prepare your cues');
  moreLabel.textContent=S('Más herramientas','More tools');
  search.placeholder=S('Buscar cue, pie o Lxx','Search cue, trigger or Lxx');
  pickAll.textContent=S('Seleccionar visibles','Select visible');clear.textContent=S('Quitar selección','Clear selection');
  approve.textContent=S('Aprobar selección','Approve selection');
  reject.textContent=S('Rechazar selección','Reject selection');
  undo.textContent=S('Deshacer revisión','Undo review');
  suggest.textContent=S('Sugerir nuevos cues','Suggest new cues');
  suggestSelected.textContent=S('Sugerir mejoras · selección','Suggest changes · selection');
  suggestSelected.disabled=selectedCues().length===0;
  approveAll.textContent=S('Aprobar propuestas pendientes','Approve pending suggestions');
  approveAll.disabled=!state.project.proposals.some(p=>p.status==='PENDING');
  foot.textContent=selectedCues().length
    ?S('Proponer pies · selección','Suggest triggers · selected')
    :S('Proponer pies · todos sin pie','Suggest triggers · all missing');
  undoFeet.textContent=S('Deshacer pies','Undo triggers');
  wav.textContent=S('Importar WAV','Import WAV');
  const valid=new Set(all(state.project).map(x=>x.kind+':'+x.id));
  for(const id of selection)if(!valid.has(id))selection.delete(id);
  const lines=new Map(parseScript(state.project.scriptText).map(line=>[line.id,line]));
  list.replaceChildren();
  const items=shown(state.project);
  for(const x of items)list.append(x.kind==='cue'?cueCard(x.data,state.project,lines):proposalCard(x.data,lines));
  if(!items.length)list.append(E('p','rq-review-empty',S('No hay propuestas ni cues para mostrar.','No cues or suggestions to show.')));
  selectionText();
  lastPaintedProject=state.project;
  lastPaintedLocale=S('es','en');
 }
 filter.addEventListener('change',render);search.addEventListener('input',render);
 // Re-render only for actual project/locale changes. Frequent engine and UI
 // status refreshes must not destroy an operator's open unsaved cue form.
 document.addEventListener('runq:show-state-changed',()=>{
  const state=getState();
  if(state?.project!==lastPaintedProject||S('es','en')!==lastPaintedLocale)render();
 });
 document.getElementById('uiLocaleSelect')?.addEventListener('change',render);
 render();
}
