/**
 * Workspace-scoped, operator-configurable keyboard dispatch.
 * Uses the EXISTING GO/STOP ALL buttons and their guarded click handlers.
 * Does not import the audio engine or introduce a second transport.
 */
import {
  DEFAULT_OPERATOR_KEYMAP, OPERATOR_KEY_CHOICES,
  normalizeOperatorKeymap, decideOperatorShortcut,
} from '../core/operatorKeymap.mjs';

const STORAGE_KEY='runq.operator.keymap.v1';
const get=id=>document.getElementById(id);
const labels={
  en:{
    title:'Keyboard mapping',scope:'Local device preference · not saved in show files',
    help:'GO triggers prepared NEXT, not the inspected cue. Space also works on a focused cue row; Enter selects the row. Typing, editor buttons, modifiers and held keys cannot trigger GO.',
    enabled:'Enable keyboard shortcuts',editor:'Active in Cue Editor',
    operation:'Active in Operation',go:'GO / Next cue',stop:'STOP ALL (emergency)',
    reset:'Restore defaults',saved:'Keyboard controls saved locally.',
    duplicate:'GO and STOP ALL must use different keys.',restored:'Default keys restored.',
    none:'Unassigned',space:'Space bar',g:'G',enter:'Enter',esc:'Escape',
    f:'F',hint:'Keyboard GO:',
    quickGo:'V7 safety: double-click cannot fire GO',
    quickHelp:'Deprecated quick-GO setting is locked off. Select/inspect, Prepare NEXT and GO are always separate actions.',
  },
  es:{
    title:'Asignación de teclas',scope:'Preferencia de este equipo · no se guarda en el show',
    help:'GO dispara el cue preparado como NEXT, no necesariamente el seleccionado. Espacio también funciona con una fila enfocada; Intro selecciona la fila. Escribir, editar, usar botones o mantener teclas no dispara GO.',
    enabled:'Activar atajos de teclado',editor:'Activos en el editor de cues',
    operation:'Activos en directo',go:'GO / Siguiente cue',
    stop:'STOP ALL (emergencia)',reset:'Restablecer valores',
    saved:'Asignación guardada en este navegador.',
    duplicate:'GO y STOP ALL deben usar teclas diferentes.',
    restored:'Teclas predeterminadas restauradas.',none:'Sin asignar',
    space:'Barra espaciadora',g:'G',enter:'Intro',esc:'Escape',
    f:'F',hint:'GO por teclado:',
    quickGo:'Seguridad V7: el doble clic nunca dispara GO',
    quickHelp:'Función anterior desactivada. Consultar, preparar NEXT y ejecutar GO son siempre acciones distintas.',
  },
};
function locale(){return get('uiLocaleSelect')?.value==='es'?'es':'en';}
function t(key){return labels[locale()][key]??key;}
const displayKey=key=>{
  if(key==='None')return t('none');
  if(key==='Space')return t('space');
  if(key==='KeyG')return t('g');
  if(key==='Enter')return t('enter');
  if(key==='Escape')return t('esc');
  return key;
};
function load(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    return normalizeOperatorKeymap(raw?JSON.parse(raw):null);
  }catch{return {...DEFAULT_OPERATOR_KEYMAP};}
}
let settings=load();
const held=new Set();
function updateHint(){
  const button=get('operatorGoBtn');
  if(!button)return;
  const scope=document.querySelector('.shell')?.dataset.activeWorkspace;
  const active=settings.enabled && settings.go!=='None' &&
    ((scope==='cues'&&settings.inEditor) || (scope==='operation'&&settings.inOperation));
  const phrase=active?t('hint')+' '+displayKey(settings.go):'';
  button.title=phrase;
  if(active){
    button.setAttribute('aria-keyshortcuts',settings.go==='Space'?'Space':
      settings.go==='KeyG'?'G':settings.go);
  }else button.removeAttribute('aria-keyshortcuts');
}
function refresh(){
  const mappings=[['runqGoKey','go'],['runqStopKey','stopAll']];
  for(const [id,key] of mappings){
    const control=get(id);
    if(!control)return;
    control.replaceChildren();
    for(const value of OPERATOR_KEY_CHOICES){
      const option=document.createElement('option');
      option.value=value;option.textContent=displayKey(value);
      control.append(option);
    }
    control.value=settings[key];
  }
  get('runqKeyboardEnabled').checked=settings.enabled;
  get('runqKeyboardInEditor').checked=settings.inEditor;
  get('runqKeyboardInOperation').checked=settings.inOperation;
  get('runqDoubleClickGo').checked=false;
  get('runqDoubleClickGo').disabled=true;
  for(const [id,key] of [
    ['runqKeymapTitle','title'],['runqKeymapScope','scope'],['runqKeymapHelp','help'],
    ['runqKeyboardEnabledLabel','enabled'],['runqKeyboardInEditorLabel','editor'],
    ['runqKeyboardInOperationLabel','operation'],
    ['runqDoubleClickGoLabel','quickGo'],['runqDoubleClickGoHelp','quickHelp'],
    ['runqGoKeyLabel','go'],
    ['runqStopKeyLabel','stop'],['runqKeyboardReset','reset'],
  ])get(id).textContent=t(key);
  updateHint();
}
function persist(next,feedback='saved'){
  if(next.go!=='None' && next.go===next.stopAll){
    get('runqKeyboardFeedback').textContent=t('duplicate');
    refresh();return false;
  }
  settings=normalizeOperatorKeymap({...next,version:1});
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(settings));}catch{
    // Still usable for this tab if storage is unavailable/private.
  }
  held.clear();
  refresh();
  get('runqKeyboardFeedback').textContent=t(feedback);
  return true;
}
for(const [id,key] of [
  ['runqKeyboardEnabled','enabled'],
  ['runqKeyboardInEditor','inEditor'],
  ['runqKeyboardInOperation','inOperation'],
]){
  get(id).addEventListener('change',event=>
    persist({...settings,[key]:event.target.checked}));
}
for(const [id,key] of [['runqGoKey','go'],['runqStopKey','stopAll']]){
  get(id).addEventListener('change',event=>
    persist({...settings,[key]:event.target.value}));
}
get('runqKeyboardReset').addEventListener('click',()=>
  persist({...DEFAULT_OPERATOR_KEYMAP},'restored'));
get('uiLocaleSelect')?.addEventListener('change',()=>{
  refresh();get('runqKeyboardFeedback').textContent='';
});
function hasOpenModal(){
  return Boolean(document.querySelector(
    'dialog[open], [role="dialog"][aria-modal="true"]:not([hidden]), [role="alertdialog"]:not([hidden])',
  ));
}
document.addEventListener('keydown',event=>{
  const workspace=document.querySelector('.shell')?.dataset.activeWorkspace;
  const action=decideOperatorShortcut(
    {...{
      code:event.code,key:event.key,keyCode:event.keyCode,
      repeat:event.repeat,isComposing:event.isComposing,
      defaultPrevented:event.defaultPrevented,altKey:event.altKey,
      ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey,
      target:event.target,
    },inModal:hasOpenModal()},
    settings,workspace,
  );
  if(!action)return;
  // Only once per physical key-down, even if repeat is misreported.
  const key=event.code||event.key;
  if(held.has(key))return;
  const button=get(action==='GO'?'operatorGoBtn':'operatorPanicBtn');
  // Native disabled state is the single source of GO readiness truth.
  if(!button || button.disabled || !button.isConnected)return;
  held.add(key);
  event.preventDefault();
  button.click(); // The ONE existing click handler; no duplicate audio path.
});
document.addEventListener('keyup',event=>held.delete(event.code||event.key));
// Deliberate stage-manager quick action. Keep cue editor double-click for edits;
// no single-click, keyboard typing, toolbar or cue-inspector triggers.
// V7 safety: double-click is only browsing/inspection, never Prepare + GO.
// The old optional quick-GO listener is deliberately removed.
window.addEventListener('blur',()=>held.clear());
document.addEventListener('visibilitychange',()=>{if(document.hidden)held.clear();});
const shell=document.querySelector('.shell');
if(shell)new MutationObserver(updateHint).observe(shell,{
  attributes:true,attributeFilter:['data-active-workspace'],
});
refresh();
