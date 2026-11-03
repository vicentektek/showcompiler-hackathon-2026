import {resolveStudioEditShortcut} from '../core/studioShortcuts.mjs';

const $=id=>document.getElementById(id);
const SHORTCUTS=[
  ['cueAddBtn','Alt+Shift+A'],
  ['cueInsertBtn','Alt+Shift+I'],
  ['cueDuplicateBtn','Alt+Shift+D'],
  ['cueMoveUpBtn','Alt+Shift+ArrowUp'],
  ['cueMoveDownBtn','Alt+Shift+ArrowDown'],
];

function syncLabels(){
  for(const [id,keys] of SHORTCUTS){
    const button=$(id);
    if(!button)continue;
    button.title=button.textContent.trim()+' · '+keys;
    button.setAttribute('aria-keyshortcuts',keys);
  }
  const hint=document.querySelector('.cue-editor-hint');
  if(!hint)return;
  let note=hint.querySelector('.rq16-studio-shortcut-help');
  if(!note){note=document.createElement('span');note.className='rq16-studio-shortcut-help';hint.append(note);}
  note.textContent=$('uiLocaleSelect')?.value==='es'
    ?'Atajos de Studio: Alt+Mayús+A añadir · I insertar · D duplicar · ↑/↓ mover.'
    :'Studio shortcuts: Alt+Shift+A add · I insert · D duplicate · ↑/↓ move.';
}

document.addEventListener('keydown',event=>{
  const workspace=document.querySelector('.shell')?.dataset.activeWorkspace;
  const id=resolveStudioEditShortcut(event,workspace);
  if(!id)return;
  const button=$(id);
  if(!button||button.disabled||!button.isConnected)return;
  event.preventDefault();
  button.click();
});
document.addEventListener('runq:show-state-changed',syncLabels);
$('uiLocaleSelect')?.addEventListener('change',()=>queueMicrotask(syncLabels));
syncLabels();
