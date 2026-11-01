const SHORTCUTS=Object.freeze({
  'KeyA':'cueAddBtn',
  'KeyI':'cueInsertBtn',
  'KeyD':'cueDuplicateBtn',
  'ArrowUp':'cueMoveUpBtn',
  'ArrowDown':'cueMoveDownBtn',
});

const isEditingTarget=target=>{
  if(!target||typeof target.closest!=='function')return true;
  return Boolean(target.closest(
    'input,textarea,select,button,a,summary,[contenteditable=""],[contenteditable="true"],[role="textbox"],[role="combobox"]',
  ));
};

/** Return an existing Studio edit button only for a safe, unhandled shortcut. */
export function resolveStudioEditShortcut(event,workspace){
  if(workspace!=='cues'||!event||event.defaultPrevented||event.repeat||
     event.isComposing||event.keyCode===229||!event.altKey||!event.shiftKey||
     event.ctrlKey||event.metaKey||isEditingTarget(event.target))return null;
  const control=SHORTCUTS[event.code];
  if(!control)return null;
  if(event.code==='ArrowUp'&&event.key!=='ArrowUp')return null;
  if(event.code==='ArrowDown'&&event.key!=='ArrowDown')return null;
  return control;
}
