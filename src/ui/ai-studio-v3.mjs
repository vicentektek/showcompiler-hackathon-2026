/**
 * Stagecraft AI Studio V3 — progressive enhancement of the EXISTING live
 * script review and genuine SFX laboratory. No duplicate inference, playback
 * or project model. A selected/accepted sound can become a cue AFTER listening.
 */
const $=id=>document.getElementById(id);
const node=(tag,cls,text)=>{
  const item=document.createElement(tag);
  if(cls)item.className=cls;
  if(text!==undefined)item.textContent=text;
  return item;
};
const locale=()=> $('uiLocaleSelect')?.value==='en'?'en':'es';
const messages={
  es:{
    title:'AI STUDIO',intro:'Del guion al sonido y del sonido al cue, en el orden que tú elijas.',
    source:'ORIGEN',free:'Sonido independiente',from:'Guion',cue:'Cue',openScript:'Analizar guion',
    openSound:'Diseñar sonido',soundFirst:'Diseñar sonido primero',
    soundHint:'Ningún cue se creará hasta que lo decidas.',
    pending:'Sin cue creado',existing:'Cue existente',use:'Usar este sonido…',
    available:'Toma aceptada y verificada',need:'Primero genera, escucha y acepta un WAV, o importa uno local.',
    choice:'¿Dónde quieres utilizarlo?',modeLibrary:'Guardar solo en biblioteca',
    modeNew:'Crear cue y añadir sonido',modeExisting:'Utilizar en un cue existente',
    chooseCue:'Elegir cue',name:'Nombre del nuevo cue',action:'¿Añadir o reemplazar?',
    add:'Añadir pista',replace:'Reemplazar pista',track:'Pista a reemplazar',
    main:'Pista principal',apply:'Confirmar destino',
    close:'Cerrar opciones',library:'Sin cue · Solo biblioteca',
    saved:'El sonido permanece disponible. NEXT GO no cambia.',
    selectCue:'Selecciona un cue existente.',openCue:'Ver cue en Editor',
    local:'Importar WAV local',localHint:'Archivo local: no requiere generación ni aceptación de proveedor.',
    imported:'Recurso incorporado',offline:'Puedes crear cues manuales o usar archivos locales sin IA.',
    error:'No se ha podido completar la asignación. Se conserva el audio ya importado.',
    modified:'Ya existe una descripción: ¿reemplazarla por la sugerencia de guion?',
    go:'Ir a AI Studio',cost:'Cada nueva generación necesita autorización; conservar una toma anterior no cuesta otra solicitud.',
    none:'No hay un archivo revisado todavía. Nada se enviará automáticamente.',
    reassign:'Elegir otro destino sin generar de nuevo',context:'CONTEXTO DE GUION',
    libraryGo:'Abrir biblioteca',scriptReady:'Sonido ya preparado para esta propuesta',
    after:'Crear cue y añadir sonido',another:'Otra interpretación',
  },
  en:{
    title:'AI STUDIO',intro:'Script to sound, sound to cue. Choose the order that works for you.',
    source:'SOURCE',free:'Independent sound',from:'Script',cue:'Cue',openScript:'Analyze script',
    openSound:'Design sound',soundFirst:'Design sound first',
    soundHint:'No cue will be created until you decide to create one.',
    pending:'No cue created',existing:'Existing cue',use:'Use this sound…',
    available:'Accepted and verified take',need:'Generate, listen and accept a WAV first, or import a local sound.',
    choice:'Where should this sound go?',modeLibrary:'Save to library only',
    modeNew:'Create cue and add sound',modeExisting:'Use an existing cue',
    chooseCue:'Choose cue',name:'New cue name',action:'Add or replace?',
    add:'Add track',replace:'Replace track',track:'Track to replace',
    main:'Main track',apply:'Confirm destination',close:'Close options',
    library:'No cue · Library only',saved:'The sound stays available. NEXT GO is unchanged.',
    selectCue:'Choose an existing cue.',openCue:'Open cue in Editor',
    local:'Import local WAV',localHint:'Local file: no model request or provider acceptance required.',
    imported:'Sound added',offline:'Manual cue editing and local audio remain available without AI.',
    error:'Assignment failed. Already imported audio remains available.',
    modified:'Replace your current sound description with the script suggestion?',
    go:'Go to AI Studio',cost:'Each new generation needs authorization; reusing an earlier take makes no new request.',
    none:'No reviewed file yet. No generation request is sent automatically.',
    reassign:'Choose another destination without regenerating',context:'SCRIPT CONTEXT',
    libraryGo:'Open audio library',scriptReady:'Sound is ready for this proposal',
    after:'Create cue and add sound',another:'Another interpretation',
  },
};
const t=key=>messages[locale()][key]??key;
const state={context:null,importedAssetId:null,projectId:null,projectGeneration:null,
  active:false,busy:false,open:false,chosenByUser:false};
const actionText=(key,css='')=>{
  const b=node('button','rqai-btn '+css,t(key));b.type='button';b.dataset.rqaiText=key;
  return b;
};
function snapshot(){
  let current=null;
  document.dispatchEvent(new CustomEvent('runq:ai-studio:snapshot',{
    detail:{respond:value=>{current=value;}}
  }));
  return current;
}
function updateLocale(){
  document.querySelectorAll('[data-rqai-text]').forEach(el=>{
    const value=t(el.dataset.rqaiText);
    if(el.matches('option'))el.textContent=value;
    else if(el.matches('button,span,h2,h3,p,strong'))el.textContent=value;
  });
  renderContext();
  updateDestinations(false);
}
function updateStatus(text,isError=false){
  const status=$('rqaiStatus');if(!status)return;
  status.textContent=text;status.dataset.error=isError?'true':'false';
}
function currentSnapshotValid(){
  const show=snapshot();
  if(!show)return null;
  if(state.importedAssetId && state.projectId !== show.projectId){
    state.importedAssetId=null;
    state.open=false;
  }
  return show;
}
function route(workspace){
  const item=document.querySelector('[data-workspace-nav="'+workspace+'"]');
  item?.click();
}
function renderContext(){
  const root=$('rqaiContext');
  const headline=$('rqaiContextTitle'),sub=$('rqaiContextDetails');
  if(!root||!headline||!sub)return;
  const c=state.context;
  root.dataset.fromScript=c?.lineId?'true':'false';
  headline.textContent=c?.label??t('free');
  sub.textContent=c?.lineId
    ?t('from')+' · '+c.lineId+(c.cueId?' · '+c.cueId:' · '+t('pending'))
    :t('library');
  const quote=$('rqaiContextQuote');
  if(quote){quote.textContent=c?.excerpt??'';quote.hidden=!c?.excerpt;}
}
function setSoundContext(detail){
  const current=snapshot();
  if(!current)return;
  const script=detail?.lineId&&detail.projectId===current.projectId &&
    detail.projectGeneration===current.projectGeneration;
  const next=script?{...detail}:null;
  const input=$('soundPrompt'),source=$('sourceLine');
  if(input && next?.prompt && input.value.trim()&&input.value.trim()!==next.prompt&&
      !window.confirm(t('modified')))return;
  state.context=next;
  state.importedAssetId=null;state.projectId=current.projectId;
  state.projectGeneration=current.projectGeneration;
  state.chosenByUser=false;state.open=false;
  if(next&&input){input.value=next.prompt;input.dispatchEvent(new Event('input',{bubbles:true}));}
  if(source){
    source.value=next?.lineId??'';
    source.dispatchEvent(new Event('input',{bubbles:true}));
  }
  const confirm=$('confirmRequest');if(confirm)confirm.checked=false;
  renderContext();
  const selected=$('rqaiDestination');
  if(selected)selected.value=next?.cueId?'EXISTING_CUE':next?.proposalId?'NEW_CUE':'LIBRARY';
  updateDestinations(true);
  updateStatus(next?.lineId?t('soundHint'):t('free'));
}
function createShell(){
  const ai=document.querySelector('[data-workspaces~="ai"]');
  const soundlab=document.querySelector('[data-workspaces~="soundlab"]');
  if(!ai||!soundlab||$('rqaiContext'))return;
  document.documentElement.dataset.rqaiMounted='true';
  ai.classList.add('rqai-studio-workspace');
  soundlab.classList.add('rqai-sound-workspace');
  const aiHead=ai.querySelector('.panel-head');
  const aiBanner=node('div','rqai-studio-heading');
  const aiCopy=node('div');
  aiCopy.append(node('span','rqai-kicker',t('title')),node('p','rqai-subheading',t('intro')));
  const aiActions=node('div','rqai-header-actions');
  const soundLink=actionText('openSound','rqai-primary');
  soundLink.addEventListener('click',()=>{
    const show=snapshot();
    state.projectId=show?.projectId??null;
    state.projectGeneration=show?.projectGeneration??null;
    route('soundlab');setSoundContext(null);
  });
  aiActions.append(soundLink);
  aiBanner.append(aiCopy,aiActions);
  aiHead?.after(aiBanner);

  const library=document.querySelector('[data-workspaces~="audio"]');
  if(library){
    const libraryBar=node('div','rqai-library-shortcut');
    libraryBar.append(node('strong','',t('title')),node('span','',t('intro')));
    const link=actionText('openSound','rqai-primary');
    link.addEventListener('click',()=>{route('soundlab');setSoundContext(null);});
    libraryBar.append(link);
    library.querySelector('.panel-head')?.after(libraryBar);
  }
  const script=document.querySelector('[data-workspaces~="script"]');
  if(script){
    const link=actionText('go','rqai-script-shortcut');
    link.addEventListener('click',()=>route('ai'));
    script.querySelector('.panel-head')?.after(link);
  }
  const labTitle=soundlab.querySelector('.sfx-lab-intro h2');
  if(labTitle)labTitle.textContent=t('title')+' / SOUND DESIGN';
  const labSubtitle=soundlab.querySelector('.sfx-lab-intro p');
  if(labSubtitle)labSubtitle.textContent=t('intro');
  const left=soundlab.querySelector('.sfx-left');
  const ctx=node('section','rqai-context sfx-card');
  ctx.id='rqaiContext';
  const top=node('div','rqai-context-head');
  top.append(node('span','rqai-kicker',t('context')));
  const heading=node('h3','rqai-context-title');heading.id='rqaiContextTitle';
  const details=node('p','rqai-context-details');details.id='rqaiContextDetails';
  const quote=node('p','rqai-quote');quote.id='rqaiContextQuote';quote.hidden=true;
  ctx.append(top,heading,details,quote);
  left?.prepend(ctx);

  const review=soundlab.querySelector('.sfx-audio-panel');
  const use=node('section','rqai-use sfx-card');
  use.id='rqaiUse';
  use.append(node('div','rqai-kicker',t('choice')));
  const useHead=node('div','rqai-use-head');
  const useInfo=node('p','',t('need'));useInfo.id='rqaiReadiness';
  const open=actionText('use','rqai-primary');
  open.id='rqaiOpen';open.disabled=true;
  open.addEventListener('click',()=>{state.open=!state.open;updateDestinations(true);});
  useHead.append(useInfo,open);
  const options=node('div','rqai-options');options.id='rqaiOptions';options.hidden=true;
  const modeLabel=node('label','rqai-input');
  const modeSelect=node('select');modeSelect.id='rqaiDestination';
  modeSelect.setAttribute('aria-label',t('choice'));
  for(const [value,key] of [
    ['LIBRARY','modeLibrary'],['NEW_CUE','modeNew'],['EXISTING_CUE','modeExisting']
  ]){const opt=node('option','',t(key));opt.value=value;opt.dataset.rqaiText=key;modeSelect.append(opt);}
  modeLabel.append(node('span','',t('choice')),modeSelect);
  const cueLabel=node('label','rqai-input');
  cueLabel.id='rqaiCueLabelBlock';
  cueLabel.append(node('span','',t('name')));
  const newName=node('input');newName.id='rqaiNewCueName';newName.type='text';newName.maxLength=200;
  newName.value='New sound cue';cueLabel.append(newName);
  const cueTarget=node('label','rqai-input');cueTarget.id='rqaiCueTargetBlock';
  cueTarget.append(node('span','',t('chooseCue')));
  const targetSelect=node('select');targetSelect.id='rqaiTargetCue';cueTarget.append(targetSelect);
  const trackBlock=node('label','rqai-input');trackBlock.id='rqaiTrackActionBlock';
  trackBlock.append(node('span','',t('action')));
  const trackAction=node('select');trackAction.id='rqaiTrackAction';
  for(const [value,key] of [['ADD','add'],['REPLACE','replace']]){
    const option=node('option','',t(key));option.value=value;option.dataset.rqaiText=key;
    trackAction.append(option);
  }
  trackBlock.append(trackAction);
  const replaceBlock=node('label','rqai-input');replaceBlock.id='rqaiReplaceTrackBlock';
  replaceBlock.append(node('span','',t('track')));
  const replaceSelect=node('select');replaceSelect.id='rqaiTargetTrack';replaceBlock.append(replaceSelect);
  const actions=node('div','rqai-confirm-actions');
  const close=actionText('close');close.addEventListener('click',()=>{
    state.open=false;updateDestinations(false);
  });
  const confirm=actionText('apply','rqai-primary');confirm.id='rqaiConfirm';
  confirm.addEventListener('click',()=>void commitDestination());
  actions.append(close,confirm);
  options.append(modeLabel,cueLabel,cueTarget,trackBlock,replaceBlock,actions);
  const status=node('p','rqai-status');status.id='rqaiStatus';status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');status.textContent=t('none');
  const foot=node('p','rqai-note',t('cost'));foot.dataset.rqaiText='cost';
  use.append(useHead,options,status,foot);
  soundlab.querySelector('.sfx-layout')?.append(use);

  modeSelect.addEventListener('change',()=>{
    state.chosenByUser=true;updateDestinations(false);
  });
  targetSelect.addEventListener('change',()=>{
    state.chosenByUser=true;updateDestinations(false);
  });
  trackAction.addEventListener('change',()=>{
    state.chosenByUser=true;updateDestinations(false);
  });
  newName.addEventListener('input',()=>updateDestinations(false));
  const importButton=$('importLibraryBtn');
  if(importButton){
    const observer=new MutationObserver(updateReadiness);
    observer.observe(importButton,{attributes:true,attributeFilter:['disabled']});
  }
  $('localWav')?.addEventListener('change',()=>{state.importedAssetId=null;updateReadiness();});
  updateReadiness();renderContext();
}
function updateReadiness(){
  const reviewed=$('importLibraryBtn')&&!$('importLibraryBtn').disabled;
  const local=$('localWav')?.files?.[0]??null;
  const ready=!!(reviewed||local||state.importedAssetId);
  const button=$('rqaiOpen');
  if(button)button.disabled=!ready;
  const hint=$('rqaiReadiness');
  if(hint)hint.textContent=state.importedAssetId
    ?t('saved')
    :reviewed?t('available')
      :local?t('localHint')
        :t('need');
  updateDestinations(false);
}
function updateDestinations(rebuild){
  const show=currentSnapshotValid();
  const optionBox=$('rqaiOptions'),mode=$('rqaiDestination');
  if(!optionBox||!mode||!show)return;
  optionBox.hidden=!state.open;
  if(!state.open)return;
  const target=$('rqaiTargetCue'),name=$('rqaiNewCueName');
  if(rebuild||target.dataset.projectId!==show.projectId){
    const old=target.value;
    target.replaceChildren();
    for(const cue of show.cues){
      const option=node('option','',String(cue.number).padStart(2,'0')+' · '+cue.label);
      option.value=cue.id;target.append(option);
    }
    target.dataset.projectId=show.projectId;
    const first=state.context?.cueId;
    target.value=show.cues.some(c=>c.id===old)?old:
      show.cues.some(c=>c.id===first)?first:show.cues[0]?.id??'';
  }
  if(!state.chosenByUser&&rebuild){
    mode.value=state.context?.cueId?'EXISTING_CUE':
      state.context?.proposalId?'NEW_CUE':'LIBRARY';
    name.value=state.context?.label??'New sound cue';
  }
  const isNew=mode.value==='NEW_CUE',isExisting=mode.value==='EXISTING_CUE';
  $('rqaiCueLabelBlock').hidden=!isNew;
  $('rqaiCueTargetBlock').hidden=!isExisting;
  $('rqaiTrackActionBlock').hidden=!isExisting;
  const trackChoice=$('rqaiTrackAction');
  const replace=trackChoice.value==='REPLACE';
  $('rqaiReplaceTrackBlock').hidden=!isExisting||!replace;
  const track=$('rqaiTargetTrack');
  if(replace&&isExisting){
    const cue=show.cues.find(c=>c.id===target.value);
    const old=track.value;track.replaceChildren();
    if(cue?.mainType==='PLAY'){
      const option=node('option','',t('main'));option.value='';track.append(option);
    }
    for(const part of cue?.audioTracks??[]){
      const option=node('option','',part.id);option.value=part.id;track.append(option);
    }
    track.value=[...track.options].some(o=>o.value===old)?old:track.options[0]?.value??'';
  }
  const confirm=$('rqaiConfirm');
  confirm.disabled=state.busy||
    (isNew&&!name.value.trim())||
    (isExisting&&(!target.value||(replace&&!track.options.length)))||
    (!$('rqaiOpen')||$('rqaiOpen').disabled);
}
function intent(){
  const show=snapshot();
  if(!show)throw new Error('No active show');
  const mode=$('rqaiDestination').value;
  const source=show.proposals.find(p=>p.id===state.context?.proposalId);
  return {
    projectId:show.projectId,projectGeneration:show.projectGeneration,
    mode,proposalId:mode==='NEW_CUE'&&source?.status==='PENDING'
      ?source.id:null,
    cueLabel:$('rqaiNewCueName').value.trim(),
    targetCueId:mode==='EXISTING_CUE'?$('rqaiTargetCue').value:null,
    targetTrackId:mode==='EXISTING_CUE'&&$('rqaiTrackAction').value==='REPLACE'
      ?$('rqaiTargetTrack').value||null:null,
    trackAction:mode==='EXISTING_CUE'?$('rqaiTrackAction').value:'ADD',
  };
}
async function commitDestination(){
  if(state.busy)return;
  const choice=intent();
  if(choice.mode==='EXISTING_CUE'&&!choice.targetCueId){
    updateStatus(t('selectCue'),true);return;
  }
  const local=$('localWav')?.files?.[0]??null;
  state.busy=true;updateDestinations(false);
  try{
    if(state.importedAssetId){
      let result=null;
      document.dispatchEvent(new CustomEvent('runq:ai-studio:apply-existing',{
        detail:{assetId:state.importedAssetId,destination:choice,respond:value=>{result=value;}}
      }));
      if(!result||result.error)throw new Error(result?.error??'Destination unavailable');
      handleResult(result);
    }else if(local){
      await new Promise((resolve,reject)=>{
        document.dispatchEvent(new CustomEvent('runq:ai-studio:import-local',{
          detail:{file:local,destination:choice,respond:r=>r?.error?reject(new Error(r.error)):resolve(r)}
        }));
      }); // The application publishes the result once through a shared event.
    }else{
      const button=$('importLibraryBtn');
      if(!button||button.disabled)throw new Error(t('need'));
      button.click(); // Existing lab demands a separate explicit confirmation.
    }
  }catch(error){updateStatus(String(error.message??error),true);}
  finally{
    state.busy=false;updateReadiness();updateDestinations(false);
  }
}
function handleResult(result){
  if(!result)return;
  if(result.assetId)state.importedAssetId=result.assetId;
  const current=snapshot();
  if(current){state.projectId=current.projectId;state.projectGeneration=current.projectGeneration;}
  updateStatus(result.warning??result.message??t('imported'),!!result.warning);
  state.open=!!result.warning;
  updateDestinations(false);
  const link=$('rqaiOpenCue');
  if(link)link.remove();
  if(result.cueId){
    const button=actionText('openCue','rqai-open-cue');
    button.id='rqaiOpenCue';
    button.addEventListener('click',()=>document.dispatchEvent(
      new CustomEvent('runq:ai-studio:open-cue',{detail:{cueId:result.cueId}})));
    $('rqaiStatus')?.after(button);
  }
  updateScriptCompletion();
}
function updateScriptCompletion(){
  const target=$('rqaiScriptCompletion');
  if(!target)return;
  target.replaceChildren();
  const show=snapshot();
  if(!state.importedAssetId||!state.context?.proposalId||!show)return;
  if(!show.assets.some(a=>a.id===state.importedAssetId))return;
  const name=show.assets.find(a=>a.id===state.importedAssetId)?.name??'WAV';
  target.append(node('strong','',t('scriptReady')+' · '+name));
  const button=actionText(state.context.cueId?'modeExisting':'after','rqai-primary');
  button.addEventListener('click',()=>{
    route('soundlab');
    state.open=true;
    if($('rqaiDestination'))$('rqaiDestination').value=state.context.cueId?'EXISTING_CUE':'NEW_CUE';
    updateDestinations(true);
  });
  target.append(button);
}
function init(){
  if(document.documentElement.dataset.rqaiMounted)return;
  createShell();
  document.addEventListener('runq:ai-studio:design',event=>setSoundContext(event.detail));
  document.addEventListener('runq:ai-studio:get-destination',event=>{
    const reply=event.detail?.respond;
    if(typeof reply==='function'&&state.open)reply(intent());
  });
  document.addEventListener('runq:ai-studio:imported',event=>handleResult(event.detail));
  $('uiLocaleSelect')?.addEventListener('change',updateLocale);
  // Current proposal list re-renders after every operator review.
  const ai=document.querySelector('[data-workspaces~="ai"]');
  const completion=node('div','rqai-script-completion');completion.id='rqaiScriptCompletion';
  ai?.querySelector('.rq5-ai-review .rq5-pane-heading')?.after(completion);
  updateLocale();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
