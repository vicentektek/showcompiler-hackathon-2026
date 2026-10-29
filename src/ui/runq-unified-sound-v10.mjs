/**
 * RunQ V10 sound workstation. This moves, never clones, the existing tested
 * Library and Sound Lab DOM into one audio route. One library remains visible.
 * All original SFX form/button IDs and listeners are preserved.
 * No additional audio context or transport is created by this presentation.
 */
const $=id=>document.getElementById(id);
const isEs=()=>$('uiLocaleSelect')?.value==='es';
const copy=(es,en)=>isEs()?es:en;
function mountUnifiedSound(){
  const shell=document.querySelector('.shell');
  const audio=document.querySelector('section[data-workspaces="audio"]');
  const lab=document.querySelector('section[data-workspaces="soundlab"]');
  const grid=audio?.querySelector('.rq5-audio-grid');
  const lib=grid?.querySelector('.rq5-audio-library');
  const editor=grid?.querySelector('.rq5-audio-editor');
  const navAudio=document.querySelector('[data-workspace-nav="audio"]');
  const navLab=document.querySelector('[data-workspace-nav="soundlab"]');
  if(!shell||!audio||!lab||!grid||!lib||!editor||!navAudio||!navLab||audio.dataset.rq10Unified)return;
  document.documentElement.classList.add('rq10');
  audio.dataset.rq10Unified='true';
  lab.removeAttribute('data-workspaces');
  lab.hidden=false; // Parent Audio workspace owns visibility from now on.
  lab.classList.add('rq10-integrated-lab');
  grid.append(lab);
  const header=document.createElement('div');
  header.className='rq10-sound-heading';
  const title=document.createElement('div');
  const h=document.createElement('strong');
  const sub=document.createElement('span');
  title.append(h,sub);
  const tabs=document.createElement('div');
  tabs.className='rq10-sound-tabs';
  tabs.setAttribute('role','tablist');
  tabs.setAttribute('aria-label','Sound editor modes');
  const library=document.createElement('button');
  library.type='button';
  library.dataset.rq10SoundTab='library';
  library.setAttribute('role','tab');
  library.setAttribute('aria-controls','rq5WaveCanvas');
  const generate=document.createElement('button');
  generate.type='button';
  generate.dataset.rq10SoundTab='generate';
  generate.setAttribute('role','tab');
  generate.setAttribute('aria-controls','waveCanvas');
  tabs.append(library,generate);
  header.append(title,tabs);
  grid.before(header);

  // Real library search: filters existing media rows without changing
  // project state, original bytes, cue numbering or transport/GO.
  const assetList=$('assetList');
  const searchBar=document.createElement('div');
  searchBar.className='rq10-library-search';
  const search=document.createElement('input');
  search.type='search';search.id='rq10LibrarySearch';
  search.autocomplete='off';
  search.setAttribute('aria-label','Search library audio');
  const searchCount=document.createElement('span');
  searchCount.id='rq10LibrarySearchCount';
  searchCount.setAttribute('role','status');
  searchCount.setAttribute('aria-live','polite');
  searchBar.append(search,searchCount);
  assetList.before(searchBar);
  function filterAssets(){
    const query=search.value.trim().toLocaleLowerCase();
    const rows=[...assetList.querySelectorAll('.asset-list-row')];
    let visible=0;
    for(const row of rows){
      const matches=!query||row.querySelector('.tag')?.textContent.toLocaleLowerCase().includes(query);
      row.dataset.rq10Filtered=String(!matches);
      if(matches)visible++;
    }
    searchCount.textContent=visible+' / '+rows.length;
  }
  search.addEventListener('input',filterAssets);
  new MutationObserver(()=>queueMicrotask(filterAssets)).observe(assetList,{childList:true});
  const caption=document.createElement('p');
  caption.className='rq10-output-warning';
  caption.setAttribute('role','note');
  grid.before(caption);

  let mode=new URLSearchParams(location.search).get('workspace')==='soundlab'?'generate':'library';
  function refreshCueTargets(){
    const target=$('rq10TargetCue');
    if(!target)return;
    let cues=[];
    document.dispatchEvent(new CustomEvent('runq:sound-list-cues',{
      detail:{respond:items=>{cues=Array.isArray(items)?items:[];}}
    }));
    const previous=target.value;
    target.replaceChildren();
    const placeholder=document.createElement('option');
    placeholder.value='';
    placeholder.textContent=copy('Seleccionar cue…','Select cue…');
    target.append(placeholder);
    for(const cue of cues){
      const option=document.createElement('option');
      option.value=cue.id;option.textContent=cue.number+' · '+cue.label;
      target.append(option);
    }
    if(cues.some(c=>c.id===previous))target.value=previous;
  }
  function setMode(next){
    if(next!=='library'&&next!=='generate')return;
    // Switch only the right editor; original project library stays visible.
    if(mode==='generate'&&next==='library')
      document.dispatchEvent(new Event('runq:sound-stop-preview'));
    mode=next;
    grid.dataset.rq10SoundView=next; // CSS targets direct sibling editor panes
    for(const [tab,name] of [[library,'library'],[generate,'generate']]){
      const selected=name===next;
      tab.setAttribute('aria-selected',String(selected));
      tab.tabIndex=selected?0:-1;
    }
    if(next==='generate'){
      refreshCueTargets();
      document.dispatchEvent(new CustomEvent('runq:sound-lab-visible'));
    }
  }
  function translate(){
    h.textContent=copy('SONIDO · BIBLIOTECA Y CREACIÓN','SOUND · LIBRARY & CREATION');
    sub.textContent=copy('Selecciona archivos, comprueba la onda y prepara audio para tus cues',
      'Choose source files, inspect waveforms and prepare audio for your cues');
    library.textContent=copy('Biblioteca y onda','Library & waveform');
    generate.textContent=copy('Crear y editar','Create & edit');
    caption.textContent=copy(
      'Preescucha en la salida principal del ordenador. No es un bus PFL. PARAR TODO detiene también la escucha del laboratorio.',
      'Preview uses the main computer output, not a private PFL bus. STOP ALL also stops Sound Lab audition.'
    );
    navAudio.textContent=copy('Sonido','Sound');
    navAudio.setAttribute('aria-label',copy('Sonido','Sound'));
    search.placeholder=copy('Buscar archivos de audio…','Search audio files…');
    search.setAttribute('aria-label',copy('Buscar en la biblioteca','Search the sound library'));
    navLab.setAttribute('aria-hidden','true');
    navLab.tabIndex=-1;
    const actionsTitle=$('rq10LibraryActionsTitle');
    if(actionsTitle)actionsTitle.textContent=copy('Aplicar a cue','Apply to cue');
    const create=$('rq10CreateLibraryCue');
    if(create)create.textContent=copy('Crear cue con este audio','Create cue from this audio');
    const assign=$('rq10AssignLibraryCue');
    if(assign)assign.textContent=copy('Asignar y aplicar ajustes','Assign and apply edits');
    const targetLabel=document.querySelector('.rq10-target-label');
    if(targetLabel?.firstChild?.nodeType===Node.TEXT_NODE)
      targetLabel.firstChild.nodeValue=copy('Cue existente ','Existing cue ');
    refreshCueTargets();
  }
  library.addEventListener('click',()=>setMode('library'));
  generate.addEventListener('click',()=>setMode('generate'));
  tabs.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const next=event.key==='Home'||event.key==='ArrowLeft'?'library':'generate';
    setMode(next);
    (next==='library'?library:generate).focus();
  });
  document.addEventListener('runq:sound-mode',event=>setMode(event.detail?.mode));
  const cueList=$('cueList');
  if(cueList)new MutationObserver(()=>queueMicrotask(refreshCueTargets))
    .observe(cueList,{childList:true});
  $('uiLocaleSelect')?.addEventListener('change',()=>queueMicrotask(translate));
  const observer=new MutationObserver(()=>{
    if(navAudio.textContent!==copy('Sonido','Sound'))translate();
  });
  observer.observe(navAudio,{childList:true,subtree:true});
  translate();
  filterAssets();
  setMode(mode);
}
if(document.readyState==='loading')
  document.addEventListener('DOMContentLoaded',mountUnifiedSound,{once:true});
else mountUnifiedSound();
