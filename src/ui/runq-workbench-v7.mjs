/**
 * RunQ V7 professional workbench.
 * Adapts ORIGINAL application controls; never owns GO, playback or project writes.
 * Selection, browsing and preparation remain separate app.mjs operations.
 * EN/ES labels, no remote requests, no fake engine meters.
 */
const $ = id => document.getElementById(id);
const es = () => $('uiLocaleSelect')?.value === 'es';
const t = (spanish,english) => es() ? spanish : english;
const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text !== undefined) out.textContent = text;
  return out;
};
const shell = () => document.querySelector('.shell');
const workspace = () => shell()?.dataset.activeWorkspace ?? 'home';
const route = id => document.querySelector('[data-workspace-nav="' + id + '"]')?.click();

function mountWorkbench(){
  const main = document.querySelector('.shell > main');
  const nav = $('workspaceNav');
  const panel = document.querySelector('.rq5-show-workspace');
  if (!main || !nav || !panel || $('rq7Workbench')) return;
  document.documentElement.classList.add('rq7');
  const ribbon = el('div','rq7-workbench', '');
  ribbon.id = 'rq7Workbench';
  const mode = el('nav','rq7-modes');
  mode.setAttribute('aria-label', 'RunQ work modes');
  const modeButtons = [
    ['edit','cues','EDITAR','EDIT'],
    ['rehearsal','rehearsal','ENSAYAR','REHEARSE'],
    ['show','operation','DIRECTO','SHOW']
  ];
  for (const [id,destination,sp,en] of modeButtons){
    const button = el('button','rq7-mode-button');
    button.type='button';button.dataset.rq7Mode=id;
    button.addEventListener('click',()=>route(destination));
    button.dataset.rq7Es=sp;button.dataset.rq7En=en;
    mode.append(button);
  }
  const tasks=el('nav','rq7-tasks');
  tasks.setAttribute('aria-label','Edit workspaces');
  for(const [destination,sp,en] of [
    ['script','Guion','Script'],
    ['ai','Propuestas IA','AI Suggestions'],
    ['cues','Cues','Cues'],
    ['audio','Sonido','Sound'],
    ['setup','Comprobación','Preflight']]){
    const button=el('button','rq7-task-button');
    button.type='button';button.dataset.rq7Route=destination;
    button.dataset.rq7Es=sp;button.dataset.rq7En=en;
    button.addEventListener('click',()=>route(destination));
    tasks.append(button);
  }
  const status=el('span','rq7-ribbon-status');
  ribbon.append(mode,tasks,status);
  main.prepend(ribbon);

  // The legacy navigation stays operational: existing Chrome tests, deep links
  // and original event handlers continue using data-workspace-nav.
  const headings=[
    ['home','PROYECTO','PROJECT'],
    ['script','PREPARACIÓN','AUTHORING'],
    ['rehearsal','OPERACIÓN','OPERATION']
  ];
  for(const [before,sp,en] of headings){
    const target=nav.querySelector('[data-workspace-nav="'+before+'"]');
    if(!target)continue;
    const heading=el('span','rq7-nav-heading');
    heading.dataset.rq7Es=sp;heading.dataset.rq7En=en;
    target.before(heading);
  }
  // A single Sound section with the two existing, tested source routes.
  // No asset is imported or assigned merely by navigating.
  const sound=el('nav','rq7-sound-tabs');
  sound.id='rq7SoundTabs';
  sound.setAttribute('aria-label','Sound workbench');
  const soundLabel=el('span','rq7-sound-caption');
  sound.append(soundLabel);
  for(const [id,sp,en] of [['audio','Biblioteca','Library'],['soundlab','Crear y editar','Create & Edit']]){
    const button=el('button','rq7-sound-tab');
    button.type='button';button.dataset.rq7Sound=id;
    button.dataset.rq7Es=sp;button.dataset.rq7En=en;
    button.addEventListener('click',()=>route(id));
    sound.append(button);
  }
  main.querySelector('.layout')?.before(sound);

  // Rehouse the real conversational editor in the ACTUAL property pane,
  // preserving all its original button listeners and staged edits.
  const inspectorFrame=panel.querySelector('.rq5-inspector-frame');
  const chat=$('rqCueChatPanel');
  if(inspectorFrame && chat){
    inspectorFrame.append(chat);
    const trackOpen=()=>inspectorFrame.classList.toggle('rq7-chat-active',!chat.hidden);
    new MutationObserver(trackOpen).observe(chat,{attributes:true,attributeFilter:['hidden']});
    trackOpen();
  }

  // Manual splitter: affects only editor layout, never playback or source state.
  const body=panel.querySelector('.cue-workspace-body');
  if(body && inspectorFrame){
    const handle=el('div','rq7-split-handle');
    handle.tabIndex=0;
    handle.setAttribute('role','separator');
    handle.setAttribute('aria-label','Resize cue list and inspector');
    handle.setAttribute('aria-orientation','vertical');
    body.append(handle);
    const restore=()=>{
      try{
        const stored=Number(localStorage.getItem('runq.v7.editorSplit'));
        if(stored>=35&&stored<=72)body.style.setProperty('--rq7-split',stored+'%');
      }catch{}
    };
    restore();
    const change=clientX=>{
      const rect=body.getBoundingClientRect();
      const left=Math.max(325,Math.min(rect.width-285,clientX-rect.left));
      const pct=Math.round(left/rect.width*100);
      if(rect.width>650&&pct>=30&&pct<=75){
        body.style.setProperty('--rq7-split',pct+'%');
        try{localStorage.setItem('runq.v7.editorSplit',String(pct));}catch{}
      }
    };
    let dragging=false;
    handle.addEventListener('pointerdown',event=>{
      if(workspace()!=='cues'||event.button!==0)return;
      dragging=true;handle.setPointerCapture(event.pointerId);event.preventDefault();
    });
    handle.addEventListener('pointermove',event=>{if(dragging)change(event.clientX);});
    handle.addEventListener('pointerup',()=>{dragging=false;});
    handle.addEventListener('pointercancel',()=>{dragging=false;});
    handle.addEventListener('dblclick',()=>{
      body.style.removeProperty('--rq7-split');
      try{localStorage.removeItem('runq.v7.editorSplit');}catch{}
    });
    handle.addEventListener('keydown',event=>{
      if(workspace()!=='cues'||!['ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();
      const rect=body.getBoundingClientRect();
      const current=body.querySelector('.rq5-sequence-frame')?.getBoundingClientRect().width??rect.width*.58;
      change(rect.left+current+(event.key==='ArrowRight'?24:-24));
    });
  }

  // Directo: independent visual navigation over ALL real cue rows.
  const list=$('cueList');
  const frame=panel.querySelector('.rq5-sequence-frame');
  let browsedCueId=null, followNext=true, lastFollowed=null, pendingUpdate=false;
  const toolbar=el('div','rq7-live-navigator');
  toolbar.id='rq7LiveNavigator';
  toolbar.setAttribute('aria-label','Full cue list navigation');
  const firstGroup=el('div','rq7-live-nav-controls');
  const buttons={};
  for(const [key,sp,en] of [
    ['first','Inicio','First'],['previous','Anterior','Previous'],
    ['next','Siguiente','Next'],['last','Final','Last'],
    ['return','Volver al NEXT','Return to NEXT']]){
    const button=el('button','rq7-nav-action');
    button.type='button';button.dataset.rq7Action=key;
    button.dataset.rq7Es=sp;button.dataset.rq7En=en;
    firstGroup.append(button);buttons[key]=button;
  }
  const jumpLabel=el('label','rq7-live-jump');
  const jump=el('input');
  jump.type='text';jump.inputMode='numeric';jump.maxLength=8;
  jump.id='rq7JumpCue';jump.setAttribute('autocomplete','off');
  const jumpButton=el('button','rq7-nav-action');
  jumpButton.type='button';jumpButton.id='rq7JumpButton';
  jumpLabel.append(jump,jumpButton);
  const progress=el('output','rq7-browse-position');
  progress.id='rq7BrowsePosition';progress.setAttribute('aria-live','polite');
  toolbar.append(firstGroup,jumpLabel,progress);
  if(frame&&list)frame.insertBefore(toolbar,list);

  const info=el('section','rq7-live-inspector');
  info.id='rq7LiveInspector';
  const infoHeader=el('div','rq7-inspector-title');
  const infoBody=el('div','rq7-inspector-content');
  info.append(infoHeader,infoBody);
  inspectorFrame?.append(info);

  const rows=()=>[...list.querySelectorAll('[data-cue-select]')];
  const prepared=()=>list.querySelector('.cue-item.cue-prepared [data-cue-select]')?.dataset.cueSelect??null;
  const selected=()=>list.querySelector('[data-cue-select][aria-pressed="true"]')?.dataset.cueSelect??null;
  const readCues=()=>{
    let show=null;
    document.dispatchEvent(new CustomEvent('runq:voice-follow-read-project',{
      detail:{respond:value=>{show=value;}}
    }));
    return show?.cues??[];
  };
  function inspect(){
    if(workspace()!=='operation')return;
    const cues=readCues(), id=browsedCueId??selected()??prepared();
    const cue=cues.find(x=>x.id===id);
    infoHeader.textContent=t('INSPECTOR · SOLO LECTURA','INSPECTOR · READ ONLY');
    infoBody.replaceChildren();
    if(!cue){
      infoBody.append(el('p','rq7-info-empty',t('Selecciona un cue de la lista.','Select a cue from the list.')));
      return;
    }
    infoBody.append(el('strong','rq7-info-name','Q'+String(cue.number).padStart(3,'0')+' · '+cue.label));
    const dl=el('dl','rq7-info-fields');
    for(const [label,value] of [
      [t('Guion','Script'),cue.sourceLineIds?.join(', ')||'—'],
      [t('Pie hablado','Spoken trigger'),cue.trigger||'—'],
      [t('Estado','State'),id===prepared()?t('Preparado para GO','Prepared for GO'):t('Solo consulta','Inspection only')]
    ]){
      const dt=el('dt','',label),dd=el('dd','',value);
      dl.append(dt,dd);
    }
    infoBody.append(dl);
    const prepareButton=el('button','rq7-nav-action rq7-inspect-prepare',
      t('Preparar este cue como NEXT','Prepare this cue as NEXT'));
    prepareButton.type='button';
    prepareButton.disabled=cue.id===prepared();
    prepareButton.addEventListener('click',()=>{
      // Explicit V9 Set NEXT action, never direct Play, STOP or GO.
      const card=[...list.querySelectorAll('.cue-item')].find(row=>
        row.querySelector('[data-cue-select]')?.dataset.cueSelect===cue.id);
      card?.querySelector('[data-cue-quick-next]')?.click();
    });
    infoBody.append(prepareButton);
    infoBody.append(el('p','rq7-info-note',t(
      'Consultar este cue no cambia el siguiente GO. Para prepararlo utiliza «Preparar NEXT» en su fila.',
      'Inspecting does not change NEXT. Use the row’s explicit Prepare NEXT action.'
    )));
  }
  function goTo(index){
    const all=rows();
    if(!all.length)return;
    const dest=all[Math.max(0,Math.min(index,all.length-1))];
    if(!dest)return;
    followNext=false;
    browsedCueId=dest.dataset.cueSelect;
    // The original click calls selectCueForInspection() and never prepares GO.
    dest.click();
    dest.focus({preventScroll:true});
    dest.scrollIntoView({block:'nearest',inline:'nearest'});
    update();
  }
  function jumpToCue(){
    const number=Number(jump.value.trim().replace(/^Q/i,''));
    if(!Number.isInteger(number)||number<0)return;
    const cue=readCues().find(c=>Number(c.number)===number);
    if(!cue){progress.textContent=t('Cue no encontrado','Cue not found');return;}
    const search=$('cueSearchInput');
    if(search?.value){
      search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));
    }
    const all=rows(),index=all.findIndex(x=>x.dataset.cueSelect===cue.id);
    if(index>=0)goTo(index);
  }
  for(const [action,button] of Object.entries(buttons)){
    button.addEventListener('click',()=>{
      const all=rows();
      if(!all.length)return;
      if(action==='return'){
        followNext=true;lastFollowed=null;
        const id=prepared();
        let target=all.find(x=>x.dataset.cueSelect===id);
        const filter=$('cueSearchInput');
        if(!target && id && filter?.value){
          filter.value='';
          filter.dispatchEvent(new Event('input',{bubbles:true}));
          target=rows().find(x=>x.dataset.cueSelect===id);
        }
        target?.scrollIntoView({block:'center',inline:'nearest'});
        lastFollowed=target?id:null;
        update();
        return;
      }
      const current=all.findIndex(x=>x.dataset.cueSelect===(browsedCueId??selected()??prepared()));
      const idx=action==='first'?0:action==='last'?all.length-1:
        action==='previous'?Math.max(0,current-1):Math.min(all.length-1,current+1);
      goTo(idx);
    });
  }
  jumpButton.addEventListener('click',jumpToCue);
  jump.addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();jumpToCue();}
  });
  list?.addEventListener('click',event=>{
    if(workspace()!=='operation')return;
    const row=event.target?.closest('[data-cue-select]');
    if(row){browsedCueId=row.dataset.cueSelect;followNext=false;queueMicrotask(update);}
  });
  list?.addEventListener('wheel',()=>{
    if(workspace()==='operation')followNext=false;
  },{passive:true});
  list?.addEventListener('touchstart',()=>{
    if(workspace()==='operation')followNext=false;
  },{passive:true});
  list?.addEventListener('keydown',event=>{
    if(workspace()!=='operation'||!['PageDown','PageUp'].includes(event.key)||
       event.altKey||event.ctrlKey||event.metaKey)return;
    const active=event.target.closest('[data-cue-select]');
    if(!active)return;
    event.preventDefault();
    const all=rows(),index=all.indexOf(active);
    goTo(index+(event.key==='PageDown'?10:-10));
  });
  // Arrow/Home/End are handled by the original cue grid; synchronize the
  // readonly inspection with its post-keyboard selection without touching NEXT.
  list?.addEventListener('keydown',event=>{
    if(workspace()!=='operation'||!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    queueMicrotask(()=>{
      const id=selected();
      if(id){browsedCueId=id;followNext=false;update();}
    });
  });
  // Readonly browser state never touches the audio or operator queue.
  function update(){
    const all=rows();
    const current=workspace(),inShow=current==='operation';
    const modeId=current==='operation'?'show':current==='rehearsal'?'rehearsal':'edit';
    for(const button of mode.querySelectorAll('button')){
      button.textContent=es()?button.dataset.rq7Es:button.dataset.rq7En;
      button.setAttribute('aria-pressed',String(button.dataset.rq7Mode===modeId));
    }
    for(const button of tasks.querySelectorAll('button')){
      button.textContent=es()?button.dataset.rq7Es:button.dataset.rq7En;
      button.setAttribute('aria-pressed',String(button.dataset.rq7Route===current));
    }
    for(const item of nav.querySelectorAll('.rq7-nav-heading')){
      item.textContent=es()?item.dataset.rq7Es:item.dataset.rq7En;
    }
    for(const button of sound.querySelectorAll('button')){
      button.textContent=es()?button.dataset.rq7Es:button.dataset.rq7En;
      button.setAttribute('aria-pressed',String(button.dataset.rq7Sound===current));
    }
    soundLabel.textContent=t('SONIDO / HERRAMIENTAS','SOUND / TOOLS');
    const soundVisible=current==='audio'||current==='soundlab';
    sound.hidden=!soundVisible;
    tasks.hidden=modeId!=='edit';
    ribbon.dataset.rq7Mode=modeId;
    status.textContent=modeId==='show'?t('Solo operación · sin edición IA','Show control · AI editing off'):
      modeId==='rehearsal'?t('Ensayo · GO manual o armado','Rehearsal · manual or armed GO'):
      t('Edición · GO y preescucha independientes','Edit · GO and preview are separate');
    const total=readCues().length;
    const browse=all.findIndex(x=>x.dataset.cueSelect===(browsedCueId??selected()));
    progress.textContent=inShow
      ?t('Visibles','Visible')+' '+all.length+' / '+total+' · '+(browse>=0?String(browse+1):'—')
      : '';
    jump.placeholder=t('N.º de cue','Cue #');
    jump.setAttribute('aria-label',t('Ir a cue por número','Jump to cue number'));
    jumpButton.textContent=t('Ir','Go to cue');
    toolbar.hidden=!inShow;
    info.hidden=!inShow;
    for(const [key,button] of Object.entries(buttons)){
      button.textContent=es()?button.dataset.rq7Es:button.dataset.rq7En;
      button.disabled=!inShow||!all.length;
    }
    buttons.return.classList.toggle('rq7-following',followNext);
    if(inShow){
      const next=prepared();
      if(followNext && next && next!==lastFollowed){
        const target=all.find(x=>x.dataset.cueSelect===next);
        target?.scrollIntoView({block:'nearest',inline:'nearest'});
        lastFollowed=next;
      }
      inspect();
    }else lastFollowed=null;
  }
  const schedule=()=>{
    if(pendingUpdate)return;
    pendingUpdate=true;
    queueMicrotask(()=>{pendingUpdate=false;update();});
  };
  if(list)new MutationObserver(schedule).observe(list,{childList:true,subtree:false});
  new MutationObserver(schedule).observe(shell(),{attributes:true,attributeFilter:['data-active-workspace']});
  $('uiLocaleSelect')?.addEventListener('change',schedule);
  update();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountWorkbench,{once:true});
else mountWorkbench();
