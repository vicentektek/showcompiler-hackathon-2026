/**
 * RunQ Stagecraft — structural workspace rebuild (first executable slice).
 *
 * Rehomes existing DOM nodes, preserving their IDs, listeners and native forms.
 * Does not create a second cue engine, GO button or emergency stop handler.
 * Audio waveform reflects real locally decoded PCM; it is READ ONLY until the
 * region model has transport and persistence coverage.
 */
import { buildWaveformPeaks } from '../core/waveformPeaks.mjs';

const get = id => document.getElementById(id);
const el = (tag, className, label) => {
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(label!==undefined)node.textContent=label;
  return node;
};
const lang=()=>get('uiLocaleSelect')?.value==='es'?'es':'en';
const dictionary={
  en:{
    sequence:'SHOW SEQUENCE',controls:'CUE COMMANDS',properties:'PROPERTY INSPECTOR',
    editor:'Cue Editor',audio:'Audio',script:'Script',operation:'Operation',rehearsal:'Rehearsal',
    selected:'SELECTION / PROPERTIES',workspace:'DESIGN / SEQUENCE',
    working:'OPERATOR / MANUAL SHOW CONTROL',workHint:'Choose NEXT explicitly. Selecting a row cannot fire audio.',
    source:'SOURCE',signals:'LOCAL MEDIA',choose:'Choose a loaded asset',
    none:'No sound selected',fileMissing:'This asset is registered but not loaded. Import the original audio or a complete show ZIP.',
    audition:'Audition selected source',stopAudition:'Stop audition',
    readOnly:'SOURCE WAVEFORM · READ-ONLY',noWave:'Load an original local sound to see its real waveform here.',
    auditionWarning:'Audition and GO share the same system output. Not an independent monitoring bus.',
    zoom:'Zoom',channels:'CHANNELS',duration:'DURATION',real:'Decoded audio',
    keep:'The original file is not edited. IN/OUT graphical playback editing will be enabled after engine and ZIP validation.',
    intro:'Workspaces are linked. Selection never changes NEXT GO.',
    actual:'LIVE TRANSPORT STATUS',ready:'SOUND FILE LIBRARY',platform:'BROWSER AUDIO · LOCAL',
    quick:'QUICK ACCESS',go:'Open Operation',inspect:'Inspect cue',replay:'Transport is under operator control',
  },
  es:{
    sequence:'SECUENCIA DEL SHOW',controls:'ACCIONES DEL CUE',properties:'INSPECTOR DE PROPIEDADES',
    editor:'Editor de cues',audio:'Audio',script:'Guion',operation:'Operación',rehearsal:'Ensayo',
    selected:'SELECCIÓN / PROPIEDADES',workspace:'DISEÑO / SECUENCIA',
    working:'OPERADOR / CONTROL MANUAL',workHint:'Prepara NEXT expresamente. Seleccionar una fila no reproduce sonido.',
    source:'FUENTE',signals:'ARCHIVOS LOCALES',choose:'Elige un recurso cargado',
    none:'Ningún sonido seleccionado',fileMissing:'Este recurso está registrado, pero no cargado. Importa el audio original o el ZIP completo.',
    audition:'Preescuchar recurso',stopAudition:'Detener preescucha',
    readOnly:'FORMA DE ONDA REAL · SOLO LECTURA',noWave:'Carga un archivo de audio local para mostrar su forma de onda auténtica.',
    auditionWarning:'La preescucha y GO comparten salida de sistema. No hay un bus independiente de monitores.',
    zoom:'Zoom',channels:'CANALES',duration:'DURACIÓN',real:'Audio decodificado',
    keep:'No se modifica el original. IN/OUT gráfico se activará tras validar motor y guardado ZIP.',
    intro:'Las vistas están conectadas. Seleccionar no cambia NEXT GO.',
    actual:'ESTADO REAL DE TRANSPORTE',ready:'BIBLIOTECA DE SONIDOS',platform:'AUDIO WEB · LOCAL',
    quick:'ACCESO DIRECTO',go:'Ir a Operación',inspect:'Inspeccionar cue',replay:'El transporte depende del operador',
  }
};
const tr=key=>dictionary[lang()][key]??key;
const linkButton=(key,destination)=>{
  const button=el('button','rq5-route',tr(key));button.type='button';button.dataset.rq5Label=key;
  button.addEventListener('click',()=>document.querySelector('[data-workspace-nav="'+destination+'"]')?.click());
  return button;
};
function translate(){
  document.querySelectorAll('[data-rq5-label]').forEach(node=>{
    const value=tr(node.dataset.rq5Label);
    if(node instanceof HTMLInputElement && node.type==='button')node.value=value;
    else if(node instanceof HTMLOptionElement)node.textContent=value;
    else node.textContent=value;
  });
  if(waveformUi)updateWaveformStatus();
}
function label(key,className='rq5-eyebrow'){
  const node=el('span',className,tr(key));node.dataset.rq5Label=key;return node;
}
function createStage(){
  const panel=document.querySelector('[data-workspaces~="cues"]');
  if(!panel||panel.dataset.rq5Built)return;
  panel.dataset.rq5Built='true';
  panel.classList.add('rq5-show-workspace');
  const head=panel.querySelector('.panel-head');
  const editorTools=get('runqEditorToolbar');
  const filter=panel.querySelector('.cue-filter-bar');
  const columns=panel.querySelector('.runq-cue-columns');
  const cueBody=panel.querySelector('.cue-workspace-body');
  const queue=panel.querySelector('.operator-queue');
  const preflight=panel.querySelector('.preflight-toolbar');
  const report=get('preflightReport');
  const status=get('transportStatus');
  if(!head||!filter||!cueBody||!queue||!status)throw new Error('Required working cue editor controls are missing');

  const mast=el('div','rq5-stage-mast');
  const identity=el('div','rq5-stage-identity');
  identity.append(label('workspace'),el('h2','rq5-stage-name',tr('editor')));
  identity.querySelector('h2').dataset.rq5Label='editor';
  const tabs=el('div','rq5-stage-tabs');
  tabs.append(linkButton('editor','cues'),linkButton('script','script'),linkButton('audio','audio'),linkButton('rehearsal','rehearsal'),linkButton('operation','operation'));
  mast.append(identity,tabs);

  const actions=el('div','rq5-stage-actions');
  actions.append(label('controls'));
  actions.append(head);
  if(preflight)actions.append(preflight);
  if(report)actions.append(report);

  const sequence=el('section','rq5-sequence');
  const seqHeader=el('div','rq5-pane-heading');
  seqHeader.append(label('sequence'),linkButton('audio','audio'));
  const filterWrap=el('div','rq5-sequence-search');
  filterWrap.append(filter);
  if(editorTools)filterWrap.append(editorTools);
  sequence.append(filterWrap);
  const cueList=get('cueList');
  const inspector=get('cueInspector');
  if(!cueList||!inspector)throw new Error('Expected cue sequence and inspector are missing');
  const sequenceFrame=el('div','rq5-sequence-frame');
  sequenceFrame.append(seqHeader);
  if(columns)sequenceFrame.append(columns);
  sequenceFrame.append(cueList);
  const inspectorFrame=el('div','rq5-inspector-frame');
  const inspectorHeader=el('div','rq5-inspector-heading');
  inspectorHeader.append(label('properties'),linkButton('audio','audio'));
  inspectorFrame.append(inspectorHeader,inspector);
  cueBody.replaceChildren(sequenceFrame,inspectorFrame);
  const stageBody=el('div','rq5-stage-body');
  stageBody.append(cueBody);
  const footer=el('div','rq5-stage-bottom');
  footer.append(label('actual'),status);

  // Rehome every existing interactive control exactly once.
  const desk=el('div','rq5-desk');
  desk.append(mast,actions,sequence,stageBody);
  const dock=el('div','rq5-transport-dock');
  dock.append(queue,footer);
  panel.prepend(desk);
  panel.append(dock);
  const sourceHint=panel.querySelector('.cue-editor-hint');
  if(sourceHint)sourceHint.classList.add('rq5-accessibility-note');
  panel.querySelector('.info')?.classList.add('rq5-support-note');

  // The existing list and inspector retain their original CSS grid container.
  // Their data bindings and event listeners are not replaced.
}
let waveformUi=null;
let waveformRequest=0;
function requestAssetSource(assetId){
  let found=null;
  document.dispatchEvent(new CustomEvent('runq:request-audio-source',{
    detail:{assetId,respond:file=>{found=file;}}
  }));
  return found;
}
function createAudio(){
  const panel=document.querySelector('[data-workspaces="audio"]');
  const assetList=get('assetList');
  if(!panel||!assetList||panel.dataset.rq5Built)return;
  panel.dataset.rq5Built='true';panel.classList.add('rq5-audio-workspace');
  const panelHead=panel.querySelector('.panel-head');
  const library=el('div','rq5-audio-library');
  const labelHead=el('div','rq5-pane-heading');
  labelHead.append(label('ready'),linkButton('editor','cues'));
  library.append(labelHead);

  // Keep the actual forms, original file picker, audition and STOP controls.
  for(const selector of [
    '.subheading','#assetForm','.line-actions','[data-i18n="audio.auditionWarning"]',
    '#stopAuditionBtn','#runqAudioOverview','#runqAudioActionbar','#assetList'
  ]){
    const node=panel.querySelector(selector);
    if(node)library.append(node);
  }
  const editor=el('div','rq5-audio-editor');
  const header=el('div','rq5-pane-heading');
  header.append(label('readOnly'),linkButton('editor','cues'));
  const chooser=el('div','rq5-wave-controls');
  const inputLabel=el('label','rq5-audio-source-label');
  inputLabel.append(label('source'));
  const select=el('select','rq5-audio-source');
  select.id='rq5AudioSource';
  select.setAttribute('aria-label',tr('choose'));
  inputLabel.append(select);
  const zoomLabel=el('label','rq5-zoom-label');
  zoomLabel.append(label('zoom'));
  const zoom=el('input','rq5-wave-zoom');
  zoom.type='range';zoom.min='1';zoom.max='8';zoom.step='1';zoom.value='1';
  zoom.id='rq5WaveZoom';zoom.setAttribute('aria-label',tr('zoom'));
  zoomLabel.append(zoom);
  chooser.append(inputLabel,zoomLabel);
  const canvasWrap=el('div','rq5-wave-canvas');
  const canvas=el('canvas');
  canvas.id='rq5WaveCanvas';canvas.width=1280;canvas.height=340;
  canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label','PCM waveform of local selected file');
  canvasWrap.append(canvas);
  const status=el('p','rq5-wave-status',tr('noWave'));
  status.id='rq5WaveStatus';
  const data=el('div','rq5-wave-stats');
  const channels=el('span','',tr('channels'));channels.dataset.rq5Label='channels';
  const channelCount=el('strong','','—');channelCount.id='rq5WaveChannels';
  const duration=el('span','',tr('duration'));duration.dataset.rq5Label='duration';
  const durationValue=el('strong','','—');durationValue.id='rq5WaveDuration';
  data.append(channels,channelCount,duration,durationValue);
  const note=el('p','rq5-wave-note',tr('keep'));note.dataset.rq5Label='keep';
  editor.append(header,chooser,canvasWrap,status,data,note);
  const grid=el('div','rq5-audio-grid');
  grid.append(library,editor);
  if(panelHead)panelHead.after(grid);else panel.prepend(grid);
  waveformUi={canvas,select,zoom,status,channelCount,durationValue,peaks:null,assetId:null,sourceFile:null,error:null,sourceLabel:null};
  select.addEventListener('change',()=>void selectSource(select.value));
  zoom.addEventListener('input',drawWave);
  const observer=new MutationObserver(()=>queueMicrotask(refreshAssetPicker));
  observer.observe(assetList,{childList:true,subtree:true});
  refreshAssetPicker();
  drawWave();
}
let selecting=false;
function refreshAssetPicker(){
  if(!waveformUi||selecting)return;
  const {select}=waveformUi;
  const buttons=[...get('assetList').querySelectorAll('[data-asset-audition]')];
  const ids=[...new Set(buttons.map(button=>button.dataset.assetAudition).filter(Boolean))];
  const before=select.value;
  const current=ids.join('|');
  // The same asset ID can be reused by a different imported show or replaced
  // with a different File: never leave stale PCM from the previous source.
  if(select.dataset.assetIds===current &&
      requestAssetSource(select.value)===waveformUi.sourceFile)return;
  selecting=true;
  select.dataset.assetIds=current;
  select.replaceChildren();
  const placeholder=el('option','',tr('choose'));placeholder.value='';
  select.append(placeholder);
  for(const id of ids){
    const row=buttons.find(button=>button.dataset.assetAudition===id)?.closest('.asset-list-row');
    const option=el('option','',row?.querySelector('.tag')?.textContent?.trim()||id);
    option.value=id;select.append(option);
  }
  select.value=ids.includes(before)?before:(ids[0]??'');
  selecting=false;
  void selectSource(select.value);
}
function updateWaveformStatus(){
  if(!waveformUi)return;
  const {status,peaks,error}=waveformUi;
  if(error)status.textContent=error;
  else if(peaks)status.textContent=tr('real')+' · '+waveformUi.sourceLabel;
  else status.textContent=waveformUi.assetId?tr('fileMissing'):tr('noWave');
}
async function selectSource(assetId){
  if(!waveformUi)return;
  const token=++waveformRequest;
  waveformUi.peaks=null;
  waveformUi.assetId=assetId||null;
  waveformUi.error=null;
  waveformUi.sourceLabel='';
  waveformUi.channelCount.textContent='—';
  waveformUi.durationValue.textContent='—';
  drawWave();updateWaveformStatus();
  if(!assetId)return;
  const file=requestAssetSource(assetId);
  waveformUi.sourceFile=file;
  if(!file||typeof file.arrayBuffer!=='function')return;
  waveformUi.status.textContent='Decoding local PCM…';
  let context=null;
  try{
    const raw=await file.arrayBuffer();
    if(token!==waveformRequest)return;
    context=new (window.AudioContext||window.webkitAudioContext)();
    const audio=await context.decodeAudioData(raw);
    if(token!==waveformRequest)return;
    const peaks=buildWaveformPeaks(audio,{bucketCount:Math.min(2400,audio.length)});
    if(token!==waveformRequest)return;
    waveformUi.peaks=peaks;
    waveformUi.sourceLabel=file.name||assetId;
    waveformUi.channelCount.textContent=String(peaks.channels.length);
    waveformUi.durationValue.textContent=(peaks.durationMs/1000).toFixed(3)+' s';
    drawWave();updateWaveformStatus();
  }catch(error){
    if(token!==waveformRequest)return;
    waveformUi.error='Cannot decode this local source: '+String(error.message||error);
    updateWaveformStatus();drawWave();
  }finally{
    if(context)await context.close().catch(()=>{});
  }
}
function drawWave(){
  const state=waveformUi;if(!state)return;
  const {canvas,peaks}=state;
  const context=canvas.getContext('2d');if(!context)return;
  const w=canvas.width,h=canvas.height;
  context.fillStyle='#10161d';context.fillRect(0,0,w,h);
  context.strokeStyle='#283442';context.lineWidth=1;
  for(let i=0;i<=12;i++){
    const x=Math.round((w*i)/12)+.5;
    context.beginPath();context.moveTo(x,0);context.lineTo(x,h);context.stroke();
  }
  const channels=peaks?.channels.length??2;
  const bandH=h/channels;
  for(let c=0;c<channels;c++){
    const center=(c+.5)*bandH;
    context.strokeStyle='#3d505d';
    context.beginPath();context.moveTo(0,center+.5);context.lineTo(w,center+.5);context.stroke();
    if(!peaks)continue;
    const count=peaks.bucketCount;
    const zoom=Number(state.zoom.value)||1;
    const visible=Math.max(1,Math.ceil(count/zoom));
    const channel=peaks.channels[c];
    context.strokeStyle=c===0?'#65d7c9':'#ada1ff';
    context.lineWidth=1.5;
    context.beginPath();
    for(let x=0;x<w;x++){
      const index=Math.min(visible-1,Math.floor(x*visible/w));
      const amplitude=bandH*.43;
      const up=center-channel.max[index]*amplitude;
      const down=center-channel.min[index]*amplitude;
      context.moveTo(x+.5,up);context.lineTo(x+.5,down);
    }
    context.stroke();
  }
}
function mount(){
  if(document.documentElement.dataset.rq5Mounted)return;
  document.documentElement.dataset.rq5Mounted='true';
  createStage();createAudio();
  get('uiLocaleSelect')?.addEventListener('change',()=>{translate();refreshAssetPicker();});
  translate();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
