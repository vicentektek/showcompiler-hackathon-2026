/**
 * RUNQ Studio pane focus: maximize the EXISTING cue list or inspector.
 * No duplicate cue list, cue state, audio engine, GO, AI, or project writes.
 */
import { normalizeStudioPaneMode, toggleStudioPaneMode } from '../core/studioPaneMode.mjs';

const STORAGE_KEY = 'runq.studio.paneFocus.v1';
function installStudioPaneFocus() {
  const shell = document.querySelector('.shell');
  const body = document.querySelector('.rq5-show-workspace .cue-workspace-body');
  const listHeader = document.querySelector('.rq5-show-workspace .rq5-pane-heading');
  const inspectorHeader = document.querySelector('.rq5-show-workspace .rq5-inspector-heading');
  if (!shell || !body || !listHeader || !inspectorHeader ||
      document.getElementById('rqStudioFocusList')) return;

  let mode = 'split';
  try { mode = normalizeStudioPaneMode(localStorage.getItem(STORAGE_KEY)); } catch {}
  const controls = [];
  function localized(en, es) {
    return document.getElementById('uiLocaleSelect')?.value === 'es' ? es : en;
  }
  function sync() {
    body.dataset.rqStudioPane = mode;
    for (const [button, target] of controls) {
      const active = target === mode;
      const label = active
        ? localized('Restore split view', 'Restaurar vista dividida')
        : target === 'list'
          ? localized('Expand cue list', 'Ampliar lista de cues')
          : localized('Expand inspector', 'Ampliar inspector');
      button.textContent = (active ? '↙ ' : '⤢ ') + label;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(active));
    }
  }
  function setMode(value) {
    mode = normalizeStudioPaneMode(value);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
    sync();
  }
  function makeControl(header, target) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = target === 'list' ? 'rqStudioFocusList' : 'rqStudioFocusInspector';
    button.className = 'rq-studio-pane-toggle';
    button.dataset.studioFocusTarget = target;
    button.addEventListener('click', () => {
      if (shell.dataset.activeWorkspace !== 'cues') return;
      setMode(toggleStudioPaneMode(mode, target));
    });
    button.addEventListener('keydown', event => {
      // Escape only while this button has focus, never in form inputs.
      if (event.key === 'Escape' && mode !== 'split') {
        event.preventDefault();
        setMode('split');
      }
    });
    header.append(button);
    controls.push([button, target]);
  }
  makeControl(listHeader, 'list');
  makeControl(inspectorHeader, 'inspector');
  document.getElementById('uiLocaleSelect')?.addEventListener('change', sync);
  sync();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installStudioPaneFocus, { once: true });
} else {
  installStudioPaneFocus();
}
