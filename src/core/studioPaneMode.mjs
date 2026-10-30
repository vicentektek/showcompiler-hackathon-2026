/** Studio-only presentation preference: never dispatches transport or project changes. */
export const STUDIO_PANE_MODES = Object.freeze(['split', 'list', 'inspector']);

export function normalizeStudioPaneMode(candidate) {
  return STUDIO_PANE_MODES.includes(candidate) ? candidate : 'split';
}

export function toggleStudioPaneMode(current, target) {
  const mode = normalizeStudioPaneMode(current);
  if (target !== 'list' && target !== 'inspector') return mode;
  return mode === target ? 'split' : target;
}
