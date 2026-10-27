/**
 * RunQ workspace presentation v2.
 *
 * Progressive enhancement only. The show model, audio backend and transport
 * are owned by app.mjs; this module does not inspect or mutate their state.
 * All commands forward through existing user-interface controls.
 */
const copy = {
  en: {
    sequence:"SHOW SEQUENCE", cue:"CUE", detail:"NAME / SOURCE", state:"STATUS",
    density:"Density", compact:"Compact", standard:"Comfort",
    audio:"Audio library", script:"Script", ready:"Media ready",
    assets:"Assets", output:"Output", shared:"System output",
    libraryTitle:"Media workspace", libraryNote:"Original media remains local. Audition uses the same system output as GO; it is not a private monitor bus.",
    editCue:"Edit cue properties", scriptTitle:"Source script",
    scriptNote:"Imported text is preserved. Selecting lines and following references never executes a cue.",
    scriptHelp:"Use the cue references in the Editor to jump directly to the original line.",
    activeState:"Cue selection changes the inspector, not NEXT GO.",
    cuePane:"SEQUENCE", detailsPane:"CUE INSPECTOR",
    viewAudio:"Audio library", viewScript:"Open script"
  },
  es: {
    sequence:"SECUENCIA DEL SHOW",cue:"CUE",detail:"NOMBRE / ORIGEN",state:"ESTADO",
    density:"Densidad",compact:"Compacto",standard:"Cómodo",
    audio:"Biblioteca de audio",script:"Guion",ready:"Medios disponibles",
    assets:"Recursos",output:"Salida",shared:"Salida del sistema",
    libraryTitle:"Espacio de recursos",libraryNote:"Los archivos originales permanecen en el equipo. La escucha usa la misma salida que GO; no es un bus privado de monitores.",
    editCue:"Editar propiedades del cue",scriptTitle:"Guion original",
    scriptNote:"Se conserva el texto importado. Seleccionar líneas o consultar referencias nunca ejecuta un cue.",
    scriptHelp:"Usa las referencias de los cues en el Editor para ir a la línea original.",
    activeState:"Seleccionar cambia el inspector, no el próximo GO.",
    cuePane:"SECUENCIA",detailsPane:"INSPECTOR DEL CUE",
    viewAudio:"Biblioteca de audio",viewScript:"Abrir guion"
  }
};
const $ = id => document.getElementById(id);
const locale = () => $('uiLocaleSelect')?.value === 'es' ? 'es' : 'en';
const t = key => copy[locale()][key] ?? key;
const elt = (tag, cls, text) => {
  const e=document.createElement(tag);
  if(cls)e.className=cls;
  if(text !== undefined)e.textContent=text;
  return e;
};
const goto = name => document.querySelector('[data-workspace-nav="'+name+'"]')?.click();
let density='compact';
try { density=localStorage.getItem('runq.ui.cueDensity.v1')==='standard'?'standard':'compact'; }
catch {}
function routeButton(label,workspace){
  const button=elt('button','btn subtle small runq-inline-navigation',label);
  button.type='button';
  button.addEventListener('click',()=>goto(workspace));
  return button;
}
function createEditorEnhancements(){
  const panel=document.querySelector('[data-workspaces="cues operation"]');
  const filter=panel?.querySelector('.cue-filter-bar');
  const list=$('cueList');
  if(!panel||!filter||!list||$('runqEditorToolbar'))return;

  const tools=elt('div','runq-editor-toolbar');
  tools.id='runqEditorToolbar';
  const info=elt('div','runq-editor-context');
  const heading=elt('strong','',t('sequence'));heading.dataset.rqText='sequence';
  const desc=elt('span','',t('activeState'));desc.dataset.rqText='activeState';
  info.append(heading,desc);
  const actions=elt('div','runq-editor-shortcuts');
  const densityLabel=elt('label','runq-density-label',t('density'));densityLabel.dataset.rqText='density';
  const select=elt('select','runq-density-select');
  select.id='runqCueDensity';select.setAttribute('aria-label',t('density'));
  for(const value of ['compact','standard']){
    const option=elt('option','',t(value));option.value=value;option.dataset.rqText=value;
    select.append(option);
  }
  select.value=density;
  document.querySelector('.shell')?.setAttribute('data-cue-density',density);
  select.addEventListener('change',()=>{
    density=select.value==='standard'?'standard':'compact';
    document.querySelector('.shell')?.setAttribute('data-cue-density',density);
    try {localStorage.setItem('runq.ui.cueDensity.v1',density);}catch{}
  });
  densityLabel.append(select);
  actions.append(densityLabel,routeButton(t('viewScript'),'script'),routeButton(t('viewAudio'),'audio'));
  actions.querySelectorAll('.runq-inline-navigation').forEach((button,i)=>button.dataset.rqText=i?'viewAudio':'viewScript');
  tools.append(info,actions);
  filter.before(tools);
  const header=elt('div','runq-cue-columns');
  for(const key of ['cue','detail','state']){
    const span=elt('span','',t(key));span.dataset.rqText=key;header.append(span);
  }
  list.before(header);
}
function createAudioEnhancements(){
  const panel=document.querySelector('[data-workspaces="audio"]');
  const assetList=$('assetList');
  if(!panel||!assetList||$('runqAudioOverview'))return;
  const overview=elt('div','runq-audio-overview');
  overview.id='runqAudioOverview';
  const introduction=elt('div','runq-audio-introduction');
  introduction.append(elt('strong','',t('libraryTitle')),elt('p','',t('libraryNote')));
  introduction.querySelector('strong').dataset.rqText='libraryTitle';
  introduction.querySelector('p').dataset.rqText='libraryNote';
  const metrics=elt('div','runq-audio-metrics');
  const assetMetric=elt('div','runq-audio-metric');
  const assetCount=elt('strong','', '0');assetCount.id='runqAssetCount';
  const assetsTitle=elt('span','',t('assets'));assetsTitle.dataset.rqText='assets';
  assetMetric.append(assetCount,assetsTitle);
  const readyMetric=elt('div','runq-audio-metric');
  const readyCount=elt('strong','','0');readyCount.id='runqReadyCount';
  const readyTitle=elt('span','',t('ready'));readyTitle.dataset.rqText='ready';
  readyMetric.append(readyCount,readyTitle);
  const outputMetric=elt('div','runq-audio-metric output');
  const output=elt('strong','',t('shared'));output.dataset.rqText='shared';
  const outputTitle=elt('span','',t('output'));outputTitle.dataset.rqText='output';
  outputMetric.append(output,outputTitle);
  metrics.append(assetMetric,readyMetric,outputMetric);
  overview.append(introduction,metrics);
  const panelHead=panel.querySelector('.panel-head');
  panelHead?.after(overview);
  const actionBar=elt('div','runq-audio-actionbar');
  actionBar.append(routeButton(t('editCue'),'cues'));
  actionBar.querySelector('button').dataset.rqText='editCue';
  assetList.before(actionBar);
  const updateCounts=()=>{
    const rows=assetList.querySelectorAll('.asset-list-row');
    assetCount.textContent=String(rows.length);
    readyCount.textContent=String([...rows].filter(row=>!row.querySelector('[data-asset-audition]')?.disabled).length);
  };
  new MutationObserver(updateCounts).observe(assetList,{childList:true});
  updateCounts();
}
function createScriptContext(){
  const panel=document.querySelector('[data-workspaces="script"]');
  if(!panel||$('runqScriptContext'))return;
  const ctx=elt('aside','runq-script-context');
  ctx.id='runqScriptContext';
  const strong=elt('strong','',t('scriptTitle'));strong.dataset.rqText='scriptTitle';
  const text=elt('p','',t('scriptNote'));text.dataset.rqText='scriptNote';
  const help=elt('p','runq-script-tip',t('scriptHelp'));help.dataset.rqText='scriptHelp';
  ctx.append(strong,text,help,routeButton(t('editCue'),'cues'));
  ctx.querySelector('button').dataset.rqText='editCue';
  panel.append(ctx);
}
function translateEnhancements(){
  document.querySelectorAll('[data-rq-text]').forEach(e=>{const key=e.dataset.rqText;if(copy[locale()][key])e.textContent=t(key);});
  const densitySelect=$('runqCueDensity');
  if(densitySelect)densitySelect.setAttribute('aria-label',t('density'));
}
function init(){
  createEditorEnhancements();
  createAudioEnhancements();
  createScriptContext();
  $('uiLocaleSelect')?.addEventListener('change',translateEnhancements);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
