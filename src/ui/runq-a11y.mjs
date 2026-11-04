// Keyboard and screen-reader semantics for the workspace navigation (ARIA APG tabs pattern).
// Navigation only: it clicks the existing workspace buttons and never touches cues, transport or audio.
const nav = globalThis.document?.getElementById('workspaceNav');

export function syncWorkspaceTabs(nav) {
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-orientation', 'horizontal');
  for (const el of nav.children) {
    if (!el.matches('[data-workspace-nav]')) el.setAttribute('role', 'presentation');
  }
  const buttons=[...nav.querySelectorAll('[data-workspace-nav]')];
  const hasPressedState=buttons.some(button=>button.getAttribute('aria-pressed')!==null);
  const selectedButton=hasPressedState
    ? buttons.find(button=>button.getAttribute('aria-pressed')==='true') ?? null
    : buttons.find(button=>button.getAttribute('aria-selected')==='true') ?? buttons[0] ?? null;
  for (const button of buttons) {
    const selected = button===selectedButton;
    button.setAttribute('role', 'tab');
    button.removeAttribute('aria-pressed');
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
}

export function handleWorkspaceTabKey(nav,event,activeElement=globalThis.document?.activeElement){
  const list=[...nav.querySelectorAll('[data-workspace-nav]')].filter(button=>button.offsetParent!==null);
  const index=list.indexOf(activeElement);
  if(index<0)return;
  let next=null;
  if(event.key==='ArrowRight')next=list[(index+1)%list.length];
  else if(event.key==='ArrowLeft')next=list[(index-1+list.length)%list.length];
  else if(event.key==='Home')next=list[0];
  else if(event.key==='End')next=list[list.length-1];
  if(!next)return;
  event.preventDefault();next.focus();next.click();
}

if (nav) {
  syncWorkspaceTabs(nav);
  let busy = false;
  const observer = new MutationObserver(() => {
    if (busy) return;
    busy = true;
    queueMicrotask(() => { busy = false; observer.disconnect(); syncWorkspaceTabs(nav); watch(); });
  });
  const watch = () => observer.observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed'] });
  watch();

  nav.addEventListener('keydown',event=>handleWorkspaceTabKey(nav,event));
}
