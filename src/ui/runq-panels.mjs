// Drag-to-resize panels (desktop-software behaviour). Layout only: never touches cues, transport or audio.
const STORE_KEY = 'runq.panels.v1';
const GRIP = 8;

// grid: handle sits between track `at` and `at+1`; `fixed` says which side keeps the dragged pixel size.
// size: handle sits on the top edge of `sel`; dragging up makes it taller.
const PANELS = [
  { id: 'live-cues', ws: 'operation', sel: '.cue-workspace-body', mode: 'grid', axis: 'col', at: 0, fixed: 'before', min: 320, minOther: 360 },
  { id: 'live-events', ws: 'operation', sel: '#rq14Events', mode: 'size', min: 60, max: 420 },
  { id: 'live-active', ws: 'operation', sel: '#runqActiveCues', mode: 'size', min: 70, max: 700 },
  { id: 'live-script', ws: 'operation', sel: '.layout > .panel[data-workspaces~="script"]', mode: 'width', min: 220, max: 720 },
  { id: 'rehearsal-script', ws: 'rehearsal', sel: '.layout', mode: 'grid', axis: 'col', at: 0, fixed: 'before', min: 280, minOther: 420 },
  { id: 'rehearsal-stage', ws: 'rehearsal', sel: '.cue-workspace-body', mode: 'grid', axis: 'row', at: 0, fixed: 'after', min: 100, minOther: 140 },
  { id: 'rehearsal-voice', ws: 'rehearsal', sel: '#rqvfPanel', mode: 'size', min: 140, max: 640 },
  { id: 'sound-attributes', ws: 'audio', sel: '.rq5-audio-grid', mode: 'grid', axis: 'col', at: 0, fixed: 'after', min: 220, minOther: 420 },
  { id: 'sound-waveform', ws: 'audio', sel: '.rq5-audio-workspace', mode: 'grid', axis: 'row', at: 3, fixed: 'after', min: 100, minOther: 160 },
  { id: 'script-scenes', ws: 'script', sel: '.rq5-script-workspace', mode: 'grid', axis: 'col', at: 0, fixed: 'before', min: 140, minOther: 360 },
  { id: 'ai-inspector', ws: 'ai', sel: '.rq5-ai-grid', mode: 'grid', axis: 'col', at: 0, fixed: 'before', min: 320, minOther: 320 },
];

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function save(data) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const tracks = (el, axis) => getComputedStyle(el)[axis === 'col' ? 'gridTemplateColumns' : 'gridTemplateRows']
  .split(' ').map(parseFloat).filter(Number.isFinite);

function mount() {
  const shell = document.querySelector('.shell[data-active-workspace]');
  if (!shell || shell.dataset.rqPanels) return;
  shell.dataset.rqPanels = '1';
  const saved = load();
  const entries = [];

  for (const cfg of PANELS) {
    const el = shell.querySelector(cfg.sel);
    if (!el) continue;
    const handle = document.createElement('div');
    handle.className = 'rq-grip rq-grip-' + (cfg.mode === 'size' ? 'row' : cfg.mode === 'width' ? 'col' : cfg.axis);
    handle.dataset.rqPanel=cfg.id;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', (cfg.mode === 'size' || cfg.axis === 'row') ? 'horizontal' : 'vertical');
    handle.tabIndex = 0;
    handle.title = 'Arrastra para ajustar el tamaño · doble clic para restablecer / Drag to resize · double-click to reset';
    el.appendChild(handle);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    entries.push({ cfg, el, handle });
  }

  const active = (e) => shell.dataset.activeWorkspace === e.cfg.ws;
  const axisOf = (c) => (c.mode === 'size' ? 'row' : c.mode === 'width' ? 'col' : c.axis);

  function clear(e) {
    e.el.style.removeProperty('grid-template-columns');
    e.el.style.removeProperty('grid-template-rows');
    e.el.style.removeProperty('height');
    e.el.style.removeProperty('flex');
    e.el.style.removeProperty('max-height');
    e.el.style.removeProperty('--rq-script-w');
  }

  function apply(e, px) {
    const { cfg, el } = e;
    if(cfg.mode==='width'){
      el.style.setProperty('--rq-script-w',px+'px');
      return;
    }
    if (cfg.mode === 'size') {
      el.style.setProperty('height', px + 'px', 'important');
      el.style.setProperty('max-height', 'none', 'important');
      el.style.setProperty('flex', '0 0 auto', 'important');
      return;
    }
    const prop = cfg.axis === 'col' ? 'grid-template-columns' : 'grid-template-rows';
    const n = cfg.tracks ?? tracks(el, cfg.axis).length;
    const fixedIdx = cfg.fixed === 'before' ? cfg.at : cfg.at + 1;
    const flexIdx = cfg.fixed === 'before' ? cfg.at + 1 : cfg.at;
    const list = Array.from({ length: n }, (_, i) =>
      i === fixedIdx ? px + 'px' : i === flexIdx ? 'minmax(0,1fr)' : 'auto');
    el.style.setProperty(prop, list.join(' '), 'important');
  }

  function currentSize(e) {
    const { cfg, el } = e;
    if (cfg.mode === 'width') return el.getBoundingClientRect().width;
    if (cfg.mode === 'size') return el.getBoundingClientRect().height;
    const t = tracks(el, cfg.axis);
    return t[cfg.fixed === 'before' ? cfg.at : cfg.at + 1] ?? 0;
  }

  function limits(e) {
    const { cfg, el } = e;
    if(cfg.mode==='width'){
      const available=el.parentElement.getBoundingClientRect().width-360;
      return [cfg.min,Math.min(cfg.max,Math.max(cfg.min,available))];
    }
    if (cfg.mode === 'size') return [cfg.min, cfg.max];
    const r = el.getBoundingClientRect();
    const total = cfg.axis === 'col' ? r.width : r.height;
    return [cfg.min, Math.max(cfg.min, total - cfg.minOther)];
  }

  function place(e) {
    const { cfg, el, handle } = e;
    handle.hidden = !active(e);
    if (handle.hidden) return;
    if(cfg.mode==='width'){
      handle.hidden=!document.documentElement.classList.contains('rq-live-script');
      Object.assign(handle.style,{right:'0',left:'auto',top:'0',bottom:'0',width:GRIP+'px',height:'auto'});
      return;
    }
    if (cfg.mode === 'size') {
      Object.assign(handle.style, { left: '0', right: '0', top: '-4px', bottom: 'auto', width: 'auto', height: GRIP + 'px' });
      return;
    }
    if(cfg.id==='live-cues'&&getComputedStyle(el).display==='grid'&&Number.isFinite(saved[cfg.id])){
      const [lo,hi]=limits(e);
      apply(e,clamp(saved[cfg.id],lo,hi));
    }
    const t = tracks(el, cfg.axis);
    // Optional panels (e.g. the Live script) collapse the grid; no grip while only one track exists.
    if (t.length < 2) { handle.hidden = true; return; }
    const cs = getComputedStyle(el);
    const gap = parseFloat(cfg.axis === 'col' ? cs.columnGap : cs.rowGap) || 0;
    const pad = parseFloat(cfg.axis === 'col' ? cs.paddingLeft : cs.paddingTop) || 0;
    let edge = pad;
    for (let i = 0; i <= cfg.at; i++) edge += t[i] + (i < cfg.at ? gap : 0);
    edge += gap / 2;
    if (cfg.axis === 'col') {
      Object.assign(handle.style, { left: edge - GRIP / 2 + 'px', top: '0', bottom: '0', width: GRIP + 'px', height: 'auto', right: 'auto' });
    } else {
      Object.assign(handle.style, { top: edge - GRIP / 2 + 'px', left: '0', right: '0', height: GRIP + 'px', width: 'auto', bottom: 'auto' });
    }
  }

  function commit(e, px) {
    const [lo, hi] = limits(e);
    const v = Math.round(clamp(px, lo, hi));
    apply(e, v);
    saved[e.cfg.id] = v;
    save(saved);
    requestAnimationFrame(() => place(e));
  }

  for (const e of entries) {
    const dir = e.cfg.mode === 'size' ? -1 : e.cfg.mode === 'width' ? 1 : (e.cfg.fixed === 'before' ? 1 : -1);
    e.handle.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      e.handle.setPointerCapture(ev.pointerId);
      e.handle.classList.add('dragging');
      document.body.classList.add('rq-resizing-' + axisOf(e.cfg));
      const start = axisOf(e.cfg) === 'col' ? ev.clientX : ev.clientY;
      const base = currentSize(e);
      const move = (m) => commit(e, base + dir * ((axisOf(e.cfg) === 'col' ? m.clientX : m.clientY) - start));
      const end = () => {
        e.handle.classList.remove('dragging');
        document.body.classList.remove('rq-resizing-col', 'rq-resizing-row');
        e.handle.removeEventListener('pointermove', move);
        e.handle.removeEventListener('pointerup', end);
        e.handle.removeEventListener('pointercancel', end);
      };
      e.handle.addEventListener('pointermove', move);
      e.handle.addEventListener('pointerup', end);
      e.handle.addEventListener('pointercancel', end);
    });
    e.handle.addEventListener('dblclick', () => {
      clear(e);
      delete saved[e.cfg.id];
      save(saved);
      requestAnimationFrame(() => place(e));
    });
    e.handle.addEventListener('keydown', (ev) => {
      const horiz = axisOf(e.cfg) === 'col';
      const keys = horiz ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
      if (!keys.includes(ev.key)) return;
      ev.preventDefault();
      const step = (ev.shiftKey ? 80 : 20) * (ev.key === keys[1] ? 1 : -1);
      commit(e, currentSize(e) + dir * step);
    });
  }

  // Inline overrides must only apply while their workspace is visible: some containers are shared across workspaces.
  function sync() {
    for (const e of entries) clear(e);
    for (const e of entries) if (active(e) && saved[e.cfg.id] != null) apply(e, saved[e.cfg.id]);
    requestAnimationFrame(() => entries.forEach(place));
  }
  new MutationObserver(sync).observe(shell, { attributes: true, attributeFilter: ['data-active-workspace'] });
  const ro = new ResizeObserver(() => entries.forEach(place));
  entries.forEach((e) => ro.observe(e.el));
  window.addEventListener('resize', () => entries.forEach(place));
  sync();
  mountLiveScript(() => entries.forEach(place));
}

// Live: optional read-only script panel that follows the prepared cue's source line. Never prepares or fires cues.
const SCRIPT_KEY = 'runq.live.script.v1';
function mountLiveScript(relayout) {
  const bar = document.querySelector('.cue-filter-bar');
  const preview = document.getElementById('scriptPreview');
  const cueList = document.getElementById('cueList');
  if (!bar || !preview || document.querySelector('.rq-live-script-toggle')) return;
  const es = () => document.documentElement.lang === 'es' || /es/i.test(localStorage.getItem('runq.ui.locale') || '');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rq-live-script-toggle';
  btn.setAttribute('aria-controls', preview.id);
  const label = () => {
    btn.textContent = es() ? (on ? 'Ocultar guion' : 'Mostrar guion') : (on ? 'Hide script' : 'Show script');
    btn.title = btn.textContent;
  };
  let on = false;
  label();
  try { on = localStorage.getItem(SCRIPT_KEY) === '1'; } catch { /* storage unavailable */ }

  const follow = () => {
    if (!on) return;
    const next = document.querySelector('.cue-prepared');
    const ref = /L\d+(?=\s*·)/.exec(next?.textContent || '')?.[0];
    preview.querySelectorAll('.rq-live-next-line').forEach((n) => n.classList.remove('rq-live-next-line'));
    if (!ref) return;
    const line = [...preview.querySelectorAll('[data-script-line-id]')].find((n) =>
      n.dataset.scriptLineId === ref || n.querySelector('.line-id,.line-number')?.textContent.trim() === ref);
    if (!line) return;
    line.classList.add('rq-live-next-line');
    const box = preview.getBoundingClientRect();
    const r = line.getBoundingClientRect();
    if (r.top < box.top + 40 || r.bottom > box.bottom - 40) {
      preview.scrollTop += r.top - box.top - box.height / 3;
    }
  };
  const set = (v) => {
    on = v;
    label();
    btn.setAttribute('aria-pressed', String(on));
    document.documentElement.classList.toggle('rq-live-script', on);
    try { localStorage.setItem(SCRIPT_KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
    requestAnimationFrame(() => { relayout(); follow(); });
  };
  btn.addEventListener('click', () => set(!on));
  bar.appendChild(btn);
  set(on);
  const mo = new MutationObserver(() => requestAnimationFrame(follow));
  mo.observe(preview, { childList: true });
  if (cueList) mo.observe(cueList, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  document.getElementById('uiLocaleSelect')?.addEventListener('change', () => setTimeout(label, 50));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
// The shell may render after this module runs.
new MutationObserver((_, obs) => {
  if (document.querySelector('.shell[data-active-workspace]')) { mount(); obs.disconnect(); }
}).observe(document.documentElement, { childList: true, subtree: true });
