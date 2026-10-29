/**
 * Compact icon-only editor toolbar. Original buttons and event listeners are
 * untouched. Tooltips and accessible labels are localized from their original
 * visible text after each UI-language change.
 */
const ids=['cueAddBtn','cueInsertBtn','cueDuplicateBtn','cueMoveUpBtn','cueMoveDownBtn','cueDeleteBtn'];
function syncLabels(){
  for(const id of ids){
    const button=document.getElementById(id);
    if(!button)continue;
    const label=button.textContent.trim();
    if(!label)continue;
    button.title=label;
    button.setAttribute('aria-label',label);
  }
}
function mount(){
  document.documentElement.classList.add('rq9');
  syncLabels();
  document.getElementById('uiLocaleSelect')?.addEventListener('change',()=>queueMicrotask(syncLabels));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
