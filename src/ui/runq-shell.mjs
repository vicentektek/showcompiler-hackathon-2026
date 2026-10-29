/*
 * RunQ — Professional shell presentation module.
 *
 * Restructures the existing index.html DOM into the approved production shell
 * (topbar, navigation rail, main workspace, inspector, bottom editor) and
 * mounts the five workspace views inside it.
 *
 * Presentation only. All execution semantics (audio, cues, GO, STOP, Autopilot,
 * IA, scripting) remain owned by app.mjs. This module only moves existing
 * elements into the shell containers and toggles workspace visibility.
 */
const $ = (id) => document.getElementById(id);
const shell = document.querySelector('.shell');

const VIEW_ORDER = [
  'home', 'script', 'ai', 'cues', 'audio', 'soundlab', 'setup', 'rehearsal', 'operation'
];

const VIEW_LABELS = {
  en: {
    home: 'Home', script: 'Script', ai: 'AI & Review', cues: 'Cue Editor',
    audio: 'Audio library', soundlab: 'Sound Lab', setup: 'Setup',
    rehearsal: 'Rehearsal', operation: 'Direct / Operation',
  },
  es: {
    home: 'Inicio', script: 'Guion', ai: 'IA y revisión', cues: 'Editor de cues',
    audio: 'Biblioteca de audio', soundlab: 'Laboratorio de sonido', setup: 'Configuración',
    rehearsal: 'Ensaio', operation: 'Directo / Operación',
  },
};

let mounted = false;

/* ── Build shell wrappers if they do not exist ── */
function ensureShellStructure() {
  if (mounted) return;
  mounted = true;

  const topbar = $('topbar');
  const nav = $('workspaceNav');
  const main = $('main');

  if (!shell || !topbar || !nav || !main) return;

  // Wrap topbar contents in shell classes.
  topbar.classList.add('rq-topbar');

  // Give the brand a structured sub-layout.
  const brand = topbar.querySelector('.brand');
  if (brand) {
    brand.classList.add('rq-brand');
    const icon = brand.querySelector('.brand-icon');
    const text = brand.querySelector('div');
    if (icon) icon.classList.add('rq-brand-icon');
    if (text) {
      text.classList.add('rq-brand-text');
      const strong = text.querySelector('strong');
      const span = text.querySelector('span');
      if (strong) strong.classList.add('rq-brand-name');
      if (span) span.classList.add('rq-brand-sub');
    }
  }

  // Project identity block.
  const proj = topbar.querySelector('.project-identity');
  if (proj) proj.classList.add('rq-project');

  // Spacer + actions.
  const actions = topbar.querySelector('.top-actions');
  if (actions) {
    actions.classList.add('rq-topbar-actions');
    const spacer = document.createElement('div');
    spacer.className = 'rq-topbar-spacer';
    actions.before(spacer);
  }

  // Navigation rail.
  nav.classList.add('rq-nav');
  const navHead = document.createElement('div');
  navHead.className = 'rq-nav-head';
  const navTitle = document.createElement('div');
  navTitle.className = 'rq-nav-title';
  navTitle.textContent = 'WORKSPACE';
  navHead.append(navTitle);
  nav.prepend(navHead);

  const navList = document.createElement('div');
  navList.className = 'rq-nav-list';
  const navFoot = document.createElement('div');
  navFoot.className = 'rq-nav-foot';

  // Rebuild nav items as shell items.
  const items = Array.from(nav.querySelectorAll('.workspace-tab'));
  items.forEach((btn) => {
    const ws = btn.dataset.workspaceNav;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'rq-nav-item';
    item.dataset.workspaceNav = ws;
    item.setAttribute('aria-pressed', btn.getAttribute('aria-pressed') === 'true' ? 'true' : 'false');
    const icon = document.createElement('span');
    icon.className = 'rq-nav-icon';
    icon.textContent = VIEW_ICONS[ws] || '';
    const label = document.createElement('span');
    label.textContent = (VIEW_LABELS.es[ws] || btn.textContent);
    item.append(icon, label);
    // Copy i18n attributes so translateDocument still works.
    if (btn.dataset.i18n) item.dataset.i18n = btn.dataset.i18n;
    navList.append(item);
    btn.hidden = true;
  });

  // Density selector.
  const density = document.createElement('select');
  density.className = 'rq-density-select';
  ['compact', 'standard', 'comfortable'].forEach((key) => {
    const opt = document.createElement('option');
    opt.value = key;
/* ── Mount views into shell grid areas ── */
function mountShellAreas() {
  if (!shell) return;

  // Reuse the existing cue inspector (#cueInspector) as the shell inspector.
  const existingInspector = $('cueInspector');
  if (existingInspector && !existingInspector.classList.contains('rq-inspector')) {
    existingInspector.classList.add('rq-inspector');
    // Wrap body/foot if not present.
    if (!existingInspector.querySelector('.rq-inspector-body')) {
      const body = document.createElement('div');
      body.className = 'rq-inspector-body';
      while (existingInspector.firstChild) body.append(existingInspector.firstChild);
      existingInspector.append(body);
    }
    const foot = document.createElement('div');
    foot.className = 'rq-inspector-foot';
    existingInspector.append(foot);
  }

  // Create bottom editor if missing.
  if (!$('rqBottom')) {
    const bottom = document.createElement('div');
    bottom.id = 'rqBottom';
    bottom.className = 'rq-bottom';
    bottom.innerHTML = '<div class="rq-bottom-head"><div class="rq-bottom-title">Editor</div></div><div class="rq-bottom-body"></div>';
    shell.append(bottom);
  }

  // Assign grid-area classes so CSS places them.
  const topbar = $('topbar');
  const nav = $('workspaceNav');
  const main = $('main');
  const inspector = $('rqInspector') || $('cueInspector');
  const bottom = $('rqBottom');

  if (topbar) topbar.classList.add('rq-topbar-area');
  if (nav) nav.classList.add('rq-nav-area');
  if (main) main.classList.add('rq-main-area');
  if (inspector) inspector.classList.add('rq-inspector-area');
  if (bottom) bottom.classList.add('rq-bottom-area');
}

/* ── Observe workspace changes and sync shell context classes ── */
function observeWorkspace() {
  if (!shell) return;
  const observer = new MutationObserver(() => {
    const ws = shell.dataset.activeWorkspace || 'home';
    setShellWorkspace(ws);
  });
  observer.observe(shell, { attributes: true, attributeFilter: ['data-active-workspace'] });
}

/* ── Workspace switching ── */
function setShellWorkspace(workspace) {
  if (!shell) return;
  shell.dataset.activeWorkspace = workspace;
  shell.className = shell.className.replace(/rq-ctx-\S+/g, '') + ' ' + (CTX_CLASS[workspace] || '');

  const views = document.querySelectorAll('[data-rq-view]');
  views.forEach((v) => {
    v.classList.toggle('rq-view-active', v.dataset.rqView === workspace);
  });

  // Update nav pressed states.
  document.querySelectorAll('.rq-nav-item').forEach((item) => {
    const pressed = item.dataset.workspaceNav === workspace;
    item.setAttribute('aria-pressed', String(pressed));
  });

  // Update main title/subtitle.
  const mainTitle = document.querySelector('.rq-main-title');
  const mainSub = document.querySelector('.rq-main-sub');
  if (mainTitle) mainTitle.textContent = (VIEW_LABELS.es[workspace] || workspace);
  if (mainSub) mainSub.textContent = '';
}

/* ── Nav click wiring ── */
function wireNav() {
  document.querySelectorAll('.rq-nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      const ws = item.dataset.workspaceNav;
      // Forward to existing app.mjs setWorkspace by clicking the hidden original button.
      const original = document.querySelector('.workspace-tab[data-workspace-nav="' + ws + '"]');
      if (original) original.click();
      else if (typeof window.setWorkspace === 'function') window.setWorkspace(ws);
    });
  });
}

/* ── Init ── */
function init() {
  ensureShellStructure();
  mountShellAreas();
  observeWorkspace();
  wireNav();
  // Apply stored density.
  const stored = localStorage.getItem('runq.ui.cueDensity.v1');
  if (['compact', 'standard', 'comfortable'].includes(stored)) {
    document.documentElement.classList.add('density-' + stored);
  }
  // Set initial workspace from app.
  const current = shell ? shell.dataset.activeWorkspace : 'home';
  setShellWorkspace(current);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

export { setShellWorkspace, mountShellAreas, observeWorkspace };
    opt.textContent = key === 'compact' ? 'Compacto' : key === 'standard' ? 'Normal' : 'Cómodo';
    density.append(opt);
  });
  const stored = localStorage.getItem('runq.ui.cueDensity.v1');
  if (['compact', 'standard', 'comfortable'].includes(stored)) density.value = stored;
  density.addEventListener('change', () => {
    document.documentElement.className = '';
    document.documentElement.classList.add('density-' + density.value);
    localStorage.setItem('runq.ui.cueDensity.v1', density.value);
  });
  navFoot.append(density);

  nav.append(navList, navFoot);

  // Main area: add head wrapper around existing title/subtitle if present.
  const mainHead = document.createElement('div');
  mainHead.className = 'rq-main-head';
  const mainTitle = document.createElement('div');
  mainTitle.className = 'rq-main-title';
  const mainSub = document.createElement('div');
  mainSub.className = 'rq-main-sub';
  mainHead.append(mainTitle, mainSub);
  const mainToolbar = document.createElement('div');
  mainToolbar.className = 'rq-main-toolbar';
  mainHead.append(mainToolbar);
  main.prepend(mainHead);

  // Wrap existing workspace panels into per-view containers without removing them.
  const panels = Array.from(main.querySelectorAll('[data-workspaces]'));
  panels.forEach((panel) => {
    const wsList = panel.dataset.workspaces.split(' ');
    wsList.forEach((ws) => {
      const view = document.createElement('div');
      view.className = 'rq-view';
      view.dataset.rqView = ws;
      panel.before(view);
      view.append(panel);
    });
  });
}
};

const VIEW_ICONS = {
  home: '⌂', script: '≡', ai: '✦', cues: '▤', audio: '◉', soundlab: '≈',
  setup: '⚙', rehearsal: '◎', operation: '▶',
};

const CTX_CLASS = {
  home: 'rq-ctx-studio', script: 'rq-ctx-studio', ai: 'rq-ctx-studio',
  cues: 'rq-ctx-studio', audio: 'rq-ctx-studio', soundlab: 'rq-ctx-studio',
  setup: 'rq-ctx-studio',
  rehearsal: 'rq-ctx-rehearsal',
  operation: 'rq-ctx-directo',
};

let mounted = false;
