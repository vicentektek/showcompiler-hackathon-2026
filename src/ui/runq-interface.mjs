/** Interface composition only. Original controls retain ownership of all commands. */
const $=id=>document.getElementById(id);
const tr=(es,en)=>$('uiLocaleSelect')?.value==='es'?es:en;
const make=(tag,className='')=>Object.assign(document.createElement(tag),{className});

function mount(){
  const shell=document.querySelector('.shell');
  if(!shell||document.documentElement.classList.contains('rq16'))return;
  document.documentElement.classList.add('rq16');
  document.documentElement.id='runqApp';
  const nav=$('workspaceNav');
  const names={
    home:['Proyecto','Project','Tu próximo espectáculo empieza aquí.','Your next show starts here.'],
    cues:['Studio','Studio','Da forma a la secuencia. Cada detalle, en su sitio.','Shape the sequence. Every detail in its place.'],
    script:['Guion','Script','El texto original, conectado a tus cues.','The original text, connected to your cues.'],
    audio:['Sonido','Sound','Encuentra, crea y prepara el sonido de tu espectáculo.','Find, create and prepare the sound of your show.'],
    ai:['Propuestas IA','AI proposals','Explora ideas. Revisa y decide qué incorporar.','Explore ideas. Review and choose what to keep.'],
    setup:['Configuración','Setup','Ajusta los dispositivos y preferencias locales.','Configure devices and local preferences.'],
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

  // Present one title instead of three competing headers and duplicate mode tabs.
  const heading=document.querySelector('.rq8-ribbon-heading');
  const ribbon=$('rq7Workbench');ribbon.prepend(heading);
  const context=make('span','rq16-context');ribbon.append(context);

  const home=document.querySelector('.home-panel');
  const hero=make('header','rq16-home-hero');
  const intro=make('div','rq16-home-copy');
  const eyebrow=make('span','rq16-eyebrow');
  const title=make('h1');const description=make('p');
  intro.append(eyebrow,title,description);
  const motif=make('div','rq16-home-motif');motif.setAttribute('aria-hidden','true');
  for(const [index,width] of [72,44,88,58,35,68].entries()){
    const bar=make('i');bar.style.setProperty('--bar',width+'%');bar.dataset.number=String(index+1).padStart(2,'0');motif.append(bar);
  }
  hero.append(intro,motif);home.prepend(hero);
  const current=make('div','rq16-current-project');
  const currentLabel=make('span');const currentTitle=make('strong');
  const resume=make('button','btn subtle');resume.type='button';resume.id='rq16Resume';
  resume.addEventListener('click',()=>nav.querySelector('[data-workspace-nav="cues"]').click());
  current.append(currentLabel,currentTitle,resume);home.append(current);
  const syncProject=()=>{currentTitle.textContent=$('activeShowTitle').textContent;};
  new MutationObserver(syncProject).observe($('activeShowTitle'),{childList:true,characterData:true,subtree:true});
  syncProject();

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

  function sync(){
    const route=shell.dataset.activeWorkspace;
    const data=names[route]??names.audio;
    heading.querySelector('strong').textContent=tr(data[0],data[1]);
    heading.querySelector('span').textContent=tr(data[2],data[3]);
    context.textContent=route==='operation'?tr('EN ESCENA','ON STAGE'):route==='rehearsal'?tr('ENSAYO','REHEARSAL'):tr('PREPARACIÓN','PREPARATION');
    for(const label of nav.querySelectorAll('[data-route-label]')){
      const name=names[label.dataset.routeLabel];label.textContent=tr(name[0],name[1]);
    }
    const groupNames={project:['ESPACIO DE TRABAJO','WORKSPACE'],studio:['PREPARAR','PREPARE'],stage:['EN ESCENA','ON STAGE']};
    for(const label of nav.querySelectorAll('[data-group]'))label.textContent=tr(...groupNames[label.dataset.group]);
    footer.lastElementChild.textContent=tr('Audio local · salida del sistema','Local audio · system output');
    eyebrow.textContent=tr('DEL GUION A ESCENA','FROM SCRIPT TO STAGE');
    title.textContent=tr('Todo listo para\ntu próximo GO.','Everything ready for\nyour next GO.');
    description.textContent=tr('Prepara el sonido. Encuentra el momento. Dale vida a tu espectáculo.','Prepare the sound. Find the moment. Bring your show to life.');
    currentLabel.textContent=tr('PROYECTO ACTIVO','ACTIVE PROJECT');resume.textContent=tr('Abrir en Studio →','Open in Studio →');
    views.setAttribute('aria-label',tr('Distribución del editor','Editor layout'));
    for(const button of views.querySelectorAll('[data-editor-view]'))button.textContent=tr(...viewNames[button.dataset.editorView]);
    reset.textContent=tr('Restablecer','Reset');
    // Original translation system may rewrite labels on locale change.
    document.querySelector('.rq7-split-handle')?.setAttribute('title',tr('Arrastra para ajustar · doble clic para restablecer','Drag to resize · double-click to reset'));
  }
  new MutationObserver(sync).observe(shell,{attributes:true,attributeFilter:['data-active-workspace']});
  $('uiLocaleSelect').addEventListener('change',()=>queueMicrotask(sync));
  sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
