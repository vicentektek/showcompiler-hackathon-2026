/**
 * RunQ V11 single, visible audition toolbar across Sound/Library/Generate.
 * Moves ORIGINAL live buttons; never duplicates playback logic or engine.
 * Audio ownership remains in app.mjs and src/sfx/lab.mjs.
 */
const $=id=>document.getElementById(id);
const es=()=>$('uiLocaleSelect')?.value==='es';
const word=(a,b)=>es()?a:b;
function mount(){
  const grid=document.querySelector('.rq10 .rq5-audio-grid');
  const audio=document.querySelector('.rq10 [data-workspaces="audio"]');
  const picker=$('rq5AudioSource');
  const list=$('assetList');
  const labPlay=$('playBtn');
  const labStop=$('stopBtn');
  const libStop=$('stopAuditionBtn');
  if(!grid||!audio||!picker||!list||!labPlay||!labStop||!libStop||$('rq11AuditionTransport'))return;
  document.documentElement.classList.add('rq11');
  const transport=document.createElement('div');
  transport.id='rq11AuditionTransport';
  transport.className='rq11-audition-transport';
  transport.setAttribute('role','group');
  const identity=document.createElement('div');
  identity.className='rq11-audition-identity';
  const current=document.createElement('strong');
  current.id='rq11CurrentSource';
  const hint=document.createElement('span');
  hint.id='rq11SourceHint';
  identity.append(current,hint);
  const actions=document.createElement('div');
  actions.className='rq11-audition-actions';
  const play=document.createElement('button');
  play.type='button';play.id='rq11PlayLibrary';
  play.className='btn accent rq11-transport-play';
  play.textContent='▶';
  play.setAttribute('aria-label','Audition selected audio');
  const stopContainer=document.createElement('div');
  stopContainer.className='rq11-original-transport';
  stopContainer.append(libStop,labStop);
  actions.append(play,labPlay,stopContainer);
  const expand=document.createElement('button');
  expand.type='button';expand.id='rq11ExpandWave';
  expand.className='btn subtle small rq11-expand-wave';
  const note=document.createElement('div');
  note.className='rq11-audition-note';note.id='rq11AuditionNote';
  transport.append(identity,actions,expand);
  // Compact waveform is not transport: controls always remain above both views.
  grid.before(transport,note);
  const onLibrary=()=>grid.dataset.rq10SoundView!=='generate';
  const chosen=()=>picker.value;
  function syncSelection(){
    const id=chosen();
    for(const row of list.querySelectorAll('.asset-list-row')){
      const selected=row.querySelector('[data-asset-audition]')?.dataset.assetAudition===id;
      row.classList.toggle('rq11-source-selected',!!selected);
    }
    const entry=[...list.querySelectorAll('[data-asset-audition]')]
      .find(button=>button.dataset.assetAudition===id);
    const row=entry?.closest('.asset-list-row');
    const name=row?.querySelector('.tag')?.textContent?.trim()??'';
    current.textContent=name||word('Selecciona un audio de la biblioteca','Choose an audio source');
    hint.textContent=onLibrary()
      ?word('Original · preescucha desde el inicio','Original · audition starts at beginning')
      :word('Laboratorio · reproducción desde IN','Sound Lab · playback starts at IN');
    play.disabled=!entry||entry.disabled;
    play.title=word('Escuchar el archivo seleccionado (no hace GO)','Audition selected file (no GO)');
    play.setAttribute('aria-label',word('Escuchar seleccionado','Audition selected audio'));
    libStop.title=word('Detener preescucha del sonido','Stop selected audio audition');
    labStop.title=word('Detener escucha del laboratorio','Stop Sound Lab preview');
  }
  function refresh(){
    const library=onLibrary();
    transport.dataset.mode=library?'library':'generate';
    syncSelection();
    const expanded=audio.dataset.rq11ExpandedWave==='true';
    expand.setAttribute('aria-pressed',String(expanded));
    expand.textContent=expanded?word('Reducir onda','Compact wave'):word('Ampliar onda','Expand waveform');
    note.textContent=word(
      'Transporte de PREESCUCHA · No cambia NEXT ni ejecuta GO · Misma salida física que Directo, sin bus PFL independiente',
      'AUDITION transport · Does not change NEXT or execute GO · Same physical output as Live, no independent PFL bus'
    );
  }
  play.addEventListener('click',()=>{
    if(!onLibrary())return;
    const id=chosen();
    const button=[...list.querySelectorAll('[data-asset-audition]')].find(b=>b.dataset.assetAudition===id);
    if(button&&!button.disabled)button.click();
  });
  picker.addEventListener('change',refresh);
  list.addEventListener('click',event=>{
    if(event.target.closest('button, input, select, a'))return;
    const row=event.target.closest('.asset-list-row');
    if(!row||!list.contains(row))return;
    const id=row.querySelector('[data-asset-audition]')?.dataset.assetAudition;
    if(!id||!Array.from(picker.options).some(option=>option.value===id))return;
    picker.value=id;
    picker.dispatchEvent(new Event('change',{bubbles:true}));
    // Selecting a row only inspects. Never plays audio or arms a GO.
  });
  const observer=new MutationObserver(()=>queueMicrotask(refresh));
  observer.observe(list,{childList:true,subtree:false});
  observer.observe(grid,{attributes:true,attributeFilter:['data-rq10-sound-view']});
  // Existing transport updates buttons directly: observe only disabled states.
  observer.observe(libStop,{attributes:true,attributeFilter:['disabled']});
  observer.observe(labPlay,{attributes:true,attributeFilter:['disabled']});
  observer.observe(labStop,{attributes:true,attributeFilter:['disabled']});
  $('uiLocaleSelect')?.addEventListener('change',()=>queueMicrotask(refresh));
  expand.addEventListener('click',()=>{
    audio.dataset.rq11ExpandedWave=audio.dataset.rq11ExpandedWave==='true'?'false':'true';
    refresh();
  });
  refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
