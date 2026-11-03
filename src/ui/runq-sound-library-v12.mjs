/**
 * RunQ V12 — accessible library-first sound desk.
 * Presentation-only DOM reshuffle: moves existing import buttons/forms with
 * their live handlers; does not create a player, execute GO or modify shows.
 * The file list ALWAYS retains a dedicated scrollable viewport.
 */
const byId=id=>document.getElementById(id);
const spanish=()=>byId('uiLocaleSelect')?.value==='es';
const t=(es,en)=>spanish()?es:en;

function mountSoundLibrary(){
  const panel=document.querySelector('section[data-workspaces="audio"]');
  const library=panel?.querySelector('.rq5-audio-library');
  const list=byId('assetList');
  const batch=library?.querySelector('.audio-batch-import');
  const importFiles=byId('importAudioBatchBtn');
  const importArchive=byId('importAudioZipBtn');
  if(!panel||!library||!list||!batch||!importFiles||!importArchive||byId('rq12LibraryToolbar'))return;
  document.documentElement.classList.add('rq12');
  library.classList.add('rq12-library');
  // Buttons preserve actual app.mjs import listeners and safety disabled state.
  const toolbar=document.createElement('div');
  toolbar.id='rq12LibraryToolbar';
  toolbar.className='rq12-library-toolbar';
  toolbar.append(importFiles,importArchive);

  const advanced=document.createElement('details');
  advanced.id='rq12ImportAdvanced';
  advanced.className='rq12-import-advanced';
  const toggle=document.createElement('summary');
  toggle.id='rq12AdvancedToggle';
  toggle.setAttribute('aria-controls','rq12AdvancedPanel');
  const drawer=document.createElement('div');
  drawer.id='rq12AdvancedPanel';
  drawer.className='rq12-import-panel';
  advanced.append(toggle,drawer);
  toolbar.append(advanced);
  const dropZone=byId('audioBatchDropZone');
  if(dropZone)toolbar.append(dropZone);

  // The report MUST be detached BEFORE the batch import section is moved
  // into a closed <details>. Otherwise import results become invisible although
  // their text updates (a regression detected by the browser smoke test).
  const report=byId('audioBatchReport');
  if(report&&report.parentElement!==library)library.insertBefore(report,list);
  // Legacy manual media reference and format details remain available,
  // but cannot push the list below the fold. They live in a bounded popover.
  for(const selector of ['.subheading','#assetForm','.line-actions',
    '.audio-batch-import']){
    const node=library.querySelector(':scope > '+selector);
    if(node)drawer.append(node);
  }
  const guide=library.querySelector(':scope > p.caption');
  if(guide)drawer.append(guide);

  const heading=library.querySelector(':scope > .rq5-pane-heading');
  if(heading)heading.after(toolbar);
  else library.prepend(toolbar);

  // Compact professional columns: the file list is the main work area,
  // not a collection of cards. Same original row actions underneath.
  const columns=document.createElement('div');
  columns.className='rq13-media-columns';
  const nameCol=document.createElement('span'),playCol=document.createElement('span'),
    editCol=document.createElement('span');
  columns.append(nameCol,playCol,editCol);
  list.before(columns);
  const status=document.createElement('div');
  status.id='rq12LibraryCount';
  status.className='rq12-library-counter';
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  const search=byId('rq10LibrarySearch');
  search?.parentElement?.append(status);
  const headingTitle=heading?.querySelector('strong,span');
  const previewStatus=document.createElement('span');
  previewStatus.id='rq12PreviewStatus';
  previewStatus.className='rq12-preview-status';
  previewStatus.setAttribute('role','status');
  byId('rq11AuditionTransport')?.querySelector('.rq11-audition-actions')?.prepend(previewStatus);

  function refreshRows(){
    let loaded=0;
    const rows=[...list.querySelectorAll('.asset-list-row')];
    for(const row of rows){
      if(row.dataset.audioLoaded==='true')loaded++;
      row.tabIndex=0;
      row.setAttribute('role','group');
      const audition=row.querySelector('[data-asset-audition]');
      if(audition){
        if(!audition.dataset.rq12Iconified){
          audition.dataset.rq12Iconified='true';
          audition.textContent='▶';
        }
        const name=row.querySelector('.tag')?.getAttribute('title')??'';
        audition.setAttribute('aria-label',t('Preescuchar ','Audition ')+name);
        audition.title=t('Preescuchar · No ejecuta GO','Audition · Does not execute GO');
        audition.classList.add('rq12-row-play');
      }
      const edit=row.querySelector('[data-sound-edit]');
      if(edit){
        edit.textContent=t('Editar','Edit');
        edit.setAttribute('aria-label',t('Editar audio ','Edit audio ')+(row.querySelector('.tag')?.title??''));
        edit.classList.add('rq12-row-edit');
      }
    }
    status.textContent=t(loaded+' de '+rows.length+' disponibles',loaded+' of '+rows.length+' ready');
  }
  // No duplicate listeners on rows that get recreated by app.mjs on render.
  const rowsObserver=new MutationObserver(()=>queueMicrotask(refreshRows));
  rowsObserver.observe(list,{childList:true});
  refreshRows();

  list.addEventListener('keydown',event=>{
    const row=event.target.closest('.asset-list-row');
    if(!row||event.target!==row)return;
    if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      row.querySelector('.tag')?.click();
    }
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();
      const rows=[...list.querySelectorAll('.asset-list-row')]
        .filter(el=>getComputedStyle(el).display!=='none');
      const index=rows.indexOf(row),delta=event.key==='ArrowDown'?1:-1;
      rows[Math.max(0,Math.min(rows.length-1,index+delta))]?.focus();
    }
  });

  function translate(){
    const label=byId('audioWorkspaceHeading');
    if(label)label.textContent=t('Sonido','Sound');
    toggle.textContent=t('Más opciones ▾','More options ▾');
    importFiles.textContent=t('Importar audios','Import audio');
    importArchive.textContent=t('ZIP / RAR / 7z','ZIP / RAR / 7z');
    importFiles.title=t('Importar varios WAV, MP3 y otros formatos',
      'Import WAV, MP3 and other sound formats in a batch');
    importArchive.title=t('Importar biblioteca desde un archivo comprimido',
      'Import library from an archive');
    byId('rq10LibrarySearch')?.setAttribute('aria-label',t('Buscar archivo','Search file'));
    if(headingTitle)headingTitle.textContent=t('ARCHIVOS DE SONIDO','SOUND FILES');
    nameCol.textContent=t('NOMBRE / TAMAÑO / USOS','NAME / SIZE / USES');
    playCol.textContent=t('OÍR','PLAY');
    editCol.textContent=t('EDITAR','EDIT');
    refreshRows();
  }
  byId('uiLocaleSelect')?.addEventListener('change',()=>queueMicrotask(translate));
  document.addEventListener('pointerdown',event=>{
    if(advanced.open&&!advanced.contains(event.target)&&
      !event.target.closest('#rq12LibraryToolbar'))advanced.open=false;
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&advanced.open){
      advanced.open=false;toggle.focus();
    }
  });
  importFiles.addEventListener('click',()=>{advanced.open=false;});
  importArchive.addEventListener('click',()=>{advanced.open=false;});
  // Do not auto-close the panel before the user sees import warnings.
  const transportStatus=byId('transportStatus');
  function transportLabel(){
    const active=transportStatus?.textContent??'';
    previewStatus.textContent=active;
    previewStatus.title=t('Estado del transporte principal','Main transport status');
  }
  if(transportStatus){
    new MutationObserver(transportLabel).observe(transportStatus,{childList:true,characterData:true,subtree:true});
    transportLabel();
  }
  translate();
}
if(document.readyState==='loading')
  document.addEventListener('DOMContentLoaded',mountSoundLibrary,{once:true});
else mountSoundLibrary();
