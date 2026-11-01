/** Interface composition only. Original controls retain ownership of all commands. */
import { mountShowBuilder } from './show-builder-ui.mjs';
const $=id=>document.getElementById(id);
const tr=(es,en)=>$('uiLocaleSelect')?.value==='es'?es:en;
const make=(tag,className='')=>Object.assign(document.createElement(tag),{className});
const icon=(path,className='rq16-toolbar-icon')=>{
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('aria-hidden','true');
  svg.setAttribute('focusable','false');
  svg.classList.add(className);
  const shape=document.createElementNS(svg.namespaceURI,'path');
  shape.setAttribute('d',path);
  svg.append(shape);
  return svg;
};
function addButtonIcon(button,path){
  const label=button.textContent.trim();
  button.removeAttribute('data-i18n');
  button.replaceChildren(icon(path));
  const text=make('span','rq16-toolbar-label');
  text.textContent=label;
  button.append(text);
  return text;
}

function mountCueToolbar(){
  const toolbar=document.querySelector('.cue-create-actions');
  if(!toolbar)return;
  toolbar.setAttribute('role','toolbar');
  toolbar.setAttribute('aria-orientation','horizontal');
  const actions=[
    ['cueAddBtn','studio.toolbar.add','Añadir cue','Add cue','M12 5v14M5 12h14'],
    ['cueInsertBtn','studio.toolbar.insert','Insertar después','Insert after selected','M5 5v14m0-7h14m-5-5 5 5-5 5'],
    ['cueDuplicateBtn','studio.toolbar.duplicate','Duplicar','Duplicate','M8 8h12v12H8zM4 16V4h12'],
    ['cueMoveUpBtn','studio.toolbar.moveUp','Subir','Move up','M12 19V5m-6 6 6-6 6 6'],
    ['cueMoveDownBtn','studio.toolbar.moveDown','Bajar','Move down','M12 5v14m-6-6 6 6 6-6'],
    ['cueDeleteBtn','studio.toolbar.delete','Eliminar','Delete selected','M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5'],
  ];
  for(const [id,key,es,en,path] of actions){
    const button=$(id);
    if(!button)continue;
    const label=addButtonIcon(button,path);
    label.dataset.i18n=key;
    label.textContent=tr(es,en);
  }
  function sync(){
    toolbar.setAttribute('aria-label',tr('Herramientas de cues','Cue tools'));
    for(const [id,key,es,en] of actions){
      const button=$(id);
      if(!button)continue;
      const label=button.querySelector('.rq16-toolbar-label');
      if(label){label.textContent=tr(es,en);button.title=label.textContent;}
    }
  }
  document.addEventListener('runq:show-state-changed',sync);
  $('uiLocaleSelect')?.addEventListener('change',()=>queueMicrotask(sync));
  sync();
}

function mountScriptToolbar(scriptPanel,nav){
  if(!scriptPanel||scriptPanel.querySelector('.rq16-script-toolbar'))return;
  const toolbar=make('div','rq16-script-toolbar');
  toolbar.setAttribute('role','toolbar');
  toolbar.setAttribute('aria-orientation','horizontal');
  const status=make('span','rq16-script-selection-status');
  status.id='rq16ScriptSelectionStatus';
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  const importButton=$('importScriptBtn');
  if(!importButton)throw new Error('Script import control is unavailable');
  addButtonIcon(importButton,'M5 3h10l4 4v14H5zM15 3v5h5M8 12h8M8 16h8').dataset.i18n='script.import';
  const createCue=make('button','btn subtle small');
  createCue.type='button';createCue.id='rq16CreateCueFromLines';
  addButtonIcon(createCue,'M4 5h10M4 10h10M4 15h7m6-2v8m-4-4h8');
  const detect=make('button','btn subtle small');
  detect.type='button';detect.id='rq16DetectScriptCues';
  addButtonIcon(detect,'m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 14l1.2 3.8L24 19l-3.8 1.2L19 24l-1.2-3.8L14 19l3.8-1.2z');
  const analyze=make('button','btn subtle small');
  analyze.type='button';analyze.id='rq16AnalyzeScriptSelection';
  addButtonIcon(analyze,'M10.5 3a7.5 7.5 0 1 0 4.7 13.35L21 22m-10.5-8a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7');
  const ask=make('button','btn subtle small');
  ask.type='button';ask.id='rq16AskScriptAI';
  addButtonIcon(ask,'M4 5h16v12H9l-5 4zM8 9h8m-8 4h5');
  toolbar.append(importButton,createCue,detect,analyze,ask,status);
  scriptPanel.insertBefore(toolbar,$('showName'));

  const selection=()=>{
    let ids=[];
    document.dispatchEvent(new CustomEvent('runq:script-selection-read',{
      detail:{respond:value=>{ids=Array.isArray(value)?value:[];}}
    }));
    return ids;
  };
  const openWorkspace=workspace=>{
    const button=nav.querySelector(`[data-workspace-nav="${workspace}"]`);
    if(!button)throw new Error('Script toolbar workspace is unavailable: '+workspace);
    button.click();
  };
  createCue.addEventListener('click',()=>{
    const lineIds=selection();
    if(!lineIds.length){status.textContent=tr('Selecciona al menos una línea.','Select at least one source line.');return;}
    document.dispatchEvent(new CustomEvent('runq:create-cue-from-script-lines',{detail:{lineIds}}));
  });
  detect.addEventListener('click',()=>{
    openWorkspace('ai');
    const disclosure=document.querySelector('.rq13-ai-disclosure');
    if(disclosure)disclosure.open=true;
    $('analyzeMetaBtn')?.focus();
    status.textContent=tr('Abre el análisis del guion completo; confirma antes de enviar una consulta.','Opens full-script analysis; confirm before sending a request.');
  });
  analyze.addEventListener('click',()=>{
    const lineIds=selection();
    if(!lineIds.length){status.textContent=tr('Selecciona líneas originales para preparar el análisis.','Select original script lines to prepare analysis.');return;}
    openWorkspace('ai');
    const prompt=$('rqAgentPrompt');
    if(prompt){
      prompt.value=tr(
        `Analiza únicamente estas líneas originales (${lineIds.join(', ')}). Recomienda necesidades sonoras y explica la evidencia sin inventar referencias.`,
        `Analyze only these original source lines (${lineIds.join(', ')}). Recommend sound needs and explain the evidence without inventing references.`
      );
    }
    document.dispatchEvent(new Event('runq:show-builder-ask-ai'));
    status.textContent=tr('Contexto acotado preparado. Revisa y autoriza explícitamente antes de consultar IA.','Bounded context prepared. Review and explicitly authorize before asking AI.');
  });
  ask.addEventListener('click',()=>{
    openWorkspace('ai');
    document.dispatchEvent(new Event('runq:show-builder-ask-ai'));
  });
  function syncScriptToolbar(event){
    const ids=event?.detail?.lineIds??selection();
    const count=ids.length;
    const tooMany=count>20;
    createCue.disabled=count===0||tooMany;
    analyze.disabled=count===0||tooMany;
    const locale=$('uiLocaleSelect')?.value==='es';
    const setLabel=(button,value)=>{button.querySelector('.rq16-toolbar-label').textContent=value;};
    setLabel(createCue,locale?'Crear cue desde selección':'Create cue from selection');
    createCue.title=locale?'Conserva las referencias Lxx originales':'Preserves original Lxx source references';
    setLabel(detect,locale?'Detectar cues con IA':'Detect cues with AI');
    detect.title=locale?'Abre el análisis existente; no envía nada automáticamente':'Opens existing analysis; does not submit automatically';
    setLabel(analyze,locale?'Analizar selección con IA':'Analyze selection with AI');
    analyze.title=locale?'Solo envía líneas seleccionadas tras revisión y autorización':'Only selected lines are sent after review and explicit consent';
    setLabel(ask,'RUNQ AI');
    ask.title=locale?'Abrir RUNQ AI sin enviar una consulta':'Open RUNQ AI without submitting a request';
    toolbar.setAttribute('aria-label',locale?'Herramientas del guion':'Script tools');
    status.textContent=event?.detail?.rejected
      ?tr('Máximo 20 líneas por selección.','Select up to 20 lines.')
      :count
        ?tr(`${count} líneas seleccionadas · máximo 20`,`${count} selected · maximum 20`)
        :'';
  }
  document.addEventListener('runq:script-selection-changed',syncScriptToolbar);
  $('uiLocaleSelect')?.addEventListener('change',()=>queueMicrotask(()=>syncScriptToolbar()));
  syncScriptToolbar();
}

function mountScriptContextMenu(scriptPanel){
  const preview=$('scriptPreview');
  if(!scriptPanel||!preview)return;
  const menu=make('div','rq16-cue-context-menu rq16-script-context-menu');
  menu.id='rq16ScriptContextMenu';
  menu.setAttribute('role','menu');
  menu.hidden=true;
  const entries=[
    ['create','Crear cue desde selección','Create cue from selection','M4 5h10M4 10h10m-10 5h7m6-2v8m-4-4h8'],
    ['analyze','Analizar selección con IA','Analyze selection with AI','M10.5 3a7.5 7.5 0 1 0 4.7 13.35L21 22m-10.5-8a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7'],
    ['detect','Detectar cues con IA','Detect cues with AI','m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2z'],
    ['ask','Preguntar a RUNQ AI','Ask RUNQ AI','M4 5h16v12H9l-5 4zM8 9h8m-8 4h5'],
  ];
  for(const [action,es,en,path] of entries){
    const button=make('button','rq16-cue-context-item');
    button.type='button';
    button.dataset.scriptContextAction=action;
    button.setAttribute('role','menuitem');
    button.append(icon(path));
    const label=make('span');label.textContent=tr(es,en);button.append(label);
    menu.append(button);
  }
  document.body.append(menu);
  let returnFocus=null;
  const close=(restoreFocus=false)=>{
    menu.hidden=true;
    if(restoreFocus&&returnFocus?.isConnected)returnFocus.focus();
    returnFocus=null;
  };
  const open=(row,x,y)=>{
    if(document.querySelector('.shell')?.dataset.activeWorkspace!=='script')return;
    const checkbox=row?.querySelector('[data-script-line-select]');
    if(!checkbox)return;
    if(!checkbox.checked){
      let selected=[];
      document.dispatchEvent(new CustomEvent('runq:script-selection-read',{
        detail:{respond:value=>{selected=Array.isArray(value)?value:[];}}
      }));
      if(selected.length<20){
        checkbox.checked=true;
        checkbox.dispatchEvent(new Event('change',{bubbles:true}));
      }
    }
    returnFocus=checkbox;
    for(const item of menu.querySelectorAll('[data-script-context-action]')){
      item.disabled=['create','analyze'].includes(item.dataset.scriptContextAction)&&
        document.querySelector('#rq16'+(item.dataset.scriptContextAction==='create'?'CreateCueFromLines':'AnalyzeScriptSelection'))?.disabled;
    }
    menu.hidden=false;
    const rect=menu.getBoundingClientRect();
    menu.style.left=Math.max(8,Math.min(x,innerWidth-rect.width-8))+'px';
    menu.style.top=Math.max(8,Math.min(y,innerHeight-rect.height-8))+'px';
    menu.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
  };
  preview.addEventListener('contextmenu',event=>{
    const row=event.target.closest('[data-script-line-id]');
    if(!row)return;
    event.preventDefault();
    open(row,event.clientX,event.clientY);
  });
  preview.addEventListener('keydown',event=>{
    if(event.key!=='ContextMenu'&&!(event.shiftKey&&event.key==='F10'))return;
    const row=event.target.closest('[data-script-line-id]');
    if(!row)return;
    event.preventDefault();
    const rect=row.getBoundingClientRect();
    open(row,rect.left,rect.bottom);
  });
  menu.addEventListener('click',event=>{
    const item=event.target.closest('[data-script-context-action]');
    if(!item||item.disabled)return;
    const action=item.dataset.scriptContextAction;
    close();
    const control={
      create:'rq16CreateCueFromLines',
      analyze:'rq16AnalyzeScriptSelection',
      detect:'rq16DetectScriptCues',
      ask:'rq16AskScriptAI',
    }[action];
    if(control)$(control)?.click();
  });
  menu.addEventListener('keydown',event=>{
    const items=[...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const index=items.indexOf(document.activeElement);
    if(event.key==='Escape'){event.preventDefault();close(true);return;}
    let next=null;
    if(event.key==='ArrowDown')next=items[(index+1+items.length)%items.length];
    else if(event.key==='ArrowUp')next=items[(index-1+items.length)%items.length];
    else if(event.key==='Home')next=items[0];
    else if(event.key==='End')next=items.at(-1);
    if(next){event.preventDefault();next.focus();}
  });
  document.addEventListener('pointerdown',event=>{
    if(!menu.hidden&&!menu.contains(event.target))close();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!menu.hidden){event.preventDefault();close(true);}
  });
  document.addEventListener('runq:show-state-changed',()=>close());
  const syncLocale=()=>{
    menu.setAttribute('aria-label',tr('Acciones de línea del guion','Script line actions'));
    for(const item of menu.querySelectorAll('[data-script-context-action]')){
      const entry=entries.find(([action])=>action===item.dataset.scriptContextAction);
      item.lastElementChild.textContent=entry?tr(entry[1],entry[2]):'';
    }
  };
  $('uiLocaleSelect')?.addEventListener('change',()=>queueMicrotask(syncLocale));
  syncLocale();
  new MutationObserver(()=>{
    for(const checkbox of preview.querySelectorAll('[data-script-line-select]')){
      checkbox.setAttribute('aria-haspopup','menu');
      checkbox.setAttribute('aria-keyshortcuts','Shift+F10');
    }
  }).observe(preview,{childList:true});
}

function mountCueContextMenu(setView){
  const shell=document.querySelector('.shell');
  const cueList=$('cueList');
  if(!shell||!cueList)return;
  const menu=make('div','rq16-cue-context-menu');
  menu.id='rq16CueContextMenu';
  menu.setAttribute('role','menu');
  menu.hidden=true;
  const entries=[
    ['properties','Propiedades','Properties','M4 4h16v16H4zM8 8h8M8 12h8M8 16h5'],
    ['sound','Asignar / sustituir sonido','Assign / replace sound','M4 18V6m4 8V4m4 16V2m4 13V5m4 11V8'],
    ['insert','Insertar después','Insert after','M5 5v14m0-7h14m-5-5 5 5-5 5'],
    ['duplicate','Duplicar','Duplicate','M8 8h12v12H8zM4 16V4h12'],
    ['moveUp','Subir cue','Move cue up','M12 19V5m-6 6 6-6 6 6'],
    ['moveDown','Bajar cue','Move cue down','M12 5v14m-6-6 6 6 6-6'],
    ['delete','Eliminar cue','Delete cue','M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13'],
  ];
  for(const [action,es,en,path] of entries){
    const button=make('button','rq16-cue-context-item');
    button.type='button';
    button.dataset.contextAction=action;
    button.setAttribute('role','menuitem');
    button.append(icon(path));
    const label=make('span');label.textContent=tr(es,en);button.append(label);
    menu.append(button);
  }
  document.body.append(menu);
  let contextCueId=null;
  let returnFocus=null;
  const controls={
    insert:'cueInsertBtn',duplicate:'cueDuplicateBtn',moveUp:'cueMoveUpBtn',
    moveDown:'cueMoveDownBtn',delete:'cueDeleteBtn',
  };
  const readState=()=>{
    let state=null;
    document.dispatchEvent(new CustomEvent('runq:show-state-read',{
      detail:{respond:value=>{state=value;}}
    }));
    return state;
  };
  const close=(restoreFocus=false)=>{
    menu.hidden=true;
    contextCueId=null;
    if(restoreFocus&&returnFocus?.isConnected)returnFocus.focus();
    returnFocus=null;
  };
  const open=(cueId,anchor,x,y)=>{
    if(shell.dataset.activeWorkspace!=='cues')return;
    if(!anchor||!cueList.contains(anchor))return;
    if(anchor.getAttribute('aria-pressed')!=='true')anchor.click();
    const state=readState();
    if(state?.selectedCueId!==cueId)return;
    contextCueId=cueId;
    returnFocus=anchor;
    for(const item of menu.querySelectorAll('[data-context-action]')){
      const control=controls[item.dataset.contextAction];
      item.disabled=Boolean(control&&$(control)?.disabled);
    }
    menu.hidden=false;
    const rect=menu.getBoundingClientRect();
    menu.style.left=Math.max(8,Math.min(x,innerWidth-rect.width-8))+'px';
    menu.style.top=Math.max(8,Math.min(y,innerHeight-rect.height-8))+'px';
    menu.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
  };
  cueList.addEventListener('contextmenu',event=>{
    const anchor=event.target.closest('[data-cue-select]');
    if(!anchor)return;
    event.preventDefault();
    open(anchor.dataset.cueSelect,anchor,event.clientX,event.clientY);
  });
  cueList.addEventListener('keydown',event=>{
    if(event.key!=='ContextMenu'&&!(event.shiftKey&&event.key==='F10'))return;
    const anchor=event.target.closest('[data-cue-select]');
    if(!anchor)return;
    event.preventDefault();
    const rect=anchor.getBoundingClientRect();
    open(anchor.dataset.cueSelect,anchor,rect.left,rect.bottom);
  });
  menu.addEventListener('click',event=>{
    const item=event.target.closest('[data-context-action]');
    if(!item||item.disabled)return;
    const cueId=contextCueId;
    if(!cueId||readState()?.selectedCueId!==cueId){close();return;}
    const action=item.dataset.contextAction;
    close();
    if(action==='properties'||action==='sound'){
      setView('inspector');
      const section=action==='properties'?'details'
        :document.querySelector('#cueInspectorTab-audio')?'audio':'actions';
      document.querySelector('#cueInspectorTab-'+section)?.click();
      requestAnimationFrame(()=>{
        const target=action==='properties'
          ?document.querySelector('#cueInspectorTab-details')
          :[...document.querySelectorAll('[data-cue-audio-pick]')]
            .find(button=>button.dataset.cueAudioPick===cueId)??document.querySelector('#cueInspectorTab-actions');
        target?.focus();
      });
      return;
    }
    const control=controls[action];
    if(control)$(control)?.click();
    requestAnimationFrame(()=>{
      cueList.querySelector('[data-cue-select][aria-pressed="true"]')?.focus();
    });
  });
  menu.addEventListener('keydown',event=>{
    const items=[...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const index=items.indexOf(document.activeElement);
    if(event.key==='Escape'){event.preventDefault();close(true);return;}
    let next=null;
    if(event.key==='ArrowDown')next=items[(index+1+items.length)%items.length];
    else if(event.key==='ArrowUp')next=items[(index-1+items.length)%items.length];
    else if(event.key==='Home')next=items[0];
    else if(event.key==='End')next=items.at(-1);
    if(next){event.preventDefault();next.focus();}
  });
  document.addEventListener('pointerdown',event=>{
    if(!menu.hidden&&!menu.contains(event.target))close();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!menu.hidden){event.preventDefault();close(true);}
  });
  document.addEventListener('runq:show-state-changed',()=>close());
  const decorateRows=()=>{
    for(const row of cueList.querySelectorAll('[data-cue-select]')){
      row.setAttribute('aria-haspopup','menu');
      row.setAttribute('aria-keyshortcuts','Shift+F10');
    }
  };
  new MutationObserver(decorateRows).observe(cueList,{childList:true});
  decorateRows();
  const syncLocale=()=>{
    menu.setAttribute('aria-label',tr('Acciones del cue','Cue actions'));
    for(const item of menu.querySelectorAll('[data-context-action]')){
      const entry=entries.find(([action])=>action===item.dataset.contextAction);
      item.lastElementChild.textContent=entry?tr(entry[1],entry[2]):'';
    }
  };
  $('uiLocaleSelect')?.addEventListener('change',()=>queueMicrotask(syncLocale));
  syncLocale();
}

function mount(){
  const shell=document.querySelector('.shell');
  if(!shell||document.documentElement.classList.contains('rq16'))return;
  document.documentElement.classList.add('rq16','rq17');
  document.documentElement.id='runqApp';
  const nav=$('workspaceNav');
  const names={
    home:['Proyecto','Project','Tu próximo espectáculo empieza aquí.','Your next show starts here.'],
    cues:['Studio','Studio','Da forma a la secuencia. Cada detalle, en su sitio.','Shape the sequence. Every detail in its place.'],
    script:['Guion','Script','El texto original, conectado a tus cues.','The original text, connected to your cues.'],
    audio:['Sonido','Sound','Encuentra, crea y prepara el sonido de tu espectáculo.','Find, create and prepare the sound of your show.'],
    ai:['RUNQ AI','RUNQ AI','Explora ideas. Revisa y decide qué incorporar.','Explore ideas. Review and choose what to keep.'],
    setup:['Ajustes','Settings','Ajusta los dispositivos y preferencias locales.','Configure devices and local preferences.'],
    preflight:['Comprobación','Preflight','Comprueba cues y medios de este espectáculo.','Check this show’s cues and media.'],
    rehearsal:['Ensayo','Rehearsal','Guion, voz y secuencia. Tú llevas el control.','Script, voice and sequence. You are in control.'],
    operation:['Directo','Live','La secuencia preparada. El siguiente GO, siempre visible.','The sequence is ready. The next GO, always in view.']
  };
  // One navigation with text labels. Reorder the ORIGINAL route controls.
  const icons={home:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',cues:'M4 5h16M4 12h16M4 19h10',script:'M5 3h14v18H5ZM8 7h8M8 11h8M8 15h5',audio:'M3 10v4m4-8v12m5-15v18m5-15v12m4-8v4',ai:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',setup:'m5 12 4 4L19 6M3 3h18v18H3',preflight:'M5 4h14v16H5ZM8 8h8M8 12h8M8 16h5',rehearsal:'M9 3h6v11H9ZM5 10v3a7 7 0 0 0 14 0v-3M12 20v3',operation:'m8 4 13 8-13 8Z'};
  nav.querySelectorAll('.rq7-nav-heading').forEach(node=>node.remove());
  for(const group of [['project',['home']],['studio',['cues','script','audio','ai','setup','preflight']],['stage',['rehearsal','operation']]]){
    const heading=make('span','rq16-nav-group');heading.dataset.group=group[0];nav.append(heading);
    for(const route of group[1]){
      const button=nav.querySelector(`[data-workspace-nav="${route}"]`);
      button.removeAttribute('data-i18n');
      const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
      icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
      const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d',icons[route]);icon.append(path);
      const label=make('span');label.dataset.routeLabel=route;
      button.replaceChildren(icon,label);nav.append(button);
    }
  }
  const footer=make('div','rq16-nav-footer');
  footer.append(make('span','rq16-local-dot'),make('span'));nav.append(footer);

  const settings=nav.querySelector('[data-workspace-nav="setup"]');
  settings.classList.remove('workspace-tab');
  settings.classList.add('rq16-settings');
  settings.querySelector('path').setAttribute('d','M10 2h4l.5 3 2 1 2.8-1 2 3.4-2.3 2v3.2l2.3 2-2 3.4-2.8-1-2 1-.5 3h-4l-.5-3-2-1-2.8 1-2-3.4 2.3-2v-3.2l-2.3-2 2-3.4 2.8 1 2-1ZM15.5 12a3.5 3.5 0 1 0-7 0 3.5 3.5 0 0 0 7 0');
  document.querySelector('.top-actions').insertBefore(settings,$('uiLocaleSelect'));

  const topbar=document.querySelector('.topbar');
  const brandMark=make('img','rq16-brand-mark');
  brandMark.src='/assets/runq-logo-full.png';brandMark.alt='RUNQ · From script to stage';
  document.querySelector('.brand').prepend(brandMark);
  topbar.insertBefore(nav,document.querySelector('.project-identity'));
  const appMenu=make('details','rq16-app-menu');appMenu.id='rq16AppMenu';
  const menuLabel=make('summary');appMenu.append(menuLabel,document.querySelector('.runq-menubar'));
  document.querySelector('.top-actions').append(appMenu);
  appMenu.addEventListener('click',event=>{
    if(event.target.closest('.runq-menu-panel button'))appMenu.open=false;
  });
  document.addEventListener('pointerdown',event=>{
    if(!appMenu.contains(event.target))appMenu.open=false;
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&appMenu.open){appMenu.open=false;menuLabel.focus();}
  });

  // Present one title instead of three competing headers and duplicate mode tabs.
  const heading=document.querySelector('.rq8-ribbon-heading');
  const ribbon=$('rq7Workbench');ribbon.prepend(heading);
  const context=make('span','rq16-context');ribbon.append(context);

  const home=document.querySelector('.home-panel');
  const backdrop=make('img','rq16-home-backdrop');
  backdrop.src='/assets/runq-backstage.png';backdrop.alt='';backdrop.setAttribute('aria-hidden','true');
  home.prepend(backdrop);
  const hero=make('header','rq16-home-hero');
  const intro=make('div','rq16-home-copy');
  const eyebrow=make('span','rq16-eyebrow');
  const title=make('h1');const description=make('p');
  const startAI=make('button','btn accent');startAI.type='button';startAI.id='rq16StartAI';
  startAI.addEventListener('click',()=>nav.querySelector('[data-workspace-nav="ai"]').click());
  const aiNote=make('small','rq16-ai-note');
  intro.append(home.querySelector('.home-logo'),eyebrow,title,description,startAI,aiNote);
  hero.append(intro);home.prepend(hero);
  const tiles=home.querySelector('.home-tiles');
  const tileIcons={
    homeNewBtn:'M5 3h10l4 4v6M5 3v18h7M15 3v5h5M17 14v8M13 18h8',
    homeImportScriptBtn:icons.script,
    homeOpenZipBtn:'M3 7h6l2 2h10v12H3ZM3 7V4h7l2 3',
    homeDemoBtn:icons.audio,
  };
  for(const id of ['homeNewBtn','homeImportScriptBtn','homeOpenZipBtn','homeDemoBtn']){
    const tile=$(id);tile.classList.toggle('featured',id==='homeNewBtn');
    const icon=nav.querySelector('[data-workspace-nav="script"] svg').cloneNode(true);
    icon.querySelector('path').setAttribute('d',tileIcons[id]);
    icon.classList.add('rq16-tile-icon');tile.prepend(icon);
    const arrow=make('i','rq16-tile-arrow');arrow.textContent='→';arrow.setAttribute('aria-hidden','true');
    tile.append(arrow);tiles.append(tile);
  }
  const current=make('div','rq16-current-project');
  current.id='rq16CurrentProject';
  const currentLabel=make('span');const currentTitle=make('strong');
  const projectCopy=make('div','rq16-project-copy');
  const projectSummary=make('p');projectSummary.id='rq16ProjectSummary';
  projectCopy.append(currentTitle,projectSummary);
  const resume=make('button','btn subtle');resume.type='button';resume.id='rq16Resume';
  resume.addEventListener('click',()=>nav.querySelector('[data-workspace-nav="cues"]').click());
  current.append(currentLabel,projectCopy,resume,$('saveBundleBtn'));home.append(current);
  const syncProject=()=>{currentTitle.textContent=$('activeShowTitle').textContent;};
  new MutationObserver(syncProject).observe($('activeShowTitle'),{childList:true,characterData:true,subtree:true});
  syncProject();

  const aiWelcome=make('header','rq16-ai-welcome');aiWelcome.id='rq16AIWelcome';
  const aiEyebrow=make('span','rq16-eyebrow');
  const aiTitle=make('h1');const aiDescription=make('p');
  const aiSteps=make('ol','rq16-ai-steps');
  aiWelcome.append(aiEyebrow,aiTitle,aiDescription,aiSteps);
  const aiPanel=document.querySelector('.panel[data-workspaces~="ai"]');
  aiPanel.prepend(aiWelcome);
  mountShowBuilder(aiPanel,aiWelcome,aiSteps);
  mountCueToolbar();
  const scriptPanel=document.querySelector('.panel[data-workspaces~="script"]');
  mountScriptToolbar(scriptPanel,nav);
  mountScriptContextMenu(scriptPanel);

  function syncState(){
    let state;
    document.dispatchEvent(new CustomEvent('runq:show-state-read',{detail:{respond:value=>{state=value;}}}));
    if(!state)return;
    const status=state.audioStatus;
    const audioBusy=status&&(status.activeCueCount>0||status.pendingGoCount>0||
      status.auditionActive||status.auditionPending||status.soundLabPreviewActive);
    $('stopAllBtn').hidden=!audioBusy&&!['cues','rehearsal','operation'].includes(state.workspace);
    projectSummary.textContent=tr(
      `${state.cueCount} cues · ${state.assets.filter(asset=>asset.ready).length} sonidos listos · ${state.scriptText?'Guion importado':'Sin guion'}`,
      `${state.cueCount} cues · ${state.assets.filter(asset=>asset.ready).length} sounds ready · ${state.scriptText?'Script imported':'No script yet'}`);
    resume.disabled=!state.cueCount;
    syncProject();
  }
  document.addEventListener('runq:show-state-changed',syncState);
  document.addEventListener('runq:audio-state-change',syncState);

  // Explicit, reversible pane focus. No cue state changes and no fake resizing.
  const views=make('div','rq16-editor-views');views.id='rq16EditorViews';views.setAttribute('role','group');
  const viewNames={both:['Dividido','Split'],sequence:['Secuencia','Sequence'],inspector:['Inspector','Inspector']};
  let view='both';
  try{const saved=localStorage.getItem('runq.interface.editorView');if(Object.hasOwn(viewNames,saved))view=saved;}catch{}
  const setView=next=>{
    view=next;shell.dataset.editorView=view;
    for(const button of views.querySelectorAll('[data-editor-view]'))button.setAttribute('aria-pressed',String(button.dataset.editorView===view));
    try{localStorage.setItem('runq.interface.editorView',view);}catch{}
  };
  for(const mode of Object.keys(viewNames)){
    const button=make('button');button.type='button';button.dataset.editorView=mode;
    button.setAttribute('aria-controls','cueList cueInspector');
    button.addEventListener('click',()=>setView(mode));views.append(button);
  }
  const reset=make('button','rq16-reset');reset.type='button';reset.id='rq16ResetLayout';
  reset.addEventListener('click',()=>{
    setView('both');document.querySelector('.rq7-split-handle')?.dispatchEvent(new MouseEvent('dblclick'));
  });views.append(reset);
  document.querySelector('.rq5-stage-actions').append(views);setView(view);
  mountCueContextMenu(setView);
  const agentToggle=$('rqAgentToggle');
  if(agentToggle)views.before(agentToggle);

  function sync(){
    const route=shell.dataset.activeWorkspace;
    const data=names[route]??names.audio;
    heading.querySelector('strong').textContent=tr(data[0],data[1]);
    heading.querySelector('span').textContent=tr(data[2],data[3]);
    context.textContent=route==='operation'?tr('EN ESCENA','ON STAGE'):route==='rehearsal'?tr('ENSAYO','REHEARSAL'):tr('PREPARACIÓN','PREPARATION');
    for(const label of shell.querySelectorAll('[data-route-label]')){
      const name=names[label.dataset.routeLabel];label.textContent=tr(name[0],name[1]);
    }
    const groupNames={project:['ESPACIO DE TRABAJO','WORKSPACE'],studio:['PREPARAR','PREPARE'],stage:['EN ESCENA','ON STAGE']};
    for(const label of nav.querySelectorAll('[data-group]'))label.textContent=tr(...groupNames[label.dataset.group]);
    footer.lastElementChild.textContent=tr('Audio local · salida del sistema','Local audio · system output');
    eyebrow.textContent=tr('DEL GUION A ESCENA','FROM SCRIPT TO STAGE');
    title.textContent=tr('Todo listo para\ntu próximo GO.','Everything ready for\nyour next GO.');
    description.textContent=tr('Del primer guion al último cue. Diseña con RUNQ AI, revisa en Studio y lleva el control en escena.','From the first script to the final cue. Design with RUNQ AI, review in Studio and stay in control on stage.');
    startAI.textContent=tr('Preparar mi espectáculo →','Prepare my show →');
    aiNote.textContent=tr('La IA propone. Tú decides. Nada se reproduce automáticamente.','AI proposes. You decide. Nothing plays automatically.');
    menuLabel.textContent=tr('Menú','Menu');
    aiEyebrow.textContent=tr('TU ESPACIO CREATIVO','YOUR CREATIVE WORKSPACE');
    aiTitle.textContent=tr('El guion es el inicio.\nTú decides cómo suena.','The script is the start.\nYou decide how it sounds.');
    aiDescription.textContent=tr('Empieza por el guion, un cue o el sonido. Trabaja sobre el espectáculo activo, conserva su contexto y revisa cada cambio antes de aplicarlo.','Start from the script, a cue or a sound. Work on the active show, keep its context and review every change before applying it.');
    currentLabel.textContent=tr('PROYECTO ACTIVO','ACTIVE PROJECT');resume.textContent=tr('Abrir en Studio →','Open in Studio →');
    views.setAttribute('aria-label',tr('Distribución del editor','Editor layout'));
    for(const button of views.querySelectorAll('[data-editor-view]'))button.textContent=tr(...viewNames[button.dataset.editorView]);
    reset.textContent=tr('Restablecer','Reset');
    // Original translation system may rewrite labels on locale change.
    document.querySelector('.rq7-split-handle')?.setAttribute('title',tr('Arrastra para ajustar · doble clic para restablecer','Drag to resize · double-click to reset'));
    syncState();
  }
  new MutationObserver(sync).observe(shell,{attributes:true,attributeFilter:['data-active-workspace']});
  $('uiLocaleSelect').addEventListener('change',()=>queueMicrotask(sync));
  sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
