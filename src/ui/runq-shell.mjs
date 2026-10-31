/*
 * RunQ shell integration.
 *
 * The existing application owns the DOM structure, workspace visibility and
 * navigation controls. This module adds presentation classes in place and
 * consumes explicit workspace-change events without observing DOM mutations.
 */
const shell = document.querySelector('.shell');

const WORKSPACES = new Set([
  'home', 'script', 'ai', 'cues', 'audio', 'soundlab', 'setup', 'rehearsal', 'operation',
]);

const CONTEXT_CLASSES = [
  'rq-ctx-studio',
  'rq-ctx-rehearsal',
  'rq-ctx-directo',
];

const WORKSPACE_CONTEXT = {
  home: 'rq-ctx-studio',
  script: 'rq-ctx-studio',
  ai: 'rq-ctx-studio',
  cues: 'rq-ctx-studio',
  audio: 'rq-ctx-studio',
  soundlab: 'rq-ctx-studio',
  setup: 'rq-ctx-studio',
  rehearsal: 'rq-ctx-rehearsal',
  operation: 'rq-ctx-directo',
};

const DENSITY_VALUES = ['compact', 'standard', 'comfortable'];
const DENSITY_CLASSES = DENSITY_VALUES.map(value => `density-${value}`);

function applyDensity(root, value) {
  if (!root?.classList || !DENSITY_VALUES.includes(value)) return false;
  root.classList.remove(...DENSITY_CLASSES);
  root.classList.add(`density-${value}`);
  return true;
}

function mountShellAreas() {
  if (!shell) return false;
  const topbar = shell.querySelector(':scope > .topbar');
  const nav = shell.querySelector(':scope > #workspaceNav');
  const main = shell.querySelector(':scope > main');
  if (!topbar || !nav || !main) return false;

  topbar.classList.add('rq-topbar');
  nav.classList.add('rq-nav');
  main.classList.add('rq-main');
  return true;
}

function setShellWorkspace(workspace) {
  if (!shell || !WORKSPACES.has(workspace)) return false;
  shell.classList.remove(...CONTEXT_CLASSES);
  shell.classList.add(WORKSPACE_CONTEXT[workspace]);
  return true;
}

function handleWorkspaceChanged(event) {
  setShellWorkspace(event.detail?.workspace);
}

function init() {
  mountShellAreas();
  document.addEventListener('runq:workspace-changed', handleWorkspaceChanged);
  setShellWorkspace(shell?.dataset.activeWorkspace || 'home');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

export { applyDensity, init, mountShellAreas, setShellWorkspace };
