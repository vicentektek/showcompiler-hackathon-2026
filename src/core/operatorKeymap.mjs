/**
 * Deterministic operator shortcut policy, independent of show schema and transport.
 * All mappings are local device preferences. No shortcut performs audio itself.
 */
export const OPERATOR_KEY_CHOICES = Object.freeze([
  'None', 'Space', 'KeyG', 'Enter', 'F6', 'F7', 'F8', 'F9', 'F10', 'Escape',
]);
export const DEFAULT_OPERATOR_KEYMAP = Object.freeze({
  version: 1, enabled: true, inEditor: true, inOperation: true,
  go: 'Space', stopAll: 'None',
});
const KEYS = new Set(OPERATOR_KEY_CHOICES);
const EDITABLE = [
  'input','textarea','select','button','a','summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]','[role="combobox"]','[role="button"]',
  '[role="spinbutton"]','[role="slider"]','[role="menuitem"]',
  '[role="switch"]','[role="checkbox"]','[role="radio"]',
].join(',');

export function normalizeOperatorKeymap(value={}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_OPERATOR_KEYMAP };
  }
  const source = value.version === 1 ? value : {};
  const result={...DEFAULT_OPERATOR_KEYMAP};
  for (const key of ['enabled','inEditor','inOperation']) {
    if(typeof source[key] === 'boolean') result[key]=source[key];
  }
  for (const key of ['go','stopAll']) {
    if(KEYS.has(source[key])) result[key]=source[key];
  }
  // Prefer the primary GO key if corrupted storage contains a conflict.
  if (result.go !== 'None' && result.go === result.stopAll) result.stopAll='None';
  return result;
}

/** Pure routing decision. Never uses window, a server or player state. */
export function decideOperatorShortcut(event={}, settings={}, workspace='') {
  const map = normalizeOperatorKeymap(settings);
  if (!map.enabled || !(workspace==='cues'&&map.inEditor ||
      workspace==='operation'&&map.inOperation) ||
      event.defaultPrevented || event.repeat || event.isComposing ||
      event.keyCode===229 || event.altKey || event.ctrlKey ||
      event.metaKey || event.shiftKey) return null;
  // Keyboard Space already activates a focused native button; intercepting
  // there would cause double GO or steal the key from a form control.
  const target=event.target;
  // Cue sequence rows are focusable buttons. In the editor these rows are
  // dedicated keyboard command surfaces: Enter still selects the cue, while
  // mapped Space/GO fires the prepared NEXT (not the selected row).
  const cueRow=target?.closest?.('[data-cue-select]');
  if ((target?.closest?.(EDITABLE) && !cueRow) || target?.isContentEditable) return null;
  if (event.inModal===true) return null;
  const code=event.code || (event.key===' ' ? 'Space' :
    /^[a-z]$/i.test(event.key??'')?'Key'+event.key.toUpperCase():event.key);
  if (map.go!=='None' && code===map.go) return 'GO';
  if (map.stopAll!=='None' && code===map.stopAll) return 'STOP_ALL';
  return null;
}
