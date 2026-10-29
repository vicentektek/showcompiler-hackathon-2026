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

  const caption=document.createElement('p');
  caption.className='rq10-output-warning';
  caption.setAttribute('role','note');
  grid.before(caption);

  let mode=new URLSearchParams(location.search).get('workspace')==='soundlab'?'generate':'library';
  function setMode(next){
    if(next!=='library'&&next!=='generate')return;
    // Switch only the right editor; original project library stays visible.
    if(mode==='generate'&&next==='library')
      document.dispatchEvent(new Event('runq:sound-stop-preview'));
    mode=next;
    audio.dataset.rq10SoundView=next;
    for(const [tab,name] of [[library,'library'],[generate,'generate']]){
      const selected=name===next;
      tab.setAttribute('aria-selected',String(selected));
      tab.tabIndex=selected?0:-1;
    }
    if(next==='generate')document.dispatchEvent(new CustomEvent('runq:sound-lab-visible'));
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
    navLab.setAttribute('aria-hidden','true');
    navLab.tabIndex=-1;
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
  $('uiLocaleSelect')?.addEventListener('change',()=>queueMicrotask(translate));
  const observer=new MutationObserver(()=>{
    if(navAudio.textContent!==copy('Sonido','Sound'))translate();
  });
  observer.observe(navAudio,{childList:true,subtree:true});
  translate();
  setMode(mode);
}
if(document.readyState==='loading')
  document.addEventListener('DOMContentLoaded',mountUnifiedSound,{once:true});
else mountUnifiedSound();
