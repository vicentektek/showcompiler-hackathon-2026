// Keyboard and screen-reader semantics for the workspace navigation (ARIA APG tabs pattern).
// Navigation only: it clicks the existing workspace buttons and never touches cues, transport or audio.
const nav = document.getElementById('workspaceNav');

function tabs() {
  return [...nav.querySelectorAll('[data-workspace-nav]')].filter(b => b.offsetParent !== null);
}

function sync() {
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-orientation', 'horizontal');
  for (const el of nav.children) {
    if (!el.matches('[data-workspace-nav]')) el.setAttribute('role', 'presentation');
  }
  for (const button of nav.querySelectorAll('[data-workspace-nav]')) {
    const selected = button.getAttribute('aria-pressed') === 'true';
    button.setAttribute('role', 'tab');
    button.removeAttribute('aria-pressed');
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
}

if (nav) {
  sync();
  let busy = false;
  const observer = new MutationObserver(() => {
    if (busy) return;
    busy = true;
    queueMicrotask(() => { busy = false; observer.disconnect(); sync(); watch(); });
  });
  const watch = () => observer.observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed'] });
  watch();

  nav.addEventListener('keydown', event => {
    const list = tabs();
    const index = list.indexOf(document.activeElement);
    if (index < 0) return;
    let next = null;
    if (event.key === 'ArrowRight') next = list[(index + 1) % list.length];
    else if (event.key === 'ArrowLeft') next = list[(index - 1 + list.length) % list.length];
    else if (event.key === 'Home') next = list[0];
    else if (event.key === 'End') next = list[list.length - 1];
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.click();
  });
}
